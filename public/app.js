// Understanding Check - client
const $ = (s) => document.querySelector(s);

async function api(path, opts) {
  const r = await fetch(path, opts);
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) throw new Error(j.error || 'Something went wrong.');
  return j;
}
function post(path, body) {
  return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ------------------------------------------------------------------- tabs
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const t = btn.id === 'tab-teacher' ? 'teacher' : 'student';
    $('#view-teacher').classList.toggle('hidden', t !== 'teacher');
    $('#view-student').classList.toggle('hidden', t !== 'student');
  });
});

// ================================================================== TEACHER
let me = null;
let activeClass = null;
let generated = [];

function setMsg(el, text) { el.textContent = text || ''; }

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
  activeClass = null;
  $('#classPanel').classList.add('hidden');
  await loadMe();
});

async function loadClasses() {
  const j = await api('/api/classes');
  if (!j.classes.length) {
    $('#classList').innerHTML = '<p class="muted">No classes yet. Add one below.</p>';
    return;
  }
  $('#classList').innerHTML = j.classes.map(c =>
    `<div class="srow classrow" data-id="${esc(c.id)}" data-tip="Click to open this class.">
       <span><strong>${esc(c.name)}</strong></span>
       <span class="small">${c.checks} check${c.checks === 1 ? '' : 's'} · code <b>${esc(c.code)}</b></span>
     </div>`
  ).join('');
  document.querySelectorAll('.classrow').forEach(row => {
    row.addEventListener('click', () => openClass(row.dataset.id, j.classes));
  });
}

$('#btnAddClass').addEventListener('click', async () => {
  setMsg($('#classMsg'), '');
  const name = $('#newClassName').value.trim();
  if (!name) return setMsg($('#classMsg'), 'Type a class name first.');
  try {
    await post('/api/class', { name });
    $('#newClassName').value = '';
    loadClasses();
  } catch (e) { setMsg($('#classMsg'), e.message); }
});

async function openClass(id, classes) {
  const c = (classes || []).find(x => x.id === id) || (await api('/api/classes')).classes.find(x => x.id === id);
  activeClass = c;
  $('#classPanel').classList.remove('hidden');
  $('#classTitle').textContent = c.name;
  $('#classCode').textContent = c.code;
  $('#qwrap').classList.add('hidden');
  $('#btnCreateCheck').classList.add('hidden');
  $('#qlist').innerHTML = '';
  generated = [];
  setMsg($('#checkMsg'), '');
  $('#results').innerHTML = '';
  loadChecks();
}

$('#btnGenerate').addEventListener('click', async () => {
  setMsg($('#checkMsg'), '');
  const topic = $('#topic').value.trim();
  if (!topic) return setMsg($('#checkMsg'), 'Type a topic first.');
  $('#btnGenerate').disabled = true;
  $('#btnGenerate').textContent = 'Generating...';
  try {
    const j = await post('/api/generate', { topic });
    generated = j.questions;
    renderQuestions();
    $('#qwrap').classList.remove('hidden');
    $('#btnCreateCheck').classList.remove('hidden');
  } catch (e) { setMsg($('#checkMsg'), e.message); }
  $('#btnGenerate').disabled = false;
  $('#btnGenerate').textContent = '1. Regenerate questions';
});

function renderQuestions() {
  $('#qlist').innerHTML = generated.map((q, i) =>
    `<div class="qrow" data-i="${i}">
       <span class="qnum">${i + 1}</span>
       <input class="qinput" value="${esc(q)}"/>
       <button class="small-btn qdel" data-tip="Remove this question.">×</button>
     </div>`
  ).join('');
  document.querySelectorAll('.qdel').forEach(b => b.addEventListener('click', () => {
    collectQuestions();
    const i = Number(b.parentElement.dataset.i);
    generated.splice(i, 1);
    renderQuestions();
  }));
}

function collectQuestions() {
  document.querySelectorAll('#qlist .qrow').forEach(row => {
    const i = Number(row.dataset.i);
    generated[i] = row.querySelector('.qinput').value.trim();
  });
  generated = generated.filter(Boolean);
}

$('#btnAddQ').addEventListener('click', () => {
  collectQuestions();
  generated.push('');
  renderQuestions();
  const inputs = document.querySelectorAll('#qlist .qinput');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

$('#btnCreateCheck').addEventListener('click', async () => {
  collectQuestions();
  setMsg($('#checkMsg'), '');
  if (!generated.length) return setMsg($('#checkMsg'), 'Add at least one question.');
  if (!activeClass) return setMsg($('#checkMsg'), 'Pick a class first.');
  try {
    await post('/api/session', { classId: activeClass.id, topic: $('#topic').value.trim(), questions: generated });
    setMsg($('#checkMsg'), 'Check created. Students can now join with the class code.');
    $('#qwrap').classList.add('hidden');
    $('#btnCreateCheck').classList.add('hidden');
    $('#topic').value = '';
    $('#btnGenerate').textContent = '1. Generate questions';
    loadChecks();
  } catch (e) { setMsg($('#checkMsg'), e.message); }
});

async function loadChecks() {
  if (!activeClass) return;
  const j = await api('/api/sessions?classId=' + encodeURIComponent(activeClass.id));
  if (!j.checks.length) { $('#checkList').innerHTML = '<p class="muted">None yet.</p>'; return; }
  $('#checkList').innerHTML = j.checks.map(c =>
    `<div class="srow checkrow" data-id="${esc(c.id)}" data-tip="Click to see how the class did.">
       <span><strong>${esc(c.topic)}</strong></span>
       <span class="small">${c.students} finished</span>
     </div>`
  ).join('');
  document.querySelectorAll('.checkrow').forEach(row => {
    row.addEventListener('click', () => loadResults(row.dataset.id));
  });
}

async function loadResults(id) {
  let j;
  try { j = await api('/api/session?id=' + encodeURIComponent(id)); }
  catch (e) { $('#results').innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; return; }
  const s = j.check;
  if (!s.students.length) { $('#results').innerHTML = '<p class="muted">No students have finished yet.</p>'; return; }

  const counts = { green: 0, amber: 0, red: 0 };
  s.students.forEach(st => { const l = (st.verdict && st.verdict.level) || 'amber'; counts[l] = (counts[l] || 0) + 1; });

  const rows = s.students.map(st => {
    const v = st.verdict || {};
    const lv = v.level || 'amber';
    const tip = lv === 'green' ? 'Really understands it.' : lv === 'amber' ? 'Partly knows it, with clear gaps.' : 'Struggled — got little right.';
    return `<div class="sresult lv-${esc(lv)}">
      <div class="head"><span class="name">${esc(st.name)}</span><span class="tag lv-${esc(lv)}" data-tip="${esc(tip)}">${esc(lv)}</span></div>
      <div class="notes">${esc(v.notes || '')}</div>
      <div class="detail">
        ${v.gets ? `<div><span class="k" data-tip="What they truly understand.">Gets</span> ${esc(v.gets)}</div>` : ''}
        ${v.shaky ? `<div><span class="k" data-tip="Where they are weak.">Shaky</span> ${esc(v.shaky)}</div>` : ''}
        ${v.nextStep ? `<div class="nextstep"><span class="k" data-tip="One thing to do with them next.">Next</span> ${esc(v.nextStep)}</div>` : ''}
        ${v.faked ? `<div class="warn" data-tip="Their answers sounded copied, AI-written, or contradict themselves.">Possible bluffing</div>` : ''}
      </div>
      ${st.transcript ? `<details class="transcript"><summary data-tip="Read the full conversation, word for word.">See their answers</summary><pre>${esc(st.transcript)}</pre></details>` : ''}
    </div>`;
  }).join('');

  $('#results').innerHTML =
    `<div class="card">
       <h3>${esc(s.topic)}</h3>
       <div class="stat-row">
         <div class="stat green" data-tip="Really understands it."><b>${counts.green}</b><span>get it</span></div>
         <div class="stat amber" data-tip="Partly knows it, with clear gaps."><b>${counts.amber}</b><span>shaky</span></div>
         <div class="stat red" data-tip="Got little right — needs help."><b>${counts.red}</b><span>struggling</span></div>
       </div>
       <div class="label">Students</div>
       ${rows}
     </div>`;
}

// ================================================================== STUDENT
let chat = { history: [], covered: 0, digs: 0, topic: '', questions: [], done: false, name: '', code: '' };

$('#btnJoin').addEventListener('click', async () => {
  setMsg($('#joinMsg'), '');
  const code = $('#joinCode').value.trim().toLowerCase();
  const name = $('#studentName').value.trim();
  if (!code) return setMsg($('#joinMsg'), 'Enter the class code.');
  if (!name) return setMsg($('#joinMsg'), 'Enter your name.');
  try {
    const j = await api('/api/join?code=' + encodeURIComponent(code));
    chat = { history: [], covered: 0, digs: 0, topic: j.check.topic, questions: j.check.questions || [], done: false, name, code };
    $('#joinCard').classList.add('hidden');
    $('#checkCard').classList.remove('hidden');
    $('#checkTopic').textContent = j.className + ' — ' + j.check.topic;
    $('#chat').innerHTML = '';
    if (j.names && j.names.length) {
      $('#studentName').setAttribute('list', 'nameList');
    }
    await nextTurn();
  } catch (e) { setMsg($('#joinMsg'), e.message); }
});

function addBubble(who, text) {
  const d = document.createElement('div');
  d.className = 'bubble ' + who;
  d.textContent = text;
  $('#chat').appendChild(d);
  d.scrollIntoView({ block: 'end' });
}

async function nextTurn() {
  try {
    const j = await post('/api/chat', {
      topic: chat.topic, questions: chat.questions, history: chat.history, covered: chat.covered, digs: chat.digs
    });
    chat.history.push({ role: 'assistant', content: j.reply });
    chat.covered = j.covered;
    chat.digs = j.digs;
    addBubble('examiner', j.reply);
    if (j.done) {
      chat.done = true;
      $('#answer').disabled = true;
      $('#btnSend').disabled = true;
      await finish();
    } else {
      $('#answer').focus();
    }
  } catch (e) {
    addBubble('examiner', 'Sorry, something went wrong: ' + e.message);
  }
}

$('#btnSend').addEventListener('click', sendAnswer);
$('#answer').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAnswer(); });

async function sendAnswer() {
  const text = $('#answer').value.trim();
  if (!text || chat.done) return;
  $('#answer').value = '';
  chat.history.push({ role: 'user', content: text });
  addBubble('student', text);
  $('#btnSend').disabled = true;
  await nextTurn();
  $('#btnSend').disabled = false;
}

async function finish() {
  const transcript = chat.history
    .map(x => (x.role === 'user' ? 'Student: ' : 'Examiner: ') + x.content)
    .join('\n');
  try {
    const j = await post('/api/verdict', { topic: chat.topic, transcript });
    await post('/api/result', { code: chat.code, name: chat.name, transcript, verdict: j.verdict });
  } catch (e) {
    addBubble('examiner', '(Your teacher could not be notified: ' + e.message + ')');
  }
}

// ------------------------------------------------------------------ startup
(async () => {
  const params = new URLSearchParams(location.search);
  const join = params.get('join');
  if (join) {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    $('#tab-student').classList.add('active');
    $('#view-teacher').classList.add('hidden');
    $('#view-student').classList.remove('hidden');
    $('#joinCode').value = join;
  }
  try { await loadMe(); } catch {}
})();