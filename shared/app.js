// ── 5. SYSTEM THEME DETECTION ─────────────────────────────────────────────
function getSystemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark' : 'light';
}

// ── CONFIG ────────────────────────────────────────────────────────────────
// If user has never manually set a theme, fall back to system preference
let config = {
  apiUrl: localStorage.getItem('apiUrl') || '',
  apiKey: localStorage.getItem('apiKey') || '',
  theme:  localStorage.getItem('theme')  || getSystemTheme(),
};

// ── THEME ─────────────────────────────────────────────────────────────────
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  config.theme = t;
  document.getElementById('themeDark').classList.toggle('active', t === 'dark');
  document.getElementById('themeLight').classList.toggle('active', t === 'light');
}
applyTheme(config.theme);

// 5. Listen for OS-level theme changes — only auto-switch if user hasn't pinned a theme
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  if (!localStorage.getItem('theme')) {
    applyTheme(e.matches ? 'dark' : 'light');
  }
});

// ── CACHED DOM ────────────────────────────────────────────────────────────
const $screens = document.querySelectorAll('.screen');
const $navBtns = document.querySelectorAll('.nav-btn, .sidebar-btn[data-screen]');

// ── NAVIGATION ────────────────────────────────────────────────────────────
let currentScreen = 'orb';

function showScreen(id) {
  $screens.forEach(s => s.classList.remove('active'));
  $navBtns.forEach(b => b.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  document.querySelectorAll(`[data-screen="${id}"]`).forEach(el => el.classList.add('active'));
  currentScreen = id;
  orbRenderingEnabled = (id === 'orb');

  if (id !== 'orb' && recognition && orbListening) {
    try { recognition.stop(); } catch(e) {}
    orbListening = false;
    orbWakePhase = 'waiting';
  }
  if (id === 'orb') setTimeout(maybeStartOrbListening, 200);

  if (id === 'notes')     loadNotes();
  if (id === 'reminders') loadReminders();
  if (id === 'settings')  loadSettings();
}

$navBtns.forEach(b => b.addEventListener('click', () => showScreen(b.dataset.screen)));

// ── 4. HAPTIC FEEDBACK ────────────────────────────────────────────────────
function haptic(style) {
  if (!navigator.vibrate) return;
  const patterns = { light: [8], medium: [20], success: [10, 30, 10] };
  navigator.vibrate(patterns[style] || patterns.light);
}

// ── API ───────────────────────────────────────────────────────────────────
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

// ── STATUS ────────────────────────────────────────────────────────────────
async function checkStatus() {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusTxt');
  if (!config.apiUrl) {
    if (dot) dot.className = 'status-dot';
    if (txt) txt.textContent = 'not configured';
    return;
  }
  if (dot) dot.className = 'status-dot loading';
  if (txt) txt.textContent = 'connecting...';
  try {
    const r = await fetch(config.apiUrl + '/health', { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      if (dot) dot.className = 'status-dot online';
      if (txt) txt.textContent = 'online';
    } else throw new Error();
  } catch {
    if (dot) dot.className = 'status-dot';
    if (txt) txt.textContent = 'offline';
  }
}
if (config.apiUrl) checkStatus();

// ── ORB ───────────────────────────────────────────────────────────────────
initOrb();

// Orb state class for CSS-driven glow
function updateOrbStateClass(state) {
  const orbScreen = document.querySelector('.orb-screen');
  if (!orbScreen) return;
  orbScreen.classList.remove('state-idle', 'state-listening', 'state-thinking', 'state-speaking');
  orbScreen.classList.add('state-' + state);
}

// Ambient time display
function updateOrbTime() {
  const el = document.getElementById('orbTime');
  if (!el) return;
  const now = new Date();
  el.textContent = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
}
setInterval(updateOrbTime, 1000);
updateOrbTime();

// 1. Character stagger animation for orb label
function animateLabel(text) {
  const el = document.getElementById('orbLabel');
  if (!el) return;
  el.innerHTML = '';
  text.split('').forEach((ch, i) => {
    const span = document.createElement('span');
    span.className = 'char';
    span.textContent = ch === ' ' ? '\u00a0' : ch;
    span.style.animationDelay = (i * 0.04) + 's';
    el.appendChild(span);
  });
}

// Override setOrbState from orb.js to hook in our extras
const _origSetOrbState = setOrbState;
window.setOrbState = function(s) {
  _origSetOrbState(s);
  updateOrbStateClass(s);
  // Re-animate the label text that orb.js just set
  const el = document.getElementById('orbLabel');
  if (el) animateLabel(el.textContent);
};

// Run once on load to animate initial "Idle" label
setTimeout(() => {
  const el = document.getElementById('orbLabel');
  if (el) animateLabel(el.textContent);
}, 100);

// ── CHAT ──────────────────────────────────────────────────────────────────
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
  div.className = 'msg assistant';
  div.id = 'typing';
  div.innerHTML = '<div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

async function chatSend(text) {
  if (!text || !text.trim()) {
    const inp = document.getElementById('chatInput');
    text = inp.value.trim();
    if (!text) return;
    inp.value = '';
  }
  haptic('light'); // 4.
  const inp = document.getElementById('chatInput');
  inp.disabled = true;
  document.getElementById('chatSend').disabled = true;
  addMsg('user', text);
  const typing = addTyping();
  try {
    const data = await apiCall('/chat', 'POST', { text });
    typing.remove();
    addMsg('assistant', data.reply);
    if (voiceModeOn && window.speechSynthesis) {
      const utt = new SpeechSynthesisUtterance(data.reply);
      window.speechSynthesis.speak(utt);
    }
  } catch(e) {
    typing.remove();
    addMsg('assistant', '⚠ ' + e.message);
  } finally {
    inp.disabled = false;
    document.getElementById('chatSend').disabled = false;
    inp.focus();
  }
}

document.getElementById('chatSend').addEventListener('click', () => chatSend());
document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') chatSend(); });
document.getElementById('btnResetChat').addEventListener('click', async () => {
  try {
    await apiCall('/reset', 'POST');
    document.getElementById('chatMessages').innerHTML = '';
  } catch(e) { alert(e.message); }
});

// ── VOICE MODE TOGGLE ─────────────────────────────────────────────────────
let voiceModeOn = false;
document.getElementById('btnVoiceMode').addEventListener('click', () => {
  voiceModeOn = !voiceModeOn;
  document.getElementById('chatTextRow').style.display  = voiceModeOn ? 'none' : 'flex';
  document.getElementById('chatVoiceRow').style.display = voiceModeOn ? 'flex' : 'none';
  const btn = document.getElementById('btnVoiceMode');
  btn.style.color       = voiceModeOn ? 'var(--accent)' : '';
  btn.style.borderColor = voiceModeOn ? 'var(--accent)' : '';
});

// ── NOTES ─────────────────────────────────────────────────────────────────
let notesCache = JSON.parse(localStorage.getItem('notes') || '[]');
function saveNotes() { localStorage.setItem('notes', JSON.stringify(notesCache)); }
let notesSearchTimer = null;

function loadNotes(filter = '') {
  const list = document.getElementById('notesList');
  const q    = filter.toLowerCase();
  const items = notesCache.filter(n =>
    !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
  );
  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><div>📝</div><span>${filter ? `No notes match "${filter}"` : 'No notes yet. Hit + to add one.'}</span></div>`;
    return;
  }
  // Re-render to trigger CSS cardIn animation (opacity:0 → cardIn forwards)
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
      haptic('light'); // 4.
      notesCache = notesCache.filter(n => n.id !== +btn.dataset.id);
      saveNotes();
      loadNotes(document.getElementById('notesSearch').value);
    });
  });
}

function showNoteModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">
    <div class="modal-title">New Note</div>
    <input class="modal-input" id="mNoteTitle" placeholder="Title (optional)"/>
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
    saveNotes();
    haptic('success'); // 4.
    overlay.remove();
    loadNotes();
  });
  overlay.querySelector('#mNoteContent').focus();
}

document.getElementById('notesSearch').addEventListener('input', e => {
  clearTimeout(notesSearchTimer);
  notesSearchTimer = setTimeout(() => loadNotes(e.target.value), 150);
});
document.getElementById('btnAddNote').addEventListener('click', showNoteModal);

// ── REMINDERS ─────────────────────────────────────────────────────────────
let remindersCache = JSON.parse(localStorage.getItem('reminders') || '[]');
function saveReminders() { localStorage.setItem('reminders', JSON.stringify(remindersCache)); }

function loadReminders() {
  const list     = document.getElementById('remindersList');
  const upcoming = remindersCache.filter(r => !r.fired);
  const fired    = remindersCache.filter(r => r.fired).slice(-3);
  const all      = [...upcoming, ...fired];
  if (!all.length) {
    list.innerHTML = `<div class="empty-state"><div>⏰</div><span>No reminders. Hit + to add one.</span></div>`;
    return;
  }
  list.innerHTML = all.map(r => {
    const due     = new Date(r.due);
    const diffMin = Math.round((due - Date.now()) / 60000);
    let pill, pillClass;
    if (r.fired)           { pill = 'done'; pillClass = 'done'; }
    else if (diffMin < 1)  { pill = 'now';  pillClass = 'soon'; }
    else if (diffMin < 60) { pill = `${diffMin}m`; pillClass = 'soon'; }
    else { pill = `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`; pillClass = ''; }
    return `<div class="reminder-row">
      <div class="reminder-dot ${r.fired ? 'fired' : ''}"></div>
      <div class="reminder-body">
        <div class="reminder-text ${r.fired ? 'fired' : ''}">${r.message.replace(/</g,'&lt;')}</div>
        <div class="reminder-when">${due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
      <span class="reminder-pill ${pillClass}">${pill}</span>
      <button class="reminder-delete" data-id="${r.id}">✕</button>
    </div>`;
  }).join('');
  list.querySelectorAll('.reminder-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      haptic('light'); // 4.
      remindersCache = remindersCache.filter(r => r.id !== +btn.dataset.id);
      saveReminders();
      loadReminders();
    });
  });
}

const reminderInterval = setInterval(() => {
  const now = new Date().toISOString();
  let updated = false;
  remindersCache.forEach(r => {
    if (!r.fired && r.due <= now) { r.fired = true; updated = true; }
  });
  if (updated) {
    saveReminders();
    if (currentScreen === 'reminders') loadReminders();
  }
}, 30000);

document.getElementById('btnAddReminder').addEventListener('click', () => {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
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
    saveReminders();
    haptic('success'); // 4.
    overlay.remove();
    loadReminders();
  });
  overlay.querySelector('#mRemMsg').focus();
});

// ── SETTINGS ──────────────────────────────────────────────────────────────
function loadSettings() {
  document.getElementById('settingsUrl').value = config.apiUrl;
  document.getElementById('settingsKey').value = config.apiKey;
}

document.getElementById('btnSaveSettings').addEventListener('click', () => {
  config.apiUrl = document.getElementById('settingsUrl').value.trim().replace(/\/$/, '');
  config.apiKey = document.getElementById('settingsKey').value.trim();
  localStorage.setItem('apiUrl', config.apiUrl);
  localStorage.setItem('apiKey', config.apiKey);
  const st = document.getElementById('settingsStatus');
  st.textContent = 'Saved ✓';
  setTimeout(() => { st.textContent = ''; }, 2000);
  checkStatus();
});

document.getElementById('themeDark').addEventListener('click', () => {
  applyTheme('dark');
  localStorage.setItem('theme', 'dark'); // pin manually
});
document.getElementById('themeLight').addEventListener('click', () => {
  applyTheme('light');
  localStorage.setItem('theme', 'light'); // pin manually
});

document.getElementById('btnTestConnection').addEventListener('click', async () => {
  const el = document.getElementById('connectionStatus');
  el.className = 'connection-status'; el.textContent = 'testing...';
  try {
    const r = await fetch(config.apiUrl + '/health', { signal: AbortSignal.timeout(6000) });
    if (r.ok) { el.className = 'connection-status ok';    el.textContent = '✓ Connected'; }
    else throw new Error('status ' + r.status);
  } catch(e) {
    el.className = 'connection-status error'; el.textContent = '✗ ' + e.message;
  }
});

// ── VOICE ENGINE ──────────────────────────────────────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition  = null;
let isRecording  = false;
let orbListening = false;
let isSpeaking   = false;

function speakReply(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  isSpeaking = true;
  const utt  = new SpeechSynthesisUtterance(text);
  utt.lang   = 'en-US';
  utt.rate   = 1.05;
  utt.onend  = () => {
    isSpeaking = false;
    if (currentScreen === 'orb') setTimeout(startOrbListening, 800);
    else setOrbState('idle');
  };
  window.speechSynthesis.speak(utt);
}

let orbWakePhase   = 'waiting';
let orbWakeTimeout = null;

function startOrbListening() {
  if (!SpeechRecognition)      return;
  if (orbListening)            return;
  if (currentScreen !== 'orb') return;
  if (isSpeaking)              return;

  setOrbState('idle');
  orbListening = true;

  const r          = new SpeechRecognition();
  r.lang           = 'en-US';
  r.continuous     = true;
  r.interimResults = false;

  r.onresult = (e) => {
    const transcript = e.results[e.results.length - 1][0].transcript.trim().toLowerCase();
    if (orbWakePhase === 'waiting') {
      if (transcript.includes('jarvis')) {
        orbWakePhase = 'capturing';
        setOrbState('listening');
        const afterWake = transcript.replace(/hey\s*jarvis|jarvis/, '').trim();
        if (afterWake.length > 2) {
          handleOrbQuery(afterWake);
        } else {
          orbWakeTimeout = setTimeout(() => {
            orbWakePhase = 'waiting';
            setOrbState('idle');
          }, 8000);
        }
      }
    } else if (orbWakePhase === 'capturing') {
      clearTimeout(orbWakeTimeout);
      handleOrbQuery(transcript);
    }
  };

  r.onend = () => {
    orbListening = false;
    if (currentScreen === 'orb' && orbWakePhase === 'waiting' && !isSpeaking) {
      setTimeout(startOrbListening, 300);
    }
  };

  r.onerror = (e) => {
    orbListening = false;
    if (e.error === 'not-allowed') {
      document.getElementById('orbSub').textContent = 'Mic access denied — check browser settings';
      return;
    }
    if (currentScreen === 'orb' && !isSpeaking) setTimeout(startOrbListening, 1000);
  };

  try { r.start(); recognition = r; }
  catch(e) { orbListening = false; }
}

async function handleOrbQuery(query) {
  orbWakePhase = 'waiting';
  setOrbState('thinking');
  document.getElementById('orbSub').textContent = query;

  if (recognition && orbListening) {
    try { recognition.stop(); } catch(e) {}
    orbListening = false;
  }

  try {
    const data = await apiCall('/chat', 'POST', { text: query });
    setOrbState('speaking');
    document.getElementById('orbSub').textContent = data.reply;
    speakReply(data.reply);
  } catch(e) {
    isSpeaking = false;
    setOrbState('idle');
    document.getElementById('orbSub').textContent = '⚠ ' + e.message;
    setTimeout(startOrbListening, 2000);
  }
}

function maybeStartOrbListening() {
  if (currentScreen === 'orb' && config.apiUrl && SpeechRecognition && !isSpeaking) {
    startOrbListening();
  }
}

setTimeout(maybeStartOrbListening, 1000);

// ── CHAT: hold-to-speak ───────────────────────────────────────────────────
function buildHoldRecognition(onResult, onEnd) {
  if (!SpeechRecognition) return null;
  const r           = new SpeechRecognition();
  r.lang            = 'en-US';
  r.interimResults  = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => { const t = e.results[0][0].transcript.trim(); if (t) onResult(t); };
  r.onerror  = (e) => { console.warn('[Hold voice]', e.error); onEnd(); };
  r.onend    = onEnd;
  return r;
}

function startHold(btn, onResult) {
  if (!SpeechRecognition) { alert('Voice input needs Chrome on HTTPS.'); return; }
  if (isRecording) return;
  haptic('success'); // 4. double-pulse on record start
  const r = buildHoldRecognition(
    (t) => { isRecording = false; btn.classList.remove('recording'); haptic('light'); onResult(t); },
    ()  => { isRecording = false; btn.classList.remove('recording'); }
  );
  if (!r) return;
  isRecording = true;
  btn.classList.add('recording');
  try { r.start(); recognition = r; }
  catch(e) { isRecording = false; btn.classList.remove('recording'); }
}

function stopHold() {
  if (recognition && isRecording) {
    try { recognition.stop(); } catch(e) {}
  }
}

function attachHold(btnId, onResult) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('touchstart',  (e) => { e.preventDefault(); startHold(btn, onResult); }, { passive: false });
  btn.addEventListener('touchend',    (e) => { e.preventDefault(); stopHold(); },               { passive: false });
  btn.addEventListener('touchcancel', (e) => { e.preventDefault(); stopHold(); },               { passive: false });
  btn.addEventListener('mousedown',   ()  => startHold(btn, onResult));
  btn.addEventListener('mouseup',     ()  => stopHold());
  btn.addEventListener('mouseleave',  ()  => { if (isRecording) stopHold(); });
}

attachHold('chatMic', (transcript) => chatSend(transcript));

// ── CLEANUP ───────────────────────────────────────────────────────────────
window.addEventListener('beforeunload', () => {
  clearInterval(reminderInterval);
  if (recognition) try { recognition.stop(); } catch(e) {}
  if (window.speechSynthesis) window.speechSynthesis.cancel();
});