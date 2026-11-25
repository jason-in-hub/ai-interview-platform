// AI engines. Three providers:
//  - 'deepseek': calls our Cloudflare Worker proxy, which holds the DeepSeek key as a secret (key never reaches the browser).
//  - 'claude'  : official Anthropic TypeScript SDK (esm.sh) with the user's own key from localStorage (BYOK).
//  - 'offline' : no AI call; heuristics.js handles everything.
import { buildProbePrompt, buildReportPrompt } from './prompts.js';
import { DEEPSEEK_PROXY_URL } from './config.js';

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const PROXY_URL = DEEPSEEK_PROXY_URL;

export function activeProvider(settings) {
  if (settings.provider === 'claude' && settings.apiKey) return 'claude';
  if (settings.provider === 'deepseek' && PROXY_URL) return 'deepseek';
  if (settings.provider === 'offline') return 'offline';
  return PROXY_URL ? 'deepseek' : settings.apiKey ? 'claude' : 'offline';
}

let sdk;
async function claudeClient(apiKey) {
  if (!sdk) sdk = (await import('https://esm.sh/@anthropic-ai/sdk')).default;
  return new sdk({ apiKey, dangerouslyAllowBrowser: true });
}

function parseJSON(text) {
  const cleaned = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function askClaude(settings, { system, user }, maxTokens) {
  const c = await claudeClient(settings.apiKey);
  const params = { model: settings.model || DEFAULT_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }], output_config: { effort: 'low' } };
  let res;
  try {
    // Server-side refusal fallback (beta); retried without it if the account or model rejects the flag.
    res = await c.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  } catch (e) {
    if (e?.status !== 400) throw e;
    res = await c.messages.create(params);
  }
  if (res.stop_reason === 'refusal') throw new Error('Model declined the request');
  return res.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

async function askDeepSeek({ system, user }, maxTokens) {
  const r = await fetch(PROXY_URL.replace(/\/$/, '') + '/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ system, user, maxTokens }),
  });
  if (!r.ok) throw new Error('Proxy ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return (await r.json()).text;
}

async function ask(settings, prompt, maxTokens) {
  const p = activeProvider(settings);
  if (p === 'offline') throw new Error('offline');
  const text = p === 'claude' ? await askClaude(settings, prompt, maxTokens) : await askDeepSeek(prompt, maxTokens);
  return parseJSON(text);
}

export async function llmProbe(settings, ctx, question, answer) {
  const out = await ask(settings, buildProbePrompt(ctx, question, answer), 2000);
  if (typeof out.probe !== 'string' || typeof out.cue !== 'string') throw new Error('Bad probe JSON');
  return { probe: out.probe.trim(), cue: out.cue.trim(), source: 'llm' };
}

const clamp25 = x => Math.max(0, Math.min(25, Math.round(Number(x) || 0)));

export async function llmReport(settings, ctx, qa, tele) {
  const r = await ask(settings, buildReportPrompt(ctx, qa, tele), 8000);
  for (const k of ['structure', 'commercial', 'impact']) {
    if (!r[k]) throw new Error('Missing pillar ' + k);
    r[k].score = clamp25(r[k].score);
  }
  r.strengths = Array.isArray(r.strengths) ? r.strengths : [];
  r.improvements = Array.isArray(r.improvements) ? r.improvements : [];
  r.rewrite = r.rewrite || { before: '', after: '', note: '' };
  const qs = Array.isArray(r.questionScores) ? r.questionScores : [];
  r.questionScores = qa.map((_, i) => Math.max(0, Math.min(100, Math.round(Number(qs[i]) || 0))));
  r.source = 'llm';
  return r;
}
