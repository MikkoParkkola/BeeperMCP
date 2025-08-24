// Experimental UI layer for BeeperMCP
// Focus: predictive composer, Matrix Vision, conversation energy dynamics.

const el = (sel) => document.querySelector(sel);
const timeline = el('#timeline');
const composer = el('#composer');
const ghost = el('#ghost');
const sendBtn = el('#sendBtn');
const demoBtn = el('#demoBtn');
const connectBtn = el('#connectBtn');
const predTags = el('#predictiveTags');
const dropzone = el('#dropzone');
const visionPanel = el('#visionPanel');
const visionResults = el('#visionResults');
const fileInput = el('#fileInput');
const browseBtn = el('#browseBtn');

// --- In-memory demo messages; backend wiring suggested below.
const demoMessages = [
  { id: 1, me: false, t: Date.now() - 1000 * 60 * 5, text: "How's the timeline looking for the beta?" },
  { id: 2, me: true,  t: Date.now() - 1000 * 60 * 4.2, text: "We’re on track—working on predictive composer now." },
  { id: 3, me: false, t: Date.now() - 1000 * 60 * 3.4, text: "Great! Also curious about the image analysis piece." },
  { id: 4, me: true,  t: Date.now() - 1000 * 60 * 2.5, text: "Matrix Vision will surface insights like tags and colors." },
  { id: 5, me: false, t: Date.now() - 1000 * 60 * 1.2, text: "Love it—can we make the UI react to energy?" },
];

// --- Conversation Energy (client heuristic)
function computeEnergy(messages){
  if (!messages.length) return 0.2;
  // Speed: inverse of avg inter-message gap in last N
  const recent = messages.slice(-8);
  const gaps = [];
  for (let i=1;i<recent.length;i++){ gaps.push(Math.max(1000, recent[i].t - recent[i-1].t)); }
  const avgGap = gaps.length? gaps.reduce((a,b)=>a+b,0)/gaps.length : 60000;
  const speed = Math.min(1, 120000 / avgGap);
  // Excitement: punctuation density and message length variance
  const punct = recent.reduce((s,m)=> s + (m.text.match(/[!\?]/g)?.length||0), 0) / Math.max(1,recent.length);
  const meanLen = recent.reduce((s,m)=> s + m.text.length, 0) / recent.length;
  const varLen = recent.reduce((s,m)=> s + Math.pow(m.text.length - meanLen, 2), 0) / recent.length;
  const excitement = Math.min(1, (punct/2) + (Math.sqrt(varLen)/80));
  return Math.max(.1, Math.min(1, (speed*0.6 + excitement*0.4)));
}

function applyEnergyToUI(energy){
  const root = document.documentElement;
  // Adjust aurora opacity and blur subtly
  const bg = document.querySelector('.bg-aurora');
  bg.style.opacity = String(0.25 + energy*0.25);
  bg.style.filter = `blur(${24 + energy*28}px) saturate(${120 + energy*60}%)`;
  // Live dot pulse speed
  const live = document.querySelector('.live-energy');
  live.style.animationDuration = `${2.4 - energy*1.4}s`;
}

// --- Predictive Composer (local n-gram learner)
class PredictEngine {
  constructor(){
    this.ngrams = new Map(); // key: prefix\n => scores map
    this.maxN = 3;
  }
  learn(text){
    const words = text.split(/\s+/).filter(Boolean);
    for (let i=0; i<words.length; i++){
      for (let n=1; n<=this.maxN; n++){
        if (i+n > words.length-1) break;
        const prefix = words.slice(i, i+n).join(' ').toLowerCase();
        const next = words[i+n].toLowerCase();
        const entry = this.ngrams.get(prefix) || new Map();
        entry.set(next, (entry.get(next)||0) + 1);
        this.ngrams.set(prefix, entry);
      }
    }
  }
  suggest(input){
    const words = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
    for (let n=Math.min(this.maxN, words.length); n>0; n--){
      const prefix = words.slice(-n).join(' ');
      const entry = this.ngrams.get(prefix);
      if (entry){
        // choose highest score; return phrase completion up to 3 words
        const best = [...entry.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([w])=>w);
        return best.join(' ');
      }
    }
    return '';
  }
}
const PRED = new PredictEngine();

// Seed learning from demo data
demoMessages.forEach(m => PRED.learn(m.text));

function renderPredictiveTags(){
  // Surface top phrases from n-gram keys for UI flair
  const items = [];
  for (const [k,v] of PRED.ngrams.entries()){
    const common = [...v.entries()].sort((a,b)=>b[1]-a[1])[0];
    if (common && k.split(' ').length >= 2){ items.push(`${k} ${common[0]}`); }
    if (items.length > 10) break;
  }
  predTags.innerHTML = items.map(t => `<li>${t}</li>`).join('');
}

function addMessage({ me, text }){
  const id = Math.random().toString(36).slice(2);
  const elMsg = document.createElement('div');
  elMsg.className = 'msg';
  elMsg.innerHTML = `
    <div class="avatar" aria-hidden="true"></div>
    <div class="bubble ${me ? 'me' : ''}">${text}</div>
  `;
  timeline.appendChild(elMsg);
  timeline.scrollTop = timeline.scrollHeight;
  const t = Date.now();
  demoMessages.push({ id, me, text, t });
  applyEnergyToUI(computeEnergy(demoMessages));
  // learn local style
  PRED.learn(text);
  renderPredictiveTags();
}

function renderInitial(){
  timeline.innerHTML = '';
  demoMessages.forEach(m => addMessage(m));
}

// Composer events: autosize + ghost prediction
composer.addEventListener('input', () => {
  composer.style.height = 'auto';
  composer.style.height = Math.min(180, composer.scrollHeight) + 'px';
  const s = PRED.suggest(composer.value);
  ghost.textContent = s ? composer.value + ' ' + s : '';
});

composer.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && ghost.textContent){
    e.preventDefault();
    composer.value = ghost.textContent;
    ghost.textContent = '';
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter'){
    e.preventDefault();
    sendBtn.click();
  }
});

sendBtn.addEventListener('click', () => {
  const text = composer.value.trim();
  if (!text) return;
  addMessage({ me:true, text });
  composer.value = '';
  ghost.textContent = '';
});

// Demo driver: add a playful incoming message
demoBtn.addEventListener('click', () => {
  const replies = [
    'Sharing a quick mock—let me know vibe ✨',
    'The energy visual reacts nicely here!',
    'We could try a softer easing on bubbles.',
    'Vision found text inside that screenshot, cool.',
  ];
  const text = replies[Math.floor(Math.random()*replies.length)];
  setTimeout(()=> addMessage({ me:false, text }), 480 + Math.random()*220);
});

// "Connect" placeholder (future: wire to MCP HTTP auth + resources)
connectBtn.addEventListener('click', async () => {
  alert('Backend integration required: authenticate to MCP HTTP server and stream room history for training. See suggestions at bottom of page source.');
});

// --- Matrix Vision (client-side lightweight)
function handleDropState(active){
  dropzone.classList.toggle('drag', !!active);
}
['dragenter','dragover'].forEach(ev => dropzone.addEventListener(ev, (e)=>{e.preventDefault(); handleDropState(true);}));
['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, (e)=>{e.preventDefault(); handleDropState(false);}));
dropzone.addEventListener('drop', (e)=>{
  const f = e.dataTransfer?.files?.[0]; if (f) analyzeFile(f);
});
browseBtn.addEventListener('click', ()=> fileInput.click());
fileInput.addEventListener('change', ()=>{
  const f = fileInput.files?.[0]; if (f) analyzeFile(f);
});

async function analyzeFile(file){
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = async () => {
    const colors = dominantColors(img);
    const metrics = basicImageStats(img);
    const tags = heuristicTags(colors, metrics);
    visionResults.innerHTML = `
      <img class="thumb" src="${url}" alt="preview"/>
      <div class="tags">${tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div>
      <div class="meta">${Math.round(img.naturalWidth)}×${Math.round(img.naturalHeight)} · ${colors.map(c=>rgbToHex(c)).join(' ')}</div>
    `;
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function dominantColors(image){
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = canvas.width = 160; const h = canvas.height = Math.max(1, Math.floor(160*image.naturalHeight/image.naturalWidth));
  ctx.drawImage(image, 0, 0, w, h);
  const data = ctx.getImageData(0,0,w,h).data;
  const buckets = new Map();
  for (let i=0; i<data.length; i+=4){
    const r = data[i]>>4, g = data[i+1]>>4, b = data[i+2]>>4;
    const k = (r<<8)|(g<<4)|b; buckets.set(k, (buckets.get(k)||0)+1);
  }
  const top = [...buckets.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k])=>[(k>>8)&0xF,(k>>4)&0xF,k&0xF].map(v=>v*16+8));
  return top;
}
function basicImageStats(image){
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = canvas.width = 120; const h = canvas.height = Math.max(1, Math.floor(120*image.naturalHeight/image.naturalWidth));
  ctx.drawImage(image, 0, 0, w, h);
  const data = ctx.getImageData(0,0,w,h).data;
  let edges=0, bright=0; const gray = new Uint8Array(w*h);
  for (let i=0, p=0; i<data.length; i+=4, p++){
    gray[p] = (data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114)|0;
    if (data[i] > 220 || data[i+1] > 220 || data[i+2] > 220) bright++;
  }
  // Cheap edge estimate
  for (let y=1; y<h-1; y++){
    for (let x=1; x<w-1; x++){
      const i = y*w + x;
      const dx = Math.abs(gray[i-1]-gray[i+1]);
      const dy = Math.abs(gray[i-w]-gray[i+w]);
      if ((dx+dy) > 80) edges++;
    }
  }
  return { edges: edges/(w*h), bright: bright/(w*h) };
}
function heuristicTags(colors, metrics){
  const tags = [];
  const [c1,c2,c3] = colors;
  const sat = (c)=>{ const m=Math.max(...c), n=Math.min(...c); return m? (m-n)/m:0 };
  const s = [sat(c1||[0,0,0]), sat(c2||[0,0,0]), sat(c3||[0,0,0])].reduce((a,b)=>a+b,0)/3;
  if (s > .35) tags.push('Vivid'); else tags.push('Muted');
  if (metrics.edges > .15) tags.push('High detail'); else tags.push('Soft');
  if (metrics.bright > .2) tags.push('Bright');
  // Hue-ish names
  const hueName = (c)=>{
    const [r,g,b]=c; if (r>g&&r>b) return 'Red-ish'; if (g>r&&g>b) return 'Green-ish'; if (b>r&&b>g) return 'Blue-ish'; return 'Neutral'; };
  [c1,c2,c3].filter(Boolean).forEach(c=> tags.push(hueName(c)) );
  return [...new Set(tags)];
}
function rgbToHex([r,g,b]){ return `#${[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('')}`}

// Kick off
renderInitial();
renderPredictiveTags();
applyEnergyToUI(computeEnergy(demoMessages));

// --- Backend integration plan (for maintainers):
// 1) Serve this UI from MCP HTTP server at /ui (added in server patch).
// 2) Add REST helpers in server to expose:
//    - GET /ui/api/history?room=...&limit=... -> recent messages from SQLite logs
//    - POST /ui/api/predict        -> optional server-side LLM-assisted suggestions
//    - POST /ui/api/vision/analyze -> optional server-side multimodal analysis
// 3) In app.js, replace demoMessages with fetched history; feed PRED.learn() on connect.
// 4) Optionally stream activity via SSE at /ui/api/stream for real-time energy dynamics.

