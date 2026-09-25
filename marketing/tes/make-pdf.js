/* Render a print-ready PDF from a local HTML file using Edge/Chrome headless.
 *
 *   node make-pdf.js who-is-faking-it.html
 *
 * Writes <name>.pdf next to the HTML. No npm packages, no accounts.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

function findBrowser() {
  for (const b of BROWSERS) if (fs.existsSync(b)) return b;
  return null;
}

const src = process.argv[2];
if (!src) {
  console.error('usage: node make-pdf.js <file.html>');
  process.exit(1);
}

const html = path.resolve(HERE, src);
if (!fs.existsSync(html)) {
  console.error('no such file: ' + html);
  process.exit(1);
}

const browser = findBrowser();
if (!browser) {
  console.error('no Edge or Chrome found. Install one, or print the HTML from a browser.');
  process.exit(1);
}

const pdf = html.replace(/\.html?$/i, '') + '.pdf';

/* A throwaway profile keeps this from touching the user's real browser state. */
const profile = path.join(HERE, '.pdf-profile');

console.log('browser  ' + path.basename(browser));
console.log('html     ' + path.basename(html));

execFileSync(browser, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--user-data-dir=' + profile,
  '--no-pdf-header-footer',
  '--print-to-pdf=' + pdf,
  '--print-to-pdf-no-header',
  'file:///' + html.replace(/\\/g, '/'),
], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 90000 });

if (!fs.existsSync(pdf)) {
  console.error('\nno PDF produced - run the browser by hand to see why');
  process.exit(1);
}

const kb = (fs.statSync(pdf).size / 1024).toFixed(0);
console.log('pdf      ' + path.basename(pdf) + '  ' + kb + ' KB\n');

/* Tidy up the throwaway profile. */
try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
