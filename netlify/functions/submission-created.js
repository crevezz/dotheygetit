// Runs automatically on every verified Netlify Forms submission.
// For the PDF forms it emails the sign-up their download link from
// support@dotheygetit.app via Namecheap Private Email's HTTPS API.
// Needs the Netlify env var PRIVATEEMAIL_PASSWORD (never commit it).
// The mailer is shared with the Facebook lead webhook (fb-lead.js).

const { build, render, sendMail, str, validEmail } = require('./lib/pdf-mail');

exports.handler = async (event) => {
  try {
    const p = JSON.parse(event.body || '{}').payload || {};
    const d = p.data || {};
    const to = str(d.email || p.email).trim();
    const msg = build(p.form_name, d);
    if (!msg || !validEmail(to)) return { statusCode: 200, body: 'skipped' };
    const { text, html } = render(msg.lines);
    await sendMail(to, msg.subject, text, html);
    console.log('pdf email sent for', p.form_name);
    return { statusCode: 200, body: 'sent' };
  } catch (e) {
    console.error('pdf email error:', e.message);
    return { statusCode: 200, body: 'error' };
  }
};
