#!/usr/bin/env node
// Send the five teaching-tip emails once, to read them before going live.
// Does not enrol the address. Ignores NURTURE_ENABLED.
// Merge values are fixed: first name Craig, subject maths.
// The unsubscribe link is a sample and does not remove anyone.
//
// Locally (needs the mailbox password in the environment):
//   PRIVATEEMAIL_PASSWORD='...' node scripts/send-nurture-preview.js you@example.com
//
// On the live site, where that password is already set:
//   curl -X POST https://dotheygetit.app/.netlify/functions/nurture-preview \
//     -H 'content-type: application/json' \
//     -H 'x-lead-secret: YOUR_LEAD_WEBHOOK_SECRET' \
//     -d '{"email":"you@example.com"}'

const { sendPreview } = require('../netlify/functions/lib/nurture');

const to = process.argv[2];
if (!to) {
  console.error('Usage: node scripts/send-nurture-preview.js you@example.com');
  process.exit(1);
}

sendPreview(to).then((subjects) => {
  console.log('Sent ' + subjects.length + ' preview emails');
  subjects.forEach((subject) => console.log('  ' + subject));
}).catch((e) => {
  console.error(e.message || String(e));
  process.exit(1);
});
