/* Prominent Tutorials button at the top of the teacher tab, keeping the quiet one at the bottom. */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
const cssPath = path.join(__dirname, '..', 'public', 'styles.css');

let s = fs.readFileSync(htmlPath, 'utf8');
const before = s;

const EOL = s.includes('\r\n') ? '\r\n' : '\n';
const anchor = '  <section id="view-teacher">' + EOL;
const block =
  anchor +
  EOL +
  '    <!-- prominent: the first thing a teacher sees in this tab -->\n' +
  '    <div class="tutbar">\n' +
  '      <a class="tutbtn" href="/help" data-tip="Nine short videos - five and a half minutes for the lot.">\n' +
  '        <span class="tutplay" aria-hidden="true">&#9654;</span> Watch the tutorials\n' +
  '      </a>\n' +
  '      <span class="tutnote">Nine short videos &middot; five and a half minutes for the lot</span>\n' +
  '    </div>\n';

if (!s.includes(anchor)) { console.log('ANCHOR MISSING'); process.exit(1); }
if (s.includes('class="tutbar"')) { console.log('already there'); process.exit(0); }
s = s.replace(anchor, block);
fs.writeFileSync(htmlPath, s);

let c = fs.readFileSync(cssPath, 'utf8');
if (!c.includes('.tutbar')) {
  c += `
/* prominent tutorials strip: teacher tab only, sits above the sign-in card */
.tutbar{
  max-width:560px;margin:0 auto 20px;padding:0 18px;
  display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;
}
.tutbtn{
  display:inline-flex;align-items:center;gap:10px;
  padding:13px 24px;border-radius:13px;text-decoration:none;font-weight:700;font-size:15px;color:#fff;
  background:linear-gradient(135deg,var(--accent),var(--accent2));
  box-shadow:0 8px 22px rgba(79,140,255,.32);
  transition:transform .16s, filter .16s;
}
.tutbtn:hover{transform:translateY(-1px);filter:brightness(1.08)}
.tutplay{font-size:11px;line-height:1}
.tutnote{font-size:12px;color:var(--muted)}
@media (max-width:520px){ .tutnote{display:none} .tutbtn{width:100%;justify-content:center} }
`;
  fs.writeFileSync(cssPath, c);
}

const out = fs.readFileSync(htmlPath, 'utf8');
const i = out.indexOf('class="tutbar"');
console.log('html changed: ' + (out !== before));
console.log('tutbar at char ' + i);
console.log('teacher section starts at ' + out.indexOf('id="view-teacher"'));
console.log('student section starts at ' + out.indexOf('id="view-student"'));
console.log('tutbar inside teacher: ' + (i > out.indexOf('id="view-teacher"') && i < out.indexOf('id="view-student"')));
console.log('/help links total: ' + (out.match(/href="\/help"/g) || []).length);
console.log('TUTBTN_OK');
