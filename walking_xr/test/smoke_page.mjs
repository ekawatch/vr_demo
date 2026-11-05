/* smoke_page.mjs — one quick page check (NOT the full suite, per user request):
   the default page must show no text at all except the XR entry button.
   Also saves test/shots/l_clean_page.png = what students actually see. */
import { chromium } from '/run/media/ekawat/Work/dsh_workspace/drone_project/node_modules/playwright-core/index.mjs';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:8099/index.html';
const OUT = fileURLToPath(new URL('./shots/', import.meta.url));

const browser = await chromium.launch({
  executablePath: '/home/ekawat/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });

/* simulate a phone/VR-capable browser: WebXR present */
await page.addInitScript(() => {
  navigator.xr = { isSessionSupported: async m => m === 'immersive-vr',
                   requestSession: async () => ({ requestReferenceSpace: async () => ({}) }) };
});
await page.goto(BASE + '?seg=96&noshadow=1', { waitUntil: 'load' });
await page.waitForTimeout(1500);

const ui = await page.evaluate(() => ({
  v: (document.documentElement.innerHTML.match(/Version marker: [0-9a-z-]+/) || [,'?'])[0],
  bodyText: document.body.innerText.replace(/\s+/g, ' ').trim(),
  btns: [...document.querySelectorAll('button')].map(b => b.textContent),
  helpInDom: !!document.getElementById('help'),
  readoutInDom: !!document.getElementById('readout'),
  tod: window.__app ? window.__app.status().tod.toFixed(2) : 'n/a',
}));
console.log('served:', ui.v, ' clock:', ui.tod);
const okBtn = ui.btns.length === 1 && /VR/.test(ui.btns[0]);
const okText = ui.bodyText === (ui.btns[0] || '').trim();
console.log(`${okBtn && okText && !ui.helpInDom && !ui.readoutInDom ? 'PASS' : 'FAIL'}  only the XR button on screen`);
console.log(`   buttons=${JSON.stringify(ui.btns)}  body text="${ui.bodyText}"  help=${ui.helpInDom} hud=${ui.readoutInDom}`);

/* what students actually see (WebXR-capable phone / headset browser) */
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + 'l_clean_page.png' });

/* and the ?ui=1 debug mode still works */
await page.goto(BASE + '?seg=96&noshadow=1&ui=1', { waitUntil: 'load' });
await page.waitForTimeout(1200);
const dbg = await page.evaluate(() => ({
  help: !!document.getElementById('help'),
  hud: !!document.getElementById('readout'),
  hasText: document.body.innerText.includes('ความปลอดภัย'),
}));
console.log(`${dbg.help && dbg.hud && dbg.hasText ? 'PASS' : 'FAIL'}  ?ui=1 still shows the debug help + readout`);

await browser.close();
process.exit(okBtn && okText && dbg.help && dbg.hud ? 0 : 1);
