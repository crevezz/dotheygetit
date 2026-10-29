// Daily teaching-tip sender. Schedule is in netlify.toml (around 09:00 UTC).
// Sends nothing unless NURTURE_ENABLED is true and NURTURE_UNSUBSCRIBE_SECRET is set.
// Each subscribed person gets at most one tip per UK day. A run stops after
// LIMITS.maxSends or LIMITS.budgetMs so it stays inside the 30s scheduled limit.
// The cron repeats through the 09:00 UTC hour to finish a longer queue.

const { openStore } = require('./lib/nurture-store');
const { runNurture, nurtureEnabled, unsubscribeSecret } = require('./lib/nurture');
const { loginMailbox, sendWithToken } = require('./lib/pdf-mail');

let clock = () => new Date();

exports.setClockForTests = (fn) => {
  clock = typeof fn === 'function' ? fn : () => new Date();
};

exports.handler = async () => {
  if (!nurtureEnabled()) {
    console.log('nurture disabled');
    return { statusCode: 200, body: 'disabled' };
  }
  const secret = unsubscribeSecret();
  if (!secret) {
    console.error('NURTURE_UNSUBSCRIBE_SECRET not set');
    return { statusCode: 200, body: 'no secret' };
  }
  let store;
  try {
    store = await openStore();
  } catch (e) {
    console.error('nurture store unavailable:', e.message);
    return { statusCode: 200, body: 'no store' };
  }
  if (!store) {
    console.error('nurture store unavailable');
    return { statusCode: 200, body: 'no store' };
  }
  let token = '';
  try {
    const result = await runNurture({
      store,
      now: clock(),
      secret,
      enabled: true,
      login: async () => {
        token = await loginMailbox();
      },
      send: async (msg) => {
        await sendWithToken(token, msg.to, msg.subject, msg.text, msg.html, { idempotencyKey: msg.idempotencyKey });
      },
    });
    if (result.error) console.error('nurture login failed:', result.error);
    console.log('nurture sent ' + result.sent.length + ', deferred ' + result.deferred.length);
    return { statusCode: 200, body: result.error ? 'error' : 'ok' };
  } catch (e) {
    console.error('nurture run failed:', e.message);
    return { statusCode: 200, body: 'error' };
  }
};
