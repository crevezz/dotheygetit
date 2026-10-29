// Runs automatically on every verified Netlify Forms submission.
// For the PDF forms it emails the sign-up their download link from
// support@dotheygetit.app via Namecheap Private Email's HTTPS API.
// Needs the Netlify env var PRIVATEEMAIL_PASSWORD (never commit it).
// The mailer is shared with the Facebook lead webhook (fb-lead.js).
// After a PDF email is sent, the address is stored for teaching tips.
// Tips are only queued when marketing_consent is yes. A missing consent
// field does not change the PDF email.

const { build, render, sendMail, str, validEmail } = require('./lib/pdf-mail');
const { rememberDownload, downloadSubject, storedFirstName } = require('./lib/nurture');

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
    try {
      const subject = downloadSubject(p.form_name, d);
      if (subject) {
        await rememberDownload({
          email: to,
          firstName: storedFirstName(p.form_name, d),
          subject,
          source: 'site',
          consent: d.marketing_consent,
          now: new Date(),
        });
      }
    } catch (e) {
      console.error('nurture enrol failed:', e.message);
    }
    return { statusCode: 200, body: 'sent' };
  } catch (e) {
    console.error('pdf email error:', e.message);
    return { statusCode: 200, body: 'error' };
  }
};
