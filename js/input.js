// input.js — keyboard + touch (virtual stick, throttle slider, rudder buttons)
export const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

export class Input {
  constructor() {
    this.keys = {};
    this.invert = false;
    this.stick = { active: false, id: null, cx: 0, cy: 0, x: 0, y: 0 };
    this.throttleAbs = null;  // 0..1 from the mobile slider
    this.rudder = 0;
    this.touchFire = false;   // FIRE button held on touch devices
    this.onKey = {};          // single-shot key callbacks, e.g. onKey['KeyC']

    // mouse flight (desktop dogfights): pointer lock turns the mouse into a
    // virtual stick. x/y is the stick offset in -1..1, persistent until the
    // player moves it back (or middle-clicks to recenter).
    this.mouse = { locked: false, x: 0, y: 0, fire: false };
    this.wheelThr = 0;        // pending throttle nudges from the scroll wheel
    this.onMouseFlight = null; // (locked) notify the HUD
    this.lockEl = null;

    addEventListener('keydown', e => {
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (this.onKey[e.code]) this.onKey[e.code]();
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });

    if (IS_TOUCH) {
      document.body.classList.add('touch');
      this.buildTouchUI();
    } else {
      this.buildMouse();
    }
  }

  // ---------------------------------------------------------------- mouse
  buildMouse() {
    document.addEventListener('pointerlockchange', () => {
      this.mouse.locked = document.pointerLockElement === this.lockEl && this.lockEl !== null;
      if (!this.mouse.locked) {
        this.mouse.x = this.mouse.y = 0;
        this.mouse.fire = false;
      }
      if (this.onMouseFlight) this.onMouseFlight(this.mouse.locked);
    });
    addEventListener('mousemove', e => {
      if (!this.mouse.locked) return;
      // ~320 px of travel = full stick deflection
      this.mouse.x = Math.max(-1, Math.min(1, this.mouse.x + e.movementX / 320));
      this.mouse.y = Math.max(-1, Math.min(1, this.mouse.y + e.movementY / 320));
    });
    addEventListener('mousedown', e => {
      if (!this.mouse.locked) return;
      if (e.button === 0) this.mouse.fire = true;
      else if (e.button === 1) { e.preventDefault(); this.mouse.x = this.mouse.y = 0; } // recenter
      else if (e.button === 2 && this.onKey['KeyV']) this.onKey['KeyV']();              // missile
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.mouse.fire = false; });
    addEventListener('contextmenu', e => { if (this.mouse.locked) e.preventDefault(); });
    addEventListener('wheel', e => {
      if (this.mouse.locked) this.wheelThr += (e.deltaY < 0 ? 1 : -1) * 0.07;
    }, { passive: true });
  }

  lockMouse(el) {
    this.lockEl = el;
    try { el.requestPointerLock(); } catch (e) { /* not allowed here */ }
  }

  unlockMouse() {
    if (this.mouse.locked) document.exitPointerLock();
  }

  buildTouchUI() {
    const mk = (tag, id, parent = document.body) => {
      const el = document.createElement(tag);
      el.id = id;
      parent.appendChild(el);
      return el;
    };
    this.stickBase = mk('div', 'stickBase');
    this.stickKnob = mk('div', 'stickKnob');
    this.stickBase.style.display = this.stickKnob.style.display = 'none';

    this.thrZone = mk('div', 'throttleZone');
    this.thrKnob = document.createElement('div');
    this.thrKnob.id = 'throttleKnob';
    this.thrZone.appendChild(this.thrKnob);
    this.setThrottleKnob(0.5);
    this.throttleAbs = 0.5;

    const rudL = mk('button', 'rudL'); rudL.className = 'rudderBtn'; rudL.textContent = '◀';
    const rudR = mk('button', 'rudR'); rudR.className = 'rudderBtn'; rudR.textContent = '▶';
    for (const [btn, v] of [[rudL, -1], [rudR, 1]]) {
      btn.addEventListener('touchstart', e => { e.preventDefault(); this.rudder = v; }, { passive: false });
      btn.addEventListener('touchend', () => { this.rudder = 0; });
      btn.addEventListener('touchcancel', () => { this.rudder = 0; });
    }
    // combat buttons: FIRE is hold-to-shoot, BOMB / ULTRA tap through onKey
    const fire = mk('button', 'btnFire'); fire.textContent = '🔫';
    fire.addEventListener('touchstart', e => { e.preventDefault(); this.touchFire = true; }, { passive: false });
    fire.addEventListener('touchend', () => { this.touchFire = false; });
    fire.addEventListener('touchcancel', () => { this.touchFire = false; });
    const bomb = mk('button', 'btnBomb'); bomb.textContent = '💣';
    bomb.addEventListener('touchstart', e => {
      e.preventDefault();
      if (this.onKey['KeyF']) this.onKey['KeyF']();
    }, { passive: false });
    const ultra = mk('button', 'btnUltra'); ultra.textContent = '🌟';
    ultra.addEventListener('touchstart', e => {
      e.preventDefault();
      if (this.onKey['KeyG']) this.onKey['KeyG']();
    }, { passive: false });
    const msl = mk('button', 'btnMsl'); msl.textContent = '🚀';
    msl.addEventListener('touchstart', e => {
      e.preventDefault();
      if (this.onKey['KeyV']) this.onKey['KeyV']();
    }, { passive: false });

    this.touchEls = [this.stickBase, this.stickKnob, this.thrZone, rudL, rudR, fire, bomb, ultra, msl];
    this.showTouch(false);

    // stick: any touch on the left 55% of the screen
    addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        if (this.stick.active) continue;
        if (t.clientX > innerWidth * 0.55) continue;
        if (t.target.closest && t.target.closest('#menu,button,select,label')) continue;
        this.stick.active = true;
        this.stick.id = t.identifier;
        this.stick.cx = t.clientX; this.stick.cy = t.clientY;
        this.stick.x = 0; this.stick.y = 0;
        this.stickBase.style.display = 'block';
        this.stickKnob.style.display = 'block';
        this.stickBase.style.left = (t.clientX - 62) + 'px';
        this.stickBase.style.top = (t.clientY - 62) + 'px';
        this.moveKnob(t.clientX, t.clientY);
      }
    }, { passive: true });

    addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (this.stick.active && t.identifier === this.stick.id) {
          const R = 58;
          let dx = t.clientX - this.stick.cx, dy = t.clientY - this.stick.cy;
          const d = Math.hypot(dx, dy);
          if (d > R) { dx *= R / d; dy *= R / d; }
          this.stick.x = dx / R; this.stick.y = dy / R;
          this.moveKnob(this.stick.cx + dx, this.stick.cy + dy);
        }
      }
    }, { passive: true });

    const endStick = e => {
      for (const t of e.changedTouches) {
        if (this.stick.active && t.identifier === this.stick.id) {
          this.stick.active = false;
          this.stick.x = this.stick.y = 0;
          this.stickBase.style.display = 'none';
          this.stickKnob.style.display = 'none';
        }
      }
    };
    addEventListener('touchend', endStick);
    addEventListener('touchcancel', endStick);

    // throttle slider
    const thrMove = t => {
      const r = this.thrZone.getBoundingClientRect();
      const v = 1 - Math.min(1, Math.max(0, (t.clientY - r.top) / r.height));
      this.throttleAbs = v;
      this.setThrottleKnob(v);
    };
    this.thrZone.addEventListener('touchstart', e => { e.preventDefault(); thrMove(e.changedTouches[0]); }, { passive: false });
    this.thrZone.addEventListener('touchmove', e => { e.preventDefault(); thrMove(e.changedTouches[0]); }, { passive: false });
  }

  moveKnob(x, y) {
    this.stickKnob.style.left = (x - 26) + 'px';
    this.stickKnob.style.top = (y - 26) + 'px';
  }

  setThrottleKnob(v) {
    if (!this.thrKnob) return;
    const h = this.thrZone.clientHeight - 38;
    this.thrKnob.style.top = (4 + (1 - v) * h) + 'px';
  }

  showTouch(on) {
    if (!this.touchEls) return;
    for (const el of this.touchEls) {
      if (el === this.stickBase || el === this.stickKnob) continue;
      el.style.display = on ? 'block' : 'none';
    }
    if (!on) {
      this.stickBase.style.display = 'none';
      this.stickKnob.style.display = 'none';
    }
  }

  // -1..1 control axes; pitch +1 = pull up
  read() {
    const k = this.keys;
    let pitch = 0, roll = 0, yaw = 0, thr = 0;
    if (k['KeyW'] || k['ArrowUp']) pitch += 1;
    if (k['KeyS'] || k['ArrowDown']) pitch -= 1;
    if (k['KeyA'] || k['ArrowLeft']) roll -= 1;
    if (k['KeyD'] || k['ArrowRight']) roll += 1;
    if (k['KeyQ']) yaw -= 1;
    if (k['KeyE']) yaw += 1;
    if (k['ShiftLeft'] || k['ShiftRight']) thr += 1;
    if (k['ControlLeft'] || k['ControlRight'] || k['KeyZ']) thr -= 1;
    const brake = (k['KeyX'] || k['KeyB']) ? 1 : 0;

    if (this.stick.active) {
      roll += this.stick.x;
      pitch += -this.stick.y; // push stick up = pull up (unless inverted)
    }
    yaw += this.rudder;

    // mouse flight: expo curve (x·|x|) keeps the center fine for gunnery
    // while full deflection still snaps the plane around
    if (this.mouse.locked) {
      const ex = this.mouse.x * Math.abs(this.mouse.x);
      const ey = this.mouse.y * Math.abs(this.mouse.y);
      roll += ex;
      yaw += ex * 0.35;        // coordinated turn — helps walk fire onto target
      pitch += -ey;            // mouse up = pull up (unless inverted)
    }
    const thrNudge = this.wheelThr;
    this.wheelThr = 0;

    if (this.invert) pitch = -pitch;
    return {
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll: Math.max(-1, Math.min(1, roll)),
      yaw: Math.max(-1, Math.min(1, yaw)),
      thr,
      thrNudge,
      brake,
      fire: !!k['Space'] || this.touchFire || this.mouse.fire,
      thrAbs: IS_TOUCH ? this.throttleAbs : null,
    };
  }
}
