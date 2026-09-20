/* scratch: does the Kie key we already have give us a vision model?
   Kie serves Google's chat models OpenAI-style at /<model>/v1/chat/completions.
   Try a few shapes and print whichever answers. */
const fs = require('fs'), path = require('path'), https = require('https');
const KEY = fs.readFileSync(path.join(__dirname, '.kie.key'), 'utf8').trim();

function post(p, body) {
  return new Promise(res => {
    const s = JSON.stringify(body);
    const r = https.request({ hostname: 'api.kie.ai', path: p, method: 'POST',
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json',
                 'Content-Length': Buffer.byteLength(s) } }, x => {
      let d = ''; x.on('data', c => d += c); x.on('end', () => res({ code: x.statusCode, body: d.slice(0, 300) }));
    });
    r.on('error', e => res({ code: 0, body: String(e.message) }));
    r.setTimeout(30000, () => r.destroy(new Error('timeout')));
    r.write(s); r.end();
  });
}

const msg = { role: 'user', content: 'Reply with the single word: ok' };
const models = (process.env.MODELS || 'gemini-2.5-flash,gpt-5-2,gpt-5-6-luna,claude-sonnet-5,grok-4-6,gemini-3-flash')
  .split(',').map(s => s.trim());
const tries = models.map(m => ['/' + m + '/v1/chat/completions', { model: m, messages: [msg] }]);
(async () => {
  for (const [p, b] of tries) {
    const r = await post(p, b);
    console.log(String(r.code).padEnd(5) + p + '  ->  ' + r.body.replace(/\s+/g, ' '));
  }
})();
