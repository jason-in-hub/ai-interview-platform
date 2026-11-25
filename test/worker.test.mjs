// Unit test for the DeepSeek proxy Worker with a stubbed upstream.
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
const env = { ALLOWED_ORIGINS: 'https://jason-in-hub.github.io', DEEPSEEK_API_KEY: 'sk-SECRET-123', DEEPSEEK_MODEL: 'deepseek-chat' };
let upstream;
globalThis.fetch = async (url, init) => { upstream = { url, init }; return Response.json({ choices: [{ message: { content: '{"probe":"p","cue":"c"}' } }] }); };
const req = (origin, body = { system: 's', user: 'u', maxTokens: 99999 }, path = '/chat') => new Request('https://w.dev' + path, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': origin }, body: JSON.stringify(body) });

let r = await worker.fetch(req('https://evil.example'), env);
assert.equal(r.status, 403, 'foreign origin must be rejected');
r = await worker.fetch(req('https://jason-in-hub.github.io'), env);
assert.equal(r.status, 200);
const txt = await r.text();
assert.ok(!txt.includes('sk-SECRET'), 'key must not leak in response');
assert.equal(JSON.parse(txt).text, '{"probe":"p","cue":"c"}');
assert.equal(upstream.init.headers.authorization, 'Bearer sk-SECRET-123');
assert.equal(JSON.parse(upstream.init.body).max_tokens, 4000, 'max_tokens capped');
r = await worker.fetch(req('https://jason-in-hub.github.io', { system: 1 }), env);
assert.equal(r.status, 400);
for (let i = 0; i < 40; i++) r = await worker.fetch(req('https://jason-in-hub.github.io'), env);
assert.equal(r.status, 429, 'rate limit');
console.log('worker tests passed');
