/* _look.js - read an image back through Kie's vision chat and transcribe it.
   We cannot see the file; a vision model can. Usage:
   node marketing/_look.js <file.url|file.png> "<question>"                     */
const fs = require('fs');
const https = require('https');
const path = require('path');

const KEY = fs.readFileSync(path.join(__dirname, '..', 'tutorial', '.kie.key'), 'utf8').trim();
const MODEL = process.env.VISION_MODEL || 'gpt-5-2';
const arg = process.argv[2];
const question = process.argv[3] || 'Transcribe every word of text in this image exactly as it appears, top to bottom. Then describe the layout in two sentences.';

const url = arg.endsWith('.url') ? fs.readFileSync(arg, 'utf8').trim()
  : 'data:image/png;base64,' + fs.readFileSync(arg).toString('base64');

const body = JSON.stringify({
  model: MODEL,
  messages: [{ role: 'user', content: [
    { type: 'text', text: question },
    { type: 'image_url', image_url: { url } }
  ] }]
});

const u = new URL('https://api.kie.ai/' + MODEL + '/v1/chat/completions');
const r = https.request({
  hostname: u.hostname, path: u.pathname, method: 'POST',
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
}, x => {
  let c = '';
  x.on('data', d => c += d);
  x.on('end', () => {
    let j = null;
    try { j = JSON.parse(c); } catch (e) { console.log(c.slice(0, 800)); return; }
    const t = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    console.log(t || JSON.stringify(j).slice(0, 800));
  });
});
r.on('error', e => console.log('ERR ' + e.message));
r.setTimeout(180000, () => r.destroy(new Error('timed out')));
r.write(body); r.end();