// bots.js — AI rival pilots for the offline VS BOTS arena.
//
// Each bot flies a real plane mesh, picks a target (usually you), chases it,
// fires in bursts when lined up, avoids the ground and respawns after dying.
import * as THREE from 'three';
import * as W from './world.js';
import { PLANES, buildPlaneMesh } from './planes.js';
import { makeNameTag, GUN_SPEED } from './combat.js';

const NAMES = ['Maverick', 'Viper', 'Iceman', 'Jester', 'Rooster', 'Phoenix', 'Goose', 'Razor', 'Nova', 'Duke'];
const PAINTS = [
  { primary: 0xe22929, secondary: 0x222228 },
  { primary: 0x2a5fa8, secondary: 0xffd76a },
  { primary: 0x7a4fd8, secondary: 0xf4f7fa },
  { primary: 0x2f9b3f, secondary: 0xf2c818 },
  { primary: 0xff6fb0, secondary: 0x222228 },
  { primary: 0x00b5a3, secondary: 0xf4f7fa },
];
// the fighters bots like to fly
const BOT_PLANES = ['warhawk', 'jet', 'stunt', 'concorde', 'bush'];

const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const ZERO = new THREE.Vector3();
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), rollQ = new THREE.Quaternion();

export class Bots {
  constructor(scene, combat) {
    this.scene = scene;
    this.combat = combat;
    this.list = [];
    this.onKill = null; // (botId, botName, byId)
  }

  spawnAll(n, cx, cz) {
    this.clear();
    for (let i = 0; i < n; i++) {
      const def = PLANES.find(p => p.id === BOT_PLANES[i % BOT_PLANES.length]);
      const b = {
        id: 'bot' + i,
        name: NAMES[i % NAMES.length],
        def,
        mesh: buildPlaneMesh(def, PAINTS[i % PAINTS.length]),
        tag: makeNameTag(NAMES[i % NAMES.length], '#ff9c6a'),
        pos: new THREE.Vector3(),
        quat: new THREE.Quaternion(),
        speed: def.stats.maxSpeed * 0.6,
        hpMax: def.stats.hp,
        hp: def.stats.hp,
        bank: 0,
        targetRef: null,
        retarget: Math.random() * 3,
        fireCool: 0,
        burst: 0,
        mslCool: 8 + Math.random() * 10,
        dead: false,
        respawn: 0,
        lastHitBy: null,
        tPrev: new THREE.Vector3(),  // target's last position, for aim lead
        tVel: new THREE.Vector3(),
      };
      this.place(b, cx, cz);
      this.scene.add(b.mesh);
      this.scene.add(b.tag);
      this.list.push(b);
    }
  }

  place(b, cx, cz) {
    const ang = Math.random() * Math.PI * 2;
    const d = 130 + Math.random() * 160;
    const x = cx + Math.cos(ang) * d, z = cz + Math.sin(ang) * d;
    b.pos.set(x, Math.max(W.heightAt(x, z), W.SEA_Y) + 45 + Math.random() * 50, z);
    b.quat.setFromAxisAngle(AY, Math.random() * Math.PI * 2);
    b.speed = b.def.stats.maxSpeed * 0.6;
    b.hp = b.hpMax;
    b.tag.userData.setHP(b.hp, b.hpMax);
  }

  // hostiles: combat.targets — bots pick anyone alive that isn't themselves,
  // preferring the player ('me')
  update(dt, hostiles, playerPos) {
    for (const b of this.list) {
      if (b.dead) {
        b.respawn -= dt;
        if (b.respawn <= 0) {
          b.dead = false;
          this.place(b, playerPos.x, playerPos.z);
          this.scene.add(b.mesh);
          this.scene.add(b.tag);
        }
        continue;
      }

      // pick / refresh target
      b.retarget -= dt;
      if (b.retarget <= 0 || !b.targetRef || !b.targetRef.alive) {
        const others = hostiles.filter(t => t.alive && t.id !== b.id);
        const me = others.find(t => t.id === 'me');
        b.targetRef = (me && Math.random() < 0.1) ? me
          : others.length ? others[Math.floor(Math.random() * others.length)] : null;
        b.retarget = 4 + Math.random() * 5;
        if (b.targetRef) b.tPrev.copy(b.targetRef.pos);
      }

      // steer toward the target with aim lead, but never into the ground
      const st = b.def.stats;
      let dist = 1e9;
      if (b.targetRef) {
        // estimate target velocity for the firing solution
        tmpV2.copy(b.targetRef.pos).sub(b.tPrev).divideScalar(Math.max(dt, 1e-4));
        b.tVel.lerp(tmpV2, Math.min(1, 6 * dt));
        b.tPrev.copy(b.targetRef.pos);
        dist = b.targetRef.pos.distanceTo(b.pos);
        const lead =  dist / (GUN_SPEED + b.speed);
        tmpV.copy(b.targetRef.pos).addScaledVector(b.tVel, lead).sub(b.pos).normalize();
      } else {
        tmpV.set(0, 0, -1).applyQuaternion(b.quat);
      }
      const gh = W.heightAt(b.pos.x, b.pos.z);
      if (b.pos.y < gh + 20) tmpV.y = Math.max(tmpV.y, 0.65);
      if (b.pos.y > Math.min(230, (st.ceil || 300) - 10)) tmpV.y = Math.min(tmpV.y, -0.2);
      tmpV.normalize();

      tmpM.lookAt(ZERO, tmpV, AY);
      tmpQ.setFromRotationMatrix(tmpM);
      b.quat.rotateTowards(tmpQ, st.turn * 0.85 * dt);

      // throttle: chase hard when far, ease off in knife range
      const want = dist > 130 ? st.maxSpeed * 0.95 : dist < 30 ? st.maxSpeed * 0.55 : st.maxSpeed * 0.72;
      b.speed += (want - b.speed) * Math.min(1, 1.2 * dt);

      tmpV2.set(0, 0, -1).applyQuaternion(b.quat);
      b.pos.addScaledVector(tmpV2, b.speed * dt);

      // crashed into terrain?
      if (b.pos.y < Math.max(W.heightAt(b.pos.x, b.pos.z), 0.42) + 0.6) {
        this.kill(b, b.lastHitBy);
        continue;
      }

      // cosmetic banking proportional to how hard it's turning
      const fwdNow = tmpV2;
      const turn = tmpV.clone().cross(fwdNow).y;
      b.bank += (THREE.MathUtils.clamp(turn * 2.4, -0.9, 0.9) - b.bank) * Math.min(1, 4 * dt);
      rollQ.setFromAxisAngle(AZ, b.bank);
      b.mesh.quaternion.copy(b.quat).multiply(rollQ);
      b.mesh.position.copy(b.pos);
      b.tag.position.copy(b.pos);
      b.tag.position.y += 2.6;
      for (const p of b.mesh.userData.props) p.rotation.z += dt * 30;

      // the occasional lock-on missile when steadily behind a target —
      // gives the player MISSILE warnings to dodge, Ace Combat style
      b.mslCool -= dt;
      if (b.targetRef && b.mslCool <= 0 && dist > 35 && dist < 170) {
        const aimNow = fwdNow.angleTo(tmpV);
        if (aimNow < 0.25) {
          this.combat.fireMissile(b.id, b.pos, b.quat, b.speed, b.targetRef);
          b.mslCool = 11 + Math.random() * 9;
        }
      }

      // gunnery: burst fire when lined up on the lead point and in range
      b.fireCool -= dt;
      if (b.targetRef && dist < 110 && dist > 8) {
        const aim = fwdNow.angleTo(tmpV); // tmpV still holds the lead direction
        if (aim < 0.14 && b.fireCool <= 0) {
          b.burst -= 0.13;
          this.combat.fireGuns(b.id, b.pos, b.quat, b.speed, b.def.guns, 5);
          if (b.burst <= 0) {
            b.fireCool = 1.1 + Math.random() * 1.2; // pause between bursts
            b.burst = 0.8 + Math.random() * 0.6;
          } else {
            b.fireCool = 0.13; // within a burst
          }
        }
      }
    }
  }

  damage(id, dmg, by) {
    const b = this.list.find(b => b.id === id);
    if (!b || b.dead) return;
    b.hp -= dmg;
    b.lastHitBy = by;
    b.tag.userData.setHP(b.hp, b.hpMax);
    if (b.hp <= 0) this.kill(b, by);
  }

  kill(b, by) {
    if (b.dead) return;
    b.dead = true;
    b.respawn = 5;
    b.lastHitBy = null;
    this.combat.boom(b.pos, 5);
    this.scene.remove(b.mesh);
    this.scene.remove(b.tag);
    this.onKill && this.onKill(b.id, b.name, by);
  }

  clear() {
    for (const b of this.list) {
      this.scene.remove(b.mesh);
      this.scene.remove(b.tag);
    }
    this.list.length = 0;
  }
}
