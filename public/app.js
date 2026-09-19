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
  const L = { green: 0, amber: 0, red: 0 };
  (students || []).forEach(st => {
    const l = (st.verdict && st.verdict.level) || 'amber';
    L[l] = (L[l] || 0) + 1;
  });
  return L;
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
let myClasses = [];
let activeClass = null;
let activeCheckId = null;
let checks = [];
let generated = [];
let resultFilter = 'all';
let pollTimer = null;

async function boot() {
  try { const j = await api('/api/me'); me = j.teacher; } catch { me = null; }
  if (me) {
    $('#signinCard').classList.add('hidden');
    $('#dash').classList.remove('hidden');
    $('#whoami').textContent = me.email + (me.role === 'admin' ? ' · owner' : '');
    await loadClasses();
    loadAdmin();
  } else {
    $('#signinCard').classList.remove('hidden');
    $('#dash').classList.add('hidden');
  }
}

$('#btnLogin').addEventListener('click', () => doAuth('/api/login'));
$('#btnSignup').addEventListener('click', () => doAuth('/api/signup'));

async function doAuth(path) {
  setMsg($('#authMsg'), '');
  const email = $('#authEmail').value.trim();
  const password = $('#authPass').value;
  if (!email || !password) return setMsg($('#authMsg'), 'Enter your email and a password.');
  const inv = document.getElementById('authInvite');
  const invite = inv ? inv.value.trim() : '';
  try {
    await post(path, { email, password, invite });
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
  $('#adminWrap').innerHTML = '';
  $('#classPanel').classList.add('hidden');
  await boot();
});

// ----------------------------------------------------------------- classes
/* Remember the year group last used, so a teacher sets it once and never ticks it again. */
try {
  const lastYear = localStorage.getItem('gi_lastYear') || '';
  if (lastYear && $('#newClassYear')) $('#newClassYear').value = lastYear;
} catch {}

async function loadClasses() {
  try {
    const j = await api('/api/classes');
    myClasses = j.classes || [];
  } catch { myClasses = []; }
  renderClasses();
}

function renderClasses() {
  if (!myClasses.length) {
    $('#classList').innerHTML = '<p class="muted">No classes yet. Add one below — it only takes a name.</p>';
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
    try { localStorage.setItem('gi_lastYear', year); } catch {}
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
      const lv = v.level || 'amber';
      const bits = [];
      if (v.gets) bits.push('<div><span class="k">Gets</span>' + esc(v.gets) + '</div>');
      if (v.shaky) bits.push('<div><span class="k">Shaky</span>' + esc(v.shaky) + '</div>');
      if (v.nextStep) bits.push('<div class="nextstep"><span class="k">Next</span>' + esc(v.nextStep) + '</div>');
      const said = r.transcript
        ? '<details class="said"><summary>What they actually said</summary><pre>' + esc(r.transcript) + '</pre></details>'
        : '';
      return '<div class="sresult lv-' + esc(lv) + '">' +
        '<div class="head"><span class="name">' + esc(r.topic) + '</span>' +
        '<span class="tag lv-' + esc(lv) + '">' + esc(lv) + '</span></div>' +
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
    const j = await post('/api/generate', { topic });
    generated = j.questions;
    generated.marks = j.marks || [];
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
    const j = await post('/api/session', { classId: activeClass.id, topic: $('#topic').value.trim(), questions, marks: generated.marks || [] });
    activeCheckId = j.check.id;
    $('#qwrap').classList.add('hidden');
    $('#btnCreateCheck').classList.add('hidden');
    $('#topic').value = '';
    $('#btnGenerate').textContent = '1. Generate questions';
    generated = [];
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
         <div class="clegend"><b>${L.green}</b> got it &nbsp;·&nbsp; <b>${L.amber}</b> shaky &nbsp;·&nbsp; <b>${L.red}</b> struggling</div>`
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
          if (l) { tag.className = 'tag lv-' + l; tag.textContent = l + (final ? ' (you)' : ''); }
        }
      }
      toast(final ? 'Marked ' + final + ' — overruling the marking' : 'Back to the marking');
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
        <p class="muted">Nobody has finished yet. Give the class the code <b>${esc((activeClass && activeClass.code) || '')}</b> and leave this page open — it updates by itself.</p>
      </div>`;
    return;
  }

  const L = levelsOf(students);
  const noReasonCount = students.filter(st => (st.verdict || {}).noReason).length;
  const order = { red: 0, amber: 1, green: 2 };
  const shown = students
    .filter(st => { const lv = (st.verdict && st.verdict.level) || 'amber'; if (resultFilter === 'all') return true; if (resultFilter === 'noreason') return !!(st.verdict && st.verdict.noReason); return lv !== 'green'; })
    .slice()
    .sort((a, b) => {
      const la = order[(a.verdict && a.verdict.level) || 'amber'] ?? 3;
      const lb = order[(b.verdict && b.verdict.level) || 'amber'] ?? 3;
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
    const lv = st.teacherLevel || v.level || 'amber';
    const tip = st.teacherLevel ? 'You set this mark.' : lv === 'green' ? 'Really understands it.'
              : lv === 'amber' ? 'Partly knows it, with clear gaps.'
              : 'Got little right — needs help.';
    /* The mark points ARE the evidence. The teacher set them, so seeing hit or missed
       against the pupil's own words is a claim they can check - which is the difference
       between a card that tells them something and a card that just has a colour on it. */
    const ev = Array.isArray(v.evidence) ? v.evidence : [];
    const gotAll = ev.reduce((n, e) => n + e.got, 0);
    const ofAll = ev.reduce((n, e) => n + e.total, 0);
    return `<div class="sresult lv-${esc(lv)}${drawResults.folded && drawResults.folded.has(String(st.name)) ? ' folded' : ''}" data-ailevel="${esc(v.level || '')}">
      <div class="head"><span class="name">${esc(st.name)}</span><span class="tag lv-${esc(lv)}" data-tip="${esc(tip)}">${esc(lv)}</span></div>
      ${v.notes ? `<div class="notes">${esc(v.notes)}</div>` : ''}
      ${ev.length ? `<div class="evwrap">
        <div class="evhead" data-tip="Your own mark points, one line each - what they showed and what they did not. The words in quotes are exactly what the pupil typed. The colour comes from the questions, not from this count.">What they had to show <b>${gotAll} of ${ofAll}</b>${v.qs ? ` &middot; something on <b>${v.shown} of ${v.qs}</b> questions` : ''}</div>
        ${ev.map(e => `<div class="evq">
          ${e.q ? `<div class="evqt">${esc(e.q)}</div>` : ''}
          <ul class="evlist">${e.points.map(p => `<li class="${p.hit ? 'hit' : 'miss'}">
            <span class="evmark" data-tip="${p.hit ? 'Their answer showed this.' : 'Nothing they said showed this.'}">${p.hit ? 'yes' : 'no'}</span>
            <span class="evt">${esc(p.t)}</span>
            ${p.said ? `<span class="evsaid">"${esc(p.said)}"</span>` : ''}
          </li>`).join('')}</ul>
        </div>`).join('')}
      </div>` : ''}
      <div class="detail">
        ${!ev.length && v.gets ? `<div><span class="k" data-tip="What they truly understand.">Gets</span>${esc(v.gets)}</div>` : ''}
        ${!ev.length && v.shaky ? `<div><span class="k" data-tip="Where they are weak.">Shaky</span>${esc(v.shaky)}</div>` : ''}
        ${v.nextStep ? `<div class="nextstep"><span class="k" data-tip="Where this pupil is now - yours to act on.">Next</span>${esc(v.nextStep)}</div>` : ''}
        ${v.faked ? `<div class="warn" data-tip="Their answers sounded copied or AI-written.">Possible bluffing</div>` : ''}
      </div>
      <div class="ovrow">
        <span class="ovlab" data-tip="The teacher has the final say. Anything you change here is remembered, and it helps the marking learn.">You decide</span>
        ${['green', 'amber', 'red'].map(x =>
          `<button type="button" class="ovbtn${lv === x ? ' on' : ''}" aria-pressed="${lv === x}" data-sid="${esc(s.id)}" data-name="${esc(st.name)}" data-lv="${x}">${x}</button>`).join('')}
        ${st.teacherLevel ? `<span class="ovnote" data-tip="The marking said ${esc(st.aiLevel || '?')}. You changed it.">you changed this</span>` : ''}
      </div>
      ${st.transcript ? `<details class="transcript"><summary data-tip="Read the conversation word for word.">See their answers</summary><div class="tlog">${tlog(st.transcript)}</div></details>` : ''}
    </div>`;
  }).join('');

  const needHelp = L.amber + L.red;

  /* Read the class together. A mark point that most of them missed is usually how it was
     taught, not thirty separate pupils being weak - and that is the one thing a colour
     per child can never show. Only worth saying when it is a real pattern. */
  const withEv = students.filter(st => ((st.verdict || {}).evidence || []).length).length;
  const missTally = {};
  students.forEach(st => ((st.verdict || {}).evidence || []).forEach(e => e.points.forEach(p => {
    if (p.hit) return;
    if (!missTally[p.t]) missTally[p.t] = { t: p.t, n: 0 };
    missTally[p.t].n++;
  })));
  const worst = Object.keys(missTally).map(k => missTally[k])
    .sort((a, b) => b.n - a.n)
    .filter(w => withEv >= 3 && w.n >= 2)
    .slice(0, 3);

  /* the point of the whole thing: not colours per child, but one list of who to
     go back to and what to do with them. Read together, the same gap shows up
     again and again - which usually means how it was taught, not who was off. */
  const todo = students
    .filter(st => ((st.verdict && st.verdict.level) || 'amber') !== 'green')
    .sort((a, b) => {
      const la = order[(a.verdict && a.verdict.level) || 'amber'] ?? 3;
      const lb = order[(b.verdict && b.verdict.level) || 'amber'] ?? 3;
      if (la !== lb) return la - lb;
      return String(a.name).localeCompare(String(b.name));
    })
    .map(st => {
      const v = st.verdict || {};
      return { name: st.name, lv: v.level || 'amber', next: v.nextStep || v.shaky || '' };
    });

  $('#results').innerHTML =
    `<div class="card">
       <div class="srow"><h3>${esc(s.topic || '')}</h3><span class="small">updates by itself</span></div>
       <div class="cover">
         <b>AI guidance, not a grade.</b> This helps you see who needs help, but it can be wrong &mdash; it is not a formal assessment. Please check it before you act on it.
         <b>Think it got someone wrong? Change their colour:</b> click green, amber or red under their name. Your change is remembered, and the marking keeps its own answer beside it so you can see you changed it.
       </div>
       <div class="stat-row">
         <div class="stat green" data-tip="Really understands it."><b>${L.green}</b><span>get it</span></div>
         <div class="stat amber" data-tip="Partly knows it, with clear gaps."><b>${L.amber}</b><span>shaky</span></div>
         <div class="stat red" data-tip="Got little right — needs help."><b>${L.red}</b><span>struggling</span></div>
         <div class="stat green" data-tip="Right answer, but they did not say why. They may look fine now and fall apart later."><b>${noReasonCount}</b><span>no reason</span></div>
       </div>
       <p class="summary"><b>${students.length}</b> finished · <b>${needHelp}</b> need${needHelp === 1 ? 's' : ''} a hand</p>
       ${worst.length ? `<div class="lostit">
         <div class="tline"><span class="tk">Re-teach</span><span class="tv">what the class mostly missed</span></div>
         <ul>${worst.map(w => `<li><span class="lostn">${w.n} of ${withEv}</span>${esc(w.t)}</li>`).join('')}</ul>
         <div class="lostnote">Read across the class, a point most of them missed is usually how it was taught - not a room full of pupils who were not listening.</div>
       </div>` : ''}
       ${todo.length ? `<div class="tomorrow">
         <div class="tline"><span class="tk">Tomorrow</span><span class="tv">${todo.length} to go back to — and what to do with them</span></div>
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
async function loadAdmin() {
  if (!me || me.role !== 'admin') { $('#adminWrap').innerHTML = ''; return; }
  try {
    const j = await api('/api/admin/overview');
    const t = j.totals;
    const rows = j.teachers.map(x => `
      <div class="sresult lv-${x.role === 'admin' ? 'green' : 'amber'}">
        <div class="head"><span class="name">${esc(x.email)}</span><span class="tag">${esc(x.role)}</span></div>
        <div class="detail">
          <div><span class="k">Joined</span>${esc(when(x.createdAt))}</div>
          <div><span class="k">Classes</span>${x.classes.length} &nbsp; <span class="k">Checks</span>${x.checkCount} &nbsp; <span class="k">Answers</span>${x.studentCount}</div>
          ${x.classes.length ? `<div class="notes">${x.classes.map(c => esc(c.name) + ' <b>' + esc(c.code) + '</b>').join(' · ')}</div>` : ''}
        </div>
      </div>`).join('');
    $('#adminWrap').innerHTML =
      `<div class="card">
         <div class="srow"><h3>Owner view</h3><span class="small">everyone using it</span></div>
         <div class="stat-row">
           <div class="stat green"><b>${t.teachers}</b><span>teachers</span></div>
           <div class="stat amber"><b>${t.classes}</b><span>classes</span></div>
           <div class="stat"><b>${t.checks}</b><span>checks</span></div>
           <div class="stat"><b>${t.students}</b><span>answers</span></div>
         </div>
         <div class="btnrow">
           <button id="btnSelftest" class="primary" data-tip="Sends one test question to the AI to check it is still working.">Test the AI</button>
           <button id="btnErrors" class="ghost" data-tip="Show the last 20 things that went wrong.">Check for errors</button>
         </div>
         <p class="msg" id="healthMsg"></p>
         <div id="errorList"></div>
         ${rows || '<p class="muted">Nobody has signed up yet.</p>'}
       </div>`;

    $('#btnSelftest').addEventListener('click', async () => {
      setMsg($('#healthMsg'), 'Asking the AI...');
      try {
        const r = await post('/api/admin/selftest');
        if (r.ok) setMsg($('#healthMsg'), `AI working · ${r.model} · replied "${r.reply}" in ${(r.ms / 1000).toFixed(1)}s`, true);
        else setMsg($('#healthMsg'), `AI NOT WORKING — ${r.error}`);
      } catch (e) { setMsg($('#healthMsg'), e.message); }
    });

    $('#btnErrors').addEventListener('click', async () => {
      setMsg($('#healthMsg'), '');
      try {
        const r = await api('/api/admin/errors');
        const up = r.uptimeSec < 90 ? r.uptimeSec + 's' : Math.round(r.uptimeSec / 60) + ' min';
        const head = `<p class="muted">Up ${esc(up)} · storage: <b>${esc(r.storage)}</b>${r.storage === 'file' ? ' (data will be lost on restart!)' : ''}</p>`;
        $('#errorList').innerHTML = head + (r.errors.length
          ? r.errors.map(x => `<div class="sresult lv-red"><div class="head"><span class="name">${esc(when(x.at))}</span><span class="tag">${esc(x.where)}</span></div><div class="notes">${esc(x.message)}</div></div>`).join('')
          : '<p class="muted">No errors. </p>');
      } catch (e) { setMsg($('#healthMsg'), e.message); }
    });
  } catch (e) {
    $('#adminWrap').innerHTML = '';
  }
}

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
    '<option value="">Pick your name...</option>' +
    names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('') +
    '<option value="__other">My name is not here</option>' +
    '</select>' +
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
        setMsg($('#joinMsg'), 'Now pick your name from the list.', true);
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
  if (hasPicker && !pickedName()) return setMsg($('#joinMsg'), 'Pick your name from the list.');
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
  d.textContent = '✓ All done — thanks! Your answers have gone to your teacher.';
  $('#chat').appendChild(d);
  d.scrollIntoView({ block: 'end', behavior: 'smooth' });
}

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
