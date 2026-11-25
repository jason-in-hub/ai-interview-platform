// Optional face telemetry via MediaPipe FaceLandmarker blendshapes. Any failure leaves telemetry null.
const VER = '0.10.14';
let landmarker = null, loading = null;

export async function loadFace() {
  if (landmarker) return landmarker;
  if (!loading) loading = (async () => {
    const { FaceLandmarker, FilesetResolver } = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/vision_bundle.mjs`);
    const fs = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/wasm`);
    const opts = delegate => ({
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate },
      runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
    });
    try { landmarker = await FaceLandmarker.createFromOptions(fs, opts('GPU')); }
    catch { landmarker = await FaceLandmarker.createFromOptions(fs, opts('CPU')); }  // some mobile GPUs lack WebGL2 support
    return landmarker;
  })().catch(e => { console.warn('Face telemetry unavailable:', e); loading = null; return null; });
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
