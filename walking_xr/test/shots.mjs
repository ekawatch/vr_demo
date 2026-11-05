/* walking_xr headless verification: renders flat-mode fallback (headless has no
   WebXR), takes screenshots, and asserts walk/blocked logic via window.__app. */
import { chromium } from '/run/media/ekawat/Work/dsh_workspace/drone_project/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8099/';
const OUT = new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/home/ekawat/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text()); });

let fails = 0;
function check(name, cond, extra) {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

async function open(qs, waitMs = 1500) {
  /* default: freeze the world clock so screenshots/logic are deterministic;
     cycle tests pass their own tod/dayspeed */
  if (!qs.includes('tod=')) qs += '&tod=10&dayspeed=0';
  await page.goto(BASE + '?' + qs, { waitUntil: 'load' });
  await page.waitForTimeout(waitMs);
}

/* the ×3 world is heavy for software rendering: logic tests run at a small
   viewport so simulated time ≈ real time; screenshots switch back to full size */
async function small() { await page.setViewportSize({ width: 480, height: 270 }); await page.waitForTimeout(250); }
async function full() { await page.setViewportSize({ width: 1280, height: 720 }); await page.waitForTimeout(700); }

/* 1 — start view: terrain, sky, trees, instruction sign */
await open('ui=0&look=12,20&seg=96', 2500);
await page.screenshot({ path: OUT + 'a_start_view.png' });
let st = await page.evaluate(() => window.__app.status());
check('scene starts at a flat start point', st.start && st.start.slope < 4, `slope=${st.start?.slope?.toFixed?.(1)}`);
check('area ×3 + 320 plants placed in zones', st.trees === 320 && st.half === 66, `trees=${st.trees} half=${st.half}`);

/* 2 — ridge/mountain view: mid-field open spot looking outward at the ridge */
const HALF5 = st.half || 66;
let spot = null;
for (let x = HALF5 * 0.27; x <= HALF5 * 0.44 && !spot; x += 0.4)
  for (let z = -6; z <= 6 && !spot; z += 0.5)
    if (await page.evaluate(([xx, zz]) => window.__app.probe(xx, zz).ok, [x, z])) spot = [x, z];
if (!spot) spot = [HALF5 * 0.32, 0];
await open(`ui=0&pos=${spot[0].toFixed(1)},${spot[1].toFixed(1)}&look=7,-90`, 2000);
await page.screenshot({ path: OUT + 'b_ridge_view.png' });

/* helper: choose a walk heading whose path from the start is obstacle-free
   (probe = tree/slope/bounds check), so walk tests are layout-independent */
async function clearPath(d1, dyaw, d2) {
  return page.evaluate(([dd1, dya, dd2]) => {
    const st = window.__app.status(), R = Math.PI / 180;
    const segClear = (x0, z0, yaw, len) => {
      const hx = -Math.sin(yaw * R), hz = -Math.cos(yaw * R);
      for (let d = 0.2; d <= len; d += 0.25)
        if (!window.__app.probe(x0 + hx * d, z0 + hz * d).ok) return false;
      return true;
    };
    for (let yaw = -180; yaw < 180; yaw += 10) {
      const hx = -Math.sin(yaw * R), hz = -Math.cos(yaw * R);
      if (segClear(st.start.x, st.start.z, yaw, dd1) &&
          segClear(st.start.x + hx * dd1, st.start.z + hz * dd1, yaw + dya, dd2)) return yaw;
    }
    return 0;
  }, [d1, dyaw, d2]);
}

/* 3 — look-down gaze-walk engages and moves smoothly along the looked heading.
   Gaze speed is now 2× the original: bow 40° settles near 1.6 m/s (old cap 1.15) */
const head3 = await clearPath(4.0, 0, 0);
await open(`ui=0&walk=1&noshadow=1&seg=96&look=40,${head3}`, 900);
await small();
let s0 = await page.evaluate(() => window.__app.status());
await page.waitForTimeout(2600);
let s1 = await page.evaluate(() => window.__app.status());
const R3 = Math.PI / 180;
const f3 = { x: -Math.sin(head3 * R3), z: -Math.cos(head3 * R3) };
const w3 = { x: Math.cos(head3 * R3), z: -Math.sin(head3 * R3) };
const dxm = s1.px - s0.px, dzm = s1.pz - s0.pz;
const along = dxm * f3.x + dzm * f3.z, side = dxm * w3.x + dzm * w3.z;
check('bow 40° walks straight along the looked heading', along > 1.2 && Math.abs(side) < 0.4 * along,
  `along=${along.toFixed(2)}m side=${side.toFixed(2)} speed=${s1.speed.toFixed(2)}`);
check('gaze speed doubled (≈2× old 1.15 cap)', s1.speed >= 1.3 && s1.speed <= 2.31,
  `speed=${s1.speed.toFixed(2)}`);
await full();
await page.screenshot({ path: OUT + 'c_walking.png' });

/* 4 — looking less than 20° down does NOT walk */
await open('ui=0&walk=1&noshadow=1&look=10,0', 1500);
await small();
const sN = await page.evaluate(() => window.__app.status());
check('bow 10° stays stopped', sN.path < 0.05, `path=${sN.path.toFixed(2)}`);

/* 5 — edge blocks walking (limit is HALF - boundsBlock = 66 - 1.5 = 64.5) */
const edge5 = (await page.evaluate(() => window.__app.status().half) || 66) - 1.5;
const edgeZ = await page.evaluate((e) => {
  const ts = window.__app.status().pines;            /* approach the edge where no tree stands */
  for (let z = 0; z <= e - 4; z += 0.5)
    if (!ts.some(p => Math.abs(p.z - z) < 1.5 && p.x > e - 2)) return z;
  return 0;
}, edge5);
await page.evaluate(([e, z]) => window.__app.setPlayer(e - 0.5, z), [edge5, edgeZ]);
await page.evaluate(() => window.__app.setLook(40, -90));
await page.waitForTimeout(2500);
const sE = await page.evaluate(() => window.__app.status());
check('area edge blocks', sE.blocked && sE.blocked.includes('OUT OF AREA'), `blocked="${sE.blocked}" px=${sE.px.toFixed(2)}`);
check(`stopped at boundary ≈${edge5.toFixed(1)}`, sE.px > edge5 - 0.2 && sE.px <= edge5 + 0.06, `px=${sE.px.toFixed(2)}`);

/* 6 — tree trunk blocks */
const tree = await page.evaluate(() => {
  const s = window.__app.status();
  for (const p of (s.pines || [])) {           /* pick one with a clear 1.2 m approach lane */
    if (p.type === 'herb') continue;           /* herbs are walk-through */
    let clear = true;
    for (let d = 0; d <= 1.0; d += 0.2)
      if (!window.__app.probe(p.x - 1.2 + d, p.z).ok) { clear = false; break; }
    if (clear) return p;
  }
  return s.pines ? s.pines.find(p => p.type !== 'herb') : null;
});
if (tree) {
  await page.evaluate(([x, z]) => window.__app.setPlayer(x - 1.2, z), [tree.x, tree.z]);
  await page.evaluate(() => window.__app.setLook(40, -90));   /* look +x toward the tree */
  await page.waitForTimeout(5000);
  const sT = await page.evaluate(() => window.__app.status());
  const dx = tree.x - sT.px;
  check('tree trunk blocks', sT.blocked === 'TREE TRUNK' && dx < 1.0 && dx > 0,
    `blocked="${sT.blocked}" dist_to_trunk=${dx.toFixed(2)}`);
  await full();
  await page.screenshot({ path: OUT + 'd_tree_block.png' });
} else {
  check('pines exposed to __app', false);
}

/* 7 — heading follows a SIDE look (turn gaze 70° right → path bends right) */
const head7 = await clearPath(0.6, -70, 4.5);
await open(`ui=0&walk=1&noshadow=1&seg=96&look=35,${head7}`, 700);
await small();
const g0 = await page.evaluate(() => window.__app.status());
await page.evaluate((hy) => window.__app.setLook(35, hy - 70), head7);   /* gaze 70° to the right */
await page.waitForTimeout(2400);
const g1 = await page.evaluate(() => window.__app.status());
const R7 = Math.PI / 180;
const f7 = { x: -Math.sin((head7 - 70) * R7), z: -Math.cos((head7 - 70) * R7) };   /* new heading  */
const s7 = { x:  Math.cos(head7 * R7),        z: -Math.sin(head7 * R7) };          /* original side */
const dxg = g1.px - g0.px, dzg = g1.pz - g0.pz;
const lateral = dxg * s7.x + dzg * s7.z;
check('side look walks to the side', lateral > 0.7 && dxg * f7.x + dzg * f7.z > 0,
  `lateral=${lateral.toFixed(2)} d=(${dxg.toFixed(2)},${dzg.toFixed(2)})`);

/* 8 — look straight down (>70°): heading stays LAST LOOK */
await page.evaluate((hy) => window.__app.setLook(80, hy - 70), head7);
await page.waitForTimeout(1100);
const g2 = await page.evaluate(() => window.__app.status());
const cont = Math.hypot(g2.px - g1.px, g2.pz - g1.pz) > 0.5;
const sameDir = ((g2.px - g1.px) * f7.x + (g2.pz - g1.pz) * f7.z) > 0.3;
check('extreme bow keeps last heading', cont && sameDir,
  `cont=${cont} sameDir=${sameDir}`);

/* 10 — FPS fallback: holding W walks forward in view direction (-z at yaw 0) */
await open('ui=0&noshadow=1&look=0,0', 900);
await small();
const w0 = await page.evaluate(() => window.__app.status());
await page.keyboard.down('w');
await page.waitForTimeout(1800);
await page.keyboard.up('w');
const w1 = await page.evaluate(() => window.__app.status());
const dzW = w1.pz - w0.pz, dxW = w1.px - w0.px;
check('WASD: W walks forward (-z at yaw 0)', dzW < -0.5 && Math.abs(dxW) < 0.25,
  `d=(${dxW.toFixed(2)},${dzW.toFixed(2)})`);

/* 11 — FPS fallback: mouse drag turns the view (flatLook, deg units) */
const m0 = await page.evaluate(() => window.__app.status().look);
await page.mouse.move(240, 135);
await page.mouse.down();
await page.mouse.move(340, 115);   /* drag right+up → yaw ≈ -12.6°, pitch ≈ +2.5° (0.126°/px) */
await page.mouse.up();
const m1 = await page.evaluate(() => window.__app.status().look);
check('mouse drag looks around', m1.yaw < m0.yaw - 8 && m1.pitch > m0.pitch + 1.2,
  `yaw ${m0.yaw}→${m1.yaw.toFixed(1)} pitch ${m0.pitch}→${m1.pitch.toFixed(1)}`);

/* 9 — no in-scene signs/boards anywhere (user request); help is DOM overlay only */
await open('look=18,25', 2500);
await full();
const s9 = await page.evaluate(() => window.__app.status());
check('no in-scene UI boards', s9.ui3d === 0, `ui3d=${s9.ui3d}`);
await page.screenshot({ path: OUT + 'e_hud_clean.png' });

/* 14 — ground decor placed: stones + grass tufts (visual-only motion cues) */
const s14 = await page.evaluate(() => window.__app.status());
check('ground decor placed', s14.decor.rocks >= 1000 && s14.decor.tufts >= 7000,
  `rocks=${s14.decor.rocks} tufts=${s14.decor.tufts}`);

/* 15 — walking ring: full ring while bow >= engage, whole ring gone when raised */
await open('walk=1&noshadow=1', 900);
await small();
await page.evaluate(() => window.__app.setLook(35, -90));
await page.waitForTimeout(500);
const sOn = await page.evaluate(() => window.__app.status());
await page.evaluate(() => window.__app.setLook(5, -90));
await page.waitForTimeout(400);
const sOff = await page.evaluate(() => window.__app.status());
check('ring appears only at engage bow', sOn.ring === true && sOn.bow >= 20 && sOff.ring === false,
  `ring@35°=${sOn.ring}(bow=${sOn.bow.toFixed(0)}) ring@5°=${sOff.ring}`);

/* 16 — mixed forest in zones: pines with varied heights AND varied crown-layer
        counts, round-crowned branched trees, shrubs, banana plants and herbs */
await open('ui=0&look=12,20&seg=96', 1200);
const s16 = await page.evaluate(() => window.__app.status());
const byType = s16.treeTypes;
const pine = s16.pines.filter(p => p.type === 'pine');
const layerSet = [...new Set(pine.map(p => p.layers))].sort((a, b) => a - b);
const pH = pine.map(p => p.H);
const shH = s16.pines.filter(p => p.type === 'shrub').map(p => p.H);
check('forest mixes all 5 zone species',
  byType.pine >= 12 && byType.round >= 12 && byType.shrub >= 12 &&
  byType.banana >= 12 && byType.herb >= 12, `types=${JSON.stringify(byType)}`);
check('pines vary in height and crown-layer count',
  layerSet.length >= 3 && Math.min(...pH) < 4.5 && Math.max(...pH) > 6.2 && Math.max(...shH) < 1.5,
  `coneLayers=[${layerSet}] pineH=${Math.min(...pH).toFixed(1)}..${Math.max(...pH).toFixed(1)} shrubMax=${Math.max(...shH).toFixed(2)}`);

/* shot: round-crowned tree close up */
const broad = s16.pines.filter(p => p.type === 'round')
  .sort((a, b) => (a.x * a.x + a.z * a.z) - (b.x * b.x + b.z * b.z))[0];
if (broad) {
  await full();
  await page.evaluate(([tx, tz]) => {
    const d = Math.hypot(tx, tz);
    const px = tx * (1 - 7 / d), pz = tz * (1 - 7 / d);
    window.__app.setPlayer(px, pz);
    window.__app.setLook(8, Math.atan2(-(tx - px), -(tz - pz)) * 180 / Math.PI);
  }, [broad.x, broad.z]);
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + 'h_broadleaf.png' });
}

/* 17 — day→night: sun sets and stops casting, the MOON takes over lighting
        (its direction changes too), stars fade in and the sky recolours */
await open('ui=0&tod=7&dayspeed=0', 1200);
const d0 = await page.evaluate(() => window.__app.status());
await page.evaluate(() => window.__app.setTod(22.5));
await page.waitForTimeout(400);
const d1 = await page.evaluate(() => window.__app.status());
check('day→night cycle switches lighting to the moon',
  d0.sun.dir.x > 0.5 && d0.sun.alt > 5 && d0.sun.lit === true && d0.moon.lit === false &&
  d0.stars.opacity < 0.05 &&
  d1.sun.alt < -5 && d1.sun.lit === false && d1.moon.alt > 5 && d1.moon.lit === true &&
  d1.moon.intensity > 0.15 && d1.stars.opacity > 0.5 && d1.sky !== d0.sky &&
  d1.stars.rotY !== d0.stars.rotY,
  `sunAlt ${d0.sun.alt.toFixed(0)}→${d1.sun.alt.toFixed(0)} moonAlt=${d1.moon.alt.toFixed(0)} starsOp ${d0.stars.opacity.toFixed(2)}→${d1.stars.opacity.toFixed(2)} sky=${d0.sky}→${d1.sky}`);
/* night shot: moon low enough to frame + stars */
await page.evaluate(() => { window.__app.setTod(20.5); window.__app.setLook(-30, -70); });
await page.waitForTimeout(600);
await page.screenshot({ path: OUT + 'f_night_moon.png' });

/* 18 — world clock advances with ?dayspeed; by day the sun is the shadow caster */
await open('ui=0&seg=96&tod=9.5&dayspeed=1000', 600);
await small();
const c0 = await page.evaluate(() => window.__app.status());
await page.waitForTimeout(2000);
const c1 = await page.evaluate(() => window.__app.status());
check('clock advances; sun shadow rig active by day',
  c1.tod > c0.tod + 0.15 && c0.shadows.enabled === true && c0.shadows.mapSize >= 1024 &&
  c0.sun.lit === true && c0.shadows.sun === true && c0.shadows.moon === false,
  `tod ${c0.tod.toFixed(2)}→${c1.tod.toFixed(2)} sunAlt=${c0.sun.alt.toFixed(0)}°`);
await full();

/* shot: sunset — low sun, long shadows, warm sky */
await open('ui=0&tod=17.9&dayspeed=0&look=6,90', 1500);
await page.screenshot({ path: OUT + 'g_sunset.png' });

/* shot: afternoon low sun in frame — long tree shadows stretch across the grass */
await open('ui=0&tod=16&dayspeed=0&look=-20,79', 1500);
await page.screenshot({ path: OUT + 'i_sun_shadows.png' });

/* 19 — species zoning: a plant's neighbours within 8 m are mostly the SAME kind
        (จัดโซนให้แต่ละพื้นที่มีต้นไม้ชนิดเดียวกันขึ้นอยู่ใกล้ๆกัน) */
{
  const zres = await page.evaluate(() => {
    const ps = window.__app.status().pines;
    let same = 0, total = 0;
    for (const p of ps) for (const q of ps) {
      if (p === q) continue;
      if (Math.hypot(p.x - q.x, p.z - q.z) > 8) continue;
      total++; if (p.type === q.type) same++;
    }
    return { frac: same / Math.max(1, total), n: ps.length };
  });
  check('species zones: same-kind clustering ≥60%', zres.frac >= 0.6,
    `same-species-neighbours=${(zres.frac * 100).toFixed(0)}% (${zres.n} plants)`);
}

/* 20 — fauna: 7 birds circle overhead + 14 butterflies flutter around the walker;
        both animate every frame; butterflies are daytime-only */
{
  await open('ui=0&seg=96&noshadow=1', 1500);
  await small();
  const fa0 = await page.evaluate(() => window.__app.status());
  check('fauna present (7 birds, 14 butterflies, visible by day)',
    fa0.fauna && fa0.fauna.birds === 7 && fa0.fauna.butterflies === 14 &&
    fa0.fauna.bflyVisible === true && !!fa0.fauna.birdSample && !!fa0.fauna.bflySample,
    `birds=${fa0.fauna?.birds} butterflies=${fa0.fauna?.butterflies} visible=${fa0.fauna?.bflyVisible}`);
  await page.waitForTimeout(900);
  const fa1 = await page.evaluate(() => window.__app.status());
  const dB = Math.hypot(fa1.fauna.birdSample[0] - fa0.fauna.birdSample[0],
                        fa1.fauna.birdSample[2] - fa0.fauna.birdSample[2]);
  const dF = Math.hypot(fa1.fauna.bflySample[0] - fa0.fauna.bflySample[0],
                        fa1.fauna.bflySample[2] - fa0.fauna.bflySample[2]);
  const altOK = fa0.fauna.birdSample[1] > 8 && fa0.fauna.birdSample[1] < 28;
  check('birds and butterflies animate every frame', dB > 0.3 && dF > 0.05 && altOK,
    `birdMove=${dB.toFixed(2)}m alt=${fa0.fauna.birdSample[1].toFixed(1)}m bflyMove=${dF.toFixed(2)}m`);
  await page.evaluate(() => window.__app.setTod(22.5));
  await page.waitForTimeout(500);
  const fa2 = await page.evaluate(() => window.__app.status());
  check('butterflies rest at night (hidden), birds keep flying',
    fa2.fauna.bflyVisible === false && !!fa2.fauna.birdSample,
    `bflyVisible@22:30=${fa2.fauna.bflyVisible}`);
}

/* 21 — default day/night cycle: 5 min day + 5 min night, sun angle visibly moves */
{
  await open('ui=0&seg=96&noshadow=1&tod=10', 900);      /* tod present → clock NOT frozen */
  await small();
  const d0 = await page.evaluate(() => window.__app.status());
  await page.waitForTimeout(3000);
  const d1 = await page.evaluate(() => window.__app.status());
  const cycle = 24 * 3600 / d0.dayspeed;
  check('default day cycle = 5 min day + 5 min night', d0.dayspeed === 144 && cycle === 600,
    `dayspeed=${d0.dayspeed} → cycle ${cycle}s (day ${cycle / 120}min + night ${cycle / 120}min)`);
  const dTod = (d1.tod - d0.tod + 24) % 24;                     /* wall-time clock → 0.12 h in 3 s */
  const altMove = Math.abs(Math.asin(d1.sun.dir.y) - Math.asin(d0.sun.dir.y)) * 180 / Math.PI;
  check('sitting still: sun altitude keeps moving (default speed)', dTod >= 0.08 && altMove >= 0.4,
    `clock +${dTod.toFixed(3)}h in 3s (real-time) → sun alt moved ${altMove.toFixed(2)}°`);
}

/* 22 — the page a student opens: NO text anywhere except the XR button */
{
  const pg2 = await page.context().newPage();
  pg2.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await pg2.addInitScript(() => {
    navigator.xr = { isSessionSupported: async m => m === 'immersive-vr',
                     requestSession: async () => ({ requestReferenceSpace: async () => ({}) }) };
  });
  await pg2.setViewportSize({ width: 480, height: 270 });
  await pg2.goto(BASE + '?seg=96&noshadow=1&tod=10&dayspeed=0', { waitUntil: 'load' });
  await pg2.waitForTimeout(900);
  const ui = await pg2.evaluate(() => ({
    bodyText: document.body.innerText.replace(/\s+/g, ' ').trim(),
    btns: [...document.querySelectorAll('button')].map(b => b.textContent),
    helpInDom: !!document.getElementById('help'),
    readoutInDom: !!document.getElementById('readout'),
  }));
  check('default page shows no text except the XR button',
    ui.btns.length === 1 && /VR/.test(ui.btns[0]) && ui.bodyText === ui.btns[0].trim() && !ui.helpInDom && !ui.readoutInDom,
    `body text="${ui.bodyText}" buttons=${JSON.stringify(ui.btns)} help=${ui.helpInDom} hud=${ui.readoutInDom}`);
  await pg2.setViewportSize({ width: 1280, height: 720 });
  await pg2.waitForTimeout(1400);
  await pg2.screenshot({ path: SHOTS + 'l_clean_page.png' });   /* what students actually see */
  await pg2.close();
}

/* shot: banana plant close up — stand 3.5 m off in a clear direction, look at it */
{
  await open('ui=0&seg=96', 1500);
  await full();
  const s16b = await page.evaluate(() => window.__app.status());
  const ban = s16b.pines.filter(p => p.type === 'banana')
    .sort((a, b) => (a.x * a.x + a.z * a.z) - (b.x * b.x + b.z * b.z))[0];
  let framed = false;
  if (ban) {
    const pos = await page.evaluate(([tx, tz]) => {
      for (let a = 0; a < 360; a += 15) {
        const px = tx + Math.cos(a * Math.PI / 180) * 3.5, pz = tz + Math.sin(a * Math.PI / 180) * 3.5;
        if (window.__app.probe(px, pz).ok) return [px, pz];
      }
      return null;
    }, [ban.x, ban.z]);
    if (pos) {
      await page.evaluate(([px, pz, tx, tz]) => {
        window.__app.setPlayer(px, pz);
        window.__app.setLook(10, Math.atan2(-(tx - px), -(tz - pz)) * 180 / Math.PI);
      }, [pos[0], pos[1], ban.x, ban.z]);
      await page.waitForTimeout(700);
      await page.screenshot({ path: OUT + 'j_banana.png' });
      framed = true;
    }
  }
  check('banana close-up framed', framed);

  /* shot: butterflies around the walker (day, eyes level, slight down look) */
  await open('ui=0&seg=96&look=8,0', 2200);
  const sf = await page.evaluate(() => {
    const s = window.__app.status();
    return Math.hypot(s.fauna.bflySample[0] - s.px, s.fauna.bflySample[2] - s.pz);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + 'k_butterflies.png' });
  check('butterflies circle close to the walker', sf < 14, `nearestSample=${sf.toFixed(1)}m`);
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
await browser.close();
process.exit(fails ? 1 : 0);
