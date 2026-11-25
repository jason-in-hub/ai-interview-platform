// Offline analysis engine: live telemetry heuristics + rule-based probe and report.
// Used live during the interview, and as the full fallback when no API key is set or the LLM call fails.

const CJK_RE = /[\u{3400}-\u{9fff}\u{f900}-\u{faff}]/gu;
const count = (s, re) => (s.match(re) || []).length;

export const PACE_BAND = { zh: [160, 240], en: [130, 170] }; // en band is our assumption (words/min)
export const PACE_UNIT = { zh: 'chars/min', en: 'words/min' };

export function speechUnits(text, lang) {
  if (!text) return 0;
  return lang === 'zh' ? count(text, CJK_RE) + count(text, /[A-Za-z]+/g) : count(text, /[A-Za-z0-9'%$.-]+/g);
}

export function pace(text, seconds, lang) {
  if (!seconds || seconds < 3) return null;
  return Math.round(speechUnits(text, lang) / (seconds / 60));
}

export function paceStatus(p, lang) {
  if (p == null) return 'idle';
  const [lo, hi] = PACE_BAND[lang];
  return p < lo ? 'slow' : p > hi ? 'fast' : 'ok';
}

// "我們"/"我哋" both contain "我", so collective forms are counted first and subtracted.
export function ownership(text, lang) {
  if (!text) return { we: 0, i: 0, weShare: null };
  let we, i;
  if (lang === 'zh') {
    we = count(text, /我們|我哋|咱們|我地/g);
    i = count(text, /我/g) - we;
    we += count(text, /\b(we|our|us)\b/gi);
    i += count(text, /\b(i|my|me)\b/gi);
  } else {
    we = count(text, /\b(we|our|ours|us|we're|we've)\b/gi);
    i = count(text, /\b(i|my|mine|me|i'm|i've|i'd)\b/gi);
  }
  return { we, i, weShare: we + i ? we / (we + i) : null };
}

const STAR = {
  zh: {
    S: /當時|背景|那時|當年|情況|起初|之前|曾經/,
    T: /負責|目標|任務|職責|需要|要求|挑戰/,
    A: /我決定|主動|分析|我提出|我設計|我建立|我負責|推動|執行|我用|我寫|我做|我先|我帶領|我說服/,
    R: /最終|提升|百分|%|增加|減少|節省|結果|成功|達到|改善|降低|增長/,
  },
  en: {
    S: /\b(when|at the time|background|context|situation|last (year|summer)|during|while i was)\b/i,
    T: /\b(responsible|goal|task|objective|target|needed to|had to|my job|challenge)\b/i,
    A: /\bi (decided|led|built|analy[sz]ed|proposed|designed|created|wrote|ran|negotiated|convinced|started|automated|identified|reached out)\b|\b(initiated|implemented|took ownership)\b/i,
    R: /\b(result|ultimately|increased|reduced|improved|saved|percent|grew|cut|achieved|led to|outcome)\b|%/i,
  },
};

export function star(text, lang) {
  const m = STAR[lang];
  return { S: m.S.test(text || ''), T: m.T.test(text || ''), A: m.A.test(text || ''), R: m.R.test(text || '') };
}

const NUM_RE = /\d+(?:[.,]\d+)*|%|百分|倍|萬|億|千|一半|兩成|三成|half|double|twice|million|billion|thousand/gi;
const TRADEOFF_RE = /\b(but|however|trade-?off|risk|cost|instead|prioriti[sz]ed?|versus|vs\.?|although|margin|compet)\w*|權衡|風險|成本|但是|不過|取捨|優先|競爭|利潤|然而/gi;

export function numbers(text) { return count(text || '', NUM_RE); }

// ---------- Executive presence (computed in code, never by the LLM) ----------
// eye: 0-10 (>=75% full marks), brow tension: 0-7 (<=10% full marks), pace: 0-8 (in band full marks).
export function presenceScore({ eye, brow, pace: p }, lang) {
  const parts = [];
  if (eye != null) parts.push({ w: 10, v: 10 * clamp(eye / 75) });
  if (brow != null) parts.push({ w: 7, v: 7 * (1 - clamp((brow - 10) / 50)) });
  if (p != null) {
    const [lo, hi] = PACE_BAND[lang];
    const dev = p < lo ? (lo - p) / lo : p > hi ? (p - hi) / hi : 0;
    parts.push({ w: 8, v: 8 * (1 - clamp(dev / 0.5)) });
  }
  if (!parts.length) return 12.5; // no telemetry: neutral midpoint
  const w = parts.reduce((a, b) => a + b.w, 0), v = parts.reduce((a, b) => a + b.v, 0);
  return Math.round((v / w) * 25 * 10) / 10;
}

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

// ---------- Rule-based probe ----------
export function sentences(text) {
  return (text || '').split(/(?<=[。！？!?.;；\n])\s*/).map(s => s.trim()).filter(Boolean);
}

function snippet(s, lang, max) {
  s = (s || '').replace(/^[，,、\s]+|[。！？!?.,，；;\s]+$/g, '');
  if (lang === 'zh') {
    const parts = s.split(/[，,、]/).filter(Boolean);
    const pick = parts.find(p => /我們|我哋/.test(p)) || parts[0] || s;
    return [...pick].slice(0, max).join('');
  }
  return s.split(/\s+/).slice(0, max).join(' ');
}

export function probeLimitOk(probe, lang) {
  if (!probe) return false;
  return lang === 'zh' ? [...probe].length <= 45 : probe.trim().split(/\s+/).length <= 25;
}

export function heuristicProbe(answer, lang) {
  const zh = lang === 'zh';
  const text = (answer || '').trim();
  const units = speechUnits(text, lang);
  const own = ownership(text, lang);
  const st = star(text, lang);
  const sents = sentences(text);
  const weSent = sents.find(s => (zh ? /我們|我哋/ : /\b(we|our)\b/i).test(s));
  const vagueSent = sents.find(s => numbers(s) === 0) || sents[0] || '';
  const q = s => snippet(s, lang, zh ? 12 : 7);
  let probe, cue;
  if (units < (zh ? 25 : 15)) {
    probe = zh ? '請給我一個具體例子：時間、你的角色、結果。' : 'Give me one concrete example: when, your role, the result.';
    cue = zh ? '測試你能否講出具體案例' : 'Testing for a real example';
  } else if (own.we >= 2 && own.weShare > 0.5 && weSent) {
    probe = zh ? `你說「${q(weSent)}」——你個人做了哪個決定？` : `You said "${q(weSent)}" — which decision was yours?`;
    cue = zh ? '「我們」太多，測試個人貢獻' : 'Too much "we": testing ownership';
  } else if (numbers(text) === 0) {
    probe = zh ? `「${q(vagueSent)}」——具體數字是多少？` : `"${q(vagueSent)}" — what was the number?`;
    cue = zh ? '測試你能否量化成果' : 'Testing quantified impact';
  } else if (!st.R) {
    probe = zh ? '最終結果是什麼？跟基準比較如何？' : 'What was the final result versus the baseline?';
    cue = zh ? '測試你是否追蹤結果' : 'Testing whether you track outcomes';
  } else if (!st.A) {
    probe = zh ? `「${q(sents[0])}」之後，你具體做了什麼？` : `After "${q(sents[0])}", what exactly did you do?`;
    cue = zh ? '測試行動是否清晰' : 'Testing clarity of your actions';
  } else {
    probe = zh ? '如果重來，你會放棄什麼？為什麼？' : 'If you did it again, what would you trade off, and why?';
    cue = zh ? '測試判斷力與取捨邏輯' : 'Testing judgement and trade-offs';
  }
  return { probe, cue, source: 'heuristic' };
}

// ---------- Rule-based report ----------
function scoreAnswer(text, lang, keywords) {
  const units = speechUnits(text, lang);
  const st = star(text, lang);
  const own = ownership(text, lang);
  const lenF = clamp(units / (lang === 'zh' ? 180 : 110));
  const starHits = Object.values(st).filter(Boolean).length;
  const structure = 25 * (0.75 * starHits / 4 + 0.25 * lenF) * (units < 10 ? 0.3 : 1);
  const lower = (text || '').toLowerCase();
  const kw = keywords.filter(k => lower.includes(k)).length;
  const trade = count(text || '', TRADEOFF_RE);
  const commercial = 25 * clamp(0.15 + 0.15 * kw + 0.12 * trade) * (0.4 + 0.6 * lenF);
  const nums = numbers(text);
  const ownBonus = own.weShare == null ? 0.5 : 1 - own.weShare;
  const impact = 25 * clamp(0.1 + 0.22 * nums) * (0.6 + 0.4 * ownBonus) * (0.5 + 0.5 * lenF);
  return { structure, commercial, impact, units, st, own, nums };
}

export function decision(total) {
  return total >= 85 ? 'Strong Hire' : total >= 70 ? 'Hire' : total >= 55 ? 'Lean Hire' : 'No Hire';
}

// Simulated cohort: normal(mean 58, sd 13). Not real cohort data.
export function cohortPercentile(total) {
  const z = (total - 58) / 13;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return Math.round(p * 100);
}

export function heuristicReport(qa, lang, keywords, tele) {
  const zh = lang === 'zh';
  const per = qa.map(x => scoreAnswer([x.answer, x.probeAnswer].filter(Boolean).join(' '), lang, keywords));
  const avg = k => Math.round(per.reduce((a, b) => a + b[k], 0) / per.length);
  const s = avg('structure'), c = avg('commercial'), i = avg('impact');
  const questionScores = per.map(p => Math.round((p.structure + p.commercial + p.impact) / 75 * 100));
  const all = qa.flatMap(x => sentences([x.answer, x.probeAnswer].filter(Boolean).join('\n')));
  const rankS = t => numbers(t) * 2 + (ownership(t, lang).i > 0 ? 1 : 0) + (star(t, lang).A ? 1 : 0);
  const best = [...all].sort((a, b) => rankS(b) - rankS(a)).filter(t => rankS(t) >= 2).slice(0, 2);
  const weakest = [...all].sort((a, b) => (rankS(a) - rankS(b)) || (b.length - a.length))[0] || '';
  const starAvg = (per.reduce((a, b) => a + Object.values(b.st).filter(Boolean).length, 0) / per.length).toFixed(1);
  const numTotal = per.reduce((a, b) => a + b.nums, 0);

  const strengths = best.map(t => ({
    title: numbers(t) ? (zh ? '有數字支持的成果' : 'Quantified outcome') : (zh ? '清晰的個人行動' : 'Clear personal action'),
    quote: t,
  }));
  const improvements = [];
  if (i < 15) improvements.push({ title: zh ? '缺乏量化證據' : 'Thin quantitative evidence', detail: zh ? '大部分陳述沒有數字，委員會無法判斷影響規模。' : 'Most claims carry no number, so the committee cannot size your impact.' });
  const weShare = ownership(qa.map(x => x.answer + ' ' + (x.probeAnswer || '')).join(' '), lang).weShare;
  if (weShare != null && weShare > 0.5) improvements.push({ title: zh ? '個人貢獻模糊' : 'Ownership unclear', detail: zh ? '「我們」多於「我」，難以分辨你的個人決策。' : '"We" outnumbers "I", so your individual decisions are hard to isolate.' });
  if (s < 15) improvements.push({ title: zh ? 'STAR結構不完整' : 'Incomplete STAR structure', detail: zh ? '情境、行動或結果欠缺，故事難以跟隨。' : 'Situation, action or result is missing, so the story is hard to follow.' });
  if (c < 13) improvements.push({ title: zh ? '商業語境不足' : 'Limited commercial context', detail: zh ? '少有提及取捨、成本或行業現實。' : 'Few references to trade-offs, cost or industry realities.' });
  if (!improvements.length) improvements.push({ title: zh ? '加入取捨分析' : 'Add trade-off reasoning', detail: zh ? '說明你放棄了什麼，能展示更高層次的判斷。' : 'Naming what you gave up shows senior-level judgement.' });

  const rewrite = {
    before: weakest,
    after: zh
      ? '當時我負責[具體範圍]。我分析了[數據/問題]後，決定[你的具體行動]，最終令[指標]由[基準]提升至[結果]（[X]%）。'
      : 'I owned [scope]. After analysing [data/problem], I decided to [specific action], which moved [metric] from [baseline] to [result] ([X]%).',
    note: zh ? '離線模式提供結構模板：以「我」開頭、加入基準與結果數字。連接 API 可得個人化改寫。' : 'Offline mode gives a structural template: lead with "I", add a baseline and a result number. Connect an API key for a personalised rewrite.',
  };
  return {
    structure: { score: s, comment: zh ? `平均覆蓋 ${starAvg}/4 個STAR元素。` : `Covered ${starAvg}/4 STAR elements on average.` },
    commercial: { score: c, comment: zh ? '根據行業詞彙與取捨語句的密度評分。' : 'Scored on density of industry vocabulary and trade-off language.' },
    impact: { score: i, comment: zh ? `全場共 ${numTotal} 個量化數據點。` : `${numTotal} quantified data points across the interview.` },
    presenceComment: presenceText(tele, lang), strengths, improvements, rewrite, questionScores, source: 'heuristic',
  };
}

export function presenceText(tele, lang) {
  const zh = lang === 'zh';
  const bits = [];
  if (tele.eye != null) bits.push(zh ? `眼神接觸 ${tele.eye}%` : `eye contact ${tele.eye}%`);
  if (tele.brow != null) bits.push(zh ? `皺眉比率 ${tele.brow}%` : `brow tension ${tele.brow}%`);
  if (tele.pace != null) bits.push(zh ? `語速 ${tele.pace} 字/分鐘` : `pace ${tele.pace} wpm`);
  if (!bits.length) return zh ? '未有鏡頭或語音數據，表現分數取中位數。' : 'No camera or speech telemetry; presence set to the neutral midpoint.';
  return (zh ? '表現數據：' : 'Delivery telemetry: ') + bits.join(zh ? '，' : ', ') + (zh ? '。' : '.');
}
