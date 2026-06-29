// planes.js — twelve blocky aircraft (eleven planes + a helicopter), built
// from boxes. Forward is -Z.
import * as THREE from 'three';

const mats = new Map();
// while a plane is being built, garage paint remaps its stock hexes
let paintRemap = null;
function M(hex) {
  if (paintRemap && paintRemap.has(hex)) hex = paintRemap.get(hex);
  if (!mats.has(hex)) mats.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
  return mats.get(hex);
}

// add a box: center (x,y,z), size (w,h,d)
function B(g, hex, x, y, z, w, h, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(hex));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

function prop(g, hex, x, y, z, r = 0.9) {
  const p = new THREE.Group();
  B(p, hex, 0, 0, 0, 0.12, r * 2, 0.08);
  B(p, hex, 0, 0, 0, r * 2, 0.12, 0.08);
  p.position.set(x, y, z);
  g.add(p);
  g.userData.props.push(p);
  return p;
}

// stats: maxSpeed/minSpeed (blocks/s), accel, pitch/roll/yaw (rad/s), turn
// (bank-to-turn factor), water (can land on water), hp (combat health).
// Takeoff & landing envelope, per airframe:
//   vr    — rotation speed: pull up above this on the roll to lift off
//   vland — max safe touchdown speed
//   vsink — max safe descent rate at touchdown (blocks/s)
//   rough — true: lands on grass/dirt; false: needs a paved runway
//   ceil  — service ceiling (blocks): thin air drags it back down above this
//   winch — unpowered: full throttle on the ground hooks a winch launch
//   heli  — VTOL: throttle is collective, tilt to translate, lands anywhere
// paint: the stock hexes the garage can recolor (primary/secondary).
// guns: muzzle hardpoints in local space (forward is -Z).
export const PLANES = [
  {
    id: 'biplane', name: 'Bumble Biplane', emoji: '🐝',
    desc: 'Slow, forgiving double-decker. Great for sightseeing.',
    stats: { maxSpeed: 28, minSpeed: 7, accel: 9, pitch: 1.5, roll: 2.1, yaw: 0.9, turn: 0.95, water: false, hp: 85, vr: 9, vland: 16, vsink: 9, rough: true, ceil: 95 },
    paint: { primary: 0xf2c818, secondary: 0xe5e9ef },
    guns: [[-1.0, -0.12, -0.6], [1.0, -0.12, -0.6]],
    build(g) {
      B(g, 0xf2c818, 0, 0, 0.2, 0.6, 0.6, 2.4);
      B(g, 0x333333, 0, 0, -1.1, 0.55, 0.55, 0.4);
      B(g, 0xe5e9ef, 0, 0.62, -0.4, 3.4, 0.12, 0.8);  // top wing
      B(g, 0xe5e9ef, 0, -0.12, -0.4, 3.4, 0.12, 0.8); // bottom wing
      B(g, 0x9a6b2f, 1.3, 0.25, -0.4, 0.1, 0.65, 0.1);
      B(g, 0x9a6b2f, -1.3, 0.25, -0.4, 0.1, 0.65, 0.1);
      B(g, 0xf2c818, 0, 0.45, 1.35, 0.12, 0.7, 0.5);  // fin
      B(g, 0xf2c818, 0, 0.2, 1.35, 1.5, 0.1, 0.5);    // tailplane
      B(g, 0x333333, 0, -0.55, -0.5, 0.12, 0.4, 0.12);
      B(g, 0x333333, 0.5, -0.55, -0.5, 0.5, 0.12, 0.12);
      prop(g, 0x8a5a22, 0, 0, -1.35, 0.8);
    },
  },
  {
    id: 'bush', name: 'Bush Hopper', emoji: '🌲',
    desc: 'High-wing prop plane. Lands anywhere (almost).',
    stats: { maxSpeed: 34, minSpeed: 8, accel: 11, pitch: 1.4, roll: 1.9, yaw: 0.8, turn: 0.9, water: false, hp: 95, vr: 10, vland: 18, vsink: 11, rough: true, ceil: 120 },
    paint: { primary: 0xd23c2a, secondary: 0xffffff },
    guns: [[-0.9, 0.42, -0.7], [0.9, 0.42, -0.7]],
    build(g) {
      B(g, 0xd23c2a, 0, 0, 0.1, 0.62, 0.62, 2.6);
      B(g, 0xffffff, 0, 0.1, -0.9, 0.64, 0.45, 0.7);
      B(g, 0xffffff, 0, 0.42, -0.2, 3.8, 0.12, 0.9);   // high wing
      B(g, 0xd23c2a, 0, 0.5, 1.45, 0.12, 0.8, 0.55);
      B(g, 0xd23c2a, 0, 0.15, 1.45, 1.7, 0.1, 0.5);
      B(g, 0x222222, 0.45, -0.5, -0.6, 0.14, 0.4, 0.14);
      B(g, 0x222222, -0.45, -0.5, -0.6, 0.14, 0.4, 0.14);
      prop(g, 0x444444, 0, 0, -1.45, 0.85);
    },
  },
  {
    id: 'warhawk', name: 'Warhawk', emoji: '🪖',
    desc: 'WWII fighter. Fast rolls, shark teeth optional.',
    stats: { maxSpeed: 55, minSpeed: 13, accel: 18, pitch: 1.9, roll: 2.8, yaw: 1.0, turn: 1.1, water: false, hp: 110, vr: 16, vland: 24, vsink: 8, rough: true, ceil: 180 },
    paint: { primary: 0x5a6b3a, secondary: 0x46552c },
    guns: [[-1.2, -0.05, -0.8], [1.2, -0.05, -0.8]],
    build(g) {
      B(g, 0x5a6b3a, 0, 0, 0.1, 0.62, 0.62, 3.0);
      B(g, 0x46552c, 0, 0.05, -1.45, 0.55, 0.5, 0.5);
      B(g, 0x88a0ff, 0, 0.45, -0.2, 0.45, 0.3, 0.8);   // canopy
      B(g, 0x5a6b3a, 0, -0.05, -0.3, 3.4, 0.13, 1.0);
      B(g, 0x5a6b3a, 0, 0.45, 1.55, 0.12, 0.7, 0.5);
      B(g, 0x5a6b3a, 0, 0.15, 1.55, 1.5, 0.1, 0.45);
      B(g, 0xd9d9d9, 0, -0.1, -1.78, 0.3, 0.3, 0.15);
      prop(g, 0x222222, 0, -0.05, -1.88, 1.0);
    },
  },
  {
    id: 'jet', name: 'Falcon Jet', emoji: '⚡',
    desc: 'Supersonic-ish fighter. Twitchy and quick.',
    stats: { maxSpeed: 95, minSpeed: 22, accel: 32, pitch: 2.2, roll: 3.4, yaw: 1.1, turn: 1.25, water: false, hp: 100, vr: 26, vland: 34, vsink: 8, rough: false, ceil: 320 },
    paint: { primary: 0x9aa3ad, secondary: 0x3a72c8 },
    guns: [[-0.5, 0, -1.9], [0.5, 0, -1.9]],
    build(g) {
      B(g, 0x9aa3ad, 0, 0, 0, 0.55, 0.5, 3.4);
      B(g, 0x70787f, 0, 0, -1.85, 0.4, 0.35, 0.6);     // nose
      B(g, 0x3a72c8, 0, 0.35, -0.9, 0.4, 0.25, 0.9);   // canopy
      B(g, 0x9aa3ad, 0, 0, 0.6, 2.9, 0.12, 1.3);       // delta-ish wing
      B(g, 0x9aa3ad, 0.45, 0.45, 1.5, 0.1, 0.75, 0.6); // twin tails
      B(g, 0x9aa3ad, -0.45, 0.45, 1.5, 0.1, 0.75, 0.6);
      B(g, 0x9aa3ad, 0, 0.05, 1.6, 1.6, 0.1, 0.5);
      B(g, 0xff7b24, 0, 0, 1.85, 0.4, 0.35, 0.2);      // burner
    },
  },
  {
    id: 'heli', name: 'Hover Hornet', emoji: '🚁',
    desc: 'Helicopter. Throttle is collective — hover, climb, land anywhere.',
    stats: {
      maxSpeed: 26, minSpeed: 0, accel: 16, pitch: 1.5, roll: 1.7, yaw: 1.7, turn: 0.6,
      water: false, hp: 130, heli: true, climb: 12, vr: 0, vland: 10, vsink: 8, rough: true, ceil: 150,
    },
    paint: { primary: 0x2f6e3e, secondary: 0xd9d9d9 },
    guns: [[-1.05, -0.25, -0.8], [1.05, -0.25, -0.8]],
    build(g) {
      B(g, 0x2f6e3e, 0, 0, -0.2, 1.0, 0.85, 2.2);          // cabin
      B(g, 0x88a0ff, 0, 0.05, -1.35, 0.8, 0.55, 0.5);      // glass nose
      B(g, 0x2f6e3e, 0, 0.18, 1.4, 0.34, 0.34, 1.8);       // tail boom
      B(g, 0x2f6e3e, 0, 0.62, 2.35, 0.1, 0.75, 0.5);       // tail fin
      B(g, 0xd9d9d9, 0, 0.55, -0.2, 0.3, 0.22, 0.3);       // rotor mast
      B(g, 0xd9d9d9, -1.05, -0.25, -0.4, 0.26, 0.26, 1.0); // rocket pods
      B(g, 0xd9d9d9, 1.05, -0.25, -0.4, 0.26, 0.26, 1.0);
      B(g, 0x222222, -0.45, -0.62, -0.8, 0.08, 0.32, 0.08); // skid struts
      B(g, 0x222222, 0.45, -0.62, -0.8, 0.08, 0.32, 0.08);
      B(g, 0x222222, -0.45, -0.62, 0.5, 0.08, 0.32, 0.08);
      B(g, 0x222222, 0.45, -0.62, 0.5, 0.08, 0.32, 0.08);
      B(g, 0x222222, -0.45, -0.8, -0.15, 0.1, 0.08, 2.2);   // skids
      B(g, 0x222222, 0.45, -0.8, -0.15, 0.1, 0.08, 2.2);
      // rotors spin via userData.props (rotation.z), tilted into place:
      // main disc faces up, tail disc faces sideways
      const main = prop(g, 0x333333, 0, 0.72, -0.2, 2.4);
      main.rotation.x = -Math.PI / 2;
      const tail = prop(g, 0x333333, 0.14, 0.62, 2.5, 0.55);
      tail.rotation.y = Math.PI / 2;
    },
  },
  {
    id: 'airliner', name: 'Sky Liner 747', emoji: '🛫',
    desc: 'Heavy jumbo jet. Stately, stable, slow to turn.',
    stats: { maxSpeed: 72, minSpeed: 20, accel: 14, pitch: 0.85, roll: 1.0, yaw: 0.5, turn: 0.7, water: false, hp: 170, vr: 24, vland: 30, vsink: 6, rough: false, ceil: 280 },
    paint: { primary: 0xf4f7fa, secondary: 0x2a5fa8 },
    guns: [[-1.4, -0.15, -1.0], [1.4, -0.15, -1.0]],
    build(g) {
      B(g, 0xf4f7fa, 0, 0, 0, 0.95, 0.95, 5.4);
      B(g, 0xf4f7fa, 0, 0.55, -1.6, 0.8, 0.5, 1.6);    // hump
      B(g, 0x2a5fa8, 0, 0, -2.85, 0.8, 0.8, 0.4);      // nose
      B(g, 0xd7dde4, 0, -0.15, 0.3, 5.6, 0.16, 1.4);   // wings
      B(g, 0x2a5fa8, 0, 0.85, 2.45, 0.14, 1.2, 0.8);   // tail fin
      B(g, 0xd7dde4, 0, 0.3, 2.5, 2.2, 0.12, 0.6);
      B(g, 0x55606b, 1.4, -0.42, -0.1, 0.42, 0.42, 0.9);
      B(g, 0x55606b, -1.4, -0.42, -0.1, 0.42, 0.42, 0.9);
      B(g, 0x55606b, 2.3, -0.38, 0.35, 0.4, 0.4, 0.85);
      B(g, 0x55606b, -2.3, -0.38, 0.35, 0.4, 0.4, 0.85);
    },
  },
  {
    id: 'cargo', name: 'Herc Cargo', emoji: '📦',
    desc: 'Four props, fat belly. Hauls anything, slowly.',
    stats: { maxSpeed: 52, minSpeed: 15, accel: 12, pitch: 0.95, roll: 1.1, yaw: 0.6, turn: 0.75, water: false, hp: 155, vr: 18, vland: 26, vsink: 9, rough: true, ceil: 220 },
    paint: { primary: 0x6b7d5a, secondary: 0x5a6b4a },
    guns: [[-1.1, 0.45, -1.4], [1.1, 0.45, -1.4]],
    build(g) {
      B(g, 0x6b7d5a, 0, 0, 0, 1.1, 1.0, 4.6);
      B(g, 0x5a6b4a, 0, 0.1, -2.5, 0.9, 0.8, 0.5);
      B(g, 0x6b7d5a, 0, 0.55, -0.6, 5.2, 0.16, 1.1);   // high wing
      B(g, 0x6b7d5a, 0, 0.8, 2.05, 0.14, 1.1, 0.7);
      B(g, 0x6b7d5a, 0, 0.85, 2.1, 2.4, 0.12, 0.6);    // high tail
      B(g, 0x4a5a3c, 1.1, 0.45, -0.8, 0.4, 0.4, 0.9);
      B(g, 0x4a5a3c, -1.1, 0.45, -0.8, 0.4, 0.4, 0.9);
      B(g, 0x4a5a3c, 2.1, 0.45, -0.75, 0.38, 0.38, 0.85);
      B(g, 0x4a5a3c, -2.1, 0.45, -0.75, 0.38, 0.38, 0.85);
      prop(g, 0x222222, 1.1, 0.45, -1.3, 0.55);
      prop(g, 0x222222, -1.1, 0.45, -1.3, 0.55);
      prop(g, 0x222222, 2.1, 0.45, -1.22, 0.5);
      prop(g, 0x222222, -2.1, 0.45, -1.22, 0.5);
    },
  },
  {
    id: 'seaplane', name: 'Pelican Seaplane', emoji: '🌊',
    desc: 'Floats! The only plane that can land on water.',
    stats: { maxSpeed: 36, minSpeed: 9, accel: 11, pitch: 1.3, roll: 1.7, yaw: 0.8, turn: 0.9, water: true, hp: 95, vr: 11, vland: 18, vsink: 10, rough: true, ceil: 110 },
    paint: { primary: 0x3aa0d8, secondary: 0xffffff },
    guns: [[-1.0, 0.6, -0.7], [1.0, 0.6, -0.7]],
    build(g) {
      B(g, 0x3aa0d8, 0, 0.1, 0.1, 0.7, 0.65, 2.8);
      B(g, 0xffffff, 0, 0.2, -1.0, 0.72, 0.5, 0.8);
      B(g, 0xffffff, 0, 0.6, -0.2, 3.9, 0.13, 0.95);
      B(g, 0x3aa0d8, 0, 0.65, 1.5, 0.12, 0.8, 0.55);
      B(g, 0xffffff, 0, 0.35, 1.5, 1.7, 0.1, 0.5);
      B(g, 0xe8e8e8, 0.7, -0.5, -0.3, 0.3, 0.25, 2.4); // floats
      B(g, 0xe8e8e8, -0.7, -0.5, -0.3, 0.3, 0.25, 2.4);
      B(g, 0x666666, 0.7, -0.25, -0.6, 0.12, 0.3, 0.12);
      B(g, 0x666666, -0.7, -0.25, -0.6, 0.12, 0.3, 0.12);
      prop(g, 0x444444, 0, 0.15, -1.5, 0.85);
    },
  },
  {
    id: 'glider', name: 'Whisper Glider', emoji: '🕊',
    desc: 'No engine — trade altitude for speed. Ride the sky.',
    stats: { maxSpeed: 38, minSpeed: 5, accel: 0.8, pitch: 1.3, roll: 1.6, yaw: 0.7, turn: 0.95, water: false, hp: 70, vr: 7, vland: 14, vsink: 8, rough: true, ceil: 200, winch: true },
    paint: { primary: 0xfafafa, secondary: 0xf2542d },
    guns: [[-0.8, 0.1, -0.9], [0.8, 0.1, -0.9]],
    build(g) {
      B(g, 0xfafafa, 0, 0, 0.3, 0.42, 0.42, 3.0);
      B(g, 0x88a0ff, 0, 0.28, -0.7, 0.36, 0.25, 0.9);
      B(g, 0xfafafa, 0, 0.1, -0.3, 6.4, 0.1, 0.65);    // looong wings
      B(g, 0xf2542d, 2.9, 0.1, -0.3, 0.6, 0.12, 0.66); // wingtips
      B(g, 0xf2542d, -2.9, 0.1, -0.3, 0.6, 0.12, 0.66);
      B(g, 0xfafafa, 0, 0.5, 1.7, 0.1, 0.85, 0.45);
      B(g, 0xfafafa, 0, 0.85, 1.75, 1.4, 0.08, 0.4);   // T-tail
    },
  },
  {
    id: 'stunt', name: 'Aero Ace', emoji: '🎪',
    desc: 'Aerobatic monster — rolls like a drum solo.',
    stats: { maxSpeed: 48, minSpeed: 9, accel: 20, pitch: 2.6, roll: 4.2, yaw: 1.4, turn: 1.3, water: false, hp: 95, vr: 12, vland: 20, vsink: 10, rough: true, ceil: 170 },
    paint: { primary: 0xe22929, secondary: 0xffffff },
    guns: [[-1.0, -0.05, -0.7], [1.0, -0.05, -0.7]],
    build(g) {
      B(g, 0xe22929, 0, 0, 0.1, 0.55, 0.55, 2.5);
      B(g, 0xffffff, 0, 0, -0.6, 0.57, 0.57, 0.5);
      B(g, 0xe22929, 0, 0, -1.2, 0.5, 0.5, 0.5);
      B(g, 0xffffff, 0, -0.05, -0.2, 3.2, 0.12, 0.85);
      B(g, 0xe22929, 1.2, -0.05, -0.2, 0.8, 0.13, 0.86);
      B(g, 0xe22929, -1.2, -0.05, -0.2, 0.8, 0.13, 0.86);
      B(g, 0xe22929, 0, 0.45, 1.3, 0.12, 0.75, 0.5);
      B(g, 0xffffff, 0, 0.15, 1.3, 1.5, 0.1, 0.45);
      prop(g, 0x222222, 0, 0, -1.5, 0.9);
    },
  },
  {
    id: 'concorde', name: 'Comet SST', emoji: '🚀',
    desc: 'Supersonic dart. The fastest thing in the sky.',
    stats: { maxSpeed: 130, minSpeed: 30, accel: 28, pitch: 1.2, roll: 1.8, yaw: 0.6, turn: 0.85, water: false, hp: 110, vr: 34, vland: 40, vsink: 7, rough: false, ceil: 420 },
    paint: { primary: 0xf7f7fb, secondary: 0x444c55 },
    guns: [[-0.6, 0, -2.6], [0.6, 0, -2.6]],
    build(g) {
      B(g, 0xf7f7fb, 0, 0, 0.2, 0.5, 0.55, 5.2);
      B(g, 0xf7f7fb, 0, -0.08, -2.95, 0.35, 0.35, 0.8); // drooped nose
      B(g, 0xf7f7fb, 0, 0, 1.4, 1.4, 0.14, 2.4);        // stepped delta wing
      B(g, 0xf7f7fb, 0, 0, 2.1, 2.6, 0.14, 1.1);
      B(g, 0xf7f7fb, 0, 0, 0.6, 0.9, 0.14, 1.4);
      B(g, 0x444c55, 0.75, -0.2, 1.9, 0.5, 0.3, 1.0);   // engine boxes
      B(g, 0x444c55, -0.75, -0.2, 1.9, 0.5, 0.3, 1.0);
      B(g, 0xf7f7fb, 0, 0.55, 2.5, 0.12, 1.0, 0.9);     // fin
    },
  },
  {
    id: 'shuttle', name: 'Astro Shuttle', emoji: '🛰',
    desc: 'Rocket spaceplane. Climb past the sky into orbit.',
    stats: { maxSpeed: 240, minSpeed: 14, accel: 55, pitch: 1.5, roll: 2.2, yaw: 0.8, turn: 1.0, water: false, space: true, hp: 125, vr: 40, vland: 45, vsink: 10, rough: false, ceil: 2400 },
    paint: { primary: 0xf2f2f6, secondary: 0x222228 },
    guns: [[-0.7, 0, -2.4], [0.7, 0, -2.4]],
    build(g) {
      B(g, 0xf2f2f6, 0, 0, 0.2, 0.7, 0.65, 4.6);        // fuselage
      B(g, 0x222228, 0, -0.05, -2.5, 0.55, 0.5, 0.6);   // black nose cap
      B(g, 0x222228, 0, -0.36, 0.2, 0.74, 0.1, 4.4);    // black belly tiles
      B(g, 0xf2f2f6, 0, 0, 1.6, 3.0, 0.16, 1.6);        // delta wing
      B(g, 0xf2f2f6, 0, 0, 0.7, 1.6, 0.15, 1.4);
      B(g, 0x3a4754, 0, 0.3, -1.6, 0.5, 0.3, 0.8);      // cockpit glass
      B(g, 0xf2f2f6, 0, 0.8, 2.2, 0.16, 1.4, 1.0);      // big fin
      B(g, 0x55504a, 0.32, -0.05, 2.55, 0.42, 0.42, 0.5); // engine bells
      B(g, 0x55504a, -0.32, -0.05, 2.55, 0.42, 0.42, 0.5);
      B(g, 0x55504a, 0, 0.32, 2.55, 0.42, 0.42, 0.5);
      B(g, 0xff7b24, 0, 0.08, 2.85, 0.95, 0.95, 0.12);  // exhaust glow
    },
  },
];

// Concatenate same-attribute indexed geometries (BoxGeometry: position + normal,
// uv dropped) into one BufferGeometry. A self-contained mini mergeGeometries so
// we don't pull in the three addons bundle.
function mergeGeos(geos) {
  let vCount = 0, iCount = 0;
  for (const g of geos) { vCount += g.attributes.position.count; iCount += g.index.count; }
  const pos = new Float32Array(vCount * 3);
  const nrm = new Float32Array(vCount * 3);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    nrm.set(g.attributes.normal.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  merged.setIndex(new THREE.BufferAttribute(idx, 1));
  return merged;
}

// Collapse the plane's static body boxes into one merged mesh per material so a
// plane draws in a handful of calls instead of ~20. Spinning props (Groups in
// userData.props) are left untouched so they keep rotating.
//
// NOTE: only safe for planes that never break into per-box debris. The local
// player's plane is NEVER merged — explodePlane() in main.js scatters its
// individual box meshes on a crash. Remotes and bots just boom + vanish, so
// they merge freely.
function collapseBody(g) {
  const bodies = g.children.filter(c => c.isMesh);
  if (bodies.length < 2) return;
  const byMat = new Map();
  for (const m of bodies) {
    m.updateMatrix();
    const geo = m.geometry.clone().applyMatrix4(m.matrix);
    geo.deleteAttribute('uv'); // unused by MeshLambert without a texture map
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material).push(geo);
  }
  for (const m of bodies) { g.remove(m); m.geometry.dispose(); }
  for (const [mat, geos] of byMat) {
    g.add(new THREE.Mesh(mergeGeos(geos), mat));
    geos.forEach(x => x.dispose());
  }
}

// paint: { primary?, secondary? } hex overrides from the garage.
// merge: collapse static boxes for fewer draw calls — ONLY for planes that
// never spawn per-box debris (remotes, bots). Never pass true for the local
// player's plane or its crash break-up loses the individual voxels.
export function buildPlaneMesh(def, paint, merge = false) {
  const g = new THREE.Group();
  g.userData.props = [];
  if (paint && def.paint) {
    paintRemap = new Map();
    if (paint.primary != null) paintRemap.set(def.paint.primary, paint.primary);
    if (paint.secondary != null) paintRemap.set(def.paint.secondary, paint.secondary);
  }
  def.build(g);
  paintRemap = null;
  if (merge) collapseBody(g);
  return g;
}

export function planeById(id) {
  return PLANES.find(p => p.id === id) || PLANES[3];
}
