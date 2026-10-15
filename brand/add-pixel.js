// Adds Meta pixel 1200765335594050 to public marketing pages and routes
// "try it" buttons through /thank-you/ (fires CompleteRegistration, then opens the app).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'landing-site');
const PX = `<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '1200765335594050');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=1200765335594050&ev=PageView&noscript=1"/></noscript>
<!-- End Meta Pixel Code -->
`;
const pages = ['index.html', 'blog/index.html', 'contact/index.html', 'new-teacher-pack/index.html']
  .concat(fs.readdirSync(path.join(root, 'blog')).filter(f => f.endsWith('.html') && f !== 'index.html').map(f => 'blog/' + f));
for (const p of pages) {
  const f = path.join(root, p);
  let c = fs.readFileSync(f, 'utf8');
  if (!c.includes('1200765335594050')) c = c.replace('</head>', PX + '</head>');
  c = c.split('href="https://app.dotheygetit.app/"').join('href="/thank-you/"');
  c = c.replace("var APP_URL = 'https://app.dotheygetit.app';", "var APP_URL = '/thank-you/';");
  fs.writeFileSync(f, c);
  console.log(p, c.includes('1200765335594050') ? 'pixel ok' : 'NO PIXEL', (c.match(/\/thank-you\//g) || []).length, 'thank-you links');
}
