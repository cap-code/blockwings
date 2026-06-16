// main.js — BlockWings: voxel Earth flight simulator
import * as THREE from 'three';
import * as W from './world.js';
import { ChunkManager, CS, GeoBuilder, landMat, waterMat } from './terrain.js';
import { PLANES, buildPlaneMesh } from './planes.js';
import { Input, IS_TOUCH } from './input.js';
import { Combat, GUN_SPEED } from './combat.js';
import { Bots } from './bots.js';
import { Net } from './net.js';
import { Garage, combatStats, paintFor } from './garage.js';

const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- renderer
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_TOUCH });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const SKY = new THREE.Color(0x79b6ff);
scene.background = SKY;

const VIEW_CHUNKS = IS_TOUCH ? 6 : 9;
const FOG_FAR = VIEW_CHUNKS * CS * 0.95;
scene.fog = new THREE.Fog(SKY, FOG_FAR * 0.45, FOG_FAR);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 16000);

// ---------------------------------------------------------------- round Earth
// The planet's real curvature at this scale: R = circumference / 2π.
// A vertex shader bends all terrain down with distance from the camera, so
// the horizon actually curves — and from space the world is a globe.
const PLANET_R = W.WORLD_W / (2 * Math.PI);
const curvCam = { x: { value: 0 }, z: { value: 0 } };
function addCurvature(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCamX = curvCam.x;
    sh.uniforms.uCamZ = curvCam.z;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uCamX;\nuniform float uCamZ;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 wpC = modelMatrix * vec4( transformed, 1.0 );
          float dxC = wpC.x - uCamX;
          float dzC = wpC.z - uCamZ;
          transformed.y -= ( dxC * dxC + dzC * dzC ) * ${(1 / (2 * PLANET_R)).toExponential(5)};
        }`);
  };
}
addCurvature(landMat);
addCurvature(waterMat);

scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6a7c58, 0.85));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.25);
sun.position.set(0.5, 1, 0.3);
scene.add(sun);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- clouds
// Each cloud is a cluster of 3-6 overlapping flat boxes, Minecraft style.
const cloudGeo = new THREE.BoxGeometry(1, 1, 1);
const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
const N_CLUSTERS = IS_TOUCH ? 14 : 24;
const cloudData = [];
let totalPuffs = 0;
for (let i = 0; i < N_CLUSTERS; i++) {
  const n = 3 + Math.floor(W.hash2(i, 101) * 4);
  const puffs = [];
  for (let j = 0; j < n; j++) {
    puffs.push({
      ox: (W.hash2(i, 200 + j) - 0.5) * 30,
      oz: (W.hash2(i, 300 + j) - 0.5) * 22,
      oy: j * 0.9,
      w: 9 + W.hash2(i, 400 + j) * 17,
      d: 7 + W.hash2(i, 500 + j) * 13,
      h: 2.4 + W.hash2(i, 600 + j) * 2,
    });
  }
  cloudData.push({
    x: (W.hash2(i, 102) - 0.5) * FOG_FAR * 2,
    z: (W.hash2(i, 103) - 0.5) * FOG_FAR * 2,
    y: 110 + W.hash2(i, 104) * 70,
    puffs,
  });
  totalPuffs += n;
}
const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, totalPuffs);
clouds.frustumCulled = false; // instances are scattered across the sky
scene.add(clouds);

function updateClouds(px, pz, dt) {
  const m = new THREE.Matrix4();
  let idx = 0;
  for (const c of cloudData) {
    c.x += dt * 1.5; // gentle westerly drift
    if (c.x - px > FOG_FAR) c.x -= FOG_FAR * 2;
    if (px - c.x > FOG_FAR) c.x += FOG_FAR * 2;
    if (c.z - pz > FOG_FAR) c.z -= FOG_FAR * 2;
    if (pz - c.z > FOG_FAR) c.z += FOG_FAR * 2;
    for (const p of c.puffs) {
      m.makeScale(p.w, p.h, p.d).setPosition(c.x + p.ox, c.y + p.oy, c.z + p.oz);
      clouds.setMatrixAt(idx++, m);
    }
  }
  clouds.instanceMatrix.needsUpdate = true;
}
updateClouds(0, 0, 0);

// ---------------------------------------------------------------- space
let planet = null, halo = null, stars = null;
const spaceBlack = new THREE.Color(0x000004);
const skyNow = new THREE.Color();

function initSpace() {
  // the globe, textured with the same generated Earth map
  const cv = document.createElement('canvas');
  cv.width = 1440; cv.height = 720;
  W.drawMapTo(cv.getContext('2d'), 1440, 720);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  planet = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_R, 96, 64),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, fog: false }),
  );
  planet.visible = false;
  scene.add(planet);

  halo = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_R * 1.025, 64, 48),
    new THREE.MeshBasicMaterial({
      color: 0x6fb6ff, transparent: true, opacity: 0,
      side: THREE.BackSide, fog: false, depthWrite: false,
    }),
  );
  halo.visible = false;
  scene.add(halo);

  const starPos = new Float32Array(1300 * 3);
  for (let i = 0; i < 1300; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(9000);
    starPos[i * 3] = v.x; starPos[i * 3 + 1] = v.y; starPos[i * 3 + 2] = v.z;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({
    color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false,
  }));
  stars.visible = false;
  stars.frustumCulled = false;
  scene.add(stars);
}

const qSpA = new THREE.Quaternion(), qSpB = new THREE.Quaternion();
function updateSpace() {
  // 0 in the troposphere → 1 in space
  const f = Math.max(0, Math.min(1, (state.pos.y - 250) / 250));
  skyNow.copy(SKY).lerp(spaceBlack, f);
  scene.background = skyNow;
  scene.fog.color.copy(skyNow);
  // clouds belong to the lower atmosphere — fogged black from up here
  cloudMat.opacity = 0.85 * (1 - f);
  clouds.visible = f < 0.85;
  if (!planet) return f;
  const on = f > 0.02;
  planet.visible = halo.visible = stars.visible = on;
  if (!on) return f;
  planet.material.opacity = f;
  halo.material.opacity = 0.16 * f;
  stars.material.opacity = f;
  stars.position.copy(camera.position);
  // park the globe under the player, rotated so the current lat/lon is on top
  // (sea level on the globe = y 0 here, and north lines up with -Z)
  const lat = W.zToLat(state.pos.z), lon = W.xToLon(state.pos.x);
  const theta = (90 - lat) * Math.PI / 180;
  const phi = (lon + 180) * Math.PI / 180;
  planet.position.set(state.pos.x, -PLANET_R, state.pos.z);
  qSpA.setFromAxisAngle(AX, -theta);
  qSpB.setFromAxisAngle(AY, Math.PI / 2 - phi);
  planet.quaternion.copy(qSpA).multiply(qSpB);
  halo.position.copy(planet.position);
  return f;
}

// ---------------------------------------------------------------- game state
const input = new Input();
let chunkMgr = null;
let plane = null;            // THREE.Group of the current aircraft
let def = PLANES[3];         // selected plane definition
let stats = combatStats(def); // def.stats + garage upgrades, frozen at spawn
let mode = 'free';           // 'free' | 'bots' | 'online'
const state = {
  flying: false,
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  speed: 0,
  throttle: 0.6,
  grounded: false,
  crashed: false,
  prevY: 0,
  camMode: 0,                // 0 chase, 1 cockpit, 2 far
  // combat
  hp: 100, hpMax: 100,
  ultra: 0,                  // 0..100, full = ULTRA ready
  heat: 0, overheat: false,  // machine-gun heat
  gunCool: 0, bombCool: 0,
  boost: 0,                  // afterburner seconds left (ultra perk)
  msl: 8, mslCool: 0, mslRegen: 0, // lock-on missile stock
};
const MSL_MAX = 8, MSL_REGEN = 12, MSL_COOLDOWN = 1.8;

// ---------------------------------------------------------------- lock-on
// Ace Combat style: keep an enemy inside the nose cone for LOCK_TIME and the
// reticle locks — missiles fired then chase that target hard.
const LOCK_CONE = 0.22;      // rad — acquisition cone around the nose
const KEEP_CONE = 0.45;      // rad — lock survives inside this wider cone
const LOCK_RANGE = 280;      // blocks
const LOCK_TIME = 1.1;       // seconds in-cone to lock
const lock = { target: null, t: 0, locked: false, beep: 0 };

function resetLock() {
  lock.target = null;
  lock.t = 0;
  lock.locked = false;
}

// ---------------------------------------------------------------- combat
const combat = new Combat(scene);
const bots = new Bots(scene, combat);
let net = null;              // created on ONLINE connect

const scores = new Map();    // id -> { name, kills, deaths }
let myName = localStorage.getItem('bw.name') || '';
let sbOpen = false;

function ensureScore(id, name) {
  if (!scores.has(id)) scores.set(id, { name, kills: 0, deaths: 0 });
  return scores.get(id);
}

function addFeed(text) {
  const feed = $('killfeed');
  const div = document.createElement('div');
  div.textContent = text;
  feed.appendChild(div);
  while (feed.children.length > 5) feed.removeChild(feed.firstChild);
  setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 6000);
}

let hitmarkTok = 0;
function hitmark() {
  const ch = $('crosshair');
  ch.classList.add('hit');
  const tok = ++hitmarkTok;
  setTimeout(() => { if (tok === hitmarkTok) ch.classList.remove('hit'); }, 110);
  sfx('hit');
}

function gainUltra(amount) {
  if (state.ultra >= 100) return;
  state.ultra = Math.min(100, state.ultra + amount);
  if (state.ultra >= 100) showMsg('🌟 ULTRA READY — press G!', 2200);
}

// every hit anywhere in the world routes through here
combat.onHit = (targetId, dmg, owner, kind) => {
  if (targetId === 'me') {
    damageMe(dmg, owner, kind);
    return;
  }
  if (mode === 'bots') {
    bots.damage(targetId, dmg, owner);
    if (owner === 'me') { hitmark(); gainUltra(dmg * 0.45); }
  } else if (mode === 'online' && owner === 'me' && net) {
    net.sendHit(targetId, dmg, kind);
    hitmark();
    gainUltra(dmg * 0.45);
  }
};

bots.onKill = (botId, botName, byId) => {
  ensureScore(botId, botName).deaths++;
  if (byId) {
    const killer = byId === 'me' ? ensureScore('me', myName || 'You')
      : ensureScore(byId, (bots.list.find(b => b.id === byId) || {}).name || byId);
    killer.kills++;
    addFeed(`${byId === 'me' ? (myName || 'You') : killer.name} 💥 ${botName}`);
    if (byId === 'me') gainUltra(22);
  } else {
    addFeed(`${botName} crashed 💀`);
  }
};

function damageMe(dmg, by, kind) {
  if (!state.flying || state.crashed) return;
  state.hp -= dmg;
  $('flash').style.opacity = 0.28;
  setTimeout(() => { $('flash').style.opacity = 0; }, 70);
  if (state.hp <= 0) {
    state.hp = 0;
    ensureScore('me', myName || 'You').deaths++;
    if (mode === 'bots' && by) {
      const b = bots.list.find(b => b.id === by);
      if (b) { ensureScore(by, b.name).kills++; addFeed(`${b.name} 💥 ${myName || 'You'}`); }
    }
    crash(true);
  }
}

function refreshTargets() {
  const t = [{ id: 'me', pos: state.pos, radius: 2.0, alive: state.flying && !state.crashed }];
  if (mode === 'bots') {
    for (const b of bots.list) if (!b.dead) t.push({ id: b.id, pos: b.pos, radius: 1.9, alive: true });
  } else if (mode === 'online' && net) {
    for (const [id, r] of net.remotes) t.push({ id, pos: r.mesh.position, radius: 2.0, alive: r.alive && r.mesh.visible });
  }
  combat.targets = t;
}

function canCombat() {
  return state.flying && !state.crashed && !menuOpen;
}

// ---------------------------------------------------------------- scoreboard
function renderScoreboard() {
  const sb = $('scoreboard');
  const rows = [...scores.values()]
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
    .map(s => `<tr class="${s.name === (myName || 'You') ? 'me' : ''}">
      <td>${s.name}</td><td>${s.kills}</td><td>${s.deaths}</td></tr>`)
    .join('');
  sb.innerHTML = `<h3>🏆 SCOREBOARD</h3>
    <table><tr><th>PILOT</th><th>KILLS</th><th>DEATHS</th></tr>${rows}</table>`;
}

function toggleScoreboard(force) {
  sbOpen = force !== undefined ? force : !sbOpen;
  $('scoreboard').classList.toggle('hidden', !sbOpen);
  if (sbOpen) renderScoreboard();
}
const FWD = new THREE.Vector3();
const UPv = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);

// ---------------------------------------------------------------- audio
let audio = null;
function initAudio() {
  if (audio) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filt).connect(gain).connect(ctx.destination);
    osc.start();
    audio = { ctx, osc, filt, gain, muted: false };
  } catch (e) { audio = null; }
}
function updateAudio() {
  if (!audio) return;
  const on = state.flying && !state.crashed && !menuOpen && !audio.muted;
  const boost = state.boost > 0 ? 1.6 : 1;
  audio.gain.gain.value = on ? (0.035 + state.throttle * 0.045) * boost : 0;
  audio.osc.frequency.value = 34 + state.speed * 0.9 + state.throttle * 26;
  audio.filt.frequency.value = 260 + state.throttle * 600;
}

// one-shot combat sounds, cheap oscillator blips
function sfx(type) {
  if (!audio || audio.muted) return;
  const ctx = audio.ctx, t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.connect(g).connect(ctx.destination);
  if (type === 'gun') {
    o.type = 'square';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(240, t + 0.06);
    g.gain.setValueAtTime(0.045, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.start(t); o.stop(t + 0.08);
  } else if (type === 'boom') {
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(36, t + 0.5);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.start(t); o.stop(t + 0.6);
  } else if (type === 'hit') {
    o.type = 'square';
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.05);
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.start(t); o.stop(t + 0.07);
  } else if (type === 'ultra') {
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(1300, t + 0.4);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.start(t); o.stop(t + 0.55);
  } else if (type === 'msl') {
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.35);
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.start(t); o.stop(t + 0.45);
  } else if (type === 'tick') {        // lock acquiring
    o.type = 'square';
    o.frequency.setValueAtTime(980, t);
    g.gain.setValueAtTime(0.03, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    o.start(t); o.stop(t + 0.05);
  } else if (type === 'tickHi') {      // locked tone
    o.type = 'square';
    o.frequency.setValueAtTime(1450, t);
    g.gain.setValueAtTime(0.035, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.start(t); o.stop(t + 0.06);
  } else if (type === 'warn') {        // incoming missile
    o.type = 'square';
    o.frequency.setValueAtTime(620, t);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.start(t); o.stop(t + 0.1);
  }
}
combat.sfx = sfx;

// ---------------------------------------------------------------- menu
let menuOpen = true;
const menuEl = $('menu');

function buildMenu() {
  const grid = $('planeGrid');
  PLANES.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'planeCard' + (p === def ? ' sel' : '');
    const spd = Math.round(p.stats.maxSpeed / 130 * 100);
    const agi = Math.round((p.stats.roll + p.stats.pitch) / 6.8 * 100);
    card.innerHTML =
      `<div class="pcEmoji">${p.emoji}</div>` +
      `<div class="pcName">${p.name}</div>` +
      `<div class="pcDesc">${p.desc}</div>` +
      `<div class="pcStat">SPD<span class="bar"><i style="width:${spd}%"></i></span></div>` +
      `<div class="pcStat">AGI<span class="bar"><i style="width:${agi}%"></i></span></div>`;
    card.addEventListener('click', () => {
      def = p;
      grid.querySelectorAll('.planeCard').forEach(c => c.classList.remove('sel'));
      card.classList.add('sel');
    });
    grid.appendChild(card);
  });

  const sel = $('spawnSel');
  W.SPAWNS.forEach((s, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = s.name;
    sel.appendChild(o);
  });

  // game mode
  for (const btn of document.querySelectorAll('.modeBtn')) {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modeBtn').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      mode = btn.dataset.mode;
      $('serverLbl').classList.toggle('hidden', mode !== 'online');
    });
  }

  // callsign + server, remembered across visits
  const nameInp = $('nameInp');
  nameInp.value = myName;
  nameInp.addEventListener('input', () => {
    myName = nameInp.value.trim();
    localStorage.setItem('bw.name', myName);
  });
  const srvInp = $('serverInp');
  srvInp.value = localStorage.getItem('bw.server') ||
    (location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.hostname || 'localhost') + ':8081';

  $('garageBtn').addEventListener('click', () => garage.open());

  $('flyBtn').addEventListener('click', async () => {
    input.invert = $('invertChk').checked;
    initAudio();
    if (mode === 'online') {
      const url = srvInp.value.trim();
      localStorage.setItem('bw.server', url);
      const btn = $('flyBtn');
      btn.disabled = true;
      btn.textContent = 'CONNECTING…';
      try {
        if (net) net.disconnect();
        net = new Net(scene, combat);
        wireNet(net);
        await net.connect(url, {
          name: myName || 'pilot',
          plane: def.id,
          paint: paintFor(def),
          hp: combatStats(def).hp,
        });
      } catch (e) {
        showMsg('⚠ Can\'t reach server\n' + url, 3500);
        btn.disabled = false;
        btn.textContent = 'TAKE OFF ▶';
        return;
      }
      btn.disabled = false;
      btn.textContent = 'TAKE OFF ▶';
    }
    startFlight(parseInt(sel.value, 10));
  });
}

const garage = new Garage(() => def);

function wireNet(n) {
  n.on('feed', addFeed);
  n.on('myhp', (hp) => {
    if (hp < state.hp) {
      $('flash').style.opacity = 0.28;
      setTimeout(() => { $('flash').style.opacity = 0; }, 70);
    }
    state.hp = Math.max(0, hp);
  });
  n.on('kill', m => {
    addFeed(`${m.byName} 💥 ${m.idName}`);
    if (m.id === n.id && !state.crashed) crash(true);
    if (m.by === n.id) gainUltra(22);
  });
  n.on('respawn', hp => { state.hp = hp; });
  n.on('scores', list => {
    scores.clear();
    for (const s of list) {
      scores.set(s.id, { name: s.id === n.id ? (myName || 'You') : s.name, kills: s.kills, deaths: s.deaths });
    }
    if (sbOpen) renderScoreboard();
  });
}

function openMenu() {
  menuOpen = true;
  menuEl.classList.remove('hidden');
  toggleScoreboard(false);
  input.unlockMouse();
  input.showTouch(false);
}

function startFlight(spawnIdx) {
  scores.clear();
  ensureScore('me', myName || 'You');
  state.ultra = 0;
  state.heat = 0;
  state.overheat = false;
  state.boost = 0;
  state.msl = MSL_MAX;
  state.mslCool = 0;
  state.mslRegen = 0;
  resetLock();
  combat.clear();
  const s = W.SPAWNS[spawnIdx];
  if (s.apt !== undefined) {
    // start parked at the runway threshold, lined up for takeoff
    const a = W.airportInfo(s.apt);
    const off = W.RUN_HALF - 3;
    if (a.dir === 'EW') spawnAt(a.x - off, a.z, { grounded: true, heading: 90 });
    else spawnAt(a.x, a.z + off, { grounded: true, heading: 0 });
  } else {
    let lat = s.lat, lon = s.lon;
    if (lat === null) {
      lat = -55 + Math.random() * 120;
      lon = -180 + Math.random() * 360;
    }
    spawnAt(W.lonToX(lon), W.latToZ(lat));
  }
  menuOpen = false;
  menuEl.classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('minimap').classList.remove('hidden');
  $('topButtons').classList.remove('hidden');
  $('combatBar').classList.remove('hidden');
  $('crosshair').classList.toggle('hidden', mode === 'free');
  input.showTouch(true);
  $('hudPlane').textContent = def.emoji + ' ' + def.name;

  if (mode === 'bots') {
    bots.spawnAll(5, state.pos.x, state.pos.z);
    for (const b of bots.list) ensureScore(b.id, b.name);
    showMsg('🤖 5 rivals inbound — good hunting!', 3200);
  } else {
    bots.clear();
  }
  if (mode !== 'online' && net) { net.disconnect(); net = null; }
  if (mode === 'online') showMsg('🌐 Arena joined — watch your six!', 3200);
}

function spawnAt(x, z, opts = {}) {
  clearDebris();
  clearNPCs();
  if (plane) scene.remove(plane);
  stats = combatStats(def);
  state.hpMax = stats.hp;
  state.hp = stats.hp;
  plane = buildPlaneMesh(def, paintFor(def));
  scene.add(plane);

  const ground = W.heightAt(x, z);
  state.quat.setFromAxisAngle(AY, -(opts.heading || 0) * Math.PI / 180);
  if (opts.grounded) {
    state.pos.set(x, Math.max(ground, 0.42) + 0.55, z);
    state.speed = 0;
    state.throttle = 0;
    state.grounded = true;
  } else {
    state.pos.set(x, Math.max(ground, W.SEA_Y) + 55, z);
    state.speed = stats.maxSpeed * 0.55;
    state.throttle = 0.6;
    state.grounded = false;
  }
  if (input.throttleAbs !== null) input.throttleAbs = state.throttle;
  input.setThrottleKnob(state.throttle);
  state.crashed = false;
  state.flying = true;
  state.prevY = state.pos.y;
  plane.position.copy(state.pos);
  plane.quaternion.copy(state.quat);

  if (!chunkMgr) chunkMgr = new ChunkManager(scene, VIEW_CHUNKS, IS_TOUCH ? 3 : 6);
  showMsg('Loading terrain…', 0);
  requestAnimationFrame(() => {
    chunkMgr.clear();
    chunkMgr.pregen(x, z, 3);
    showMsg('', 0);
  });
}

// ---------------------------------------------------------------- crash / debris
// On impact the plane dismantles: every box flies off with the plane's
// momentum plus a random kick, tumbles, bounces off the ground and burns out.
const debris = [];
const fireGeo = new THREE.BoxGeometry(1, 1, 1);
const fireMats = [
  new THREE.MeshBasicMaterial({ color: 0xff7b24 }),
  new THREE.MeshBasicMaterial({ color: 0xff3415 }),
  new THREE.MeshBasicMaterial({ color: 0x333333 }),
];

function addDebris(mesh, vel, life) {
  scene.add(mesh);
  debris.push({
    mesh, vel, life, full: life,
    ang: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9),
    baseScale: mesh.scale.clone(),
  });
}

function explodePlane() {
  plane.updateMatrixWorld(true);
  FWD.set(0, 0, -1).applyQuaternion(state.quat);
  // pieces keep only a little forward momentum and get a big upward kick,
  // so the wreck scatters around the impact point instead of tumbling away
  const vx = FWD.x * state.speed * 0.22, vy = Math.max(0, FWD.y * state.speed * 0.15), vz = FWD.z * state.speed * 0.22;

  const parts = [];
  plane.traverse(o => { if (o.isMesh) parts.push(o); });
  for (const m of parts) {
    const d = m.clone();
    m.getWorldPosition(d.position);
    m.getWorldQuaternion(d.quaternion);
    m.getWorldScale(d.scale);
    addDebris(d, new THREE.Vector3(
      vx + (Math.random() - 0.5) * 16,
      vy + 6 + Math.random() * 12,
      vz + (Math.random() - 0.5) * 16,
    ), 2.6 + Math.random() * 1.4);
  }
  // fireball cubes
  for (let i = 0; i < 18; i++) {
    const f = new THREE.Mesh(fireGeo, fireMats[i % fireMats.length]);
    f.position.copy(state.pos);
    const s = 0.8 + Math.random() * 1.6;
    f.scale.set(s, s, s);
    addDebris(f, new THREE.Vector3(
      vx * 0.5 + (Math.random() - 0.5) * 20,
      5 + Math.random() * 14,
      vz * 0.5 + (Math.random() - 0.5) * 20,
    ), 0.9 + Math.random() * 1.1);
  }
  scene.remove(plane);
}

function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.life -= dt;
    if (d.life <= 0) {
      scene.remove(d.mesh);
      debris.splice(i, 1);
      continue;
    }
    d.vel.y -= 26 * dt;
    d.mesh.position.addScaledVector(d.vel, dt);
    d.mesh.rotation.x += d.ang.x * dt;
    d.mesh.rotation.y += d.ang.y * dt;
    d.mesh.rotation.z += d.ang.z * dt;
    const g = Math.max(W.heightAt(d.mesh.position.x, d.mesh.position.z), 0.42);
    if (d.mesh.position.y < g + 0.3) {
      d.mesh.position.y = g + 0.3;
      d.vel.y = Math.abs(d.vel.y) * 0.35;
      d.vel.x *= 0.55; d.vel.z *= 0.55;
      d.ang.multiplyScalar(0.5);
    }
    if (d.life < 0.7) { // burn out
      const s = d.life / 0.7;
      d.mesh.scale.copy(d.baseScale).multiplyScalar(s);
    }
  }
}

function clearDebris() {
  for (const d of debris) scene.remove(d.mesh);
  debris.length = 0;
}

function crash(shotDown = false) {
  if (state.crashed) return;
  state.crashed = true;
  explodePlane();
  if (!shotDown && mode !== 'free') {
    ensureScore('me', myName || 'You').deaths++;
    addFeed(`${myName || 'You'} crashed 💀`);
  }
  $('flash').style.opacity = 0.7;
  showMsg(shotDown ? '💥 SHOT DOWN!' : '💥 CRASHED!', 0);
  setTimeout(() => { $('flash').style.opacity = 0; }, 90);
  setTimeout(() => {
    if (!state.crashed) return;
    state.crashed = false;
    showMsg('', 0);
    plane = buildPlaneMesh(def, paintFor(def));
    scene.add(plane);
    const ground = W.heightAt(state.pos.x, state.pos.z);
    state.pos.y = Math.max(ground, W.SEA_Y) + 55;
    // keep heading, level the wings
    FWD.set(0, 0, -1).applyQuaternion(state.quat);
    FWD.y = 0; FWD.normalize();
    state.quat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), FWD);
    state.speed = stats.maxSpeed * 0.55;
    if (stats.heli) state.throttle = 0.5; // respawn in a steady hover
    state.prevY = state.pos.y;
    state.hp = state.hpMax;
    state.heat = 0;
    state.overheat = false;
    state.boost = 0;
    plane.position.copy(state.pos);
    plane.quaternion.copy(state.quat);
  }, 2800);
}

// transient center-screen messages (token guards against stale timeouts)
let msgToken = 0;
function showMsg(text, ttl = 2400) {
  $('msg').textContent = text;
  const tok = ++msgToken;
  if (ttl > 0) setTimeout(() => { if (msgToken === tok) $('msg').textContent = ''; }, ttl);
}

// ---------------------------------------------------------------- physics
function rollAngleOf(q) {
  UPv.set(0, 1, 0);
  tmpV.copy(UPv).applyQuaternion(tmpQ.copy(q).invert()); // world up in local frame
  return Math.atan2(-tmpV.x, tmpV.y); // + = banked right
}

function step(dt) {
  if (!state.flying || state.crashed || menuOpen) return;
  const st = stats;
  const ctl = input.read();
  const heli = !!st.heli;

  // throttle (keys, mobile slider, or scroll-wheel nudges in mouse flight)
  if (ctl.thrAbs !== null) state.throttle = ctl.thrAbs;
  else state.throttle = Math.max(0, Math.min(1, state.throttle + ctl.thr * 0.85 * dt + ctl.thrNudge));

  // helicopters have full authority at zero airspeed and never stall
  const auth = heli ? 1 : Math.max(0.25, Math.min(1, state.speed / (st.minSpeed * 1.6))); // control authority
  const stall = heli ? 0 : Math.max(0, Math.min(1, (st.minSpeed * 1.25 - state.speed) / (st.minSpeed * 1.25)));

  if (!state.grounded) {
    if (heli) {
      // cyclic + pedals: tilt the airframe, yaw freely on the tail rotor,
      // ease back to a level hover when the stick is centered
      state.quat.multiply(tmpQ.setFromAxisAngle(AX, ctl.pitch * st.pitch * dt));
      state.quat.multiply(tmpQ.setFromAxisAngle(AZ, -ctl.roll * st.roll * dt));
      state.quat.premultiply(tmpQ.setFromAxisAngle(AY, -ctl.yaw * st.yaw * dt));
      const bank = rollAngleOf(state.quat);
      state.quat.premultiply(tmpQ.setFromAxisAngle(AY, -Math.sin(bank) * 1.4 * dt)); // banked turn
      if (Math.abs(ctl.pitch) < 0.05 && Math.abs(ctl.roll) < 0.05) {
        state.quat.slerp(levelQuat(), 1 - Math.pow(0.2, dt));
      }
    } else {
      // rotations (local)
      state.quat.multiply(tmpQ.setFromAxisAngle(AX, ctl.pitch * st.pitch * auth * dt));
      state.quat.multiply(tmpQ.setFromAxisAngle(AZ, -ctl.roll * st.roll * auth * dt));
      state.quat.multiply(tmpQ.setFromAxisAngle(AY, -ctl.yaw * st.yaw * auth * dt));

      // bank-to-turn + gentle auto-level
      const bank = rollAngleOf(state.quat);
      state.quat.premultiply(tmpQ.setFromAxisAngle(AY, -Math.sin(bank) * st.turn * auth * dt));
      if (Math.abs(ctl.roll) < 0.05) {
        state.quat.multiply(tmpQ.setFromAxisAngle(AZ, THREE.MathUtils.clamp(bank * 0.7, -0.6, 0.6) * dt));
      }
      // stall: nose drops
      if (stall > 0) state.quat.multiply(tmpQ.setFromAxisAngle(AX, -stall * 0.7 * dt));
    }
  }
  state.quat.normalize();

  FWD.set(0, 0, -1).applyQuaternion(state.quat);

  // ultra afterburner: a few seconds of extra thrust and top speed
  state.boost = Math.max(0, state.boost - dt);
  const burn = state.boost > 0 ? 1.45 : 1;

  if (heli) {
    // tilt to translate: nose-down drives forward, nose-up brakes/backs up
    if (!state.grounded) {
      const want = THREE.MathUtils.clamp(-FWD.y * 3.2, -0.4, 1) * st.maxSpeed * burn;
      state.speed += (want - state.speed) * Math.min(1, 1.6 * dt);
    }
    // horizontal translation along the nose heading
    tmpV.set(FWD.x, 0, FWD.z);
    if (tmpV.lengthSq() > 1e-6) tmpV.normalize();
    state.pos.addScaledVector(tmpV, state.speed * dt);
    if (!state.grounded) {
      // collective: throttle above the 50% detent climbs, below it sinks.
      // Ceiling is absolute, but always leaves hover room over high terrain
      const ceilY = Math.max(st.ceil, W.heightAt(state.pos.x, state.pos.z) + 40);
      let vy = (state.throttle - 0.5) * 2 * st.climb * burn;
      vy = Math.min(vy, (ceilY + 8 - state.pos.y) * 0.5); // thin-air ceiling
      state.pos.y += vy * dt;
    }
  } else {
    // speed: thrust − drag (air brake multiplies it) − gravity along flight path
    const drag = st.accel * Math.pow(state.speed / (st.maxSpeed * burn), 2) * (1 + ctl.brake * 2.5);
    state.speed += (st.accel * burn * state.throttle - drag - 21 * FWD.y * 0.55) * dt;
    state.speed = Math.max(0, Math.min(st.maxSpeed * burn * 1.35, state.speed));

    // move
    state.pos.addScaledVector(FWD, state.speed * dt);
    // stall mush + per-airframe service ceiling (the spaceplane has rockets —
    // its only limit is a hard cap at the edge of orbit). The ceiling is
    // absolute, but always leaves ~40 blocks of air over high mountains so
    // low flyers aren't dragged into the Himalaya
    let sink = stall * stall * 26;
    if (!st.space) {
      const ceilY = Math.max(st.ceil, W.heightAt(state.pos.x, state.pos.z) + 40);
      const over = state.pos.y - ceilY;
      if (over > 0) {
        // thin air: sink hard enough that no climb angle powers through,
        // and the nose mushes down like a stall
        sink += over * 0.2 + over * over * 0.01;
        state.quat.multiply(tmpQ.setFromAxisAngle(AX, -Math.min(1, over / 60) * 0.5 * dt));
      }
    }
    if (st.space && state.pos.y > 2400) state.pos.y = 2400;
    state.pos.y -= sink * dt;
  }

  // poles: gently bounce away
  if (state.pos.z < 60 || state.pos.z > W.WORLD_H - 60) {
    state.pos.z = THREE.MathUtils.clamp(state.pos.z, 60, W.WORLD_H - 60);
  }

  // wrap around the planet
  if (state.pos.x > W.WORLD_W * 1.25) { state.pos.x -= W.WORLD_W; chunkMgr.shiftWorld(-W.WORLD_W); }
  if (state.pos.x < -W.WORLD_W * 0.25) { state.pos.x += W.WORLD_W; chunkMgr.shiftWorld(W.WORLD_W); }

  const vy = (state.pos.y - state.prevY) / dt;
  state.prevY = state.pos.y;

  // ground interaction
  const groundH = W.heightAt(state.pos.x, state.pos.z);
  const water = groundH < 0;
  const surf = Math.max(groundH, water ? 0.42 : groundH);

  if (state.grounded) {
    state.pos.y = surf + 0.55;
    if (heli) {
      // sitting on the skids: spool the collective past the detent to lift
      state.speed = Math.max(0, state.speed - 14 * dt);
      state.quat.slerp(levelQuat(), 1 - Math.pow(0.05, dt));
      if (state.throttle > 0.62) {
        state.grounded = false;
        showMsg('🚁 Lift-off!');
      }
      $('hudStatus').textContent = '🚁 SKIDS DOWN — throttle up to lift';
    } else {
      // steer on the ground with roll input
      state.quat.premultiply(tmpQ.setFromAxisAngle(AY, -ctl.roll * 0.9 * dt));
      // level out
      state.quat.slerp(levelQuat(), 1 - Math.pow(0.05, dt));
      // friction vs thrust, plus the winch tug for unpowered gliders
      const fric = water ? 2.2 : 1.0;
      const winch = st.winch && state.throttle > 0.85 && state.speed < st.vr * 2.5 ? 26 : 0;
      state.speed += (st.accel * state.throttle * 0.9 + winch
        - fric * (3.5 + ctl.brake * 14) - st.accel * Math.pow(state.speed / st.maxSpeed, 2)) * dt;
      state.speed = Math.max(0, state.speed);
      // each airframe rotates at its own Vr
      if (state.speed > st.vr && ctl.pitch > 0.2) {
        state.grounded = false; // rotate!
        state.quat.multiply(tmpQ.setFromAxisAngle(AX, 0.25));
      }
      const surfTxt = water ? 'ON WATER' : W.pavedAt(state.pos.x, state.pos.z) ? 'ON RUNWAY' : 'ON GRASS';
      $('hudStatus').textContent =
        state.speed < 1 ? (st.winch ? '🪝 PARKED — hold full throttle to winch' : `PARKED ${surfTxt} — throttle up!`)
        : state.speed <= st.vr ? `${winch ? '🪝 WINCH · ' : ''}${surfTxt} · ${Math.round(state.speed * 10)} / Vr ${Math.round(st.vr * 10)}`
        : '🛫 Vr — PULL UP!';
    }
  } else if (state.pos.y < surf + 0.55) {
    // touchdown — judged against this airframe's landing envelope: within it
    // you grease it on, up to ~1.6× over you dent the airframe, beyond that
    // (or banked / nose-first / wrong surface) it's a crater
    const bank = Math.abs(rollAngleOf(state.quat));
    const paved = W.pavedAt(state.pos.x, state.pos.z);
    const clean = state.speed <= st.vland && vy > -st.vsink && bank < 0.45 && (heli || FWD.y > -0.22);
    const survivable = state.speed <= st.vland * 1.5 && vy > -st.vsink * 1.7 && bank < 0.6 && (heli || FWD.y > -0.3);
    if (water && !st.water) crash();
    else if (!survivable) crash();
    else if (!heli && !st.rough && !paved && !water) {
      // runway-only airframe touching down in a field
      if (clean) {
        touchdown(surf);
        groundDamage(26);
        showMsg('⚠ ROUGH FIELD — this bird needs a runway! Airframe damaged');
      } else crash();
    } else if (clean) {
      touchdown(surf);
      const apt = W.nearestAirport(state.pos.x, state.pos.z, 150);
      showMsg(apt ? `🛬 Landed at ${apt.name}!`
        : water ? '🌊 Water landing!' : heli ? '🚁 Touchdown' : '🛬 Touchdown');
    } else {
      touchdown(surf);
      groundDamage(18);
      showMsg('💥 HARD LANDING — airframe damaged!');
    }
  } else {
    // airborne status: stall and ceiling first, then approach guidance when
    // descending close to the ground
    const agl = state.pos.y - surf;
    let txt = '';
    if (stall > 0.05) txt = '⚠ STALL';
    else if (!st.space && state.pos.y > Math.max(st.ceil, surf + 40)) txt = '⬆ SERVICE CEILING';
    else if (agl < 30 && vy < -0.5) {
      const sOK = state.speed <= st.vland, kOK = -vy <= st.vsink;
      txt = `🛬 SPD ${Math.round(state.speed * 10)}/${Math.round(st.vland * 10)}${sOK ? '' : ' ⚠'}`
        + ` · SINK ${Math.min(99, Math.round(-vy))}/${st.vsink}${kOK ? '' : ' ⚠'}`;
    } else if (ctl.brake) txt = '🪂 AIR BRAKE';
    else if (state.pos.y > 420) txt = '🌌 IN SPACE';
    $('hudStatus').textContent = txt;
  }

  plane.position.copy(state.pos);
  plane.quaternion.copy(state.quat);

  // spin propellers
  for (const p of plane.userData.props) p.rotation.z += dt * (6 + state.throttle * 40);

  // ---- weapons ----
  state.gunCool -= dt;
  state.bombCool -= dt;
  state.mslCool -= dt;
  if (state.msl < MSL_MAX) {
    state.mslRegen += dt;
    if (state.mslRegen >= MSL_REGEN) { state.mslRegen = 0; state.msl++; }
  }
  state.heat = Math.max(0, state.heat - 0.4 * dt);
  if (state.overheat && state.heat < 0.45) state.overheat = false;
  if (ctl.fire && !state.grounded && state.gunCool <= 0 && !state.overheat) {
    state.gunCool = 1 / stats.gunRate;
    state.heat += 0.05;
    if (state.heat >= 1) { state.heat = 1; state.overheat = true; }
    combat.fireGuns('me', state.pos, state.quat, state.speed, def.guns, stats.gunDmg);
    if (net && mode === 'online') net.sendFire('gun', state.pos, state.quat, state.speed);
  }
  // ultra trickle-charges slowly; real charge comes from landing hits
  gainUltra((mode === 'free' ? 5 : 1.6) * dt);
}

function levelQuat() {
  FWD.set(0, 0, -1).applyQuaternion(state.quat);
  FWD.y = 0;
  if (FWD.lengthSq() < 1e-6) FWD.set(0, 0, -1);
  FWD.normalize();
  return tmpQ.setFromRotationMatrix(
    new THREE.Matrix4().lookAt(new THREE.Vector3(), FWD, AY)
  );
}

function touchdown(surf) {
  state.grounded = true;
  state.pos.y = surf + 0.55;
}

// airframe damage from hard or rough-field landings
function groundDamage(dmg) {
  state.hp -= dmg;
  $('flash').style.opacity = 0.28;
  setTimeout(() => { $('flash').style.opacity = 0; }, 70);
  if (state.hp <= 0) { state.hp = 0; crash(); }
}

// ---------------------------------------------------------------- NPC villagers
// Little blocky people that wander around cities and villages near you.
const NPC_MAX = IS_TOUCH ? 10 : 26;
const NPC_COLORS = [
  [[0.85, 0.3, 0.25], [0.25, 0.25, 0.4]], [[0.25, 0.45, 0.8], [0.3, 0.25, 0.2]],
  [[0.3, 0.65, 0.3], [0.25, 0.25, 0.3]], [[0.85, 0.7, 0.2], [0.35, 0.25, 0.2]],
  [[0.6, 0.35, 0.7], [0.2, 0.2, 0.25]], [[0.92, 0.92, 0.95], [0.25, 0.3, 0.45]],
];
function buildVillagerGeo([shirt, pants]) {
  const gb = new GeoBuilder();
  const skin = [0.87, 0.67, 0.5];
  gb.box(-0.17, 0, -0.09, -0.02, 0.5, 0.09, ...pants);   // legs
  gb.box(0.02, 0, -0.09, 0.17, 0.5, 0.09, ...pants);
  gb.box(-0.22, 0.5, -0.12, 0.22, 1.05, 0.12, ...shirt); // body
  gb.box(-0.33, 0.52, -0.1, -0.22, 1.0, 0.1, shirt[0] * 0.8, shirt[1] * 0.8, shirt[2] * 0.8); // arms
  gb.box(0.22, 0.52, -0.1, 0.33, 1.0, 0.1, shirt[0] * 0.8, shirt[1] * 0.8, shirt[2] * 0.8);
  gb.box(-0.16, 1.05, -0.16, 0.16, 1.42, 0.16, ...skin); // head
  return gb.build();
}
const villagerGeos = NPC_COLORS.map(buildVillagerGeo);
const npcs = [];
let npcTimer = 0;

function updateNPCs(dt) {
  npcTimer -= dt;
  const px = state.pos.x, pz = state.pos.z;
  if (npcTimer <= 0) {
    npcTimer = 0.4;
    // despawn the far ones
    for (let i = npcs.length - 1; i >= 0; i--) {
      const n = npcs[i];
      const dx = n.mesh.position.x - px, dz = n.mesh.position.z - pz;
      if (dx * dx + dz * dz > 140 * 140) {
        scene.remove(n.mesh);
        npcs.splice(i, 1);
      }
    }
    // spawn new ones when flying low over a populated area
    const aboveGround = state.pos.y - W.heightAt(px, pz);
    if (npcs.length < NPC_MAX && aboveGround < 55) {
      for (let tries = 0; tries < 10 && npcs.length < NPC_MAX; tries++) {
        const ang = Math.random() * Math.PI * 2;
        const d = 8 + Math.random() * 42;
        const nx = Math.round(px + Math.cos(ang) * d), nz = Math.round(pz + Math.sin(ang) * d);
        if (W.populationAt(nx, nz) < 0.15) continue;
        const col = W.column(nx, nz);
        if (col.water || col.bld || col.house || col.h < 1 || col.h > 30) continue;
        const mesh = new THREE.Mesh(villagerGeos[Math.floor(Math.random() * villagerGeos.length)], landMat);
        mesh.position.set(nx + 0.5, col.h, nz + 0.5);
        scene.add(mesh);
        npcs.push({ mesh, heading: Math.random() * Math.PI * 2, t: Math.random() * 9, walk: 0.8 + Math.random() * 0.8, turnIn: 2 + Math.random() * 4 });
      }
    }
  }
  for (const n of npcs) {
    n.t += dt;
    n.turnIn -= dt;
    if (n.turnIn <= 0) {
      n.heading += (Math.random() - 0.5) * 2.5;
      n.turnIn = 2 + Math.random() * 5;
    }
    const nx = n.mesh.position.x + Math.sin(n.heading) * n.walk * dt;
    const nz = n.mesh.position.z + Math.cos(n.heading) * n.walk * dt;
    const gh = W.heightAt(nx, nz);
    if (gh < 1 || Math.abs(gh - W.heightAt(n.mesh.position.x, n.mesh.position.z)) > 1.5) {
      n.heading += Math.PI; // cliff or water ahead — turn around
      continue;
    }
    n.mesh.position.set(nx, gh + Math.abs(Math.sin(n.t * 8)) * 0.06, nz);
    n.mesh.rotation.y = Math.atan2(Math.sin(n.heading), Math.cos(n.heading));
    n.mesh.rotation.z = Math.sin(n.t * 8) * 0.07; // waddle
  }
}

function clearNPCs() {
  for (const n of npcs) scene.remove(n.mesh);
  npcs.length = 0;
}

// ---------------------------------------------------------------- camera
const camPos = new THREE.Vector3(0, 60, 10);
function updateCamera(dt) {
  if (!plane) return;
  FWD.set(0, 0, -1).applyQuaternion(state.quat);
  if (state.crashed) { // pull back and up to watch the pieces scatter
    const want = tmpV.set(state.pos.x - FWD.x * 16, state.pos.y + 11, state.pos.z - FWD.z * 16);
    camPos.lerp(want, 1 - Math.pow(0.05, dt));
    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(state.pos.x, state.pos.y + 1, state.pos.z);
    return;
  }
  let want;
  if (state.camMode === 1) { // cockpit
    want = tmpV.copy(state.pos).addScaledVector(FWD, 0.5).add(UPv.set(0, 0.55, 0).applyQuaternion(state.quat));
    camPos.copy(want);
  } else {
    const dist = state.camMode === 2 ? 22 : 9 + state.speed * 0.04;
    want = tmpV.copy(state.pos).addScaledVector(FWD, -dist).add(new THREE.Vector3(0, dist * 0.42, 0));
    camPos.lerp(want, 1 - Math.pow(0.0001, dt));
  }
  camera.position.copy(camPos);
  camera.up.set(0, 1, 0);
  if (state.camMode === 1) {
    camera.quaternion.copy(state.quat);
  } else {
    camera.lookAt(state.pos.x + FWD.x * 6, state.pos.y + FWD.y * 6 + 1, state.pos.z + FWD.z * 6);
  }
}

// ---------------------------------------------------------------- HUD + minimap
const mapCanvas = $('minimap');
const mapCtx = mapCanvas.getContext('2d');
let mapBase = null;

function buildMinimapBase() {
  mapBase = document.createElement('canvas');
  mapBase.width = 360; mapBase.height = 180;
  const ctx = mapBase.getContext('2d');
  W.drawMapTo(ctx, 360, 180);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1;
  for (const a of W.AIRPORTS) {
    const x = (a.lon + 180) / 360 * 360, y = (90 - a.lat) / 180 * 180;
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    ctx.strokeRect(x - 1.5, y - 1.5, 3, 3);
  }
}

let hudTimer = 0;
function updateHUD(dt) {
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.12;

  $('hudSpd').textContent = Math.round(state.speed * 10);
  const altM = state.pos.y * 88;
  $('hudAlt').textContent = altM >= 10000 ? (altM / 1000).toFixed(1) + ' km' : Math.round(altM) + ' m';
  FWD.set(0, 0, -1).applyQuaternion(state.quat);
  const hdg = (Math.atan2(FWD.x, -FWD.z) * 180 / Math.PI + 360) % 360;
  $('hudHdg').textContent = Math.round(hdg);
  const lon = W.xToLon(state.pos.x), lat = W.zToLat(state.pos.z);
  $('hudPos').textContent =
    Math.abs(lat).toFixed(1) + '°' + (lat >= 0 ? 'N' : 'S') + ' ' +
    Math.abs(lon).toFixed(1) + '°' + (lon >= 0 ? 'E' : 'W');
  $('thrFill').style.width = Math.round(state.throttle * 100) + '%';

  // minimap
  mapCtx.drawImage(mapBase, 0, 0);
  const mx = (lon + 180) / 360 * 360;
  const my = (90 - lat) / 180 * 180;
  mapCtx.fillStyle = '#ff2222';
  mapCtx.beginPath();
  mapCtx.arc(mx, my, 3.4, 0, Math.PI * 2);
  mapCtx.fill();
  mapCtx.strokeStyle = '#ff2222';
  mapCtx.lineWidth = 1.6;
  mapCtx.beginPath();
  mapCtx.moveTo(mx, my);
  mapCtx.lineTo(mx + Math.sin(hdg * Math.PI / 180) * 9, my - Math.cos(hdg * Math.PI / 180) * 9);
  mapCtx.stroke();

  // enemy blips
  mapCtx.fillStyle = '#ffae33';
  for (const t of combat.targets) {
    if (t.id === 'me' || !t.alive) continue;
    const tlon = W.xToLon(t.pos.x), tlat = W.zToLat(t.pos.z);
    mapCtx.fillRect((tlon + 180) / 360 * 360 - 1.5, (90 - tlat) / 180 * 180 - 1.5, 3, 3);
  }
}

// ---------------------------------------------------------------- buttons / keys
$('btnMenu').addEventListener('click', openMenu);
$('btnCam').addEventListener('click', () => { state.camMode = (state.camMode + 1) % 3; });
$('btnMap').addEventListener('click', () => mapCanvas.classList.toggle('big'));
$('btnSnd').addEventListener('click', e => {
  initAudio();
  if (!audio) return;
  audio.muted = !audio.muted;
  e.target.textContent = audio.muted ? '🔇' : '🔊';
});
mapCanvas.addEventListener('click', () => mapCanvas.classList.toggle('big'));

input.onKey['KeyC'] = () => { state.camMode = (state.camMode + 1) % 3; };
input.onKey['KeyM'] = () => mapCanvas.classList.toggle('big');
input.onKey['Escape'] = () => { if (!menuOpen && state.flying) openMenu(); };
input.onKey['Tab'] = () => { if (!menuOpen && state.flying) toggleScoreboard(); };
input.onKey['KeyF'] = () => {
  if (!canCombat() || state.grounded || state.bombCool > 0) return;
  state.bombCool = 1.4;
  combat.dropBomb('me', state.pos, state.quat, state.speed);
  if (net && mode === 'online') net.sendFire('bomb', state.pos, state.quat, state.speed);
};
input.onKey['KeyV'] = () => {
  if (!canCombat() || state.grounded || state.mslCool > 0 || state.msl <= 0) return;
  state.msl--;
  state.mslCool = MSL_COOLDOWN;
  const tgt = lock.locked ? lock.target : null;
  combat.fireMissile('me', state.pos, state.quat, state.speed, tgt);
  if (net && mode === 'online') {
    net.sendFire('msl', state.pos, state.quat, state.speed, tgt ? tgt.id : null);
  }
};
input.onKey['KeyG'] = () => {
  if (!canCombat() || state.grounded || state.ultra < 100) return;
  state.ultra = 0;
  state.boost = 3;
  refreshTargets();
  combat.fireUltra('me', state.pos, state.quat);
  if (net && mode === 'online') net.sendFire('ultra', state.pos, state.quat, state.speed);
  showMsg('🌟 ULTRA STRIKE!', 1600);
};
input.onKey['KeyR'] = () => {
  if (!state.flying || menuOpen) return;
  const ground = W.heightAt(state.pos.x, state.pos.z);
  state.pos.y = Math.max(ground, 0) + 55;
  state.speed = stats.maxSpeed * 0.55;
  state.grounded = false;
  if (stats.heli) state.throttle = 0.5; // steady hover collective
  state.quat.copy(levelQuat());
};

// ---------------------------------------------------------------- boot
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state.flying && !menuOpen) {
    step(dt);
    FWD.set(0, 0, -1).applyQuaternion(state.quat);
    chunkMgr.update(state.pos.x, state.pos.z, FWD.x, FWD.z);
    updateClouds(state.pos.x, state.pos.z, dt);
    updateNPCs(dt);
    refreshTargets();
    combat.update(dt);
    if (mode === 'bots') bots.update(dt, combat.targets, state.pos);
    if (mode === 'online' && net) net.update(dt, state.pos, state.quat, state.speed);
    updateCamera(dt);
    updateSpace();
    curvCam.x.value = camera.position.x;
    curvCam.z.value = camera.position.z;
    updateHUD(dt);
    updateCombatHUD();
    updateLock(dt);
    updateMissileWarning(dt);
    updateAimUI(dt);
  }
  if (!menuOpen) updateDebris(dt);
  updateAudio();
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- mouse flight HUD
// Steering reticle while pointer-locked, a red lead pip showing where to
// shoot the nearest enemy (their position + velocity × bullet flight time),
// and an amber edge arrow pointing at them when they're off-screen.
if (!IS_TOUCH) {
  canvas.addEventListener('click', () => {
    if (state.flying && !menuOpen && !state.crashed) input.lockMouse(canvas);
  });
  input.onMouseFlight = locked => {
    $('mfRing').classList.toggle('hidden', !locked);
    $('mfDot').classList.toggle('hidden', !locked);
  };
}

const enemyVel = new Map(); // id -> { prev: Vector3, vel: Vector3 }
const projV = new THREE.Vector3();

function trackEnemyVel(id, pos, dt) {
  let e = enemyVel.get(id);
  if (!e) {
    e = { prev: pos.clone(), vel: new THREE.Vector3() };
    enemyVel.set(id, e);
    return e.vel;
  }
  projV.copy(pos).sub(e.prev).divideScalar(Math.max(dt, 1e-4));
  if (projV.lengthSq() < 400 * 400) e.vel.lerp(projV, Math.min(1, 8 * dt)); // ignore respawn teleports
  e.prev.copy(pos);
  return e.vel;
}

function updateLock(dt) {
  const box = $('lockBox');
  if (mode === 'free' || !canCombat()) {
    resetLock();
    box.classList.add('hidden');
    return;
  }
  FWD.set(0, 0, -1).applyQuaternion(state.quat);

  // does the current target still hold? (targets are rebuilt every frame —
  // identity lives in the id)
  let cur = null;
  if (lock.target) {
    const t = combat.targets.find(t => t.id === lock.target.id);
    if (t && t.alive) {
      const d = t.pos.distanceTo(state.pos);
      const ang = tmpV.copy(t.pos).sub(state.pos).normalize().angleTo(FWD);
      if (d < LOCK_RANGE * 1.25 && ang < (lock.locked ? KEEP_CONE : LOCK_CONE * 1.4)) cur = t;
    }
  }
  // otherwise acquire whoever is most centered in the nose cone
  if (!cur) {
    let bestAng = LOCK_CONE;
    for (const t of combat.targets) {
      if (t.id === 'me' || !t.alive) continue;
      if (t.pos.distanceTo(state.pos) > LOCK_RANGE) continue;
      const ang = tmpV.copy(t.pos).sub(state.pos).normalize().angleTo(FWD);
      if (ang < bestAng) { bestAng = ang; cur = t; }
    }
    if (!cur || !lock.target || cur.id !== lock.target.id) {
      lock.t = 0;
      lock.locked = false;
    }
  }
  lock.target = cur;
  if (!cur) {
    box.classList.add('hidden');
    return;
  }

  lock.t += dt;
  if (!lock.locked && lock.t >= LOCK_TIME) {
    lock.locked = true;
    sfx('tickHi');
  }

  // lock tone: slow ticks while acquiring, urgent ticks when locked
  lock.beep -= dt;
  if (lock.beep <= 0) {
    sfx(lock.locked ? 'tickHi' : 'tick');
    lock.beep = lock.locked ? 0.14 : 0.34;
  }

  // target box projected onto the screen
  const d = cur.pos.distanceTo(state.pos);
  const inFront = tmpV.copy(cur.pos).sub(camera.position)
    .dot(tmpV2Aim.set(0, 0, -1).applyQuaternion(camera.quaternion)) > 0;
  projV.copy(cur.pos).project(camera);
  if (!inFront || Math.abs(projV.x) > 1 || Math.abs(projV.y) > 1) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  box.classList.toggle('locked', lock.locked);
  const size = Math.max(34, Math.min(96, 2600 / d));
  box.style.width = box.style.height = size + 'px';
  box.style.left = (projV.x * 0.5 + 0.5) * innerWidth + 'px';
  box.style.top = (-projV.y * 0.5 + 0.5) * innerHeight + 'px';
  $('lockLabel').textContent = lock.locked ? '🔒 LOCK'
    : '◌ ' + Math.round(Math.min(1, lock.t / LOCK_TIME) * 100) + '%';
}

// flashing warning + tone while any missile is chasing us
let warnBeep = 0;
function updateMissileWarning(dt) {
  let incoming = false;
  for (const m of combat.missiles) {
    if (m.target && m.target.id === 'me' && m.mesh.position.distanceTo(state.pos) < 220) {
      incoming = true;
      break;
    }
  }
  const el = $('mslWarn');
  el.classList.toggle('hidden', !incoming || state.crashed);
  if (incoming && !state.crashed) {
    warnBeep -= dt;
    if (warnBeep <= 0) { sfx('warn'); warnBeep = 0.3; }
  }
}

function updateAimUI(dt) {
  // steering reticle dot follows the virtual stick
  if (input.mouse && input.mouse.locked) {
    const R = Math.min(innerWidth, innerHeight) * 0.22;
    $('mfDot').style.transform =
      `translate(${input.mouse.x * R}px, ${input.mouse.y * R}px)`;
  }
  // control hint
  const hint = $('mfHint');
  if (IS_TOUCH || !state.flying || menuOpen) hint.classList.add('hidden');
  else {
    hint.classList.remove('hidden');
    hint.textContent = input.mouse.locked
      ? '🖱 LMB guns · RMB missile · F bomb · wheel throttle · MMB center · Esc release'
      : '🖱 click for mouse flight';
  }

  const pip = $('leadPip'), arrow = $('tgtArrow');
  if (mode === 'free' || !state.flying || state.crashed) {
    pip.classList.add('hidden');
    arrow.classList.add('hidden');
    return;
  }

  // the locked target wins; otherwise the nearest living enemy
  let best = null, bestD = 1e9;
  for (const t of combat.targets) {
    if (t.id === 'me' || !t.alive) continue;
    const d = t.pos.distanceTo(state.pos);
    trackEnemyVel(t.id, t.pos, dt);
    if (d < bestD) { best = t; bestD = d; }
  }
  if (lock.target) {
    const lt = combat.targets.find(t => t.id === lock.target.id);
    if (lt && lt.alive) { best = lt; bestD = lt.pos.distanceTo(state.pos); }
  }
  if (!best || bestD > 450) {
    pip.classList.add('hidden');
    arrow.classList.add('hidden');
    return;
  }

  // lead point: aim here and your bullets arrive where they will be
  const vel = enemyVel.get(best.id).vel;
  const tof = bestD / (GUN_SPEED + state.speed);
  projV.copy(best.pos).addScaledVector(vel, tof);
  const inFront = tmpV.copy(projV).sub(camera.position)
    .dot(tmpV2Aim.set(0, 0, -1).applyQuaternion(camera.quaternion)) > 0;
  projV.project(camera);
  const onScreen = inFront && Math.abs(projV.x) < 1 && Math.abs(projV.y) < 1;

  if (onScreen) {
    pip.classList.remove('hidden');
    arrow.classList.add('hidden');
    pip.style.left = (projV.x * 0.5 + 0.5) * innerWidth + 'px';
    pip.style.top = (-projV.y * 0.5 + 0.5) * innerHeight + 'px';
    pip.innerHTML = `◇<small>${Math.round(bestD * 0.6)} km</small>`;
  } else {
    // clamp to the screen edge, flipped if the target is behind us
    pip.classList.add('hidden');
    arrow.classList.remove('hidden');
    let ax = projV.x, ay = projV.y;
    if (!inFront) { ax = -ax; ay = -ay; }
    const len = Math.hypot(ax, ay) || 1;
    ax /= len; ay /= len;
    const ex = innerWidth / 2 + ax * innerWidth * 0.42;
    const ey = innerHeight / 2 - ay * innerHeight * 0.40;
    const ang = Math.atan2(-ay, ax);
    arrow.style.left = ex + 'px';
    arrow.style.top = ey + 'px';
    arrow.style.transform = `translate(-50%, -50%) rotate(${ang}rad)`;
  }
}
const tmpV2Aim = new THREE.Vector3();

// ---------------------------------------------------------------- combat HUD
let sbTimer = 0;
function updateCombatHUD() {
  const hpFill = $('hpFill');
  hpFill.style.width = Math.max(0, state.hp / state.hpMax * 100) + '%';
  hpFill.classList.toggle('low', state.hp / state.hpMax < 0.35);
  $('ultraFill').style.width = state.ultra + '%';
  $('heatFill').style.width = Math.round(state.heat * 100) + '%';
  $('heatFill').style.background = state.overheat ? '#ff3415' : '#ff7b24';
  $('bombReady').classList.toggle('cooling', state.bombCool > 0);
  const mc = $('mslCount');
  mc.textContent = '🚀' + state.msl;
  mc.classList.toggle('empty', state.msl <= 0 || state.mslCool > 0);
  $('ultraHint').textContent = state.ultra >= 100 ? '🌟 ULTRA READY — G'
    : state.overheat ? '🔥 GUNS OVERHEATED' : '';
  if (sbOpen && ++sbTimer % 30 === 0) renderScoreboard();
}

// build the planet, then unlock the menu
setTimeout(() => {
  W.buildEarth();
  W.initCities();
  W.initAirports();
  buildMinimapBase();
  initSpace();
  buildMenu();
  $('loading').classList.add('hidden');
  $('menuBody').classList.remove('hidden');
}, 50);

requestAnimationFrame(loop);

// tiny debug/automation handle (used by headless tests)
window.__bw = { state, cloudData, THREE, npcs, combat, bots, scores, get net() { return net; }, get mode() { return mode; } };
