// A malformed AI reply must reject (app.js then falls back to the offline engine). The bad payload below was seen once from the live proxy.
import assert from 'node:assert/strict';
import { llmProbe } from '../js/llm.js';
const ctx = { lang: 'en', industry: 'x', role: 'y', interviewer_title: 'z' };
const reply = text => { globalThis.fetch = async () => Response.json({ text }); };
reply('{"ok": For true}');
await assert.rejects(llmProbe({ provider: 'deepseek' }, ctx, 'q', 'a'), SyntaxError);
reply('{"probe":"What number?","cue":"impact"}');
assert.equal((await llmProbe({ provider: 'deepseek' }, ctx, 'q', 'a')).source, 'llm');
console.log('llm tests passed');
