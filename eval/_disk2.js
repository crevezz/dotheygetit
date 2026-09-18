/* Second half: after the redeploy, can the same account still log in? */
const BASE = process.env.BASE || 'https://app.dotheygetit.app';
const EMAIL = process.argv[2];
const PASS = process.argv[3];
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!EMAIL || !PASS) { console.log('need email + pass'); process.exit(1); }
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      const j = await r.json();
      if (j && j.ok) break;
    } catch {}
    await wait(6000);
  }
  const r = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS })
  });
  let j = null;
  try { j = await r.json(); } catch {}
  console.log('login after redeploy: ' + r.status + ' ' + JSON.stringify(j));
  console.log(r.status === 200 ? 'DISKPROOF_OK - the account survived a deploy' : 'DISKPROOF_FAIL - the account did not survive');
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
