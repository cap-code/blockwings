// net.js — WebSocket multiplayer client.
//
// Talks to server.js (a thin relay + referee). State is sent ~12 Hz and
// remote planes are rendered ~150 ms in the past, interpolating between the
// two freshest snapshots. Hit detection is shooter-authoritative: your
// client detects your bullets hitting a remote plane and reports it; the
// server applies damage, declares kills and keeps score.
import * as THREE from 'three';
import { planeById, buildPlaneMesh } from './planes.js';
import { makeNameTag } from './combat.js';
import { encodeState, encodeFire, encodeHit, decode } from './proto.js';

export class Net {
  constructor(scene, combat) {
    this.scene = scene;
    this.combat = combat;
    this.ws = null;
    this.id = null;
    this.room = null;  // 4-digit room code, set on welcome
    this.team = null;  // my team name, or null when flying solo
    this.host = false; // am I the room host (the one who can start the match)?
    this.hostId = null;
    this.state = 'lobby'; // 'lobby' | 'playing'
    this.remainingMs = 0; // time left when joining a match already in progress
    this.remotes = new Map(); // id -> remote
    this.handlers = {};       // myhp, kill, respawn, scores, feed
  }

  on(type, fn) { this.handlers[type] = fn; }
  get connected() { return this.ws && this.ws.readyState === 1; }

  connect(url, profile) {
    return new Promise((resolve, reject) => {
      let settled = false;
      try { this.ws = new WebSocket(url); } catch (e) { return reject(e); }
      this.ws.binaryType = 'arraybuffer'; // hot-path frames arrive as ArrayBuffer
      const timer = setTimeout(() => {
        if (!settled) { settled = true; this.ws.close(); reject(new Error('timeout')); }
      }, 6000);
      this.ws.onopen = () => {
        this.ws.send(JSON.stringify({ t: 'join', ...profile }));
      };
      this.ws.onmessage = ev => {
        // binary frames are the hot path (state/fire/hp) — decode and dispatch;
        // text frames are JSON control/lobby traffic.
        if (typeof ev.data !== 'string') {
          const bm = decode(ev.data);
          if (bm) this.msg(bm);
          return;
        }
        const m = JSON.parse(ev.data);
        if (m.t === 'welcome' && !settled) {
          settled = true;
          clearTimeout(timer);
          this.id = m.id;
          this.room = m.room || null;
          this.team = m.team || null;
          this.host = !!m.host;
          this.hostId = m.hostId || null;
          this.state = m.state || 'lobby';
          this.remainingMs = m.ms || 0;
          for (const p of m.players) this.addRemote(p);
          if (m.scores) this.handlers.scores && this.handlers.scores(m.scores);
          this.handlers.lobby && this.handlers.lobby({ list: m.lobby || [], state: this.state, hostId: this.hostId, host: this.host });
          resolve();
          return;
        }
        if (m.t === 'error' && !settled) {
          settled = true;
          clearTimeout(timer);
          const e = new Error(m.reason || 'rejected');
          e.reason = m.reason; e.code = m.code; e.team = m.team;
          reject(e);
          return;
        }
        this.msg(m);
      };
      this.ws.onerror = () => {
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error('connection failed')); }
      };
      this.ws.onclose = () => {
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error('connection closed')); }
        else this.handlers.feed && this.handlers.feed('⚠ disconnected from server');
      };
    });
  }

  disconnect() {
    if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }
    for (const [, r] of this.remotes) this.dropRemote(r);
    this.remotes.clear();
    this.id = null;
  }

  msg(m) {
    const h = this.handlers;
    switch (m.t) {
      case 'join':
        this.addRemote(m);
        h.feed && h.feed(`🛫 ${m.name} joined`);
        break;
      case 'leave': {
        const r = this.remotes.get(m.id);
        if (r) {
          this.dropRemote(r);
          this.remotes.delete(m.id);
          h.feed && h.feed(`👋 ${r.name} left`);
        }
        break;
      }
      case 's': {
        const r = this.remotes.get(m.id);
        if (!r) break;
        r.last = { p: m.p, q: m.q }; // newest pose; rendered as-is, no buffering
        break;
      }
      case 'fire': {
        // replay remote weapons cosmetically (live=false → no local damage)
        const r = this.remotes.get(m.id);
        if (!r || !r.alive) break;
        const pos = new THREE.Vector3(...m.p);
        const quat = new THREE.Quaternion(...m.q);
        if (m.kind === 'gun') this.combat.fireGuns(m.id, pos, quat, m.v || 0, r.def.guns, 0, false);
        else if (m.kind === 'bomb') this.combat.dropBomb(m.id, pos, quat, m.v || 0, false);
        else if (m.kind === 'ultra') this.combat.fireUltra(m.id, pos, quat, false);
        else if (m.kind === 'msl') {
          // resolve their lock target to a live local entity (possibly us) so
          // the cosmetic missile visibly chases it
          const tgtId = m.tgt === this.id ? 'me' : m.tgt;
          const tgt = tgtId ? this.combat.targets.find(t => t.id === tgtId) : null;
          this.combat.fireMissile(m.id, pos, quat, m.v || 0, tgt, false);
        }
        break;
      }
      case 'hp': {
        if (m.id === this.id) { h.myhp && h.myhp(m.hp, m.by); break; }
        const r = this.remotes.get(m.id);
        if (r) { r.hp = m.hp; r.tag.userData.setHP(m.hp, r.hpMax); }
        break;
      }
      case 'kill': {
        const victim = m.id === this.id ? null : this.remotes.get(m.id);
        if (victim) {
          victim.alive = false;
          this.combat.boom(victim.mesh.position, 5);
          victim.mesh.visible = victim.tag.visible = false;
        }
        h.kill && h.kill(m); // {id, by, idName, byName}
        break;
      }
      case 'respawn': {
        if (m.id === this.id) { h.respawn && h.respawn(m.hp); break; }
        const r = this.remotes.get(m.id);
        if (r) {
          r.alive = true;
          r.hp = m.hp;
          r.last = null;
          r.tag.userData.setHP(r.hp, r.hpMax);
          r.mesh.visible = r.tag.visible = true;
        }
        break;
      }
      case 'scores':
        h.scores && h.scores(m.list);
        break;
      case 'lobby':
        this.hostId = m.hostId;
        this.host = m.hostId === this.id;
        this.state = m.state;
        h.lobby && h.lobby({ list: m.list, state: m.state, hostId: m.hostId, host: this.host });
        break;
      case 'start':
        this.state = 'playing';
        if (m.scores) h.scores && h.scores(m.scores);
        h.start && h.start({ ms: m.ms });
        break;
      case 'over':
        this.state = 'lobby';
        if (m.scores) h.scores && h.scores(m.scores);
        h.over && h.over({ scores: m.scores });
        break;
    }
  }

  // host-only: ask the server to begin the 10-minute match
  startGame() { if (this.connected) this.ws.send(JSON.stringify({ t: 'start' })); }

  addRemote(p) {
    if (this.remotes.has(p.id) || p.id === this.id) return;
    const def = planeById(p.plane);
    const mesh = buildPlaneMesh(def, p.paint, true); // merge: remotes never debris-break
    // teammates wear a green nametag, everyone else the usual blue
    const ally = this.team && p.team === this.team;
    const tag = makeNameTag((ally ? '🟢 ' : '') + (p.name || 'pilot'), ally ? '#7af07a' : '#7ad7ff');
    mesh.visible = tag.visible = false; // until the first state arrives
    this.scene.add(mesh);
    this.scene.add(tag);
    this.remotes.set(p.id, {
      id: p.id, name: p.name || 'pilot', team: p.team || null, def, mesh, tag,
      last: null, hp: p.hp ?? def.stats.hp, hpMax: def.stats.hp,
      alive: p.alive !== false,
    });
  }

  dropRemote(r) {
    this.scene.remove(r.mesh);
    this.scene.remove(r.tag);
  }

  sendState(pos, quat, speed) {
    if (!this.connected) return;
    this.ws.send(encodeState(pos, quat, speed));
  }

  sendFire(kind, pos, quat, speed, tgt = null) {
    if (!this.connected) return;
    this.ws.send(encodeFire(kind, pos, quat, speed, tgt));
  }

  sendHit(target, dmg, kind) {
    if (!this.connected) return;
    this.ws.send(encodeHit(target, dmg)); // kind is shooter-side only; server ignores it
  }

  // push our own state every frame and snap remote planes to their newest pose
  update(dt, localPos, localQuat, localSpeed) {
    this.sendState(localPos, localQuat, localSpeed);
    for (const [, r] of this.remotes) {
      if (!r.last || !r.alive) continue;
      const { p, q } = r.last;
      r.mesh.position.set(p[0], p[1], p[2]);
      r.mesh.quaternion.set(q[0], q[1], q[2], q[3]);
      r.mesh.visible = r.tag.visible = true;
      r.tag.position.copy(r.mesh.position);
      r.tag.position.y += 2.6;
      for (const prop of r.mesh.userData.props) prop.rotation.z += dt * 30;
    }
  }
}
