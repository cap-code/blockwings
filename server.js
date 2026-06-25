// server.js — BlockWings multiplayer arena server.
//
//   npm install
//   npm start            # listens on ws://0.0.0.0:8081
//   PORT=9000 npm start  # custom port
//
// A thin relay + referee: clients stream their plane state and weapon events,
// the server rebroadcasts them, applies reported hits to the target's HP,
// declares kills, schedules respawns and keeps the scoreboard.
const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8081;
// Bind to 127.0.0.1 in production so only the local nginx reverse proxy can
// reach Node; leave it at 0.0.0.0 for local dev (HOST unset).
const HOST = process.env.HOST || '0.0.0.0';
const RESPAWN_MS = 4000;
const MAX_PLAYERS = 100;          // per room
const MAX_TEAM = 4;               // members per team
const MATCH_MS = 10 * 60 * 1000;  // 10-minute matches

// Static file server so a single port (and a single tunnel) serves both the
// game client and the WebSocket arena. Files are served from the project root.
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.map': 'application/json',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.txt': 'text/plain',
};

const httpServer = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  // resolve and confine to ROOT to prevent path traversal
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

// WebSocket lives on a dedicated /ws path so nginx can serve the static client
// itself and reverse-proxy only the game traffic. maxPayload caps frame size to
// reject oversized-message abuse (our largest message is well under 1 KB).
const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 16 * 1024 });

// Players are grouped into rooms keyed by a 4-digit code. Each room holds up to
// MAX_PLAYERS pilots; within a room they can band into teams (up to MAX_TEAM
// each) or fly solo. State and events are only ever relayed within a room.
// code -> { code, players: Map(ws -> player), nextId, hostId, state, endAt, timer }
//   state: 'lobby' (gathered, waiting for host) | 'playing' (10-minute match)
const rooms = new Map();

function makeRoomCode() {
  let code;
  do { code = String(1000 + Math.floor(Math.random() * 9000)); } while (rooms.has(code));
  return code;
}

function lobbyList(room) {
  return [...room.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, host: p.id === room.hostId }));
}

function startMatch(room) {
  room.state = 'playing';
  // fresh slate every round
  for (const p of room.players.values()) { p.kills = 0; p.deaths = 0; p.alive = true; p.hp = p.hpMax; }
  room.endAt = Date.now() + MATCH_MS;
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => endMatch(room), MATCH_MS);
  broadcast(room, { t: 'start', ms: MATCH_MS, scores: scoreList(room) });
  console.log(`▶ room ${room.code} match started (${room.players.size} pilots)`);
}

function endMatch(room) {
  if (room.timer) { clearTimeout(room.timer); room.timer = null; }
  room.state = 'lobby';
  broadcast(room, { t: 'over', scores: scoreList(room) });
  broadcast(room, { t: 'lobby', list: lobbyList(room), state: room.state, hostId: room.hostId });
  console.log(`⏱ room ${room.code} match over`);
}

function teamCount(room, team) {
  if (!team) return 0;
  let n = 0;
  for (const p of room.players.values()) if (p.team === team) n++;
  return n;
}

function broadcast(room, obj, except = null) {
  const s = JSON.stringify(obj);
  for (const [ws] of room.players) {
    if (ws !== except && ws.readyState === 1) ws.send(s);
  }
}

function scoreList(room) {
  return [...room.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, kills: p.kills, deaths: p.deaths }));
}

function publicInfo(p) {
  return { id: p.id, name: p.name, team: p.team, plane: p.plane, paint: p.paint, hp: p.hp, alive: p.alive };
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', data => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    const me = ws.player || null;
    const room = ws.room || null;

    if (m.t === 'join' && !me) {
      // Resolve the room: a 4-digit code joins an existing arena; a blank code
      // opens a fresh one and hands the pilot a new code to share.
      const reqCode = m.room ? String(m.room).replace(/\D/g, '').slice(0, 4) : '';
      let rm;
      if (reqCode) {
        rm = rooms.get(reqCode);
        if (!rm) { ws.send(JSON.stringify({ t: 'error', reason: 'no-room', code: reqCode })); return; }
        if (rm.players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: 'error', reason: 'room-full', code: rm.code })); return; }
      } else {
        rm = { code: makeRoomCode(), players: new Map(), nextId: 1, hostId: null, state: 'lobby', endAt: 0, timer: null };
        rooms.set(rm.code, rm);
        console.log(`* room ${rm.code} opened`);
      }

      // Solo pilots carry no team; a team name groups up to MAX_TEAM allies.
      const team = m.team ? String(m.team).slice(0, 12) : null;
      if (team && teamCount(rm, team) >= MAX_TEAM) {
        ws.send(JSON.stringify({ t: 'error', reason: 'team-full', team }));
        if (!reqCode && rm.players.size === 0) { rooms.delete(rm.code); } // drop the empty room we just opened
        return;
      }

      const p = {
        id: 'p' + rm.nextId++,
        name: String(m.name || 'pilot').slice(0, 14),
        team,
        plane: m.plane,
        paint: m.paint || null,
        hpMax: Math.max(40, Math.min(400, m.hp || 100)),
        hp: Math.max(40, Math.min(400, m.hp || 100)),
        alive: true,
        kills: 0,
        deaths: 0,
      };
      rm.players.set(ws, p);
      if (!rm.hostId) rm.hostId = p.id; // first pilot in the room hosts
      ws.room = rm;
      ws.player = p;
      ws.send(JSON.stringify({
        t: 'welcome', id: p.id, room: rm.code, team: p.team,
        host: p.id === rm.hostId, hostId: rm.hostId, state: rm.state,
        ms: rm.state === 'playing' ? Math.max(0, rm.endAt - Date.now()) : 0,
        players: [...rm.players.values()].filter(q => q !== p).map(publicInfo),
        scores: scoreList(rm),
        lobby: lobbyList(rm),
      }));
      broadcast(rm, { t: 'join', ...publicInfo(p) }, ws);
      broadcast(rm, { t: 'scores', list: scoreList(rm) });
      broadcast(rm, { t: 'lobby', list: lobbyList(rm), state: rm.state, hostId: rm.hostId });
      console.log(`+ ${p.name} (${p.id}) ${team ? '['+team+'] ' : ''}— room ${rm.code}, ${rm.players.size} online`);
      return;
    }
    if (!me || !room) return;

    if (m.t === 'start') {
      // only the host can kick off a match, and only from the lobby
      if (me.id === room.hostId && room.state === 'lobby') startMatch(room);
      return;
    }

    if (m.t === 's') {
      broadcast(room, { t: 's', id: me.id, p: m.p, q: m.q, v: m.v }, ws);
    } else if (m.t === 'fire') {
      broadcast(room, { t: 'fire', id: me.id, kind: m.kind, p: m.p, q: m.q, v: m.v, tgt: m.tgt || null }, ws);
    } else if (m.t === 'hit') {
      // shooter-authoritative damage report — only during a live match
      if (room.state !== 'playing') return;
      let target = null;
      for (const p of room.players.values()) if (p.id === m.target) { target = p; break; }
      const dmg = Math.max(0, Math.min(150, m.dmg | 0));
      if (!target || !target.alive || !me.alive || dmg === 0) return;
      if (target.team && me.team && target.team === me.team) return; // no friendly fire
      target.hp -= dmg;
      broadcast(room, { t: 'hp', id: target.id, hp: target.hp, by: me.id });
      if (target.hp <= 0) {
        target.alive = false;
        target.deaths++;
        me.kills++;
        broadcast(room, { t: 'kill', id: target.id, by: me.id, idName: target.name, byName: me.name });
        broadcast(room, { t: 'scores', list: scoreList(room) });
        setTimeout(() => {
          if (![...room.players.values()].includes(target)) return; // left meanwhile
          target.alive = true;
          target.hp = target.hpMax;
          broadcast(room, { t: 'respawn', id: target.id, hp: target.hp });
        }, RESPAWN_MS);
      }
    }
  });

  ws.on('close', () => {
    const room = ws.room;
    const p = ws.player;
    if (!room || !p) return;
    room.players.delete(ws);
    // hand the host crown to the next pilot so the lobby never stalls
    if (room.hostId === p.id) {
      const next = room.players.values().next().value;
      room.hostId = next ? next.id : null;
    }
    broadcast(room, { t: 'leave', id: p.id });
    broadcast(room, { t: 'scores', list: scoreList(room) });
    broadcast(room, { t: 'lobby', list: lobbyList(room), state: room.state, hostId: room.hostId });
    console.log(`- ${p.name} (${p.id}) — room ${room.code}, ${room.players.size} online`);
    if (room.players.size === 0) {
      if (room.timer) clearTimeout(room.timer);
      rooms.delete(room.code);
      console.log(`* room ${room.code} closed`);
    }
  });
});

// drop dead connections
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

httpServer.listen(PORT, HOST, () => {
  console.log(`BlockWings on http://${HOST}:${PORT}  (game client + ws arena, ws path /ws)`);
});
