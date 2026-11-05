#!/usr/bin/env node
/* ╔══════════════════════════════════════════════════════════════════════════╗
   ║ math_check.mjs — ตรวจ math_core.mjs ด้วยคำตอบปิด (ไม่อ่านค่าจากสื่อ)            ║
   ╚══════════════════════════════════════════════════════════════════════════╝
   ทุกข้อคำนวณคำตอบที่ถูกต้องขึ้นเองในไฟล์นี้ (เมทริกซ์ที่สร้างจากค่าที่รู้จริง,
   สูตร variance ของ sample covariance, ขอบเขตของ sampling error แบบ
   Davis–Kahan) แล้วเทียบกับการทำงานจริงของ math_core — ไม่มีข้อใดอ่านค่าจาก index.html

   คำตอบปิด / ขอบเขตที่ใช้:
     A) C = R·diag(9,4,1)·Rᵀ เมื่อ R คือการหมุนที่รู้ตัว → λ ต้องเป็น 9,4,1 ตรงตัว
        และ eigenvector ต้องขนานกับเสาหลักของ R (|cos| = 1)
     B) C = diag(5,5,1) (λ₁ = λ₂): λ ตรงตัว, vᵢ ตั้งฉากกัน, ‖Cv−λv‖ = 0
        (ทิศในระนาบย่อยไม่ unique — ตรวจว่า "ไม่ผิด" ไม่ได้ตรวจว่า "ทิศใด")
     C) C ที่มี λ₃ = 0 (ข้อมูลแบนสนิท) → λ = (3,2,0)
     D) มาตราส่วน: eigen(k·C) = k·eigen(C) ทุก k ตั้งแต่ 1e-6 ถึง 1e6
     E) เอกลักษณ์ของเมทริกซ์ 3×3 ที่ λ ทุกตัวต้อง obey:
        Σλ = tr C · Σ_{i<j} λᵢλⱼ = ½((tr C)² − tr(C²)) · Πλ = det C
        และ λ³ + c₂λ² + c₁λ + c₀ = 0 (พหุนามลักษณะเฉพาะ)
     F) Gaussian sampling (X ~ N(0,Σ)):  E[Ĉ] = Σ และ
        Var(Ĉᵢⱼ) = (ΣᵢᵢΣⱼⱼ + Σᵢⱼ²)/(n−1)  →  ขอบเขต 4σ ของ λ̂ᵢ (sd สัมพัทธ์ = √(2/(n−1)))
        และของ tr Ĉ; ทิศ: sin θ ≤ ‖Ĉ−Σ‖_F/gap (Davis–Kahan) ใช้ 3× ค่าคาดหมาย
     H) ellipsoid ครึ่งแกน 2σ ครอบข้อมูล = P(χ²₃ ≤ 4) = 0.738603 (คำนวณสองทาง:
        erf route + incomplete-gamma recursion) และ λ̂ sandwich:
        λ̂ ∈ [λ(1−δ),λ(1+δ)] ⟹ P(χ²₃ ≤ 4(1−δ)) ≤ f̂ ≤ P(χ²₃ ≤ 4(1+δ))
     I) แบบแผนเวที + ตัวคูณกระจุก k (1…CLUSTER_MAX): เพดานยาว/สูง/ลึก = 1.50/1.10/1.40 m × k,
        dist = max(1.40 + ครึ่งความลึกที่วาดจริง, longMax/2), baseBottom คงที่ 1.00 m —
        ตรวจ geometry ที่วาดจริงจากการ map ข้อมูล → โลก ด้วยโค้ดอิสระในไฟล์นี้ ทุกค่า k
     G) การฉาย: Var(residual) = tr C − Σ vᵀCv (เอกลักษณ์แท้ ไม่ขึ้นกับ n),
        Var(พิกัดบน v) = vᵀCv, Pythagoras ‖q‖² = ‖proj‖² + ‖resid‖² ต่อจุด,
        residual ⊥ ทุกทิศใน basis, และ vᵀCv ≤ λ₁ ทุกทิศ (PC1 ให้ค่ามากสุดเสมอ)

   usage:  node tools/math_check.mjs            # สรุป
           node tools/math_check.mjs --verbose  # พิมพ์ทุกข้อ
*/
import * as M from './math_core.mjs';

const TAU = Math.PI * 2, DEG = Math.PI / 180;
let pass = 0, fail = 0;
const verbose = process.argv.includes('--verbose');
const rows = [];

function check (name, got, want, tol, mode = 'abs') {
  const d = mode === 'rel' ? Math.abs(got - want) / Math.max(1e-12, Math.abs(want)) : Math.abs(got - want);
  const ok = Number.isFinite(got) && d <= tol;
  rows.push({ ok, name, got, want, d });
  if (ok) pass++; else fail++;
  if (!ok || verbose) console.log((ok ? 'ok   ' : 'FAIL ') + name.padEnd(58) + ' got=' + fmt(got) + ' want=' + fmt(want) + ' |d|=' + d.toExponential(2));
}
const truth = (name, cond, detail = '') => {
  rows.push({ ok: !!cond, name });
  if (cond) pass++; else { fail++; console.log('FAIL ' + name + ' ' + detail); }
  if (verbose && cond) console.log('ok   ' + name + ' ' + detail);
};
const fmt = (x) => (typeof x !== 'number' ? String(x) : (Number.isInteger(x) ? String(x) : x.toFixed(10)));
/** ข้อ_assert แบบ "ต้องไม่เกิน" (upper bound) — ต่างจาก check ที่เทียบค่าเป้าหมาย */
function leq (name, got, upper, tol) {
  const ok = Number.isFinite(got) && got <= upper + tol;
  rows.push({ ok, name });
  if (ok) pass++; else fail++;
  if (!ok || verbose) console.log((ok ? 'ok   ' : 'FAIL ') + name.padEnd(58) + ' got=' + fmt(got) + ' must ≤ ' + fmt(upper) + ' (+' + tol.toExponential(1) + ')');
}

/* ── เครื่องมืออิสระ (ไม่เรียก math_core) ─────────────────────────────────── */
const mm = (A, B) => {
  const o = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  return o;
};
const tr = (A) => A[0][0] + A[1][1] + A[2][2];
const fro = (A) => Math.sqrt(A.reduce((s, r) => s + r.reduce((t, x) => t + x * x, 0), 0));
const Rz = (d) => [[Math.cos(d), -Math.sin(d), 0], [Math.sin(d), Math.cos(d), 0], [0, 0, 1]];
const Rx = (d) => [[1, 0, 0], [0, Math.cos(d), -Math.sin(d)], [0, Math.sin(d), Math.cos(d)]];
const Ry = (d) => [[Math.cos(d), 0, Math.sin(d)], [0, 1, 0], [-Math.sin(d), 0, Math.cos(d)]];
const T3 = (A) => [[A[0][0], A[1][0], A[2][0]], [A[0][1], A[1][1], A[2][1]], [A[0][2], A[1][2], A[2][2]]];
const buildC = (R, l) => mm(mm(R, [[l[0], 0, 0], [0, l[1], 0], [0, 0, l[2]]]), T3(R));   // C = R·diag(l)·Rᵀ
const sym = (A) => Math.max(Math.abs(A[0][1] - A[1][0]), Math.abs(A[0][2] - A[2][0]), Math.abs(A[1][2] - A[2][1]));
/** mean + covariance อิสระ (นิยามตรงตัว ไม่เรียก math_core) */
function covRef (pts) {
  const n = pts.length, mu = [0, 0, 0];
  for (const p of pts) for (let i = 0; i < 3; i++) mu[i] += p[i];
  for (let i = 0; i < 3; i++) mu[i] /= n;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) { const q = [p[0] - mu[0], p[1] - mu[1], p[2] - mu[2]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += q[i] * q[j]; }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] /= (n - 1);
  return { C, mu };
}
/** eigen อิสระ: power iteration + deflation (คนละอัลกอริทึมกับ Jacobi) */
function eigRef (C, iters = 6000) {
  const out = []; let A = C.map((r) => r.slice());
  for (let k = 0; k < 3; k++) {
    let v = [1, 0, 0], lam = 0;
    const B = A.map((r, i) => r.map((x, j) => x + (i === j ? 10 : 0)));   // shift ให้ dominant = λ_max
    for (let it = 0; it < iters; it++) {
      let w = [0, 0, 0];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) w[i] += B[i][j] * v[j];
      const n = Math.hypot(...w) || 1; v = w.map(x => x / n);
    }
    let rq = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) rq += v[i] * B[i][j] * v[j];
    lam = rq - 10;                                                    // Rayleigh quotient ของ B − shift
    out.push({ lam, v });
    // deflate: A ← A − λ v vᵀ
    A = A.map((r, i) => r.map((x, j) => x - lam * v[i] * v[j]));       // deflate: A ← A − λ v vᵀ
  }
  out.sort((a, b) => b.lam - a.lam);
  return { values: out.map(o => o.lam), vectors: out.map(o => o.v) };
}

console.log('══ math_check — ตรวจ math_core.mjs กับคำตอบปิด ══\n');

/* ═══ 1. ตัวช่วยเวกเตอร์/เมทริกซ์ ═══════════════════════════════════════════ */
console.log('── 1. เวกเตอร์และเมทริกซ์ 3×3 ──');
{
  const a = [1, 2, 3], b = [4, -5, 6];
  check('vDot((1,2,3),(4,-5,6)) = 4−10+18 = 12', M.vDot(a, b), 1 * 4 + 2 * (-5) + 3 * 6, 1e-15);
  const c = M.vCross(a, b);
  check('vCross x = 2·6−3·(−5) = 27', c[0], 2 * 6 - 3 * (-5), 1e-15);
  check('vCross y = 3·4−1·6 = 6', c[1], 3 * 4 - 1 * 6, 1e-15);
  check('vCross z = 1·(−5)−2·4 = −13', c[2], 1 * (-5) - 2 * 4, 1e-15);
  check('vCross ⊥ a', M.vDot(c, a), 0, 1e-15);
  check('vCross ⊥ b', M.vDot(c, b), 0, 1e-15);
  check('vLen((3,4,0)) = 5', M.vLen([3, 4, 0]), 5, 1e-15);
  check('‖vNorm(a)‖ = 1', M.vLen(M.vNorm(a)), 1, 1e-15);
  const R = Rz(37 * DEG);
  check('mDet(Rz(37°)) = 1', M.mDet(R), 1, 1e-14);
  const P = mm(R, Rz(13 * DEG));
  check('mDet(Rz(37°)·Rz(13°)) = 1', M.mDet(P), 1, 1e-13);
  check('mTrace(Rz(37°)) = 1+2cos37°', M.mTrace(R), 1 + 2 * Math.cos(37 * DEG), 1e-15);
  /* det ของเมทริกซ์ที่รู้คำตอบ: [[2,0,0],[0,3,0],[0,0,4]] = 24 */
  check('mDet(diag(2,3,4)) = 24', M.mDet([[2, 0, 0], [0, 3, 0], [0, 0, 4]]), 24, 1e-15);
  /* char poly ของ diag(9,4,1): c2 = −14, c1 = 9·4+9·1+4·1 = 49, c0 = −36 */
  const cp = M.mCharPoly([[9, 0, 0], [0, 4, 0], [0, 0, 1]]);
  check('charPoly c2 = −(9+4+1) = −14', cp.c2, -14, 1e-12);
  check('charPoly c1 = 9·4+9·1+4·1 = 49', cp.c1, 49, 1e-12);
  check('charPoly c0 = −36', cp.c0, -36, 1e-12);
  const Cg = buildC(mm(Rz(20 * DEG), Ry(35 * DEG)), [7, 3, 2]);
  const cpg = M.mCharPoly(Cg);
  check('charPoly c2 = −tr C (C หมุน 3 แกน)', cpg.c2, -tr(Cg), 1e-12);
  check('charPoly c1 = ½((tr C)²−tr(C²))', cpg.c1, 0.5 * (tr(Cg) ** 2 - mm(Cg, Cg).reduce((s, r, i) => s + r[i], 0)), 1e-10);
  check('charPoly c0 = −det C', cpg.c0, -M.mDet(Cg), 1e-12);
  truth('mMulVec/mMul ใช้ถูกทิศ (R·(Rᵀx) = x)', (() => {
    const x = [0.3, -1.2, 2.5], y = M.mMulVec(R, M.mMulVec(M.mTranspose(R), x));
    return Math.max(...y.map((v, i) => Math.abs(v - x[i]))) < 1e-14;
  })());
}

/* ═══ 2. ตัวสุ่ม: ทำซ้ำได้ + การกระจายถูก ═══════════════════════════════════ */
console.log('── 2. PRNG / Gaussian / การหมุนแบบสม่ำเสมอ ──');
{
  const r1 = M.rng(42), r2 = M.rng(42), r3 = M.rng(43);
  const s1 = [], s2 = [], s3 = [];
  for (let i = 0; i < 200; i++) { s1.push(r1()); s2.push(r2()); s3.push(r3()); }
  truth('rng(seed) ให้ลำดับเดียวกันทุกครั้งที่ seed เท่ากัน', s1.every((x, i) => x === s2[i]));
  truth('rng(seed≠) ให้ลำดับต่างกัน', s1.some((x, i) => Math.abs(x - s3[i]) > 1e-9));
  truth('rng อยู่ในช่วง [0,1)', s1.every(x => x >= 0 && x < 1));
  /* mean 0, var 1 ของ Box–Muller */
  const rn = M.randnFactory(M.rng(7)); let sm = 0, sq = 0, q4 = 0; const N = 40000;
  for (let i = 0; i < N; i++) { const x = rn(); sm += x; sq += x * x; q4 += x ** 4; }
  const mean = sm / N, variance = sq / N, m4 = q4 / N;
  check('E[N(0,1)] ≈ 0', mean, 0, 0.02);
  check('Var[N(0,1)] ≈ 1', variance, 1, 0.02);
  check('E[x⁴] = 3 (Gaussian)', m4, 3, 0.12);
  /* การหมุน: R Rᵀ = I, det = +1 */
  let worstOrtho = 0, worstDet = 0;
  for (let s = 1; s <= 120; s++) {
    const R = M.randomRotation(M.rng(s));
    const G = mm(R, M.mTranspose(R));
    worstOrtho = Math.max(worstOrtho, Math.max(...G.flatMap((r, i) => r.map((x, j) => Math.abs(x - (i === j ? 1 : 0))))));
    worstDet = Math.max(worstDet, Math.abs(M.mDet(R) - 1));
  }
  check('randomRotation: ‖R Rᵀ − I‖∞ ≈ 0 (120 seeds)', worstOrtho, 0, 1e-12);
  check('randomRotation: det R = +1 ทุก seed', worstDet, 0, 1e-12);
  let worstUnit = 0;
  for (let s = 1; s <= 200; s++) { const u = M.randomUnitDir(M.rng(s)); worstUnit = Math.max(worstUnit, Math.abs(M.vLen(u) - 1)); }
  check('randomUnitDir: ‖u‖ = 1 (200 seeds)', worstUnit, 0, 1e-14);
  /* ทิศกระจายสม่ำเสมอ: ค่าเฉลี่ยของ u ~ 0 */
  let sx = 0, sy = 0, sz = 0;
  for (let s = 1; s <= 6000; s++) { const u = M.randomUnitDir(M.rng(s)); sx += u[0]; sy += u[1]; sz += u[2]; }
  check('randomUnitDir: E[u] ≈ 0 (6000 ทิศ)', Math.hypot(sx, sy, sz) / 6000, 0, 0.02);
}

/* ═══ 3. eigen ของเมทริกซ์ที่รู้คำตอบจริง ═══════════════════════════════════ */
console.log('── 3. Jacobi eigen บนกรณีที่มีคำตอบปิด ──');
{
  const cases = [
    ['diag(9,4,1) ไม่หมุน', buildC([[1,0,0],[0,1,0],[0,0,1]], [9, 4, 1]), [9, 4, 1]],
    ['Rz(30°)·diag(9,4,1)', buildC(Rz(30 * DEG), [9, 4, 1]), [9, 4, 1]],
    ['Rz(20°)Ry(35°)Rx(50°)·diag(7,3,2)', buildC(mm(mm(Rz(20 * DEG), Ry(35 * DEG)), Rx(50 * DEG)), [7, 3, 2]), [7, 3, 2]],
    ['λ เท่ากันคู่หนึ่ง diag(5,5,1)', [[5, 0, 0], [0, 5, 0], [0, 0, 1]], [5, 5, 1]],
    ['แบนสนิท λ₃ = 0', buildC(Rz(-45 * DEG), [3, 2, 0]), [3, 2, 0]],
    ['ค่าclose กัน (1.000,0.999,0.001)', buildC(Ry(15 * DEG), [1, 0.999, 0.001]), [1, 0.999, 0.001]],
    ['มาตราส่วนจิ๋ว 1e-6·diag(9,4,1)', buildC(Rz(11 * DEG), [9e-6, 4e-6, 1e-6]), [9e-6, 4e-6, 1e-6]],
    ['มาตราส่วนมหึมา 1e6·diag(9,4,1)', buildC(Rx(77 * DEG), [9e6, 4e6, 1e6]), [9e6, 4e6, 1e6]],
  ];
  for (const [name, C, want] of cases) {
    const e = M.jacobiEigen(C);
    const w = want.slice().sort((a, b) => b - a);
    for (let i = 0; i < 3; i++) {
      const tol = Math.max(1e-12, 1e-12 * Math.abs(w[i]));
      check('λ' + i + ' ' + name, e.values[i], w[i], tol);
      check('‖Cv−λv‖ ' + name + ' i=' + i, e.residuals[i], 0, Math.max(1e-11, 1e-11 * Math.abs(w[0])));
    }
    check('ตั้งฉากทุกคู่ ' + name, e.orthoErr, 0, 1e-12);
    check('‖v‖=1 ' + name, e.lenErr, 0, 1e-14);
    check('λ เรียงลดหลั่น ' + name, (e.values[0] >= e.values[1] - 1e-15) && (e.values[1] >= e.values[2] - 1e-15) ? 1 : 0, 1, 0.5);
    check('tr = Σλ ' + name, M.mTrace(C), e.values.reduce((s, x) => s + x, 0), Math.max(1e-11, 1e-12 * Math.abs(w[0])));
    leq('|Πλ − det C| ≤ 1e-9·|det C| ' + name, Math.abs(M.mDet(C) - e.values[0] * e.values[1] * e.values[2]), 1e-9 * Math.abs(M.mDet(C)) + 1e-12, 0);
    const cp = M.mCharPoly(C);
    for (let i = 0; i < 3; i++) {
      const L = e.values[i];
      check('λᵢ obey λ³+c₂λ²+c₁λ+c₀=0 ' + name + ' i=' + i, L ** 3 + cp.c2 * L * L + cp.c1 * L + cp.c0, 0, Math.max(1e-10, 1e-10 * Math.abs(w[0]) ** 3));
    }
    /* eigenvector เทียบกับเสาหลักของ R ที่ใช้สร้าง (กรณี λ ไม่ชนกัน) */
    if (name.includes('Rz(30°)')) {
      const R = Rz(30 * DEG);
      for (let i = 0; i < 3; i++) {
        const known = R.map(r => r[i]);
        check('|cos(v' + i + ', เสาหลักของ R)| = 1', Math.abs(M.vDot(e.vectors[i], known)), 1, 1e-11);
      }
    }
    /* กรณี λ เท่ากัน: ทิศไม่ unique แต่ต้องอยู่ในระนาบเดียวกัน */
    if (name.includes('λ เท่ากัน')) {
      const v0 = e.vectors[0], v1 = e.vectors[1];
      const inPlane = Math.abs(v0[2]) < 1e-12 && Math.abs(v1[2]) < 1e-12;
      truth('ระนาบ eigenspace ของ λ₁=λ₂ = ระนาบ xy จริง', inPlane, '|v_z| = ' + Math.max(Math.abs(v0[2]), Math.abs(v1[2])).toExponential(1));
      check('λ₃ ตรงตัว (กรณี λ ชนกัน)', e.values[2], 1, 1e-12);
    }
  }
  /* เทียบกับ eigen วิธีอื่น (power iteration + deflation) บน C สมมติ 6 ชุด */
  for (let s = 1; s <= 6; s++) {
    const C = buildC(M.randomRotation(M.rng(s * 31 + 5)), [6.5, 2.1, 0.4].map(x => x * (1 + 0.1 * s)));
    const e = M.jacobiEigen(C), r = eigRef(C);
    for (let i = 0; i < 3; i++) check('Jacobi vs power-iteration λ' + i + ' (seed ' + s + ')', e.values[i], r.values[i], 2e-6);
  }
}

/* ═══ 4. กระจุกข้อมูล: สร้างซ้ำได้ + กู้คืน λ ของกระบวนการได้ ═══════════════ */
console.log('── 4. makeCloud: Gaussian ellipsoid จริง ──');
{
  const a = M.makeCloud(2024, 300), b = M.makeCloud(2024, 300), c = M.makeCloud(2025, 300);
  truth('makeCloud(seed,n) ทำซ้ำได้บิตต่อบิต', a.points.every((p, i) => p.every((v, j) => v === b.points[i][j])));
  truth('seed ต่างกัน → ข้อมูลต่างกัน', a.points.some((p, i) => Math.abs(p[0] - c.points[i][0]) > 1e-6));
  check('design.R เป็นเมทริกซ์หมุน (det=+1)', M.mDet(a.design.R), 1, 1e-12);
  check('design.popCov สมมาตร', sym(a.design.popCov), 0, 1e-15);
  const popL = M.popEigs(a).values;
  truth('σ ที่ใส่ = ค่ารากของ λ-pop ที่คำนวณกลับ', a.design.sigma.every((s, i) => Math.abs(s * s - popL[i]) < 1e-12));
  check('λ₁ > λ₂ > λ₃ (ทิศไม่ชนกัน → PCA มีคำตอบเดียว)',
    (popL[0] > popL[1] && popL[1] > popL[2] && popL[1] / popL[2] > 1.5) ? 1 : 0, 1, 0.5);

  for (const seed of [1, 7, 12345, 987654, 20261104]) {
    for (const n of [300, 900, 2400]) {
      const cl = M.makeCloud(seed, n), P = M.pcaOf(cl);
      const { C: Cref, mu: muRef } = covRef(cl.points);
      const gap = Math.min(P.values[0] - P.values[1], P.values[1] - P.values[2]);
      check('C ตรงกับ covariance ที่คำนวณอิสระ (seed ' + seed + ' n=' + n + ')',
        Math.max(...Cref.flatMap((r, i) => r.map((x, j) => Math.abs(x - P.C[i][j])))), 0, 1e-12);
      check('μ̂ ตรงกับ mean ที่คำนวณอิสระ', Math.max(...muRef.map((v, i) => Math.abs(v - P.mu[i]))), 0, 1e-12);
      /* ขอบเขต 5σ จาก Var(Ĉᵢᵢ) = Σᵢᵢ²/(n−1)  →  Var(tr Ĉ) = 2ΣΣᵢᵢ²/(n−1) */
      const popC = cl.design.popCov, popL = M.popEigs(cl).values;
      const sdTrace = Math.sqrt(2 * (popC[0][0] ** 2 + popC[1][1] ** 2 + popC[2][2] ** 2) / (n - 1));
      check('tr Ĉ อยู่ในช่วง 4σ ของ tr Σ (sampling bound)', P.trace, tr(popC), 4 * sdTrace);
      /* Var(λ̂ᵢ) ≤ 2λᵢ²/(n−1) เมื่อ eigenvalue แยกชัด (Weyl + Var ของ diagonal ในฐาน eigen) */
      for (let i = 0; i < 3; i++) {
        const relSd = Math.sqrt(2 / (n - 1));            // sd สัมพัทธ์ของ λ̂ᵢ (จาก Var = 2λᵢ²/(n−1))
        check('λ̂' + i + ' อยู่ในช่วง 4σ สัมพัทธ์ของ λᵢ-pop (n=' + n + ')', P.values[i], popL[i], 4 * relSd, 'rel');
        leq('λ̂' + i + ' ≤ λᵢ-pop + 4σ (n=' + n + ')', P.values[i], popL[i] + 4 * relSd * popL[i], 0);
      }
      /* ทิศ: Davis–Kahn  sin θ ≤ ‖Ĉ−Σ‖_F / gap ; E‖Ĉ−Σ‖_F² = ((tr Σ)²+‖Σ‖_F²)/(n−1) */
      const eF = Math.sqrt(((tr(popC)) ** 2 + fro(popC) ** 2) / (n - 1));
      const trueV = M.popEigs(cl).vectors;
      for (let i = 0; i < 3; i++) {
        const sinT = Math.sqrt(Math.max(0, 1 - M.vDot(P.vectors[i], trueV[i]) ** 2));
        const bound = 3 * eF / Math.max(gap, 1e-9);
        truth('sin θ(v̂' + i + ', vᵢ จริง) ≤ 3·E‖Ĉ−Σ‖_F/gap (seed ' + seed + ' n=' + n + ')', sinT <= Math.min(1, bound),
          'sinθ=' + sinT.toExponential(2) + ' bound=' + Math.min(1, bound).toExponential(2));
      }
      /* เอกลักษณ์ภายในของ eigen decomposition */
      check('‖Cv−λv‖ = 0 (seed ' + seed + ' n=' + n + ')', Math.max(...P.residuals), 0, 1e-11);
      check('orthonormal (seed ' + seed + ' n=' + n + ')', P.orthoErr, 0, 1e-12);
      check('Σλ = tr C (seed ' + seed + ')', P.values.reduce((s, x) => s + x, 0), P.trace, 1e-12);
      check('Πλ = det C (seed ' + seed + ')', P.values[0] * P.values[1] * P.values[2], P.det, 1e-11);
      check('Σ_{i<j}λᵢλⱼ = c1 (seed ' + seed + ')',
        P.values[0] * P.values[1] + P.values[0] * P.values[2] + P.values[1] * P.values[2], P.charPoly.c1, 1e-11);
      check('λᵢ obey characteristic polynomial (seed ' + seed + ')',
        Math.max(...P.values.map(L => Math.abs(L ** 3 + P.charPoly.c2 * L * L + P.charPoly.c1 * L + P.charPoly.c0))), 0, 1e-11);
      check('explained รวม = 1 (seed ' + seed + ')', P.explained.reduce((s, x) => s + x, 0), 1, 1e-14);
      check('cumulative ตัวสุดท้าย = 1', P.cumulative[2], 1, 1e-14);
      check('σᵢ = √λᵢ (seed ' + seed + ')', Math.max(...P.sigma.map((s, i) => Math.abs(s - Math.sqrt(P.values[i])))), 0, 1e-15);
      check('λ₁ ≥ λ₂ ≥ λ₃ ≥ 0 (seed ' + seed + ')',
        (P.values[0] >= P.values[1] && P.values[1] >= P.values[2] && P.values[2] > 0) ? 1 : 0, 1, 0.5);
      check('dirVar(vᵢ) = λᵢ (seed ' + seed + ')', Math.max(...[0, 1, 2].map(i => Math.abs(M.dirVar(P.C, P.vectors[i]) - P.values[i]))), 0, 1e-11);
      check('half[i] = max|q·vᵢ| (seed ' + seed + ')',
        (() => { let h = [0, 0, 0]; for (const p of cl.points) { const q = M.vSub(p, P.mu); for (let k = 0; k < 3; k++) h[k] = Math.max(h[k], Math.abs(M.vDot(q, P.vectors[k]))); } return Math.max(...h.map((x, i) => Math.abs(x - P.half[i]))); })(), 0, 1e-12);
      check('half[0] ≥ √λ₁ (ต้องมีจุดเกิน 1σ จริง)', P.half[0] >= Math.sqrt(P.values[0]) ? 1 : 0, 1, 0.5);
      check('radius = max‖q‖ ≥ max half (seed ' + seed + ')', P.radius >= Math.max(...P.half) - 1e-12 ? 1 : 0, 1, 0.5);
      /* PC1 ชนะทุกทิศที่สุ่มมา 8000 ทิศ */
      const scan = M.scanMaxDirVar(P.C, seed ^ 0xABCD, 8000);
      leq('maxᵤ uᵀCu ≤ λ₁ (8000 ทิศ, seed ' + seed + ')', scan.max, P.values[0], 1e-11);
      check('argmax ของการสแกนขนานกับ v₁ (seed ' + seed + ')', Math.abs(M.vDot(scan.argmax, P.vectors[0])), 1, 0.02);
      check('แกนดิบทุกแกนให้ variance ≤ λ₁ (seed ' + seed + ')',
        Math.max(...M.RAW_DIRS.map(u => M.dirVar(P.C, u))) <= P.values[0] + 1e-12 ? 1 : 0, 1, 0.5);
    }
  }
}

/* ═══ 5. การฉายลดมิติ: เอกลักษณ์ที่ต้องเป็นจริงทุกโหมด ═════════════════════ */
console.log('── 5. projection (โหมด 3 / 2 / 1 แกน และโหมดเทียบ) ──');
{
  for (const seed of [7, 12345, 20261104]) {
    const cl = M.makeCloud(seed, 900), P = M.pcaOf(cl);
    const alts = M.altBases(P);
    const modes = [
      ['3แกน', [P.vectors[0], P.vectors[1], P.vectors[2]]],
      ['PC1∧PC2', [P.vectors[0], P.vectors[1]]],
      ['PC1', [P.vectors[0]]],
      ...alts.map(a => [a.glyph, a.basis]),
    ];
    let pc1 = null, pc12 = null;
    for (const [tag, basis] of modes) {
      const R = M.projectBasis(P, basis);
      const nf = 1 / (cl.points.length - 1);
      if (tag === 'PC1') pc1 = R;
      if (tag === 'PC1∧PC2') pc12 = R;
      /* เอกลักษณ์หลัก: Var(residual) = tr C − Σ vᵀCv */
      check('identity Var(resid) = trC − ΣvᵀCv  [' + tag + ' seed ' + seed + ']', R.identityGap, 0, 1e-11);
      check('keptFrac + droppedFrac = 1 [' + tag + ']', R.keptFrac + R.droppedFrac, 1, 1e-14);
      check('rmse² = Var(resid) [' + tag + ']', R.rmseResidual ** 2, R.varResidual, 1e-13);
      check('Σ‖x−x̄‖²/(n−1) = tr Ĉ (ความแปรปรวนรวม = Σλ) [' + tag + ']', Math.abs(R.sumSqSig * nf - P.trace), 0, 1e-11);
      check('Var(พิกัดⱼ) = vⱼᵀĈvⱼ ทุก j ของ basis [' + tag + ']',
        (() => { let w = 0; basis.forEach((v, j) => { w = Math.max(w, Math.abs(R.coordVar[j] - M.dirVar(P.C, v))); }); return w; })(), 0, 1e-11);
      check('Σ‖resid‖² = Σ‖q‖² − Σ‖proj−μ‖² (Pythagoras รวม) [' + tag + ']',
        (() => { let s2 = 0, p2 = 0; for (let i = 0; i < cl.points.length; i++) { const q = M.vSub(cl.points[i], P.mu); s2 += M.vDot(q, q); const d = M.vSub(R.projs[i], P.mu); p2 += M.vDot(d, d); } return Math.abs(s2 - p2 - R.sumSqResidual); })(), 0, 1e-10);
      check('resid ⊥ ทุกทิศของ basis [' + tag + ']',
        (() => { let w = 0; for (let i = 0; i < cl.points.length; i += 7) { const r = R.resid[i]; for (const v of basis) w = Math.max(w, Math.abs(M.vDot(r, v))); } return w; })(), 0, 1e-12);
      check('proj อยู่ใน span(basis) จริง [' + tag + ']',
        (() => { let w = 0; for (let i = 0; i < cl.points.length; i += 11) { const d = M.vSub(R.projs[i], P.mu); let s = [0, 0, 0]; for (const v of basis) s = M.vAdd(s, M.vScl(v, M.vDot(d, v))); w = Math.max(w, M.vLen(M.vSub(d, s))); } return w; })(), 0, 1e-12);
      check('‖resid‖ ≤ ‖q‖ ทุกจุด [' + tag + ']', R.maxResidual <= P.radius + 1e-12 ? 1 : 0, 1, 0.5);
      if (basis.length === 1) {
        check('Var(พิกัดบน v) = vᵀCv [' + tag + ']', R.coordVarGap, 0, 1e-11);
        check('max|coord| = half ตามทิศนั้น [' + tag + ']',
          (() => { let h = 0; for (const p of cl.points) h = Math.max(h, Math.abs(M.vDot(M.vSub(p, P.mu), basis[0]))); return Math.abs(h - R.maxCoord); })(), 0, 1e-12);
      }
      if (basis.length === 2) {
        check('Σⱼ Var(พิกัดⱼ) = keptVar (basis orthonormal) [' + tag + ']',
          R.coordVar.reduce((s, x) => s + x, 0), R.keptVar, 1e-11);
      }
      /* PC1 ต้องให้มากที่สุดเสมอ */
      if (basis.length === 1 && tag !== 'PC1') leq('kept(' + tag + ') ≤ kept(PC1)  [seed ' + seed + ']', R.keptFrac, pc1.keptFrac, 1e-12);
      if (basis.length === 1 && tag !== 'PC1') truth('kept(' + tag + ') น้อยกว่า PC1 อย่างแท้จริง [seed ' + seed + ']', R.keptFrac < pc1.keptFrac - 1e-9, R.keptFrac.toFixed(6));
      if (basis.length === 2) leq('kept(' + tag + ') ≤ kept(PC1∧PC2) [seed ' + seed + ']', R.keptFrac, pc12.keptFrac, 1e-12);
      if (basis.length === 3) {
        check('ครบ 3 แกน = ไม่ทิ้งอะไร (kept = 1)', R.keptFrac, 1, 1e-12);
        check('ครบ 3 แกน = residual เป็น 0', R.maxResidual, 0, 1e-12);
      }
      /* nested: 2 แกนเก็บได้มากกว่าแกนเดียวที่อยู่ในมัน */
    }
    check('kept(PC1∧PC2) ≥ kept(PC1) [seed ' + seed + ']', pc12.keptFrac >= pc1.keptFrac - 1e-12 ? 1 : 0, 1, 0.5);
    check('dropped(PC1∧PC2) = λ₃/tr [seed ' + seed + ']', pc12.droppedFrac, P.values[2] / P.trace, 1e-12);
    check('dropped(PC1) = (λ₂+λ₃)/tr [seed ' + seed + ']', pc1.droppedFrac, (P.values[1] + P.values[2]) / P.trace, 1e-12);
    /* altBases: ทุก basis ต้อง orthonormal */
    for (const a of alts) {
      let w = 0;
      for (let i = 0; i < a.basis.length; i++) for (let j = 0; j < a.basis.length; j++) w = Math.max(w, Math.abs(M.vDot(a.basis[i], a.basis[j]) - (i === j ? 1 : 0)));
      check('altBases[' + a.glyph + '] orthonormal', w, 0, 1e-14);
      check('altBases[' + a.glyph + '] ‖v‖=1', Math.max(...a.basis.map(u => Math.abs(M.vLen(u) - 1))), 0, 1e-15);
    }
    truth('altBases ทำซ้ำได้ (เรียกสองครั้งให้ผลเดียวกัน)', (() => {
      const A = M.altBases(P), B = M.altBases(P);
      return A.length === B.length && A.every((a, i) => a.key === B[i].key && a.basis.every((v, j) => v.every((x, k) => x === B[i].basis[j][k])));
    })());
    /* ระนาบที่แย่ที่สุดคือ PC2∧PC3 */
    const pl23 = M.projectBasis(P, [P.vectors[1], P.vectors[2]]);
    check('kept(PC2∧PC3) = (λ₂+λ₃)/tr (ระนาบที่ทิ้งน้อยที่สุด = ทิ้ง PC1)', pl23.keptFrac, (P.values[1] + P.values[2]) / P.trace, 1e-12);
    const pl13 = M.projectBasis(P, [P.vectors[0], P.vectors[2]]);
    check('kept(PC1∧PC3) อยู่ระหว่าง PC1 กับ PC1∧PC2', (pl13.keptFrac > pc1.keptFrac && pl13.keptFrac < pc12.keptFrac) ? 1 : 0, 1, 0.5);
  }
}

/* ═══ 6. แบบแผนเวที: geometry ที่วาดจริง + invariant ทุกค่าตัวคูณกระจุก (k = 1 … max) ══ */
console.log('── 6. stagePlan: ขนาด/ระยะที่วาดจริง + invariant เมื่อขยายกระจุก (k=1 และ k=max) ──');
{
  const EYE = [0, 1.6, 0];                       // ระดับสายตาผู้เรียนในสื่อ (VR)
  const KS = [1, M.CLUSTER_MAX];                 // แบบแผนเดิม (อ้างอิง) + default ปัจจุบัน
  truth('STAGE ที่สื่อใช้จริง = stageFor(CLUSTER_MAX)',
    M.STAGE.k === M.CLUSTER_MAX && M.STAGE.longMax === M.stageFor(M.CLUSTER_MAX).longMax
    && M.STAGE.height === M.stageFor(M.CLUSTER_MAX).height, JSON.stringify(M.STAGE));
  truth('invariant ของ stageFor: เพดานยาว/สูง/ลึก = แบบแผนเดิม × k ทุก k',
    KS.every((k) => Math.abs(M.stageFor(k).longMax - M.STAGE_BASE.longMax * k) < 1e-12
      && Math.abs(M.stageFor(k).vertMax - M.STAGE_BASE.vertMax * k) < 1e-12
      && Math.abs(M.stageFor(k).depthMax - M.STAGE_BASE.depthMax * k) < 1e-12),
    KS.map((k) => k + '→' + [M.stageFor(k).longMax, M.stageFor(k).vertMax, M.stageFor(k).depthMax].map((v) => v.toFixed(2)).join('/')).join(' '));
  truth('invariant ของ stageFor: ฐานล่างกล่อง = 1.00 m ทุก k',
    KS.every((k) => Math.abs((M.stageFor(k).height - M.stageFor(k).vertMax / 2) - (M.STAGE_BASE.height - M.STAGE_BASE.vertMax / 2)) < 1e-12),
    KS.map((k) => k + '→base ' + (M.stageFor(k).height - M.stageFor(k).vertMax / 2).toFixed(2) + 'm').join(' '));
  for (const seed of [1, 3, 7, 42, 12345, 99991, 20261104, 20261201]) {
    const cl = M.makeCloud(seed), P = M.pcaOf(cl);
    /* (ก) half-extent ของข้อมูลดิบ — คำนวณใหม่ทั้งหมดที่นี่ ไม่เรียก stagePlan */
    let hx = 0, hy = 0, hz = 0;
    for (const q0 of cl.points) {
      const q = [q0[0] - P.mu[0], q0[1] - P.mu[1], q0[2] - P.mu[2]];
      hx = Math.max(hx, Math.abs(q[0])); hy = Math.max(hy, Math.abs(q[1])); hz = Math.max(hz, Math.abs(q[2]));
    }
    const Sref = M.stagePlan(P, M.stageFor(1));
    check('stagePlan.dataHalf ตรงกับที่คำนวณอิสระ (seed ' + seed + ')',
      Math.max(Math.abs(Sref.dataHalf.x - hx), Math.abs(Sref.dataHalf.y - hy), Math.abs(Sref.dataHalf.z - hz)), 0, 1e-12);
    /* map world เองทั้งหมด (data → world = (x, z, −y)·scale + center) แล้ววัดจากจุดที่วาดจริง */
    const drawn = (spec) => {
      const S = M.stagePlan(P, spec);
      const w = cl.points.map((p) => {
        const q = [p[0] - P.mu[0], p[1] - P.mu[1], p[2] - P.mu[2]];
        return [q[0] * S.scale + S.center[0], q[2] * S.scale + S.center[1], -q[1] * S.scale + S.center[2]];
      });
      const half = [0, 0, 0]; let near = 1e9, far = 0, low = 1e9, high = -1e9, elev = -90, az = 0;
      for (const c of w) {
        for (let i = 0; i < 3; i++) half[i] = Math.max(half[i], Math.abs(c[i] - S.center[i]));
        const d = Math.hypot(c[0] - EYE[0], c[1] - EYE[1], c[2] - EYE[2]);
        near = Math.min(near, d); far = Math.max(far, d);
        low = Math.min(low, c[1]); high = Math.max(high, c[1]);
        elev = Math.max(elev, Math.atan2(c[1] - EYE[1], Math.hypot(c[0] - EYE[0], c[2] - EYE[2])) * 180 / Math.PI);
        az = Math.max(az, Math.atan2(Math.abs(c[0] - EYE[0]), Math.abs(c[2] - EYE[2])) * 180 / Math.PI);
      }
      return { S, w, half, near, far, low, high, elev, az, nearFace: S.dist - half[2] };
    };
    for (const k of KS) {
      const spec = M.stageFor(k), G = drawn(spec), S = G.S;
      const tag = 'seed ' + seed + ' k=' + k;
      /* (ข) มาตราส่วน = min ของสามข้อจำกัด (สูตรปิด) และต้องมีข้อใดข้อหนึ่งผูกขาด */
      const sLong = spec.longMax / (2 * P.half[0]), sVert = spec.vertMax / (2 * hz), sDepth = spec.depthMax / (2 * hy);
      check(tag + ': scale = min(ข้อจำกัดยาว/สูง/ลึก)', S.scale, Math.min(sLong, sVert, sDepth), 1e-15);
      check(tag + ': ใช้มาตราส่วนที่ใหญ่ที่สุดที่อนุญาต', Math.max(S.scale / sLong, S.scale / sVert, S.scale / sDepth), 1, 1e-12);
      truth(tag + ': label ข้อจำกัดผูกขาดถูกต้อง',
        S.binding === (S.scale === sLong ? 'long' : (S.scale === sVert ? 'vert' : 'depth')), S.binding);
      /* (ค) geometry ที่วาดจริงต้องอยู่ในช่วงของแบบแผนข้อนั้น ๆ (วัดจากจุด ไม่อ่านจาก stagePlan) */
      leq(tag + ': ความยาวแกน PC1 ที่วาด ≤ ' + spec.longMax.toFixed(2) + ' m', 2 * P.half[0] * S.scale, spec.longMax, 1e-12);
      leq(tag + ': ความสูงที่วาด ≤ ' + spec.vertMax.toFixed(2) + ' m', 2 * G.half[1], spec.vertMax + 1e-9, 0);
      leq(tag + ': ความลึกที่วาด ≤ ' + spec.depthMax.toFixed(2) + ' m', 2 * G.half[2], spec.depthMax + 1e-9, 0);
      truth(tag + ': ความยาวแกน PC1 ที่วาด ≥ 1.00 m → ยังเป็นขนาดคน', 2 * P.half[0] * S.scale >= 1.0, (2 * P.half[0] * S.scale).toFixed(2) + ' m');
      check(tag + ': จุดทุกจุดอยู่ในครึ่งเส้นทแยงของกล่องเวที', Math.max(...G.w.map((c) => Math.hypot(c[0] - S.center[0], c[1] - S.center[1], c[2] - S.center[2]))), S.radiusWorld, 1e-9);
      /* (ค2) ระยะเวที = สูตรปิดจากค่าที่ "วาดจริง" (invariant #1) — คำนวณอิสระใหม่ที่นี่ทั้งหมด */
      const distWant = M.NEAR_TARGET + G.half[2], distWideCap = spec.longMax / 2, distRef = Math.max(distWant, distWideCap);
      check(tag + ': dist = max(NEAR_TARGET + ครึ่งความลึกที่วาด, longMax/2)', S.dist, distRef, 1e-12);
      truth(tag + ': หน้าใกล้ของกล่องอยู่ห่างด้านข้าง ≥ ' + M.NEAR_TARGET.toFixed(2) + ' m (invariant #1)',
        G.nearFace >= M.NEAR_TARGET - 1e-12, 'nearFace ' + G.nearFace.toFixed(3) + ' m · binding ' + S.bindingDist);
      truth(tag + ': จุดที่ใกล้ตัวผู้เรียนที่สุด ≥ ' + M.NEAR_TARGET.toFixed(2) + ' m', G.near >= M.NEAR_TARGET - 1e-9, G.near.toFixed(3) + ' m');
      const envFar = Math.hypot(spec.longMax / 2, Math.max(Math.abs(spec.height - spec.vertMax / 2 - EYE[1]), Math.abs(spec.height + spec.vertMax / 2 - EYE[1])), S.dist + spec.depthMax / 2);
      leq(tag + ': จุดที่ไกลที่สุด ≤ ขอบกล่องของแบบแผนนี้ (' + envFar.toFixed(2) + ' m)', G.far, envFar + 1e-9, 0);
      check(tag + ': ระยะด้านข้างถึงจุดกึ่งกลาง = dist ที่คำนวณอิสระ', Math.hypot(S.center[0] - EYE[0], S.center[2] - EYE[2]), distRef, 1e-12);
      truth(tag + ': ฐานล่างกระจุก ≥ ' + (spec.height - spec.vertMax / 2).toFixed(2) + ' m (invariant #2: ไม่ทับการ์ด/แผงตัวเลข)',
        G.low >= spec.height - spec.vertMax / 2 - 1e-12, G.low.toFixed(2) + ' m');
      const envElev = Math.atan2(spec.height + spec.vertMax / 2 - EYE[1], M.NEAR_TARGET) * 180 / Math.PI;   // มุมของมุมบน-ใกล้ที่สุดของกล่อง
      truth(tag + ': มุมเงยสูงสุดไม่เกินขอบกล่อง (' + envElev.toFixed(1) + '°)', G.elev <= envElev + 1e-9,
        'วัดจริง ' + G.elev.toFixed(1) + '° · az ' + G.az.toFixed(1) + '° · จุดบนสุด ' + G.high.toFixed(2) + ' m');
      /* (ง) การขยายกระจุกต้อง "ใหญ่ขึ้นจริง" แบบ similarity (รูปทรงข้อมูลเดิม) */
      if (k !== 1) {
        const G1 = drawn(M.stageFor(1));
        check(tag + ': scale ใหม่ = k × scale เดิม', S.scale / G1.S.scale, k, 1e-12);
        check(tag + ': half-extent ที่วาดทุกแกน = k เท่าของแบบแผนเดิม',
          Math.max(Math.abs(G.half[0] / G1.half[0] - k), Math.abs(G.half[1] / G1.half[1] - k), Math.abs(G.half[2] / G1.half[2] - k)), 0, 1e-12);
        /* สิ่งที่แบบแผนการันตีคือ "หน้าใกล้ของกล่อง" อยู่ที่ 1.40 m เท่าเดิม (ตรวจไว้ข้างบน)
           ส่วนจุดข้อมูลจริงที่ใกล้ตาที่สุดอาจห่างขึ้นอีกเล็กน้อย เพราะจุดที่ลากไปถึงหน้าใกล้
           ของกล่องไม่ได้อยู่ระดับสายตา — ขอบที่ใช้ได้จริง: ไม่เกิน 0.30 m */
        truth(tag + ': ขยายแล้วไม่ถอยหนี — จุดข้อมูลใกล้ตาห่างขึ้น ≤ 0.30 m (nearFace คงที่ 1.40 m)',
          G.near - G1.near <= 0.30 && G.nearFace >= G1.nearFace - 1e-12,
          'k=1 ' + G1.near.toFixed(3) + ' m → k=' + k + ' ' + G.near.toFixed(3) + ' m · nearFace ' +
          G1.nearFace.toFixed(3) + ' → ' + G.nearFace.toFixed(3) + ' m');
        truth(tag + ': กินมุมมองใหญ่ขึ้นจริง (radiusWorld/dist เพิ่ม)', S.radiusWorld / S.dist > G1.S.radiusWorld / G1.S.dist + 1e-9,
          (2 * Math.asin(Math.min(1, G1.S.radiusWorld / G1.S.dist)) * 180 / Math.PI).toFixed(1) + '° → ' +
          (2 * Math.asin(Math.min(1, S.radiusWorld / S.dist)) * 180 / Math.PI).toFixed(1) + '° · dist ' +
          G1.S.dist.toFixed(2) + '→' + S.dist.toFixed(2) + ' m');
      }
      /* (จ) ellipsoid ที่สื่อวาด = ครึ่งแกน 2σ จาก λ จริง (ตรวจ identity) */
      check(tag + ': ellipsoidSemi = 2√λ', Math.max(...S.ellipsoidSemi.map((v, i) => Math.abs(v - 2 * Math.sqrt(P.values[i])))), 0, 1e-15);
    }
    /* (ฉ) เนื้อหา PCA: แกนยาว–แกนสั้นต่างกันชัด และการลดมิติเห็นผลจริง */
    truth('seed ' + seed + ': λ₁/λ₃ ≥ 8 → เห็นแกนยาวกับแกนสั้นต่างกันบนจอ', P.values[0] / P.values[2] >= 8, (P.values[0] / P.values[2]).toFixed(1));
    truth('seed ' + seed + ': PC1 เก็บ variance ≥ 55% (โหมด 1 มิติเห็นผลชัด)', P.explained[0] >= 0.55, (100 * P.explained[0]).toFixed(1) + '%');
    leq('seed ' + seed + ': PC2 เก็บ ≤ 40% (โหมดเทียบให้ผลต่างจาก PC1 จริง)', P.explained[1], 0.40, 0);
  }
  /* (ฉ) ellipsoid 2σ ครอบข้อมูล ≈ P(χ²₃ ≤ 4) — ค่าอ้างอิงคำนวณสองทางด้วยตัวเอง */
  const simpson = (f, a, b, n) => {                                // integrate อิสระ (n คู่)
    if (n % 2) n++; const h = (b - a) / n; let acc = f(a) + f(b);
    for (let i = 1; i < n; i++) acc += f(a + i * h) * (i % 2 ? 4 : 2);
    return acc * h / 3;
  };
  const erfNum = (x) => (2 / Math.sqrt(Math.PI)) * simpson((t) => Math.exp(-t * t), 0, x, 400000);
  const F1 = (x) => erfNum(Math.sqrt(x / 2)) - Math.sqrt(2 * x / Math.PI) * Math.exp(-x / 2);   // erf route
  const F2 = (x) => {                                                                            // incomplete-gamma route
    const gHalf = simpson((u) => 2 * Math.exp(-u * u), 0, Math.sqrt(x / 2), 400000);   // γ(½,y)=∫2e^{−u²}du (แทน t=u² เพื่อกำจัด singularity)
    const g32 = 0.5 * gHalf - Math.sqrt(x / 2) * Math.exp(-x / 2);                             // γ(s+1,y)=sγ(s,y)−yˢe^{−y}
    return g32 / (Math.sqrt(Math.PI) / 2);                                                     // หาร Γ(3/2)
  };
  const p4 = F1(4);
  check('χ²₃ CDF ที่ 4: two independent evaluations agree', F1(4), F2(4), 2e-6);
  truth('ค่าอ้างอิง P(χ²₃ ≤ 4) ≈ 0.7386 (ellipsoid 2σ ครอบ ~74%)', Math.abs(p4 - 0.7386) < 2e-4, p4.toFixed(6));
  for (const seed of [11, 77, 5150]) {
    const cl = M.makeCloud(seed, 2400), pop = M.popEigs(cl), P = M.pcaOf(cl);
    const fracOf = (vals, vecs) => {                              // สัดส่วนจุดใน ellipsoid ครึ่งแกน 2σ
      let inside = 0;
      for (const p0 of cl.points) {
        const q = [p0[0] - cl.mu[0], p0[1] - cl.mu[1], p0[2] - cl.mu[2]];
        let r2 = 0;
        for (let k = 0; k < 3; k++) {
          const c = q[0] * vecs[k][0] + q[1] * vecs[k][1] + q[2] * vecs[k][2];
          r2 += (c / (2 * Math.sqrt(vals[k]))) ** 2;
        }
        if (r2 <= 1) inside++;
      }
      return inside / cl.points.length;
    };
    const fPop = fracOf(pop.values, pop.vectors), sd = Math.sqrt(p4 * (1 - p4) / cl.points.length);
    check('สัดส่วนจุดใน ellipsoid 2σ (จาก λ ของกระบวนการ) = P(χ²₃ ≤ 4) (seed ' + seed + ')', fPop, p4, 4 * sd);
    /* ellipsoid ที่สื่อวาดจริงใช้ λ̂ (sample) → ต้องอยู่ใน sandwich ที่ deriving จากขอบเขต 4σ ของ λ̂ */
    const relSd = 4 * Math.sqrt(2 / (cl.n - 1));
    /* λ̂ ∈ [λ(1−δ), λ(1+δ)] ⟹ r²/(1+δ) ≤ r̂² ≤ r²/(1−δ) ⟹ F(4(1−δ)) ≤ f̂ ≤ F(4(1+δ)) */
    const lo = F1(4 * (1 - relSd)), hi = F1(4 * (1 + relSd));
    const fSample = fracOf(P.values, P.vectors);
    truth('f(λ̂) ∈ [P(χ²₃ ≤ 4(1+δ)), P(χ²₃ ≤ 4(1−δ))] (seed ' + seed + ')', fSample >= lo - 4 * sd && fSample <= hi + 4 * sd,
      fSample.toFixed(4) + ' ต้องอยู่ใน [' + lo.toFixed(4) + ', ' + hi.toFixed(4) + ']');
  }
}

console.log('\n══ สรุป: ผ่าน ' + pass + ' / ' + (pass + fail) + ' ข้อ' + (fail ? '  —  ล้มเหลว ' + fail + ' ข้อ' : '  —  ผ่านทั้งหมด') + ' ══');
process.exit(fail ? 1 : 0);
