import puppeteer from 'puppeteer';
const BASE = process.env.MAZE_TEST_BASE || 'http://127.0.0.1:8080/Maze/index.html';
const OUT = new URL('../_preview/', import.meta.url).pathname;
const browser = await browser_launch();
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? '  ' + JSON.stringify(detail) : ''));
  if (!ok) failures++;
}
async function newPage(url, initScript) {
  const page = await browser.newPage();
  page.on('pageerror', e => { console.log('PAGEERROR:', String(e.message).slice(0, 300)); failures++; });
  if (initScript) await page.evaluateOnNewDocument(initScript);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1200));
  return page;
}
const status = page => page.evaluate(() => window.__app && window.__app.status());
const wait = ms => new Promise(r => setTimeout(r, ms));

/* 1 — basic load + map sanity (seeded) */
let page = await newPage(BASE + '?seed=42');
let s = await status(page);
check('load+status', s && s.mode === 'flat' && s.seed === 42, { mode: s?.mode, seed: s?.seed });
check('map has S/E/walls', s && s.map.join('').includes('S') && s.map.join('').includes('E') && s.walls > 120 && s.walls < 130, { walls: s?.walls });
const mapA = s.map.join('\n');
await page.close();

/* 2b — perfect maze: the open-cell graph must be a TREE (exactly one route
   between any two cells → unique exit, all branches dead ends) + gate open */
page = await newPage(BASE + '?seed=42');
const tree = await page.evaluate(() => {
  const m = window.__app.status().map;
  const H = m.length, W = m[0].length;
  const open = (x, z) => x > 0 && z > 0 && x < W - 1 && z < H - 1 && m[z][x] !== '#';
  let nodes = 0, edges = 0, sx = -1, sz = -1;
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) if (open(x, z)) {
    nodes++;
    if (m[z][x] === 'S') { sx = x; sz = z; }
    if (open(x + 1, z)) edges++;
    if (open(x, z + 1)) edges++;
  }
  const seen = new Set([sx + ',' + sz]); const q = [[sx, sz]]; let cnt = 1;
  while (q.length) {
    const [x, z] = q.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (open(nx, nz) && !seen.has(nx + ',' + nz)) { seen.add(nx + ',' + nz); q.push([nx, nz]); cnt++; }
    }
  }
  const walkOut = [window.__app.probe(29, 27), window.__app.probe(31.5, 27)]; /* through gap to beacon */
  return { nodes, edges, connected: cnt === nodes, gateChar: m[13][14], walkOut };
});
check('open-cell graph is a tree (unique route)', tree.connected && tree.edges === tree.nodes - 1, tree);
check('exit gap is open in wall', tree.gateChar !== '#', { gateChar: tree.gateChar });
check('can walk through the gap to the beacon', tree.walkOut.every(r => r.ok), { walkOut: tree.walkOut });
await page.close();

/* 2 — determinism with same seed; different map with other seed */
page = await newPage(BASE + '?seed=42'); s = await status(page); await page.close();
check('same seed = same map', s.map.join('\n') === mapA);
page = await newPage(BASE + '?seed=43'); s = await status(page); await page.close();
check('other seed = different map', s.map.join('\n') !== mapA);

/* 3 — collision probes */
page = await newPage(BASE + '?seed=42');
s = await status(page);
const probes = await page.evaluate(() => {
  const m = window.__app.status().map;
  const at = window.__app.probe(window.__app.status().startPos[0], window.__app.status().startPos[1]);
  let wallProbe = null;
  for (let z = 0; z < m.length && !wallProbe; z++) for (let x = 0; x < m[0].length; x++) {
    if (m[z][x] === '#') { wallProbe = window.__app.probe(x * 2 + 1, z * 2 + 1); x = m[0].length; z = m.length; break; }
  }
  return { at, wallProbe };
});
check('probe start ok', probes.at.ok === true);
check('probe inside wall blocked', probes.wallProbe.ok === false && probes.wallProbe.reason === 'WALL', probes.wallProbe);

/* 4 — gaze-walk engages at 30°, not at 10° */
async function walkTest(pitch) {
  const p = await newPage(BASE + '?seed=42&walk=1');
  const st0 = await status(p);
  await p.evaluate(pitch => window.__app.setLook(pitch, Math.atan2(-window.__app.status().startDir[0], -window.__app.status().startDir[1]) * 180 / Math.PI), pitch);
  await wait(2500);
  const st1 = await status(p);
  await p.close();
  return { moved: st1.path, speed: st1.speed, ring: st1.ring };
}
const w30 = await walkTest(-30);
check('look 30° down → walks', w30.moved > 0.8 && w30.speed > 0.5, w30);
check('status ring visible while walking', w30.ring === true);
const w10 = await walkTest(-10);
check('look 10° down → does NOT walk', w10.moved < 0.01 && w10.speed < 0.01, w10);

/* 5 — walking into a wall blocks with WALL message */
page = await newPage(BASE + '?seed=42&walk=1');
s = await status(page);
const wallYaw = await page.evaluate(() => {
  const st = window.__app.status();
  const DIRS = [[0, -2], [2, 0], [0, 2], [-2, 0]];
  for (const [dx, dz] of DIRS) {
    const mx = ((1 + dx / 2) + 0.5) * 2, mz = ((1 + dz / 2) + 0.5) * 2;   /* adjacent wall cell center */
    const hx = mx - st.startPos[0], hz = mz - st.startPos[1];
    if (!window.__app.probe(st.startPos[0] + hx * 0.7, st.startPos[1] + hz * 0.7).ok)
      return Math.atan2(-hx, -hz) * 180 / Math.PI;
  }
  return null;
});
check('found a wall direction from start', wallYaw !== null, { wallYaw });
await page.evaluate(y => window.__app.setLook(-30, y), wallYaw);
await wait(2500);
const sb = await status(page);
check('walk into wall → blocked WALL', sb.blocked === 'WALL' && sb.path < 0.7, { blocked: sb.blocked, path: sb.path });

/* 6 — reaching the beacon OUTSIDE the exit gap wins (start just outside wall) */
page = await newPage(BASE + '?seed=42&pos=30.5,27');
await wait(800);
const sw = await status(page);
check('reaching goal → won', sw.won === true && sw.goalDist < 1.1, { goalDist: sw.goalDist });
await page.screenshot({ path: OUT + 'win_goal_r6.png' });
await page.close();

/* 7 — XR flow on a simulated phone with a HALF-FAILED AR session:
   requestSession succeeds but three.js cannot present → must clean up,
   keep flat controls alive, and keep the loop rendering */
const xrStub = () => {
  Object.defineProperty(navigator, 'maxTouchPoints', { value: 1, configurable: true });
  Object.defineProperty(navigator, 'xr', { configurable: true, value: {
    isSessionSupported: async (m) => m === 'immersive-ar',
    requestSession: async () => ({
      addEventListener() {}, removeEventListener() {},
      requestReferenceSpace: async (n) => ({ n }), updateRenderState() {},
      end: async () => {} }),
  } });
};
page = await newPage(BASE + '?seed=42&walk=1&ui=1', xrStub);
s = await status(page);
const btnText = await page.evaluate(() => {
  const b = document.getElementById('xrBtn'); return b ? b.textContent : null;
});
check('XR probed (immersive-ar) + ENTER button shown', s.xrKind === 'immersive-ar' && !!btnText, { btn: btnText });
const walkBtnShown = await page.evaluate(() => !!document.getElementById('walkBtn'));
check('touch device gets WALK/STOP button', walkBtnShown);
const okStart = await page.evaluate(async () => await window.__app.enterXR());
await wait(1500);
s = await status(page);
check('failed XR → mode stays flat, presenting false', okStart === false && s.mode === 'flat' && s.presenting === false, { okStart, mode: s.mode });
await page.evaluate(() => {
  const st = window.__app.status();
  window.__app.setLook(-30, Math.atan2(-st.startDir[0], -st.startDir[1]) * 180 / Math.PI);
});
const after = await wait(2200).then(async () => status(page));
check('flat walk still works after failed XR', after.path > 0.8 && after.speed > 0.5, { path: after.path });
await page.close();

/* 8 — visual shots */
async function shot(url, name, ms = 1200) {
  const p = await browser.newPage();
  p.on('pageerror', e => { console.log('PAGEERROR shot ' + name + ':', String(e.message).slice(0, 200)); failures++; });
  await p.setViewport({ width: 900, height: 600 });
  await p.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(ms);
  await p.screenshot({ path: OUT + name });
  await p.close();
}
await shot('?seed=7&view=overview&ui=0', 'overview_r6.png');
await shot('?seed=7&ui=0', 'firstperson_r6.png', 1500);
/* walking shot: gaze 30° down toward the open start direction (HUD visible → ui=1) */
{
  const p = await browser.newPage();
  p.on('pageerror', e => { console.log('PAGEERROR shot walking:', String(e.message).slice(0, 200)); failures++; });
  await p.setViewport({ width: 900, height: 600 });
  await p.goto(BASE + '?seed=7&walk=1&ui=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.evaluate(() => {
    const st = window.__app.status();
    window.__app.setLook(-30, Math.atan2(-st.startDir[0], -st.startDir[1]) * 180 / Math.PI);
  });
  await wait(2600);
  await p.screenshot({ path: OUT + 'walking_r6.png' });
  await p.close();
}
await shot('?seed=7&view=goal&ui=1', 'goal_sign_r6.png');
await shot('?seed=7&view=goal&ui=1&pos=30.5,27', 'win_sign_r6.png', 1500);

console.log(failures === 0 ? 'ALL_TESTS_PASS' : 'FAILURES: ' + failures);
await browser.close();
if (failures) process.exit(1);

async function browser_launch() {
  return puppeteer.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
}
