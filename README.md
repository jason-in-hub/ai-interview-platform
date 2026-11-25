# AI Interview Studio · AI 模擬面試室

Coursework prototype of an AI interview platform: industry picker → presence check → live interview with real-time AI probes → four-pillar diagnostic report.

**Live demo:** https://jason-in-hub.github.io/ai-interview-platform/ (use Chrome or Edge for speech recognition)

## Features (mapped to the spec)
| Spec | Implementation |
|---|---|
| Industry & role picker (IB / Consulting / Accounting / Tech & Data / Marketing), EN or 繁中 | `js/data.js`: 3 questions per track in both languages |
| Presence & readiness check | Webcam lighting (luma), face centring (MediaPipe), mic signal, 10-second practice with pace readout |
| Live workspace: 3 questions, each followed by one probe and an insider cue | Split layout. Left: compact video tile plus telemetry HUD. Right: interviewer, question, waveform, probe |
| STAR detection, we/I ownership monitor, pacing engine | `js/heuristics.js`. Note that `我們` is subtracted from the `我` count. Pace band is 160–240 CJK chars/min |
| Post-interview dashboard | Hiring decision, 4-pillar score ring, cohort percentile, strengths (verbatim quotes), deficiencies, before/after rewrite, video replay with per-question seek, and a button that drills the weakest question |
| Prompts | `js/prompts.js` holds the spec's three prompts verbatim; `{placeholders}` are filled at runtime |

## AI engines
- **DeepSeek (recommended for the demo):** the browser calls a Cloudflare Worker (`worker/`), and the Worker calls DeepSeek. The key is stored as a Worker secret, so it never appears in this repo or in the browser.
- **Claude:** each user pastes their own Anthropic key in Settings. The key is kept in that browser's localStorage and sent only to api.anthropic.com.
- **Offline:** a rule-based engine generates the probes and the report. This is the automatic fallback when no engine is configured or an AI call fails.

The presence score (/25) is always computed in code from eye contact, brow tension and pace. The total is computed in code as the three AI pillars plus presence.

### Deploying the DeepSeek proxy (one-time)
```bash
cd worker
npx wrangler login                       # opens a browser to log in to Cloudflare (free plan is enough)
npx wrangler secret put DEEPSEEK_API_KEY # paste the key at the prompt; it is stored encrypted on Cloudflare
npx wrangler deploy                      # prints https://aip-deepseek-proxy.<subdomain>.workers.dev
```
Then paste that URL into `js/config.js` (`DEEPSEEK_PROXY_URL`), commit and push.

Abuse guards: the Worker accepts requests only from the origins listed in `ALLOWED_ORIGINS`, which blocks other websites but not scripted clients. It also enforces a fixed model, a 4,000-token output cap, a 30,000-character input cap, and a best-effort limit of 30 requests per IP every 10 minutes. DeepSeek is prepaid, so keep the account balance small. That caps the worst-case loss.

## Assumptions (not in the spec)
- English pace band: 130–170 words/min.
- Hiring thresholds: Strong Hire ≥ 85, Hire ≥ 70, Lean Hire ≥ 55, otherwise No Hire.
- The cohort percentile is **simulated**, using normal(58, 13). There is no real cohort data.
- Eye contact and brow tension are rough proxies built on MediaPipe blendshapes. They are not validated biometrics.

## Run locally / test
```bash
python3 -m http.server 8000         # then open http://localhost:8000
node test/heuristics.test.mjs       # heuristic engine and prompt rendering
node test/worker.test.mjs           # proxy: origin block, key never leaks, caps, rate limit
node test/e2e.mjs http://localhost:8000/ en   # full flow in headless Chrome (needs puppeteer-core)
```
