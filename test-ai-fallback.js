/* Proves the live chat client:
   - with GEMINI_API_KEY, a Gemini credit/auth/rate-limit/5xx/network failure
     is answered by OpenRouter, and one server line says so
   - with no GEMINI_API_KEY, the request is the old OpenRouter call and nothing else */
const { chatComplete, toGeminiModel, describeProvider, OPENROUTER_URL, GEMINI_URL, GEMINI_SAFE_MODEL } = require('./llm');

const OR_KEY = 'or-test-key-do-not-log-aaaa';
const GEM_KEY = 'gem-test-key-do-not-log-bbbb';

const pass = [];
const fail = [];
const check = (ok, what, extra) => (ok ? pass : fail).push(what + (extra ? ' -> ' + extra : ''));

function jsonRes(status, obj) {
  return { ok: status >= 200 && status < 300, status, json: async () => obj };
}
function okContent(text) {
  return jsonRes(200, { choices: [{ message: { content: text } }] });
}

async function withEnv(vars, fn) {
  const prev = {};
  Object.keys(vars).forEach(k => {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  });
  const lines = [];
  const orig = console.log;
  console.log = (...a) => { lines.push(a.map(x => String(x)).join(' ')); };
  try { return await fn(lines); }
  finally {
    console.log = orig;
    Object.keys(prev).forEach(k => {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    });
  }
}

function posted(rec) {
  return JSON.parse(rec.init.body);
}
function auth(rec) {
  return rec.init.headers.Authorization;
}

(async () => {
  const messages = [
    { role: 'system', content: 'Reply with exactly: OK' },
    { role: 'user', content: 'ping' }
  ];

  /* ---- no Gemini key: identical to the old OpenRouter call ---- */
  await withEnv({ GEMINI_API_KEY: undefined, AI_PROVIDER: undefined }, async (lines) => {
    const calls = [];
    const out = await chatComplete(messages, { model: 'google/gemini-2.5-flash-lite', temperature: 0, json: true }, {
      openrouterKey: OR_KEY,
      fetch: async (url, init) => {
        calls.push({ url, init });
        return okContent('legacy-ok');
      }
    });
    check(out === 'legacy-ok', 'no Gemini key returns OpenRouter content', out);
    check(calls.length === 1 && calls[0].url === OPENROUTER_URL, 'no Gemini key calls OpenRouter once', calls.map(c => c.url).join(','));
    const body = posted(calls[0]);
    check(body.model === 'google/gemini-2.5-flash-lite', 'OpenRouter is sent the config model id', body.model);
    check(body.temperature === 0, 'temperature 0 is kept', String(body.temperature));
    check(body.response_format && body.response_format.type === 'json_object', 'json mode is still response_format json_object');
    check(JSON.stringify(body.messages) === JSON.stringify(messages), 'messages are unchanged');
    check(auth(calls[0]) === 'Bearer ' + OR_KEY, 'OpenRouter bearer is the OpenRouter key');
    check(!Object.prototype.hasOwnProperty.call(body, 'stream'), 'no stream field is added');
    check(!Object.prototype.hasOwnProperty.call(body, 'reasoning_effort'), 'OpenRouter is not sent reasoning_effort');
    check(!Object.prototype.hasOwnProperty.call(body, 'max_tokens'), 'max_tokens stays off unless the caller sets it');
    check(lines.filter(l => l.startsWith('AI fallback:')).length === 0, 'no fallback line when Gemini is not configured');
    check(describeProvider() === 'OpenRouter', 'startup line says OpenRouter', describeProvider());
  });

  await withEnv({ GEMINI_API_KEY: undefined, AI_PROVIDER: undefined }, async () => {
    const calls = [];
    let threw = '';
    try {
      await chatComplete(messages, { model: 'google/gemini-2.5-flash' }, {
        openrouterKey: '',
        fetch: async (url, init) => { calls.push({ url, init }); return okContent('nope'); }
      });
    } catch (e) { threw = e.message; }
    check(threw === 'No API key. Add key.txt and restart.', 'missing OpenRouter key keeps the old error', threw);
    check(calls.length === 0, 'missing OpenRouter key does not call anyone', String(calls.length));
  });

  await withEnv({ GEMINI_API_KEY: '   ', AI_PROVIDER: undefined }, async (lines) => {
    const calls = [];
    let threw = '';
    try {
      await chatComplete(messages, { model: 'google/gemini-2.5-flash' }, {
        openrouterKey: OR_KEY,
        fetch: async (url, init) => {
          calls.push({ url, init });
          return jsonRes(402, { error: { message: 'Insufficient credits', code: 402 } });
        }
      });
    } catch (e) { threw = e.message; }
    check(threw === 'Insufficient credits', 'blank GEMINI_API_KEY still surfaces the OpenRouter error', threw);
    check(calls.length === 1 && calls[0].url === OPENROUTER_URL, 'blank GEMINI_API_KEY does not try Gemini', calls.map(c => c.url).join(','));
    check(lines.filter(l => l.startsWith('AI fallback:')).length === 0, 'blank GEMINI_API_KEY logs no fallback');
  });

  /* ---- Gemini first, OpenRouter answers a 402 ---- */
  async function geminiFailsThenOpenRouter(status, geminiBody, label) {
    await withEnv({ GEMINI_API_KEY: GEM_KEY, AI_PROVIDER: undefined }, async (lines) => {
      const calls = [];
      const out = await chatComplete(messages, { model: 'google/gemini-2.5-flash', temperature: 0.6, json: true }, {
        openrouterKey: OR_KEY,
        fetch: async (url, init) => {
          calls.push({ url, init });
          if (url === GEMINI_URL) return jsonRes(status, geminiBody);
          if (url === OPENROUTER_URL) return okContent('FROM-OPENROUTER');
          throw new Error('unexpected url ' + url);
        }
      });
      check(out === 'FROM-OPENROUTER', label + ' returns the OpenRouter answer', out);
      check(calls.length === 2 && calls[0].url === GEMINI_URL && calls[1].url === OPENROUTER_URL, label + ' tries Gemini then OpenRouter', calls.map(c => c.url).join(' | '));
      check(posted(calls[0]).model === 'gemini-2.5-flash', label + ' strips google/ for Gemini', posted(calls[0]).model);
      check(posted(calls[1]).model === 'google/gemini-2.5-flash', label + ' keeps the OpenRouter model id', posted(calls[1]).model);
      check(auth(calls[0]) === 'Bearer ' + GEM_KEY, label + ' Gemini call uses GEMINI_API_KEY');
      check(auth(calls[1]) === 'Bearer ' + OR_KEY, label + ' OpenRouter call uses the OpenRouter key');
      check(posted(calls[0]).response_format.type === 'json_object' && posted(calls[1]).response_format.type === 'json_object', label + ' keeps json mode on both');
      check(posted(calls[0]).reasoning_effort === 'none', label + ' turns Gemini 2.5 thinking off');
      check(!Object.prototype.hasOwnProperty.call(posted(calls[1]), 'reasoning_effort'), label + ' leaves reasoning_effort off the OpenRouter fallback');
      const fb = lines.filter(l => l.startsWith('AI fallback:'));
      check(fb.length === 1 && fb[0] === 'AI fallback: Gemini failed (HTTP ' + status + '); using OpenRouter', label + ' logs one fallback line', fb.join(' || '));
      check(!lines.join('\n').includes(GEM_KEY) && !lines.join('\n').includes(OR_KEY), label + ' log does not contain a key');
    });
  }

  await geminiFailsThenOpenRouter(402, { error: { message: 'Your credit balance is too low ' + GEM_KEY, code: 402 } }, 'Gemini 402');
  await geminiFailsThenOpenRouter(401, { error: { message: 'API key not valid', code: 401 } }, 'Gemini 401');
  await geminiFailsThenOpenRouter(403, { error: { message: 'Permission denied', status: 'PERMISSION_DENIED' } }, 'Gemini 403');
  await geminiFailsThenOpenRouter(429, { error: { message: 'Resource exhausted', status: 'RESOURCE_EXHAUSTED' } }, 'Gemini 429');
  await geminiFailsThenOpenRouter(500, { error: { message: 'internal' } }, 'Gemini 500');
  await geminiFailsThenOpenRouter(503, { error: { message: 'unavailable' } }, 'Gemini 503');

  await withEnv({ GEMINI_API_KEY: GEM_KEY, AI_PROVIDER: undefined }, async (lines) => {
    const calls = [];
    const out = await chatComplete(messages, { model: 'google/gemini-2.5-flash-lite' }, {
      openrouterKey: OR_KEY,
      fetch: async (url, init) => {
        calls.push({ url, init });
        if (url === GEMINI_URL) {
          const e = new Error('fetch failed');
          e.cause = { code: 'ECONNRESET' };
          throw e;
        }
        return okContent('FROM-OPENROUTER');
      }
    });
    check(out === 'FROM-OPENROUTER', 'Gemini network error returns the OpenRouter answer', out);
    check(calls.length === 2 && calls[1].url === OPENROUTER_URL, 'network error tries OpenRouter second');
    const fb = lines.filter(l => l.startsWith('AI fallback:'));
    check(fb.length === 1 && fb[0] === 'AI fallback: Gemini failed (network error); using OpenRouter', 'network error logs one line', fb.join(' || '));
    check(!lines.join('\n').includes(GEM_KEY), 'network fallback log has no key');
  });

  await withEnv({ GEMINI_API_KEY: GEM_KEY, AI_PROVIDER: undefined }, async (lines) => {
    const calls = [];
    const out = await chatComplete(messages, { model: 'google/gemini-2.5-flash' }, {
      openrouterKey: OR_KEY,
      fetch: async (url, init) => {
        calls.push({ url, init });
        if (url === GEMINI_URL) return { ok: false, status: 502, json: async () => { throw new SyntaxError('Unexpected token <'); } };
        return okContent('FROM-OPENROUTER');
      }
    });
    check(out === 'FROM-OPENROUTER', 'Gemini 502 with a non-JSON body falls back', out);
    const fb = lines.filter(l => l.startsWith('AI fallback:'));
    check(fb.length === 1 && fb[0] === 'AI fallback: Gemini failed (HTTP 502); using OpenRouter', '502 logs one line', fb.join(' || '));
  });

  /* a bad request is our bug; do not hide it on the other provider */
  await withEnv({ GEMINI_API_KEY: GEM_KEY, AI_PROVIDER: undefined }, async (lines) => {
    const calls = [];
    let threw = '';
    try {
      await chatComplete(messages, { model: 'google/gemini-2.5-flash' }, {
        openrouterKey: OR_KEY,
        fetch: async (url, init) => {
          calls.push({ url, init });
          return jsonRes(400, { error: { message: 'Request payload is bad ' + GEM_KEY, code: 400 } });
        }
      });
    } catch (e) { threw = e.message; }
    check(threw === 'Request payload is bad [redacted]', 'Gemini 400 is thrown, with the key scrubbed', threw);
    check(calls.length === 1 && calls[0].url === GEMINI_URL, 'Gemini 400 does not call OpenRouter', String(calls.length));
    check(lines.filter(l => l.startsWith('AI fallback:')).length === 0, 'Gemini 400 logs no fallback');
  });

  /* critic model is not on Studio */
  check(toGeminiModel('google/gemini-2.5-flash-lite') === 'gemini-2.5-flash-lite', 'flash-lite keeps its id', toGeminiModel('google/gemini-2.5-flash-lite'));
  check(toGeminiModel('google/gemini-2.5-flash') === 'gemini-2.5-flash', 'flash keeps its id');
  check(toGeminiModel('google/gemini-3.8-flash') === GEMINI_SAFE_MODEL, 'gemini-3.8-flash maps to gemini-2.5-flash', toGeminiModel('google/gemini-3.8-flash'));
  check(toGeminiModel('nvidia/nemotron-3-super-120b-a12b:free') === GEMINI_SAFE_MODEL, 'a non-Gemini id maps to gemini-2.5-flash');

  await withEnv({ GEMINI_API_KEY: GEM_KEY, AI_PROVIDER: undefined }, async (lines) => {
    const calls = [];
    const out = await chatComplete([{ role: 'user', content: 'hi' }], { model: 'google/gemini-3.8-flash', temperature: 0 }, {
      openrouterKey: OR_KEY,
      fetch: async (url, init) => {
        calls.push({ url, init });
        return okContent('critic-ok');
      }
    });
    check(out === 'critic-ok', 'a Gemini success is returned as-is', out);
    check(calls.length === 1 && calls[0].url === GEMINI_URL, 'Gemini success does not call OpenRouter');
    check(posted(calls[0]).model === 'gemini-2.5-flash', 'critic model is sent as gemini-2.5-flash', posted(calls[0]).model);
    check(posted(calls[0]).reasoning_effort === 'none', 'a mapped 2.5 Flash call has thinking off');
    check(lines.filter(l => l.startsWith('AI fallback:')).length === 0, 'a Gemini success logs no fallback');
    check(describeProvider() === 'Gemini first; OpenRouter if Gemini fails', 'default with a Gemini key is Gemini first', describeProvider());
  });

  /* unknown Gemini id: one retry on the safe model, still not a provider fallback */
  await withEnv({ GEMINI_API_KEY: GEM_KEY, AI_PROVIDER: undefined }, async (lines) => {
    const calls = [];
    const out = await chatComplete(messages, { model: 'google/gemini-2.0-flash-exp' }, {
      openrouterKey: OR_KEY,
      fetch: async (url, init) => {
        calls.push({ url, init });
        const model = posted({ init }).model;
        if (model === 'gemini-2.0-flash-exp') return jsonRes(404, { error: { message: 'models/gemini-2.0-flash-exp is not found', status: 'NOT_FOUND' } });
        if (model === 'gemini-2.5-flash') return okContent('safe-model');
        throw new Error('unexpected ' + model);
      }
    });
    check(out === 'safe-model', 'a missing Gemini model retries as gemini-2.5-flash', out);
    check(calls.length === 2 && calls.every(c => c.url === GEMINI_URL), 'model retry stays on Gemini', calls.map(c => posted(c).model).join(','));
    check(!Object.prototype.hasOwnProperty.call(posted(calls[0]), 'reasoning_effort'), 'an older Gemini id is not sent reasoning_effort none');
    check(posted(calls[1]).reasoning_effort === 'none', 'the safe-model retry turns thinking off');
    check(lines.filter(l => l.startsWith('AI fallback:')).length === 0, 'model retry is not the provider fallback');
  });

  /* both fail: one line, OpenRouter's error, no keys */
  await withEnv({ GEMINI_API_KEY: GEM_KEY, AI_PROVIDER: undefined }, async (lines) => {
    let threw = '';
    const calls = [];
    try {
      await chatComplete(messages, { model: 'google/gemini-2.5-flash' }, {
        openrouterKey: OR_KEY,
        fetch: async (url, init) => {
          calls.push({ url, init });
          if (url === GEMINI_URL) return jsonRes(402, { error: { message: 'quota ' + GEM_KEY } });
          return jsonRes(402, { error: { message: 'Insufficient credits ' + OR_KEY } });
        }
      });
    } catch (e) { threw = e.message; }
    check(threw === 'Insufficient credits [redacted]', 'when both fail the OpenRouter error is thrown, key scrubbed', threw);
    check(calls.length === 2, 'both providers are tried once', String(calls.length));
    const fb = lines.filter(l => l.startsWith('AI fallback:'));
    check(fb.length === 1, 'both-fail still logs a single fallback line', fb.join(' || '));
    check(!fb.join('\n').includes(GEM_KEY) && !fb.join('\n').includes(OR_KEY), 'both-fail log has no key');
  });

  /* Gemini down and no OpenRouter key: keep Gemini's error, do not pretend key.txt is the problem */
  await withEnv({ GEMINI_API_KEY: GEM_KEY, AI_PROVIDER: undefined }, async () => {
    let threw = '';
    const calls = [];
    try {
      await chatComplete(messages, { model: 'google/gemini-2.5-flash' }, {
        openrouterKey: '',
        fetch: async (url, init) => {
          calls.push({ url, init });
          return jsonRes(402, { error: { message: 'quota gone' } });
        }
      });
    } catch (e) { threw = e.message; }
    check(threw === 'quota gone', 'no OpenRouter key rethrows the Gemini error', threw);
    check(calls.length === 1, 'no OpenRouter key means no second call');
  });

  /* AI_PROVIDER override */
  await withEnv({ GEMINI_API_KEY: GEM_KEY, AI_PROVIDER: 'openrouter' }, async (lines) => {
    const calls = [];
    const out = await chatComplete(messages, { model: 'google/gemini-2.5-flash-lite', json: true }, {
      openrouterKey: OR_KEY,
      fetch: async (url, init) => {
        calls.push({ url, init });
        if (url === OPENROUTER_URL) return jsonRes(402, { error: { message: 'Insufficient credits', code: 402 } });
        return okContent('FROM-GEMINI');
      }
    });
    check(out === 'FROM-GEMINI', 'AI_PROVIDER=openrouter falls back to Gemini on 402', out);
    check(calls[0].url === OPENROUTER_URL && calls[1].url === GEMINI_URL, 'override calls OpenRouter first', calls.map(c => c.url).join(' | '));
    check(posted(calls[0]).model === 'google/gemini-2.5-flash-lite', 'override sends the OpenRouter id first');
    check(posted(calls[1]).model === 'gemini-2.5-flash-lite', 'override maps the model for Gemini', posted(calls[1]).model);
    check(!Object.prototype.hasOwnProperty.call(posted(calls[0]), 'reasoning_effort'), 'OpenRouter-first body has no reasoning_effort');
    check(posted(calls[1]).reasoning_effort === 'none', 'Gemini fallback turns thinking off');
    const fb = lines.filter(l => l.startsWith('AI fallback:'));
    check(fb.length === 1 && fb[0] === 'AI fallback: OpenRouter failed (HTTP 402); using Gemini', 'override logs one line', fb.join(' || '));
    check(describeProvider() === 'OpenRouter first; Gemini if OpenRouter fails', 'override startup line', describeProvider());
  });

  await withEnv({ GEMINI_API_KEY: GEM_KEY, AI_PROVIDER: 'GEMINI' }, async () => {
    const calls = [];
    const out = await chatComplete(messages, { model: 'google/gemini-2.5-flash' }, {
      openrouterKey: OR_KEY,
      fetch: async (url, init) => {
        calls.push({ url, init });
        return okContent('gem');
      }
    });
    check(out === 'gem' && calls.length === 1 && calls[0].url === GEMINI_URL, 'AI_PROVIDER=GEMINI forces Gemini first');
    check(primaryIsGemini(), 'AI_PROVIDER=GEMINI selects gemini');
  });

  await withEnv({ GEMINI_API_KEY: undefined, AI_PROVIDER: 'gemini' }, async () => {
    let threw = '';
    const calls = [];
    try {
      await chatComplete(messages, { model: 'google/gemini-2.5-flash' }, {
        openrouterKey: OR_KEY,
        fetch: async (url, init) => { calls.push(url); return okContent('x'); }
      });
    } catch (e) { threw = e.message; }
    check(threw === 'No Gemini API key. Set GEMINI_API_KEY.', 'AI_PROVIDER=gemini without a key says so', threw);
    check(calls.length === 0, 'AI_PROVIDER=gemini without a key does not call OpenRouter');
  });

  await withEnv({ GEMINI_API_KEY: GEM_KEY, AI_PROVIDER: undefined }, async () => {
    const calls = [];
    const out = await chatComplete(messages, { model: 'google/gemini-2.5-pro', maxTokens: 40, temperature: 0 }, {
      openrouterKey: OR_KEY,
      fetch: async (url, init) => {
        calls.push({ url, init });
        return okContent('pro-ok');
      }
    });
    const body = posted(calls[0]);
    check(out === 'pro-ok' && body.model === 'gemini-2.5-pro', '2.5 Pro keeps its id', body.model);
    check(!Object.prototype.hasOwnProperty.call(body, 'reasoning_effort'), '2.5 Pro is not sent reasoning_effort none');
    check(body.max_tokens === 40, 'maxTokens is sent as max_tokens', String(body.max_tokens));
  });

  await withEnv({ GEMINI_API_KEY: GEM_KEY, AI_PROVIDER: undefined }, async () => {
    const { runWithUsage, takeUsage } = require('./llm');
    let seen = null;
    await runWithUsage(async () => {
      await chatComplete(messages, { model: 'google/gemini-2.5-flash', maxTokens: 40 }, {
        openrouterKey: OR_KEY,
        fetch: async (url, init) => jsonRes(200, {
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 11, completion_tokens: 7, completion_tokens_details: { reasoning_tokens: 0 } }
        })
      });
      seen = takeUsage();
    });
    check(seen && seen.calls === 1 && seen.prompt === 11 && seen.completion === 7 && seen.reasoning === 0, 'usage is counted on the request that made it', JSON.stringify(seen));
    check(seen && seen.byModel['gemini-2.5-flash'] && seen.byModel['gemini-2.5-flash'].calls === 1, 'usage is kept by model');
  });

  console.log('\nPASS ' + pass.length + ', FAIL ' + fail.length);
  pass.forEach(x => console.log('  ok   ' + x));
  fail.forEach(x => console.log('  FAIL ' + x));
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('TEST CRASHED: ' + (e && e.stack || e)); process.exit(1); });

function primaryIsGemini() {
  return require('./llm').primaryProvider() === 'gemini';
}
