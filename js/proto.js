// proto.js — compact binary wire format for the latency-critical messages
// (state, fire, hit, hp). All other traffic stays JSON *text* frames; binary
// frames arrive as ArrayBuffer on the browser and Buffer on the server, so the
// two never collide and no opcode tagging is needed for the JSON side.
//
// IMPORTANT: every byte layout here is mirrored in server.js — change both or
// the wire breaks. All multi-byte fields are little-endian.
//
// Field encodings:
//   position  → 3× float32                       (world units, full precision)
//   rotation  → 4× int16, component × 32767       (quaternion, ±1 range)
//   speed     → int16                             (rounded units/sec)
//   id/target → uint16                            ('p7' → 7, 0 means "none")
//   damage    → uint8                             (0..150)

export const OP = { S: 1, FIRE: 2, HIT: 3, HP: 4 };
export const KINDS = ['gun', 'bomb', 'ultra', 'msl']; // index = wire code

const Q = 32767;
const qpack = c => Math.max(-Q, Math.min(Q, Math.round(c * Q)));
const idNum = id => (id ? +String(id).slice(1) : 0) | 0; // 'p7' → 7, null → 0
const idStr = n => 'p' + n;

// ---- client → server encoders ----

// [op:u8][px,py,pz:f32][qx,qy,qz,qw:i16][v:i16] = 23 bytes
export function encodeState(p, q, v) {
  const b = new ArrayBuffer(23), d = new DataView(b);
  d.setUint8(0, OP.S);
  d.setFloat32(1, p.x, true); d.setFloat32(5, p.y, true); d.setFloat32(9, p.z, true);
  d.setInt16(13, qpack(q.x), true); d.setInt16(15, qpack(q.y), true);
  d.setInt16(17, qpack(q.z), true); d.setInt16(19, qpack(q.w), true);
  d.setInt16(21, Math.round(v), true);
  return b;
}

// [op:u8][kind:u8][px,py,pz:f32][qx,qy,qz,qw:i16][v:i16][tgt:u16] = 26 bytes
export function encodeFire(kind, p, q, v, tgt) {
  const b = new ArrayBuffer(26), d = new DataView(b);
  d.setUint8(0, OP.FIRE);
  d.setUint8(1, Math.max(0, KINDS.indexOf(kind)));
  d.setFloat32(2, p.x, true); d.setFloat32(6, p.y, true); d.setFloat32(10, p.z, true);
  d.setInt16(14, qpack(q.x), true); d.setInt16(16, qpack(q.y), true);
  d.setInt16(18, qpack(q.z), true); d.setInt16(20, qpack(q.w), true);
  d.setInt16(22, Math.round(v), true);
  d.setUint16(24, idNum(tgt), true);
  return b;
}

// [op:u8][target:u16][dmg:u8] = 4 bytes
export function encodeHit(target, dmg) {
  const b = new ArrayBuffer(4), d = new DataView(b);
  d.setUint8(0, OP.HIT);
  d.setUint16(1, idNum(target), true);
  d.setUint8(3, Math.max(0, Math.min(255, dmg | 0)));
  return b;
}

// ---- server → client decoder (returns the same shapes the JSON path used) ----
export function decode(buf) {
  const d = new DataView(buf);
  switch (d.getUint8(0)) {
    case OP.S: // [op][id:u16][p:f32×3][q:i16×4][v:i16] = 25 bytes
      return {
        t: 's', id: idStr(d.getUint16(1, true)),
        p: [d.getFloat32(3, true), d.getFloat32(7, true), d.getFloat32(11, true)],
        q: [d.getInt16(15, true) / Q, d.getInt16(17, true) / Q, d.getInt16(19, true) / Q, d.getInt16(21, true) / Q],
        v: d.getInt16(23, true),
      };
    case OP.FIRE: { // [op][id:u16][kind:u8][p:f32×3][q:i16×4][v:i16][tgt:u16] = 28 bytes
      const tgt = d.getUint16(26, true);
      return {
        t: 'fire', id: idStr(d.getUint16(1, true)), kind: KINDS[d.getUint8(3)],
        p: [d.getFloat32(4, true), d.getFloat32(8, true), d.getFloat32(12, true)],
        q: [d.getInt16(16, true) / Q, d.getInt16(18, true) / Q, d.getInt16(20, true) / Q, d.getInt16(22, true) / Q],
        v: d.getInt16(24, true),
        tgt: tgt ? idStr(tgt) : null,
      };
    }
    case OP.HP: // [op][id:u16][hp:i16][by:u16] = 7 bytes
      return {
        t: 'hp', id: idStr(d.getUint16(1, true)),
        hp: d.getInt16(3, true), by: idStr(d.getUint16(5, true)),
      };
  }
  return null;
}
