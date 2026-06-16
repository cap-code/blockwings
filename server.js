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

const PORT = process.env.PORT || 8081;
const RESPAWN_MS = 4000;

const wss = new WebSocketServer({ port: PORT });
let nextId = 1;
const players = new Map(); // ws -> player

function broadcast(obj, except = null) {
  const s = JSON.stringify(obj);
  for (const [ws] of players) {
    if (ws !== except && ws.readyState === 1) ws.send(s);
  }
}

function scoreList() {
  return [...players.values()].map(p => ({ id: p.id, name: p.name, kills: p.kills, deaths: p.deaths }));
}

function publicInfo(p) {
  return { id: p.id, name: p.name, plane: p.plane, paint: p.paint, hp: p.hp, alive: p.alive };
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', data => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    const me = players.get(ws);

    if (m.t === 'join' && !me) {
      const p = {
        id: 'p' + nextId++,
        name: String(m.name || 'pilot').slice(0, 14),
        plane: m.plane,
        paint: m.paint || null,
        hpMax: Math.max(40, Math.min(400, m.hp || 100)),
        hp: Math.max(40, Math.min(400, m.hp || 100)),
        alive: true,
        kills: 0,
        deaths: 0,
      };
      players.set(ws, p);
      ws.send(JSON.stringify({
        t: 'welcome', id: p.id,
        players: [...players.values()].filter(q => q !== p).map(publicInfo),
        scores: scoreList(),
      }));
      broadcast({ t: 'join', ...publicInfo(p) }, ws);
      broadcast({ t: 'scores', list: scoreList() });
      console.log(`+ ${p.name} (${p.id}) — ${players.size} online`);
      return;
    }
    if (!me) return;

    if (m.t === 's') {
      broadcast({ t: 's', id: me.id, p: m.p, q: m.q, v: m.v }, ws);
    } else if (m.t === 'fire') {
      broadcast({ t: 'fire', id: me.id, kind: m.kind, p: m.p, q: m.q, v: m.v, tgt: m.tgt || null }, ws);
    } else if (m.t === 'hit') {
      // shooter-authoritative damage report
      let target = null;
      for (const p of players.values()) if (p.id === m.target) { target = p; break; }
      const dmg = Math.max(0, Math.min(150, m.dmg | 0));
      if (!target || !target.alive || !me.alive || dmg === 0) return;
      target.hp -= dmg;
      broadcast({ t: 'hp', id: target.id, hp: target.hp, by: me.id });
      if (target.hp <= 0) {
        target.alive = false;
        target.deaths++;
        me.kills++;
        broadcast({ t: 'kill', id: target.id, by: me.id, idName: target.name, byName: me.name });
        broadcast({ t: 'scores', list: scoreList() });
        setTimeout(() => {
          if (![...players.values()].includes(target)) return; // left meanwhile
          target.alive = true;
          target.hp = target.hpMax;
          broadcast({ t: 'respawn', id: target.id, hp: target.hp });
        }, RESPAWN_MS);
      }
    }
  });

  ws.on('close', () => {
    const p = players.get(ws);
    if (!p) return;
    players.delete(ws);
    broadcast({ t: 'leave', id: p.id });
    broadcast({ t: 'scores', list: scoreList() });
    console.log(`- ${p.name} (${p.id}) — ${players.size} online`);
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

console.log(`BlockWings arena server on ws://0.0.0.0:${PORT}`);
