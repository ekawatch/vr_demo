/* timelapse.mjs — proof of the day/night request, measured on REAL wall time.
   Default clock (144× → 1 day = 600 s: 5 min day + 5 min night).
   Sitting still, three shots 120 s apart: 10:00 morning → afternoon → moonlight.
   Reports clock, sun/moon altitude + azimuth at each shot and the shadow-side
   direction change; exits non-zero if the light does not keep sweeping. */
import { chromium } from '/run/media/ekawat/Work/dsh_workspace/drone_project/node_modules/playwright-core/index.mjs';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:8099/index.html';
const OUT = fileURLToPath(new URL('./shots/', import.meta.url));   /* plain fs path — playwright's path option */
const GAP = 120000;                     /* 120 s real time = 4.8 h world time */

const browser = await chromium.launch({
  executablePath: '/home/ekawat/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));

/* sunModel azimuth (east 0° → south 90° → west 180°), recovered from status().sun.dir */
const azOf = d => (Math.atan2(-(d.z / 0.35), d.x) * 180 / Math.PI + 360) % 360;

const snap = async label => {
  const s = await page.evaluate(() => window.__app.status());
  const night = !s.sun.lit;
  const cont = azOf(s.sun.dir);                                   /* continuous sweep, grows all day */
  const az = night ? (cont + 180) % 360 : cont;                  /* direction actually lighting the scene */
  const alt = night ? s.moon.alt : s.sun.alt;
  await page.screenshot({ path: OUT + label });
  console.log(`${label}: clock=${s.tod.toFixed(2)}h  source=${night ? 'MOON' : 'SUN'}  alt=${alt.toFixed(1)}°  az=${az.toFixed(1)}°  shadows=${s.shadows.enabled ? 'on' : 'off'}  sky=${s.sky}`);
  return { ...s, cont, alt, night };
};

/* no ?dayspeed → default 144×; shadows ON so light direction is visible */
await page.goto(BASE + '?ui=0&tod=10&seg=96', { waitUntil: 'load' });
await page.waitForTimeout(2000);
const a = await snap('sun_1_clock1000.png');
await page.waitForTimeout(GAP);
const b = await snap('sun_2_after_120s.png');
await page.waitForTimeout(GAP);
const c = await snap('sun_3_after_240s.png');

const dAB = (b.tod - a.tod + 24) % 24, dBC = (c.tod - b.tod + 24) % 24;
const azAB = b.cont - a.cont, azBC = c.cont - b.cont;   /* continuous: same increasing angle all day */
const want = GAP / 1000 * 144 / 3600;  /* expected world-hours advanced per gap */
const checks = [
  ['clock runs on wall time at 144×', Math.abs(dAB - want) < 0.15 && Math.abs(dBC - want) < 0.15],
  ['light direction keeps sweeping while sitting still', azAB >= 55 && azBC >= 55],
  ['third shot is moonlight (night reached inside the 5-min day half)', c.night && c.alt > 8],
  ['cycle arithmetic = 5 min day + 5 min night', a.dayspeed === 144 && 24 * 3600 / a.dayspeed === 600],
];
console.log(`advanced +${dAB.toFixed(2)}h / +${dBC.toFixed(2)}h per ${GAP / 1000}s (expected ${want.toFixed(2)}h); ` +
  `light azimuth moved ${azAB.toFixed(1)}° then ${azBC.toFixed(1)}°`);
let fail = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) fail++; }
await browser.close();
console.log(fail ? 'TIMELAPSE FAILED' : 'TIMELAPSE OK');
process.exit(fail ? 1 : 0);
