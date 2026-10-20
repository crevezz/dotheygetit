/* Chat completions for the live server.
   Gemini (Google AI Studio) goes first when GEMINI_API_KEY is set, so the app's
   usage stays off the owner's OpenRouter credits. OpenRouter is the fallback
   when Gemini fails with a credit, auth, rate-limit, 5xx or network error.
   With no GEMINI_API_KEY the request is the same OpenRouter call as before.
   AI_PROVIDER=gemini|openrouter picks which one is tried first. */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GEMINI_SAFE_MODEL = 'gemini-2.5-flash';

function geminiKey() {
  return String(process.env.GEMINI_API_KEY || '').trim();
}

function primaryProvider() {
  const explicit = String(process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'gemini' || explicit === 'openrouter') return explicit;
  return geminiKey() ? 'gemini' : 'openrouter';
}

function describeProvider() {
  const primary = primaryProvider();
  const hasGemini = !!geminiKey();
  if (primary === 'gemini') {
    if (!hasGemini) return 'Gemini requested, but GEMINI_API_KEY is not set';
    return 'Gemini first; OpenRouter if Gemini fails';
  }
  if (hasGemini) return 'OpenRouter first; Gemini if OpenRouter fails';
  return 'OpenRouter';
}

/* config.json stores OpenRouter ids (google/gemini-2.5-flash-lite). Studio wants
   the bare id. gemini-3.8-flash is an OpenRouter id Studio does not serve. */
function toGeminiModel(model) {
  let id = String(model || '').trim();
  if (id.toLowerCase().startsWith('google/')) id = id.slice('google/'.length);
  id = id.split(':')[0].trim();
  if (!/^gemini-/i.test(id)) return GEMINI_SAFE_MODEL;
  if (/^gemini-3\.8-/i.test(id)) return GEMINI_SAFE_MODEL;
  return id;
}

function buildBody(messages, opts) {
  const o = opts || {};
  const body = {
    model: o.model,
    messages,
    temperature: o.temperature === undefined ? 0.6 : o.temperature
  };
  if (o.json) body.response_format = { type: 'json_object' };
  return body;
}

function contentOf(j) {
  return (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}

function scrubMessage(message, keys) {
  let m = String(message || '');
  for (const k of keys) {
    if (k && String(k).length >= 8 && m.includes(k)) m = m.split(k).join('[redacted]');
  }
  return m;
}

/* A label means "try the other provider". Empty means the failure is ours
   (a bad prompt, a 400) and falling over would hide it. */
function fallbackLabel(err) {
  if (!err) return '';
  if (err.network) return 'network error';
  const status = Number(err.status) || 0;
  const body = err.bodyError;
  const bodyCodeNum = body && body.code !== undefined && body.code !== null ? Number(body.code) : NaN;
  const candidates = [status, bodyCodeNum].filter(n => !Number.isNaN(n) && n > 0);
  for (const c of candidates) {
    if (c === 401 || c === 402 || c === 403 || c === 429 || (c >= 500 && c <= 599)) return 'HTTP ' + c;
  }
  const blob = [body && body.code, body && body.status, err.message].join(' ');
  if (/invalid_api_key|UNAUTHENTICATED|PERMISSION_DENIED|api key not valid|invalid api key|unauthori[sz]ed/i.test(blob)) return 'auth';
  if (/insufficient_quota|insufficient credit|payment required|quota exceeded|exceeded your current quota|\bbilling\b/i.test(blob)) return 'credit';
  if (/RESOURCE_EXHAUSTED|rate[_ ]limit|too many requests/i.test(blob)) return 'rate-limit';
  return '';
}

function modelMissing(err) {
  if (!err || err.network) return false;
  if (Number(err.status) === 404) return true;
  const body = err.bodyError || {};
  if (String(body.status || '') === 'NOT_FOUND') return true;
  const msg = String(err.message || '');
  return /model/i.test(msg) && /not found|does not exist|is not supported|unknown model/i.test(msg);
}

function openrouterHeaders(apiKey) {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey };
}

/* The no-Gemini path. Same request, same errors, same content as the old llm(). */
async function callOpenRouterLegacy(body, apiKey, fetchImpl) {
  if (!apiKey) throw new Error('No API key. Add key.txt and restart.');
  const r = await fetchImpl(OPENROUTER_URL, {
    method: 'POST',
    headers: openrouterHeaders(apiKey),
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'LLM error');
  return contentOf(j);
}

async function callOpenRouterObserved(body, apiKey, fetchImpl) {
  if (!apiKey) throw new Error('No API key. Add key.txt and restart.');
  let r;
  try {
    r = await fetchImpl(OPENROUTER_URL, {
      method: 'POST',
      headers: openrouterHeaders(apiKey),
      body: JSON.stringify(body)
    });
  } catch (e) {
    const err = new Error((e && e.message) || 'network error');
    err.network = true;
    throw err;
  }
  let j;
  try { j = await r.json(); }
  catch (e) {
    const err = new Error((e && e.message) || 'unreadable response');
    err.status = r.status;
    throw err;
  }
  if (j.error) {
    const err = new Error(j.error.message || 'LLM error');
    err.status = r.status;
    err.bodyError = typeof j.error === 'object' ? j.error : { message: String(j.error) };
    throw err;
  }
  return contentOf(j);
}

async function callGeminiOnce(body, apiKey, fetchImpl) {
  let r;
  try {
    r = await fetchImpl(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify(body)
    });
  } catch (e) {
    const err = new Error((e && e.message) || 'network error');
    err.network = true;
    throw err;
  }
  let j;
  try { j = await r.json(); }
  catch (e) {
    const err = new Error((e && e.message) || 'unreadable response');
    err.status = r.status;
    throw err;
  }
  if (j.error || !r.ok) {
    const message = (j.error && j.error.message) || (typeof j.error === 'string' ? j.error : '') || 'LLM error';
    const err = new Error(message);
    err.status = r.status;
    err.bodyError = j.error && typeof j.error === 'object' ? j.error : (j.error ? { message: String(j.error) } : null);
    throw err;
  }
  return contentOf(j);
}

async function callGemini(body, apiKey, fetchImpl) {
  const mapped = toGeminiModel(body.model);
  try {
    return await callGeminiOnce(Object.assign({}, body, { model: mapped }), apiKey, fetchImpl);
  } catch (e) {
    /* A model we passed through may still be unknown on Studio. One retry on
       the model we know is there, then the provider fallback can take over. */
    if (mapped !== GEMINI_SAFE_MODEL && modelMissing(e)) {
      return callGeminiOnce(Object.assign({}, body, { model: GEMINI_SAFE_MODEL }), apiKey, fetchImpl);
    }
    throw e;
  }
}

function logFallback(from, err) {
  const to = from === 'Gemini' ? 'OpenRouter' : 'Gemini';
  const why = fallbackLabel(err) || 'error';
  console.log('AI fallback: ' + from + ' failed (' + why + '); using ' + to);
}

async function chatComplete(messages, opts, deps) {
  const fetchImpl = (deps && deps.fetch) || fetch;
  const openrouterKey = deps && deps.openrouterKey ? String(deps.openrouterKey) : '';
  const keys = [openrouterKey, geminiKey()];
  const body = buildBody(messages, opts);
  const primary = primaryProvider();
  const gKey = geminiKey();

  try {
    if (primary === 'openrouter' && !gKey) {
      return await callOpenRouterLegacy(body, openrouterKey, fetchImpl);
    }
    if (primary === 'gemini') {
      if (!gKey) throw new Error('No Gemini API key. Set GEMINI_API_KEY.');
      try {
        return await callGemini(body, gKey, fetchImpl);
      } catch (e) {
        if (!fallbackLabel(e) || !openrouterKey) throw e;
        logFallback('Gemini', e);
        return await callOpenRouterLegacy(body, openrouterKey, fetchImpl);
      }
    }
    try {
      return await callOpenRouterObserved(body, openrouterKey, fetchImpl);
    } catch (e) {
      if (!fallbackLabel(e) || !gKey) throw e;
      logFallback('OpenRouter', e);
      return await callGemini(body, gKey, fetchImpl);
    }
  } catch (e) {
    if (e && typeof e.message === 'string') e.message = scrubMessage(e.message, keys);
    throw e;
  }
}

module.exports = {
  chatComplete,
  toGeminiModel,
  primaryProvider,
  describeProvider,
  OPENROUTER_URL,
  GEMINI_URL,
  GEMINI_SAFE_MODEL
};
