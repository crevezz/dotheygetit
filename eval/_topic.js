// Does the question writer stay on a non-maths topic?
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const pick = name => { const i = src.indexOf('const ' + name + ' ='); const o = src.indexOf('`', i); const c = src.indexOf('`', o + 1); return src.slice(i, c + 1) + ';'; };
const fn = src.slice(src.indexOf('function questionWriterSystem'), src.indexOf('function markWriterSystem'));
const KEY = fs.readFileSync(path.join(__dirname, '..', 'key.txt'), 'utf8').trim();

const sandbox = {};
new Function('exports', pick('NO_IMAGES') + '\n' + pick('PLAIN_WORDS') + '\n' + pick('MARK_RULES') + '\n' + fn + '\nexports.q = questionWriterSystem;')(sandbox);

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
