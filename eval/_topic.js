// Does the question writer stay on a non-maths topic?
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const block = src.slice(src.indexOf('const NO_IMAGES ='), src.indexOf('function followupSystem'));
const KEY = fs.readFileSync(path.join(__dirname, '..', 'key.txt'), 'utf8').trim();

const sandbox = {};
new Function('exports', block + '\nexports.q = questionWriterSystem;')(sandbox);

(async () => {
  const topic = process.argv[2] || 'level 1 spelling';
  const sys = sandbox.q(topic, 5);
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'google/gemini-2.5-flash-lite', temperature: 0.7, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }] })
  });
  const j = await r.json();
  const txt = j.choices && j.choices[0] && j.choices[0].message.content;
  console.log(txt);
})().catch(e => console.error(e));
