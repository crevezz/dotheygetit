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
  if (!el) return;
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
  try { await navigator.clipboard.writeText(text); toast(label + ' copied'); }
  catch { toast('Press Ctrl+C to copy'); }
}
function when(ts) {
  const d = new Date(ts), now = new Date();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return 'Today ' + time;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday ' + time;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + time;
}
function levelsOf(students) {
  const L = { green: 0, amber: 0, red: 0, unclear: 0 };
  (students || []).forEach(st => {
    const v = st.verdict || {};
    const l = st.teacherLevel || v.level || 'unclear';
    if (l === 'green' || l === 'amber' || l === 'red') L[l]++;
    else L.unclear++;
  });
  return L;
}
function applySharedCopy() {
  document.querySelectorAll('[data-copy]').forEach(el => {
    const key = el.getAttribute('data-copy');
    if (COPY[key]) el.textContent = COPY[key];
  });
  document.querySelectorAll('[data-copy-tip]').forEach(el => {
    const key = el.getAttribute('data-copy-tip');
    if (COPY[key]) el.setAttribute('data-tip', COPY[key]);
  });
}
applySharedCopy();

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
let myClasses = [];
let activeClass = null;
let activeCheckId = null;
let checks = [];
let generated = [];
/* The questions and points from the last Generate click, before any edits.
   Create check compares the published text with this, so a pasted question
   is not marked against the points of whatever used to sit in that slot. */
let generatedOriginal = [];
let generatedMarks = [];
let resultFilter = 'all';
let pollTimer = null;
let hereTimer = null;
let liveTimer = null;

function onResetPage() {
  return location.pathname === '/reset' || location.pathname === '/reset/';
}

function showResetPage() {
  $('#signinCard').classList.add('hidden');
  $('#dash').classList.add('hidden');
  const tut = document.querySelector('.tutbar');
  if (tut) tut.classList.add('hidden');
  const token = window.__resetToken || '';
  const request = $('#resetRequest');
  const choose = $('#resetChoose');
  if (token) {
    request.classList.add('hidden');
    choose.classList.remove('hidden');
    $('#resetPass').focus();
  } else {
    choose.classList.add('hidden');
    request.classList.remove('hidden');
    $('#resetEmail').focus();
  }
}

async function boot() {
  if (onResetPage()) {
    showResetPage();
    return;
  }
  try { const j = await api('/api/me'); me = j.teacher; } catch { me = null; }
  if (me) {
    $('#signinCard').classList.add('hidden');
    $('#dash').classList.remove('hidden');
    $('#whoami').textContent = me.email + (me.role === 'admin' ? ' · owner' : '');
    await loadClasses();
    loadAdmin();
    startHere();
  } else {
    stopHere();
    stopLive();
    $('#signinCard').classList.remove('hidden');
    $('#dash').classList.add('hidden');
  }
}

/* While a teacher has this tab open, say so every few seconds. This is the
   teacher's own page, after they have signed in. A pupil join link never
   runs it, and it is not Google Analytics. */
function stopHere() { if (hereTimer) { clearInterval(hereTimer); hereTimer = null; } }
function startHere() {
  stopHere();
  if (!me) return;
  const ping = () => {
    if (!me || document.hidden) return;
    if (new URLSearchParams(location.search).get('join')) return;
    const tab = document.getElementById('tab-teacher');
    if (!tab || !tab.classList.contains('active')) return;
    api('/api/here').catch(() => {});
  };
  ping();
  hereTimer = setInterval(ping, 20000);
}

$('#btnLogin').addEventListener('click', () => doAuth('/api/login'));
$('#btnSignup').addEventListener('click', () => doAuth('/api/signup'));

const RESET_SENT = 'If that email has an account, a reset link is on its way. It lasts an hour and works once.';

$('#btnResetSend').addEventListener('click', async () => {
  setMsg($('#resetSendMsg'), '');
  const email = $('#resetEmail').value.trim();
  if (!email || email.indexOf('@') < 1) return setMsg($('#resetSendMsg'), 'Enter your email.');
  const btn = $('#btnResetSend');
  btn.disabled = true;
  try {
    const j = await post('/api/forgot', { email });
    setMsg($('#resetSendMsg'), j.message || RESET_SENT, true);
  } catch (e) {
    setMsg($('#resetSendMsg'), e.message);
  } finally {
    btn.disabled = false;
  }
});
$('#resetEmail').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btnResetSend').click();
});

$('#btnResetSave').addEventListener('click', async () => {
  setMsg($('#resetSaveMsg'), '');
  const password = $('#resetPass').value;
  const again = $('#resetPass2').value;
  if (password.length < 6) return setMsg($('#resetSaveMsg'), 'Six characters or more.');
  if (password !== again) return setMsg($('#resetSaveMsg'), 'Those two passwords do not match.');
  const btn = $('#btnResetSave');
  btn.disabled = true;
  try {
    await post('/api/reset', { token: window.__resetToken || '', password });
    window.__resetToken = '';
    $('#resetPass').value = '';
    $('#resetPass2').value = '';
    setMsg($('#resetSaveMsg'), 'Password saved. You can sign in with it now.', true);
  } catch (e) {
    setMsg($('#resetSaveMsg'), e.message);
    btn.disabled = false;
  }
});
$('#resetPass2').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btnResetSave').click();
});

async function doAuth(path) {
  setMsg($('#authMsg'), '');
  const email = $('#authEmail').value.trim();
  const password = $('#authPass').value;
  if (!email || !password) return setMsg($('#authMsg'), 'Enter your email and a password.');
  const inv = document.getElementById('authInvite');
  const invite = inv ? inv.value.trim() : '';
  const body = { email, password, invite };
  /* Only account creation records this. Logging in must not opt anyone back in. */
  if (path === '/api/signup') {
    const box = document.getElementById('authMarketingOptOut');
    body.marketing_opt_out = !!(box && box.checked);
  }
  try {
    await post(path, body);
    $('#authPass').value = '';
    await boot();
  } catch (e) { setMsg($('#authMsg'), e.message); }
}

/* invite-only gate: show the field only when the server is asking for one */
fetch('/api/gate').then(r => r.json()).then(g => {
  const el = document.getElementById('authInvite');
  if (el && g && g.inviteRequired) el.style.display = '';
}).catch(() => {});

/* --- feedback: goes straight to a private Discord channel, with the detail already attached --- */
const fbOpen = document.getElementById('fbOpen');
if (fbOpen) fbOpen.addEventListener('click', (e) => {
  e.preventDefault();
  const box = document.getElementById('fbBox');
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) document.getElementById('fbMsg').focus();
});
const fbSend = document.getElementById('fbSend');
if (fbSend) fbSend.addEventListener('click', async () => {
  const box = document.getElementById('fbBox');
  const msg = document.getElementById('fbMsg').value.trim();
  if (!msg) return document.getElementById('fbMsg').focus();
  fbSend.disabled = true;
  fbSend.textContent = 'Sending...';
  try {
    await post('/api/feedback', { message: msg, page: location.pathname + location.hash, ua: navigator.userAgent });
    document.getElementById('fbMsg').value = '';
    fbSend.textContent = 'Thank you';
    setTimeout(() => { box.classList.add('hidden'); fbSend.textContent = 'Send it'; fbSend.disabled = false; }, 2400);
  } catch (err) {
    fbSend.textContent = 'That did not send - try again';
    fbSend.disabled = false;
  }
});

$('#btnLogout').addEventListener('click', async () => {
  try { await post('/api/logout'); } catch {}
  me = null; myClasses = []; activeClass = null;
  stopHere();
  stopLive();
  $('#adminWrap').innerHTML = '';
  $('#classPanel').classList.add('hidden');
  await boot();
});

// ----------------------------------------------------------------- classes
/* The year group starts at Not set, every time. It used to be remembered from the
   last class, which meant a new class silently inherited last term's year group -
   and the dropdown sits next to the class name, so a teacher reading "Year 9" there
   reasonably thought it was picking the class. It is not: it is the year group, and
   it has to start empty so it is never mistaken for a choice already made. */

async function loadClasses() {
  try {
    const j = await api('/api/classes');
    myClasses = j.classes || [];
  } catch { myClasses = []; }
  renderClasses();
}

function renderClasses() {
  if (!myClasses.length) {
    $('#classList').innerHTML = '<p class="muted">No classes yet. A class is just a name and a code. Add one below — it only takes a name.</p>';
    return;
  }
  $('#classList').innerHTML = myClasses.map(c =>
    `<div class="classrow${activeClass && activeClass.id === c.id ? ' on' : ''}" data-id="${esc(c.id)}">
       <span class="crowmain">
         <strong>${esc(c.name)}</strong>
         <span class="small">${c.checks} check${c.checks === 1 ? '' : 's'}${c.year ? ' &middot; ' + esc(c.year) : ''}${c.code ? ' &middot; code <b>' + esc(c.code) + '</b>' : ''}</span>
       </span>
       <button class="small-btn cdel" data-del="${esc(c.id)}" data-name="${esc(c.name)}" data-checks="${c.checks}" data-tip="Delete this class, its code and every check in it.">Delete</button>
     </div>`
  ).join('');
  document.querySelectorAll('.classrow').forEach(row => {
    row.addEventListener('click', () => openClass(row.dataset.id));
  });
  document.querySelectorAll('.cdel').forEach(btn => btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const n = btn.dataset.checks;
    const q = 'Delete "' + btn.dataset.name + '"?\n\nThis also deletes ' + (n === '1' ? 'its 1 check' : 'its ' + n + ' checks') +
              ' and every answer in them. The join code stops working. This cannot be undone.';
    if (!confirm(q)) return;
    try {
      const j = await post('/api/class/delete', { classId: btn.dataset.del });
      toast('Deleted' + (j.deletedChecks ? ' — ' + j.deletedChecks + ' check(s) went with it' : ''));
      if (activeClass && activeClass.id === btn.dataset.del) {
        stopPolling(); activeClass = null; activeCheckId = null;
        $('#classPanel').classList.add('hidden');
        $('#results').innerHTML = '';
      }
      await loadClasses();
    } catch (err) { toast(err.message); }
  }));
}

$('#btnAddClass').addEventListener('click', async () => {
  setMsg($('#classMsg'), '');
  const name = $('#newClassName').value.trim();
  const year = $('#newClassYear') ? $('#newClassYear').value : '';
  if (!name) return setMsg($('#classMsg'), 'Type a class name first.');
  try {
    const j = await post('/api/class', { name, year });
    $('#newClassName').value = '';
    await loadClasses();
    openClass(j.class.id);
  } catch (e) { setMsg($('#classMsg'), e.message); }
});

$('#btnCloseClass').addEventListener('click', () => {
  stopPolling();
  activeClass = null;
  $('#classPanel').classList.add('hidden');
  renderClasses();
});

async function openClass(id) {
  const c = myClasses.find(x => x.id === id);
  if (!c) return;
  stopPolling();
  activeClass = c;
  activeCheckId = null;
  $('#classPanel').classList.remove('hidden');
  $('#classTitle').textContent = c.name;
  $('#classCode').textContent = c.code || '— — — —';
  $('#qwrap').classList.add('hidden');
  $('#btnCreateCheck').classList.add('hidden');
  $('#qlist').innerHTML = '';
  $('#results').innerHTML = '';
  $('#topic').value = '';
  $('#btnGenerate').textContent = '1. Generate questions';
  setMsg($('#checkMsg'), '');
  generated = [];
  generatedOriginal = [];
  generatedMarks = [];
  $('#liveBar').classList.add('hidden');
  $('#rosterEdit').classList.add('hidden');
  $('#rosterMsg').textContent = '';
  renderClasses();
  await loadChecks();
  await loadRoster();
}

$('#btnCopyCode').addEventListener('click', () => {
  if (activeClass && activeClass.code) copy(activeClass.code, 'Class code');
  else toast('Pick a class first');
});
$('#btnCopyLink').addEventListener('click', () => {
  if (activeClass && activeClass.code) copy(location.origin + '/?join=' + activeClass.code, 'Student link');
  else toast('Pick a class first');
});
$('#btnOpenStudent').addEventListener('click', () => {
  if (activeClass && activeClass.code) window.open(location.origin + '/?join=' + activeClass.code, '_blank');
});

/* ---- the class QR code: big enough for the whiteboard, or print it ---- */
function showQr() {
  if (!activeClass || !activeClass.code) return toast('Pick a class first');
  $('#qrTitle').textContent = (activeClass.name || 'This class') + ' — scan to join';
  $('#qrCode').textContent = activeClass.code;
  $('#qrImg').src = '/api/qr?code=' + encodeURIComponent(activeClass.code) + '&size=640';
  $('#qrWrap').classList.remove('hidden');
}
$('#btnQr').addEventListener('click', showQr);
$('#btnQrClose').addEventListener('click', () => $('#qrWrap').classList.add('hidden'));
$('#btnQrPrint').addEventListener('click', () => window.print());
$('#qrWrap').addEventListener('click', (e) => { if (e.target.id === 'qrWrap') $('#qrWrap').classList.add('hidden'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#qrWrap').classList.add('hidden'); });

/* ---- export the class as a spreadsheet ---- */
$('#btnExport').addEventListener('click', () => {
  if (!activeClass) return toast('Pick a class first');
  location.href = '/api/export?classId=' + encodeURIComponent(activeClass.id);
});

/* ---- change your own password ---- */
$('#btnPw').addEventListener('click', () => {
  const b = $('#pwBox');
  b.classList.toggle('hidden');
  if (!b.classList.contains('hidden')) $('#pwCurrent').focus();
});
$('#btnPwCancel').addEventListener('click', () => {
  $('#pwBox').classList.add('hidden');
  $('#pwCurrent').value = ''; $('#pwNext').value = '';
  setMsg($('#pwMsg'), '');
});
$('#btnPwSave').addEventListener('click', async () => {
  const current = $('#pwCurrent').value;
  const next = $('#pwNext').value;
  if (!current || !next) return setMsg($('#pwMsg'), 'Fill both boxes.');
  if (next.length < 6) return setMsg($('#pwMsg'), 'Six characters or more.');
  try {
    await post('/api/password', { current, next });
    $('#pwCurrent').value = ''; $('#pwNext').value = '';
    $('#pwBox').classList.add('hidden');
    setMsg($('#pwMsg'), '');
    toast('Password changed');
  } catch (e) { setMsg($('#pwMsg'), e.message); }
});

/* ---- one pupil, across every check ---- */
async function openPupil(name) {
  if (!activeClass) return;
  const real = String(name).replace(/ \(not on your list\)$/, '');
  $('#pupTitle').textContent = real;
  $('#pupMeta').textContent = 'Loading...';
  $('#pupBody').innerHTML = '';
  $('#pupWrap').classList.remove('hidden');
  try {
    const j = await api('/api/pupil?classId=' + encodeURIComponent(activeClass.id) + '&name=' + encodeURIComponent(real));
    const rs = j.results || [];
    const answered = rs.filter(r => r.verdict).length;
    $('#pupMeta').textContent = rs.length
      ? activeClass.name + ' · ' + rs.length + ' check' + (rs.length === 1 ? '' : 's') + ' · ' + answered + ' answered'
      : 'Nothing yet.';
    if (!rs.length) {
      $('#pupBody').innerHTML = '<p class="muted">They have not answered a check in this class yet.</p>';
      return;
    }
    $('#pupBody').innerHTML = rs.map(r => {
      const v = r.verdict || {};
      const lv = v.level || 'unclear';
      const bits = [];
      if (v.gets && v.gets !== COPY.verdictLabel(lv)) bits.push('<div><span class="k">Gets</span>' + esc(v.gets) + '</div>');
      if (v.shaky) bits.push('<div><span class="k">Shaky</span>' + esc(v.shaky) + '</div>');
      if (v.nextStep) bits.push('<div class="nextstep">' + esc(v.nextStep) + (v.nextTry ? '<div class="nexttry">' + esc(v.nextTry) + '</div>' : '') + '</div>');
      const said = r.transcript
        ? '<details class="said"><summary>What they actually said</summary><pre>' + esc(r.transcript) + '</pre></details>'
        : '';
      return '<div class="sresult lv-' + esc(lv) + '">' +
        '<div class="head"><span class="name">' + esc(r.topic) + '</span>' +
        '<span class="tag lv-' + esc(lv) + '">' + esc(COPY.verdictLabel(lv)) + '</span></div>' +
        '<div class="cmeta">' + esc(when(r.at)) + '</div>' +
        (bits.length ? '<div class="detail">' + bits.join('') + '</div>' : '') +
        said + '</div>';
    }).join('');
  } catch (e) { $('#pupMeta').textContent = e.message; }
}
$('#btnPupClose').addEventListener('click', () => $('#pupWrap').classList.add('hidden'));
$('#pupWrap').addEventListener('click', (e) => { if (e.target.id === 'pupWrap') $('#pupWrap').classList.add('hidden'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#pupWrap').classList.add('hidden'); });

// ------------------------------------------------------------- class list
$('#btnRosterEdit').addEventListener('click', () => {
  const box = $('#rosterEdit');
  box.classList.toggle('hidden');
  $('#btnRosterEdit').textContent = box.classList.contains('hidden') ? 'Edit list' : 'Cancel';
  if (!box.classList.contains('hidden')) $('#rosterText').focus();
});

$('#btnRosterSave').addEventListener('click', async () => {
  if (!activeClass) return;
  setMsg($('#rosterMsg'), 'Saving...');
  try {
    const j = await post('/api/roster', { classId: activeClass.id, names: $('#rosterText').value });
    setMsg($('#rosterMsg'), j.roster.length + ' names saved.', true);
    $('#rosterEdit').classList.add('hidden');
    $('#btnRosterEdit').textContent = 'Edit list';
    await loadRoster();
  } catch (e) { setMsg($('#rosterMsg'), e.message); }
});

async function loadRoster() {
  if (!activeClass) return;
  try {
    const j = await api('/api/pupils?classId=' + encodeURIComponent(activeClass.id));
    renderRoster(j);
  } catch { renderRoster({ roster: [], pupils: [] }); }
}

function renderRoster(j) {
  const roster = j.roster || [];
  const pups = j.pupils || [];
  const byName = {};
  pups.forEach(p => { byName[String(p.name).trim().toLowerCase()] = p; });

  const listed = roster.map(n => ({ name: n, results: (byName[n.toLowerCase()] || {}).results || [] }));
  const extra = pups.filter(p => !roster.some(n => n.toLowerCase() === String(p.name).trim().toLowerCase()))
                    .map(p => ({ name: p.name + ' (not on your list)', results: p.results }));

  const all = listed.concat(extra);
  $('#rosterText').value = roster.join('\n');

  if (!all.length) {
    $('#rosterView').innerHTML = 'No names yet. Paste your class list and pupils stop typing their own names.';
    return;
  }

  const dots = (results) => results.slice(-8).map(r =>
    `<i class="dot2 lv-${esc(r.level)}" data-tip="${esc(r.topic + ' — ' + when(r.at))}"></i>`).join('');

  $('#rosterView').innerHTML =
    `<div class="clegend"><b>${listed.length}</b> on your list${extra.length ? ' · <b>' + extra.length + '</b> not on it' : ''} &nbsp;·&nbsp; ${j.checks} check${j.checks === 1 ? '' : 's'}</div>` +
    all.map(p => `<div class="prow${p.results.length ? ' done' : ''}">
        <button class="pname plink" data-name="${esc(p.name)}" data-tip="${p.results.length ? 'Finished - click to see everything they did.' : 'Has not answered yet.'}">${esc(p.name)}${p.results.length ? ' <span class="pdone">done</span>' : ''}</button>
        <span class="pdots">${p.results.length ? dots(p.results) : '<span class="muted">no answers yet</span>'}</span>
      </div>`).join('');

  document.querySelectorAll('.plink').forEach(b => b.addEventListener('click', () => openPupil(b.dataset.name)));
}

// --------------------------------------------------------- generate questions
$('#btnGenerate').addEventListener('click', async () => {
  setMsg($('#checkMsg'), '');
  const topic = $('#topic').value.trim();
  if (!topic) return setMsg($('#checkMsg'), 'Type what you taught first.');
  $('#btnGenerate').disabled = true;
  $('#btnGenerate').textContent = 'Writing questions...';
  try {
    const j = await post('/api/generate', { topic, year: (activeClass && activeClass.year) || '' });
    generated = (j.questions || []).map(q => String(q || '').trim());
    generatedOriginal = generated.slice();
    generatedMarks = (j.marks || []).map(row => Array.isArray(row) ? row.slice() : []);
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
  $('#btnCreateCheck').disabled = true;
  try {
    const plan = planCheckMarks(generatedOriginal, generatedMarks, questions);
    let marks = plan.marks;
    /* Same questions, same order: keep the points already written. Removing
       one, or swapping two that were both generated, just moves those points.
       Only text the model has not seen yet is sent back to be marked. */
    if (plan.missing.length) {
      setMsg($('#checkMsg'), 'Updating the marking points...');
      const fresh = await post('/api/generate', {
        topic: $('#topic').value.trim(),
        year: (activeClass && activeClass.year) || '',
        questions: plan.missing.map(m => m.question),
        count: plan.missing.length
      });
      const backQ = (fresh.questions || []).map(q => String(q || '').trim());
      const backM = fresh.marks || [];
      plan.missing.forEach(m => {
        const at = backQ.indexOf(m.question);
        marks[m.index] = at >= 0 && Array.isArray(backM[at]) ? backM[at] : null;
      });
      if (marks.some(m => m == null)) throw new Error('Could not write marking points for the edited questions. Try again.');
    }
    const j = await post('/api/session', {
      classId: activeClass.id,
      topic: $('#topic').value.trim(),
      questions: plan.questions,
      marks
    });
    activeCheckId = j.check.id;
    $('#qwrap').classList.add('hidden');
    $('#btnCreateCheck').classList.add('hidden');
    $('#topic').value = '';
    $('#btnGenerate').textContent = '1. Generate questions';
    generated = [];
    generatedOriginal = [];
    generatedMarks = [];
    $('#liveText').textContent = 'Live now — students use code ' + activeClass.code;
    $('#liveBar').classList.remove('hidden');
    await loadChecks();
    await openCheck(activeCheckId);
    startPolling();
  } catch (e) { setMsg($('#checkMsg'), e.message); }
  $('#btnCreateCheck').disabled = false;
});

// ------------------------------------------------------------- past checks
async function loadChecks() {
  if (!activeClass) return;
  try {
    const j = await api('/api/sessions?classId=' + encodeURIComponent(activeClass.id));
    checks = j.checks || [];
  } catch { checks = []; }
  renderChecks();
}

function renderChecks() {
  if (!checks.length) {
    $('#checkList').innerHTML = '<p class="muted">No checks yet. Make one above.</p>';
    return;
  }
  $('#checkList').innerHTML = checks.map((c, i) => {
    const n = c.students || 0;
    const L = c.levels || levelsOf([]);
    const w = (v) => (n ? (v / n) * 100 : 0);
    const bar = n
      ? `<div class="cbar"><i class="g" style="width:${w(L.green)}%"></i><i class="a" style="width:${w(L.amber)}%"></i><i class="r" style="width:${w(L.red)}%"></i></div>
         <div class="clegend"><b>${L.green || 0}</b> ${esc(COPY.legendGot)} &nbsp;·&nbsp; <b>${L.amber || 0}</b> ${esc(COPY.legendPart)} &nbsp;·&nbsp; <b>${L.red || 0}</b> ${esc(COPY.legendNot)}</div>`
      : `<div class="cbar"></div><div class="clegend">Nobody has finished yet</div>`;
    const qs = (c.questions || []).map(q => `<li>${esc(q)}</li>`).join('');
    return `<div class="checkcard${activeCheckId === c.id ? ' on' : ''}${i === 0 ? ' fresh' : ''}" data-id="${esc(c.id)}">
      <div class="chead">
        <div>
          <div class="ctitle">${i === 0 ? '<span class="pill">Latest</span>' : ''}${esc(c.topic)}</div>
          <div class="cmeta">${esc(when(c.createdAt))} &nbsp;·&nbsp; ${n} finished</div>
        </div>
        ${qs ? `<button class="small-btn cq" data-q="${esc(c.id)}">See the questions</button>` : ''}
        <button class="small-btn ckill" data-kill="${esc(c.id)}" data-topic="${esc(c.topic)}" data-tip="Delete this check and every answer in it.">Delete</button>
      </div>
      ${bar}
      <div class="cqlist hidden" id="cq-${esc(c.id)}"><ol>${qs}</ol></div>
    </div>`;
  }).join('');

  document.querySelectorAll('.checkcard').forEach(card => {
    card.addEventListener('click', () => openCheck(card.dataset.id));
  });
  document.querySelectorAll('.cq').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const box = document.getElementById('cq-' + btn.dataset.q);
    if (!box) return;
    box.classList.toggle('hidden');
    btn.textContent = box.classList.contains('hidden') ? 'See the questions' : 'Hide the questions';
  }));
  document.querySelectorAll('.ckill').forEach(btn => btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('Delete the check "' + btn.dataset.topic + '"?\n\nEvery answer in it goes too. This cannot be undone.')) return;
    try {
      await post('/api/session/delete', { id: btn.dataset.kill });
      if (activeCheckId === btn.dataset.kill) { activeCheckId = null; $('#results').innerHTML = ''; }
      toast('Check deleted');
      await loadChecks();
      await loadRoster();
    } catch (err) { toast(err.message); }
  }));
}

function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
function startPolling() { stopPolling(); pollTimer = setInterval(() => openCheck(activeCheckId, true), 12000); }

async function openCheck(id, quiet) {
  if (!id) return;
  activeCheckId = id;
  if (!quiet) renderChecks();
  try {
    const j = await api('/api/session?id=' + encodeURIComponent(id));
    const s = j.check || {};
    drawResults(s, s.students || []);
    if (!quiet) renderChecks();
  } catch (e) {
    if (!quiet) $('#results').innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`;
  }
}

function drawResults(s, students) {
  /* the 12-second redraw rebuilds every card, so the folded ones are remembered by name */
  if (!drawResults.folded) drawResults.folded = new Set();
  if (!drawResults._mark) {
    drawResults._mark = true;
    document.addEventListener('click', (e) => {
      const head = e.target.closest && e.target.closest('.sresult > .head');
      if (head) {
        const name = head.querySelector('.name');
        if (name) {
          const n = name.textContent;
          drawResults.folded.has(n) ? drawResults.folded.delete(n) : drawResults.folded.add(n);
        }
      }
    }, true);
  }
  /* the teacher's override. Wired once, on the document, so it survives every redraw. */
  if (!drawResults._wired) {
    drawResults._wired = true;
    document.addEventListener('click', async (e) => {
      const b = e.target.closest && e.target.closest('.ovbtn');
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      /* Clicking a mark always SETS that mark. It used to toggle off when the button was
         already lit - so the one button a teacher could not press was the one already
         showing: they click green on a green pupil, it sends an empty level, the server
         clears the override, the row redraws green, and the button looks dead while amber
         and red work fine. Setting is idempotent now, the button lights on press rather
         than on reply, and the note says plainly which state you are in. */
      const lv = b.dataset.lv;
      const row = b.closest('.sresult');
      b.classList.add('on');
      const r = await post('/api/override', { sessionId: b.dataset.sid, name: b.dataset.name, level: lv });
      if (!r || !r.ok) { b.classList.remove('on'); return toast('Could not save that'); }
      const final = r.level || '';
      if (row) {
        row.querySelectorAll('.ovbtn').forEach(x => x.classList.toggle('on', x.dataset.lv === (final || r.aiLevel)));
        const tag = row.querySelector('.tag');
        if (tag) {
          const l = final || (row.dataset.ailevel || '');
          if (l) { tag.className = 'tag lv-' + l; tag.textContent = COPY.verdictLabel(l); }
        }
        let changed = row.querySelector('.changed');
        if (final) {
          if (!changed) {
            changed = document.createElement('span');
            changed.className = 'changed';
            if (tag) tag.after(changed);
          }
          changed.textContent = COPY.changedByYou;
        } else if (changed) changed.remove();
      }
      toast(final ? COPY.changedByYou : 'Back to the marking');
    });

    /* Fold a card down to the name and the colour. Thirty finished pupils is thirty long
       cards, and the teacher wants the board - who is red - not the essays. Click the name
       to fold, click again to open. Folded state is held on the element, so the 12-second
       redraw keeps it. */
    document.addEventListener('click', (e) => {
      const head = e.target.closest && e.target.closest('.sresult > .head');
      if (!head || (e.target.closest && e.target.closest('.ovbtn'))) return;
      if (window.getSelection && String(window.getSelection()).length) return;
      head.parentElement.classList.toggle('folded');
      if (!head.parentElement.querySelector('.fnote')) {
        const n = document.createElement('span');
        n.className = 'fnote';
        head.appendChild(n);
      }
      const n = head.querySelector('.fnote');
      const folded = head.parentElement.classList.contains('folded');
      n.textContent = folded ? 'show' : 'hide';
    });
  }

  if (!students.length) {
    $('#results').innerHTML =
      `<div class="card"><h3>${esc(s.topic || '')}</h3>
        <p class="muted">Nobody has finished yet. Give the class the code <b>${esc((activeClass && activeClass.code) || '')}</b> and leave this page open. It updates by itself.</p>
      </div>`;
    return;
  }

  const L = levelsOf(students);
  const noReasonCount = students.filter(st => (st.verdict || {}).noReason && !st.teacherLevel).length;
  const order = { red: 0, amber: 1, green: 2 };
  const shownLevel = (st) => st.teacherLevel || ((st.verdict && st.verdict.level) || 'unclear');
  const shown = students
    .filter(st => { const lv = shownLevel(st); if (resultFilter === 'all') return true; if (resultFilter === 'noreason') return !!(st.verdict && st.verdict.noReason) && !st.teacherLevel; return lv !== 'green'; })
    .slice()
    .sort((a, b) => {
      const la = order[shownLevel(a)] ?? 3;
      const lb = order[shownLevel(b)] ?? 3;
      if (la !== lb) return la - lb;
      return String(a.name).localeCompare(String(b.name));
    });

  /* The answers used to sit in one flat block, all the same colour, so a teacher had to
     work out which line was the question and which was the child. Now the examiner's
     questions are grey and the pupil's answers are bright with a coloured edge down the
     side - the eye finds the child's own words without reading a word of it. */
  const tlog = (t) => String(t || '').split('\n').filter(x => x.trim()).map(line => {
    const m = line.match(/^\s*([A-Za-z][A-Za-z ]{2,12}):\s*(.*)$/);
    if (!m) return `<div class="tline"><div class="tbody">${esc(line)}</div></div>`;
    const who = m[1].trim();
    const isQ = /^(examiner|teacher|question)$/i.test(who);
    return `<div class="tline ${isQ ? 'q' : 'a'}"><div class="twho">${esc(isQ ? 'Question' : 'Their answer')}</div><div class="tbody">${esc(m[2])}</div></div>`;
  }).join('');

  const rows = shown.map(st => {    const v = st.verdict || {};
    const lv = st.teacherLevel || v.level || 'unclear';
    const tip = st.teacherLevel ? COPY.tipYours : lv === 'green' ? COPY.tipGreen
              : lv === 'amber' ? COPY.tipAmber
              : lv === 'red' ? COPY.tipRed
              : COPY.unclear;
    /* The mark points ARE the evidence. The teacher set them, so seeing hit or missed
       against the pupil's own words is a claim they can check - which is the difference
       between a card that tells them something and a card that just has a colour on it. */
    const ev = Array.isArray(v.evidence) ? v.evidence : [];
    const gotAll = ev.reduce((n, e) => n + e.got, 0);
    const ofAll = ev.reduce((n, e) => n + e.total, 0);
    const notes = st.teacherLevel ? '' : (v.notes && v.notes !== COPY.verdictLabel(lv) ? v.notes : '');
    return `<div class="sresult lv-${esc(lv)}${drawResults.folded && drawResults.folded.has(String(st.name)) ? ' folded' : ''}" data-ailevel="${esc(v.level || '')}">
      <div class="head"><span class="name">${esc(st.name)}</span><span class="tag lv-${esc(lv)}" data-tip="${esc(tip)}">${esc(COPY.verdictLabel(lv))}</span>${st.teacherLevel ? `<span class="changed">${esc(COPY.changedByYou)}</span>` : ''}</div>
      ${notes ? `<div class="notes">${esc(notes)}</div>` : ''}
      ${ev.length ? `<div class="evwrap">
        <div class="evhead" data-tip="Key points from your mark scheme. A tick is one their answer showed. The words in quotes are exactly what the pupil typed.">${esc(COPY.countLine(gotAll, ofAll))}</div>
        ${ev.map(e => `<div class="evq">
          ${e.q ? `<div class="evqt">${esc(e.q)}</div>` : ''}
          <ul class="evlist">${e.points.map(p => `<li class="${p.hit ? 'hit' : 'miss'}">
            <span class="evmark" aria-label="${p.hit ? COPY.tickLabel : COPY.crossLabel}" data-tip="${p.hit ? 'Their answer showed this.' : 'Nothing they said showed this.'}">${p.hit ? COPY.tick : COPY.cross}</span>
            <span class="evt">${esc(p.t)}</span>
            ${p.said ? `<span class="evsaid">"${esc(p.said)}"</span>` : ''}
          </li>`).join('')}</ul>
        </div>`).join('')}
      </div>` : ''}
      <div class="detail">
        ${!ev.length && v.gets && v.gets !== COPY.verdictLabel(lv) ? `<div><span class="k" data-tip="What they truly understand.">Gets</span>${esc(v.gets)}</div>` : ''}
        ${!ev.length && v.shaky ? `<div><span class="k" data-tip="Where they are weak.">Shaky</span>${esc(v.shaky)}</div>` : ''}
        ${v.nextStep ? `<div class="nextstep" data-tip="What to go over with this pupil next.">${esc(v.nextStep)}${v.nextTry ? `<div class="nexttry">${esc(v.nextTry)}</div>` : ''}</div>` : ''}
        ${v.faked ? `<div class="warn" data-tip="Their answers sounded copied or AI-written.">Possible bluffing</div>` : ''}
      </div>
      <div class="ovrow">
        <span class="ovlab" data-tip="${esc(COPY.noticeShort)}">${esc(COPY.yourCall)}</span>
        ${['green', 'amber', 'red'].map(x =>
          `<button type="button" class="ovbtn${lv === x ? ' on' : ''}" aria-pressed="${lv === x}" data-sid="${esc(s.id)}" data-name="${esc(st.name)}" data-lv="${x}">${esc(COPY.buttonLabel(x))}</button>`).join('')}
      </div>
      ${st.transcript ? `<details class="transcript"><summary data-tip="Read the conversation word for word.">See their answers</summary><div class="tlog">${tlog(st.transcript)}</div></details>` : ''}
    </div>`;
  }).join('');

  const needHelp = L.amber + L.red + L.unclear;

  /* Read the class together. A mark point that most of them missed is usually how it was
     taught, not thirty separate pupils being weak - and that is the one thing a colour
     per child can never show. Only worth saying when it is a real pattern. */
  const classSize = students.length;
  const missTally = {};
  students.forEach(st => {
    const seen = new Set();
    ((st.verdict || {}).evidence || []).forEach(e => e.points.forEach(p => {
      if (p.hit || seen.has(p.t)) return;
      seen.add(p.t);
      if (!missTally[p.t]) missTally[p.t] = { t: p.t, names: new Set() };
      missTally[p.t].names.add(String(st.name || ''));
    }));
  });
  const worst = Object.keys(missTally).map(k => {
    const w = missTally[k];
    return { t: w.t, n: Math.min(w.names.size, classSize) };
  })
    .sort((a, b) => b.n - a.n)
    .filter(w => classSize >= 3 && w.n >= 2 && w.n <= classSize)
    .slice(0, 3);

  /* the point of the whole thing: not colours per child, but one list of who to
     go back to and what to do with them. Read together, the same gap shows up
     again and again - which usually means how it was taught, not who was off. */
  const todo = students
    .filter(st => shownLevel(st) !== 'green')
    .sort((a, b) => {
      const la = order[shownLevel(a)] ?? 3;
      const lb = order[shownLevel(b)] ?? 3;
      if (la !== lb) return la - lb;
      return String(a.name).localeCompare(String(b.name));
    })
    .map(st => {
      const v = st.verdict || {};
      return { name: st.name, lv: shownLevel(st), next: v.nextStep || v.shaky || '' };
    });

  $('#results').innerHTML =
    `<div class="card">
       <div class="srow"><h3>${esc(s.topic || '')}</h3><span class="small">updates by itself</span></div>
       <p class="guide">${esc(COPY.notice)}</p>
       <div class="stat-row">
         <div class="stat green" data-tip="${esc(COPY.tipGreen)}"><b>${L.green}</b><span>${esc(COPY.statGreen)}</span></div>
         <div class="stat amber" data-tip="${esc(COPY.tipAmber)}"><b>${L.amber}</b><span>${esc(COPY.statAmber)}</span></div>
         <div class="stat red" data-tip="${esc(COPY.tipRed)}"><b>${L.red}</b><span>${esc(COPY.statRed)}</span></div>
         <div class="stat green" data-tip="${esc(COPY.tipNoReason)}"><b>${noReasonCount}</b><span>${esc(COPY.statNoReason)}</span></div>
       </div>
       <p class="summary"><b>${students.length}</b> finished · <b>${needHelp}</b> need${needHelp === 1 ? 's' : ''} a hand</p>
       ${worst.length ? `<div class="lostit">
         <ul>${worst.map(w => `<li><div>${esc(COPY.reteachLine(w.t))}</div><div class="lostn">${esc(COPY.missedLine(w.n))}</div></li>`).join('')}</ul>
       </div>` : ''}
       ${todo.length ? `<div class="tomorrow">
         <div class="tline"><span class="tk">${esc(COPY.goBack(todo.length))}</span></div>
         <ul>${todo.map(t => `<li><i class="dot2 lv-${esc(t.lv)}"></i><b>${esc(t.name)}</b>${t.next ? '<span class="tnext">' + esc(t.next) + '</span>' : ''}</li>`).join('')}</ul>
       </div>` : ''}
       <div class="filters">
         <button data-f="all" class="${resultFilter === 'all' ? 'on' : ''}">Everyone (${students.length})</button>
         <button data-f="help" class="${resultFilter === 'help' ? 'on' : ''}">Needs help (${needHelp})</button>
         <button data-f="noreason" class="${resultFilter === 'noreason' ? 'on' : ''}">Right, no reason (${noReasonCount})</button>
       </div>
       ${rows || '<p class="muted">Nothing in this list.</p>'}
     </div>`;

  document.querySelectorAll('.filters button').forEach(b => b.addEventListener('click', () => {
    resultFilter = b.dataset.f;
    drawResults(s, students);
  }));
}

// ------------------------------------------------------------ owner / admin
function stopLive() { if (liveTimer) { clearInterval(liveTimer); liveTimer = null; } }
async function refreshLive() {
  if (!me || me.role !== 'admin') return;
  if (!document.getElementById('liveTeachers')) return;
  try {
    const j = await api('/api/admin/live');
    $('#liveTeachers').textContent = j.teachers;
    $('#livePupils').textContent = j.pupils;
    $('#liveChecks').textContent = j.checksRunning;
    const t = j.today || {};
    const piece = (n, one, many) => n + ' ' + (Number(n) === 1 ? one : many);
    $('#liveToday').textContent = 'Today: ' + piece(t.checks, 'check started', 'checks started') + ', ' + piece(t.answers, 'answer in', 'answers in') + ', ' + piece(t.teachers, 'teacher ran a check', 'teachers ran a check') + '. Right now means the last ' + j.windowMin + ' minutes. The pupil number is anonymous: answers that just came in. It is not saved, and it names nobody.';
    const stamp = document.getElementById('liveStamp');
    if (stamp) stamp.textContent = 'updated ' + new Date(j.asOf).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (e) {
    const stamp = document.getElementById('liveStamp');
    if (stamp) stamp.textContent = 'could not refresh';
  }
}
function startLive() {
  stopLive();
  refreshLive();
  liveTimer = setInterval(refreshLive, 15000);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && me && me.role === 'admin') refreshLive();
});

/* Owner directory. The list is filtered in the browser: one overview fetch,
   then search, sort, status and school run on that. lastActive is not stored.
   The server fills it from the newest check or answer already on the account.
   New = joined in the last 7 days. Active = a check or an answer in the last
   14 days. Needs a nudge = no class and no check (the owner is left out).
   Gone quiet = they have made something, and nothing for 21 days. */
const OWNER_PAGE = 25;
const OWNER_NEW_MS = 7 * 86400000;
const OWNER_ACTIVE_MS = 14 * 86400000;
const OWNER_QUIET_MS = 21 * 86400000;
const OWNER_FILTERS = [
  ['all', 'All'],
  ['new', 'New this week'],
  ['active', 'Active'],
  ['nudge', 'Needs a nudge'],
  ['quiet', 'Gone quiet']
];
const OWNER_FILTER_LABEL = {
  new: 'New this week',
  active: 'Active',
  nudge: 'Needs a nudge',
  quiet: 'Gone quiet'
};
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'outlook.co.uk',
  'live.com', 'live.co.uk', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'msn.com', 'btinternet.com', 'sky.com', 'virginmedia.com', 'talktalk.net', 'ntlworld.com',
  'proton.me', 'protonmail.com', 'pm.me'
]);
let adminTeachers = [];
let adminQuery = '';
let adminSort = 'newest';
let adminFilter = 'all';
let adminSchool = '';
let adminPage = 0;
let adminOpenId = '';
let adminSchoolsOpen = false;

function breakEmail(email) {
  return esc(email).replace(/([@.])/g, '$1<wbr>');
}
function nLabel(n, one, many) {
  const v = Number(n) || 0;
  return v + ' ' + (v === 1 ? one : many);
}
function schoolOf(email) {
  const s = String(email || '').toLowerCase().trim();
  const i = s.lastIndexOf('@');
  if (i < 0 || i === s.length - 1) return 'unknown';
  return s.slice(i + 1);
}
function isPersonalDomain(domain) {
  return PERSONAL_EMAIL_DOMAINS.has(String(domain || '').toLowerCase());
}
function whenJoined(ts) {
  if (!ts) return '—';
  const d = new Date(ts), now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-GB', sameYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: '2-digit' });
}
function whenCompact(ts) {
  if (!ts) return '—';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  const days = Math.floor((now - d) / 86400000);
  if (days > 0 && days < 14) return days + 'd ago';
  return whenJoined(ts);
}
function isoStamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function ownerFlags(t, now) {
  const joined = t.createdAt || 0;
  const last = t.lastActive || 0;
  const made = ((t.classes && t.classes.length) || 0) > 0 || (t.checkCount || 0) > 0;
  const owner = t.role === 'admin';
  const fresh = !!(joined && now - joined <= OWNER_NEW_MS);
  const active = !!(last && now - last <= OWNER_ACTIVE_MS);
  const nudge = !owner && !made;
  const quiet = !owner && made && !active && (
    (last && now - last > OWNER_QUIET_MS) ||
    (!last && joined && now - joined > OWNER_QUIET_MS)
  );
  return { owner, fresh, active, nudge, quiet };
}
function ownerBadge(flags) {
  if (flags.nudge) return { cls: 'nudge', text: 'Needs a nudge' };
  if (flags.active) return { cls: 'active', text: 'Active' };
  if (flags.quiet) return { cls: 'quiet', text: 'Gone quiet' };
  if (flags.fresh) return { cls: 'new', text: 'New' };
  if (flags.owner) return { cls: 'owner', text: 'Owner' };
  return null;
}
function ownerStatusText(flags) {
  const bits = [];
  if (flags.owner) bits.push('Owner');
  if (flags.fresh) bits.push('New this week');
  if (flags.active) bits.push('Active');
  if (flags.nudge) bits.push('Needs a nudge');
  if (flags.quiet) bits.push('Gone quiet');
  return bits.join('; ');
}
function ownerMatchQuery(x, q) {
  if (!q) return true;
  if (String(x.t.email || '').toLowerCase().includes(q)) return true;
  if (x.school.includes(q)) return true;
  const classes = x.t.classes || [];
  for (let i = 0; i < classes.length; i++) {
    const c = classes[i];
    if (String(c.name || '').toLowerCase().includes(q)) return true;
    if (String(c.code || '').toLowerCase().includes(q)) return true;
  }
  return false;
}
function ownerMatchFilter(flags, filter) {
  if (filter === 'new') return flags.fresh;
  if (filter === 'active') return flags.active;
  if (filter === 'nudge') return flags.nudge;
  if (filter === 'quiet') return flags.quiet;
  return true;
}
function ownerCompare(a, b, sort) {
  const ta = a.t, tb = b.t;
  let diff = 0;
  if (sort === 'active') {
    diff = (tb.studentCount || 0) - (ta.studentCount || 0)
      || (tb.checkCount || 0) - (ta.checkCount || 0)
      || (tb.lastActive || 0) - (ta.lastActive || 0);
  } else if (sort === 'last') {
    diff = (tb.lastActive || 0) - (ta.lastActive || 0)
      || (tb.createdAt || 0) - (ta.createdAt || 0);
  } else if (sort === 'checks') {
    diff = (tb.checkCount || 0) - (ta.checkCount || 0)
      || (tb.studentCount || 0) - (ta.studentCount || 0)
      || (tb.lastActive || 0) - (ta.lastActive || 0);
  } else {
    diff = (tb.createdAt || 0) - (ta.createdAt || 0);
  }
  if (diff) return diff;
  return String(ta.email || '').localeCompare(String(tb.email || ''));
}
function ownerSchoolsOf(list) {
  const map = new Map();
  for (const x of list) {
    let s = map.get(x.school);
    if (!s) {
      s = {
        domain: x.school, teachers: 0, classes: 0, checks: 0, answers: 0,
        personal: isPersonalDomain(x.school)
      };
      map.set(x.school, s);
    }
    s.teachers++;
    s.classes += (x.t.classes || []).length;
    s.checks += x.t.checkCount || 0;
    s.answers += x.t.studentCount || 0;
  }
  const schools = Array.from(map.values());
  schools.sort((a, b) => b.teachers - a.teachers || b.checks - a.checks || a.domain.localeCompare(b.domain));
  return schools;
}
function ownerSlice(now) {
  const q = adminQuery.trim().toLowerCase();
  const decorated = adminTeachers.map(t => ({
    t, flags: ownerFlags(t, now || Date.now()), school: schoolOf(t.email)
  }));
  const searched = decorated.filter(x => ownerMatchQuery(x, q));
  const inSchool = adminSchool ? searched.filter(x => x.school === adminSchool) : searched;
  const counts = { all: inSchool.length, new: 0, active: 0, nudge: 0, quiet: 0 };
  for (const x of inSchool) {
    if (x.flags.fresh) counts.new++;
    if (x.flags.active) counts.active++;
    if (x.flags.nudge) counts.nudge++;
    if (x.flags.quiet) counts.quiet++;
  }
  const matched = inSchool.filter(x => ownerMatchFilter(x.flags, adminFilter));
  matched.sort((a, b) => ownerCompare(a, b, adminSort));
  const schoolSource = searched.filter(x => ownerMatchFilter(x.flags, adminFilter));
  let schools = ownerSchoolsOf(schoolSource);
  if (adminSchool && !schools.some(s => s.domain === adminSchool)) {
    schools = schools.concat([{
      domain: adminSchool, teachers: 0, classes: 0, checks: 0, answers: 0,
      personal: isPersonalDomain(adminSchool)
    }]);
  }
  const allTotals = {
    teachers: schoolSource.length,
    classes: schoolSource.reduce((n, x) => n + (x.t.classes || []).length, 0),
    checks: schoolSource.reduce((n, x) => n + (x.t.checkCount || 0), 0),
    answers: schoolSource.reduce((n, x) => n + (x.t.studentCount || 0), 0)
  };
  const pages = Math.max(1, Math.ceil(matched.length / OWNER_PAGE) || 1);
  if (adminPage > pages - 1) adminPage = pages - 1;
  if (adminPage < 0) adminPage = 0;
  const start = adminPage * OWNER_PAGE;
  return {
    counts, matched, schools, allTotals, pages, start,
    from: matched.length ? start + 1 : 0,
    to: Math.min(start + OWNER_PAGE, matched.length),
    pageRows: matched.slice(start, start + OWNER_PAGE),
    total: adminTeachers.length
  };
}
function ownerPills(t, flags) {
  const html = [];
  if (me && t.id === me.id) html.push('<span class="od-pill owner">You</span>');
  const b = ownerBadge(flags);
  if (b && !(me && t.id === me.id && b.cls === 'owner')) {
    html.push('<span class="od-pill ' + b.cls + '">' + esc(b.text) + '</span>');
  }
  return html.join('');
}
function ownerClassLine(c) {
  const bits = [
    nLabel(c.checks || 0, 'check', 'checks'),
    nLabel(c.students || 0, 'answer', 'answers')
  ];
  if (c.lastAt) bits.push('last ' + whenCompact(c.lastAt));
  const title = esc(c.name || 'Untitled class') + (c.year ? ' · ' + esc(c.year) : '');
  return '<div class="od-line"><span class="od-cname">' + title + '</span><b class="od-code">' + esc(c.code || '') + '</b><span class="od-cmeta">' + esc(bits.join(' · ')) + '</span></div>';
}
function ownerCheckLine(c) {
  const bits = [];
  if (c.className) bits.push(esc(c.className));
  if (c.at) bits.push(esc(when(c.at)));
  bits.push(nLabel(c.answers || 0, 'answer', 'answers'));
  if (c.lastAnswerAt && c.at && c.lastAnswerAt - c.at > 120000) bits.push('last answer ' + esc(when(c.lastAnswerAt)));
  return '<div class="od-line"><span class="od-cname">' + esc(c.topic || 'Untitled check') + '</span><span class="od-cmeta">' + bits.join(' · ') + '</span></div>';
}
function ownerDetail(t) {
  const classes = t.classes || [];
  const checks = t.recentChecks || [];
  const classHtml = classes.length
    ? classes.map(ownerClassLine).join('')
    : '<p class="muted tiny">No classes yet.</p>';
  const checkHtml = checks.length
    ? checks.map(ownerCheckLine).join('')
    : '<p class="muted tiny">No checks yet.</p>';
  const more = t.checkCount > checks.length
    ? '<p class="tiny muted">Latest ' + checks.length + ' of ' + t.checkCount + '.</p>'
    : '';
  const removable = t.role !== 'admin' && !(me && t.id === me.id);
  const remove = removable
    ? '<div class="od-remove"><button type="button" class="ghost tdel" data-id="' + esc(t.id) + '" data-email="' + esc(t.email) + '" data-classes="' + classes.length + '" data-checks="' + (t.checkCount || 0) + '" data-answers="' + (t.studentCount || 0) + '">Remove teacher</button><p class="tiny muted od-warn">This deletes the account, their classes, checks and answers, and signs them out. It asks you to confirm first. It cannot be undone.</p></div>'
    : '';
  return '<div class="od-detail"><div class="od-emailfull">' + breakEmail(t.email) + '</div>'
    + '<div class="od-k">Classes</div>' + classHtml
    + '<div class="od-k">Recent checks</div>' + checkHtml + more
    + remove + '</div>';
}
function ownerRow(x) {
  const t = x.t;
  const open = adminOpenId === t.id;
  const badge = ownerBadge(x.flags);
  const status = badge ? ' st-' + badge.cls : '';
  const meta = whenJoined(t.createdAt) + ' · ' + (t.lastActive ? whenCompact(t.lastActive) : 'never active')
    + ' · ' + nLabel((t.classes || []).length, 'class', 'classes')
    + ' · ' + nLabel(t.checkCount || 0, 'check', 'checks')
    + ' · ' + nLabel(t.studentCount || 0, 'answer', 'answers');
  const label = (t.email || 'Teacher') + ', ' + x.school
    + ', joined ' + whenJoined(t.createdAt)
    + ', last active ' + (t.lastActive ? whenCompact(t.lastActive) : 'never')
    + ', ' + nLabel((t.classes || []).length, 'class', 'classes')
    + ', ' + nLabel(t.checkCount || 0, 'check', 'checks')
    + ', ' + nLabel(t.studentCount || 0, 'answer', 'answers')
    + (open ? ', hide details' : ', show details');
  return '<div class="od-row' + status + (open ? ' open' : '') + '">'
    + '<button type="button" class="od-main od-grid" data-id="' + esc(t.id) + '" aria-expanded="' + (open ? 'true' : 'false') + '" aria-label="' + esc(label) + '" title="' + esc(t.email) + '">'
    + '<span class="od-chev" aria-hidden="true"></span>'
    + '<span class="od-who"><span class="od-email">' + breakEmail(t.email) + '</span>'
    + '<span class="od-school"><span class="od-dom" title="' + esc(x.school + (isPersonalDomain(x.school) ? ' · personal email' : '')) + '">' + esc(x.school) + '</span>' + ownerPills(t, x.flags) + '</span></span>'
    + '<span class="od-joined od-hide-sm">' + esc(whenJoined(t.createdAt)) + '</span>'
    + '<span class="od-last od-hide-sm">' + esc(t.lastActive ? whenCompact(t.lastActive) : '—') + '</span>'
    + '<span class="od-num od-hide-sm" title="Classes">' + (t.classes || []).length + '</span>'
    + '<span class="od-num od-hide-sm" title="Checks">' + (t.checkCount || 0) + '</span>'
    + '<span class="od-num od-hide-sm" title="Answers">' + (t.studentCount || 0) + '</span>'
    + '<span class="od-mmeta">' + esc(meta) + '</span>'
    + '</button>'
    + (open ? ownerDetail(t) : '')
    + '</div>';
}
function ownerSchoolButton(domain, label, personal, totals, on) {
  return '<button type="button" class="od-sch' + (on ? ' on' : '') + '" data-school="' + esc(domain) + '" aria-pressed="' + (on ? 'true' : 'false') + '">'
    + '<span class="od-schname">' + esc(label) + (personal ? '<i class="od-personal">personal</i>' : '') + '</span>'
    + '<span class="od-schmeta">' + nLabel(totals.teachers, 'teacher', 'teachers')
    + ' · ' + nLabel(totals.classes, 'class', 'classes')
    + ' · ' + nLabel(totals.checks, 'check', 'checks')
    + ' · ' + nLabel(totals.answers, 'answer', 'answers') + '</span></button>';
}
function ownerCountText(view) {
  const n = view.matched.length;
  const narrowed = !!(adminQuery.trim() || adminFilter !== 'all' || adminSchool);
  const noun = n === 1 ? 'teacher' : 'teachers';
  if (!view.total) return 'Nobody has signed up yet.';
  if (!n) return 'No teachers match.';
  let text = n <= OWNER_PAGE
    ? (n + ' ' + noun + (narrowed ? ' of ' + view.total : ''))
    : ('Showing ' + view.from + '–' + view.to + ' of ' + n + (narrowed ? ' (' + view.total + ' on the account)' : ''));
  if (adminFilter !== 'all' && OWNER_FILTER_LABEL[adminFilter]) text += ' · ' + OWNER_FILTER_LABEL[adminFilter];
  if (adminSchool) text += ' · ' + adminSchool;
  return text;
}
function ownerDynamicHtml(view) {
  const filters = '<div class="filters od-filters" role="group" aria-label="Teacher status">'
    + OWNER_FILTERS.map(([id, label]) =>
      '<button type="button" data-filter="' + id + '" class="' + (adminFilter === id ? 'on' : '') + '" aria-pressed="' + (adminFilter === id ? 'true' : 'false') + '">'
      + label + ' (' + view.counts[id] + ')</button>'
    ).join('')
    + '</div>'
    + '<p class="tiny muted od-hint">New this week: joined in the last 7 days. Active: a check or an answer in the last 14 days. Needs a nudge: signed up, and still no class or check. Gone quiet: they have made something, and nothing for 21 days.</p>';
  const schoolButtons = ownerSchoolButton('', 'All schools', false, view.allTotals, !adminSchool)
    + view.schools.map(s => ownerSchoolButton(s.domain, s.domain, s.personal, s, adminSchool === s.domain)).join('');
  const busiest = view.schools[0];
  const schoolSummary = adminSchool
    ? adminSchool
    : (busiest ? busiest.domain + ' · ' + nLabel(busiest.teachers, 'teacher', 'teachers') : 'All schools');
  const schools = '<details class="od-schools" id="ownerSchools"' + (adminSchoolsOpen ? ' open' : '') + '>'
    + '<summary><span>Schools <b>' + view.schools.length + '</b></span><span class="small">' + esc(schoolSummary) + '</span></summary>'
    + '<div class="od-schscroll">' + schoolButtons + '</div></details>';
  const narrowed = !!(adminQuery.trim() || adminFilter !== 'all' || adminSchool);
  const count = '<div class="od-count"><p class="small">' + esc(ownerCountText(view)) + '</p>'
    + (narrowed ? '<button type="button" class="od-clear" id="ownerClear">Clear</button>' : '')
    + '</div>';
  let list;
  if (!view.total) list = '<p class="muted">Nobody has signed up yet.</p>';
  else if (!view.matched.length) list = '<p class="muted">No teachers match. Clear the search or pick All.</p>';
  else {
    list = '<div class="od-head od-grid" aria-hidden="true"><span></span><span>Teacher</span><span>Joined</span><span>Last active</span><span class="n" title="Classes">Cls</span><span class="n" title="Checks">Chk</span><span class="n" title="Answers">Ans</span></div>'
      + view.pageRows.map(ownerRow).join('');
  }
  const pager = view.matched.length > OWNER_PAGE
    ? '<div class="od-pager"><button type="button" class="small-btn" data-page="prev"' + (adminPage === 0 ? ' disabled' : '') + '>Previous</button><span class="small">Page ' + (adminPage + 1) + ' of ' + view.pages + '</span><button type="button" class="small-btn" data-page="next"' + (adminPage >= view.pages - 1 ? ' disabled' : '') + '>Next</button></div>'
    : '';
  return filters + schools + count + list + pager;
}
function paintOwnerDynamic() {
  const host = document.getElementById('ownerDynamic');
  if (!host) return;
  host.innerHTML = ownerDynamicHtml(ownerSlice(Date.now()));
}
function exportOwners() {
  const view = ownerSlice(Date.now());
  if (!view.matched.length) { toast('Nothing to export'); return; }
  const rows = [[
    'email', 'school', 'personal_email', 'role', 'joined', 'last_active',
    'classes', 'checks', 'answers', 'status', 'class_list'
  ]];
  view.matched.forEach(x => {
    const t = x.t;
    const classes = t.classes || [];
    const list = classes.map(c => {
      const name = c.name || 'Untitled';
      const year = c.year ? ', ' + c.year : '';
      const code = c.code ? ' (' + c.code + ')' : '';
      return name + year + code;
    }).join(' | ');
    rows.push([
      t.email || '',
      x.school,
      isPersonalDomain(x.school) ? 'yes' : 'no',
      t.role || 'teacher',
      isoStamp(t.createdAt),
      isoStamp(t.lastActive),
      classes.length,
      t.checkCount || 0,
      t.studentCount || 0,
      ownerStatusText(x.flags),
      list
    ]);
  });
  const csv = '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  a.href = URL.createObjectURL(blob);
  a.download = 'getit-teachers-' + day + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast('Exported ' + nLabel(view.matched.length, 'teacher', 'teachers'));
}
function statNum(n) {
  const v = Number(n);
  return Number.isFinite(v) ? String(v) : '0';
}
function ownerShell(t) {
  const sorts = [
    ['newest', 'Newest'],
    ['active', 'Most active'],
    ['last', 'Last active'],
    ['checks', 'Most checks']
  ];
  return '<div class="card ownercard">'
    + '<div class="livebar tight"><span class="dot"></span><span>On it right now</span><span class="small" id="liveStamp">checking…</span></div>'
    + '<div class="stat-row" aria-live="polite">'
    + '<div class="stat green"><b id="liveTeachers">–</b><span>teachers</span></div>'
    + '<div class="stat"><b id="livePupils">–</b><span>pupils</span></div>'
    + '<div class="stat amber"><b id="liveChecks">–</b><span>checks running</span></div>'
    + '</div>'
    + '<p class="muted tiny" id="liveToday">Today’s checks and answers appear here.</p>'
    + '<div class="srow" style="margin-top:18px"><h3>Owner view</h3><span class="small">Open a row for classes, codes and recent checks. Remove teacher is inside the row, and it asks before it deletes.</span></div>'
    + '<div class="stat-row">'
    + '<div class="stat green"><b>' + statNum(t.teachers) + '</b><span>teachers</span></div>'
    + '<div class="stat amber"><b>' + statNum(t.classes) + '</b><span>classes</span></div>'
    + '<div class="stat"><b>' + statNum(t.checks) + '</b><span>checks</span></div>'
    + '<div class="stat"><b>' + statNum(t.students) + '</b><span>answers</span></div>'
    + '</div>'
    + '<div class="btnrow">'
    + '<button type="button" id="btnSelftest" class="primary" data-tip="Sends one test question to the AI to check it is still working.">Test the AI</button>'
    + '<button type="button" id="btnErrors" class="ghost" data-tip="Show the last 20 things that went wrong.">Check for errors</button>'
    + '</div>'
    + '<p class="msg" id="healthMsg"></p>'
    + '<div id="errorList"></div>'
    + '<div class="od-tools">'
    + '<input id="ownerSearch" type="search" placeholder="Search email, school, or class" aria-label="Search teachers by email, school, or class" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(adminQuery) + '"/>'
    + '<label class="od-sortlab" for="ownerSort">Sort <select id="ownerSort" class="od-sort" title="Most active is answers, then checks. Last active is the newest check or answer.">'
    + sorts.map(([v, label]) => '<option value="' + v + '"' + (adminSort === v ? ' selected' : '') + '>' + label + '</option>').join('')
    + '</select></label>'
    + '<button type="button" id="btnExport" class="small-btn">Export CSV</button>'
    + '</div>'
    + '<div id="ownerDynamic"></div>'
    + '</div>';
}
async function loadAdmin() {
  if (!me || me.role !== 'admin') { $('#adminWrap').innerHTML = ''; stopLive(); return; }
  try {
    const j = await api('/api/admin/overview');
    adminTeachers = j.teachers || [];
    const totals = j.totals || { teachers: 0, classes: 0, checks: 0, students: 0 };
    $('#adminWrap').innerHTML = ownerShell(totals);
    paintOwnerDynamic();
    startLive();
  } catch (e) {
    $('#adminWrap').innerHTML = '';
    stopLive();
  }
}
function onOwnerInput(e) {
  if (!e.target || e.target.id !== 'ownerSearch') return;
  adminQuery = e.target.value;
  adminPage = 0;
  paintOwnerDynamic();
}
function onOwnerChange(e) {
  if (!e.target || e.target.id !== 'ownerSort') return;
  const next = e.target.value;
  adminSort = (next === 'active' || next === 'last' || next === 'checks') ? next : 'newest';
  adminPage = 0;
  paintOwnerDynamic();
}
function onOwnerToggle(e) {
  if (e.target && e.target.id === 'ownerSchools') adminSchoolsOpen = !!e.target.open;
}
async function onOwnerClick(e) {
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('#btnExport')) { exportOwners(); return; }
  if (t.closest('#btnSelftest')) {
    setMsg($('#healthMsg'), 'Asking the AI...');
    try {
      const r = await post('/api/admin/selftest');
      if (r.ok) setMsg($('#healthMsg'), 'AI working · ' + r.model + ' · replied "' + r.reply + '" in ' + (r.ms / 1000).toFixed(1) + 's', true);
      else setMsg($('#healthMsg'), 'AI NOT WORKING — ' + r.error);
    } catch (err) { setMsg($('#healthMsg'), err.message); }
    return;
  }
  if (t.closest('#btnErrors')) {
    setMsg($('#healthMsg'), '');
    try {
      const r = await api('/api/admin/errors');
      const up = r.uptimeSec < 90 ? r.uptimeSec + 's' : Math.round(r.uptimeSec / 60) + ' min';
      const head = '<p class="muted">Up ' + esc(up) + ' · storage: <b>' + esc(r.storage) + '</b>' + (r.storage === 'file' ? ' (data will be lost on restart!)' : '') + '</p>';
      $('#errorList').innerHTML = head + (r.errors.length
        ? r.errors.map(x => '<div class="sresult lv-red"><div class="head"><span class="name">' + esc(when(x.at)) + '</span><span class="tag">' + esc(x.where) + '</span></div><div class="notes">' + esc(x.message) + '</div></div>').join('')
        : '<p class="muted">No errors. </p>');
    } catch (err) { setMsg($('#healthMsg'), err.message); }
    return;
  }
  if (t.closest('#ownerClear')) {
    adminQuery = '';
    adminFilter = 'all';
    adminSchool = '';
    adminPage = 0;
    const input = document.getElementById('ownerSearch');
    if (input) input.value = '';
    paintOwnerDynamic();
    return;
  }
  const del = t.closest('.tdel');
  if (del) {
    /* Removing a teacher takes their classes, their checks and every answer in them,
       so the confirm has to say the real numbers out loud before it asks. */
    const n = Number(del.dataset.classes) || 0;
    const k = Number(del.dataset.checks) || 0;
    const a = Number(del.dataset.answers) || 0;
    const bits = [];
    if (n) bits.push(n === 1 ? 'their 1 class' : 'their ' + n + ' classes');
    if (k) bits.push(k === 1 ? '1 check' : k + ' checks');
    if (a) bits.push(a === 1 ? '1 answer' : a + ' answers');
    const q = 'Remove ' + del.dataset.email + '?\n\n' + (bits.length
      ? 'This also deletes ' + bits.join(', ') + '. The join codes stop working, and their browser is signed out.\n\n'
      : 'They have not made anything yet, so nothing else goes.\n\n') + 'This cannot be undone.';
    if (!confirm(q)) return;
    try {
      const r = await post('/api/admin/teacher/delete', { teacherId: del.dataset.id });
      if (adminOpenId === del.dataset.id) adminOpenId = '';
      toast('Removed ' + r.email + (r.deletedClasses ? ' and ' + r.deletedClasses + ' class(es)' : ''));
      await loadAdmin();
    } catch (err) { toast(err.message); }
    return;
  }
  const filterBtn = t.closest('[data-filter]');
  if (filterBtn && filterBtn.closest('#ownerDynamic')) {
    adminFilter = filterBtn.getAttribute('data-filter') || 'all';
    adminPage = 0;
    paintOwnerDynamic();
    return;
  }
  const schoolBtn = t.closest('[data-school]');
  if (schoolBtn && schoolBtn.closest('#ownerSchools')) {
    adminSchool = schoolBtn.getAttribute('data-school') || '';
    adminPage = 0;
    paintOwnerDynamic();
    return;
  }
  const pageBtn = t.closest('[data-page]');
  if (pageBtn && !pageBtn.disabled) {
    const dir = pageBtn.getAttribute('data-page');
    if (dir === 'next') adminPage++;
    else if (dir === 'prev') adminPage--;
    paintOwnerDynamic();
    return;
  }
  const main = t.closest('.od-main');
  if (main) {
    const id = main.getAttribute('data-id') || '';
    adminOpenId = adminOpenId === id ? '' : id;
    paintOwnerDynamic();
  }
}
function bindOwner() {
  const wrap = document.getElementById('adminWrap');
  if (!wrap || wrap.dataset.ownerBound) return;
  wrap.dataset.ownerBound = '1';
  wrap.addEventListener('click', onOwnerClick);
  wrap.addEventListener('input', onOwnerInput);
  wrap.addEventListener('search', onOwnerInput);
  wrap.addEventListener('change', onOwnerChange);
  wrap.addEventListener('toggle', onOwnerToggle, true);
}

bindOwner();
boot();

// =================================================================== STUDENT
let chat = { history: [], covered: 0, digs: 0, topic: '', questions: [], done: false, name: '', code: '' };
let sending = false;

let joinCache = null;

function renderNameInput(keep) {
  const area = $('#nameArea');
  area.innerHTML = '<label>Your name</label><input id="studentName" placeholder="e.g. Amira K" autocomplete="off" data-tip="So your teacher knows it is you."/>';
  if (keep) $('#studentName').value = keep;
}

function renderNamePicker(names) {
  const area = $('#nameArea');
  const old = document.getElementById('studentName');
  const typed = (old && old.tagName !== 'SELECT' && old.value ? old.value : '').trim();
  if (!names || !names.length) {
    /* nothing to pick from - a plain box, with anything they had already typed left in place */
    renderNameInput(typed);
    return;
  }
  area.innerHTML =
    '<label>Your name</label>' +
    '<select id="studentName">' +
    '<option value="">' + esc(COPY.pickName) + '</option>' +
    '<option value="__other">' + esc(COPY.addName) + '</option>' +
    names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('') +
    '</select>' +
    '<p class="namehint">' + esc(COPY.joinHint) + '</p>' +
    '<input id="otherName" class="hidden" placeholder="Type your full name" style="margin-top:8px"/>';
  /* If they typed their name into the box before the list arrived, keep it - never wipe what a
     pupil has just typed. A match is preselected; anything else is offered as "not here". */
  const sel = $('#studentName');
  if (typed) {
    const match = names.find(n => n.trim().toLowerCase() === typed.toLowerCase());
    if (match) sel.value = match;
    else {
      sel.value = '__other';
      const other = $('#otherName');
      other.classList.remove('hidden');
      other.value = typed;
    }
  }
  sel.addEventListener('change', () => {
    const other = $('#otherName');
    if (sel.value === '__other') { other.classList.remove('hidden'); other.focus(); }
    else other.classList.add('hidden');
  });
}

function pickedName() {
  const el = document.getElementById('studentName');
  if (el && el.tagName === 'SELECT') {
    if (el.value === '__other') return ($('#otherName').value || '').trim();
    return el.value;
  }
  return (el && el.value ? el.value : '').trim();
}

/* Look the class up as soon as the code is typed, so the name list is on screen before the
   pupil presses Start. Two presses to get in was a needless gate - one press now. */
let nameLookupTimer = null;
async function lookupNames() {
  const code = $('#joinCode').value.trim().toLowerCase();
  if (!code) return;
  const el = document.getElementById('studentName');
  if (el && el.tagName === 'SELECT') return;          // list already showing
  if (joinCache && joinCache.code === code) return;   // already looked up
  try {
    const j = await api('/api/join?code=' + encodeURIComponent(code));
    if ($('#joinCode').value.trim().toLowerCase() !== code) return;  // they kept typing
    joinCache = { code, data: j };
    if ((j.names || []).length) renderNamePicker(j.names);
  } catch (e) {
    /* a wrong or not-ready code is reported when they press Start, not while typing */
  }
}
$('#joinCode').addEventListener('input', () => {
  joinCache = null;
  const el = document.getElementById('studentName');
  if (el && el.tagName === 'SELECT') renderNameInput('');   // code changed - drop the old list
  clearTimeout(nameLookupTimer);
  nameLookupTimer = setTimeout(lookupNames, 450);
});
$('#joinCode').addEventListener('blur', () => { clearTimeout(nameLookupTimer); lookupNames(); });

$('#btnJoin').addEventListener('click', async () => {
  setMsg($('#joinMsg'), '');
  const code = $('#joinCode').value.trim().toLowerCase();
  if (!code) return setMsg($('#joinMsg'), 'Enter the class code.');

  const el = document.getElementById('studentName');
  const hasPicker = !!(el && el.tagName === 'SELECT');

  // No name list on screen yet (they pressed Start before the list loaded): look the class up
  // and show it. Nothing is collected yet, so this is not where the consent gate belongs.
  if (!hasPicker && !(joinCache && joinCache.code === code)) {
    $('#btnJoin').disabled = true;
    try {
      const j = await api('/api/join?code=' + encodeURIComponent(code));
      joinCache = { code, data: j };
      if ((j.names || []).length) {
        renderNamePicker(j.names);
        setMsg($('#joinMsg'), COPY.joinHint, true);
        $('#btnJoin').disabled = false;
        return;
      }
    } catch (e) {
      setMsg($('#joinMsg'), e.message);
      $('#btnJoin').disabled = false;
      return;
    }
    $('#btnJoin').disabled = false;
  }

  /* Nothing is sent anywhere until the pupil has said they understand where their answers
     go. The tick is what turns a privacy notice into agreement. */
  if (hasPicker && !pickedName()) return setMsg($('#joinMsg'), COPY.joinPick);
  const tick = document.getElementById('consent');
  if (tick && !tick.checked) return setMsg($('#joinMsg'), 'Please tick the box above first.');

  const name = pickedName();
  if (!name) return setMsg($('#joinMsg'), 'Enter your name.');

  $('#btnJoin').disabled = true;
  try {
    let j = (joinCache && joinCache.code === code) ? joinCache.data : null;
    if (!j) j = await api('/api/join?code=' + encodeURIComponent(code));
    joinCache = null;
    /* A pupil who has already finished this check gets a done screen, not the chat - they
       cannot answer it twice, and their first answers stand. */
    const jj = await api('/api/join?code=' + encodeURIComponent(code) + '&name=' + encodeURIComponent(name)).catch(() => null);
    if (jj && jj.done) {
      $('#joinCard').classList.add('hidden');
      $('#checkCard').classList.remove('hidden');
      $('#checkTopic').textContent = (jj.check && jj.check.topic) || (j.check && j.check.topic) || '';
      $('#chat').innerHTML = '<div class="bubble examiner">You have already finished this check - thank you! There is nothing more to do. You can close this page.</div>';
      const stick = document.querySelector('.row.stick'); if (stick) stick.classList.add('hidden');
      const ab = $('#answer'); if (ab) ab.disabled = true;
      return;
    }
    chat = {
      history: [], covered: 0, digs: 0,
      topic: j.check.topic,
      questions: j.check.questions || [],
      done: false, name, code
    };
    $('#joinCard').classList.add('hidden');
    $('#checkCard').classList.remove('hidden');
    const stick = document.querySelector('.row.stick');
    if (stick) stick.classList.remove('hidden');
    $('#checkTopic').textContent = j.check.topic;
    $('#chat').innerHTML = '';
    $('#progress').textContent = '';
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
      code: chat.code,
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
    addBubble('examiner', 'Sorry, something went wrong. Tell your teacher.');
    setMsg($('#chatMsg'), e.message);
  }
}

$('#btnSend').addEventListener('click', sendAnswer);
$('#answer').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAnswer(); });

/* ---- answer by speaking ------------------------------------------------
   Press the mic, talk, press it again to stop. The clip goes to /api/stt (which
   hands it to ElevenLabs); only the words come back and they land in the box for
   the pupil to fix. Nothing is sent on until they press Send.
   A pupil who would rather say it than type it is the whole point of this. For a
   teacher it only earns its place where they are writing real prose, so it is
   wired to the feedback box and not to the short fields. */
const canRecord = !!(navigator.mediaDevices && window.MediaRecorder);

function attachMic(sel, opts) {
  const btn = $(sel.btn), box = $(sel.input), status = sel.status ? $(sel.status) : null;
  if (!btn || !box) return null;
  if (!canRecord) { btn.style.display = 'none'; return null; }
  const say = (s) => { if (status) status.textContent = s; };
  let rec = null, chunks = [], recording = false, busy = false;

  btn.addEventListener('click', () => {
    if (busy || (opts && opts.blocked && opts.blocked())) return;
    if (recording) stopRec(); else startRec();
  });

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); transcribe(); };
      rec.start();
      recording = true;
      btn.classList.add('recording');
      say('Listening... press the mic again when you have finished.');
    } catch (e) {
      say('No microphone here. You can still type.');
    }
  }

  function stopRec() {
    recording = false;
    btn.classList.remove('recording');
    say('Reading that back...');
    try { rec.stop(); } catch { say('That did not work. Try again, or type it.'); }
  }

  async function transcribe() {
    busy = true;
    try {
      const type = (chunks[0] && chunks[0].type) || 'audio/webm';
      const blob = new Blob(chunks, { type });
      if (blob.size < 1200) { say('That was too short to hear. Try again.'); return; }
      const r = await fetch('/api/stt', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': type }, body: blob
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not hear that one.');
      box.value = (box.value.trim() ? box.value.trim() + ' ' : '') + j.text;
      box.focus();
      say('Have a read - fix anything it got wrong.');
    } catch (e) {
      say(e.message || 'Could not hear that one. Try again, or type it.');
    } finally {
      busy = false; chunks = [];
    }
  }

  return { hide: () => { btn.disabled = true; btn.style.display = 'none'; say(''); } };
}

const micAnswer = attachMic({ btn: '#btnMic', input: '#answer', status: '#micMsg' }, { blocked: () => chat.done });
attachMic({ btn: '#fbMic', input: '#fbMsg', status: '#fbMsgStatus' });

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
  if (micAnswer) micAnswer.hide();

  $('#chatMsg').textContent = '';
  try {
    const j = await post('/api/verdict', { topic: chat.topic, transcript, code: chat.code, questions: chat.questions, marks: chat.marks || [] });
    await post('/api/result', { code: chat.code, name: chat.name, transcript, verdict: j.verdict });
  } catch (e) {
    setMsg($('#chatMsg'), 'Could not send to your teacher. Tell them before you close this.');
  }
  const stick = document.querySelector('.row.stick');
  if (stick) stick.classList.add('hidden');
  $('#progress').textContent = 'Finished';
  const d = document.createElement('div');
  d.className = 'endline';
  d.textContent = 'All done. Your answers have gone to your teacher.';
  $('#chat').appendChild(d);
  d.scrollIntoView({ block: 'end', behavior: 'smooth' });
}


/* Analytics for teachers only. The pupil tab and a join link are never counted.
   Same cookie choice as the public site, and nothing loads until they accept. */
(function () {
  var KEY = 'getit_cookie_consent';
  function teacherOn() {
    if (new URLSearchParams(location.search).get('join')) return false;
    var tab = document.getElementById('tab-teacher');
    return !!(tab && tab.classList.contains('active'));
  }
  function hideBar() {
    var bar = document.getElementById('cookieBar');
    if (bar) bar.remove();
  }
  function loadGA() {
    if (!teacherOn()) return;
    if (window.__getitGa) return;
    window.__getitGa = true;
    var tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=G-HT4BJ8KBY1';
    document.head.appendChild(tag);
    gtag('consent', 'update', { analytics_storage: 'granted' });
    gtag('js', new Date());
    gtag('config', 'G-HT4BJ8KBY1', { anonymize_ip: true });
  }
  function banner() {
    if (!teacherOn() || document.getElementById('cookieBar')) return;
    var bar = document.createElement('div');
    bar.id = 'cookieBar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookies');
    bar.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:80;max-width:640px;margin:0 auto;background:#17233d;color:#e8eefc;border:1px solid #2c3d66;border-radius:14px;padding:14px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;box-shadow:0 12px 40px rgba(0,0,0,.35);font-size:14px';
    bar.innerHTML = '<span style="flex:1;min-width:220px">This page uses Google Analytics so I can see the app is being used. Pupils are not counted. <a href="/privacy" style="color:#9eb6ff">Privacy</a></span><button type="button" id="cookieNo" style="background:none;border:1px solid #3a4d78;color:#e8eefc;border-radius:10px;padding:8px 12px;font:inherit;cursor:pointer">Reject</button><button type="button" id="cookieYes" style="background:#4f8cff;border:0;color:#fff;border-radius:10px;padding:8px 14px;font:inherit;font-weight:700;cursor:pointer">Accept</button>';
    document.body.appendChild(bar);
    document.getElementById('cookieYes').onclick = function () { decide('granted'); };
    document.getElementById('cookieNo').onclick = function () { decide('denied'); };
  }
  function decide(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
    hideBar();
    if (v === 'granted') loadGA();
  }
  function sync() {
    if (!teacherOn()) { hideBar(); return; }
    var choice = null;
    try { choice = localStorage.getItem(KEY); } catch (e) {}
    if (choice === 'granted') loadGA();
    else if (choice !== 'denied') banner();
  }
  document.querySelectorAll('.tab').forEach(function (btn) {
    btn.addEventListener('click', function () { setTimeout(sync, 0); });
  });
  var again = document.getElementById('cookieSettings');
  if (again) again.addEventListener('click', function () { if (teacherOn()) banner(); });
  sync();
})();

// ------------------------------------------------------------------- startup
(function () {
  const join = new URLSearchParams(location.search).get('join');
  if (join) {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    $('#tab-student').classList.add('active');
    $('#view-teacher').classList.add('hidden');
    $('#view-student').classList.remove('hidden');
    $('#joinCode').value = join.trim().toLowerCase();
    setTimeout(() => $('#studentName').focus(), 100);
  }
})();
