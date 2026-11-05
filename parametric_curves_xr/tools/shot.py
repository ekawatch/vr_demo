#!/usr/bin/env python3.11
"""shot.py — รัน parametric_curves_xr ใน Chromium (headless) แล้ว *วัด* สิ่งที่สื่อคำนวณจริง

สื่อเส้นนี้ไม่พูดภาษาในหน้าจอ มีแต่ตัวเลขและสัญคณิตบนแผงหน้าปัด (Section 5 ของ index.html)
งานของสคริปต์นี้คือพิสูจน์ว่าตัวเลขเหล่านั้นถูก:
  1. (assert) ค่าที่สื่อคำนวณเองในหน้า (window.__pc.stats()) ต้องตรงกับคำตอบปิด
     ของแต่ละเส้น — ชุดเดียวกับที่ tools/math_check.mjs ตรวจ (178 ข้อ)
  2. ตัวเลขที่ "แผง" แสดง (innerText ของ #readout) ต้องตรงกับค่าที่คณิตศาสตร์ให้
     — ตรวจทั้งค่าที่เห็นบนจอแบน และค่าเดียวกับที่ผู้ใส่แว่นเห็นบนแผงในโลก 3D
  3. ภาพนิ่งของทุกเส้นใน _preview/ ให้คนอ่านเอกสารเห็นสื่อจริงโดยไม่ต้องใส่แว่น

ค่าคาดหวังเป็นเลขปิด (4√114, 4√65·E(16/65), x²+y²=49, T=2π/gcd, r(π)=0) ไม่ใช่ค่าที่จูนจากภาพ

 usage:  python3.11 tools/shot.py                # ทุกเส้น
         python3.11 tools/shot.py --only 1:2:3    # เส้นเดียว
"""
import http.server
import os
import re
import socketserver
import sys
import time
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.path.dirname(HERE)                       # parametric_curves_xr/
ROOT = os.path.dirname(os.path.dirname(MEDIA))      # โฟลเดอร์งาน (มี SCMA292_lesson12/)
PREVIEW = os.path.join(MEDIA, "_preview")
PAGE = "/SCMA292_lesson12/parametric_curves_xr/index.html"

TAU = 2.0 * 3.141592653589793
TOL_T = 1e-6            # คาบร่วม (ตัวเลขที่สื่อแสดง)
TOL_L = 1e-6            # ความยาวส่วนโค้ง (สื่อใช้ function เดียวกับคณิต → ต้องตรงกัน)
TOL_ZERO = 1e-9         # สิ่งที่ควรเป็น 0 (r(T)=r(0), ส่วนเบี่ยงแบน)

# JS helper: ระยะสูงสุดจากเส้น เงา บนพื้น (y=0) ไปยังเส้นตรง x = y ในหน่วยคณิต
SHADOW_LINE_JS = """(() => {
  const v = window.__pc.state.v;
  let w = 0;
  for (let i = 0; i <= 400; i++) {
    const p = window.__pc.math.point(v, v.span * i / 400);
    w = Math.max(w, Math.abs(p[0] - p[1]));
  }
  return w;
})()"""


def start_server():
    """serve โฟลเดอร์งานบนพอร์ตว่าง (Chrome ห้าม import module จาก file://)"""
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=ROOT, **kw)

        def log_message(self, *a):
            pass
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    for port in (8080, 8091, 8092, 0):
        try:
            httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), H)
        except OSError:
            continue
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        return httpd, "http://127.0.0.1:%d" % httpd.server_address[1]
    raise SystemExit("เปิด local http server ไม่ได้")


# ----------------------------------------------------------------- กรณีทดสอบ
# pi/vi = ดัชนี pre-set/เส้นใน math_core.PRESETS (ชุดเดียวกับที่การ์ดแสดง)
# expect  = คำตอบปิดของเส้นนั้น;  mode: 'closed' หรือ 'open'
CASES = [
    dict(pi=0, vi=0, mode="closed", T=TAU, L=4 * 114 ** 0.5,
         why="1:1:1 เฟสเท่ากัน = เส้นตรง (กรณีเสื่อม): L = 4√114, เรือนเร็วเริ่มที่ 0",
         flat=True, shadow_line=True, early=3.141592653589793, speed_zero=True, tfrac=0.42),
    dict(pi=0, vi=1, mode="closed", T=TAU, L=47.37833483452001,
         why="1:1:1 เฟสต่าง 90° = วงรีในระนาบ 4x=7z (แบน): L = 4√65·E(16/65)",
         flat=True, no_early=True, tfrac=0.55),
    dict(pi=0, vi=2, mode="closed", T=TAU, L=47.37833483452001,
         why="เฟส 45° = วงรีในระนาบเอียงอื่น ยังแบนและยาวเท่าเดิม",
         flat=True, no_early=True, tfrac=0.5),
    dict(pi=1, vi=0, mode="closed", T=TAU, L=54.855564671,
         why="1:1:2 เฟสเท่ากัน: เงาบนพื้นเป็นเส้นตรง x=y ตัวเส้นแบนแต่นอนในระนาบตั้ง",
         flat=True, shadow_line=True, early=3.141592653589793, tfrac=0.62),
    dict(pi=1, vi=1, mode="closed", T=TAU, L=55.9754047,
         why="1:1:2 เฟสต่าง: เงา = วงกลมรัศมี 7 (x²+y²=49) ตัวเส้นเป็นเกลียวบนทรงกระบอก",
         space=True, cyl=0.0, tfrac=0.55),
    dict(pi=1, vi=2, mode="closed", T=TAU, L=77.06678521,
         why="1:2:2 เฟส 90°: เส้นอยู่บนทรงกระบอกเชิงรี y²/49 + z²/16 = 1 (แกน x)",
         space=True, early=3.141592653589793, cyl_x=True, tfrac=0.55),
    dict(pi=1, vi=3, mode="closed", T=TAU, L=67.43390629,
         why="1:1:3 เฟสต่าง: เกลียวสามชั้นบนทรงกระบอกเดียวกัน (x²+y²=49)",
         space=True, cyl=0.0, tfrac=0.55),
    dict(pi=2, vi=0, mode="closed", T=TAU, L=85.26618498,
         why="1:2:3 อัตราส่วนเต็ม = ปิดที่ T=2π; แต่ r(π)=0 = จุดตัดตัวเอง ไม่ใช่การปิด",
         space=True, early=3.141592653589793, tick_ratio=2.0, tfrac=0.66),
    dict(pi=2, vi=1, mode="closed", T=TAU / 2, L=85.26618498,
         why="2:4:6 = อัตราส่วนเดิมคูณ 2: รูปร่างเดียวกัน คาบ π, ความยาวเท่าเดิม",
         space=True, early=3.141592653589793 / 2, tfrac=0.66),
    dict(pi=2, vi=2, mode="closed", T=TAU / 3, L=85.26618498,
         why="3:6:9 = คูณ 3: คาบ 2π/3 L เท่าเดิม",
         space=True, early=3.141592653589793 / 3, tfrac=0.66),
    dict(pi=2, vi=3, mode="closed", T=TAU, L=173.91246101854549,
         why="3:4:5 coprime ครบคู่ = คดที่สุด, เรือนเร็วต่างกัน 3.67 เท่า",
         space=True, early=3.141592653589793, tick_ratio=2.0, tfrac=0.72),
    dict(pi=2, vi=4, mode="closed", T=TAU, L=139.50890,
         why="2:3:5 เปลี่ยนเฟส = เปลี่ยนรูปร่าง แต่คาบเท่าเดิม",
         space=True, no_early=True, tfrac=0.66),
    dict(pi=3, vi=0, mode="open", L=605.42023742, span=75.398223686,
         why="1:1:√2 ไม่มีคาบร่วม: min Δ > 0 เสมอ (0.287621 m @ t=37.725)")
    , dict(pi=3, vi=1, mode="closed", T=TAU, L=251.7178873,
           why="5:5:7 ปิดจริง แต่ต้องรอแกน x ครบ 5 รอบ", space=True, cyl=0.0, tfrac=0.55),
    dict(pi=3, vi=2, mode="closed", T=TAU, L=605.79059868,
         why="12:12:17 (17/12 = 1.41667 ≈ √2): ปิดที่รอบที่ 12 — เหมือน √2 เกือบทุกจุด",
         space=True, early=3.141592653589793, near_irrational=3),
]

EXTRA = [
    dict(kind="compare", base=(1, 2), baseTag='≣', target=(2, '1:2:3'),
         shadow=0.0, curve=6.365225,
         why="≣ กับ 1:2:3: เงาบนพื้นเหมือนกันทุกจุด (0.0000 m) แต่ตัวเส้นห่างถึง 6.37 m"),
    dict(kind="compare", base=(2, 0), baseTag='1:2:3', target=(2, '2:4:6'),
         shadow=0.0, curve=0.0,
         why="1:2:3 กับ 2:4:6: เส้นเดียวกันจริง (0.0000 m) — ต่างกันแค่ความเร็วและคาบ"),
    dict(kind="compare", base=(3, 0), baseTag='1:1:√2', target=(3, '12:12:17'),
         shadow=0.0, curve=0.735628,
         why="√2 (12 รอบ) กับ 12:12:17: เงาเหมือนกัน แต่เส้นห่าง 0.74 m — √2 ปลอมปิดตัว ของจริงไม่ปิด"),
    dict(kind="compare", base=(0, 2), baseTag='⬭', target=(0, '◯'),
         shadow=0.0, curve=2.696153,
         why="⬭ กับ ◯: วงรีสองอันในระนาบต่างกัน เงาบนพื้นเหมือนกัน แต่เส้นห่าง 2.70 m"),
    dict(kind="compare", base=(2, 3), baseTag='3:4:5', target=(2, '2:3:5'),
         shadow=1.520811929855, curve=5.053077,
         why="3:4:5 กับ 2:3:5: เปลี่ยนอัตราส่วนแล้วทั้งเงา (1.52 m) และทั้งเส้น (5.05 m) เปลี่ยนตาม"),
    dict(kind="phase", pi=0, vi=1, step=2,
         why="เลื่อนเฟสแกน z 45° แล้วเส้น 1:1:1 ยังแบนเสมอ (ความถี่เท่ากัน = ระนาบเดียว)"),
    dict(kind="open-window", case=12, cycles=41,
         why="เขียน √2 ให้ยาวขึ้น (41 รอบ) → ใกล้จุดเดิมขึ้น: min Δ = 0.04936 m"),
    dict(kind="walk", case=7, why="ก้มมองแล้วเดินตามทิศที่มองได้จริง ภายในสนาม ±8 m และไม่เข้าไปในบริเวณของแบบจำลอง"),
    dict(kind="paint", why="รอบแรกวาดจากที่ว่างเปล่า; ครบหนึ่งคาบแล้วเส้นค่อย ๆ จาง และจุดที่วิ่งไล่ตามวาดทับให้เข้มกลับ"),
    dict(kind="frame", why="ทุกเส้นลอยอยู่ข้างหน้า พอดีกรอบมอง ไม่ต้องแหงน และไม่เข้าไปอยู่ในเส้น"),
]


def refresh_hud(page):
    """ให้ HUD วาดใหม่: tick() อัปเดต #readout เมื่อบอร์ดเวลาเดินเกิน 250 ms"""
    page.evaluate("window.__pc.settle(1)")
    time.sleep(0.35)
    page.evaluate("window.__pc.settle(1)")


def read_page(page):
    refresh_hud(page)
    st = page.evaluate("window.__pc.stats()")
    txt = page.evaluate("document.getElementById('readout') ? document.getElementById('readout').innerText : ''")
    return st, txt


def run_one(pg, c, tag, errors):
    def bad(msg):
        errors.append("%s: %s" % (tag, msg))
        print("  FAIL %s — %s" % (tag, msg))

    pg.evaluate("window.__pc.warpTo(0, 0); window.__pc.look(0, 0);")   # ทุกเค้าวัดจากท่ายืนจุดเริ่ม + มองตรง (ท่าจริงของผู้เรียน)
    pg.evaluate("window.__pc.setPlaying(false);")
    pg.evaluate("window.__pc.setPreset(%d); window.__pc.setVariant(%d);" % (c["pi"], c["vi"]))
    pg.evaluate("window.__pc.settle(3);")
    pg.evaluate("window.__pc.setTime(%d * window.__pc.stats().span);" % c.get("tfrac", 0.5))
    st, txt = read_page(pg)

    if c["mode"] == "closed":
        if st["closed"] is not True:
            bad("closed = %r (ควร True)" % (st["closed"],))
        if abs(st["T"] - c["T"]) > TOL_T:
            bad("T = %.6f ควรเป็น %.6f" % (st["T"], c["T"]))
        if "T = %.4f" % c["T"] not in txt:
            bad("แผงไม่แสดง 'T = %.4f' ให้ผู้เรียนเห็น" % c["T"])
    else:
        if st["closed"] is not False:
            bad("closed = %r (ควร False — ไม่มีคาบร่วม)" % (st["closed"],))
        if "T = ∄" not in txt:
            bad("แผงไม่แสดง 'T = ∄' สำหรับอัตราส่วนอตรรกยะ")
        if abs(st["span"] - c["span"]) > 1e-4:
            bad("span = %.4f ควรเป็น %.4f" % (st["span"], c["span"]))
    if st["L"] is None or abs(st["L"] - c["L"]) > max(1e-6, TOL_L * c["L"]):
        bad("L = %r ควรเป็น %.4f" % (st["L"], c["L"]))
    if st["tubeSegments"] < 5000:
        bad("ท่อในฉากมี vertex น้อยผิดปกติ: %r" % (st["tubeSegments"],))

    # การอินทีกิเรลสดของสื่อ ต้องตรงกับ ∫|r′|dt ที่คณิตคำนวณ
    if abs(st["sArc"] - st["sExact"]) > 1e-3:
        bad("s ที่สื่อสะสมเอง (%.4f) ต่างจาก ∫|r′|dt (%.4f) = %.2e" % (st["sArc"], st["sExact"], abs(st["sArc"] - st["sExact"])))

    # ความแบน
    dev = st["planarityDeviation"]
    if c.get("flat"):
        if dev > 1e-6:
            bad("เส้นควรแบน (planarityDeviation = %.2e)" % dev)
    if c.get("shadow_line"):          # เงาบนพื้นยุบเป็นเส้นตรง (แกน x กับ y เหมือนกัน)
        off = pg.evaluate(SHADOW_LINE_JS)
        if off > 1e-9:
            bad("เงาบนพื้นควรยุบเป็นเส้นตรง x = y (ได้ max |x−y| = %.2e)" % off)
    if c.get("space"):
        if dev < 4.0:
            bad("เส้นควรไม่เป็นระนาบ (planarityDeviation = %.3f < 4)" % dev)
    if "cyl" in c and abs(st["cylinderDeviation"] - c["cyl"]) > 1e-6:
        bad("cylinderDeviation = %.4f ควรเป็น %.4f" % (st["cylinderDeviation"], c["cyl"]))
    if c.get("cyl_x") and st["cylinderDeviation"] < 4.0:
        bad("เส้นอยู่บนทรงกระบอกแกน x แต่สื่อวัด dev เทียบแกน z = %.3f" % st["cylinderDeviation"])

    # กลับจุดเริ่มก่อนครบคาบ vs ปิดตัวเอง
    er = st.get("earlyReturn")
    if c.get("speed_zero") and st["speedMin"] > 1e-6:
        bad("1:1:1 เฟสเท่ากันต้องหยุดสนิทที่ t = π/2 (speedMin = %.2e)" % st["speedMin"])
    if "early" in c:
        if not er or abs(er["at"] - c["early"]) > 1e-6 or er["gap"] > 1e-9:
            bad("ไม่พบการกลับจุดเริ่มที่ t = %.6f (ได้ %r)" % (c["early"], er))
    if c.get("no_early"):
        if er and er["gap"] < 1e-3:
            bad("เส้นนี้ไม่ควรกลับจุดเริ่มก่อนครบคาบ แต่พบ gap = %.4f @ t=%.4f" % (er["gap"], er["at"]))

    # เครื่องหมายเวลาเท่ากันบนท่อ = เรือนเร็วไม่คงที่
    if "tick_ratio" in c:
        r = st["tickSpacing"]["ratio"]
        if r < c["tick_ratio"]:
            bad("ช่องว่างระหว่างขีดเวลาเท่ากันต่างกันแค่ %.2f เท่า (ควร ≥ %.1f)" % (r, c["tick_ratio"]))

    # √2 กับ 12:12:17 เกือบเหมือนกัน
    if "near_irrational" in c:
        irr = pg.evaluate("window.__pc.math.makeVariant([1,1,Math.SQRT2],[0,90,0],{}).L")
        rel = abs(irr - st["L"]) / st["L"]
        if rel > 1e-3:
            bad("√2 (12 รอบ) กับ 12:12:17 ต่างกัน %.2e (ควร < 1e-3)" % rel)

    # ตัวนับรอบบนแผง
    cyc = st["cycles"]
    want = [f * st["t"] / TAU for f in st["f"]]
    if max(abs(a - b) for a, b in zip(cyc, want)) > 1e-9:
        bad("จำนวนรอบที่แผงคำนวณ (%s) ไม่ตรงกับ a·t/2π (%s)" % (cyc, want))

    # ภาพตัวอย่างของสื่อต้องเห็นทั้งเส้น: รอบแรกเส้นถูกวาดจากที่ว่าง ถ้าถ่ายตอน t ต่ำจะได้ภาพเกือบเปล่า
    # จึงถ่ายในโหมดวาดซ้ำ (ครบหนึ่งคาบแล้ว) ที่ t = ครึ่งคาบ — เห็นทั้งเส้น + แถบที่เพิ่งวาดทับ
    if st["closed"] is True:
        pg.evaluate("(() => { const S = window.__pc.state; S.kPeriods = 1; S.t = 0.5 * S.v.span;"
                    " window.__pc.settle(2); })()")

    pg.screenshot(path=os.path.join(PREVIEW, "%s.png" % tag), timeout=30000)
    print("  ok   %-10s T=%-8s L=%-11s %s" % (
        tag, ("%.4f" % st["T"]) if st["closed"] else "∄", "%.4f" % st["L"], c["why"]))
    return st


def main():
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]
    os.makedirs(PREVIEW, exist_ok=True)
    httpd, base = start_server()
    errors = []
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            logs = []
            page.on("pageerror", lambda e: logs.append(str(e)))
            page.on("console", lambda m: logs.append("[%s] %s" % (m.type, m.text)) if m.type in ("error",) else None)
            # เปิดหน้าด้วย ?ui=1: ค่า default ของ index.html ไม่มีข้อความบนจอแบนเลย
            # (มีเพียงปุ่มเข้าโหมด VR + ลิงก์ ← index) — ทั้ง #readout และแผงตัวเลขในโลกต้อง ?ui=1
            page.goto(base + PAGE + "?ui=1", wait_until="load")
            page.wait_for_function("window.__pc && window.__pcReady === true", timeout=30000)
            print("══ shot.py — วัดสิ่งที่สื่อคำนวณจริง ══")

            # เดินด้วยตนเอง (gaze-walk) ตามทิศที่มอง: ทดสอบว่าการเคลื่อนที่ทำงานจริง
            # ใช้เวลาจริง (ไม่ใช่ settle loop) เพราะการเดินเป็นการลู่เข้าด้วยความเร่ง ต้องใช้ dt จริง
            page.evaluate("window.__pc.warpTo(0,0);")
            page.evaluate("window.__pc.look(-0.6, 0.0);")
            page.keyboard.down(" ")          # บนจอแบน gaze-walk ต้อง SPACE ค้าง (ในแว่นคือก้มมองเท่านั้น)
            time.sleep(0.6)
            mid = page.evaluate("window.__pc.stats()")
            time.sleep(1.2)
            st0 = page.evaluate("window.__pc.stats()")
            page.keyboard.up(" ")
            moved = abs(st0["at"][1])
            dStage = (st0["at"][0] ** 2 + (st0["at"][1] + st0["stage"]["D"]) ** 2) ** 0.5
            if mid["walkSpeed"] <= 0.01 and moved < 0.3:
                errors.append("walk: ก้มมองแล้วแต่ผู้ใช้ไม่เคลื่อนที่ (speed=%.3f at=%s)" % (mid["walkSpeed"], st0["at"]))
            elif dStage < st0["stage"]["keepOutR"] - 0.05:
                errors.append("walk: ผู้ใช้เข้าไปในบริเวณของแบบจำลอง (%.2f m < %.2f m)" % (dStage, st0["stage"]["keepOutR"]))
            else:
                print("  ok   walk      ก้ม 34° เดินได้ %.2f m/s แล้วถูก keep-out กันไว้ที่ระยะ %.2f m จากศูนย์กลางเวที (≥ %.2f m)"
                      % (mid["walkSpeed"], dStage, st0["stage"]["keepOutR"]))

            tags = []
            for c in CASES:
                pg = page.evaluate("window.__pc.math.PRESETS[%d].variants[%d].tag" % (c["pi"], c["vi"]))
                tags.append(pg)
                if only and pg != only:
                    continue
                run_one(page, c, pg, errors)

            # ---- ข้อทดสอบพิเศษ ----
            for ex in EXTRA:
                if ex["kind"] == "phase":
                    page.evaluate("window.__pc.setPlaying(false); window.__pc.setPreset(%d); window.__pc.setVariant(%d);" % (ex["pi"], ex["vi"]))
                    for _ in range(ex["step"]):
                        page.evaluate("window.__pc.stepPhase(1);")
                    page.evaluate("window.__pc.setTime(0.5 * window.__pc.stats().span); window.__pc.settle(2);")
                    st = page.evaluate("window.__pc.stats()")
                    if st["closed"] is not True or abs(st["T"] - TAU) > 1e-6:
                        errors.append("phase: เปลี่ยนเฟสแล้วคาบร่วมต้องยังเป็น 2π (ได้ %r)" % (st["T"],))
                    elif st["planarityDeviation"] > 1e-6:
                        errors.append("phase: 1:1:1 ที่ Δφ=45° ต้องยังแบน (dev=%.2e)" % st["planarityDeviation"])
                    elif abs(st["L"] - 47.37833483452001) > 1e-6 and abs(st["L"] - 4 * 114 ** 0.5) > 1e-6:
                        errors.append("phase: Δφ=45° ของ 1:1:1 ให้วงรีที่ควรยาว 47.3783 ได้ %.4f" % st["L"])
                    else:
                        print("  ok   phase     Δφ_z=45° ของ 1:1:1: ยังแบนสนิท (dev=%.1e) L=%.4f — เปลี่ยนเฟสไม่พาออกจากระนาบ" % (st["planarityDeviation"], st["L"]))
                    page.screenshot(path=os.path.join(PREVIEW, "phase-45deg.png"), timeout=30000)

                elif ex["kind"] == "open-window":
                    c = CASES[ex["case"]]
                    g41 = page.evaluate("window.__pc.math.closestAfterOneCycle(window.__pc.math.makeVariant([1,1,Math.SQRT2],[0,90,0],{}), %d*2*Math.PI).gap" % ex["cycles"])
                    if abs(g41 - 0.049363632194) > 2e-4:
                        errors.append("open-window: 41 รอบ ควร min Δ = 0.04936 ได้ %.6f" % g41)
                    else:
                        print("  ok   open      √2 เขียน 41 รอบ → min Δ = %.5f m (41/29 ≈ √2) — เข้าใกล้ได้เรื่อย ๆ แต่ไม่ปิด" % g41)

                elif ex["kind"] == "compare":
                    bi, vi = ex["base"]
                    page.evaluate("window.__pc.setPlaying(false); window.__pc.setPreset(%d); window.__pc.setVariant(%d); window.__pc.settle(2);" % (bi, vi))
                    got = page.evaluate("window.__pc.setCompare(%d, %r);" % (ex["target"][0], ex["target"][1]))
                    page.evaluate("window.__pc.settle(2);")
                    st = page.evaluate("window.__pc.stats()")
                    cmp = st.get("compare")
                    if not cmp:
                        errors.append("compare: โหมด ⧉ ไม่ทำงาน (ได้ %r)" % (got,))
                    elif abs(cmp["shadowGap"] - ex["shadow"]) > 1e-6 or abs(cmp["curveGap"] - ex["curve"]) > 1e-3:
                        errors.append("compare: %s ควร เงา=%.4f เส้น=%.4f ได้ %.4f / %.4f" % (
                            ex["why"], ex["shadow"], ex["curve"], cmp["shadowGap"], cmp["curveGap"]))
                    else:
                        print("  ok   compare   %s" % ex["why"])
                    pg_shot = ex["baseTag"]
                    page.screenshot(path=os.path.join(PREVIEW, "compare-%s-vs-%s.png" % (pg_shot, ex["target"][1])), timeout=30000)
                    page.evaluate("window.__pc.clearCompare();")

                elif ex["kind"] == "walk":
                    page.evaluate("window.__pc.setPreset(2); window.__pc.setVariant(0); window.__pc.setPlaying(true);")
                    # ก้ม 43° = ต่ำกว่าแผงตัวเลข (แผงกินช่วงก้ม 23°…33°) จึงไม่ถูกพักการเดิน
                    page.evaluate("window.__pc.look(-0.75, 0.30);")
                    page.keyboard.down(" ")
                    time.sleep(1.8)
                    st = page.evaluate("window.__pc.stats()")
                    page.keyboard.up(" ")
                    moved = (st["at"][0] ** 2 + st["at"][1] ** 2) ** 0.5
                    distStage = (st["at"][0] ** 2 + (st["at"][1] + st["stage"]["D"]) ** 2) ** 0.5
                    if moved < 0.5:
                        errors.append("walk: ก้มมองแล้วแต่ผู้ใช้ไม่เคลื่อนที่ (%.2f m)" % moved)
                    elif abs(st["at"][0]) > 8 or abs(st["at"][1]) > 8:
                        errors.append("walk: ผู้ใช้ออกนอกสนาม (at=%s)" % (st["at"],))
                    elif distStage < st["stage"]["keepOutR"] - 0.05:
                        errors.append("walk: ผู้ใช้เข้าไปในบริเวณของแบบจำลอง (ระยะถึงศูนย์กลางเวที %.2f m < %.2f m)" % (distStage, st["stage"]["keepOutR"]))
                    else:
                        print("  ok   walk      เดินจริง %.2f m ภายในสนาม ±8 m และห่างเวที %.2f m (≥ %.2f m) at=%s bow=%.0f°"
                              % (moved, distStage, st["stage"]["keepOutR"], [round(x, 2) for x in st["at"]], st["bow"]))
                    page.screenshot(path=os.path.join(PREVIEW, "walking-around-stage.png"), timeout=30000)

                elif ex["kind"] == "paint":
                    # (1) รอบแรก: วาดจากที่ว่างเปล่า เส้นที่วาดแล้วสว่างเต็มที่ ยังไม่มีการจาง
                    # (2) ผ่านหนึ่งคาบ: เส้นถูกวาดครบทั้งเส้น (reveal=1) แล้วจางลงช้า ๆ
                    #     จุดที่หุ่นเพิ่งผ่านต้องเข้มกว่าจุดที่ยังไม่ถูกวาดทับอย่างชัดเจน
                    page.evaluate("window.__pc.setPreset(0); window.__pc.setVariant(1); window.__pc.setPlaying(false);")
                    page.evaluate("window.__pc.setTime(0.85 * window.__pc.stats().span); window.__pc.settle(2);")
                    a = page.evaluate("window.__pc.stats()")["paint"]
                    page.evaluate("(() => { const S = window.__pc.state; S.t = 0.30 * S.v.span; S.kPeriods = 1;"
                                  " window.__pc.settle(2); })()")
                    b = page.evaluate("window.__pc.stats()")["paint"]
                    bad = []
                    if a["active"] or a["done"] != 0 or a["reveal"] > 0.999:
                        bad.append("รอบแรกต้องเป็นการวาดที่ยังไม่จบและไม่วาดซ้ำ (active=%r done=%r reveal=%.2f)" % (a["active"], a["done"], a["reveal"]))
                    if max(p["k"] for p in a["probe"]) < 0.999:
                        bad.append("รอบแรก เส้นที่วาดแล้วต้องสว่างเต็มที่ (probe=%s)" % ([p["k"] for p in a["probe"]],))
                    if not b["active"] or b["reveal"] != 1.0 or b["done"] <= 0:
                        bad.append("ผ่านหนึ่งคาบแล้วต้องอยู่ในโหมดวาดซ้ำ (active=%r reveal=%r done=%r)" % (b["active"], b["reveal"], b["done"]))
                    else:
                        pk = [p["k"] for p in b["probe"]]
                        if not (pk[0] > 0.9 and pk[0] - pk[1] > 0.25 and pk[1] <= pk[2] + 1e-9):
                            bad.append("ความสว่างต้องไล่จากจุดที่เพิ่งถูกวาดทับไปยังจุดที่ยังไม่ถูกวาด (probe=%s)" % (pk,))
                        if min(pk) > 0.95:
                            bad.append("โหมดวาดซ้ำต้องมีการจางจริง (probe=%s)" % (pk,))
                    if bad:
                        errors.append("paint: " + "; ".join(bad))
                    else:
                        print("  ok   paint     รอบแรกวาดจากที่ว่าง (reveal=%.2f, สว่างเต็มที่) → ครบคาบแล้ววาดครบทั้งเส้นและจางเป็นแถบ:"
                              " เพิ่งวาด=%.2f · ผ่านมา 0.30 คาบ=%.2f · ยังไม่วาดทับ=%.2f" % (a["reveal"], pk[0], pk[1], pk[2]))
                    page.screenshot(path=os.path.join(PREVIEW, "retrace-fade.png"), timeout=30000)

                elif ex["kind"] == "frame":
                    # ทุกเส้นที่สื่อให้ดู: ลอยอยู่ข้างหน้า พอดีกรอบมอง โดยไม่ต้องแหงนและไม่ต้องเข้าไปในเส้น
                    rows = page.evaluate("""(() => {
      const P = window.__pc.math.PRESETS, out = [];
      for (let i = 0; i < P.length; i++) for (let j = 0; j < P[i].variants.length; j++) {
        window.__pc.warpTo(0, 0); window.__pc.look(0, 0);
        window.__pc.setPreset(i); window.__pc.setVariant(j); window.__pc.settle(2);
        const f = window.__pc.frameCheck(); f.tag = P[i].variants[j].tag; out.push(f);
      }
      window.__pc.warpTo(0, 0); window.__pc.look(0, 0);
      window.__pc.setPreset(2); window.__pc.setVariant(2); window.__pc.setTime(0.5 * window.__pc.stats().span); window.__pc.settle(2);
      return out; })()""")
                    bad = []
                    for f in rows:
                        if f["aboveHorizon"] > 11.5:
                            bad.append("%s: จุดสูงสุดอยู่เหนือระดับสายตา %.1f° = ต้องเงยคอ" % (f["tag"], f["aboveHorizon"]))
                        elif f["azFrac"] > 0.85:
                            bad.append("%s: กว้างกิน %.0f%% ของครึ่งกรอบ = ล้นกรอบ" % (f["tag"], 100 * f["azFrac"]))
                        elif f["elevFrac"] > 1.0:
                            bad.append("%s: ความสูงกิน %.0f%% ของกรอบแนวตั้ง = ล้นกรอบ" % (f["tag"], 100 * f["elevFrac"]))
                        elif f["minElev"] < -0.95 * f["hv"]:
                            bad.append("%s: จุดต่ำสุดอยู่ต่ำกว่าสายตา %.1f° = ต้องก้มเกินกรอบ" % (f["tag"], -f["minElev"]))
                        elif f["minDist"] < 2.4:
                            bad.append("%s: จุดใกล้สุดของเส้นห่างจากตาแค่ %.2f m = ใกล้เกินไปและเสี่ยงต่อการเข้าไปในเส้น" % (f["tag"], f["minDist"]))
                    if bad:
                        errors.append("frame: " + "; ".join(bad))
                    else:
                        print("  ok   frame     %d เส้น (ทุกกลุ่ม): ไม่แหงน (เหนือสายตาสูงสุด ≤ +%.1f°) · กว้าง ≤ %.0f%% ของครึ่งกรอบ · "
                              "สูง ≤ %.0f%% ของกรอบ · ระยะ %.2f…%.1f m จากตา"
                              % (len(rows), max(f["aboveHorizon"] for f in rows),
                                 100 * max(f["azFrac"] for f in rows), 100 * max(f["elevFrac"] for f in rows),
                                 min(f["minDist"] for f in rows), max(f["maxDist"] for f in rows)))
                    page.screenshot(path=os.path.join(PREVIEW, "stage-default.png"), timeout=30000)


            # ---- รูปร่างเดียวกันจริง (1:2:3 vs 2:4:6): เทียบจุดที่สื่อวาดลงท่อ ----
            for i in (8, 9):        # 2:4:6 และ 3:6:9 ต้องอยู่บนเส้นเดียวกับ 1:2:3
                c = CASES[i]
                page.evaluate("window.__pc.setPlaying(false); window.__pc.setPreset(%d); window.__pc.setVariant(%d); window.__pc.settle(2);" % (c["pi"], c["vi"]))
                near = page.evaluate("""(() => {
                  const A = window.__pc.math.makeVariant([1,2,3],[0,0,0],{}), B = window.__pc.state.v;
                  if (B.tag === A.tag) return 0;
                  let worst = 0;
                  for (let i = 0; i <= 200; i++) {
                    const p = window.__pc.math.point(A, A.span * i / 200);
                    let best = 1e9;
                    for (let j = 0; j <= 200; j++) { const q = window.__pc.math.point(B, B.span * j / 200);
                      best = Math.min(best, Math.hypot(p[0]-q[0], p[1]-q[1], p[2]-q[2])); }
                    worst = Math.max(worst, best);
                  }
                  return worst; })()""")
                if near > 1e-6:
                    errors.append("same-shape: %s ไม่ได้อยู่บนเส้นเดียวกับ 1:2:3 (ห่าง %.1e)" % (tags[i], near))
                else:
                    print("  ok   same      %s ทุกจุดอยู่บนเส้นของ 1:2:3 (≤ %.0e m) — คูณทั้งสามด้วยจำนวนเดียวกัน = รูปร่างเดิม" % (tags[i], near))

            if logs:
                print("\n── ข้อความจากหน้า (console/pageerror) ──")
                for l in logs[:12]:
                    print(" ", l)
            browser.close()
    finally:
        httpd.shutdown()

    print("\n══ สรุป: %d ข้อทดสอบล้มเหลว ══" % len(errors))
    for e in errors:
        print("  - " + e)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
