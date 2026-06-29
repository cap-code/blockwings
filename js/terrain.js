// terrain.js — chunked voxel terrain meshing & streaming around the plane.
import * as THREE from 'three';
import * as W from './world.js';

export const CS = 32; // chunk size in blocks

const SHADE = { top: 1.0, px: 0.72, nx: 0.68, pz: 0.8, nz: 0.62 };

export const landMat = new THREE.MeshLambertMaterial({ vertexColors: true });
export const waterMat = new THREE.MeshLambertMaterial({
  color: 0x2a6fd4, transparent: true, opacity: 0.72, depthWrite: false,
});

export class GeoBuilder {
  constructor() { this.pos = []; this.nrm = []; this.col = []; this.idx = []; this.n = 0; }
  quad(p0, p1, p2, p3, nx, ny, nz, r, g, b) {
    const { pos, nrm, col, idx } = this;
    pos.push(...p0, ...p1, ...p2, ...p3);
    for (let i = 0; i < 4; i++) { nrm.push(nx, ny, nz); col.push(r, g, b); }
    const n = this.n;
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    this.n += 4;
  }
  // axis-aligned box from (x0,y0,z0) to (x1,y1,z1), no bottom face
  box(x0, y0, z0, x1, y1, z1, r, g, b) {
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, r * SHADE.top, g * SHADE.top, b * SHADE.top);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, r * SHADE.px, g * SHADE.px, b * SHADE.px);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, r * SHADE.nx, g * SHADE.nx, b * SHADE.nx);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, r * SHADE.pz, g * SHADE.pz, b * SHADE.pz);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, r * SHADE.nz, g * SHADE.nz, b * SHADE.nz);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

function addTree(gb, x, z, h, type, seed) {
  const t = [0.4, 0.29, 0.16]; // trunk
  if (type === 4) {            // cactus
    gb.box(x + 0.3, h, z + 0.3, x + 0.7, h + 2 + seed * 1.5, z + 0.7, 0.25, 0.55, 0.25);
    return;
  }
  if (type === 5) {            // acacia: flat top
    gb.box(x + 0.35, h, z + 0.35, x + 0.65, h + 3, z + 0.65, ...t);
    gb.box(x - 1.2, h + 3, z - 1.2, x + 2.2, h + 3.8, z + 2.2, 0.45, 0.55, 0.2);
    return;
  }
  if (type === 2) {            // conifer
    const ht = 4 + seed * 2;
    gb.box(x + 0.35, h, z + 0.35, x + 0.65, h + ht, z + 0.65, ...t);
    gb.box(x - 0.9, h + 1.5, z - 0.9, x + 1.9, h + ht * 0.6, z + 1.9, 0.16, 0.34, 0.2);
    gb.box(x - 0.4, h + ht * 0.6, z - 0.4, x + 1.4, h + ht + 0.8, z + 1.4, 0.18, 0.38, 0.22);
    return;
  }
  if (type === 3) {            // jungle / palm: tall
    const ht = 5 + seed * 3;
    gb.box(x + 0.32, h, z + 0.32, x + 0.68, h + ht, z + 0.68, 0.45, 0.36, 0.2);
    gb.box(x - 1.3, h + ht, z - 1.3, x + 2.3, h + ht + 1, z + 2.3, 0.15, 0.5, 0.18);
    return;
  }
  // oak
  const ht = 3 + seed * 1.5;
  gb.box(x + 0.35, h, z + 0.35, x + 0.65, h + ht, z + 0.65, ...t);
  gb.box(x - 1, h + ht - 0.5, z - 1, x + 2, h + ht + 1.8, z + 2, 0.27, 0.5, 0.2);
}

function buildChunk(cx, cz) {
  const bx = cx * CS, bz = cz * CS;
  // sample (CS+2)^2 columns including a 1-block border for side faces
  const cols = new Array((CS + 2) * (CS + 2));
  for (let z = -1; z <= CS; z++) {
    for (let x = -1; x <= CS; x++) {
      const c = W.column(bx + x, bz + z);
      cols[(z + 1) * (CS + 2) + (x + 1)] = {
        h: c.h, water: c.water,
        top: c.top.slice(), side: c.side.slice(),
        tree: c.tree, bld: c.bld, house: c.house,
      };
    }
  }
  const at = (x, z) => cols[(z + 1) * (CS + 2) + (x + 1)];

  const gb = new GeoBuilder();
  const wb = new GeoBuilder();
  const rock = [0.42, 0.4, 0.38];

  for (let z = 0; z < CS; z++) {
    for (let x = 0; x < CS; x++) {
      const c = at(x, z);
      const [r, g, b] = c.top;
      // top face
      gb.quad([x, c.h, z + 1], [x + 1, c.h, z + 1], [x + 1, c.h, z], [x, c.h, z],
        0, 1, 0, r * SHADE.top, g * SHADE.top, b * SHADE.top);
      // exposed side faces toward lower neighbours
      const sides = [
        [at(x + 1, z), [x + 1, 0, z + 1], [x + 1, 0, z], 1, 0, 0, SHADE.px],
        [at(x - 1, z), [x, 0, z], [x, 0, z + 1], -1, 0, 0, SHADE.nx],
        [at(x, z + 1), [x, 0, z + 1], [x + 1, 0, z + 1], 0, 0, 1, SHADE.pz],
        [at(x, z - 1), [x + 1, 0, z], [x, 0, z], 0, 0, -1, SHADE.nz],
      ];
      for (const [nb, pA, pB, nx, ny, nz, sh] of sides) {
        if (nb.h >= c.h) continue;
        const lo = nb.h, hi = c.h;
        const [sr, sg, sb] = c.side;
        // topsoil strip
        const mid = Math.max(lo, hi - 1);
        if (mid < hi) {
          gb.quad([pA[0], mid, pA[2]], [pB[0], mid, pB[2]], [pB[0], hi, pB[2]], [pA[0], hi, pA[2]],
            nx, ny, nz, sr * sh, sg * sh, sb * sh);
        }
        if (lo < mid) {
          gb.quad([pA[0], lo, pA[2]], [pB[0], lo, pB[2]], [pB[0], mid, pB[2]], [pA[0], mid, pA[2]],
            nx, ny, nz, rock[0] * sh, rock[1] * sh, rock[2] * sh);
        }
      }
      // water surface
      if (c.water) {
        wb.quad([x, 0.42, z + 1], [x + 1, 0.42, z + 1], [x + 1, 0.42, z], [x, 0.42, z], 0, 1, 0, 1, 1, 1);
      }
      // decorations
      if (c.tree) addTree(gb, x, z, c.h, c.tree, W.hash2(bx + x, bz + z, 33));
      if (c.bld) {
        const shade = 0.45 + W.hash2(bx + x, bz + z, 41) * 0.35;
        const tint = W.hash2(bx + x, bz + z, 42) * 0.08;
        gb.box(x + 0.06, c.h, z + 0.06, x + 0.94, c.h + c.bld, z + 0.94,
          shade, shade + tint, shade + tint * 2);
      }
      if (c.house) {
        const wpick = W.hash2(bx + x, bz + z, 63);
        const wall = wpick < 0.5 ? [0.85, 0.79, 0.66] : [0.6, 0.45, 0.3];
        const roof = wpick < 0.25 ? [0.42, 0.44, 0.5] : [0.62, 0.27, 0.2];
        gb.box(x + 0.05, c.h, z + 0.05, x + 0.95, c.h + c.house, z + 0.95, ...wall);
        gb.box(x - 0.08, c.h + c.house, z - 0.08, x + 1.08, c.h + c.house + 0.45, z + 1.08, ...roof);
        gb.box(x + 0.18, c.h + c.house + 0.45, z + 0.18, x + 0.82, c.h + c.house + 0.8, z + 0.82, ...roof);
      }
    }
  }

  const group = new THREE.Group();
  const land = new THREE.Mesh(gb.build(), landMat);
  group.add(land);
  if (wb.n > 0) group.add(new THREE.Mesh(wb.build(), waterMat));
  group.position.set(bx, 0, bz);
  return group;
}

export class ChunkManager {
  constructor(scene, radius, budget) {
    this.scene = scene;
    this.radius = radius;
    this.budget = budget;
    this.chunks = new Map(); // "cx,cz" -> Group
  }

  key(cx, cz) { return cx + ',' + cz; }

  // generate everything within r synchronously (spawn)
  pregen(px, pz, r) {
    const ccx = Math.floor(px / CS), ccz = Math.floor(pz / CS);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        this.ensure(ccx + dx, ccz + dz);
      }
    }
  }

  ensure(cx, cz) {
    const k = this.key(cx, cz);
    if (this.chunks.has(k)) return false;
    const g = buildChunk(cx, cz);
    this.chunks.set(k, g);
    this.scene.add(g);
    return true;
  }

  update(px, pz, fx, fz) {
    const R = this.radius;
    const ccx = Math.floor(px / CS), ccz = Math.floor(pz / CS);
    // queue missing chunks, nearest + ahead-of-plane first
    const want = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > R * R) continue;
        const cx = ccx + dx, cz = ccz + dz;
        if (this.chunks.has(this.key(cx, cz))) continue;
        const ahead = (dx * fx + dz * fz);
        want.push([dx * dx + dz * dz - ahead * 2.5, cx, cz]);
      }
    }
    want.sort((a, b) => a[0] - b[0]);
    // Build nearest-first, but stop once this frame's time budget is spent so a
    // burst of missing chunks can't stall a frame and jolt the camera. `budget`
    // stays a hard ceiling; ~4 ms keeps us comfortably inside a 60 fps frame.
    let made = 0;
    const t0 = performance.now();
    for (const [, cx, cz] of want) {
      this.ensure(cx, cz);
      if (++made >= this.budget) break;
      if (performance.now() - t0 > 4) break;
    }
    // drop far chunks
    const drop = (R + 3) * (R + 3);
    for (const [k, g] of this.chunks) {
      const [cx, cz] = k.split(',').map(Number);
      const dx = cx - ccx, dz = cz - ccz;
      if (dx * dx + dz * dz > drop) {
        this.scene.remove(g);
        g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
        this.chunks.delete(k);
      }
    }
  }

  // shift everything by -WORLD_W when the player laps the planet
  shiftWorld(dxBlocks) {
    const dc = dxBlocks / CS;
    const next = new Map();
    for (const [k, g] of this.chunks) {
      const [cx, cz] = k.split(',').map(Number);
      g.position.x += dxBlocks;
      next.set(this.key(cx + dc, cz), g);
    }
    this.chunks = next;
  }

  clear() {
    for (const [, g] of this.chunks) {
      this.scene.remove(g);
      g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    this.chunks.clear();
  }
}
