// Point & Learn — client-side prototype
// Uses TensorFlow.js COCO-SSD to label an object in the camera view,
// then fetches a fun fact from Wikipedia about the top label.

const video = document.getElementById('video');
const canvas = document.getElementById('frame');
const overlay = document.getElementById('overlay');
const btnStart = document.getElementById('btnStart');
const btnScan  = document.getElementById('btnScan');
const btnFlip  = document.getElementById('btnFlip');

const card = document.getElementById('result');
const labelEl = document.getElementById('label');
const confEl = document.getElementById('confidence');
const factEl = document.getElementById('fact');
const sourceEl = document.getElementById('source');

let stream = null;
let model = null;
let facingMode = 'environment'; // 'user' for selfie

// Utility: wait for model, camera, etc.
async function loadModel() {
  if (!model) {
    factEl.textContent = 'Loading AI model…';
    model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    factEl.textContent = 'Model ready. Point at something and tap Scan.';
  }
}

// Start camera with chosen facing mode
async function startCamera() {
  stopCamera();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = stream;
    btnScan.disabled = false;
    btnFlip.disabled = false;
    overlay.classList.remove('hidden');
  } catch (err) {
    console.error(err);
    factEl.textContent = 'Camera permission needed (or not supported over HTTP).';
    card.classList.remove('hidden');
  }
}

// Stop camera
function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

// Turn "person" -> "Person" for nicer titles
function titleCase(s) {
  return s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

// Fetch a short Wikipedia fun fact for a given label
async function fetchFact(label) {
  // Try the label as-is, otherwise try plural/singular fallbacks
  const candidates = [
    label,
    label.endsWith('s') ? label.slice(0, -1) : label + 's'
  ];

  for (const term of candidates) {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&format=json&origin=*`;
    const search = await fetch(searchUrl).then(r => r.json()).catch(() => null);
    const page = search?.query?.search?.[0];
    if (!page) continue;

    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.title)}`;
    const summary = await fetch(summaryUrl).then(r => r.json()).catch(() => null);

    if (summary?.extract) {
      return { text: summary.extract, title: summary.title, url: summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(summary.title)}` };
    }
  }
  return null;
}

// Scan current frame for objects and show fact
async function scanFrame() {
  if (!model) await loadModel();
  if (!stream) {
    factEl.textContent = 'Start the camera first.';
    card.classList.remove('hidden');
    return;
  }

  // Run detection on the <video> element directly
  const predictions = await model.detect(video);

  // Pick highest-confidence prediction above threshold
  const threshold = 0.5;
  const best = predictions
    .filter(p => p.score >= threshold)
    .sort((a, b) => b.score - a.score)[0];

  card.classList.remove('hidden');

  if (!best) {
    labelEl.textContent = 'No clear object';
    confEl.textContent = '';
    factEl.textContent = 'Try getting closer or pointing at something distinct, then Scan again.';
    sourceEl.innerHTML = '';
    return;
  }

  const label = titleCase(best.class);
  labelEl.textContent = label;
  confEl.textContent = `${Math.round(best.score * 100)}%`;

  // Draw a guide box (optional)
  // (bbox = [x, y, width, height]) in video pixels — not drawing to keep UI clean.

  // Get a fun fact
  factEl.textContent = 'Finding a fun fact…';
  sourceEl.innerHTML = '';
  const info = await fetchFact(label.toLowerCase());
  if (info) {
    factEl.textContent = info.text;
    sourceEl.innerHTML = `Source: <a href="${info.url}" target="_blank" rel="noopener">Wikipedia — ${info.title}</a>`;
  } else {
    factEl.textContent = `Couldn't find a quick fact about "${label}". Try another angle or tap Scan again.`;
  }
}

// UI wiring
btnStart.addEventListener('click', async () => {
  await loadModel();
  await startCamera();
});

btnScan.addEventListener('click', scanFrame);

btnFlip.addEventListener('click', async () => {
  facingMode = (facingMode === 'environment') ? 'user' : 'environment';
  await startCamera();
});

// Show the card on load with a hint
window.addEventListener('load', () => {
  card.classList.remove('hidden');
  labelEl.textContent = 'Ready to learn';
  confEl.textContent = '';
  factEl.textContent = 'Tap “Start camera”, point at something, then tap “Scan”.';
  sourceEl.innerHTML = '';
});
