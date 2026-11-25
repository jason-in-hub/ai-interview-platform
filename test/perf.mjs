// Load-time profile under emulated mobile network. Usage: node test/perf.mjs [baseUrl] [profile: 'Fast 4G'|'Slow 4G'|none]
import puppeteer, { KnownDevices, PredefinedNetworkConditions } from 'puppeteer-core';
const base = process.argv[2] || 'http://localhost:8000/';
const prof = process.argv[3] || 'Fast 4G';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const page = await browser.newPage();
await page.emulate(KnownDevices['iPhone 13']);
if (PredefinedNetworkConditions[prof]) await page.emulateNetworkConditions(PredefinedNetworkConditions[prof]);
await page.setCacheEnabled(false);
const res = [], pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('requestfinished', async r => { if (r.url().startsWith('blob:')) return; const resp = r.response(); let size = 0; try { size = (await resp.buffer()).length; } catch {} res.push({ url: r.url().replace(/\?.*/, '').slice(-70), size, t: Date.now() }); });
const t0 = Date.now();
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#go', { visible: true });
// styled = Tailwind CSS applied (button has a non-transparent background)
await page.waitForFunction(() => getComputedStyle(document.querySelector('#go')).backgroundColor !== 'rgba(0, 0, 0, 0)');
const tPicker = Date.now() - t0;
await new Promise(r => setTimeout(r, +(process.env.PICKER_DWELL || 0)));  // time a user spends choosing an industry
const t1 = Date.now();
await page.click('#go');
await page.waitForSelector('#begin', { visible: true });
const tReadyShell = Date.now() - t1;
await page.waitForFunction(() => !/…/.test(document.querySelector('#chk-lighting')?.textContent || '…'), { timeout: 120000 });
const tCamera = Date.now() - t1;
const samples = [];
const sampler = setInterval(async () => { try { samples.push(await page.evaluate(() => (document.querySelector('#face-bar')?.style.width || '-') + ' ' + window.__face.state)); } catch {} }, 1000);
if (process.env.SHOT) setTimeout(() => page.screenshot({ path: process.env.SHOT }).catch(() => {}), 2500);
await page.waitForFunction(() => /OK|No face|Re-centre/.test(document.querySelector('#chk-face')?.textContent || ''), { timeout: 180000 }).catch(() => {});
const tFace = Date.now() - t1;
clearInterval(sampler);
const total = res.reduce((a, b) => a + b.size, 0);
const top = [...res].sort((a, b) => b.size - a.size).slice(0, 8).map(r => ({ url: r.url, kb: Math.round(r.size / 1024), at: ((r.t - t0) / 1000).toFixed(1) + 's' }));
console.log(JSON.stringify({ profile: prof, tPicker_ms: tPicker, tReadyShell_ms: tReadyShell, tCameraCheck_ms: tCamera, tFaceModel_ms: tFace, dwell: +(process.env.PICKER_DWELL || 0), progress: samples.join(' | '), totalKB: Math.round(total / 1024), pageErrors, top }, null, 2));
await browser.close();
