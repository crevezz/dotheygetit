/* Proves the store survives a deploy: make an account, redeploy, log back in. */
const BASE = process.env.BASE || 'https://app.dotheygetit.app';
const wait = ms => new Promise(r => setTimeout(r, ms));

const EMAIL = 'diskproof' + Date.now() + '@example.com';
const PASS = 'DiskProof123!';

async function post(p, body) {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let j = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

(async () => {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      const j = await r.json();
      if (j && j.ok) { console.log('health: ' + JSON.stringify(j)); break; }
    } catch {}
    await wait(6000);
  }

  const su = await post('/api/signup', { email: EMAIL, password: PASS, invite: process.env.CODE || 'quantum-tick-4417' });
  console.log('signup: ' + su.status + ' ' + JSON.stringify(su.j));
  if (su.status !== 200) { console.log('DISKPROOF_FAIL (signup)'); process.exit(1); }

  console.log('EMAIL=' + EMAIL);
  console.log('PASS=' + PASS);
  console.log('STAGE1_OK');
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
