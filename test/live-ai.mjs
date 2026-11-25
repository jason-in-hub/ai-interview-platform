// Calls the real DeepSeek proxy with the real prompts and reports JSON validity, probe length and latency.
// Usage: node test/live-ai.mjs [rounds]   (costs a few API tokens per call)
import { buildProbePrompt, buildReportPrompt } from '../js/prompts.js';
import { probeLimitOk } from '../js/heuristics.js';
import { DEEPSEEK_PROXY_URL as URL_ } from '../js/config.js';
const rounds = +(process.argv[2] || 3);
const ctxs = { zh: { lang: 'zh', industry: '管理顧問', role: '商業分析師', interviewer_title: '項目合夥人' }, en: { lang: 'en', industry: 'Management Consulting', role: 'Business Analyst', interviewer_title: 'Engagement Partner' } };
const answers = { zh: '當時我們團隊負責一個大型項目，我們花了很多時間處理數據，最後完成了報告。', en: 'We worked on a project and our team did a lot of analysis, then we presented it to the client.' };
async function call(p, maxTokens) {
  const t = Date.now();
  const r = await fetch(URL_ + '/chat', { method: 'POST', headers: { origin: 'http://localhost:8000', 'content-type': 'application/json' }, body: JSON.stringify({ ...p, maxTokens }) });
  const body = await r.text(); const s = ((Date.now() - t) / 1000).toFixed(1);
  if (!r.ok) return { status: r.status, body, s };
  const text = JSON.parse(body).text;
  try { return { ok: true, json: JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)), s }; } catch { return { ok: false, text: text.slice(0, 200), s }; }
}
for (const lang of ['zh', 'en']) {
  for (let i = 0; i < rounds; i++) {
    const o = await call(buildProbePrompt(ctxs[lang], 'Q', answers[lang]), 2000);
    console.log(lang, 'probe', o.s + 's', o.ok ? JSON.stringify({ ...o.json, lenOK: probeLimitOk(o.json.probe || '', lang) }) : JSON.stringify(o));
  }
  const qa = [1, 2, 3].map(n => ({ question: 'Question ' + n, answer: answers[lang], probe: 'p', probeAnswer: answers[lang] }));
  const o = await call(buildReportPrompt(ctxs[lang], qa, { eye: 70, brow: 10, pace: 200, presence: 20 }), 8000);
  console.log(lang, 'report', o.s + 's', o.ok ? JSON.stringify(o.json).slice(0, 900) : JSON.stringify(o));
}
