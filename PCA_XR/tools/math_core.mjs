/* ╔══════════════════════════════════════════════════════════════════════════╗
   ║ math_core.mjs — PCA ของกระจุกจุดรูปทรงรีใน 3 มิติ + การฉายลดมิติ            ║
   ╚══════════════════════════════════════════════════════════════════════════╝
   ทุกตัวเลขที่ index.html และแผงตัวเลขในฉากแสดง เรียกจากไฟล์นี้เท่านั้น
   ไม่มีค่า hardcode ในสื่อ · tools/math_check.mjs ตรวจทุกฟังก์ชันที่นี่ด้วยคำตอบปิด

   ลำดับงานที่ไฟล์นี้ทำ (ตรงกับ PCA ในตำราทุกขั้น):
     1) สร้างข้อมูลดิบ  X (n×3)   : กระจุกแก๊ส Gaussian ที่ถูกยืด-หมุน → รูปทรงรี
        X = μ + R·diag(σ₁,σ₂,σ₃)·g ,  g ~ N(0,I)   (R มาจาก quaternion สุ่มสม่ำเสมอบนทรงกลม unit)
     2) หา mean  μ̂ = (1/n)Σx        แล้วลบค่ากลาง q_i = x_i − μ̂
     3) covariance  C = (1/(n−1))Σ q_i qᵀᵢ   (สมมาตร 3×3)
     4) แยก eigen ด้วย Jacobi rotation (สมมาตรจริง → ค่าจริง, เวกเตอร์ตั้งฉากกัน):
        C v_k = λ_k v_k ,  λ₁ ≥ λ₂ ≥ λ₃
     5) การฉาย: ให้ B = {v_k …} เป็นชุดทิศทางที่เลือก
        proj_B(q) = Σ_k (q·v_k) v_k ,  residual = q − proj_B(q)
        เอกลักษณ์ที่ใช้ตรวจทุกโหมด:  Var(residual) = tr(C) − Σ_k vₖᵀ C vₖ
        และ  Var(พิกัดที่ฉายลง v) = vᵀ C v  ≤ λ₁  เสมอ (PC1 คือทิศที่ให้มากที่สุด)
*/

/* ═══════════════════ 1. ตัวสุ่มที่ทำซ้ำได้ (seed → ข้อมูลชุดเดียวกันเสมอ) ════ */
/** mulberry32 — PRNG 32 บิตที่ทำได้ซ้ำทุกค่าเมื่อ seed เดียวกัน */
export function rng (seed) {
  let a = (Math.trunc(Number(seed)) >>> 0) || 0x9E3779B9;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Box–Muller: N(0,1) ต่อเนื่อง (เก็บ spare ไว้ใช้ครั้งถัดไป) */
export function randnFactory (rand) {
  let spare = null;
  return function () {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u, v, s2;
    do { u = 2 * rand() - 1; v = 2 * rand() - 1; s2 = u * u + v * v; } while (s2 >= 1 || s2 === 0);
    const m = Math.sqrt(-2 * Math.log(s2) / s2);
    spare = v * m; return u * m;
  };
}
export function randRange (rand, lo, hi) { return lo + (hi - lo) * rand(); }

/* ═══════════════════ 2. เวกเตอร์และเมทริกซ์ 3×3 ═══════════════════════════ */
export const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vScl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vLen = (a) => Math.hypot(a[0], a[1], a[2]);
export const vNorm = (a) => { const l = vLen(a) || 1; return vScl(a, 1 / l); };
export const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const mId = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
export const mCopy = (m) => [m[0].slice(), m[1].slice(), m[2].slice()];
/** m·v */
export function mMulVec (m, v) {
  return [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
          m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
          m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];
}
/** m·nᵀ เมื่อ columns ของ m,n คือเวกเตอร์ (ผล = เวกเตอร์ฐานคู่ในรูปเมทริกซ์ 3×3) */
export function mMul (a, b) {
  const o = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i][j] = a[i][0] * b[j][0] + a[i][1] * b[j][1] + a[i][2] * b[j][2];
  return o;
}
export const mTranspose = (m) => [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]];
export const mTrace = (m) => m[0][0] + m[1][1] + m[2][2];
export function mDet (m) {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
       - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
       + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}
/** Σ ของ principal minor 2×2 = ( (tr C)² − tr(C²) ) / 2 — สัมประสิทธิ์ของพหุนามลักษณะเฉพาะ */
export function mCharPoly (C) {
  const tr = mTrace(C);
  let tr2 = 0;
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) tr2 += C[i][k] * C[k][i];
  return { c2: -tr, c1: 0.5 * (tr * tr - tr2), c0: -mDet(C) };
}
/** quadratic form vᵀ C v = ความแปรปรวนของข้อมูลเมื่อฉายลงทิศ v (‖v‖ = 1) */
export function dirVar (C, v) { return vDot(mMulVec(C, v), v); }
/** quaternion หนึ่งหน่วย (w,x,y,z) → เมทริกซ์หมุน 3×3 */
export function quatToMat (w, x, y, z) {
  const n = Math.hypot(w, x, y, z) || 1; w /= n; x /= n; y /= n; z /= n;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}
/** การหมุนแบบสม่ำเสมอ (quaternion กระจายสม่ำเสมอบน S³) — Shoemake */
export function randomRotation (rand) {
  const u1 = rand(), u2 = rand(), u3 = rand(), TAU = Math.PI * 2;
  return quatToMat(
    Math.sqrt(1 - u1) * Math.sin(TAU * u2), Math.sqrt(1 - u1) * Math.cos(TAU * u2),
    Math.sqrt(u1) * Math.sin(TAU * u3), Math.sqrt(u1) * Math.cos(TAU * u3));
}
export function randomUnitDir (rand) {
  const ct = 2 * rand() - 1, st = Math.sqrt(Math.max(0, 1 - ct * ct)), ph = Math.PI * 2 * rand();
  return [st * Math.cos(ph), st * Math.sin(ph), ct];
}

/* ═══════════════════ 3. ข้อมูลดิบ: กระจุกจุดรูปทรงรี ══════════════════════ */
export const N_DEFAULT = 900;
export const N_STEPS = [300, 900, 2400];      // จำนวนจุดที่สื่อเลือกได้ (การ์ด n)
export const MIN_SIGMA = 0.04;                // กัน λ ≈ 0 ทำให้อัตราส่วน PC1/PC3 ยังเห็นชัด

/** สร้างกระจุกจุดรูปทรงรี (ยืดไม่เท่ากันสามทิศ + หมุนทิศนั้นแบบสุ่ม + เลื่อนออกจากจุดกำเนิด)
 *  design = ค่าที่ "ตั้งใจใส่" (R, σ) — PCA ไม่ได้เห็นค่านี้ ใช้เฉพาะตอนตรวจว่ากู้คืนได้แค่ไหน */
export function makeCloud (seed, n = N_DEFAULT) {
  const rand = rng(seed), rn = randnFactory(rand);
  const R = randomRotation(rand);
  const s1 = randRange(rand, 1.10, 2.00);                 // ครึ่งแกนยาว (หน่วยข้อมูล)
  const s2 = s1 * randRange(rand, 0.34, 0.62);           // ครึ่งแกนกลาง
  const s3 = s2 * randRange(rand, 0.18, 0.50);           // ครึ่งแกนสั้น → ทรงรีแบน
  const sig = [s1, Math.max(MIN_SIGMA, s2), Math.max(MIN_SIGMA, s3)];
  const mu = [randRange(rand, -0.45, 0.45), randRange(rand, -0.45, 0.45), randRange(rand, -0.45, 0.45)];
  const points = new Array(n);
  for (let i = 0; i < n; i++) {
    const g = [rn(), rn(), rn()];
    points[i] = vAdd(mu, mMulVec(R, [sig[0] * g[0], sig[1] * g[1], sig[2] * g[2]]));
  }
  const designCov = popCovOf(sig, R);            //_cov ที่ตั้งใจใส่ = R·diag(σ²)·Rᵀ
  return {
    seed: Math.trunc(Number(seed)) >>> 0, n, points, mu,
    design: { R, sigma: sig, popCov: designCov },
  };
}
export const diagM = (d) => [[d[0], 0, 0], [0, d[1], 0], [0, 0, d[2]]];
/** C_pop = R·diag(σ²)·Rᵀ — covariance จริงของกระบวนการที่สร้างข้อมูล */
export function popCovOf (sigma, R) {
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0;
    for (let k = 0; k < 3; k++) s += R[i][k] * (sigma[k] * sigma[k]) * R[j][k];
    C[i][j] = s;
  }
  return C;
}

/* ═══════════════════ 4. mean · covariance · Jacobi eigen ══════════════════ */
export function meanOf (points) {
  const m = [0, 0, 0];
  for (const p of points) { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; }
  return vScl(m, 1 / points.length);
}
/** C = (1/(n−1)) Σ q qᵀ  (q = x − mean) — ตอบทั้ง C และ Σ‖q‖² ไว้ตรวจเอกลักษณ์ */
export function covariance (points, mu = meanOf(points)) {
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let sumSq = 0;
  for (const p of points) {
    const q = vSub(p, mu);
    sumSq += vDot(q, q);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += q[i] * q[j];
  }
  const k = 1 / Math.max(1, points.length - 1);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] *= k;
  return { C, mu, sumSq };
}

/** Jacobi rotation สำหรับเมทริกซ์สมมาตร 3×3 — ค่าจริง, เวกเตอร์จริง, ตั้งฉากจริง
 *  คืนค่าเรียง λ₁ ≥ λ₂ ≥ λ₃ พร้อมเครื่องหมายของ v ที่ทำให้
 *  (ก) ตัวที่มีค่าสัมบูรณ์มากที่สุดใน v เป็นบวก (ข) det[v₁ v₂ v₃] = +1 */
export function jacobiEigen (Cin, maxSweeps = 100, tol = 1e-30) {
  const a = mCopy(Cin), v = mId();
  let sweeps = 0, off = 1 / 0, prevOff = 1 / 0;
  const pairs = [[0, 1], [0, 2], [1, 2]];
  const offSq = () => a[0][1] * a[0][1] + a[0][2] * a[0][2] + a[1][2] * a[1][2];
  const fro2 = () => a.reduce((s, r) => s + r.reduce((t, x) => t + x * x, 0), 0);
  for (; sweeps < maxSweeps; sweeps++) {
    off = offSq();
    if (off <= tol * (fro2() + 1e-300)) break;           // เหลือเฉพาะแนวทแยง = จบ
    if (off >= prevOff) break;                           // ไม่ลดลงอีก = ถึงขีดความละเอียดของ double
    prevOff = off;
    for (const [p, q] of pairs) {
      const apq = a[p][q];
      if (Math.abs(apq) < 1e-300) continue;
      const app = a[p][p], aqq = a[q][q];
      const theta = (aqq - app) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.hypot(theta, 1));
      const c = 1 / Math.hypot(1, t), s = t * c;
      for (let k = 0; k < 3; k++) {
        if (k === p || k === q) continue;
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = a[p][k] = c * akp - s * akq;
        a[k][q] = a[q][k] = s * akp + c * akq;
      }
      a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
      a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
      a[p][q] = a[q][p] = 0;
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  off = offSq();
  /* เสาหลักที่ k ของ v คือ eigenvector ของ a[k][k] */
  let vals = [a[0][0], a[1][1], a[2][2]];
  let vecs = [[v[0][0], v[1][0], v[2][0]], [v[0][1], v[1][1], v[2][1]], [v[0][2], v[1][2], v[2][2]]];
  const order = [0, 1, 2].sort((i, j) => vals[j] - vals[i]);
  vals = order.map(i => vals[i]);
  vecs = order.map(i => vecs[i]);
  for (const w of vecs) {                                  // (ก) ทำให้ largest-|·| เป็นบวก
    let bi = 0;
    for (let i = 1; i < 3; i++) if (Math.abs(w[i]) > Math.abs(w[bi])) bi = i;
    if (w[bi] < 0) for (let i = 0; i < 3; i++) w[i] = -w[i];
  }
  const d3 = mDet(mTranspose([vecs[0], vecs[1], vecs[2]]));   // det[v₁ v₂ v₃]
  if (d3 < 0) for (let i = 0; i < 3; i++) vecs[2][i] = -vecs[2][i];       // (ข) right-handed
  const residuals = vecs.map((w, i) => vLen(vSub(mMulVec(Cin, w), vScl(w, vals[i]))));
  let ortho = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) ortho = Math.max(ortho, Math.abs(vDot(vecs[i], vecs[j]) - (i === j ? 1 : 0)));
  const lenErr = vecs.map(w => Math.abs(vLen(w) - 1));
  return { values: vals, vectors: vecs, sweeps, off, residuals, orthoErr: ortho, lenErr: Math.max(...lenErr) };
}

/* ═══════════════════ 5. PCA เต็มชุด: ผลลัพธ์ทุกตัวที่แผงแสดง ══════════════ */
export function pcaOf (cloud) {
  const points = cloud.points;
  const { C, mu, sumSq } = covariance(points, undefined);
  const e = jacobiEigen(C);
  const tr = mTrace(C), det = mDet(C), cp = mCharPoly(C);
  const total = e.values.reduce((s, x) => s + x, 0) || 1e-300;
  const explained = e.values.map(l => l / total);
  const cumulative = []; let acc = 0;
  for (const f of explained) { acc += f; cumulative.push(acc); }
  const sigma = e.values.map(l => Math.sqrt(Math.max(0, l)));
  /* ครึ่งแกนจริงของข้อมูลตามแต่ละทิศ PC = max |q·v_k| (ไม่ใช่ σ แต่ค่าจริงของกลุ่มจุดนี้) */
  const half = [0, 0, 0];
  let radiusMax = 0;
  const bbox = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];   // กล่องล้อมรอบ จุดทุกจุดเทียบกับ mean
  for (const p of points) {
    const q = vSub(p, mu);
    for (let k = 0; k < 3; k++) half[k] = Math.max(half[k], Math.abs(vDot(q, e.vectors[k])));
    radiusMax = Math.max(radiusMax, vLen(q));
    for (let i = 0; i < 3; i++) { bbox[i] = Math.min(bbox[i], q[i]); bbox[3 + i] = Math.max(bbox[3 + i], q[i]); }
  }
  return {
    n: points.length, seed: cloud.seed, points, mu, C, sumSq,
    values: e.values, vectors: e.vectors, sweeps: e.sweeps, off: e.off,
    residuals: e.residuals, orthoErr: e.orthoErr, lenErr: e.lenErr,
    trace: tr, det, charPoly: cp,
    explained, cumulative, sigma, half, radius: radiusMax, bbox,
    dirVar: (u) => dirVar(C, u),
    varOf: (k) => dirVar(C, e.vectors[k]),
  };
}

/* ═══════════════════ 6. การฉายลดมิติ (สิ่งที่สื่อนี้สอน) ═══════════════════ */
/** ฉายทุกจุดลงปริภูมิที่-span โดย basis (เวกเตอร์หนึ่งหน่วย, ตั้งฉากกัน)
 *  คืน: จุดที่ฉายแล้ว + residual ต่อจุด + ตัวเลขวัดทุกตัวที่ใช้บนแผง */
export function projectBasis (pca, basis) {
  const { points, mu, C } = pca;
  const k = basis.length;
  const projs = new Array(points.length), resid = new Array(points.length);
  const coords = points.map(() => new Array(k));
  let sumSqRes = 0, maxRes = 0, sumSqSig = 0, maxSig = 0, maxCoord = 0;
  const cm = new Array(k).fill(0), cq = new Array(k).fill(0);
  for (let i = 0; i < points.length; i++) {
    const q = vSub(points[i], mu);
    let pr = [0, 0, 0];
    for (let j = 0; j < k; j++) {
      const c = vDot(q, basis[j]);
      coords[i][j] = c;
      cm[j] += c; cq[j] += c * c;
      maxCoord = Math.max(maxCoord, Math.abs(c));
      pr = vAdd(pr, vScl(basis[j], c));
    }
    const r = vSub(q, pr);
    const rl = vLen(r);
    sumSqRes += rl * rl; maxRes = Math.max(maxRes, rl);
    const sig = vLen(q); sumSqSig += sig * sig; maxSig = Math.max(maxSig, sig);
    projs[i] = vAdd(mu, pr); resid[i] = r;
  }
  const nf = 1 / Math.max(1, points.length - 1);
  const coordVar = [];
  for (let j = 0; j < k; j++) {
    const mean = cm[j] * nf;
    coordVar.push(Math.max(0, (cq[j] - points.length * mean * mean) * nf));
  }
  const keptDirVar = basis.reduce((s, u) => s + dirVar(C, u), 0);
  const droppedDirVar = pca.trace - keptDirVar;
  const varResidual = sumSqRes * nf;
  return {
    basis, k, projs, resid, coords,
    sumSqResidual: sumSqRes, maxResidual: maxRes,
    varResidual, rmseResidual: Math.sqrt(varResidual),
    coordVar, maxCoord,
    keptVar: keptDirVar, droppedVar: droppedDirVar,
    keptFrac: keptDirVar / (pca.trace || 1e-300), droppedFrac: droppedDirVar / (pca.trace || 1e-300),
    identityGap: Math.abs(varResidual - droppedDirVar),        // ต้อง = 0 (เอกลักษณ์ tr(C))
    coordVarGap: k === 1 ? Math.abs(coordVar[0] - keptDirVar) : 0,
    maxSig, sumSqSig,
  };
}

/** ชุดทิศ "ที่ไม่ใช่คำตอบที่ดี" ที่สื่อให้เทียบ: PC2, PC3, ระนาบที่ไม่ใช่ PC1+PC2,
 *  แกนดิบ x,y,z (เลือกตัวแปรดิบแทน PCA) และทิศสุ่ม u (กำหนดจาก seed → ทำซ้ำได้) */
export const RAW_DIRS = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
export function altBases (pca) {
  const v = pca.vectors, out = [];
  out.push({ key: 'pc2', glyph: 'v₂', basis: [v[1]], kind: 'pca' });
  out.push({ key: 'pc3', glyph: 'v₃', basis: [v[2]], kind: 'pca' });
  out.push({ key: 'pl13', glyph: 'v₁∧v₃', basis: [v[0], v[2]], kind: 'pca' });
  out.push({ key: 'pl23', glyph: 'v₂∧v₃', basis: [v[1], v[2]], kind: 'pca' });
  for (let i = 0; i < 3; i++) out.push({ key: 'raw' + 'xyz'[i], glyph: 'xyz'[i], basis: [RAW_DIRS[i]], kind: 'raw' });
  const rand = rng((pca.seed ^ 0x5bf03635) >>> 0);
  out.push({ key: 'rnd1', glyph: 'u', basis: [randomUnitDir(rand)], kind: 'rand' });
  return out;
}

/* ═══════════════════ 7. เครื่องมือเทียบที่ math_check.mjs ใช้ ══════════════ */
/** สแกนทิศมากมาย: ค่าสูงสุดของ vᵀCv ต้องไม่เกิน λ₁ (PC1 คือผู้ชนะ) */
export function scanMaxDirVar (C, seed, trials = 4000) {
  const rand = rng(seed);
  let best = -1e9, argmax = null;
  for (let i = 0; i < trials; i++) {
    const u = randomUnitDir(rand), d = dirVar(C, u);
    if (d > best) { best = d; argmax = u; }
  }
  return { max: best, argmax };
}
/** กู้คืน λ จากข้อมูลของ principal axis ที่ตั้งใจใส่ (popCov) — ใช้ตรวจ sampling error */
export function popEigs (cloud) {
  const e = jacobiEigen(cloud.design.popCov);
  return { values: e.values, vectors: e.vectors };
}

/* ═══════════ 8. แบบแผนเวทีแสดง (pure function ของข้อมูล ไม่มีค่า hardcode ในสื่อ) ═══
   แบบแผนแกนโลกที่สื่อใช้ (เหมือนสื่ออื่นใน lesson12):  data x → +X (ขวา)
                                                       data y → −Z (ลึกเข้า)
                                                       data z → +Y (ขึ้น)
   เป้าหมายทางสายตา: กระจุก "เท่าตัวคน" ลอยอยู่หน้าผู้เรียน
     · ความยาวแกน PC1 ที่วาด ≤ longMax  (1.50 m = ช่วงแขนกาง = ขนาดคน)
     · ความสูงที่วาด   ≤ vertMax
     · ความลึกที่วาด   ≤ depthMax
   map เป็น signed permutation ดังนั้น half-extent โลก = half-extent ข้อมูล (สลับแกน)

   ตัวคูณกระจุก k (1…CLUSTER_MAX): ขยายทุกข้อจำกัดพร้อมกัน ×k จึงได้ “รูปทรงของข้อมูล” เดิม
   ทุกค่า k (หนึ่งชุดข้อมูลใช้ scale เดียวเสมอ) ส่วน “ระยะ” ไม่ได้ขยายตาม k แต่คำนวณจาก
   invariant สองข้อที่คงที่ทุก k และทุกชุดข้อมูล:
     1) จุดที่ใกล้ตาผู้เรียนที่สุด ต้องอยู่ไกลเป็นระยะด้านข้าง ≥ NEAR_TARGET (1.40 m) เสมอ
        → dist = max( NEAR_TARGET + (ความลึกที่ “วาดจริง”)/2 , longMax/2 )
           ค่าแรกคำนวณจากข้อมูลจริงของชุดนั้น ไม่ใช่จากเพดาน depthMax จึงไม่ถอยออก
           เกินจำเป็นเมื่อข้อมูลตื้น = กระจุกกินมุมมองได้เต็มที่เท่าที่ความสบายอนุญาต
           ค่าที่สองเป็นเพดานด้านข้าง: ครึ่งความกว้างไม่เกินระยะที่ยืน ⇒ มุมซ้าย–ขวา ≤ 45°
     2) ฐานล่างของกล่องกระจุกอยู่ที่ BASE.height − vertMax(1)/2 = 1.00 m ทุก k
        (กระจุกโตขึ้นข้างบนเท่านั้น ไม่หย่อนลงไปทับการ์ดเมนู/แผงตัวเลข)
   k=1 ให้ผลใกล้แบบแผนเดิม (จุดใกล้ตาที่วัดจริง 1.36–1.62 m ที่ระยะศูนย์กลาง ~2 m)
   k=2 (default) กระจุกใหญ่ขึ้น 2 เท่า กินมุมมองกว้างขึ้นโดยจุดใกล้ตาเท่าเดิม */
export const STAGE_BASE = { dist: 2.00, height: 1.55, longMax: 1.50, vertMax: 1.10, depthMax: 1.40 };
export const NEAR_TARGET = 1.40;                 // ระยะด้านข้างถึงจุดใกล้ตาที่สุด (m)
export const CLUSTER_MAX = 2.0;                  // ตัวคูณกระจุกสูงสุดที่สื่อการันตี
/** เพดานของเวที + นโยบายระยะ/ความสูง สำหรับตัวคูณกระจุก k (ค่าเพี้ยนหรือเกินขอบ → 1…CLUSTER_MAX) */
export function stageFor (k) {
  const t = Math.min(CLUSTER_MAX, Math.max(1, Number.isFinite(k) ? k : 1));
  const longMax = STAGE_BASE.longMax * t, vertMax = STAGE_BASE.vertMax * t, depthMax = STAGE_BASE.depthMax * t;
  return {
    k: t, longMax, vertMax, depthMax, nearTarget: NEAR_TARGET,
    baseBottom: STAGE_BASE.height - STAGE_BASE.vertMax / 2,               // 1.00 m ทุกค่า k
    height: STAGE_BASE.height + (vertMax - STAGE_BASE.vertMax) / 2,      // รักษาฐานล่างคงที่
  };
}
export const STAGE = stageFor(CLUSTER_MAX);   // แบบแผน default ของสื่อ: กระจุก ×2
export const worldOf = (p) => [p[0], p[2], -p[1]];            // data → world
/** คำนวณมาตราส่วน (หน่วยข้อมูล → เมตร) และตัวเลข geometry ทั้งหมดที่เวทีต้องใช้ */
export function stagePlan (pca, spec = STAGE) {
  let hx = 0, hy = 0, hz = 0;
  for (const p of pca.points) {
    const q = vSub(p, pca.mu);
    hx = Math.max(hx, Math.abs(q[0])); hy = Math.max(hy, Math.abs(q[1])); hz = Math.max(hz, Math.abs(q[2]));
  }
  const sLong = spec.longMax / (2 * pca.half[0]);
  const sVert = spec.vertMax / (2 * hz);
  const sDepth = spec.depthMax / (2 * hy);
  const scale = Math.min(sLong, sVert, sDepth);
  const binding = scale === sLong ? 'long' : (scale === sVert ? 'vert' : 'depth');
  const rWorld = pca.radius * scale;
  const drawnLong = 2 * pca.half[0] * scale, drawnVert = 2 * hz * scale, drawnDepth = 2 * hy * scale;
  /* ระยะเวที = ค่าที่เข้ามาใกล้ที่สุดโดยยังสบาย (invariant #1): ให้จุดที่ใกล้ตาที่สุด
     อยู่ไกลเป็นระยะด้านข้าง = spec.nearTarget พอดี เมื่อจุดนั้นอยู่ที่หน้าใกล้ของกล่อง
     (ระยะด้านข้างถึงหน้าใกล้ = dist − drawnDepth/2) พร้อมเพดานมุมโอบรอบหัว */
  const distNear = spec.nearTarget + drawnDepth / 2;
  const distWide = spec.longMax / 2;                                            // มุมซ้าย–ขวา ≤ 45°
  const dist = Math.max(distNear, distWide);
  return {
    scale, binding, sLong, sVert, sDepth, k: spec.k,
    dataHalf: { x: hx, y: hy, z: hz },
    worldHalf: { x: hx * scale, y: hz * scale, z: hy * scale },   // (X ขวา, Y ขึ้น, Z ลึก)
    dist, distNear, distWide, bindingDist: dist === distNear ? 'nearTarget' : 'wide',
    nearTarget: spec.nearTarget, height: spec.height, baseBottom: spec.baseBottom,
    center: [0, spec.height, -dist],
    drawnLong, drawnVert, drawnDepth,
    radiusWorld: rWorld,
    angularDeg: 2 * Math.asin(Math.min(1, rWorld / dist)) * 180 / Math.PI,   // ทรงกลมครอบ ( conservative )
    ellipsoidSemi: pca.sigma.map((v) => 2 * v),                   // ครึ่งแกนของ ellipsoid ที่ 2σ
  };
}
