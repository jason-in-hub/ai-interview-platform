import assert from 'node:assert/strict';
import { ownership, star, pace, paceStatus, heuristicProbe, probeLimitOk, presenceScore, heuristicReport, decision, speechUnits, faceSummary } from '../js/heuristics.js';
import { buildProbePrompt, buildReportPrompt } from '../js/prompts.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('zh ownership subtracts 我們 from 我', () => { const o = ownership('我們我們我', 'zh'); assert.equal(o.we, 2); assert.equal(o.i, 1); });
t('naive count would fail (known-bad oracle)', () => { assert.notEqual(('我們我們我'.match(/我/g) || []).length, 1); });
t('en ownership word boundaries', () => { const o = ownership('We shipped it; I wrote the model. Our team, my code, use.', 'en'); assert.equal(o.we, 2); assert.equal(o.i, 2); });
t('STAR zh', () => { assert.deepEqual(star('當時我負責報表，我決定自動化，最終節省30%時間', 'zh'), { S: true, T: true, A: true, R: true }); assert.deepEqual(star('我覺得還好', 'zh'), { S: false, T: false, A: false, R: false }); });
t('pace zh counts CJK only', () => { assert.equal(speechUnits('我們，今日 OK！', 'zh'), 5); assert.equal(pace('一'.repeat(200), 60, 'zh'), 200); assert.equal(paceStatus(150, 'zh'), 'slow'); assert.equal(paceStatus(250, 'zh'), 'fast'); assert.equal(paceStatus(200, 'zh'), 'ok'); });
t('probe: we-heavy answer triggers ownership probe with quote', () => {
  const p = heuristicProbe('當時我們團隊負責一個大型項目，我們花了很多時間處理數據，我們最後完成了報告，老闆覺得很好。', 'zh');
  assert.match(p.probe, /「.*我們.*」/); assert.ok(probeLimitOk(p.probe, 'zh'), p.probe);
});
t('probe: no numbers triggers metric probe (en)', () => {
  const p = heuristicProbe('I led the redesign of our onboarding flow and I convinced the product team to drop two steps, which made users happier overall.', 'en');
  assert.match(p.probe, /number/); assert.ok(probeLimitOk(p.probe, 'en'));
});
t('presence: perfect telemetry = 25, none = 12.5', () => { assert.equal(presenceScore({ eye: 90, brow: 5, pace: 200 }, 'zh'), 25); assert.equal(presenceScore({}, 'zh'), 12.5); assert.ok(presenceScore({ eye: 20, brow: 60, pace: 80 }, 'zh') < 8); });
t('report differentiates strong vs empty answers', () => {
  const kw = ['model', 'client', 'revenue'];
  const strong = heuristicReport([{ answer: 'When I was an intern, I was responsible for the client revenue model. I decided to rebuild it in Python and I automated the reconciliation, which cut errors by 40% and saved 6 hours a week. The trade-off was a 2-day delay, but the risk was worth it.', probeAnswer: 'I personally wrote 300 lines and reduced runtime from 20 to 3 minutes.' }], 'en', kw, { presence: 20 });
  const weak = heuristicReport([{ answer: 'We did a project. It was good.', probeAnswer: '' }], 'en', kw, { presence: 20 });
  assert.ok(strong.questionScores[0] - weak.questionScores[0] > 40, JSON.stringify([strong.questionScores, weak.questionScores]));
  assert.equal(decision(86), 'Strong Hire'); assert.equal(decision(54), 'No Hire');
});
t('prompts: verbatim template + rendered transcript', () => {
  const ctx = { interviewer_title: 'MD', industry: 'IB', role: 'Analyst', lang: 'zh' };
  const p = buildProbePrompt(ctx, 'Q?', 'A!');
  assert.match(p.system, /senior hiring manager \(MD\)/); assert.match(p.user, /^\[CONTEXT\]/); assert.match(p.user, /"probe"/);
  const r = buildReportPrompt(ctx, [{ question: 'Q1', answer: 'A1', probe: 'P1', probeAnswer: 'PA1' }, { question: 'Q2', answer: 'A2' }], { eye: 70, brow: 10, pace: 200, presence: 20 });
  assert.match(r.user, /- Question 2: Q2/); assert.doesNotMatch(r.user, /\{q1_text\}|\{full_interview_transcript\}/); assert.match(r.user, /200 chars\/min/);
});
t('face telemetry: never seeing a face means unmeasured, not 0%', () => {
  assert.deepEqual(faceSummary({ frames: 100, faceFrames: 0, eyeFrames: 0, browFrames: 0 }), { eye: null, brow: null });
  assert.deepEqual(faceSummary({ frames: 100, faceFrames: 80, eyeFrames: 60, browFrames: 8 }), { eye: 60, brow: 10 });
});
console.log(n, 'tests passed');
