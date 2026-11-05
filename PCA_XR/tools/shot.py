#!/usr/bin/env python3.11
"""shot.py — รัน PCA_XR ใน Chromium (headless) แล้ว *วัด* ทั้งคณิตศาสตร์และเรขาคณิตที่สื่อคำนวณ

สื่อชุดนี้ไม่มีคำพูดในหน้าจอ: มีแต่จุด เส้น แกน ตัวเลข และสัญคณิตบนแผง
สคริปต์นี้ตรวจสองเรื่องที่ต่างกันโดยสิ้นเชิง

  (1) คณิตศาสตร์ — ตัวเลขที่หน้ารายงาน (λ σ v tr Ĉ det χ(t) kept% rmse max‖x−πx‖)
      ต้องตรงกับ การคำนวณอิสระใน Python ล้วน (mean → C → Jacobi eigen → projection)
      ที่อ่านข้อมูลดิบจากหน้าเองผ่าน window.__pca.cloud()
      ค่าคาดหวังมาจากคำนิยาม + เอกลักษณ์ + ขอบเขตเชิงสถิติของตัวอย่าง ไม่ใช่ค่าที่จูนจากภาพ:
        tr Ĉ = Σλ · det Ĉ = Πλ · χ(t) = t³ − (tr)t² + (Σ principal minor)t − det
        Var(residual) = tr Ĉ − Σⱼ vⱼᵀĈvⱼ · kept(v) = vᵀĈv/tr Ĉ ≤ λ₁/tr Ĉ
        sd สัมพัทธ์ของ λ̂ = √(2/(n−1))  (ตรวจว่า λ̂ อยู่ภายใน 5 σ ของการกระจาย)
  (2) เรขาคณิต — จุดที่ "วาดจริง" (อ่านจาก BufferAttribute ของ scene graph) ต้องตรงกับ
      ข้อมูลจริงภายใต้ world map ที่ประกาศไว้ (x→+X, y→−Z, z→+Y) และอยู่ในเดือนที่
      math_core.stagePlan กำหนด (ตัวคูณกระจุก k — ค่า default ของสื่อ = เพดานของแบบแผน = 2):
      เดือนของกล่องกระจุก = ค่าพื้นฐาน × k (แกนยาว ≤ 3.00 m ที่ k=2) · จุดที่ใกล้ตาที่สุด ≥ 1.40 m ทุกกรณี
      (หน้าใกล้ของกล่องวางไว้ที่ 1.40 m พอดี) · ฐานล่างกล่อง ≥ 1.00 m (ขยายขึ้นข้างบนเท่านั้น)
      · เมนูการ์ดอยู่ใต้สายตาและใต้กระจุก (ไม่ทับกัน), เดินไม่ทะลุสนาม

ภาพนิ่งของทุกโหมดอยู่ใน _preview/ ให้คนอ่านเอกสารเห็นสื่อจริงโดยไม่ต้องใส่แว่น

 usage:  python3.11 tools/shot.py            # ตรวจทุกกรณี + ถ่ายภาพ
         python3.11 tools/shot.py --shots    # ถ่ายภาพอย่างเดียว
         python3.11 tools/shot.py --no-shots
"""
import http.server
import json
import math
import os
import socketserver
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.path.dirname(HERE)                            # PCA_XR/
ROOT = os.path.dirname(os.path.dirname(MEDIA))           # โฟลเดอร์งาน (มี SCMA292_lesson12/)
PREVIEW = os.path.join(MEDIA, "_preview")
PAGE = "/SCMA292_lesson12/PCA_XR/index.html"

TOL_ABS = 1e-9        # สิ่งที่ควรเป็น 0 โดยเอกลักษณ์: ‖v‖−1, vᵢ·vⱼ, gap ของ identity
TOL_REL = 1e-9        # ค่าที่หน้าคำนวณด้วยโค้ดชุดเดียวกับ tools/math_check.mjs
TOL_EIG = 1e-8        # eigen ของ Python (Jacobi คนละ implementation) เทียบกับของหน้า
TOL_DRAW = 1e-6       # ตำแหน่งที่วาดจริง vs ตำแหน่งที่คณิตศาสตร์บอกว่าควรอยู่ (เมตร)

STATS_JS = "window.__pca.stats()"
CLOUD_JS = "window.__pca.cloud()"
SPEC_JS = "window.__pca.stageSpec"
N_STEPS_JS = "window.__pca.nSteps"
POSE_JS = ("(() => { const P = window.__pca; P.act('act:pose'); P.look(-6 * Math.PI / 180, 0); "
           "P.settle(6); return true; })()")


# ─────────────────── linear algebra อิสระใน Python (ไม่เรียกโค้ดของหน้าเลย) ───────────────────
def mean3(pts):
    n = float(len(pts))
    return [sum(p[i] for p in pts) / n for i in range(3)]


def cov3(pts, mu):
    n = float(len(pts)) - 1.0
    C = [[0.0] * 3 for _ in range(3)]
    for p in pts:
        q = [p[i] - mu[i] for i in range(3)]
        for i in range(3):
            for j in range(3):
                C[i][j] += q[i] * q[j]
    return [[C[i][j] / n for j in range(3)] for i in range(3)]


def jacobi_sym(A):
    """cyclic Jacobi สำหรับเมทริกซ์สมมาตร 3×3 — implementation ของ Python เอง
    (หน้าใช้ tol=1e-30; ที่นี่ threshold หยาบกว่าได้ เพราะเทียบแค่ 1e-8)"""
    a = [r[:] for r in A]
    v = [[1.0 if i == j else 0.0 for j in range(3)] for i in range(3)]      # คอลัมน์ = eigenvector
    for _ in range(80):
        off = abs(a[0][1]) + abs(a[0][2]) + abs(a[1][2])
        fro = abs(a[0][0]) + abs(a[1][1]) + abs(a[2][2])
        if off <= 1e-14 * (fro + 1e-30):
            break
        for (p, q) in ((0, 1), (0, 2), (1, 2)):
            apq = a[p][q]
            if abs(apq) < 1e-18:
                continue
            th = (a[q][q] - a[p][p]) / (2.0 * apq)
            t = (1.0 if th >= 0 else -1.0) / (abs(th) + math.sqrt(th * th + 1.0))
            c = 1.0 / math.sqrt(1.0 + t * t)
            s = t * c
            app, aqq = a[p][p], a[q][q]
            a[p][p] = c * c * app - 2.0 * s * c * apq + s * s * aqq
            a[q][q] = s * s * app + 2.0 * s * c * apq + c * c * aqq
            a[p][q] = a[q][p] = 0.0
            for r in range(3):
                if r == p or r == q:
                    continue
                arp, arq = a[r][p], a[r][q]
                a[r][p] = a[p][r] = c * arp - s * arq
                a[r][q] = a[q][r] = s * arp + c * arq
            for r in range(3):
                vrp, vrq = v[r][p], v[r][q]
                v[r][p] = c * vrp - s * vrq
                v[r][q] = s * vrp + c * vrq
    vals = [a[i][i] for i in range(3)]
    order = sorted(range(3), key=lambda i: -vals[i])
    return [vals[i] for i in order], [[v[r][i] for r in range(3)] for i in order]


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def norm(a):
    return math.sqrt(dot(a, a))


def analyze(cloud):
    """ทำ PCA ใหม่ทั้งหมดใน Python จากข้อมูลดิบที่หน้าส่งออกมา"""
    pts = cloud["points"]
    mu = mean3(pts)
    C = cov3(pts, mu)
    q = [[p[i] - mu[i] for i in range(3)] for p in pts]
    vals, vecs = jacobi_sym(C)
    tr = C[0][0] + C[1][1] + C[2][2]
    det = (C[0][0] * (C[1][1] * C[2][2] - C[1][2] * C[2][1])
           - C[0][1] * (C[1][0] * C[2][2] - C[1][2] * C[2][0])
           + C[0][2] * (C[1][0] * C[2][1] - C[1][1] * C[2][0]))
    tr2 = sum(C[i][j] * C[i][j] for i in range(3) for j in range(3))
    c1 = 0.5 * (tr * tr - tr2)
    bmin = [min(qi[i] for qi in q) for i in range(3)]
    bmax = [max(qi[i] for qi in q) for i in range(3)]
    radius = max(norm(qi) for qi in q)
    return dict(pts=pts, q=q, mu=mu, C=C, vals=vals, vecs=vecs, tr=tr, det=det, c1=c1,
                half=half_of(q, vecs), ext=ext_of(q), bmin=bmin, bmax=bmax, radius=radius, n=len(pts))


def half_of(q, vecs):
    return [max(abs(dot(qi, vecs[k])) for qi in q) for k in range(3)]


def ext_of(q):
    return [max(abs(qi[i]) for qi in q) for i in range(3)]


def dirvar(C, b):
    return sum(b[i] * sum(C[i][j] * b[j] for j in range(3)) for i in range(3))


def proj_stats(ana, basis_vecs):
    """statistics ของการฉายบน basis (orthonormal) — Python คำนวณเองทั้งหมด"""
    tr = ana["tr"]
    kept = sum(dirvar(ana["C"], b) for b in basis_vecs)
    ssq, worst = 0.0, 0.0
    for qi in ana["q"]:
        r = list(qi)
        for b in basis_vecs:
            c = dot(qi, b)
            r = [r[i] - c * b[i] for i in range(3)]
        d2 = dot(r, r)
        ssq += d2
        worst = max(worst, math.sqrt(d2))
    var_res = ssq / (float(ana["n"]) - 1.0)            # 1/(n−1) ตามคำนิยามเดียวกับ Ĉ
    ssq_all = sum(dot(qi, qi) for qi in ana["q"])      # Σ‖x−x̄‖²
    return dict(kept=kept, keptFrac=kept / tr, droppedFrac=(tr - kept) / tr, varResidual=var_res,
                rmse=math.sqrt(var_res), maxResidual=worst, coordVar=[dirvar(ana["C"], b) for b in basis_vecs],
                totalVar=ssq_all / (float(ana["n"]) - 1.0))


def max_dirvar_search(C, tries=3000, seed=20260):
    """หาค่าสูงสุดของ vᵀĈv ด้วยการค้นหาสุ่ม — เพื่อยืนยันว่า v₁ ที่สื่อรายงานให้ เก็บได้มากจริง"""
    rnd = _rng(seed)
    best = 0.0
    for _ in range(tries):
        g = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]
        n = norm(g)
        if n < 1e-9:
            continue
        b = [x / n for x in g]
        best = max(best, dirvar(C, b))
    return best


def _rng(seed):
    a = [int(seed) & 0xFFFFFFFF]

    def f():
        a[0] = (a[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = (a[0] ^ (a[0] >> 15)) * (1 | a[0]) & 0xFFFFFFFF
        t = (t + ((t ^ (t >> 7)) * (61 | t) & 0xFFFFFFFF)) & 0xFFFFFFFF
        t ^= t >> 14
        return (t & 0xFFFFFFFF) / 4294967296.0
    return f


# ───────────────────────── world map (ซ้ำคำประกาศใน math_core) ─────────────────────────
def drawn_expect(ana, p, basis_vecs, scale, center):
    """ตำแหน่งที่จุดหนึ่ง *ควร* ถูกวาด: center + W(projection(p) − mean) · scale
       โดย W = (x, y, z) → (x, z, −y)  (permutation เดียวกับ math_core.worldOf, det = +1)"""
    qi = [p[i] - mu for i, mu in enumerate(ana["mu"])]
    pr = [0.0, 0.0, 0.0]                                # π(x) = Σⱼ (q·bⱼ) bⱼ  (ส่วนที่ยังอยู่)
    for b in basis_vecs:
        c = dot(qi, b)
        pr = [pr[i] + c * b[i] for i in range(3)]
    w = [pr[0], pr[2], -pr[1]]
    return [w[i] * ana["scale"] + ana["center"][i] for i in range(3)]


# ─────────────── แบบแผนเวที: expectation ที่เขียนอิสระใน Python ───────────────
NEAR_TARGET = 1.40        # invariant #1 ของสื่อ: ระยะด้านข้างถึงจุดที่ใกล้ตาที่สุด (m)
BASE_BOTTOM = 1.00        # invariant #2: ฐานล่างของกล่องกระจุกต้องอยู่ที่ระดับนี้ (m)
DOT_BASE = (0.020, 0.0125)    # ขนาดจุดพื้นฐาน (raw, projected) ที่ระยะ 1 m ตามที่สื่อประกาศไว้


def stage_expect (spec, ana):
    """คำนวณมาตราส่วนและระยะเวทีใหม่ทั้งหมดใน Python — ไม่เรียกโค้ดของสื่อ:
       scale = min(longMax/2·half₁, vertMax/2·h_z, depthMax/2·h_y)
       dist  = max(NEAR_TARGET + ครึ่งความลึกที่วาดจริง, longMax/2)  ⟹ จุดใกล้ตา ≥ NEAR_TARGET"""
    hz = max(abs(q[2]) for q in ana["q"])
    hy = max(abs(q[1]) for q in ana["q"])
    sc = min(spec["longMax"] / (2.0 * ana["half"][0]), spec["vertMax"] / (2.0 * hz), spec["depthMax"] / (2.0 * hy))
    return sc, max(NEAR_TARGET + hy * sc, spec["longMax"] / 2.0), hz, hy


# ───────────────────────────── local http server ─────────────────────────────
def start_server():
    """serve โฟลเดอร์งานบนพอร์ตว่าง (Chrome ห้าม import module จาก file://)"""
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=ROOT, **kw)

        def log_message(self, *a):
            pass
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    for port in (8080, 8093, 8094, 0):
        try:
            httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), H)
        except OSError:
            continue
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        return httpd, "http://127.0.0.1:%d" % httpd.server_address[1]
    raise SystemExit("เปิด local http server ไม่ได้")


def load(page, base, seed, nidx, mode=None, basis=None, toggles=None, pose=True):
    qs = ["seed=%d" % seed, "n=%d" % nidx]
    if mode:
        qs.append("mode=%d" % mode)
    if basis:
        qs.append("basis=%s" % basis)
    for k, v in (toggles or {}).items():
        qs.append("%s=%d" % (k, 1 if v else 0))
    page.goto(base + PAGE + "?" + "&".join(qs), wait_until="load")
    page.wait_for_function("window.__pca && window.__pcaReady === true", timeout=30000)
    if pose:
        page.evaluate(POSE_JS)


# ───────────────────────────────── runner ─────────────────────────────────
PASS = [0]
ERRORS = []


def ck(name, ok, detail=""):
    if ok:
        PASS[0] += 1
        return True
    ERRORS.append("%s — %s" % (name, detail))
    print("  FAIL %s  %s" % (name, detail))
    return False


def rel(got, want):
    """ผลต่างสัมพัทธ์ที่ปลอดภัยกับค่าที่เป็น 0 จริง (เช่น residual ของ ℝ³ ที่ไม่ฉายเลย):
       ค่าที่ |·| < 1e-6 ถือว่าเป็นศูนย์ร่วม และวัดผลต่างด้วยเกณฑ์สัมบูรณ์ 1e-8 ของค่านั้น"""
    scale = max(abs(got), abs(want), 1e-6)
    return abs(got - want) / scale


def verify_math_case(page, base, seed, nidx, spec, n_steps):
    load(page, base, seed, nidx, mode=3)
    st = page.evaluate(STATS_JS)
    cl = page.evaluate(CLOUD_JS)
    ana = analyze(cl)
    n = ana["n"]
    tag = "seed=%-8d n=%-4d" % (seed, n_steps[nidx])
    ck(tag + ": seed/n ตรงกับที่ขอ", st["seed"] == cl["seed"] == seed and n == cl["n"] == st["n"] == n_steps[nidx])

    for k in range(3):
        ck(tag + ": λ%d ตรงกับ Jacobi ของ Python" % (k + 1), rel(st["values"][k], ana["vals"][k]) < TOL_EIG,
           "หน้า %.10f / Python %.10f" % (st["values"][k], ana["vals"][k]))
        ck(tag + ": σ%d = √λ%d" % (k + 1, k + 1), rel(st["sigma"][k], math.sqrt(ana["vals"][k])) < TOL_REL)
        ck(tag + ": explained%d = λ%d / tr Ĉ" % (k + 1, k + 1), abs(st["explained"][k] - ana["vals"][k] / ana["tr"]) < 1e-12)
        ck(tag + ": cumulative%d = Σ explained" % (k + 1),
           abs(st["cumulative"][k] - sum(st["explained"][:k + 1])) < 1e-12)
    ck(tag + ": tr Ĉ = Σλ", rel(st["trace"], ana["tr"]) < TOL_REL and rel(st["trace"], sum(ana["vals"])) < 1e-8,
       "หน้า %.10f / Python %.10f" % (st["trace"], ana["tr"]))
    ck(tag + ": det Ĉ = Πλ", rel(st["det"], ana["det"]) < 1e-7 and rel(st["det"], math.prod(ana["vals"])) < 1e-6)
    ck(tag + ": Σ explained = 1", abs(sum(st["explained"]) - 1.0) < 1e-12)
    cp = st["charPoly"]
    ck(tag + ": χ(t) — c2 = −tr Ĉ", abs(cp["c2"] + st["trace"]) < 1e-9)
    ck(tag + ": χ(t) — c1 = Σ principal minor 2×2", rel(cp["c1"], ana["c1"]) < 1e-8)
    ck(tag + ": χ(t) — c0 = −det Ĉ", abs(cp["c0"] + st["det"]) < 1e-6)

    worst_o = worst_l = worst_r = 0.0
    for e in range(3):
        vi = st["vectors"][e]
        lam = st["values"][e]
        worst_l = max(worst_l, abs(norm(vi) - 1.0))
        for f in range(e + 1, 3):
            worst_o = max(worst_o, abs(dot(vi, st["vectors"][f])))
        Cv = [sum(ana["C"][r][c] * vi[c] for c in range(3)) for r in range(3)]     # C · v_e
        worst_r = max(worst_r, norm([Cv[r] - lam * vi[r] for r in range(3)]))
    ck(tag + ": vᵢ หรือorthonormal (‖v‖=1, vᵢ·vⱼ=0)", worst_o < TOL_ABS and worst_l < TOL_ABS,
       "max %.2e / %.2e" % (worst_o, worst_l))
    ck(tag + ": ‖Ĉvᵢ − λᵢvᵢ‖ ≈ 0 (Jacobi ให้ eigenvector จริง)", worst_r < 1e-7, "max %.2e" % worst_r)
    ck(tag + ": λ1 ≥ λ2 ≥ λ3", all(st["values"][i] >= st["values"][i + 1] - 1e-12 for i in range(2)))
    ratio = st["values"][0] / max(1e-12, st["values"][2])
    ck(tag + ": λ1/λ3 ≥ 8 (ทรงรีแบนพอที่ตาจะเห็นแกนสั้น)", ratio >= 8.0, "ratio = %.1f" % ratio)

    worst_h = max(rel(st["half"][k], ana["half"][k]) for k in range(3))
    ck(tag + ": halfₖ = max|x−x̄|‖vₖ| (ขนาดที่วาด = ข้อมูลจริง)", worst_h < 1e-8, "worst rel %.2e" % worst_h)
    ck(tag + ": radius = max‖x−x̄‖", rel(st["radius"], ana["radius"]) < 1e-9)
    ck(tag + ": bbox = ขอบเขตจุดทุกจุดเทียบกับ x̄",
       all(abs(st["bbox"][i] - ana["bmin"][i]) < 1e-12 and abs(st["bbox"][3 + i] - ana["bmax"][i]) < 1e-12 for i in range(3)))

    # stagePlan: สูตรเดียวกันเขียนใน Python แล้วเทียบกับเลขที่หน้าใช้จริง
    sc_py, dist_py, hz, hy = stage_expect(spec, ana)
    ck(tag + ": scale = min(longMax/2half₁, vertMax/2h_z, depthMax/2h_y)", rel(st["stage"]["scale"], sc_py) < 1e-9,
       "หน้า %.10f / Python %.10f" % (st["stage"]["scale"], sc_py))
    ck(tag + ": แกนยาวที่วาด = 2·half₁·scale ≤ %.2f m" % spec["longMax"], 2 * ana["half"][0] * sc_py <= spec["longMax"] + 1e-9,
       "%.3f m" % (2 * ana["half"][0] * sc_py))
    ck(tag + ": ความสูงที่วาด ≤ %.2f m" % spec["vertMax"], 2 * hz * sc_py <= spec["vertMax"] + 1e-9, "%.3f m" % (2 * hz * sc_py))
    ck(tag + ": ความลึกที่วาด ≤ %.2f m" % spec["depthMax"], 2 * hy * sc_py <= spec["depthMax"] + 1e-9, "%.3f m" % (2 * hy * sc_py))
    ck(tag + ": dist = max(%.2f + ครึ่งความลึกที่วาด, longMax/2)" % NEAR_TARGET,
       rel(st["stage"]["dist"], dist_py) < 1e-9, "หน้า %.3f m / Python %.3f m" % (st["stage"]["dist"], dist_py))
    ck(tag + ": center = (0, %.2f, −%.3f)" % (spec["height"], dist_py),
       st["stage"]["center"] == [0, spec["height"], -st["stage"]["dist"]])
    ck(tag + ": invariant #2 ฐานล่างกล่องกระจุก = %.2f m" % BASE_BOTTOM,
       abs(st["stage"]["baseBottom"] - BASE_BOTTOM) < 1e-12, "baseBottom = %.3f m" % st["stage"]["baseBottom"])
    ck(tag + ": invariant #1 nearTarget = %.2f m" % NEAR_TARGET,
       abs(st["stage"]["nearTarget"] - NEAR_TARGET) < 1e-12 and st["stage"]["dist"] - st["stage"]["drawnDepth"] / 2.0 >= NEAR_TARGET - 1e-9,
       "nearFace = %.3f m" % (st["stage"]["dist"] - st["stage"]["drawnDepth"] / 2.0))

    # การกระจายของตัวอย่าง: λ̂ ต้องอยู่ในช่วงที่ทฤษฎีให้ (sd สัมพัทธ์ √(2/(n−1)))
    pop = [s * s for s in cl["design"]["sigma"]]
    sd = math.sqrt(2.0 / (n - 1))
    over = [k for k in range(3) if abs(st["values"][k] - pop[k]) > 5.0 * sd * pop[k]]
    ck(tag + ": |λ̂ₖ − λₖ(pop)| ≤ 5·√(2/(n−1))·λₖ", not over, "เกินที่ k=%s" % over)
    worst_dev = max(abs(st["values"][k] - pop[k]) / pop[k] for k in range(3))
    ck(tag + ": λ3 ≥ MIN_SIGMA²", st["values"][2] >= 0.5 * 0.04 ** 2)

    # ── ตารางเทียบทิศ: ทุกแถวบนการ์ด/แผง ต้องตรงกับการคำนวณอิสระ ──
    worst_k = 0.0
    lines = []          # แถวเดียว (ทิศเดียว) ในตาราง — ใช้เทียบว่า v₁ เก็บได้มากที่สุด
    planes = []
    for a_ in st["altKept"]:
        bs = a_["basis"]
        want = sum(dirvar(ana["C"], b) for b in bs) / ana["tr"]      # kept = Σⱼ bⱼᵀĈbⱼ / tr
        worst_k = max(worst_k, rel(a_["keptFrac"], want))
        ck(tag + ": kept%%(%s) = Σⱼ bⱼᵀĈbⱼ / tr Ĉ (basis %d มิติ)" % (a_["glyph"], len(bs)),
           rel(a_["keptFrac"], want) < 1e-9, "หน้า %.10f / Python %.10f" % (a_["keptFrac"], want))
        for bi, b in enumerate(bs):
            ck(tag + ": ‖เวกเตอร์ที่ %d ของ basis %s‖ = 1" % (bi + 1, a_["glyph"]), abs(norm(b) - 1.0) < 1e-12)
        if len(bs) == 3:
            ck(tag + ": basis %s เป็น orthonormal" % a_["glyph"],
               all(abs(dot(bs[u], bs[w])) < 1e-12 for u in range(3) for w in range(u + 1, 3)))
        (lines if len(bs) == 1 else planes).append((a_["glyph"], a_["keptFrac"]))
    best_line = max(f for _, f in lines)
    ck(tag + ": v₁ เก็บ variance ได้มากกว่าทุกทิศเดี่ยวในตาราง (%s)" % " ".join(g for g, _ in lines),
       best_line < ana["vals"][0] / ana["tr"] - 1e-6, "ทิศอื่นที่ดีที่สุด %.4f vs v₁ %.4f" % (best_line, ana["vals"][0] / ana["tr"]))
    for g, f in lines:
        ck(tag + ": kept(%s) < kept(v₁) — ทิศอื่นแพ้ v₁ เสมอ" % g, f < ana["vals"][0] / ana["tr"] - 1e-6,
           "%.4f vs %.4f" % (f, ana["vals"][0] / ana["tr"]))
    search = max_dirvar_search(ana["C"])
    ck(tag + ": ค้นหาสุ่ม 3000 ทิศ → ไม่มีทิศใดเก็บได้เกิน λ₁ (search %.6f ≤ λ₁ %.6f)" % (search, ana["vals"][0]),
       search <= ana["vals"][0] * (1 + 1e-9))
    pl = st["planeKept"]
    for key, idx in (("v1^v2", (0, 1)), ("v1^v3", (0, 2)), ("v2^v3", (1, 2))):
        want = sum(ana["vals"][i] for i in idx) / ana["tr"]
        ck(tag + ": kept%%(%s) = (λᵢ+λⱼ)/tr" % key, rel(pl[key], want) < 1e-9,
           "หน้า %.10f / Python %.10f" % (pl[key], want))
    ck(tag + ": ระนาบ v₁∧v₂ > v₁∧v₃ > v₂∧v₃", pl["v1^v2"] > pl["v1^v3"] > pl["v2^v3"] + 1e-9)
    best_line_txt = " ".join(g for g, _ in lines)
    best_plane = max(f for _, f in planes)
    print("  ok   %s λ = %s · explained = %s · tr Ĉ = %.4f det = %.5f · v₁ เก็บ %.1f%% "
          "(ทิศเดี่ยวอื่นที่ดีที่สุด %.1f%% [%s] · ระนาบเทียบที่เก็บได้มากที่สุด %.1f%%)" % (
        tag, " ".join("%.4f" % v for v in st["values"]), " / ".join("%.1f%%" % (100 * e) for e in st["explained"]),
        st["trace"], st["det"], 100 * ana["vals"][0] / ana["tr"], 100 * best_line,
        best_line_txt, 100 * best_plane))
    return st, ana


def verify_projection_case(page, base, seed, nidx, mode, spec):
    """ตรวจตัวเลขของโหมดที่เปิดอยู่ + เรขาคณิตของจุดที่วาดจริงในโหมดนั้น"""
    load(page, base, seed, nidx, mode=mode, toggles={"drop": 1, "ell": 1})
    st = page.evaluate(STATS_JS)
    cl = page.evaluate(CLOUD_JS)
    ana = analyze(cl)
    ana["scale"] = st["stage"]["scale"]
    ana["center"] = st["stage"]["center"]
    sc = st["scene"]
    R = st["projection"]
    k = R["k"]
    n = ana["n"]
    tag = "mode ℝ%d" % k
    ps = proj_stats(ana, ana["vecs"][:k])
    BN = page.evaluate("window.__pca.basisNow()")
    ck(tag + ": basis ที่ใช้จริง = v₁…v%dตามที่เมนูเลือก" % k,
       BN["k"] == k and BN["kind"] == "pca" and BN["glyphs"] == ["v" + "₁₂₃"[i] for i in range(k)]
       and all(rel(BN["vectors"][i][c], ana["vecs"][i][c]) < TOL_EIG for i in range(k) for c in range(3)))
    ck(tag + ": kept% = Σλ/tr", rel(R["keptFrac"], ps["keptFrac"]) < 1e-8,
       "หน้า %.8f / Python %.8f" % (R["keptFrac"], ps["keptFrac"]))
    ck(tag + ": kept + dropped = 1", abs(R["keptFrac"] + R["droppedFrac"] - 1.0) < 1e-12)
    ck(tag + ": เอกลักษณ์ Var(residual) + ΣvᵀĈv = tr Ĉ",
       abs((R["varResidual"] + R["keptVar"]) - st["trace"]) < 1e-9 * max(1.0, st["trace"]), "gap = %.2e" % R["identityGap"])
    ck(tag + ": √Var(residual) ตรงกับ Python", rel(R["rmseResidual"], ps["rmse"]) < 1e-8,
       "หน้า %.8f / Python %.8f" % (R["rmseResidual"], ps["rmse"]))
    ck(tag + ": max‖x−πx‖ ตรงกับ Python", rel(R["maxResidual"], ps["maxResidual"]) < 1e-8,
       "หน้า %.8f / Python %.8f" % (R["maxResidual"], ps["maxResidual"]))
    ck(tag + ": Var(residual) ≤ Var(x) = tr Ĉ", R["varResidual"] <= st["trace"] + 1e-9)
    tv = R["sumSqSig"] / (n - 1.0)
    ck(tag + ": Σ‖x−x̄‖²/(n−1) ที่แผงแสดง = tr Ĉ = Σλ (ความแปรปรวนรวม)",
       rel(tv, ps["totalVar"]) < 1e-9 and rel(tv, st["trace"]) < 1e-9 and rel(tv, sum(ana["vals"])) < 1e-8,
       "หน้า %.6f / Python %.6f / tr Ĉ %.6f / Σλ %.6f" % (tv, ps["totalVar"], st["trace"], sum(ana["vals"])))
    ck(tag + ": Var(vⱼᵀx) บนแผง = vⱼᵀĈvⱼ ของทิศที่ใช้อยู่จริง",
       all(rel(R["coordVar"][j], ps["coordVar"][j]) < 1e-8 for j in range(k)))
    ck(tag + ": Varบนแกนที่ฉาย = λ ของแกนนั้น", all(rel(R["coordVar"][j], ps["coordVar"][j]) < 1e-8 for j in range(k)))


    # ── จุดที่วาดจริง = ข้อมูลจริงภายใต้ world map ──
    samples = sc["drawnSample"] if k < 3 else sc["rawSample"]
    basis_for_map = ana["vecs"][:k] if k < 3 else [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    dev = 0.0
    for smp in samples:
        want = drawn_expect(ana, cl["points"][smp["i"]], basis_for_map, ana["scale"], ana["center"])
        dev = max(dev, max(abs(smp["p"][i] - want[i]) for i in range(3)))
    ck(tag + ": จุด %d ตัวอย่างที่วาด = world map ของข้อมูลจริง (x→+X, y→−Z, z→+Y)" % len(samples), dev < TOL_DRAW,
       "max dev %.2e m" % dev)
    ck(tag + ": วาดจุดครบ n = %d (ไม่สุ่มใหม่ ไม่หาย)" % n, (sc["nProjected"] if k < 3 else sc["nOther"] + sc["nProjected"]) == n,
       "%d + %d vs n=%d" % (sc["nProjected"], sc["nOther"], n))

    if k < 3:
        worst_off = 0.0
        for smp in samples:
            c = ana["center"]
            d = [smp["p"][i] - c[i] for i in range(3)]
            for bi in range(k, 3):
                x, y, z = ana["vecs"][bi]
                wv = [x, z, -y]
                worst_off = max(worst_off, abs(dot(d, wv)))
        # จุดที่ renderer วาดเก็บใน Float32BufferAttribute → ความละเอียด ~1e-7 ต่อเมตร;
         # เกณฑ์คือ "อยู่บนระนาบที่ถูกฉาย" ภายในความละเอียดของ geometry ที่วาดจริง ไม่ใช่เกณฑ์ float64
        ck(tag + ": จุดที่ฉายแล้วอยู่บนระนาบ/แกนที่ถูกทิ้ง (tolerance = ความละเอียด float32 ของ geometry)",
           worst_off < 3e-6, "max %.2e m" % worst_off)

    # ── สิ่งที่ renderer "วาดจริง" (อ่านจาก geometry / material ของ scene graph) ──
    # เทียบกับสิ่งที่ Python คำนวณเองผ่าน world map เดียวเดียวกับที่หน้าเว็บใช้: data (x,y,z) → (x, z, −y)
    wv = lambda x: [x[0], x[2], -x[1]]
    dirs = [a for a in sc["axisInfo"] if a["kind"] == "axis"]
    ck(tag + ": วาดแกนของ basis ครบ %d แกน (= จำนวนทิศที่ใช้จริง)" % k, len(dirs) == k, "%d แกน" % len(dirs))
    adir = 0.0
    for a in dirs:
        w = wv(ana["vecs"][a["axisIndex"]])
        adir = max(adir, 1.0 - abs(dot(a["drawnDir"], w)) / norm(w), a["dirMismatch"] or 0.0)
    ck(tag + ": ทิศของแกนที่วาด = world map ของ eigenvector ของแกนนั้น (ไม่ใช่ทิศที่หมุนเพี้ยน)", adir < 1e-9,
       "max 1−|dot(drawn, want)| = %.2e · max 1−|dot(drawn, world map)| = %.2e" % (
           max([a["dirMismatch"] or 0.0 for a in dirs] or [0.0]), adir))
    ell = sc.get("ellipsoid")
    if ell:
        ed = max(1.0 - abs(dot(ell["axes"][i], wv(ana["vecs"][i]))) / norm(ana["vecs"][i]) for i in range(3))
        sm = max(abs(ell["semiDrawn"][i] - 2 * math.sqrt(ana["vals"][i]) * ana["scale"]) for i in range(3))
        ck(tag + ": ellipsoid ที่วาด = ทิศ eigen ครบ 3 ทิศ + ครึ่งแกน 2σ·scale", ed < 1e-9 and sm < 1e-6,
           "max 1−|dot| = %.2e · max |Δครึ่งแกน| = %.2e m" % (ed, sm))
    if k == 2:
        pl, fit = sc.get("plane"), sc.get("planeFit")
        okp = bool(pl) and bool(fit) and not pl.get("error")
        ck(tag + ": อ่านแผ่นระนาบที่วาดจริงจาก geometry ได้ครบ 4 จุดมุม", okp,
           str(pl.get("error")) if (pl and pl.get("error")) else ("ไม่มี mesh" if not pl else "ไม่มีจุด"))
        if okp:
            want_h = [ana["half"][j] * ana["scale"] for j in range(2)]
            dh = max(abs(pl["half"][i] - want_h[i]) for i in range(2))
            dplane = max(1.0 - abs(dot(pl["u"], wv(ana["vecs"][0]))), 1.0 - abs(dot(pl["v"], wv(ana["vecs"][1]))),
                        1.0 - abs(dot(pl["nrm"], wv(ana["vecs"][2]))))
            ck(tag + ": ขนาดแผ่นที่วาด = ครึ่งขอบของจุดที่ถูกฉายจริง (max|q·bⱼ|·scale)", dh < 1e-5 and pl["rectErr"] < 1e-6,
               "แผ่น (%.4f × %.4f) m · ควรเป็น (%.4f × %.4f) m ·ต่าง %.2e m · rectErr %.2e" % (
                   pl["half"][0], pl["half"][1], want_h[0], want_h[1], dh, pl["rectErr"]))
            ck(tag + ": แผ่นที่วาดวางบน span{v₁,v₂} ของข้อมูลจริง (u∥v₁, v∥v₂, n∥v₃)", dplane < 1e-9,
               "max 1−|dot| = %.2e" % dplane)
            ck(tag + ": จุดที่ถูกฉายจริง %d จุดแนบกับแผ่นที่วาดและอยู่ในขอบของแผ่น" % fit["nPoints"],
               fit["offPlaneMax"] < 3e-6 and fit["pointsOutsideQuad"] == 0 and max(fit["overU"], fit["overV"]) < 1e-5,
               "off-plane = %.2e m · เลยขอบ (%.2e, %.2e) m · นอกแผ่น = %d จุด" % (
                   fit["offPlaneMax"], fit["overU"], fit["overV"], fit["pointsOutsideQuad"]))

    # ── ขนาดจุดที่วาดจริง (PointsMaterial) ──
    cs = page.evaluate("window.__pca.clusterSpec")
    _, dist_py, _, _ = stage_expect(spec, ana)      # ระยะเวทีที่ควรเป็น (เขียนสูตรอิสระใน Python)
    dist_ratio = dist_py / cs["base"]["dist"]       # ชดเชยระยะ: จุดบนจอยังคงขนาดเท่าเดิม
    ds = page.evaluate("window.__pca.dotSpec")
    sizes = {p["kind"]: p["size"] for p in sc["pointDraw"]}
    ck(tag + ": ทุกกลุ่มจุดใช้ PointsMaterial + sizeAttenuation (ขนาดคงที่ในหน่วยเมตร)",
       len(sc["pointDraw"]) >= 1 and all(p["attenuation"] for p in sc["pointDraw"]),
       json.dumps(sc["pointDraw"]))
    want_size = [ds["base"][0] * ds["scale"] * dist_ratio, ds["base"][1] * ds["scale"] * dist_ratio]
    bad = [p for p in sc["pointDraw"] if min(abs(p["size"] - w) for w in want_size) > 1e-12]
    ck(tag + ": ขนาดจุดที่วาด = ค่าพื้นฐาน × ตัวคูณจุด (x%.2f) × ชดเชยระยะ (x%.3f) — ทั้งจุดที่ฉายและจุดเดิม" % (
        ds["scale"], dist_ratio),
        not bad, "base %s ×%.2f ×%.3f → (%.4f, %.4f) m · ที่วาดจริง %s" % (
            json.dumps(ds["base"]), ds["scale"], dist_ratio, want_size[0], want_size[1],
            json.dumps([p["size"] for p in sc["pointDraw"]])))
    ck(tag + ": จุดถูกขยาย 2 เท่าตามที่ขอ (กลุ่มหลัก ≥ 2× ค่าพื้นฐานเดิม 0.020 m ที่ระยะฐาน 2.00 m)",
        2.0 <= ds["scale"] <= 4.0 and (max(sizes.values() or [0.0]) - 2 * DOT_BASE[0] * dist_ratio) > -1e-12,
        "scale = %.2f · ชดเชยระยะ ×%.3f · ขนาดที่วาด %s m" % (ds["scale"], dist_ratio, json.dumps(sorted(sizes.values()))))

    # ── ขอบเขตของเวที: ระยะ มุม และการไม่ทับกัน ──
    ck(tag + ": ตัวคูณกระจุกที่หน้าใช้จริง = ค่า default ของสื่อ (k = 2)", abs(cs["k"] - 2.0) < 1e-12,
        "clusterSpec.k = %.3g · เพดาน k = %.3g" % (cs["k"], cs["maxK"]))
    env_far = math.hypot(spec["longMax"] / 2.0,
                         max(abs(spec["height"] - spec["vertMax"] / 2.0 - 1.6),
                             abs(spec["height"] + spec["vertMax"] / 2.0 - 1.6)),
                         dist_py + spec["depthMax"] / 2.0)
    ck(tag + ": ระยะตาถึงจุดที่วาด ≥ %.2f m (invariant #1) และ ≤ ขอบกล่อง %.2f m" % (NEAR_TARGET, env_far),
        sc["eyeMin"] >= NEAR_TARGET - 1e-9 and sc["eyeMax"] <= env_far + 1e-6,
        "[%.2f, %.2f] m · หน้าใกล้ของกล่องอยู่ %.2f m" % (
            sc["eyeMin"], sc["eyeMax"], st["stage"]["dist"] - st["stage"]["drawnDepth"] / 2.0))
    horiz = math.hypot(st["stage"]["center"][0], st["stage"]["center"][2])
    elev_c = math.degrees(math.atan2(st["stage"]["center"][1] - 1.6, horiz))
    ck(tag + ": ศูนย์กลางกระจุกอยู่ห่าง %.3f m ตามแนวนอน (ยืนไม่ไกล — สูตรอิสระใน Python)" % dist_py,
        abs(horiz - dist_py) < 1e-9, "หน้า %.6f m / Python %.6f m" % (horiz, dist_py))
    ck(tag + ": ศูนย์กลางกระจุกสูง %.2f m (ระดับอก–ตาของผู้ยืน %.1f m)" % (spec["height"], 1.6),
        abs(st["stage"]["center"][1] - spec["height"]) < 1e-9 and abs(sc["stageCenterWorld"][1] - spec["height"]) < 1e-9)
    ck(tag + ": หันหน้าหากระจุกได้ตรง ๆ — ศูนย์กลางอยู่ ≤ 20° เหนือแนวราบ", elev_c <= 20.0, "ศูนย์กลาง %.1f°" % elev_c)
    env_elev = math.degrees(math.atan2(spec["height"] + spec["vertMax"] / 2.0 - 1.6, NEAR_TARGET))
    ck(tag + ": ไม่แหงนเกินขอบกล่องของแบบนี้ (%.1f°)" % env_elev, sc["elevMaxDeg"] <= env_elev + 1e-9,
        "สูงสุด %.1f° · ขอบทฤษฎี %.1f°" % (sc["elevMaxDeg"], env_elev))
    env_az = math.degrees(math.atan2(spec["longMax"] / 2.0, NEAR_TARGET))
    ck(tag + ": มุมซ้าย–ขวาไม่เกินขอบกล่องของแบบนี้ (%.1f°)" % env_az, sc["maxAzDeg"] <= env_az + 1e-9,
        "วัดจริง %.1f° · ขอบทฤษฎี %.1f°" % (sc["maxAzDeg"], env_az))
    ck(tag + ": ไม่ก้มเกิน — มุมลงต่ำสุด ≥ −30°", sc["elevMinDeg"] >= -30.0, "%.1f°" % sc["elevMinDeg"])
    ck(tag + ": ฐานล่างกระจุกไม่ต่ำกว่า %.2f m (invariant #2 — กันทับเมนู)", sc["lowY"] >= BASE_BOTTOM - 1e-9,
        "จุดต่ำสุด y = %.3f m" % sc["lowY"])
    drawn = sc["drawnHalf"] if k < 3 else sc["allHalf"]
    ck(tag + ": ขอบเขตที่วาด (จาก geometry จริง) ≤ ขอบเขตของ stagePlan",
       drawn[0] * 2 <= spec["longMax"] + 1e-6 and drawn[1] * 2 <= spec["vertMax"] + 1e-6
       and drawn[2] * 2 <= spec["depthMax"] + 1e-6,
       "drawn (%.3f, %.3f, %.3f) m" % tuple(2 * h for h in drawn))
    ck(tag + ": ความยาวแกน eigenvector ที่วาดจริง ≤ %.2f m" % spec["longMax"],
       sc["axisMaxReach"] * 2 <= spec["longMax"] + 1e-6, "2·reach = %.3f m" % (sc["axisMaxReach"] * 2))
    ck(tag + ": ทุกจุดอยู่ในกรอบมองแนวราบ (|az| ≤ FOV/2)", sc["azFrac"] <= 1.0, "az %.1f° / half %.1f°" % (sc["maxAzDeg"], sc["halfHorizDeg"]))
    ck(tag + ": เมนูการ์ดทุกใบอยู่ใต้สายตา (elev < 0°) — ก้มมองจริง", sc["cardElevMax"] < -1.0, "สูงสุด %.1f°" % sc["cardElevMax"])
    ck(tag + ": เมนูการ์ดยังมองเห็น (elev > −60°)", sc["cardElevMin"] > -60.0, "ต่ำสุด %.1f°" % sc["cardElevMin"])
    ck(tag + ": แผงตัวเลขอยู่ใต้สายตาใน −45°…−15°", -45.0 <= sc["consoleElevDeg"] <= -15.0, "%.1f°" % sc["consoleElevDeg"])
    ck(tag + ": กระจุกไม่ทับแผงตัวเลข (เว้น ≥ 0.10 m)", sc["lowY"] >= sc["consoleTopY"] + 0.10,
       "จุดต่ำสุด y=%.3f vs ขอบบนแผง y=%.3f" % (sc["lowY"], sc["consoleTopY"]))
    ck(tag + ": กระจุกไม่ทับการ์ดเมนู (เว้น ≥ 0.10 m)", sc["lowY"] >= max(c["topY"] for c in sc["cards"]) + 0.10,
       "จุดต่ำสุด y=%.3f vs ขอบบนการ์ด y=%.3f" % (sc["lowY"], max(c["topY"] for c in sc["cards"])))
    print("  ok   %-12s drawn (%.2f × %.2f × %.2f) m · ระยะตา [%.2f, %.2f] m · az %.1f°/%.1f° · elev %.1f…%.1f° · kept %.1f%%" % (
        tag, 2 * drawn[0], 2 * drawn[1], 2 * drawn[2], sc["eyeMin"], sc["eyeMax"],
        sc["maxAzDeg"], sc["halfHorizDeg"], sc["elevMinDeg"], sc["elevMaxDeg"], 100 * R["keptFrac"]))


def verify_modes_ordering(page, base, seed, nidx):
    """สิ่งที่สื่อสอน: ลดมิติลงทีละขั้นต้อง "เสียข้อมูล" มากขึ้นจริงตามลำดับ"""
    vals = {}
    for k in (3, 2, 1):
        load(page, base, seed, nidx, mode=k)
        st = page.evaluate(STATS_JS)
        vals[k] = st["projection"]
    ck("ลำดับมิติ: kept(ℝ3)=100% > kept(ℝ2) > kept(ℝ1)",
       abs(vals[3]["keptFrac"] - 1.0) < 1e-12 and vals[2]["keptFrac"] > vals[1]["keptFrac"] + 1e-6)
    ck("ลำดับมิติ: residual ลดลงเมื่อเพิ่มมิติ (rmse ℝ1 > ℝ2 > 0)",
       vals[1]["rmseResidual"] > vals[2]["rmseResidual"] > 0.0,
       "%.4f > %.4f" % (vals[1]["rmseResidual"], vals[2]["rmseResidual"]))
    tr3 = vals[3]["keptVar"] + vals[3]["varResidual"]  # ℝ³: kept = tr Ĉ, residual = 0
    ck("ลำดับมิติ: Var(residual) + keptVar = tr Ĉ ทุกมิติ",
       all(abs(vals[k]["varResidual"] + vals[k]["keptVar"] - tr3) < 1e-9 * max(1.0, tr3) for k in (1, 2, 3)))
    print("  ok   ลำดับมิติ      kept: ℝ1 %.1f%% < ℝ2 %.1f%% < ℝ3 100.0%% · rmse: %.4f > %.4f > 0" % (
        100 * vals[1]["keptFrac"], 100 * vals[2]["keptFrac"], vals[1]["rmseResidual"], vals[2]["rmseResidual"]))


def verify_determinism(page, base, seed, nidx):
    load(page, base, seed, nidx, mode=3)
    a1 = page.evaluate(STATS_JS)
    load(page, base, seed, nidx, mode=3)
    a2 = page.evaluate(STATS_JS)
    ck("เมล็ดเดียวกัน → ข้อมูลเหมือนกันระดับ bit", json.dumps(a1["values"]) == json.dumps(a2["values"])
       and json.dumps(a1["mu"]) == json.dumps(a2["mu"]) and json.dumps(a1["vectors"]) == json.dumps(a2["vectors"]),
       "%.12f vs %.12f" % (a1["values"][0], a2["values"][0]))
    page.evaluate("window.__pca.reseed(); window.__pca.settle(4);")
    a3 = page.evaluate(STATS_JS)
    ck("⟳ /ปุ่ม N → ได้ข้อมูลชุดใหม่จริง (seed เปลี่ยน + shape เปลี่ยน)",
       a3["seed"] != a1["seed"] and max(rel(a3["values"][k], a1["values"][k]) for k in range(3)) > 1e-3)
    ck("ข้อมูลชุดใหม่ยัง valid (Σ explained = 1, orthonormal)",
       abs(sum(a3["explained"]) - 1.0) < 1e-12 and max(abs(dot(a3["vectors"][0], a3["vectors"][1])),
        abs(dot(a3["vectors"][0], a3["vectors"][2])), abs(dot(a3["vectors"][1], a3["vectors"][2]))) < 1e-9)
    ck("การ์ด ⟳ บนแผง = เมลถัดไปที่หน้าประกาศไว้", a3["seed"] == a1["seed"] + 1, "%d → %d" % (a1["seed"], a3["seed"]))
    print("  ok   determinism   seed %d ⟳ %d · λ₁ %.4f → %.4f (ข้อมูลใหม่จริง)" % (a1["seed"], a3["seed"], a1["values"][0], a3["values"][0]))


def verify_sample_size(page, base, seed, spec):
    devs = {}
    for nidx, want in ((0, 300), (1, 900), (2, 2400)):
        load(page, base, seed, nidx, mode=3)
        st = page.evaluate(STATS_JS)
        cl = page.evaluate(CLOUD_JS)
        sc = st["scene"]
        ck("n = %d: วาดจุดครบ %d จุด" % (want, want), sc["nOther"] + sc["nProjected"] == want,
           "%d + %d" % (sc["nProjected"], sc["nOther"]))
        pop = [s * s for s in cl["design"]["sigma"]]
        sd = math.sqrt(2.0 / (want - 1))
        ck("n = %d: λ̂ อยู่ภายใน 5·√(2/(n−1)) ของ λ(pop)" % want,
           all(abs(st["values"][k] - pop[k]) <= 5 * sd * pop[k] for k in range(3)))
        devs[want] = max(abs(st["values"][k] - pop[k]) / pop[k] for k in range(3))
        # การเปลี่ยน n ต้องไม่ทำให้ขอบเขตของเวทีพัง (กระจุกยังขนาดเดิม)
        ck("n = %d: ขนาดที่วาดยังอยู่ในเดือนเวที (แกนยาว ≤ %.2f m)" % (want, spec["longMax"]),
           2 * st["half"][0] * st["stage"]["scale"] <= spec["longMax"] + 1e-9)
    ck("n = 300 เบนจาก λ(pop) มากกว่า n = 2400 (สิ่งที่สื่อให้เห็น: sampling error)",
       devs[300] > devs[2400], "dev(300)=%.4f dev(2400)=%.4f" % (devs[300], devs[2400]))
    print("  ok   ขนาดตัวอย่าง   dev ของ λ̂ จาก λ(pop): n=300 → %.2f%% · n=900 → %.2f%% · n=2400 → %.2f%%" % (
        100 * devs[300], 100 * devs[900], 100 * devs[2400]))


def verify_dot_scale(page, base, seed, nidx):
    """?dots= คือตัวคูณขนาดจุดที่ผู้ใช้ปรับเองได้จาก URL — default ต้องเป็น 2 เท่าของค่าพื้นฐาน
       และค่าที่เกินขอบถูก clamp ให้ปลอดภัย (0.25…4) ไม่ทำให้จุดหายหรือเละ"""
    cases = [(None, 2.0), ("1", 1.0), ("3", 3.0), ("99", 4.0), ("-2", 0.25), ("abc", 2.0)]
    for q, want in cases:
        qs = ["seed=%d" % seed, "n=%d" % nidx, "mode=2", "ell=0"]
        if q is not None:
            qs.append("dots=" + q)
        page.goto(base + PAGE + "?" + "&".join(qs), wait_until="load")
        page.wait_for_function("window.__pca && window.__pcaReady === true", timeout=30000)
        ds = page.evaluate("window.__pca.dotSpec")
        st = page.evaluate(STATS_JS)
        sc = st["scene"]
        now = page.evaluate("window.__pca.stageNow()")
        cs = page.evaluate("window.__pca.clusterSpec")
        ratio = now["dist"] / cs["base"]["dist"]      # ตัวชดเชยระยะที่สื่อใช้ (จุดบนจอคงขนาดเดิม)
        sizes = {p["kind"]: p["size"] for p in sc["pointDraw"]}
        ok = (abs(ds["scale"] - want) < 1e-12
              and abs(sizes.get("projected", 0) - ds["base"][0] * want * ratio) < 1e-12
              and abs(sizes.get("raw", 0) - ds["base"][1] * want * ratio) < 1e-12
              and sc["nProjected"] > 0
              and now["dist"] - now["drawn"][2] / 2.0 >= NEAR_TARGET - 1e-9)
        ck("?dots=%s → ×%.2f: จุดที่วาด = ค่าพื้นฐาน × ตัวคูณ × ชดเชยระยะ (×%.3f) ครบทุกกลุ่ม" % (str(q), want, ratio), ok,
           "scale = %.2f · projected/raw = %.4f / %.4f m · จุดที่ฉาย %d" % (
               ds["scale"], sizes.get("projected", 0), sizes.get("raw", 0), sc["nProjected"]))
    print("  ok   ?dots= → default ×2.0 ชดเชยระยะเวที (clamp 0.25…4) — ขนาดบนจอเท่าเดิมแม้กระจุกถอยหลัง")


def verify_cluster_scale (page, base, seed, nidx):
    """?cluster= คือตัวคูณขนาดกระจุกที่ผู้ใช้ปรับเองได้ — การขยายต้องเป็น similarity จริง
       (ทุกมิติของฉาก ×k พร้อมกัน shape ของข้อมูลไม่เพี้ยน), จุดใกล้ตาไม่เข้ามาใกล้กว่า 1.40 m,
       ฐานล่างกล่องไม่ต่ำกว่า 1.00 m และค่าที่เกินขอบถูก clamp (1…CLUSTER_MAX)"""
    got = {}
    for q in ("1", None, "0.4", "9", "abc"):
        qs = ["seed=%d" % seed, "n=%d" % nidx, "mode=3", "ell=0"]
        if q is not None:
            qs.append("cluster=" + q)
        page.goto(base + PAGE + "?" + "&".join(qs), wait_until="load")
        page.wait_for_function("window.__pca && window.__pcaReady === true", timeout=30000)
        st = page.evaluate(STATS_JS)
        got[str(q)] = dict(now=page.evaluate("window.__pca.stageNow()"),
                           cs=page.evaluate("window.__pca.clusterSpec"),
                           sc=st["scene"])

    A, B = got["1"], got["None"]                          # k=1 (อ้างอิง) เทียบกับค่า default ของสื่อ
    kA, kB = A["now"]["k"], B["now"]["k"]
    nearA = A["now"]["dist"] - A["now"]["drawn"][2] / 2.0
    nearB = B["now"]["dist"] - B["now"]["drawn"][2] / 2.0

    ck("?cluster= ไม่ระบุ → default ของสื่อ = เพดานของแบบแผน (k = 2)",
       abs(kB - B["cs"]["k"]) < 1e-12 and abs(kB - B["cs"]["maxK"]) < 1e-12 and abs(kB - 2.0) < 1e-12,
       "k = %.3g · maxK = %.3g" % (kB, B["cs"]["maxK"]))
    ck("?cluster=1 → k = 1 ตรงตามที่ขอ", abs(kA - 1.0) < 1e-12, "k = %.3g" % kA)
    ck("?cluster=0.4 → clamp ลงมาเป็น k = 1 (ไม่ย่อกระจุกต่ำกว่าค่าพื้นฐาน)", abs(got["0.4"]["now"]["k"] - 1.0) < 1e-12,
       "k = %.3g" % got["0.4"]["now"]["k"])
    ck("?cluster=9 → clamp ขึ้นไปที่เพดาน maxK", abs(got["9"]["now"]["k"] - got["9"]["cs"]["maxK"]) < 1e-12,
       "k = %.3g · maxK = %.3g" % (got["9"]["now"]["k"], got["9"]["cs"]["maxK"]))
    ck("?cluster=abc → ค่า default (k = 2) ไม่พังเมื่อกรอกผิด", abs(got["abc"]["now"]["k"] - kB) < 1e-12,
       "k = %.3g" % got["abc"]["now"]["k"])

    ratio = [B["now"]["scale"] / A["now"]["scale"], B["now"]["dist"] / A["now"]["dist"]] + \
            [B["now"]["drawn"][i] / A["now"]["drawn"][i] for i in range(3)]
    ck("ขยาย ×2 = similarity จริง — scale และกล่องที่วาด ×2 ครบทุกมิติ (รูปร่างข้อมูลไม่เพี้ยน)",
       abs(B["now"]["scale"] / A["now"]["scale"] - kB / kA) < 1e-6
       and all(abs(B["now"]["drawn"][i2] / A["now"]["drawn"][i2] - kB / kA) < 1e-6 for i2 in range(3)),
       "scale ×%.6f · drawn ×%s" % (ratio[0], json.dumps(["%.6f" % r for r in ratio[2:]])))
    ck("ระยะยืนไม่ขยายตาม k — ฉากถอยหลังแค่พอ invariant ใกล้ (1 ≤ dist ratio ≤ k และ dist ≤ 3.20 m)",
       1.0 <= ratio[1] <= kB / kA + 1e-9 and B["now"]["dist"] <= 3.20,
       "dist %.2f → %.2f m (×%.3f เทียบกับ k = %.3g) · ข้อที่ผูก: %s" % (
           A["now"]["dist"], B["now"]["dist"], ratio[1], kB, B["now"]["bindingDist"]))
    ck("ขยายแล้วจุดใกล้ตาที่สุดยัง ≥ %.2f m (invariant #1) — หน้าใกล้ของกล่องคงที่ทั้งสองระดับ" % NEAR_TARGET,
       A["sc"]["eyeMin"] >= NEAR_TARGET - 1e-9 and B["sc"]["eyeMin"] >= NEAR_TARGET - 1e-9
       and nearA >= NEAR_TARGET - 1e-9 and nearB >= NEAR_TARGET - 1e-9,
       "near %.2f → %.2f m · nearFace %.2f → %.2f m" % (A["sc"]["eyeMin"], B["sc"]["eyeMin"], nearA, nearB))
    ck("ขยายแล้วฐานล่างกล่องยัง ≥ %.2f m (invariant #2 — ไม่ทับเมนู)",
       A["sc"]["lowY"] >= BASE_BOTTOM - 1e-9 and B["sc"]["lowY"] >= BASE_BOTTOM - 1e-9,
       "จุดต่ำสุด y = %.3f → %.3f m · ขอบบนการ์ด %.3f m" % (
           A["sc"]["lowY"], B["sc"]["lowY"], max(c["topY"] for c in B["sc"]["cards"])))
    ck("ขยายแล้วจุดยังอยู่ในกรอบมองแนวราบของโหมดจอแบน (|az| ≤ FOV/2)",
       B["sc"]["azFrac"] <= 1.0, "az %.1f° / half %.1f°" % (B["sc"]["maxAzDeg"], B["sc"]["halfHorizDeg"]))
    print("  ok   ?cluster= → default ×2.0 (เพดาน %.3g): scale ×%.2f dist ×%.2f กล่อง ×2 ทุกมิติ · "
          "near %.2f→%.2f m (พื้น %.2f m) · lowY %.2f→%.2f m" % (
              B["cs"]["maxK"], ratio[0], ratio[1], A["sc"]["eyeMin"], B["sc"]["eyeMin"], NEAR_TARGET,
              A["sc"]["lowY"], B["sc"]["lowY"]))
def verify_walk(page, base, seed, nidx):
    load(page, base, seed, nidx, mode=3)
    page.evaluate("window.__pca.look(-0.62, 0.0); window.__pca.settle(2);")
    page.keyboard.down(" ")
    time.sleep(1.2)
    st = page.evaluate(STATS_JS)
    page.keyboard.up(" ")
    px, pz = st["at"]
    ck("walk: เดินตามทิศที่ก้มมองได้จริง (เคลื่อน > 0.3 m)", math.hypot(px, pz) > 0.3, "%.2f m" % math.hypot(px, pz))
    ck("walk: ไม่ทะลุขอบสนาม ±8 m", abs(px) <= 7.6 and abs(pz) <= 7.6, "at (%.2f, %.2f)" % (px, pz))
    clear = 0.55 + st["stage"]["radiusWorld"]
    cz = st["stage"]["center"][2]
    ck("walk: ไม่เข้าไปทับบริเวณของกระจุก (ระยะจากศูนย์กลาง %.2f m ของฉากนี้ ต้อง ≥ %.2f m)" % (-cz, clear),
       math.hypot(px, pz - cz) >= clear - 1e-6, "%.2f m" % math.hypot(px, pz - cz))
    st2 = page.evaluate("(() => { window.__pca.act('act:pose'); window.__pca.settle(4); return window.__pca.stats(); })()")
    ck("⟲ การ์ด reset → กลับท่า (0,0) และค่าเดิม", abs(st2["at"][0]) < 1e-9 and abs(st2["at"][1]) < 1e-9
       and json.dumps(st2["values"]) == json.dumps(st["values"]))
    print("  ok   gaze-walk     เดินไป (%.2f, %.2f) m ·ความเร็ว %.2f m/s · keep-out %.2f m ครบ" % (px, pz, st["walkSpeed"], clear))


SHOTS = [
    ("01-full-3d", dict(seed=20261104, nidx=1, mode=3, toggles={"ell": 1, "triad": 1}),
     "ข้อมูลจริงทั้งกลุ่ม + แกน v₁ v₂ v₃ ที่คำนวณจากข้อมูล + ellipsoid 2σ + แกนดิบ x y z"),
    ("02-plane-2d", dict(seed=20261104, nidx=1, mode=2, toggles={"drop": 1, "ell": 0}),
     "เหลือ 2 มิติ: จุดที่ฉายลงระนาบ v₁∧v₂ (สว่าง) + เส้นตั้งฉากถึงจุดเดิม (จาง)"),
    ("03-line-1d", dict(seed=20261104, nidx=1, mode=1, toggles={"drop": 1, "ell": 0}),
     "เหลือ 1 มิติ: ข้อมูลทั้งก้อนกลายเป็นเส้นตามทิศ v₁"),
    ("04-competitor-v2", dict(seed=20261104, nidx=1, basis="pc2", toggles={"drop": 1}),
     "ลดมิติด้วย v₂ บ้าง: ยังเป็นเส้นแต่เก็บ variance ได้น้อยกว่ามาก"),
    ("05-competitor-random", dict(seed=20261104, nidx=1, basis="rnd1", toggles={"drop": 1}),
     "ทิศสุ่ม u: ทิศที่สุ่มมาทิ้งข้อมูลมากกว่า v₁ ชัดเจน"),
    ("06-console-numbers", dict(seed=20261104, nidx=1, mode=2, toggles={"drop": 1}, look=-0.49, ui=True),
     "แผงตัวเลขในโลก 3D: Ĉ, λ σ v, kept%, เอกลักษณ์ Var(residual) + ΣvᵀĈv = tr Ĉ"),
    ("07-menu-cards", dict(seed=20261104, nidx=1, mode=3, look=-0.66),
     "เมนูที่ก้มมอง: แถวบน =เลือกรูปแบบ, แถวกลาง =ทิศเทียบ (แสดง % บนการ์ด), แถวล่าง =toggle"),
    ("08-centering", dict(seed=20261104, nidx=1, mode=3, toggles={"center": 1}),
     "การ์ด μ: กลุ่มจุดก่อน centering (จาง) + เส้นประไปยัง x̄ ที่ถูกย้ายมาเป็น origin"),
    ("09-n300", dict(seed=20261104, nidx=0, mode=3, toggles={"ell": 1}),
     "n = 300: λ̂ เบนจาก λ จริงมาก — เห็น sampling error ด้วยตา"),
    ("10-n2400", dict(seed=20261104, nidx=2, mode=3, toggles={"ell": 1}),
     "n = 2400: λ̂ ชิด λ จริง รูปร่างทรงรีนิ่งขึ้น"),
    ("11-flat-fallback", dict(seed=20261104, nidx=1, mode=2, toggles={"drop": 1}, ui=True),
     "โหมดจอแบน (ไม่มีแว่น): HUD อ่านค่าเดียวกันออกมาเป็นตัวเลข"),
    ("12-plane-only-points", dict(seed=20261104, nidx=1, mode=2, toggles={"drop": 0, "ell": 0}),
     "โหมด 2 มิติแบบโล่ง: จุดที่ฉายแล้ว + แผ่นระนาบเท่านั้น (ดูการแนบแผ่นได้ชัดที่สุด)"),
]


def take_shots(page, base, spec):
    print("\n── 5. ภาพนิ่ง _preview/ ══ ทุกโหมดที่ผู้เรียนเลือกได้ ──")
    for tag, cfg, why in SHOTS:
        qs = dict(cfg)
        url_qs = ["seed=%d" % qs["seed"], "n=%d" % qs["nidx"]]
        if qs.get("mode"):
            url_qs.append("mode=%d" % qs["mode"])
        if qs.get("basis"):
            url_qs.append("basis=%s" % qs["basis"])
        for k, v in (qs.get("toggles") or {}).items():
            url_qs.append("%s=%d" % (k, 1 if v else 0))
        # ui=True = shot ที่ต้อง "เห็นข้อความ" (แผงตัวเลขในโลก / HUD บนจอแบน):
        # ค่า default ของ index.html ไม่มีข้อความใด ๆ บนจอแบน ต้อง ?ui=1 (ดู header ของ index.html)
        if qs.get("ui"):
            url_qs.append("ui=1")
        else:
            url_qs.append("ui=0")
        page.goto(base + PAGE + "?" + "&".join(url_qs), wait_until="load")
        page.wait_for_function("window.__pca && window.__pcaReady === true", timeout=30000)
        look = qs.get("look", -6 * math.pi / 180)
        page.evaluate("(() => { const P = window.__pca; P.warpTo(0,0); P.look(%f, 0); P.settle(8); })()" % look)
        page.wait_for_timeout(320)
        page.evaluate("window.__pca.settle(4);")
        path = os.path.join(PREVIEW, "%s.png" % tag)
        page.screenshot(path=path, timeout=30000)
        st = page.evaluate(STATS_JS)
        now = page.evaluate("window.__pca.stageNow()")
        ck("shot %s: ถ่ายได้ + จุดครบ n + ขนาด/ระยะเป็นไปตามแบบแผน k=%.3g" % (tag, now["k"]),
           os.path.exists(path) and st["scene"]["nProjected"] + st["scene"]["nOther"] >= st["n"]
           and now["drawn"][0] <= spec["longMax"] + 1e-6 and now["drawn"][1] <= spec["vertMax"] + 1e-6
           and now["drawn"][2] <= spec["depthMax"] + 1e-6
           and st["stage"]["center"] == [0, spec["height"], -now["dist"]]
           and now["dist"] - now["drawn"][2] / 2.0 >= NEAR_TARGET - 1e-9)
        print("  ok   %-22s dim %d · kept %5.1f%% · scale %.5f m/หน่วย · drawn %.2f m · %s" % (
            tag, st["projection"]["k"], 100 * st["projection"]["keptFrac"], st["stage"]["scale"],
            2 * st["scene"]["drawnHalf"][0], why))


def main():
    args = sys.argv[1:]
    only_shots = "--shots" in args
    skip_shots = "--no-shots" in args
    os.makedirs(PREVIEW, exist_ok=True)
    httpd, base = start_server()
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            logs = []
            page.on("pageerror", lambda e: logs.append(str(e)))
            page.on("console", lambda m: logs.append("[%s] %s" % (m.type, m.text)) if m.type == "error" else None)
            load(page, base, 1, 1, mode=3)
            spec = page.evaluate(SPEC_JS)
            n_steps = page.evaluate(N_STEPS_JS)
            print("══ shot.py — วัดคณิตศาสตร์และเรขาคณิตของ PCA_XR ══")
            print("   stage spec:", json.dumps(spec))
            print("   ข้อผิดพลาดจากหน้า (pageerror/console.error):", len(logs), "รายการ")

            if not only_shots:
                print("\n── 1. eigen / tr / det / χ(t) / ตารางเทียบทิศ ตรงกับการคำนวณอิสระใน Python ──")
                for seed in (20261104, 7, 12345, 424242, 99991):
                    for nidx in (0, 1, 2):
                        verify_math_case(page, base, seed, nidx, spec, n_steps)

                print("\n── 2. เรขาคณิตของจุดที่วาดจริง ในทุกโหมดของเมนู ──")
                for mode in (3, 2, 1):
                    verify_projection_case(page, base, 20261104, 1, mode, spec)

                print("\n── 3. การลดมิติ: what is lost must grow as dimension shrinks ──")
                verify_modes_ordering(page, base, 20261104, 1)

                print("\n── 4. determinism + ขนาดตัวอย่าง 300/900/2400 ──")
                verify_determinism(page, base, 20261104, 1)
                verify_sample_size(page, base, 20261104, spec)

                print("\n── 4b. ขนาดจุดที่วาดจริง + ตัวคูณ ?dots= (ขยาย 2 เท่า) ──")
                verify_dot_scale(page, base, 20261104, 1)

                print("\n── 4d. ขนาดกระจุก + ตัวคูณ ?cluster= (ขยาย 2 เท่า) ──")
                verify_cluster_scale(page, base, 20261104, 1)

                print("\n── 4c. gaze-walk ──")
                verify_walk(page, base, 20261104, 1)

            if not skip_shots:
                take_shots(page, base, spec)

            if logs:
                print("\n── ข้อความจากหน้า (console/pageerror) ──")
                for l in logs[:15]:
                    print("  " + l)
            browser.close()
    finally:
        httpd.shutdown()

    print("\n══ สรุป: ผ่าน %d ข้อ — ล้มเหลว %d ข้อ ══" % (PASS[0], len(ERRORS)))
    for e in ERRORS:
        print("  - " + e)
    return 1 if ERRORS else 0


if __name__ == "__main__":
    sys.exit(main())
