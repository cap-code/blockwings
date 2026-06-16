// combat.js — guns, bombs, homing missiles, explosions and damage routing.
//
// The Combat instance owns every projectile in the world. Damage is routed
// through `onHit(targetId, dmg, ownerId, kind)` so the caller decides what a
// hit means (apply to a bot, report to the server, hurt the player...).
// Projectiles spawned with live=false are cosmetic only (remote players'
// fire is replayed locally but the shooter's client is authoritative).
import * as THREE from 'three';
import * as W from './world.js';

export const GUN_SPEED = 170;
const GUN_LIFE = 1.4;
export const BOMB_DMG = 95, BOMB_R = 7;
const MISSILE_DMG = 42, MISSILE_TOP = 125;
const MAXB = 320;

const AY = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Vector3();
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
const tmpM = new THREE.Matrix4();

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.onHit = null;        // (targetId, dmg, ownerId, kind)
    this.sfx = null;          // (type) optional sound hook
    this.targets = [];        // [{ id, pos: Vector3, radius, alive }]
    this.bullets = [];
    this.bombs = [];
    this.missiles = [];
    this.fx = [];

    this.tracers = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, 0.16, 2.2),
      new THREE.MeshBasicMaterial({ color: 0xffd76a }),
      MAXB,
    );
    this.tracers.frustumCulled = false;
    this.tracers.count = 0;
    scene.add(this.tracers);

    this.bombGeo = new THREE.BoxGeometry(0.34, 0.34, 0.9);
    this.bombMat = new THREE.MeshLambertMaterial({ color: 0x2c343c });
    this.missileGeo = new THREE.BoxGeometry(0.22, 0.22, 1.2);
    this.missileMat = new THREE.MeshBasicMaterial({ color: 0xe8eef4 });
    this.fxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.fxMats = [
      new THREE.MeshBasicMaterial({ color: 0xff7b24 }),
      new THREE.MeshBasicMaterial({ color: 0xff3415 }),
      new THREE.MeshBasicMaterial({ color: 0xffd76a }),
      new THREE.MeshBasicMaterial({ color: 0x444444 }),
    ];
  }

  // ---------------------------------------------------------------- weapons
  fireGuns(owner, pos, quat, speed, hardpoints, dmg, live = true) {
    for (const hp of hardpoints) {
      if (this.bullets.length >= MAXB) return;
      const p = new THREE.Vector3(hp[0], hp[1], hp[2]).applyQuaternion(quat).add(pos);
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 0.014, (Math.random() - 0.5) * 0.014, -1,
      ).normalize().applyQuaternion(quat).multiplyScalar(GUN_SPEED + speed);
      this.bullets.push({ p, v, life: GUN_LIFE, owner, dmg, live });
    }
    if (owner === 'me' && this.sfx) this.sfx('gun');
  }

  dropBomb(owner, pos, quat, speed, live = true) {
    const mesh = new THREE.Mesh(this.bombGeo, this.bombMat);
    mesh.position.copy(pos);
    mesh.position.y -= 0.9;
    mesh.quaternion.copy(quat);
    this.scene.add(mesh);
    const v = new THREE.Vector3(0, 0, -1).applyQuaternion(quat).multiplyScalar(speed * 0.9);
    this.bombs.push({ mesh, v, owner, live });
  }

  // single lock-on missile (Ace Combat style): hard-homing when fired with a
  // lock, dumb-fire straight ahead without one
  fireMissile(owner, pos, quat, speed, target, live = true) {
    const mesh = new THREE.Mesh(this.missileGeo, this.missileMat);
    mesh.position.copy(pos);
    mesh.position.y -= 0.5;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    this.missiles.push({
      mesh, v: dir.multiplyScalar(Math.max(55, speed + 20)),
      target: target || null,
      life: 6.5, owner, live, trail: 0,
      homing: 4.6, // locked missiles turn harder than ultra swarm missiles
    });
    this.scene.add(mesh);
    if (owner === 'me' && this.sfx) this.sfx('msl');
  }

  fireUltra(owner, pos, quat, live = true) {
    const tgts = this.targets.filter(t => t.alive && t.id !== owner);
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(this.missileGeo, this.missileMat);
      mesh.position.copy(pos);
      mesh.position.y -= 0.4;
      const dir = new THREE.Vector3((i % 2 ? 1 : -1) * (0.2 + i * 0.09), 0.25, -1)
        .normalize().applyQuaternion(quat);
      this.missiles.push({
        mesh, v: dir.multiplyScalar(55),
        target: tgts.length ? tgts[i % tgts.length] : null,
        life: 7, owner, live, trail: 0,
      });
      this.scene.add(mesh);
    }
    if (live && this.sfx) this.sfx('ultra');
  }

  // ---------------------------------------------------------------- booms
  // cosmetic explosion: fire cubes + a flash cube that swells and fades
  boom(pos, r = 4) {
    const n = Math.round(8 + r * 2);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.fxGeo, this.fxMats[i % this.fxMats.length]);
      m.position.copy(pos);
      const s = 0.4 + Math.random() * r * 0.22;
      m.scale.set(s, s, s);
      this.scene.add(m);
      this.fx.push({
        mesh: m, life: 0.7 + Math.random() * 0.7, full: 0.9, base: s,
        v: new THREE.Vector3((Math.random() - 0.5) * r * 4, 2 + Math.random() * r * 2.2, (Math.random() - 0.5) * r * 4),
        grav: 14,
      });
    }
    const flash = new THREE.Mesh(this.fxGeo, this.fxMats[2]);
    flash.position.copy(pos);
    flash.scale.setScalar(r * 0.8);
    this.scene.add(flash);
    this.fx.push({ mesh: flash, life: 0.22, full: 0.22, base: r * 1.8, v: new THREE.Vector3(), grav: 0, swell: true });
    if (this.sfx) this.sfx('boom');
  }

  // explosion with area damage
  explode(pos, r, owner, dmg, live, kind) {
    this.boom(pos, r * 0.75);
    if (!live || !this.onHit) return;
    for (const t of this.targets) {
      if (!t.alive || t.id === owner) continue;
      const d = t.pos.distanceTo(pos);
      if (d < r + t.radius) {
        const f = 1 - d / (r + t.radius);
        this.onHit(t.id, Math.round(dmg * (0.35 + 0.65 * f)), owner, kind);
      }
    }
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    // bullets — segment-vs-sphere so fast rounds can't tunnel through planes
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      tmpV.copy(b.v).multiplyScalar(dt); // this frame's travel
      let dead = b.life <= 0;
      if (!dead && b.live) {
        const seg2 = tmpV.lengthSq() || 1e-9;
        for (const t of this.targets) {
          if (!t.alive || t.id === b.owner) continue;
          tmpV2.copy(t.pos).sub(b.p);
          const u = Math.max(0, Math.min(1, tmpV2.dot(tmpV) / seg2));
          const dx = tmpV2.x - tmpV.x * u, dy = tmpV2.y - tmpV.y * u, dz = tmpV2.z - tmpV.z * u;
          const rr = t.radius + 0.4;
          if (dx * dx + dy * dy + dz * dz < rr * rr) {
            this.onHit && this.onHit(t.id, b.dmg, b.owner, 'gun');
            dead = true;
            break;
          }
        }
      }
      b.p.add(tmpV);
      if (!dead && b.p.y < W.heightAt(b.p.x, b.p.z)) {
        this.boom(b.p, 0.7); // dirt puff
        dead = true;
      }
      if (dead) { this.bullets[i] = this.bullets[this.bullets.length - 1]; this.bullets.pop(); }
    }

    // bombs
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const bm = this.bombs[i];
      bm.v.y -= 24 * dt;
      bm.mesh.position.addScaledVector(bm.v, dt);
      tmpV2.copy(bm.v).normalize();
      tmpM.lookAt(ZERO, tmpV2, AY);
      bm.mesh.quaternion.setFromRotationMatrix(tmpM);
      const p = bm.mesh.position;
      let det = p.y < Math.max(W.heightAt(p.x, p.z), 0.42) + 0.3;
      if (!det && bm.live) {
        for (const t of this.targets) {
          if (!t.alive || t.id === bm.owner) continue;
          if (t.pos.distanceTo(p) < t.radius + 1.4) { det = true; break; }
        }
      }
      if (det) {
        this.scene.remove(bm.mesh);
        this.explode(p, BOMB_R, bm.owner, BOMB_DMG, bm.live, 'bomb');
        this.bombs.splice(i, 1);
      }
    }

    // homing missiles
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt;
      const spd = Math.min(MISSILE_TOP, m.v.length() + 75 * dt);
      if (m.target && m.target.alive) {
        tmpV.copy(m.target.pos).sub(m.mesh.position).normalize();
        tmpV2.copy(m.v).normalize().lerp(tmpV, Math.min(1, (m.homing || 3.4) * dt)).normalize();
        m.v.copy(tmpV2).multiplyScalar(spd);
      } else {
        m.v.setLength(spd);
      }
      const p = m.mesh.position;
      // proximity fuse on this frame's travel segment, so fast missiles
      // can't skip through a plane between frames
      let det = false;
      if (m.live) {
        tmpV.copy(m.v).multiplyScalar(dt);
        const seg2 = tmpV.lengthSq() || 1e-9;
        for (const t of this.targets) {
          if (!t.alive || t.id === m.owner) continue;
          tmpV2.copy(t.pos).sub(p);
          const u = Math.max(0, Math.min(1, tmpV2.dot(tmpV) / seg2));
          const dx = tmpV2.x - tmpV.x * u, dy = tmpV2.y - tmpV.y * u, dz = tmpV2.z - tmpV.z * u;
          const rr = t.radius + 1.4;
          if (dx * dx + dy * dy + dz * dz < rr * rr) {
            this.onHit && this.onHit(t.id, MISSILE_DMG, m.owner, 'msl');
            det = true;
            break;
          }
        }
      }
      p.addScaledVector(m.v, dt);
      tmpV2.copy(m.v).normalize();
      tmpM.lookAt(ZERO, tmpV2, AY);
      m.mesh.quaternion.setFromRotationMatrix(tmpM);
      // smoke trail
      m.trail -= dt;
      if (m.trail <= 0) {
        m.trail = 0.05;
        const s = new THREE.Mesh(this.fxGeo, this.fxMats[3]);
        s.position.copy(p);
        s.scale.setScalar(0.3);
        this.scene.add(s);
        this.fx.push({ mesh: s, life: 0.5, full: 0.5, base: 0.3, v: new THREE.Vector3(), grav: 0 });
      }
      if (!det && (m.life <= 0 || p.y < W.heightAt(p.x, p.z))) det = true;
      if (det) {
        this.scene.remove(m.mesh);
        this.boom(p, 2.6);
        this.missiles.splice(i, 1);
      }
    }

    // fx cubes
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        this.fx[i] = this.fx[this.fx.length - 1];
        this.fx.pop();
        continue;
      }
      f.v.y -= f.grav * dt;
      f.mesh.position.addScaledVector(f.v, dt);
      const t = f.life / f.full;
      f.mesh.scale.setScalar(f.swell ? f.base * (1.6 - t) : f.base * Math.min(1, t * 1.6));
    }

    // tracer instances
    let n = 0;
    for (const b of this.bullets) {
      tmpV.copy(b.p).add(b.v);
      tmpM.lookAt(b.p, tmpV, AY);
      tmpM.setPosition(b.p);
      this.tracers.setMatrixAt(n++, tmpM);
    }
    this.tracers.count = n;
    this.tracers.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const bm of this.bombs) this.scene.remove(bm.mesh);
    for (const m of this.missiles) this.scene.remove(m.mesh);
    for (const f of this.fx) this.scene.remove(f.mesh);
    this.bullets.length = this.bombs.length = this.missiles.length = this.fx.length = 0;
    this.tracers.count = 0;
  }
}

// ---------------------------------------------------------------- name tags
// floating sprite with a callsign + health bar, used for bots & remote players
export function makeNameTag(name, color = '#ffe17a') {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  spr.scale.set(7, 1.75, 1);
  const draw = (hp, max) => {
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 26px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#000';
    ctx.strokeText(name, 128, 28);
    ctx.fillStyle = color;
    ctx.fillText(name, 128, 28);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(48, 38, 160, 12);
    ctx.fillStyle = hp / max > 0.35 ? '#6fe26f' : '#ff5040';
    ctx.fillRect(50, 40, 156 * Math.max(0, hp / max), 8);
    tex.needsUpdate = true;
  };
  draw(1, 1);
  spr.userData.setHP = draw;
  return spr;
}
