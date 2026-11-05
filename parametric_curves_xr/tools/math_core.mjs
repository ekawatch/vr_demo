/* ╔══════════════════════════════════════════════════════════════════════════════╗
   ║ math_core.mjs — คณิตศาสตร์ทั้งหมดของสื่อ parametric_curves_xr                  ║
   ║                                                                              ║
   ║ เส้นโค้งพารามิเตอร์ที่สื่อใช้ มีรูปแบบเดียวเสมอ:                              ║
   ║                                                                              ║
   ║     r(t) = ( Ax·sin(a t + α),  By·sin(b t + β),  Cz·sin(c t + γ) )         ║
   ║                                                                              ║
   ║ ตัวแปร t ตัวเดียวกันขับทั้งสามแกน แต่ (a,b,c) ต่างกัน → คาบต่างกัน      ║
   ║ ไฟล์นี้เป็นที่มาของ *ทุกตัวเลข* ที่แสดงในสื่อและที่อ้างใน README/เอกสารบท     ║
   ║ index.html ไม่ hardcode ผลลัพธ์ใด ๆ — เรียกฟังก์ชันจากไฟล์นี้ทั้งหมด          ║
   ║ ตรวจด้วย: node tools/math_check.mjs                                           ║
   ╚══════════════════════════════════════════════════════════════════════════════╝ */

export const TAU = Math.PI * 2;

/* ---------- ขนาดของโลก (เมตร) : ใช้ร่วมกันทั้งสื่อและการทดสอบ ---------- */
export const AMP = { x: 7.0, y: 7.0, z: 4.0 };   // แอมปลิจูดของสาม oscillator
export const TUBE_R = 0.13;                       // รัศมีท่อที่วาด
export const OPEN_CYCLES = 12;                    // เส้นที่ไม่ปิด: เขียนต่อถึง 12 รอบของ oscillator ที่ช้าที่สุด
export const SAMPLES_PER_CYCLE = 128;             // ความละเอียดมาตรฐานของการสุ่มตัวอย่าง
export const MIN_SAMPLES = 2000, MAX_SAMPLES = 14000;

const D2R = d => d * Math.PI / 180;

/* ══════════════════════════════════════════════════════════════════════════════
   1) พรีเซต = ชุดความถี่ที่เลือกมาให้เห็นข้อสรุปต่างกัน
   f = ความถี่ (จำนวนเต็ม หรือ จำนวนอตรรกยะ), ph = เฟสเริ่มต้น (องศา)
   ══════════════════════════════════════════════════════════════════════════════ */
export const PRESETS = [
  { tag: '1', id: 'same', title: 'ความถี่เดียวกันทั้งสามแกน',
    teach: 'อัตราส่วน 1:1:1 ให้เส้นโค้งที่อยู่ใน "ระนาบเดียว" เสมอ ไม่มีทางเป็นเส้นโค้งในปริภูมิสามมิติ',
    variants: [
      { tag: '∥',      f: [1, 1, 1], ph: [0, 0, 0], teach: 'ทั้งสามแกนเหมือนเป๊ะ → เส้นตรง (กรณีเสื่อม)' },
      { tag: '◯',      f: [1, 1, 1], ph: [0, 90, 0], teach: 'เฟสต่าง 90° → วงรีในระนาบเอียง (ระนาบ 4x = 7z)' },
      { tag: '⬭',      f: [1, 1, 1], ph: [0, 90, 45], teach: 'เฟสมุมอื่น → วงรีในระนาบอื่น ยังแบนเสมอ' },
    ] },

  { tag: '2', id: 'onediff', title: 'แกนหนึ่งมีความถี่ต่าง',
    teach: 'ความถี่ต่างหนึ่งค่าพอที่จะพาเส้นออกจากระนาบ แต่เส้นยังอาจถูกกักอยู่บนพื้นผิว',
    variants: [
      { tag: '∿',      f: [1, 1, 2], ph: [0, 0, 0],  teach: 'x=y เสมอ → เงาเป็นเส้นตรง ตัวเส้นยังแบนแต่นอนอยู่ในระนาบตั้ง' },
      { tag: '◎',      f: [1, 1, 2], ph: [0, 90, 0], teach: 'เงาบนพื้นเป็นวงกลม ตัวเส้นเป็นเกลียวรอบทรงกระบอก' },
      { tag: '≣',      f: [1, 2, 2], ph: [0, 0, 90], teach: 'y²/7² + z²/4² = 1 ตลอดเส้น → เส้นอยู่บนผิวทรงกระบอกเชิงรีรอบแกน x' },
      { tag: '∞',      f: [1, 1, 3], ph: [0, 90, 0], teach: 'เงาเป็นวงกลม + ขึ้นลงสามรอบต่อรอบ = เกลียวสามชั้น' },
    ] },

  { tag: '3', id: 'ratios', title: 'อัตราส่วนจำนวนเต็ม = เส้นปิด',
    teach: 'อัตราส่วนเป็นจำนวนตรรกยะ → มีคาบร่วม = 2π/gcd ของสามความถี่ และการคูณทั้งสามด้วยจำนวนเดียวกันให้ "รูปร่างเดิม คาบสั้นลง"',
    variants: [
      { tag: '1:2:3',  f: [1, 2, 3], ph: [0, 0, 0],  teach: 'คาบร่วม 2π' },
      { tag: '2:4:6',  f: [2, 4, 6], ph: [0, 0, 0],  teach: 'รูปร่างเดียวกับ 1:2:3 แต่คาบ π (gcd = 2)' },
      { tag: '3:6:9',  f: [3, 6, 9], ph: [0, 0, 0],  teach: 'รูปร่างเดิมอีก คาบ 2π/3 (gcd = 3)' },
      { tag: '3:4:5',  f: [3, 4, 5], ph: [0, 0, 0],  teach: 'อัตราส่วนเฉพาะ (pairwise coprime) = คดที่สุด' },
      { tag: '2:3:5',  f: [2, 3, 5], ph: [0, 0, 30], teach: 'เปลี่ยนเฟส = เปลี่ยนรูปร่าง แต่ไม่เปลี่ยนคาบ' },
    ] },

  { tag: '4', id: 'nojoin', title: 'อัตราส่วนไม่ลงรอย = ไม่ปิด',
    teach: 'อัตราส่วนอตรรกยะ → ไม่มีวันกลับจุดเดิม เส้นหนาแน่นอยู่บนผิวทรงกระบอก; ตัวประมาณตรรกยะที่ "ใกล้" มันก็ปิด แต่ต้องรอจำนวนรอบมาก',
    variants: [
      { tag: '1:1:√2',    f: [1, 1, Math.SQRT2], ph: [0, 90, 0], teach: 'ไม่มีคาบร่วม' },
      { tag: '5:5:7',     f: [5, 5, 7],          ph: [0, 90, 0], teach: 'ปิด แต่ต้องรอแกน x ครบ 5 รอบ' },
      { tag: '12:12:17',  f: [12, 12, 17],       ph: [0, 90, 0], teach: '17/12 = 1.41667 ≈ √2: ปิดที่รอบที่ 12' },
    ] },
];

/* ══════════════════════════════════════════════════════════════════════════════
   2) ตัวดำเนินการพื้นฐานของอัตราส่วน
   ══════════════════════════════════════════════════════════════════════════════ */
export function gcd (a, b) {
  a = Math.abs(Math.trunc(a)); b = Math.abs(Math.trunc(b));
  while (b) { const t = b; b = a % b; a = t; }
  return a;
}
export function allInteger (f) { return f.every(v => Number.isInteger(v) && v > 0); }
export function gcdOf (f) { return allInteger(f) ? f.reduce((g, v) => gcd(g, v), 0) : null; }

/** คาบร่วมที่เล็กที่สุดของ r(t) = ค่า T > 0 ที่ r(t+T) = r(t) ทุกจุด
 *  สำหรับความถี่จำนวนเต็ม: T = 2π / gcd(a,b,c);  ถ้ามีอตรรกยะ: ไม่มี (null) */
export function periodOf (f) {
  const g = gcdOf(f);
  return g ? TAU / g : null;
}
/** จำนวนรอบที่แต่ละ oscillator ทำได้ในเวลา T */
export function cyclesIn (f, T) { return f.map(v => v * T / TAU); }
/** ลดอัตราส่วนลงเป็นรูปต่ำสุด (สำหรับแสดงว่า "รูปร่างเดียวกัน") */
export function reduceRatio (f) {
  if (!allInteger(f)) return f.slice();
  const g = gcdOf(f);
  return f.map(v => v / g);
}
/** ≈จำนวนตรรกยะที่เข้าใกล้ ratio ที่สุดด้วยตัวหาร ≤ maxDenom (ใช้แสดงว่า "ใกล้" ไม่ช่วยให้ปิดเร็ว) */
export function nearestRatio (x, maxDenom) {
  let best = [Math.round(x), 1], err = Math.abs(x - best[0]);
  for (let q = 1; q <= maxDenom; q++) {
    const p = Math.round(x * q), e = Math.abs(x - p / q);
    if (e < err - 1e-15) { err = e; best = [p, q]; }
  }
  return { p: best[0], q: best[1], err };
}

/* ══════════════════════════════════════════════════════════════════════════════
   3) เส้นโค้ง r(t) และ velocity r'(t) แบบปิด (analytic) ไม่ต้องหาจำนวนใกล้เคียง
   ══════════════════════════════════════════════════════════════════════════════ */
export function norm (v) { return Math.hypot(v[0], v[1], v[2]); }

/** จุดบนเส้น (ศูนย์อยู่ที่ศูนย์กลางของรูป ไม่ใช่พื้นห้อง) */
export function point (v, t) {
  const { f, ph } = v;
  return [AMP.x * Math.sin(f[0] * t + ph[0]),
          AMP.y * Math.sin(f[1] * t + ph[1]),
          AMP.z * Math.sin(f[2] * t + ph[2])];
}
/** อนุพันธ์ analytic: r'(t) = (Ax·a·cos(at+α), …) — ความเร็วเฉพาะที่ของหุ่นที่วิ่งตามเส้น */
export function velocity (v, t) {
  const { f, ph } = v;
  return [AMP.x * f[0] * Math.cos(f[0] * t + ph[0]),
          AMP.y * f[1] * Math.cos(f[1] * t + ph[1]),
          AMP.z * f[2] * Math.cos(f[2] * t + ph[2])];
}
export function speed (v, t) { return norm(velocity(v, t)); }

/** จำนวนเต็ม = จำนวนรอบของ oscillator i ที่ทำไปแล้ว ณ เวลา t (ใช้กับหน้าปัดสามเรือน) */
export function cyclesDone (v, t) { return v.f.map(f => (f * t) / TAU); }

/* ══════════════════════════════════════════════════════════════════════════════
   4) การสุ่มตัวอย่าง + ความยาวส่วนโค้ง L = ∫ |r'(t)| dt
   ══════════════════════════════════════════════════════════════════════════════ */
export function sampleCount (v, t1) {
  const cycles = Math.max(...v.f.map(f => f * t1 / TAU));
  return Math.max(MIN_SAMPLES, Math.min(MAX_SAMPLES, Math.round(cycles * SAMPLES_PER_CYCLE)));
}
export function sampleCurve (v, t1, n = sampleCount(v, t1)) {
  const out = new Array(n + 1);
  for (let i = 0; i <= n; i++) out[i] = point(v, t1 * i / n);
  return out;
}
/** ∫|r'| dt ด้วยกฎ Simpson บนตาข่ายระยะเท่า (n = จำนวนช่วง ต้องเป็นเลขคู่) */
export function arcLength (v, t0, t1, n = 4000) {
  if (n % 2) n++;                 // กฎ Simpson ใช้จำนวนช่วงเป็นคู่
  n = Math.max(2, n);
  const h = (t1 - t0) / n;
  let s = speed(v, t0) + speed(v, t1);
  for (let i = 1; i < n; i++) s += speed(v, t0 + i * h) * (i % 2 ? 4 : 2);
  return s * h / 3;
}
/** ตารางการลู่เข้าของ ∫|r'|dt เมื่อแซมปล์ถี่ขึ้น — ใช้ยืนยันว่าตัวเลขที่สื่อแสดงเชื่อถือได้ */
export function arcConvergence (v, t1, ns = [250, 500, 1000, 2000, 4000, 8000]) {
  const rows = ns.map(n => ({ n, L: arcLength(v, 0, t1, n) }));
  for (let i = 1; i < rows.length; i++) rows[i].diff = Math.abs(rows[i].L - rows[i - 1].L);
  return rows;
}

/* ══════════════════════════════════════════════════════════════════════════════
   5) คุณสมบัติเชิงเรขาคณิตที่ใช้ "พิสูจน์" ในสื่อได้
   ══════════════════════════════════════════════════════════════════════════════ */
/** ระยะจากจุด r(t) กลับไปยังจุดเริ่มต้น r(0) — 0 คือ "กลับถึงจุดเริ่ม"
 *  สำคัญ: กลับถึงจุดเริ่ม ≠ เส้นปิด (จุดนั้นอาจเป็นจุดตัดตัวเอง) */
export function gapToStart (v, t) {
  const p = point(v, t), q = point(v, 0);
  return norm([p[0] - q[0], p[1] - q[1], p[2] - q[2]]);
}
/** เข้าใกล้จุดเดิมได้ "แค่ไหน" ในช่วงเวลา [tLo,tHi] — เส้นปิดให้ได้ 0, เส้นไม่ปิดให้ได้ค่า > 0
 *  ทำค้นหาหยาบแล้วขยายผลรอบจุดต่ำทุกจุด (grid อย่างเดียวพลาดจุดแคบได้)
 *  คืน { gap, at } : at = เวลาที่เข้าใกล้ที่สุด */
export function closestApproach (v, tLo, tHi, coarse = 8000, refine = 40) {
  const h = (tHi - tLo) / coarse;
  const g = i => gapToStart(v, tLo + i * h);
  const val = new Array(coarse + 1);
  for (let i = 0; i <= coarse; i++) val[i] = g(i);
  let best = { gap: Infinity, at: tHi };
  const consider = (t) => { const d = gapToStart(v, t); if (d < best.gap) best = { gap: d, at: t }; };
  for (let i = 1; i < coarse; i++) {
    if (val[i] <= val[i - 1] && val[i] <= val[i + 1]) {
      let lo = tLo + (i - 1) * h, hi = tLo + (i + 1) * h;
      for (let k = 0; k < refine; k++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        if (gapToStart(v, m1) < gapToStart(v, m2)) hi = m2; else lo = m1;
      }
      consider((lo + hi) / 2);
    }
  }
  consider(tLo); consider(tHi);
  return best;
}
/** ใช้บ่อยที่สุด: เข้าใกล้จุดเดิมแค่ไหน "หลังที่ oscillator ที่ช้าที่สุดครบหนึ่งรอบแล้ว" */
export function closestAfterOneCycle (v, tHi) {
  return closestApproach(v, TAU / Math.min(...v.f), tHi);
}
/** ตรวจว่า r(t+T) = r(t) ทุกจุดจริง (เส้นปิด) และให้ค่าความคลาดเคลื่อนสูงสุด */
export function repeatError (v, T, n = 400) {
  let m = 0;
  for (let i = 0; i < n; i++) {
    const t = T * i / n, p = point(v, t), q = point(v, t + T);
    m = Math.max(m, norm([p[0] - q[0], p[1] - q[1], p[2] - q[2]]));
  }
  return m;
}
/** ค่าต่ำสุดของ ‖r(t)−r(0)‖ บนช่วง (0,T) ที่ไม่รวมจุดจบ — ใช้กับข้อความ "กลับจุดเริ่มก่อนครบคาบได้" */
export function earlyReturn (v, T, n = 4000, skip = 0.02) {
  let m = Infinity, at = 0;
  for (let i = Math.ceil(n * skip); i < n; i++) {   // ข้ามช่วงชิด 0 ซึ่ง gap เล็กเพราะเดินยังไม่ทันพ้น
    const t = T * i / n, g = gapToStart(v, t);
    if (g < m) { m = g; at = t; }
  }
  return { gap: m, at };
}
/** ความคลาดเคลื่อนสูงสุดจากการ "อยู่ในการระนาบเดียว": ระยะจากจุดไปยังระนาบที่ดีที่สุด
 *  ใช้ยืนยันว่า 1:1:1 เป็นระนาบเสมอ และ 1:1:2 ไม่ใช่ */
export function planarityDeviation (v, t1, n = 1200) {
  const pts = sampleCurve(v, t1, n);
  const p0 = pts[0];
  /* เลือกจุดอ้างอิงกระจายทั่วเส้นมาจับคู่กันเป็น "ระนาบผู้สมัคร": ถ้าเส้นอยู่ในระนาบจริง
     คู่ใดก็ได้ให้ระนาบที่ตรงเป๊ะ จึงไม่ต้องไล่ทุกคู่ของ n จุด (n² เป็นล้านคู่) */
  const cand = [];
  for (let k = 1; k < pts.length; k += Math.max(1, Math.floor(pts.length / 24))) cand.push(k);
  let best = 0, bestDev = Infinity;
  for (let ci = 0; ci < cand.length; ci++) for (let cj = ci + 1; cj < cand.length; cj++) {
    const i = cand[ci], j = cand[cj];
    const a = [pts[i][0] - p0[0], pts[i][1] - p0[1], pts[i][2] - p0[2]];
    const b = [pts[j][0] - p0[0], pts[j][1] - p0[1], pts[j][2] - p0[2]];
    const nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0];
    const nn = Math.hypot(nx, ny, nz);
    if (nn < 1e-9) continue;
    let m = 0;
    for (const p of pts) m = Math.max(m, Math.abs((p[0] - p0[0]) * nx + (p[1] - p0[1]) * ny + (p[2] - p0[2]) * nz) / nn);
    if (m < bestDev) { bestDev = m; best = 1; }
    if (bestDev < 1e-12) return 0;
  }
  return best ? bestDev : 0;      // 0 = เส้นตรงล้วน ๆ (หาระนาบไม่ได้) = ยัง "แบน"
}
/** ความคลาดเคลื่อนจาก "ผิวทรงกระบอก" r = R รอบแกน z: ใช้กับ 1:1:√2 (หนาแน่นบนผิวถัง) */
export function cylinderDeviation (v, t1, n = 4000) {
  let m = 0;
  for (let i = 0; i <= n; i++) {
    const p = point(v, t1 * i / n);
    m = Math.max(m, Math.abs(Math.hypot(p[0], p[1]) - AMP.x));
  }
  return m;
}
/** จำนวนครั้งที่เงาบนพื้น (การโปรเจกต์ลงระนาบ xy) ตัดตัวเอง — ตัวเลขที่ใช้เดาไม่ได้ด้วยตา */
export function shadowCrossings (v, t1, n = 900) {
  const pts = sampleCurve(v, t1, n).map(p => [p[0], p[1]]);
  const seg = (p, q, r, s) => {
    const d1 = (q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]);
    const d2 = (r[0] - p[0]) * (s[1] - p[1]) - (r[1] - p[1]) * (s[0] - p[0]);
    const d3 = (p[0] - r[0]) * (q[1] - r[1]) - (p[1] - r[1]) * (q[0] - r[0]);
    if (Math.abs(d1) < 1e-12) return 0;
    const t = d2 / d1, u = d3 / d1;
    return (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) ? 1 : 0;
  };
  let c = 0;
  for (let i = 0; i < pts.length - 1; i++)
    for (let j = i + 2; j < pts.length - 1; j++) c += seg(pts[i], pts[i + 1], pts[j], pts[j + 1]);
  return c;
}
/** ระยะตามส่วนโค้งระหว่าง "เครื่องหมายเวลาเท่ากัน" (Δt คงที่) — ต่างกัน = ความเร็วไม่คงที่
 *  นี่คือสิ่งที่สื่อทำให้เห็นเป็นช่องว่างจริงบนท่อ */
export function tickSpacings (v, t1, n = 32) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(arcLength(v, t1 * i / n, t1 * (i + 1) / n, 240));
  const lo = Math.min(...out), hi = Math.max(...out);
  return { spacings: out, min: lo, max: hi, ratio: hi / lo, arcPerUnitTime: arcLength(v, 0, t1) / t1 };
}

/* ══════════════════════════════════════════════════════════════════════════════
   6) variant = พรีเซตหนึ่งข้อพร้อมทุกค่า derived ที่สื่อและเทสต์ต้องใช้ (cache)
   ══════════════════════════════════════════════════════════════════════════════ */
const CACHE = new Map();
/** สร้าง objects ของเส้นโค้งหนึ่งข้อ + คำนวณทุกค่า derived แล้ว cache ไว้ */
export function makeVariant (fIn, phDegIn, meta = {}) {
  const f = fIn.slice(), phDeg = phDegIn.slice();
  const key = f.join(',') + '|' + phDeg.join(',');
  if (CACHE.has(key)) return CACHE.get(key);
  const ph = phDeg.map(D2R);
  const T = periodOf(f);
  const closed = T !== null;
  const span = closed ? T : OPEN_CYCLES * TAU / Math.min(...f);
  const v = Object.assign({}, meta, {
    key, f, ph, phDeg, closed, T, span,
    gcd: closed ? gcdOf(f) : null,
    ratio: f.map(x => Number.isInteger(x) ? x : String(x)).join(':'),
    ratioLow: reduceRatio(f).join(':'),
    cyclesAtPeriod: closed ? cyclesIn(f, T).map(x => Math.round(x * 1e9) / 1e9) : null,
  });
  let lo = Infinity, hi = 0;
  for (let i = 0; i < 720; i++) { const s = speed(v, v.span * i / 720); lo = Math.min(lo, s); hi = Math.max(hi, s); }
  v.speedMin = lo; v.speedMax = hi;
  v.samples = sampleCount(v, v.span);
  v.L = arcLength(v, 0, v.span, 8000);
  v.closest = closestAfterOneCycle(v, v.span);
  CACHE.set(key, v);
  return v;
}
export function variant (pi, vi) {
  const key = pi + ':' + vi;
  if (CACHE.has(key)) return CACHE.get(key);
  const preset = PRESETS[pi], src = preset.variants[vi];
  const v = makeVariant(src.f, src.ph, {
    pi, vi, presetId: preset.id, presetTag: preset.tag, presetTitle: preset.title,
    tag: src.tag, teach: src.teach,
  });
  CACHE.set(key, v);
  return v;
}
export function variantByTag (pi, tag) {
  const vi = PRESETS[pi].variants.findIndex(w => w.tag === tag);
  return vi < 0 ? null : variant(pi, vi);
}
export function allVariants () {
  const out = [];
  for (let pi = 0; pi < PRESETS.length; pi++)
    for (let vi = 0; vi < PRESETS[pi].variants.length; vi++) out.push(variant(pi, vi));
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════
   7) หน้าปัดสามเรือน: มุมของเข็มและจำนวนรอบที่เข็มหมุนไปแล้ว ณ เวลา t
   ══════════════════════════════════════════════════════════════════════════════ */
/** มุมเข็มของ oscillator i (เรเดียน, วัดครบรอบจริง) และจำนวนรอบเต็ม + เศษที่เหลือ */
export function dialState (v, t) {
  return v.f.map((f, i) => {
    const c = cyclesDone(v, t)[i];
    const full = Math.floor(c);
    return { freq: f, phase: v.ph[i], angle: (f * t + v.ph[i]) % TAU, cycles: c, full, frac: c - full };
  });
}
/** เป็นจริงเมื่อทั้งสาม oscillator กลับเฟสเดิมพร้อมกัน = ครบคาบร่วมพอดี
 *  (แต่ละ d.frac = เศษของรอบที่เหลืออยู่ จึงต้องเป็น 0 ทั้งหมด) */
export function allAligned (v, t, eps = 1e-9) {
  return dialState(v, t).every(d => Math.abs(d.frac) < eps || Math.abs(d.frac - 1) < eps);
}

/* time helper: เวลาที่ทั้งสาม oscillator กลับเฟสเดิมพร้อมกัน (คาบร่วม) — ใช้ตรวจ periodOf */
export function alignmentTimes (f, upToCycles = 24) {
  const base = Math.min(...f);
  const out = [];
  for (let k = 1; k <= upToCycles; k++) {
    const t = k * TAU / base;
    if (f.every(v => Math.abs(v * t / TAU - Math.round(v * t / TAU)) < 1e-9)) out.push(t);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════
   8) เทียบสองเส้น: เงาบนพื้น (x,y) เหมือนกันแค่ไหน และตัวเส้น (x,y,z) ต่างกันแค่ไหน
      ใช้ modes = ['⧉'] ของสื่อ: สองเส้น เงาเดียวกัน แต่ตัวเส้นคนละเส้น
   ══════════════════════════════════════════════════════════════════════════════ */
function hausdorffMax (A, B) {                      // ระยะสูงสุดจากจุดของ A ไปยังเส้นของ B
  let m = 0, at = 0;
  for (let i = 0, n = A.length; i < n; i++) {
    let d = Infinity;
    for (let j = 0, k = B.length; j < k; j++) {
      let e = 0;
      for (let c = 0; c < A[i].length; c++) { const u = A[i][c] - B[j][c]; e += u * u; }
      if (e < d) d = e;
    }
    if (d > m) { m = d; at = i; }
  }
  return { dist: Math.sqrt(m), index: at };
}
/** ระยะสองทาง (symmetric) ระหว่างจุดสองชุด = "เส้นเดียวกันหรือไม่" */
function pairGap (A, B) {
  const p = hausdorffMax(A, B), q = hausdorffMax(B, A);
  return { max: Math.max(p.dist, q.dist), fromA: p.dist, toB: q.dist, index: p.dist >= q.dist ? p.index : q.index };
}
/** ระยะระหว่าง เงา บนพื้น z=0 ของสองเส้น (0 = เงาเหมือนกันทุกจุด) */
export function shadowGap (a, b, n = 600) {
  const A = sampleCurve(a, a.span, n).map(p => [p[0], p[1]]);
  const B = sampleCurve(b, b.span, n).map(p => [p[0], p[1]]);
  return pairGap(A, B);
}
/** ระยะระหว่างตัวเส้นในสามมิติ (0 = เส้นเดียวกัน เรามองคนละแบบหรือเดินเร็วต่างกัน) */
export function curveGap (a, b, n = 600) {
  return pairGap(sampleCurve(a, a.span, n), sampleCurve(b, b.span, n));
}
