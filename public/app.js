// Get It? — client
const $ = (s) => document.querySelector(s);

// ----------------------------------------------------------------- plumbing
async function api(path, opts) {
  const r = await fetch(path, { credentials: 'same-origin', ...opts });
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) throw new Error(j.error || 'Something went wrong.');
  return j;
}
function post(path, body) {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function setMsg(el, text, ok) {
  el.textContent = text || '';
  el.classList.toggle('ok', !!ok);
}
let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 1900);
}
async function copy(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(label + ' copied');
  } catch {
    toast('Press Ctrl+C to copy');
  }
}

// --------------------------------------------------------------------- tabs
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const t = btn.id === 'tab-teacher' ? 'teacher' : 'student';
    $('#view-teacher').classList.toggle('hidden', t !== 'teacher');
    $('#view-student').classList.toggle('hidden', t !== 'student');
  });
});

// =================================================================== TEACHER
let me = null;
let classes = [];
let activeClass = null;
let generated = [];
let activeCheckId = null;
let pollTimer = null;

async function loadMe() {
  const j = await api('/api/me');
  me = j.teacher;
  if (me) {
    $('#authCard').classList.add('hidden');
    $('#dash').classList.remove('hidden');
    loadClasses();
  } else {
    $('#authCard').classList.remove('hidden');
    $('#dash').classList.add('hidden');
  }
}

$('#btnLogin').addEventListener('click', async () => {
  setMsg($('#authMsg'), '');
  try {
    await post('/api/login', { email: $('#authEmail').value, password: $('#authPass').value });
    await loadMe();
  } catch (e) { setMsg($('#authMsg'), e.message); }
});

$('#btnSignup').addEventListener('click', async () => {
  setMsg($('#authMsg'), '');
  try {
    await post('/api/signup', { email: $('#authEmail').value, password: $('#authPass').value });
    await loadMe();
  } catch (e) { setMsg($('#authMsg'), e.message); }
});

$('#btnLogout').addEventListener('click', async () => {
  await post('/api/logout');
  stopPolling();
  activeClass = null;
  $('#classPanel').classList.add('hidden');
  await loadMe();
});

async function loadClasses() {
  const j = await api('/api/classes');
  classes = j.classes;
  if (!classes.length) {
    $('#classList').innerHTML = '<p class="muted">No classes yet. Add one below to get a join code.</p>';
    return;
  }
  $('#classList').innerHTML = classes.map(c =>
    `<div class="classrow${activeClass && activeClass.id === c.id ? ' on' : ''}" data-id="${esc(c.id)}" data-tip="Open this class.">
       <strong>${esc(c.name)}</strong>
       <span class="small">${c.checks} check${c.checks === 1 ? '' : 's'} · code <b>${esc(c.code)}</b></span>
     </div>`
  ).join('');
  document.querySelectorAll('.classrow').forEach(row => {
    row.addEventListener('click', () => openClass(row.dataset.id));
  });
}

$('#btnAddClass').addEventListener('click', async () => {
  setMsg($('#classMsg'), '');
  const name = $('#newClassName').value.trim();
  if (!name) return setMsg($('#classMsg'), 'Type a class name first.');
  try {
    const j = await post('/api/class', { name });
    $('#newClassName').value = '';
    await loadClasses();
    openClass(j.class.id);
  } catch (e) { setMsg($('#classMsg'), e.message); }
});

$('#btnCloseClass').addEventListener('click', () => {
  stopPolling();
  activeClass = null;
  $('#classPanel').classList.add('hidden');
  loadClasses();
});

function openClass(id) {
  const c = classes.find(x => x.id === id);
  if (!c) return;
  stopPolling();
  activeClass = c;
  $('#classPanel').classList.remove('hidden');
  $('#classTitle').textContent = c.name;
  $('#classCode').textContent = c.code;
  $('#qwrap').classList.add('hidden');
  $('#btnCreateCheck').classList.add('hidden');
  $('#liveBar').classList.add('hidden');
  $('#qlist').innerHTML = '';
  $('#results').innerHTML = '';
  $('#topic').value = '';
  $('#btnGenerate').textContent = '1. Generate questions';
  generated = [];
  setMsg($('#checkMsg'), '');
  loadClasses();
  loadChecks();
}

$('#btnCopyCode').addEventListener('click', () => {
  if (activeClass) copy(activeClass.code, 'Class code');
});
$('#btnCopyLink').addEventListener('click', () => {
  if (activeClass) copy(location.origin + '/?join=' + activeClass.code, 'Student link');
});
$('#btnOpenStudent').addEventListener('click', () => {
  if (activeClass) window.open(location.origin + '/?join=' + activeClass.code, '_blank');
});

// --------------------------------------------------------- generate questions
$('#btnGenerate').addEventListener('click', async () => {
  setMsg($('#checkMsg'), '');
  const topic = $('#topic').value.trim();
  if (!topic) return setMsg($('#checkMsg'), 'Type what you taught first.');
  $('#btnGenerate').disabled = true;
  $('#btnGenerate').textContent = 'Writing questions...';
  try {
    const j = await post('/api/generate', { topic });
    generated = j.questions;
    renderQuestions();
    $('#qwrap').classList.remove('hidden');
    $('#btnCreateCheck').classList.remove('hidden');
    setMsg($('#checkMsg'), 'Edit anything you like, then create the check.', true);
  } catch (e) { setMsg($('#checkMsg'), e.message); }
  $('#btnGenerate').disabled = false;
  $('#btnGenerate').textContent = '1. Regenerate questions';
});

function renderQuestions() {
  $('#qlist').innerHTML = generated.map((q, i) =>
    `<div class="qrow" data-i="${i}">
       <span class="qnum">${i + 1}</span>
       <input class="qinput" value="${esc(q)}"/>
       <button class="small-btn qdel" data-tip="Remove this question.">✕</button>
     </div>`
  ).join('');
  document.querySelectorAll('.qdel').forEach(b => b.addEventListener('click', () => {
    const i = Number(b.parentElement.dataset.i);
    syncInputs();
    generated.splice(i, 1);
    renderQuestions();
  }));
}

function syncInputs() {
  document.querySelectorAll('#qlist .qrow').forEach(row => {
    generated[Number(row.dataset.i)] = row.querySelector('.qinput').value.trim();
  });
}

$('#btnAddQ').addEventListener('click', () => {
  syncInputs();
  generated.push('');
  renderQuestions();
  const inputs = document.querySelectorAll('#qlist .qinput');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

// ------------------------------------------------------------------ create
$('#btnCreateCheck').addEventListener('click', async () => {
  syncInputs();
  const questions = generated.map(q => String(q || '').trim()).filter(Boolean);
  setMsg($('#checkMsg'), '');
  if (!questions.length) return setMsg($('#checkMsg'), 'Add at least one question.');
  if (!activeClass) return setMsg($('#checkMsg'), 'Pick a class first.');
  try {
    await post('/api/session', { classId: activeClass.id, topic: $('#topic').value.trim(), questions });
    setMsg($('#checkMsg'), '', true);
    $('#qwrap').classList.add('hidden');
    $('#btnCreateCheck').classList.add('hidden');
    $('#topic').value = '';
    $('#btnGenerate').textContent = '1. Generate questions';
    generated = [];
    $('#liveText').textContent = 'Live now — students use code ' + activeClass.code;
    $('#liveBar').classList.remove('hidden');
    loadChecks();
    loadClasses();
  } catch (e) { setMsg($('#checkMsg'), e.message); }
});

// ------------------------------------------------------------- past checks
async function loadChecks() {
  if (!activeClass) return;
  const j = await api('/api/sessions?classId=' + encodeURIComponent(activeClass.id));
  if (!j.checks.length) {
    $('#checkList').innerHTML = '<p class="muted">No checks yet. Make one above.</p>';
    return;
  }
  $('#checkList').innerHTML = j.checks.map(c =>
    `<div class="checkrow${activeCheckId === c.id ? ' on' : ''}" data-id="${esc(c.id)}" data-tip="See how the class did.">
       <strong>${esc(c.topic)}</strong>
       <span class="small">${c.students} finished</span>
     </div>`
  ).join('');
  document.querySelectorAll('.checkrow').forEach(row => {
    row.addEventListener('click', () => {
      document.querySelectorAll('.checkrow').forEach(r => r.classList.remove('on'));
      row.classList.add('on');
      startResults(row.dataset.id);
    });
  });
}

let resultFilter = 'all';

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function startResults(id) {
  activeCheckId = id;
  resultFilter = 'all';
  loadResults();
  stopPolling();
  pollTimer = setInterval(loadResults, 12000);
}

async function loadResults() {
  if (!activeCheckId) return;
  let j;
  try { j = await api('/api/session?id=' + encodeURIComponent(activeCheckId)); }
  catch (e) { $('#results').innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; return; }

  const s = j.check;
  const students = s.students || [];

  if (!students.length) {
    $('#results').innerHTML =
      `<div class="card"><h3>${esc(s.topic)}</h3>
        <p class="muted">Nobody has finished yet. Give the class the code <b>${esc(j.classCode || '')}</b> and leave this open — it updates by itself.</p>
      </div>`;
    return;
  }

  const counts = { green: 0, amber: 0, red: 0 };
  students.forEach(st => {
    const l = (st.verdict && st.verdict.level) || 'amber';
    counts[l] = (counts[l] || 0) + 1;
  });

  const order = { red: 0, amber: 1, green: 2 };
  const shown = students
    .filter(st => resultFilter === 'all' || ((st.verdict && st.verdict.level) || 'amber') !== 'green')
    .slice()
    .sort((a, b) => {
      const la = order[(a.verdict && a.verdict.level) || 'amber'] ?? 3;
      const lb = order[(b.verdict && b.verdict.level) || 'amber'] ?? 3;
      if (la !== lb) return la - lb;
      return String(a.name).localeCompare(String(b.name));
    });

  const rows = shown.map(st => {
    const v = st.verdict || {};
    const lv = v.level || 'amber';
    const tip = lv === 'green' ? 'Really understands it.'
              : lv === 'amber' ? 'Partly knows it, with clear gaps.'
              : 'Got little right — needs help.';
    return `<div class="sresult lv-${esc(lv)}">
      <div class="head"><span class="name">${esc(st.name)}</span><span class="tag lv-${esc(lv)}" data-tip="${esc(tip)}">${esc(lv)}</span></div>
      ${v.notes ? `<div class="notes">${esc(v.notes)}</div>` : ''}
      <div class="detail">
        ${v.gets ? `<div><span class="k" data-tip="What they truly understand.">Gets</span>${esc(v.gets)}</div>` : ''}
        ${v.shaky ? `<div><span class="k" data-tip="Where they are weak.">Shaky</span>${esc(v.shaky)}</div>` : ''}
        ${v.nextStep ? `<div class="nextstep"><span class="k" data-tip="One thing to do with them next.">Next</span>${esc(v.nextStep)}</div>` : ''}
        ${v.faked ? `<div class="warn" data-tip="Their answers sounded copied or AI-written.">Possible bluffing</div>` : ''}
      </div>
      ${st.transcript ? `<details class="transcript"><summary data-tip="Read the conversation word for word.">See their answers</summary><pre>${esc(st.transcript)}</pre></details>` : ''}
    </div>`;
  }).join('');

  const needHelp = counts.amber + counts.red;

  $('#results').innerHTML =
    `<div class="card">
       <div class="srow"><h3>${esc(s.topic)}</h3><span class="small">updates live</span></div>
       <div class="stat-row">
         <div class="stat green" data-tip="Really understands it."><b>${counts.green}</b><span>get it</span></div>
         <div class="stat amber" data-tip="Partly knows it, with clear gaps."><b>${counts.amber}</b><span>shaky</span></div>
         <div class="stat red" data-tip="Got little right — needs help."><b>${counts.red}</b><span>struggling</span></div>
       </div>
       <p class="summary"><b>${students.length}</b> finished · <b>${needHelp}</b> need${needHelp === 1 ? 's' : ''} a hand</p>
       <div class="filters">
         <button data-f="all" class="${resultFilter === 'all' ? 'on' : ''}">Everyone (${students.length})</button>
         <button data-f="help" class="${resultFilter === 'help' ? 'on' : ''}">Needs help (${needHelp})</button>
       </div>
       ${rows || '<p class="muted">Nothing in this list.</p>'}
     </div>`;

  document.querySelectorAll('.filters button').forEach(b => b.addEventListener('click', () => {
    resultFilter = b.dataset.f;
    loadResults();
  }));
}

// =================================================================== STUDENT
let chat = { history: [], covered: 0, digs: 0, topic: '', questions: [], done: false, name: '', code: '' };
let sending = false;

$('#btnJoin').addEventListener('click', async () => {
  setMsg($('#joinMsg'), '');
  const code = $('#joinCode').value.trim().toLowerCase();
  const name = $('#studentName').value.trim();
  if (!code) return setMsg($('#joinMsg'), 'Enter the class code.');
  if (!name) return setMsg($('#joinMsg'), 'Enter your name.');
  $('#btnJoin').disabled = true;
  try {
    const j = await api('/api/join?code=' + encodeURIComponent(code));
    chat = {
      history: [], covered: 0, digs: 0,
      topic: j.check.topic,
      questions: j.check.questions || [],
      done: false, name, code
    };
    $('#joinCard').classList.add('hidden');
    $('#doneCard').classList.add('hidden');
    $('#checkCard').classList.remove('hidden');
    $('#checkTopic').textContent = j.check.topic;
    $('#chat').innerHTML = '';
    updateProgress();
    await nextTurn();
  } catch (e) {
    setMsg($('#joinMsg'), e.message);
  }
  $('#btnJoin').disabled = false;
});

function updateProgress() {
  const total = chat.questions.length;
  if (!total) { $('#progress').textContent = ''; return; }
  const n = Math.max(1, Math.min(chat.covered, total));
  $('#progress').textContent = `Question ${n} of ${total}`;
}

function addBubble(who, text) {
  const d = document.createElement('div');
  d.className = 'bubble ' + who;
  d.textContent = text;
  $('#chat').appendChild(d);
  d.scrollIntoView({ block: 'end', behavior: 'smooth' });
  return d;
}

async function nextTurn() {
  const typing = addBubble('examiner typing', '• • •');
  try {
    const j = await post('/api/chat', {
      topic: chat.topic, questions: chat.questions,
      history: chat.history, covered: chat.covered, digs: chat.digs
    });
    typing.remove();
    chat.history.push({ role: 'assistant', content: j.reply });
    chat.covered = j.covered;
    chat.digs = j.digs;
    addBubble('examiner', j.reply);
    updateProgress();
    if (j.done) {
      chat.done = true;
      await finish();
    } else {
      $('#answer').focus();
    }
  } catch (e) {
    typing.remove();
    addBubble('examiner', 'Sorry — something went wrong. Tell your teacher.');
    setMsg($('#chatMsg'), e.message);
  }
}

$('#btnSend').addEventListener('click', sendAnswer);
$('#answer').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAnswer(); });

async function sendAnswer() {
  const text = $('#answer').value.trim();
  if (!text || chat.done || sending) return;
  sending = true;
  $('#answer').value = '';
  chat.history.push({ role: 'user', content: text });
  addBubble('student', text);
  $('#btnSend').disabled = true;
  await nextTurn();
  $('#btnSend').disabled = false;
  sending = false;
}

async function finish() {
  const transcript = chat.history
    .map(x => (x.role === 'user' ? 'Student: ' : 'Examiner: ') + x.content)
    .join('\n');
  $('#answer').disabled = true;
  $('#btnSend').disabled = true;
  $('#chatMsg').textContent = '';
  try {
    const j = await post('/api/verdict', { topic: chat.topic, transcript });
    await post('/api/result', { code: chat.code, name: chat.name, transcript, verdict: j.verdict });
  } catch (e) {
    setMsg($('#chatMsg'), 'Could not send to your teacher. Tell them before you close this.');
  }
  $('#checkCard').classList.add('hidden');
  $('#doneCard').classList.remove('hidden');
}

// ------------------------------------------------------------------- startup
(async () => {
  const params = new URLSearchParams(location.search);
  const join = params.get('join');
  if (join) {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    $('#tab-student').classList.add('active');
    $('#view-teacher').classList.add('hidden');
    $('#view-student').classList.remove('hidden');
    $('#joinCode').value = join.trim().toLowerCase();
    setTimeout(() => $('#studentName').focus(), 100);
  }
  try { await loadMe(); } catch {}
})();
