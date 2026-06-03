// ── CONFIG ────────────────────────────────────────────────────────────────────
let config = {
  apiUrl: localStorage.getItem('apiUrl') || '',
  apiKey: localStorage.getItem('apiKey') || '',
  theme:  localStorage.getItem('theme')  || 'dark',
};

// ── THEME ─────────────────────────────────────────────────────────────────────
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  config.theme = t;
  document.getElementById('themeDark').classList.toggle('active',  t === 'dark');
  document.getElementById('themeLight').classList.toggle('active', t === 'light');
}
applyTheme(config.theme);

// ── NAVIGATION ────────────────────────────────────────────────────────────────
let currentScreen = 'orb';
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  document.querySelector(`[data-screen="${id}"]`).classList.add('active');
  currentScreen = id;
  if (id === 'notes')     loadNotes();
  if (id === 'reminders') loadReminders();
  if (id === 'settings')  loadSettings();
}
document.querySelectorAll('.nav-btn').forEach(b => {
  b.addEventListener('click', () => showScreen(b.dataset.screen));
});

// ── API ───────────────────────────────────────────────────────────────────────
async function apiCall(path, method = 'GET', body = null) {
  if (!config.apiUrl) throw new Error('No backend URL configured. Go to Settings.');
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(config.apiUrl + path, opts);
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res.json();
}

// ── STATUS ────────────────────────────────────────────────────────────────────
async function checkStatus() {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusTxt');
  if (!config.apiUrl) { dot.className = 'status-dot'; txt.textContent = 'not configured'; return; }
  dot.className = 'status-dot loading'; txt.textContent = 'connecting...';
  try {
    const r = await fetch(config.apiUrl + '/health', { signal: AbortSignal.timeout(5000) });
    if (r.ok) { dot.className = 'status-dot online'; txt.textContent = 'online'; }
    else throw new Error();
  } catch {
    dot.className = 'status-dot'; txt.textContent = 'offline';
  }
}
if (config.apiUrl) checkStatus();

// ── ORB WEBGL SHADER ──────────────────────────────────────────────────────────
const canvas = document.getElementById('orbCanvas');
const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
gl.clearColor(0, 0, 0, 0);

const VERT = `
  precision highp float;
  attribute vec2 position; attribute vec2 uv; varying vec2 vUv;
  void main(){ vUv=uv; gl_Position=vec4(position,0.,1.); }
`;
const FRAG = `
  precision highp float;
  uniform float iTime; uniform vec3 iResolution; uniform float hue;
  uniform float hover; uniform float rot; uniform float hoverIntensity;
  uniform vec3 backgroundColor; varying vec2 vUv;
  vec3 rgb2yiq(vec3 c){return vec3(dot(c,vec3(.299,.587,.114)),dot(c,vec3(.596,-.274,-.322)),dot(c,vec3(.211,-.523,.312)));}
  vec3 yiq2rgb(vec3 c){return vec3(c.x+.956*c.y+.621*c.z,c.x-.272*c.y-.647*c.z,c.x-1.106*c.y+1.703*c.z);}
  vec3 adjustHue(vec3 col,float h){float r=h*3.14159/180.;vec3 y=rgb2yiq(col);float ca=cos(r),sa=sin(r);return yiq2rgb(vec3(y.x,y.y*ca-y.z*sa,y.y*sa+y.z*ca));}
  vec3 hash33(vec3 p){p=fract(p*vec3(.1031,.11369,.13787));p+=dot(p,p.yxz+19.19);return -1.+2.*fract(vec3(p.x+p.y,p.x+p.z,p.y+p.z)*p.zyx);}
  float snoise3(vec3 p){const float K1=.333333,K2=.166667;vec3 i=floor(p+(p.x+p.y+p.z)*K1);vec3 d0=p-(i-(i.x+i.y+i.z)*K2);vec3 e=step(vec3(0.),d0-d0.yzx);vec3 i1=e*(1.-e.zxy);vec3 i2=1.-e.zxy*(1.-e);vec3 d1=d0-(i1-K2);vec3 d2=d0-(i2-K1);vec3 d3=d0-.5;vec4 h=max(.6-vec4(dot(d0,d0),dot(d1,d1),dot(d2,d2),dot(d3,d3)),0.);vec4 n=h*h*h*h*vec4(dot(d0,hash33(i)),dot(d1,hash33(i+i1)),dot(d2,hash33(i+i2)),dot(d3,hash33(i+1.)));return dot(vec4(31.316),n);}
  vec4 extractAlpha(vec3 c){float a=max(max(c.r,c.g),c.b);return vec4(c/(a+1e-5),a);}
  const vec3 bc1=vec3(.611765,.262745,.996078),bc2=vec3(.298039,.760784,.913725),bc3=vec3(.062745,.078431,.6);
  const float innerRadius=.6,noiseScale=.65;
  float light1(float i,float a,float d){return i/(1.+d*a);}
  float light2(float i,float a,float d){return i/(1.+d*d*a);}
  vec4 draw(vec2 uv){
    vec3 c1=adjustHue(bc1,hue),c2=adjustHue(bc2,hue),c3=adjustHue(bc3,hue);
    float ang=atan(uv.y,uv.x),len=length(uv),inv=len>0.?1./len:0.;
    float bgL=dot(backgroundColor,vec3(.299,.587,.114));
    float n0=snoise3(vec3(uv*noiseScale,iTime*.5))*.5+.5;
    float r0=mix(mix(innerRadius,1.,.4),mix(innerRadius,1.,.6),n0);
    float d0=distance(uv,(r0*inv)*uv);
    float v0=light1(1.,10.,d0)*smoothstep(r0*1.05,r0,len)*mix(smoothstep(r0*.8,r0*.95,len),1.,bgL*.7);
    float cl=cos(ang+iTime*2.)*.5+.5;
    float a2=iTime*-1.;
    float d=distance(uv,vec2(cos(a2),sin(a2))*r0);
    float v1=light2(1.5,5.,d)*light1(1.,50.,d0);
    float v2=smoothstep(1.,mix(innerRadius,1.,n0*.5),len);
    float v3=smoothstep(innerRadius,mix(innerRadius,1.,.5),len);
    vec3 cb=mix(c1,c2,cl);
    vec3 dk=clamp((mix(c3,cb,v0)+v1)*v2*v3,0.,1.);
    vec3 lk=clamp(mix(backgroundColor,(cb+v1)*mix(1.,v2*v3,mix(1.,.1,bgL)),v0),0.,1.);
    return extractAlpha(mix(dk,lk,bgL));
  }
  void main(){
    vec2 center=iResolution.xy*.5; float size=min(iResolution.x,iResolution.y);
    vec2 uv=(vUv*iResolution.xy-center)/size*2.;
    float s=sin(rot),c=cos(rot);
    uv=vec2(c*uv.x-s*uv.y,s*uv.x+c*uv.y);
    uv.x+=hover*hoverIntensity*.1*sin(uv.y*10.+iTime);
    uv.y+=hover*hoverIntensity*.1*sin(uv.x*10.+iTime);
    vec4 col=draw(uv);
    gl_FragColor=vec4(col.rgb*col.a,col.a);
  }
`;

function mkShader(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s;
}
const prog = gl.createProgram();
gl.attachShader(prog, mkShader(gl.VERTEX_SHADER, VERT));
gl.attachShader(prog, mkShader(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(prog); gl.useProgram(prog);

function mkBuf(data, attr, size) {
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, attr);
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
}
mkBuf(new Float32Array([-1,-1, 3,-1, -1,3]), 'position', 2);
mkBuf(new Float32Array([0,0, 2,0, 0,2]), 'uv', 2);

const uTime   = gl.getUniformLocation(prog, 'iTime');
const uRes    = gl.getUniformLocation(prog, 'iResolution');
const uHue    = gl.getUniformLocation(prog, 'hue');
const uHover  = gl.getUniformLocation(prog, 'hover');
const uRot    = gl.getUniformLocation(prog, 'rot');
const uHoverI = gl.getUniformLocation(prog, 'hoverIntensity');
const uBg     = gl.getUniformLocation(prog, 'backgroundColor');

gl.uniform3f(uBg, 0, 0, 0);
gl.uniform3f(uRes, 440, 440, 1);
gl.enable(gl.BLEND);
gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

const ORB_STATES = {
  idle:      { hue:0,   hoverI:0.05, hover:0,   timeScale:0.5,  label:'Idle',      sub:'Type below or go to Chat' },
  thinking:  { hue:0,   hoverI:0.2,  hover:0.8, timeScale:1.8,  label:'Thinking',  sub:'Just a moment...' },
  speaking:  { hue:40,  hoverI:0.25, hover:1.0, timeScale:1.3,  label:'Speaking',  sub:'Jarvis is responding...' },
  listening: { hue:0,   hoverI:0.2,  hover:1.0, timeScale:1.0,  label:'Listening', sub:'Go ahead...' },
};

let curHue=0, tgtHue=0, curHover=0, tgtHover=0, curRot=0;
let curHoverI=0.05, tgtHoverI=0.05, timeScale=0.5, simT=0, lastT=0;

function lerp(a, b, k) { return a + (b - a) * k; }

function setOrbState(s) {
  const st = ORB_STATES[s];
  tgtHue = st.hue; tgtHover = st.hover; tgtHoverI = st.hoverI; timeScale = st.timeScale;
  document.getElementById('orbLabel').textContent = st.label;
  document.getElementById('orbSub').textContent   = st.sub;
}

function orbFrame(ts) {
  requestAnimationFrame(orbFrame);
  const dt = Math.min((ts - lastT) * 0.001, 0.05); lastT = ts;
  curHue    = lerp(curHue,    tgtHue,    0.03);
  curHover  = lerp(curHover,  tgtHover,  0.04);
  curHoverI = lerp(curHoverI, tgtHoverI, 0.03);
  if (tgtHover > 0.5) curRot += dt * 0.3;
  simT += dt * timeScale;
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform1f(uTime,   simT);
  gl.uniform1f(uHue,    curHue);
  gl.uniform1f(uHover,  curHover);
  gl.uniform1f(uRot,    curRot);
  gl.uniform1f(uHoverI, curHoverI);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
setOrbState('idle');
requestAnimationFrame(orbFrame);

// ── ORB INPUT ─────────────────────────────────────────────────────────────────
async function orbSend() {
  const inp   = document.getElementById('orbInput');
  const reply = document.getElementById('orbReply');
  const text  = inp.value.trim();
  if (!text) return;
  inp.value = ''; inp.disabled = true;
  document.getElementById('orbSend').disabled = true;
  setOrbState('thinking');
  reply.textContent = '';
  try {
    const data = await apiCall('/chat', 'POST', { text });
    setOrbState('speaking');
    reply.textContent = data.reply;
    setTimeout(() => setOrbState('idle'), 5000);
  } catch (e) {
    setOrbState('idle');
    reply.textContent = '⚠ ' + e.message;
  } finally {
    inp.disabled = false;
    document.getElementById('orbSend').disabled = false;
    inp.focus();
  }
}
document.getElementById('orbSend').addEventListener('click', orbSend);
document.getElementById('orbInput').addEventListener('keydown', e => { if (e.key === 'Enter') orbSend(); });

// ── CHAT ──────────────────────────────────────────────────────────────────────
function addMsg(role, text) {
  const msgs = document.getElementById('chatMessages');
  const div  = document.createElement('div');
  div.className = 'msg ' + role;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  div.innerHTML = `<div class="msg-bubble">${text.replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div><div class="msg-time">${time}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}
function addTyping() {
  const msgs = document.getElementById('chatMessages');
  const div  = document.createElement('div');
  div.className = 'msg assistant'; div.id = 'typing';
  div.innerHTML = '<div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>';
  msgs.appendChild(div); msgs.scrollTop = msgs.scrollHeight;
  return div;
}
async function chatSend() {
  const inp  = document.getElementById('chatInput');
  const text = inp.value.trim(); if (!text) return;
  inp.value = ''; inp.disabled = true;
  document.getElementById('chatSend').disabled = true;
  addMsg('user', text);
  const typing = addTyping();
  try {
    const data = await apiCall('/chat', 'POST', { text });
    typing.remove(); addMsg('assistant', data.reply);
  } catch (e) {
    typing.remove(); addMsg('assistant', '⚠ ' + e.message);
  } finally {
    inp.disabled = false;
    document.getElementById('chatSend').disabled = false;
    inp.focus();
  }
}
document.getElementById('chatSend').addEventListener('click', chatSend);
document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') chatSend(); });
document.getElementById('btnResetChat').addEventListener('click', async () => {
  try {
    await apiCall('/reset', 'POST');
    document.getElementById('chatMessages').innerHTML = '';
  } catch (e) { alert(e.message); }
});

// ── NOTES ─────────────────────────────────────────────────────────────────────
let notesCache = JSON.parse(localStorage.getItem('notes') || '[]');
function saveNotes() { localStorage.setItem('notes', JSON.stringify(notesCache)); }

function loadNotes(filter = '') {
  const list = document.getElementById('notesList');
  const q    = filter.toLowerCase();
  const items = notesCache.filter(n =>
    !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
  );
  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><div>📝</div><span>${filter ? `No notes match "${filter}"` : 'No notes yet. Click + to add one.'}</span></div>`;
    return;
  }
  list.innerHTML = [...items].reverse().map(n => `
    <div class="note-card">
      <button class="note-card-delete" data-id="${n.id}">✕</button>
      <div class="note-card-title">${n.title.replace(/</g,'&lt;')}</div>
      <div class="note-card-preview">${n.content.replace(/</g,'&lt;')}</div>
      <div class="note-card-meta">${new Date(n.created).toLocaleDateString()}</div>
    </div>`).join('');
  list.querySelectorAll('.note-card-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      notesCache = notesCache.filter(n => n.id !== +btn.dataset.id);
      saveNotes(); loadNotes(document.getElementById('notesSearch').value);
    });
  });
}

function showNoteModal() {
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">
    <div class="modal-title">New Note</div>
    <input  class="modal-input" id="mNoteTitle" placeholder="Title (optional)"/>
    <textarea class="modal-input modal-textarea" id="mNoteContent" placeholder="What's on your mind?"></textarea>
    <div class="modal-actions">
      <button class="modal-btn secondary" id="mNoteCancel">Cancel</button>
      <button class="modal-btn primary"   id="mNoteSave">Save</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#mNoteCancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#mNoteSave').addEventListener('click', () => {
    const title   = overlay.querySelector('#mNoteTitle').value.trim();
    const content = overlay.querySelector('#mNoteContent').value.trim();
    if (!content) return;
    const id = Math.max(0, ...notesCache.map(n => n.id), 0) + 1;
    notesCache.push({ id, title: title || `Note ${id}`, content, created: new Date().toISOString() });
    saveNotes(); overlay.remove(); loadNotes();
    apiCall('/chat', 'POST', { text: `add note: ${content}` }).catch(() => {});
  });
  overlay.querySelector('#mNoteContent').focus();
}

document.getElementById('notesSearch').addEventListener('input', e => loadNotes(e.target.value));
document.getElementById('btnAddNote').addEventListener('click', showNoteModal);

// ── REMINDERS ─────────────────────────────────────────────────────────────────
let remindersCache = JSON.parse(localStorage.getItem('reminders') || '[]');
function saveReminders() { localStorage.setItem('reminders', JSON.stringify(remindersCache)); }

function loadReminders() {
  const list = document.getElementById('remindersList');
  const upcoming = remindersCache.filter(r => !r.fired);
  const fired    = remindersCache.filter(r =>  r.fired).slice(-3);
  const all      = [...upcoming, ...fired];
  if (!all.length) {
    list.innerHTML = `<div class="empty-state"><div>⏰</div><span>No reminders. Click + to add one.</span></div>`;
    return;
  }
  list.innerHTML = all.map(r => {
    const due     = new Date(r.due);
    const diffMin = Math.round((due - Date.now()) / 60000);
    let pill, pillClass;
    if (r.fired)          { pill = 'done';   pillClass = 'done'; }
    else if (diffMin < 1) { pill = 'now';    pillClass = 'soon'; }
    else if (diffMin < 60){ pill = `${diffMin}m`; pillClass = 'soon'; }
    else { pill = `${Math.floor(diffMin/60)}h ${diffMin%60}m`; pillClass = ''; }
    return `<div class="reminder-row">
      <div class="reminder-dot ${r.fired ? 'fired' : ''}"></div>
      <div class="reminder-body">
        <div class="reminder-text ${r.fired ? 'fired' : ''}">${r.message.replace(/</g,'&lt;')}</div>
        <div class="reminder-when">${due.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <span class="reminder-pill ${pillClass}">${pill}</span>
      <button class="reminder-delete" data-id="${r.id}">✕</button>
    </div>`;
  }).join('');
  list.querySelectorAll('.reminder-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      remindersCache = remindersCache.filter(r => r.id !== +btn.dataset.id);
      saveReminders(); loadReminders();
    });
  });
}

// Check every 30s if reminders have fired
setInterval(() => {
  const now = new Date().toISOString(); let updated = false;
  remindersCache.forEach(r => { if (!r.fired && r.due <= now) { r.fired = true; updated = true; } });
  if (updated) { saveReminders(); if (currentScreen === 'reminders') loadReminders(); }
}, 30000);

document.getElementById('btnAddReminder').addEventListener('click', () => {
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">
    <div class="modal-title">New Reminder</div>
    <input class="modal-input" id="mRemMsg"  placeholder="Remind me to..."/>
    <input class="modal-input" id="mRemMins" type="number" placeholder="Minutes from now" min="1"/>
    <div class="modal-actions">
      <button class="modal-btn secondary" id="mRemCancel">Cancel</button>
      <button class="modal-btn primary"   id="mRemSave">Set Reminder</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#mRemCancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#mRemSave').addEventListener('click', () => {
    const msg  = overlay.querySelector('#mRemMsg').value.trim();
    const mins = parseInt(overlay.querySelector('#mRemMins').value);
    if (!msg || !mins || mins < 1) return;
    const id  = Math.max(0, ...remindersCache.map(r => r.id), 0) + 1;
    const due = new Date(Date.now() + mins * 60000).toISOString();
    remindersCache.push({ id, message: msg, due, fired: false, created: new Date().toISOString() });
    saveReminders(); overlay.remove(); loadReminders();
    apiCall('/chat', 'POST', { text: `set reminder: ${msg} in ${mins} minutes` }).catch(() => {});
  });
  overlay.querySelector('#mRemMsg').focus();
});

// ── SETTINGS ──────────────────────────────────────────────────────────────────
function loadSettings() {
  document.getElementById('settingsUrl').value = config.apiUrl;
  document.getElementById('settingsKey').value = config.apiKey;
}
document.getElementById('btnSaveSettings').addEventListener('click', () => {
  config.apiUrl = document.getElementById('settingsUrl').value.trim().replace(/\/$/, '');
  config.apiKey = document.getElementById('settingsKey').value.trim();
  localStorage.setItem('apiUrl',  config.apiUrl);
  localStorage.setItem('apiKey',  config.apiKey);
  const st = document.getElementById('settingsStatus');
  st.textContent = 'Saved ✓';
  setTimeout(() => { st.textContent = ''; }, 2000);
  checkStatus();
});
document.getElementById('themeDark').addEventListener('click',  () => { applyTheme('dark');  localStorage.setItem('theme', 'dark');  });
document.getElementById('themeLight').addEventListener('click', () => { applyTheme('light'); localStorage.setItem('theme', 'light'); });
document.getElementById('btnTestConnection').addEventListener('click', async () => {
  const el = document.getElementById('connectionStatus');
  el.className = 'connection-status'; el.textContent = 'testing...';
  try {
    const r = await fetch(config.apiUrl + '/health', { signal: AbortSignal.timeout(6000) });
    if (r.ok) { el.className = 'connection-status ok';    el.textContent = '✓ Connected'; }
    else throw new Error('status ' + r.status);
  } catch (e) {
    el.className = 'connection-status error'; el.textContent = '✗ ' + e.message;
  }
});

// ── VOICE INPUT ───────────────────────────────────────────────────────────────
// Uses Web Speech API — works natively on Android Chrome, no libraries needed.
// Hold to speak, release to send.

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecording = false;

function initRecognition(onResult) {
  if (!SpeechRecognition) return null;
  const r = new SpeechRecognition();
  r.lang = 'en-US';
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => {
    const transcript = e.results[0][0].transcript.trim();
    if (transcript) onResult(transcript);
  };
  r.onerror = (e) => {
    console.warn('[Voice]', e.error);
    isRecording = false;
    document.querySelectorAll('.mic-btn').forEach(b => b.classList.remove('recording'));
  };
  r.onend = () => {
    isRecording = false;
    document.querySelectorAll('.mic-btn').forEach(b => b.classList.remove('recording'));
  };
  return r;
}

function startRecording(micBtn, onResult) {
  if (!SpeechRecognition) {
    alert('Voice input is not supported in this browser. Use Chrome on Android.');
    return;
  }
  if (isRecording) return;
  recognition = initRecognition(onResult);
  if (!recognition) return;
  isRecording = true;
  micBtn.classList.add('recording');
  setOrbState('listening');
  recognition.start();
}

function stopRecording() {
  if (recognition && isRecording) {
    recognition.stop();
  }
  isRecording = false;
  document.querySelectorAll('.mic-btn').forEach(b => b.classList.remove('recording'));
  setOrbState('idle');
}

function attachMicBtn(btnId, onResult) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  // Touch (mobile)
  btn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startRecording(btn, onResult);
  }, { passive: false });
  btn.addEventListener('touchend', (e) => {
    e.preventDefault();
    stopRecording();
  }, { passive: false });

  // Mouse (desktop testing)
  btn.addEventListener('mousedown', () => startRecording(btn, onResult));
  btn.addEventListener('mouseup',   () => stopRecording());
  btn.addEventListener('mouseleave',() => { if (isRecording) stopRecording(); });
}

// Attach to orb mic button
attachMicBtn('orbMic', (transcript) => {
  document.getElementById('orbInput').value = transcript;
  orbSend();
});

// Attach to chat mic button
attachMicBtn('chatMic', (transcript) => {
  document.getElementById('chatInput').value = transcript;
  chatSend();
});