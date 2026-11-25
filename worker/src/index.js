// Cloudflare Worker: DeepSeek proxy. The API key is a Worker secret (wrangler secret put DEEPSEEK_API_KEY)
// and never leaves Cloudflare. Guards: origin allow-list, fixed model, capped tokens/input, per-IP rate limit.
const RATE = new Map(); // best-effort, per isolate
const LIMIT = 30, WINDOW_MS = 10 * 60 * 1000;

export default {
  async fetch(req, env) {
    const origin = req.headers.get('origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = { 'access-control-allow-origin': okOrigin ? origin : allowed[0] || '', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' };
    if (req.method === 'OPTIONS') return new Response(null, { status: okOrigin ? 204 : 403, headers: cors });
    const url = new URL(req.url);
    if (req.method !== 'POST' || url.pathname !== '/chat') return new Response('Not found', { status: 404, headers: cors });
    if (!okOrigin) return new Response('Forbidden origin', { status: 403, headers: cors });

    const ip = req.headers.get('cf-connecting-ip') || 'unknown', now = Date.now();
    const hits = (RATE.get(ip) || []).filter(t => now - t < WINDOW_MS);
    if (hits.length >= LIMIT) return new Response('Rate limited', { status: 429, headers: cors });
    hits.push(now); RATE.set(ip, hits);

    let body;
    try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400, headers: cors }); }
    const { system, user } = body;
    if (typeof system !== 'string' || typeof user !== 'string' || system.length + user.length > 30000) return new Response('Bad request', { status: 400, headers: cors });
    const maxTokens = Math.min(Number(body.maxTokens) || 2000, 4000);

    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.DEEPSEEK_API_KEY },
      body: JSON.stringify({ model: env.DEEPSEEK_MODEL || 'deepseek-chat', max_tokens: maxTokens, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    if (!r.ok) return new Response('Upstream ' + r.status, { status: 502, headers: cors });
    const data = await r.json();
    return Response.json({ text: data.choices?.[0]?.message?.content || '' }, { headers: cors });
  },
};
