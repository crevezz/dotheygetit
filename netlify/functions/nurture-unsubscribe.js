// One-click unsubscribe for teaching tips.
// GET /unsubscribe?token=... shows a confirmation page and stops the sequence.
// POST is the same, so a mailbox List-Unsubscribe action can use it too.
// The PDF download is not affected. Day 0 emails do not include this link.

const { openStore } = require('./lib/nurture-store');
const { verifyToken, unsubscribe, unsubscribeSecret, page } = require('./lib/nurture');

function html(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
    },
    body,
  };
}

function tokenFrom(event) {
  const query = (event && event.queryStringParameters) || {};
  if (query.token) return query.token;
  const raw = (event && event.rawQuery) || '';
  const match = raw.match(/(?:^|&)token=([^&]+)/);
  if (match) {
    try { return decodeURIComponent(match[1]); } catch (e) { return match[1]; }
  }
  let body = (event && event.body) || '';
  if (event && event.isBase64Encoded && body) body = Buffer.from(body, 'base64').toString('utf8');
  try {
    return new URLSearchParams(body).get('token') || '';
  } catch (e) {
    return '';
  }
}

exports.handler = async (event) => {
  const method = String((event && event.httpMethod) || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') return html(405, page('method'));
  const secret = unsubscribeSecret();
  if (!secret) {
    console.error('NURTURE_UNSUBSCRIBE_SECRET not set');
    return html(500, page('config'));
  }
  const email = verifyToken(tokenFrom(event || {}), secret);
  if (!email) return html(400, page('bad'));
  let store;
  try {
    store = await openStore();
  } catch (e) {
    console.error('nurture unsubscribe failed:', e.message);
    return html(500, page('store'));
  }
  if (!store) return html(500, page('store'));
  try {
    await unsubscribe(store, email, new Date());
  } catch (e) {
    console.error('nurture unsubscribe failed:', e.message);
    return html(500, page('store'));
  }
  console.log('nurture unsubscribe ok');
  return html(200, page('ok'));
};
