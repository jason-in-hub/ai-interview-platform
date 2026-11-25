// End-to-end smoke test (offline engine) with fake camera/mic. Usage: node test/e2e.mjs [baseUrl] [lang]
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
const base = process.argv[2] || 'http://localhost:8000/';
const lang = process.argv[3] || 'en';
const exe = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', process.env.CHROME].find(p => p && existsSync(p));
const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 900 });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
// MediaPipe logs its "INFO: Created TensorFlow Lite" banner via console.error; that one line is benign.
page.on('console', m => { if (m.type() === 'error' && !/^INFO: Created TensorFlow Lite/.test(m.text())) errors.push('console: ' + m.text()); });
await page.goto(base, { waitUntil: 'networkidle2' });
await page.evaluate(() => localStorage.removeItem('aip.settings'));
await page.reload({ waitUntil: 'networkidle2' });
await page.click(`[data-lang="${lang}"]`);
await page.click('[data-ind="consulting"]');
await page.click('#go');
await page.waitForSelector('#begin');
await page.waitForFunction(() => [...document.querySelectorAll('[id^=chk-]')].every(e => e.textContent !== '…'), { timeout: 15000 }).catch(() => {});
const checks = await page.$$eval('[id^=chk-]', els => els.map(e => e.id + '=' + e.textContent));
await page.click('#begin');
const answers = lang === 'en' ? [
  ['We worked on a project and we made a report. Our team did a lot of analysis and we presented it.', 'I personally built the pricing model and cut analysis time by 40%, from 10 hours to 6.'],
  ['When I was a society president, I was responsible for a 30-person event team. I decided to split roles and I convinced the treasurer to cut costs by 15%.', 'The trade-off was fewer vendors, but turnout grew from 120 to 200.'],
  ['It depends.', 'Revenue and cost.'],
] : [
  ['當時我們團隊負責一個大型項目，我們花了很多時間處理數據，我們最後完成了報告。', '我個人建立了定價模型，將分析時間由10小時減少到6小時。'],
  ['當時我負責一個30人的活動團隊。我決定重新分工，最終成本減少15%，參加人數由120增加到200。', '取捨是減少供應商，但風險可控。'],
  ['看情況。', '收入和成本。'],
];
const probes = [];
for (let i = 0; i < 3; i++) {
  await page.waitForSelector('#ans:not([disabled])');
  await page.type('#ans', answers[i][0]);
  await page.click('#submit');
  await page.waitForSelector('[data-testid=probe]');
  probes.push(await page.$eval('[data-testid=probe]', e => e.textContent));
  await page.waitForSelector('#ans:not([disabled])');
  await page.type('#ans', answers[i][1]);
  await page.click('#submit');
}
await page.waitForSelector('[data-testid=decision]', { timeout: 20000 });
const out = await page.evaluate(() => ({
  decision: document.querySelector('[data-testid=decision]').textContent,
  total: document.querySelector('[data-testid=total]').textContent,
  qscores: [...document.querySelectorAll('[data-testid=qscores] > div')].map(d => d.lastElementChild.textContent),
  replay: !!document.querySelector('#replay'), chunks: window.__aip.chunks.length,
  presence: window.__aip.report.tele,
}));
await page.screenshot({ path: process.env.SHOT || 'report.png', fullPage: true });
await page.click('#drill');
await page.waitForSelector('[data-testid=question]');
const drillQ = await page.$eval('[data-testid=question]', e => e.textContent);
await browser.close();
console.log(JSON.stringify({ checks, probes, ...out, drillQ, errors }, null, 2));
if (errors.length || out.qscores.length !== 3 || !out.replay) process.exit(1);
