// Optional face telemetry via MediaPipe FaceLandmarker blendshapes. Any failure leaves telemetry null.
// Assets are fetched with streaming progress (≈2.0 MB brotli WASM + 3.8 MB model) so the UI can show a real progress bar;
// MediaPipe then reads them from memory instead of downloading again.
const VER = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
// Weights = approximate bytes on the wire; DECODED = decoded size (the WASM is brotli-encoded, so Content-Length is not usable).
const PARTS = { wasm: { url: `${CDN}/wasm/vision_wasm_internal.wasm`, wire: 2.0e6, decoded: 9.42e6 }, model: { url: MODEL, wire: 3.76e6, decoded: 3.76e6 } };

export const faceStatus = { state: 'idle', pct: 0, mb: 0, totalMb: (PARTS.wasm.wire + PARTS.model.wire) / 1e6 };
const frac = { wasm: 0, model: 0 };
function update() {
  const wire = frac.wasm * PARTS.wasm.wire + frac.model * PARTS.model.wire;
  faceStatus.mb = wire / 1e6;
  faceStatus.pct = Math.min(99, Math.round(wire / (PARTS.wasm.wire + PARTS.model.wire) * 100));
}

async function fetchWithProgress(key) {
  const p = PARTS[key];
  const res = await fetch(p.url);
  if (!res.ok || !res.body) throw new Error(key + ' HTTP ' + res.status);
  const enc = res.headers.get('content-encoding');
  const total = !enc && +res.headers.get('content-length') || p.decoded;
  const reader = res.body.getReader(), chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    frac[key] = Math.min(0.99, got / total); update();
  }
  frac[key] = 1; update();
  return new Blob(chunks);
}

let landmarker = null, loading = null;
export function faceReady() { return !!landmarker; }

export async function loadFace() {
  if (landmarker) return landmarker;
  if (!loading) loading = (async () => {
    faceStatus.state = 'loading';
    const [{ FaceLandmarker }, wasmBlob, modelBlob] = await Promise.all([
      import(`${CDN}/vision_bundle.mjs`), fetchWithProgress('wasm'), fetchWithProgress('model'),
    ]);
    faceStatus.state = 'init';
    const fileset = { wasmLoaderPath: `${CDN}/wasm/vision_wasm_internal.js`, wasmBinaryPath: URL.createObjectURL(new Blob([wasmBlob], { type: 'application/wasm' })) };
    const modelAssetBuffer = new Uint8Array(await modelBlob.arrayBuffer());
    const opts = delegate => ({ baseOptions: { modelAssetBuffer, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true });
    try { landmarker = await FaceLandmarker.createFromOptions(fileset, opts('GPU')); }
    catch { landmarker = await FaceLandmarker.createFromOptions(fileset, opts('CPU')); }  // some mobile GPUs lack WebGL2 support
    faceStatus.state = 'ready'; faceStatus.pct = 100;
    return landmarker;
  })().catch(e => { console.warn('Face telemetry unavailable:', e); faceStatus.state = 'failed'; loading = null; return null; });
  return loading;
}

// Returns {face, centered, eyeContact, browTension} for one frame, or null when not ready.
export function analyseFrame(video) {
  if (!landmarker || video.readyState < 2) return null;
  const r = landmarker.detectForVideo(video, performance.now());
  if (!r.faceLandmarks?.length) return { face: false };
  const bs = Object.fromEntries((r.faceBlendshapes?.[0]?.categories || []).map(c => [c.categoryName, c.score]));
  const nose = r.faceLandmarks[0][1];
  const centered = nose.x > 0.3 && nose.x < 0.7 && nose.y > 0.25 && nose.y < 0.75;
  const gaze = Math.max(bs.eyeLookOutLeft || 0, bs.eyeLookInLeft || 0, bs.eyeLookUpLeft || 0, bs.eyeLookDownLeft || 0,
    bs.eyeLookOutRight || 0, bs.eyeLookInRight || 0, bs.eyeLookUpRight || 0, bs.eyeLookDownRight || 0);
  const brow = ((bs.browDownLeft || 0) + (bs.browDownRight || 0)) / 2;
  return { face: true, centered, eyeContact: centered && gaze < 0.45, browTension: brow > 0.3 };
}

export function brightness(video, canvas) {
  if (video.readyState < 2) return null;
  const w = 64, h = 48; canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return Math.round(sum / (w * h));
}
