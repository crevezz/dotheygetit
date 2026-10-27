#!/usr/bin/env node
/**
 * Build the five GCSE misconception-bank PDFs.
 *
 *   node scripts/build-misconception-pdfs.js
 *
 * Writes landing-site/toolkit/*.pdf. Source data lives in
 * scripts/misconceptions/ so the question bank is not a public HTML page.
 * Netlify does not run this. Commit the PDFs.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'landing-site', 'toolkit');
const FONT_DIR = path.join(__dirname, 'fonts');
const BANKS = require('./misconceptions');

const LETTERS = ['A', 'B', 'C', 'D'];

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fileUrl(p) {
  return 'file://' + p.split(path.sep).join('/');
}

function validate(bank) {
  const n = bank.items.length;
  if (n < 30 || n > 40) {
    throw new Error(bank.id + ' has ' + n + ' items; expected 30–40');
  }
  bank.items.forEach((item, index) => {
    const where = bank.id + ' item ' + (index + 1);
    if (!item.topic || !item.stem || !item.reteach) throw new Error(where + ' missing a field');
    if (!Array.isArray(item.options) || item.options.length !== 4) {
      throw new Error(where + ' needs 4 options');
    }
    const correct = item.options.filter((opt) => opt[1] === null);
    if (correct.length !== 1) throw new Error(where + ' needs exactly one correct option');
    item.options.forEach((opt) => {
      if (!opt[0]) throw new Error(where + ' has an empty option');
      if (opt[1] !== null && !String(opt[1]).trim()) throw new Error(where + ' has an empty reason');
    });
  });
}

function itemHtml(item, number) {
  const correctAt = item.options.findIndex((opt) => opt[1] === null);
  const choices = item.options.map((opt) => `<li>${esc(opt[0])}</li>`).join('');
  const key = item.options.map((opt, i) => {
    if (opt[1] === null) return '';
    return `<p><b>${LETTERS[i]}.</b> ${esc(opt[1])}</p>`;
  }).join('');
  return `<article class="q">
  <p class="topic">${esc(item.topic)} · ${number}</p>
  <p class="stem">${esc(item.stem)}</p>
  <ol type="A">${choices}</ol>
  <div class="key">
    <p class="correct"><b>Correct: ${LETTERS[correctAt]}.</b></p>
    ${key}
    <p class="fix"><b>Reteach:</b> ${esc(item.reteach)}</p>
  </div>
</article>`;
}

function pageHtml(bank) {
  const medium = fileUrl(path.join(FONT_DIR, 'Inter-Medium.ttf'));
  const bold = fileUrl(path.join(FONT_DIR, 'Inter-Bold.ttf'));
  const items = bank.items.map((item, i) => itemHtml(item, i + 1)).join('\n');
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8"/>
<title>${esc(bank.heading)}</title>
<style>
@font-face { font-family: Inter; src: url("${medium}") format("truetype"); font-weight: 500; }
@font-face { font-family: Inter; src: url("${bold}") format("truetype"); font-weight: 700; }
@page { size: A4; margin: 14mm 14mm 16mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #1a2340; }
body { font-family: Inter, "Segoe UI", sans-serif; font-weight: 500; font-size: 11.5px; line-height: 1.45; }
header.brand { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; }
header.brand .word { font-weight: 700; font-size: 16px; letter-spacing: -0.02em; }
header.brand .word span { color: #5c6b8a; font-weight: 500; font-size: 11px; margin-left: 8px; }
h1 { font-size: 22px; line-height: 1.2; letter-spacing: -0.03em; color: #2458c8; margin: 0 0 6px; }
.dek { font-size: 13px; color: #24324f; margin: 0 0 8px; }
.intro { margin: 0 0 8px; color: #24324f; }
.count { margin: 0 0 14px; color: #2458c8; font-weight: 700; }
.q { break-inside: avoid; page-break-inside: avoid; margin: 0 0 12px; padding: 0 0 10px; border-bottom: 1px solid #e2e8f4; }
.topic { margin: 0 0 2px; color: #2458c8; font-weight: 700; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; }
.stem { margin: 0 0 4px; font-weight: 700; font-size: 12.5px; }
ol { margin: 0 0 6px; padding-left: 1.3em; }
li { margin: 0 0 2px; }
.key { background: #f3f6fc; border: 1px solid #d5e0f2; border-radius: 8px; padding: 6px 10px; }
.key p { margin: 0 0 3px; }
.key .correct { color: #14532d; }
.fix { margin-top: 4px; }
.run { break-before: page; page-break-before: always; }
.run h2 { color: #2458c8; font-size: 18px; margin: 0 0 8px; }
.run li { margin: 0 0 6px; }
.site { font-weight: 700; color: #2458c8; }
</style>
</head>
<body>
<header class="brand">
  <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#4f8cff"/><path d="M5 12.5 9.5 17 19 7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
  <div class="word">Get It?<span>dotheygetit.app · teacher copy</span></div>
</header>
<h1>${esc(bank.heading)}</h1>
<p class="dek">${esc(bank.dek)}</p>
<p class="intro">These are hinge questions for mistakes that come up again and again at GCSE. The topics are the ones pupils meet on AQA and Edexcel courses. They are not past papers, and they are not a mark scheme. Named texts, case studies and optional units differ by school. Swap the example. Keep the mistake.</p>
<p class="intro">Each wrong answer is a reason to reteach. The shaded box is for you. Cover it if the page is on the board.</p>
<p class="count">${bank.items.length} hinges.</p>
${items}
<section class="run">
  <h2>Run one hinge in two minutes</h2>
  <p>The questions in this bank are multiple choice, so a class can show A, B, C or D on mini whiteboards. That is the fast version. You see the letter, and you reteach the line that goes with it.</p>
  <p>If you want the sentence behind the letter, use Get It?.</p>
  <ol>
    <li>Type the topic, or paste the question. Edit what comes back. It is your question.</li>
    <li>Pupils join with the class code on a phone, a laptop, or a school device. A first name is enough. No account, and nothing to install.</li>
    <li>They answer in their own words, typed or spoken. It is not multiple choice. The sentence shows the mistake more clearly than a letter does.</li>
    <li>In about two minutes you get green, amber or red. The colour is guidance. It can be wrong, and you can change it.</li>
    <li>Reteach the line from this bank before you move on.</li>
  </ol>
  <p>Where phones are banned, do not demand a phone. Use school devices, or stay with the boards.</p>
  <p>A first name and the answers are sent to an external AI. If school policy forbids that, do not use the tool with pupil answers. The boards still work.</p>
  <p>Free during the beta. No card.</p>
  <p class="site">dotheygetit.app</p>
</section>
</body>
</html>`;
}

function writePdf(htmlPath, pdfPath) {
  const profile = path.join('/tmp', 'chrome-pdf-' + path.basename(pdfPath, '.pdf'));
  fs.rmSync(profile, { recursive: true, force: true });
  const chrome = fs.existsSync('/usr/bin/google-chrome') ? 'google-chrome' : 'google-chrome-stable';
  const result = spawnSync('timeout', [
    '50', chrome,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--user-data-dir=' + profile,
    '--no-pdf-header-footer',
    '--print-to-pdf=' + pdfPath,
    fileUrl(htmlPath)
  ], { encoding: 'utf8' });
  const buf = fs.existsSync(pdfPath) ? fs.readFileSync(pdfPath) : Buffer.alloc(0);
  if (buf.slice(0, 5).toString() !== '%PDF-') {
    throw new Error('PDF was not written: ' + pdfPath + '\n' + (result.stdout || '') + (result.stderr || ''));
  }
}

function verify(pdfPath, bank) {
  const script = `
import sys
from pypdf import PdfReader
path, needle, count = sys.argv[1], sys.argv[2], sys.argv[3]
reader = PdfReader(path)
text = "\\n".join((page.extract_text() or "") for page in reader.pages)
if needle not in text:
    raise SystemExit("missing heading in " + path)
if "Reteach:" not in text or "Correct:" not in text:
    raise SystemExit("missing key in " + path)
if "own words" not in text:
    raise SystemExit("missing how-to page in " + path)
if "toolkit-download" in text or "I'm happy to get occasional" in text:
    raise SystemExit("signup form leaked into " + path)
if str(len(reader.pages)) == "0":
    raise SystemExit("no pages")
print(path, len(reader.pages), "pages", count, "hinges")
`;
  const result = spawnSync('python3', ['-c', script, pdfPath, bank.heading, String(bank.items.length)], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'pdf check failed').trim());
  }
  process.stdout.write(result.stdout);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmp = path.join('/tmp', 'misconception-html');
  fs.mkdirSync(tmp, { recursive: true });
  const thanks = fs.readFileSync(path.join(ROOT, 'landing-site', 'toolkit-thanks', 'index.html'), 'utf8');
  BANKS.forEach((bank) => {
    validate(bank);
    if (!thanks.includes('/toolkit/' + bank.pdf)) {
      throw new Error('thanks page missing ' + bank.pdf);
    }
    const htmlPath = path.join(tmp, bank.id + '.html');
    fs.writeFileSync(htmlPath, pageHtml(bank));
    const pdfPath = path.join(OUT_DIR, bank.pdf);
    writePdf(htmlPath, pdfPath);
    verify(pdfPath, bank);
  });
}

main();
