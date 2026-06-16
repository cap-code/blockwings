// garage.js — paint shop + upgrade bay, with a live rotating 3D preview.
//
// Per-plane customization persists in localStorage:
//   { primary, secondary, eng, arm, gun }
// Upgrades draw from a shared pool of UPG_POINTS per plane.
import * as THREE from 'three';
import { buildPlaneMesh } from './planes.js';

const KEY = 'bw.garage.v1';
export const UPG_MAX = 3, UPG_POINTS = 6;

let store = {};
try { store = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { store = {}; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode */ } }

export function garageFor(id) {
  if (!store[id]) store[id] = { primary: null, secondary: null, eng: 0, arm: 0, gun: 0 };
  return store[id];
}

// stats after garage upgrades — what the flight model & combat actually use
export function combatStats(def) {
  const g = garageFor(def.id), st = def.stats;
  return {
    ...st,
    maxSpeed: st.maxSpeed * (1 + 0.05 * g.eng),
    accel: st.accel * (1 + 0.09 * g.eng),
    hp: Math.round(st.hp * (1 + 0.16 * g.arm)),
    gunDmg: Math.round(6 * (1 + 0.22 * g.gun)),
    gunRate: 8 * (1 + 0.15 * g.gun),
  };
}

export function paintFor(def) {
  const g = garageFor(def.id);
  if (g.primary == null && g.secondary == null) return null;
  return { primary: g.primary ?? def.paint.primary, secondary: g.secondary ?? def.paint.secondary };
}

const PALETTE = [
  0xe22929, 0xf2542d, 0xf2c818, 0x6fe26f, 0x2f9b3f, 0x00b5a3,
  0x3aa0d8, 0x2a5fa8, 0x7a4fd8, 0xff6fb0, 0xf4f7fa, 0x9aa3ad,
  0x444c55, 0x222228, 0x6b4a2a, 0x5a6b3a,
];
const UPGRADES = [
  ['eng', '🚀 ENGINE', 'top speed & acceleration'],
  ['arm', '🛡 ARMOR', 'hit points'],
  ['gun', '🔫 GUNS', 'damage & fire rate'],
];

export class Garage {
  // getDef() -> currently selected plane def; onChange() -> notify menu
  constructor(getDef, onChange) {
    this.getDef = getDef;
    this.onChange = onChange || (() => {});
    this.el = document.getElementById('garage');
    this.open_ = false;
    this.renderer = null;
    this.buildUI();
    document.getElementById('garageClose').addEventListener('click', () => this.close());
  }

  buildUI() {
    const body = document.getElementById('garageBody');
    body.innerHTML = '';

    const mkSwatches = (label, slot) => {
      const row = document.createElement('div');
      row.className = 'gRow';
      row.innerHTML = `<span class="gLbl">${label}</span>`;
      const wrap = document.createElement('div');
      wrap.className = 'swatches';
      const stock = document.createElement('button');
      stock.className = 'swatch stock';
      stock.title = 'stock paint';
      stock.textContent = '↺';
      stock.addEventListener('click', () => {
        garageFor(this.getDef().id)[slot] = null;
        save(); this.refresh();
      });
      wrap.appendChild(stock);
      for (const hex of PALETTE) {
        const b = document.createElement('button');
        b.className = 'swatch';
        b.style.background = '#' + hex.toString(16).padStart(6, '0');
        b.dataset.hex = hex;
        b.addEventListener('click', () => {
          garageFor(this.getDef().id)[slot] = hex;
          save(); this.refresh();
        });
        wrap.appendChild(b);
      }
      row.appendChild(wrap);
      row.dataset.slot = slot;
      body.appendChild(row);
    };
    mkSwatches('PRIMARY', 'primary');
    mkSwatches('SECONDARY', 'secondary');

    this.ptsEl = document.createElement('div');
    this.ptsEl.className = 'gPoints';
    body.appendChild(this.ptsEl);

    for (const [slot, label, desc] of UPGRADES) {
      const row = document.createElement('div');
      row.className = 'gRow gUpg';
      row.innerHTML =
        `<span class="gLbl">${label}<small>${desc}</small></span>` +
        `<button class="gBtn" data-d="-1">−</button>` +
        `<span class="pips"></span>` +
        `<button class="gBtn" data-d="1">+</button>`;
      row.dataset.slot = slot;
      for (const btn of row.querySelectorAll('.gBtn')) {
        btn.addEventListener('click', () => {
          const g = garageFor(this.getDef().id);
          const d = parseInt(btn.dataset.d, 10);
          const used = g.eng + g.arm + g.gun;
          if (d > 0 && (g[slot] >= UPG_MAX || used >= UPG_POINTS)) return;
          if (d < 0 && g[slot] <= 0) return;
          g[slot] += d;
          save(); this.refresh();
        });
      }
      body.appendChild(row);
    }
  }

  refresh() {
    const def = this.getDef();
    const g = garageFor(def.id);
    document.getElementById('garageTitle').textContent = `${def.emoji} ${def.name}`;
    // swatch selection state
    for (const row of this.el.querySelectorAll('.gRow[data-slot]')) {
      const slot = row.dataset.slot;
      if (row.classList.contains('gUpg')) {
        const pips = row.querySelector('.pips');
        pips.textContent = '●'.repeat(g[slot]) + '○'.repeat(UPG_MAX - g[slot]);
      } else {
        for (const sw of row.querySelectorAll('.swatch')) {
          const sel = sw.classList.contains('stock') ? g[slot] == null : +sw.dataset.hex === g[slot];
          sw.classList.toggle('sel', sel);
        }
      }
    }
    const used = g.eng + g.arm + g.gun;
    this.ptsEl.textContent = `UPGRADE POINTS  ${UPG_POINTS - used} / ${UPG_POINTS} left`;
    // stat readout
    const cs = combatStats(def);
    document.getElementById('garageStats').textContent =
      `SPD ${Math.round(cs.maxSpeed * 10)} km/h · HP ${cs.hp} · GUN ${cs.gunDmg} dmg @ ${cs.gunRate.toFixed(1)}/s`;
    this.rebuildPreview();
    this.onChange();
  }

  // ---------------------------------------------------------------- preview
  initPreview() {
    const cv = document.getElementById('garageView');
    this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(cv.clientWidth, cv.clientHeight, false);
    this.pScene = new THREE.Scene();
    this.pCam = new THREE.PerspectiveCamera(40, cv.clientWidth / cv.clientHeight, 0.1, 100);
    this.pCam.position.set(0, 2.4, 7.5);
    this.pCam.lookAt(0, 0, 0);
    this.pScene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6a7c58, 0.9));
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.3);
    sun.position.set(2, 3, 2);
    this.pScene.add(sun);
    this.pMesh = null;
  }

  rebuildPreview() {
    if (!this.renderer) return;
    if (this.pMesh) this.pScene.remove(this.pMesh);
    this.pMesh = buildPlaneMesh(this.getDef(), paintFor(this.getDef()));
    this.pScene.add(this.pMesh);
  }

  open() {
    this.open_ = true;
    this.el.classList.remove('hidden');
    if (!this.renderer) this.initPreview();
    this.refresh();
    const spin = () => {
      if (!this.open_) return;
      requestAnimationFrame(spin);
      if (this.pMesh) {
        this.pMesh.rotation.y += 0.012;
        this.pMesh.rotation.x = Math.sin(performance.now() / 2400) * 0.1;
      }
      this.renderer.render(this.pScene, this.pCam);
    };
    spin();
  }

  close() {
    this.open_ = false;
    this.el.classList.add('hidden');
    this.onChange();
  }
}
