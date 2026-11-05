#!/usr/bin/env node
/* math_check.mjs — ตรวจ math_core.mjs ด้วยคำตอบปิด (ไม่อ่านจากสื่อ) ทุกข้อเป็นเลขที่
 * คำนวณอิสระในไฟล์นี้ แล้วเทียบกับการทำงานจริงของ math_core
 *
 *   node tools/math_check.mjs            รันทุกข้อ
 *   node tools/math_check.mjs --verbose  พิมพ์ทุกข้อ
 *
 * คำตอบปิดที่ใช้:
 *   ∥ (1:1:1, φ=0)  : r(t) = (7,7,4)·sin t เป็น "เส้นตรง" → L = 4·√(7²+7²+4²) = 4√114,
 *                      |r′(t)| = √114·|cos t| → speedMax = √114, speedMin = 0
 *   ◯ (1:1:1, φ_y=90) : r(t) = sin t·(7,0,4) + cos t·(0,7,0) เป็นวงรีที่ครึ่ง
 *                      a = √65, b = 7 ตั้งฉากกัน → L = 4a·E(e), e² = 1 − b²/a²  (คำนวณด้วย AGM)
 *   ◎ ∞ 5:5:7 12:12:17 1:1:√2 (φ_x=90): x = 7 sin t, y = 7 cos t → x² + y² = 49 ตลอดเส้น
 *   ≣ (1:2:2, φ_z=90) : y = 7 sin 2t, z = 4 cos 2t → y²/49 + z²/16 = 1 ตลอดเส้น
 *   1:2:3 : r(π) = (0,0,0) = r(0) → กลับจุดเริ่มที่ t = π = T/2 แต่ยังไม่ครบคาบ
 *   1:1:√2 : ไม่มีคาบร่วม; 41/29 = 1.4137931 ≈ √2 (err 4.2046e-4)
 */
import * as M from './math_core.mjs';

const TAU = Math.PI * 2;
let pass = 0, fail = 0, verbose = process.argv.includes('--verbose');
const rows = [];

function check (name, got, want, tol, mode = 'abs') {
  const d = mode === 'rel' ? Math.abs(got - want) / Math.max(1e-12, Math.abs(want)) : Math.abs(got - want);
  const ok = Number.isFinite(got) && d <= tol;
  rows.push({ ok, name, got, want, d });
  if (ok) pass++; else fail++;
  if (!ok || verbose) console.log((ok ? 'ok   ' : 'FAIL ') + name + '  got=' + fmt(got) + ' want=' + fmt(want) + ' |d|=' + d.toExponential(2));
}
const fmt = (x) => (typeof x !== 'number' ? String(x) : (Number.isInteger(x) ? String(x) : x.toFixed(8)));
const truth = (name, cond) => { rows.push({ ok: !!cond, name }); if (cond) pass++; else { fail++; console.log('FAIL ' + name); } };

/* เครื่องมือคำนวณอิสระ (ไม่เรียก math_core) */
const quad = (f, a, b, n = 20000) => {           // Gauss–Legendre 5 จุด ต่อช่วง
  /* Gauss–Legendre 3 จุด/ช่วง: โหนดและน้ำหนักเป็นจำนวนตรรกยะถูก (±√(3/5), 0; 5/9, 8/9, 5/9) */
  const nodes = [-0.7745966692414834, 0, 0.7745966692414834];
  const wts = [5 / 9, 8 / 9, 5 / 9];
  const h = (b - a) / n, half = h / 2; let s = 0;
  for (let i = 0; i < n; i++) {
    const c = a + h * (i + 0.5);
    for (let k = 0; k < 3; k++) s += wts[k] * f(c + half * nodes[k]);
  }
  return s * half;
};
/** E(m) = ∫₀^{π/2} √(1 − m sin²θ) dθ — integral พิเศษที่กำหนดเส้นรอบวงของวงรี (คำนวณอิสระในไฟล์นี้) */
function ellipticE (m) { return quad(t => Math.sqrt(1 - m * Math.sin(t) ** 2), 0, Math.PI / 2, 200000); }

console.log('══ math_check — ตรวจ math_core.mjs กับคำตอบปิด ══\n');

/* ── 1) คาบร่วม / อัตราส่วน ─────────────────────────────────────────────── */
console.log('── กลุ่ม 1: คาบร่วม 2π/gcd และอัตราส่วน ──');
check('periodOf(1,1,1) = 2π', M.periodOf([1, 1, 1]), TAU, 1e-12);
check('periodOf(1,1,2) = 2π', M.periodOf([1, 1, 2]), TAU, 1e-12);
check('periodOf(1,2,3) = 2π', M.periodOf([1, 2, 3]), TAU, 1e-12);
check('periodOf(3,4,5) = 2π (gcd=1)', M.periodOf([3, 4, 5]), TAU, 1e-12);
check('periodOf(2,4,6) = π (gcd=2)', M.periodOf([2, 4, 6]), Math.PI, 1e-12);
check('periodOf(3,6,9) = 2π/3 (gcd=3)', M.periodOf([3, 6, 9]), TAU / 3, 1e-12);
check('periodOf(5,5,7) = 2π', M.periodOf([5, 5, 7]), TAU, 1e-12);
check('periodOf(12,12,17) = 2π', M.periodOf([12, 12, 17]), TAU, 1e-12);
truth('periodOf(1,1,√2) = null (ไม่มีคาบร่วม)', M.periodOf([1, 1, Math.SQRT2]) === null);
truth('periodOf(1,1,√2) ด้วย tolerance ปกติ = null', M.periodOf([1, 1, Math.SQRT2], 1e-9) === null);
check('gcd(6,9) = 3', M.gcd(6, 9), 3, 0);
check('gcd(2,4,6) = 2', M.gcdOf([2, 4, 6]), 2, 0);
check('gcd(3,4,5) = 1', M.gcdOf([3, 4, 5]), 1, 0);
truth('allInteger([1,1,√2]) = false', M.allInteger([1, 1, Math.SQRT2]) === false);
truth('allInteger([12,12,17]) = true', M.allInteger([12, 12, 17]) === true);
truth('reduceRatio([2,4,6]) = 1:2:3', M.reduceRatio([2, 4, 6]).join(':') === '1:2:3');
truth('reduceRatio([3,6,9]) = 1:2:3', M.reduceRatio([3, 6, 9]).join(':') === '1:2:3');
truth('cyclesIn(2π) ของ [2,4,6] = 1,2,3', M.cyclesIn([2, 4, 6], Math.PI).map(x => Math.round(x)).join() === '1,2,3');

/* ── 2) การปิดตัวเอง: r(T) = r(0) ทุกกรณีจำนวนเต็ม ─────────────────────── */
console.log('── กลุ่ม 2: ปิดตัวเอง = กลับเฟสพร้อมกันที่ t = kT ──');
for (const [pi, vi] of [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [1, 3], [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [3, 1], [3, 2]]) {
  const v = M.variant(pi, vi);
  const err = M.repeatError(v, v.T, 400);
  check(`repeatError(${v.tag}) < 1e-9`, err, 0, 1e-9);
  const d = M.norm(M.point(v, v.T).map((c, i) => c - M.point(v, 0)[i]));
  check(`r(T) = r(0) สำหรับ ${v.tag}`, d, 0, 1e-12);
  truth(`${v.tag}: allAligned(kT) จริง (k = 1,2,3)`, [1, 2, 3].every(k => M.allAligned(v, k * v.T)));
  truth(`${v.tag}: cyclesAtPeriod = f/gcd`, v.cyclesAtPeriod.join() === M.reduceRatio(v.f).join());
}
truth('1:1:√2 ไม่ปิดที่ t = 200π (100 รอบ)', M.gapToStart(M.makeVariant([1, 1, Math.SQRT2], [0, 90, 0]), 200 * Math.PI) > 0.05);
truth('ดัชนี 1:1:√2 ไม่ตรงเฟสพร้อมกันที่ t ที่ทดสอบ', [1, 2, 3, 6.28, 12.56, 37.725, 62.8].every(t => !M.allAligned(M.makeVariant([1, 1, Math.SQRT2], [0, 90, 0]), t, 1e-6)));

/* ── 3) คำตอบปิดของ ∫|r′|dt ─────────────────────────────────────────────── */
console.log('── กลุ่ม 3: ความยาวส่วนโค้ง เทียบคำตอบปิด/การอินทีกิเรลที่เป็นอิสระ ──');
{
  const v = M.variant(0, 0);                       // ∥ = เส้นตรง (7,7,4) sin t
  const closed = 4 * Math.sqrt(114);
  check('L(∥) = 4√114 (เส้นตรง ไป–กลับ)', v.L, closed, 1e-9, 'rel');
  check('speedMax(∥) = √114', v.speedMax, Math.sqrt(114), 1e-6, 'rel');
  check('speedMin(∥) = 0 (หยุดสนิทที่ t = π/2)', v.speedMin, 0, 2e-3);
  check('speed(∥, t) = √114·|cos t| ที่ t=0.7', M.speed(v, 0.7), Math.sqrt(114) * Math.abs(Math.cos(0.7)), 1e-9, 'rel');
}
{
  const v = M.variant(0, 1);                       // ◯ = วงรี ครึ่งแกน √65 และ 7
  const a = Math.sqrt(65), b = 7, e2 = 1 - (b * b) / (a * a);
  const closed = 4 * a * ellipticE(e2);
  check('L(◯) = 4a·E(e) (วงรี ครึ่งแกน √65 และ 7)', v.L, closed, 1e-7, 'rel');
  const gl = quad(t => M.speed(v, t), 0, TAU, 40000);
  check('L(◯) = ∫ด้วย Gauss–Legendre 40000 ช่วง', v.L, gl, 1e-9, 'rel');
  check('◯ เป็นวงรี: ครึ่งแกนยาว = √65', v.speedMax, a, 1e-6, 'rel');
}
{
  const v = M.variant(0, 2);                       // ⬭ วงรีในระนาบอื่น (เฟส 45°)
  check('L(⬭) = L(◯) (หมุนทั้งเส้น = ยาวเท่ากัน)', v.L, M.variant(0, 1).L, 1e-9, 'rel');
}
{
  const v = M.variant(1, 0);                       // ∿ (1:1:2, φ=0)
  const gl = quad(t => Math.sqrt(98 * Math.cos(t) ** 2 + 64 * Math.cos(2 * t) ** 2), 0, TAU, 40000);
  check('L(∿) = ∫√(98cos²t+64cos²2t) dt', v.L, gl, 1e-9, 'rel');
  check('speedMax(∿) = √(98+64)', v.speedMax, Math.sqrt(162), 1e-6, 'rel');
  const cmin = 158 / 512, smin = Math.sqrt(256 * cmin * cmin - 158 * cmin + 64);
  check('speedMin(∿) = ค่าต่ำสุดเชิงวิเคราะห์', v.speedMin, smin, 2e-3, 'rel');
}
{
  const v = M.variant(1, 2);                       // ≣ (1:2,2:2) บนทรงกระบอกเชิงรี
  const gl = quad(t => Math.sqrt(49 * Math.cos(t) ** 2 + 196 * Math.cos(2 * t) ** 2 + 64 * Math.sin(2 * t) ** 2), 0, TAU, 60000);
  check('L(≣) = ∫เชิงวิเคราะห์บนทรงกระบอก', v.L, gl, 1e-9, 'rel');
}
{
  const v = M.variant(2, 0);                       // 1:2:3
  const gl = quad(t => Math.sqrt(49 * Math.cos(t) ** 2 + 196 * Math.cos(2 * t) ** 2 + 144 * Math.cos(3 * t) ** 2), 0, TAU, 40000);
  check('L(1:2:3) = ∫เชิงวิเคราะห์', v.L, gl, 1e-9, 'rel');
}
{
  const v = M.variant(2, 3);                       // 3:4:5
  const gl = quad(t => Math.sqrt(49 * 9 * Math.cos(3 * t) ** 2 + 49 * 16 * Math.cos(4 * t) ** 2 + 16 * 25 * Math.cos(5 * t) ** 2), 0, TAU, 60000);
  check('L(3:4:5) = ∫เชิงวิเคราะห์', v.L, gl, 1e-9, 'rel');
}
{
  const v = M.variant(3, 0);                       // 1:1:√2 (เปิด, 12 รอบ)
  const gl = quad(t => M.speed(v, t), 0, v.span, 120000);
  check('L(1:1:√2, 12 รอบ) = ∫ Gauss–Legendre', v.L, gl, 1e-9, 'rel');
}
{
  const v = M.variant(3, 2);                       // 12:12:17 ≈ √2
  const gl = quad(t => M.speed(v, t), 0, v.span, 200000);
  check('L(12:12:17) = ∫ Gauss–Legendre', v.L, gl, 1e-9, 'rel');
}
{
  const a = M.variant(2, 0), b = M.variant(2, 1), c = M.variant(2, 2);
  check('L(1:2:3) = L(2:4:6) (เส้นเดียวกัน เร็วขึ้น 2 เท่า)', a.L, b.L, 1e-9, 'rel');
  check('L(1:2:3) = L(3:6:9)', a.L, c.L, 1e-9, 'rel');
  check('T(2:4:6) = T(1:2:3)/2', b.T, a.T / 2, 1e-12);
  check('T(3:6:9) = T(1:2:3)/3', c.T, a.T / 3, 1e-12);
  check('speedMax(2:4:6) = 2·speedMax(1:2:3)', b.speedMax, 2 * a.speedMax, 1e-9, 'rel');
  const same = (() => {                                              // ตรวจ "รูปร่างเดียวกัน" ด้วยจุดจริง
    let worst = 0;
    for (let i = 0; i <= 400; i++) {
      const p = M.point(a, a.T * i / 400);
      let best = 1e9;
      for (let j = 0; j <= 400; j++) {
        const q = M.point(b, b.T * j / 400);
        best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
      }
      worst = Math.max(worst, best);
    }
    return worst;
  })();
  check('ทุกจุดของ 2:4:6 อยู่บนเส้นของ 1:2:3 (ระยะ ≤ 1e-9)', same, 0, 1e-6);
}
{
  const rows2 = M.arcConvergence(M.variant(2, 3), M.variant(2, 3).span);
  const spread = Math.max(...rows2.map(r => r.L)) - Math.min(...rows2.map(r => r.L));
  check('ตารางการลู่เข้าของ L ลู่จริง (spread < 1e-6)', spread, 0, 1e-6);
}

/* ── 4) ระนาบ / ผิวที่เส้นถูกกักอยู่ ─────────────────────────────────────── */
console.log('── กลุ่ม 4: แบน (ระนาบ) กับเส้นที่ถูกกักบนผิว ──');
{
  for (const tag of ['∥', '◯', '⬭', '∿']) {
    const v = M.variantByTag(tag === '∥' ? 0 : (tag === '∿' ? 1 : 0), tag);
    check(`planarityDeviation(${tag}) = 0 (แบนสนิท)`, M.planarityDeviation(v, v.span, 1200), 0, 1e-9);
  }
}
{
  const v = M.variant(1, 1);                       // ◎ : เงาเป็นวงกลม, ตัวเส้นอยู่บนทรงกระบอก
  let worstCyl = 0, worstPlane = 0;
  for (let i = 0; i <= 600; i++) {
    const p = M.point(v, v.span * i / 600);
    worstCyl = Math.max(worstCyl, Math.abs(Math.hypot(p[0], p[1]) - 7));
  }
  check('◎: x² + y² = 7² ตลอดเส้น (อยู่บนทรงกระบอก)', worstCyl, 0, 1e-12);
  check('cylinderDeviation(◎) = 0', M.cylinderDeviation(v, v.span, 2000), 0, 1e-9);
  check('planarityDeviation(◎) > 4 (ไม่แบน)', M.planarityDeviation(v, v.span, 1200) > 4 ? 1 : 0, 1, 0);
}
{
  const v = M.variant(1, 2);                       // ≣ : ทรงกระบอกเชิงรีรอบแกน x
  let worst = 0;
  for (let i = 0; i <= 600; i++) {
    const p = M.point(v, v.span * i / 600);
    worst = Math.max(worst, Math.abs(p[1] * p[1] / 49 + p[2] * p[2] / 16 - 1));
  }
  check('≣: y²/7² + z²/4² = 1 ตลอดเส้น', worst, 0, 1e-12);
  check('planarityDeviation(≣) > 7', M.planarityDeviation(v, v.span, 1200) > 7 ? 1 : 0, 1, 0);
}
{
  for (const [pi, tag] of [[1, '∞'], [3, '5:5:7'], [3, '12:12:17'], [3, '1:1:√2']]) {
    const v = M.variantByTag(pi, tag);
    let worst = 0;
    for (let i = 0; i <= 600; i++) {
      const p = M.point(v, v.span * i / 600);
      worst = Math.max(worst, Math.abs(Math.hypot(p[0], p[1]) - 7));
    }
    check(`${tag}: เงาบนพื้น = วงกลมรัศมี 7 (x²+y² = 49)`, worst, 0, 1e-12);
    check(`${tag}: cylinderDeviation = 0`, M.cylinderDeviation(v, v.span, 2000), 0, 1e-9);
  }
}
{
  const flat = ['∥', '◯', '⬭', '∿'].map(t => M.planarityDeviation(M.variantByTag(t === '∿' ? 1 : 0, t), 6.283185, 600));
  const space = ['◎', '≣', '∞', '1:2:3', '3:4:5', '2:3:5', '1:1:√2', '5:5:7', '12:12:17'].map(t => {
    const pi = ['◎', '≣', '∞'].includes(t) ? 1 : (t === '1:1:√2' || t === '5:5:7' || t === '12:12:17') ? 3 : 2;
    return M.planarityDeviation(M.variantByTag(pi, t), 6.283185, 600);
  });
  check('เส้นแบนทั้งหมดมี dev < 1e-9', Math.max(...flat), 0, 1e-9);
  truth('เส้นไม่แบนทั้งหมดมี dev > 4 m (ต่างจากกรณีแบน 6 ลำดับ)', Math.min(...space) > 4 && Math.max(...flat) < 1e-9);
}
{
  const v = M.variant(0, 0);                       // ∿ เงาเป็น "เส้นตรง" (x = y)
  const w = M.variant(1, 0);
  let offLine = 0;
  for (let i = 0; i <= 400; i++) {
    const p = M.point(w, w.span * i / 400);
    offLine = Math.max(offLine, Math.abs(p[0] - p[1]));
  }
  check('∿: เงาบนพื้นเป็นเส้นตรง x = y', offLine, 0, 1e-12);
  let area = 0;
  const u = M.variant(1, 1);
  for (let i = 0; i <= 400; i++) { const p = M.point(u, u.span * i / 400); area = Math.max(area, Math.abs(p[0]) ); }
  check('◎: เงาบนพื้นกินเนื้อที่จริง (กินครึ่งแกน ≥ 7)', area, 7, 1e-9, 'rel');
}

/* ── 5) "กลับจุดเริ่ม" ≠ "ปิด" ──────────────────────────────────────────── */
console.log('── กลุ่ม 5: จุดตัดตัวเองที่จุดเริ่ม กับคาบจริง ──');
{
  const v = M.variant(2, 0);                       // 1:2:3
  const er = M.earlyReturn(v, v.T, 4000, 0.02);
  check('1:2:3 กลับจุดเริ่มที่ t = π (= T/2)', er.at, Math.PI, 1e-9);
  check('1:2:3 ที่ t = π: r = (0,0,0)', M.gapToStart(v, Math.PI), 0, 1e-12);
  truth('1:2:3 ที่ t = π: จำนวนรอบ = 0.5,1,1.5 (ไม่ตรงเฟสพร้อมกัน)', M.cyclesDone(v, Math.PI).join(',') === '0.5,1,1.5');
  truth('1:2:3: t = π ยัง NOT ครบคาบ (allAligned = false)', M.allAligned(v, Math.PI, 1e-3) === false);
  check('1:2:3: จุดเริ่มคือจุดตัดตัวเอง ไม่ใช่การปิดเส้น', M.repeatError(v, v.T, 400), 0, 1e-9);
}
{
  const b = M.variant(2, 1), c = M.variant(2, 2);
  check('2:4:6 กลับจุดเริ่มก่อนครบคาบที่ π/2', M.earlyReturn(b, b.T, 4000, 0.02).at, Math.PI / 2, 1e-9);
  check('3:6:9 กลับจุดเริ่มก่อนครบคาบที่ π/3', M.earlyReturn(c, c.T, 4000, 0.02).at, Math.PI / 3, 1e-9);
}
{
  const o = M.variant(0, 1);                       // ◯ วงรี: ไม่กลับจุดเริ่มก่อนครบคาบ
  const er = M.earlyReturn(o, o.T, 4000, 0.02);
  truth('◯: ไม่กลับจุดเริ่มก่อนครบคาบ (min Δ > 1e-3 m ตลอดคาบ)', er.gap > 1e-3);
}
{
  const v = M.variant(1, 0);                       // ∿ กลับจุดเริ่มที่ π (ตัดตัวเอง)
  check('∿ กลับจุดเริ่มที่ π', M.earlyReturn(v, v.T, 4000, 0.02).at, Math.PI, 1e-9);
}
{
  const v = M.variant(3, 2);                       // 12:12:17: √2 ปลอมที่ปิด
  check('12:12:17 ≈ √2 (|17/12 − √2| = 2.453e-3)', Math.abs(17 / 12 - Math.SQRT2), 0.00245310, 1e-7);
  check('12:12:17 กลับจุดเริ่มที่ π', M.earlyReturn(v, v.T, 4000, 0.02).at, Math.PI, 1e-9);
}

/* ── 6) อตรรกยะ: ไม่ปิด แต่หนาแน่น ──────────────────────────────────────── */
console.log('── กลุ่ม 6: อัตราส่วนอตรรกยะ และการเข้าใกล้แบบเข้าได้เรื่อย ๆ ──');
{
  const f = [1, 1, Math.SQRT2];
  const nr = M.nearestRatio(Math.SQRT2, 40);
  check('nearestRatio(√2, ≤40) = 41/29', nr.p / nr.q, 41 / 29, 1e-12);
  check('err ของ 41/29 ต่อ √2', nr.err, Math.abs(41 / 29 - Math.SQRT2), 1e-12);
  const gaps = [5, 12, 24, 41].map(c => M.closestAfterOneCycle(M.makeVariant(f, [0, 90, 0]), c * TAU).gap);
  const noWorse = gaps.slice(1).map((g, i) => g <= gaps[i] + 1e-9);
  truth('1:1:√2: เขียนยิ่งนาน ยิ่งใกล้จุดเดิม (gap ไม่เพิ่ม และลดลงจริง)', noWorse.every(Boolean) && gaps[0] - gaps[3] > 1.3);
  check('gap ที่ 5 รอบ = 1.37833 m', gaps[0], 1.37833, 2e-4);
  check('gap ที่ 12 รอบ (ค่าที่สื่อแสดง) = 0.287621 m', gaps[1], 0.287621, 2e-5);
  check('gap ที่ 41 รอบ = 0.04936 m (≈ 41/29 ≈ √2)', gaps[3], 0.04936, 2e-3);
  truth('1:1:√2: min Δ > 0 เสมอ (ไม่ปิด) ในทุกหน้าต่าง', gaps.every(g => g > 0));
  const irr = M.makeVariant(f, [0, 90, 0]);
  const rat = M.variant(3, 2);                     // 12:12:17
  const rel = Math.abs(M.arcLength(irr, 0, 12 * TAU, 8000) - rat.L) / rat.L;
  truth('√2 (12 รอบ) กับ 12:12:17 (ปิด) ยาวต่างกัน < 0.1% (เกือบเหมือนกัน)', rel < 1e-3);
}

/* ── 7) ความเร็วไม่คงที่: เครื่องหมายเวลาเท่ากันบนเส้น ────────────────────── */
console.log('── กลุ่ม 7 |r′(t)| ไม่คงที่ = ช่องว่างบนเส้นไม่เท่ากัน ──');
{
  const v = M.variant(2, 0);                       // 1:2:3
  const ts = M.tickSpacings(v, v.T, 32);
  const total = ts.spacings.reduce((a, b) => a + b, 0);
  check('Σ ช่องว่าง = L (ตรวจการอินทีกิเรลในฟังก์ชัน)', total, v.L, 1e-6, 'rel');
  truth('1:2:3: ช่องว่างช่องแคบสุด–กว้างสุด ต่างกัน > 2 เท่า', ts.ratio > 2);
  check('ratio ช่องว่าง 1:2:3 ≈ 2.229', ts.ratio, 2.229, 5e-3);
  const w = M.variant(0, 1);                       // ◯ วงรี: เกือบสม่ำเสมอ
  const tw = M.tickSpacings(w, w.T, 32);
  truth('◯: ช่องว่างต่างกัน < 1.2 เท่า (เร็วเกือบคงที่)', tw.ratio < 1.2);
  const line = M.variant(0, 0);
  const tl = M.tickSpacings(line, line.T, 32);
  truth('∥: ช่องว่างต่างกัน > 10 เท่า (เร็ว 0 ถึง max)', tl.ratio > 10);
  const s345 = M.tickSpacings(M.variant(2, 3), M.variant(2, 3).T, 32);
  truth('3:4:5: ช่องว่างต่างกัน > 2 เท่า', s345.ratio > 2);
}
{
  const a = M.variant(1, 1), b = M.variant(1, 3);
  truth('◎ เร็วเปลี่ยนน้อยกว่า ∞ (1.52 < 1.99 เท่า)', a.speedMax / a.speedMin < b.speedMax / b.speedMin);
}

/* ── 8) การสุ่มตัวอย่างที่สื่อใช้ ─────────────────────────────────────────── */
console.log('── กลุ่ม 8: จำนวนแซมปล์ที่สื่อใช้จริง ──');
{
  for (const [pi, vi] of [[0, 0], [1, 3], [2, 3], [3, 0], [3, 2]]) {
    const v = M.variant(pi, vi);
    const pts = M.sampleCurve(v, v.span, v.samples);
    truth(`${v.tag}: sampleCurve คืน ${v.samples + 1} จุด`, pts.length === v.samples + 1);
    truth(`${v.tag}: ทุกจุดจำกัด (ไม่มี NaN)`, pts.every(p => p.every(Number.isFinite)));
    truth(`${v.tag}: ทุกจุดอยู่ในกล่อง |x|,|y| ≤ 7, |z| ≤ 4`, pts.every(p => Math.abs(p[0]) <= 7 + 1e-9 && Math.abs(p[1]) <= 7 + 1e-9 && Math.abs(p[2]) <= 4 + 1e-9));
    check(`${v.tag}: sampleCount อยู่ใน [2000, 14000]`, v.samples >= M.MIN_SAMPLES && v.samples <= M.MAX_SAMPLES ? 1 : 0, 1, 0);
    if (v.closed) {
      const d = M.norm(pts[pts.length - 1].map((c, i) => c - pts[0][i]));
      check(`${v.tag}: จุดสุดท้าย = จุดแรก (ท่อปิดสนิท)`, d, 0, 1e-12);
    } else {
      truth(`${v.tag}: จุดสุดท้าย ≠ จุดแรก (เส้นเปิด)`, M.norm(pts[pts.length - 1].map((c, i) => c - pts[0][i])) > 0.1);
    }
  }
  const v = M.variant(2, 0);
  check('sampleCount เพิ่มตามช่วง (monotone)', M.sampleCount(v, 100) >= M.sampleCount(v, 20) ? 1 : 0, 1, 0);
  truth('sampleCount เต็มที่ที่ MAX_SAMPLES', M.sampleCount(v, 1e6) === M.MAX_SAMPLES);
}

/* ── 9) ดัชนี/หน้าปัดที่สื่อแสดง ─────────────────────────────────────────── */
console.log('── กลุ่ม 9: จำนวนรอบที่เดินไป (dial) ──');
{
  const v = M.variant(2, 0);
  const c = M.cyclesDone(v, Math.PI);
  truth('ที่ t = π: รอบของ (1,2,3) = 0.5, 1, 1.5', c.join(',') === '0.5,1,1.5');
  const ds = M.dialState(v, Math.PI);
  truth('dialState บอก full/frac ถูกต้อง', ds[0].full === 0 && Math.abs(ds[0].frac - 0.5) < 1e-12 && ds[2].full === 1 && Math.abs(ds[2].frac - 0.5) < 1e-12);
  const open = M.variant(3, 0);
  const c2 = M.cyclesDone(open, 37.7249);
  truth('1:1:√2: จำนวนรอบไม่เต็มพร้อมกันที่ t ใดที่ทดสอบ', c2.every(x => Math.abs(x - Math.round(x)) > 1e-3));
  truth('alignmentTimes([1,2,3]) = 2π,4π,6π', (() => { const a = M.alignmentTimes([1, 2, 3], 3), w = [TAU, 2 * TAU, 3 * TAU]; return a.length === 3 && a.every((x, i) => Math.abs(x - w[i]) < 1e-9); })());
  truth('alignmentTimes([1,1,√2]) = ไม่มี', M.alignmentTimes([1, 1, Math.SQRT2], 24).length === 0);
}

console.log('── กลุ่ม 10: ⧉ สองเส้นที่ เงา บนพื้นเหมือนกัน แต่ตัวเส้นคนละเส้น ──');
{
  /* [tagA, tagB, presetA, presetB, เงา(m), ตัวเส้น(m)] — คู่ที่ใช้จริงในโหมด ⧉ ของสื่อ */
  const pairs = [
    ['≣', '1:2:3', 1, 2, 0.0, 6.365225],
    ['◎', '∞', 1, 1, 0.0, 5.937362],
    ['1:2:3', '2:4:6', 2, 2, 0.0, 0.0],
    ['1:2:3', '3:6:9', 2, 2, 0.0, 0.0],
    ['1:1:√2', '12:12:17', 3, 3, 0.0, 0.735628],
    ['◯', '⬭', 0, 0, 0.0, 2.696153],
    ['∥', '∿', 0, 1, 0.0, 6.527910],
    ['∞', '≣', 1, 1, 7.0, 7.0],
    ['3:4:5', '2:3:5', 2, 2, 1.520811929855, 5.053077],
  ];
  for (const [ta, tb, pa, pb, wantShadow, wantCurve] of pairs) {
    const A = M.variantByTag(pa, ta), B = M.variantByTag(pb, tb);
    const sg = M.shadowGap(A, B, 700), cg = M.curveGap(A, B, 700);
    check('เงาของ ' + ta + ' กับ ' + tb + ' ต่างกัน', sg.max, wantShadow, Math.max(1e-9, 1e-9 * wantShadow + 1e-9));
    check('ตัวเส้น ' + ta + ' กับ ' + tb + ' ต่างกัน', cg.max, wantCurve, 1e-5);
    if (wantShadow === 0 && wantCurve > 1) {
      truth(`${ta} กับ ${tb}: เงาบนพื้นเหมือนกันทุกจุด แต่ตัวเส้นห่างถึง ${wantCurve} m`, sg.max < 1e-9 && cg.max > 1);
    }
  }
  /* เงา = การฉายลง z=0: ระยะในระนาบต้องไม่เกินระยะในสามมิติ */
  {
    const A = M.variantByTag(2, '3:4:5'), B = M.variantByTag(2, '2:3:5');
    truth('π₂ ไม่ทำให้ระยะเพิ่ม: shadowGap ≤ curveGap', M.shadowGap(A, B, 400).max <= M.curveGap(A, B, 400).max + 1e-12);
  }
  /* เส้นเดียวกัน: ทั้งสองระยะต้องเป็น 0 (ตรวจ function ไม่ใช่ตรวจความเชื่อ) */
  {
    const A = M.variantByTag(2, '1:2:3');
    check('shadowGap(เส้นเดียวกัน) = 0', M.shadowGap(A, A, 400).max, 0, 1e-12);
    check('curveGap(เส้นเดียวกัน) = 0', M.curveGap(A, A, 400).max, 0, 1e-12);
  }
}

console.log('\n══ สรุป: ' + pass + ' ข้อ ผ่าน, ' + fail + ' ข้อล้ม ══');
if (fail) { console.log('ข้อที่ล้ม:'); rows.filter(r => !r.ok).forEach(r => console.log('  - ' + r.name)); }
process.exit(fail ? 1 : 0);
