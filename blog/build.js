/* Blog generator.
 *
 *   node blog/build.js
 *
 * Writes posts to landing-site/<slug>.html (root URLs, not /blog/<slug>),
 * rebuilds the /blog/ index, refreshes sitemap.xml, keeps 301s in
 * netlify.toml from the old /blog/<slug> addresses, and rebuilds each
 * post's share image in landing-site/og/. blog.css stays in
 * landing-site/blog/ and is not rewritten.
 *
 * Nothing in blog/ is served. Netlify publishes landing-site/.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SITE = 'https://dotheygetit.app';
const ROOT = path.join(__dirname, '..', 'landing-site');
const BLOG = path.join(ROOT, 'blog');
const NETLIFY = path.join(__dirname, '..', 'netlify.toml');

/* Paths that already belong to the site. A post slug must not use one. */
const RESERVED = new Set([
  'blog', 'contact', 'terms', 'thank-you', 'new-teacher-pack',
  'first-day-back-after-half-term',
  'help', 'privacy', 'app', 'index', 'media', 'og',
  'pack-thanks', 'newsletter-thanks', 'toolkit', 'toolkit-thanks'
]);

const POST_ORDER = [
  'exit-ticket-ideas',
  'assessment-for-learning-strategies',
  'hinge-questions',
  'checking-for-understanding',
  'spot-misconceptions-in-lesson',
  'cold-calling-vs-no-hands-up',
  'retrieval-practice-starters',
  'mini-whiteboards-vs-digital-checks',
  'plickers-alternatives',
  'free-formative-assessment-tools',
  'how-do-you-know-who-understood',
  'exit-tickets-why-teachers-stop',
  'pupils-quietly-faking-it'
];

const ORIGINAL = {
  'how-do-you-know-who-understood': {
    title: 'How do you know who actually understood the lesson?',
    desc: 'The nod is not evidence. Why "does that make sense?" tells you nothing, and how to find out in two minutes who understood, who is shaky, and who is quietly bluffing.',
    date: '2026-09-20',
    mins: 6
  },
  'exit-tickets-why-teachers-stop': {
    title: 'Exit tickets: why most teachers quietly stop using them',
    desc: 'Exit tickets are good practice. The paper is the problem. Four reasons they get abandoned within a term, and how to keep the ritual without the pile.',
    date: '2026-09-20',
    mins: 6
  },
  'pupils-quietly-faking-it': {
    title: 'How to spot the pupils who are quietly faking it',
    desc: 'The echo, the confident wrong answer, the shrug with a smile. Six tells that a pupil has no idea, and three questions that flush it out without embarrassing anyone.',
    date: '2026-09-20',
    mins: 7
  }
};

function attr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function ld(obj) {
  return `<script type="application/ld+json">\n${JSON.stringify(obj)}\n</script>`;
}

function wordsFrom(html) {
  const text = String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&mdash;/g, ' ')
    .replace(/&middot;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&hellip;/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.split(' ').filter(Boolean) : [];
}

const NAV = `
<nav aria-label="Main">
  <div class="wrap">
    <a class="brand" href="/">
      <span class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg></span>
      <span>Get It?<small>Do they get it?</small></span>
    </a>
        <button class="navtoggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="navlinks">
      <svg class="bars" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 5.5h14M3 10h14M3 14.5h14"/></svg>
      <svg class="x" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15"/></svg>
    </button>
    <div class="navlinks" id="navlinks">
      <a href="/blog/">Blog</a>
      <a href="/contact/">Contact</a>
      <a href="/#pricing">Free</a>
      <a class="navcta" href="/thank-you/">Try it free</a>
    </div>
  </div>
</nav>
`;

const FOOT = `
<footer>
  <div class="wrap">
    <div class="brand"><span class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg></span><span>Get It?<small>Do they get it?</small></span></div>
    <p>Know who got it &mdash; before the test does.</p>
    <p class="fine"><a href="/blog/">Blog</a> &middot; <a href="https://app.dotheygetit.app/help">How it works</a> &middot; <a href="/terms/">Terms</a> &middot; <a href="https://app.dotheygetit.app/privacy">Privacy</a> &middot; <button type="button" class="getit-cookie-link" data-cookie-settings>Cookie settings</button> &middot; <a href="mailto:support@dotheygetit.app">Contact</a> &middot; Made by <a href="https://rapidwebdevs.co.uk" target="_blank" rel="noopener">RapidWeb</a></p>
  </div>
</footer>

<script>
(function () {
  var btn = document.querySelector(".navtoggle");
  var links = document.getElementById("navlinks");
  if (!btn || !links) return;
  function setOpen(open) {
    links.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }
  btn.addEventListener("click", function () { setOpen(!links.classList.contains("open")); });
  links.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });
})();
</script>
`;

const CTA = `
<section class="band">
  <h2>Try it on one class.</h2>
  <p>One lesson. One question. Two minutes. If it doesn't tell you something you didn't already know, walk away.</p>
  <a class="btn" href="/thank-you/">Try it free &mdash; no card</a>
  <p class="fine">Students need no account. They just need the code.</p>
</section>
`;

/* Same fields on every copy, so Netlify treats them as one form. */
const NEWSLETTER = `
<aside class="signup">
  <div class="wrap">
    <div class="panel">
      <p class="kicker">For UK teachers</p>
      <h2>Get one quick classroom check a week, free</h2>
      <p>A short check for a KS3, KS4 or GCSE lesson. School and subject are optional.</p>
      <form name="newsletter" method="POST" action="/newsletter-thanks/" data-netlify="true" netlify netlify-honeypot="bot-field">
        <input type="hidden" name="form-name" value="newsletter"/>
        <p class="hp" aria-hidden="true">
          <label>Leave this empty <input name="bot-field" tabindex="-1" autocomplete="off"/></label>
        </p>
        <div class="row">
          <div class="f">
            <label for="nl-first">First name</label>
            <input id="nl-first" name="first-name" type="text" autocomplete="given-name" required maxlength="80"/>
          </div>
          <div class="f">
            <label for="nl-email">Email</label>
            <input id="nl-email" name="email" type="email" autocomplete="email" inputmode="email" required maxlength="160" placeholder="you@school.sch.uk"/>
          </div>
        </div>
        <div class="row">
          <div class="f">
            <label for="nl-school">School <span>optional</span></label>
            <input id="nl-school" name="school" type="text" autocomplete="organization" maxlength="120"/>
          </div>
          <div class="f">
            <label for="nl-subject">Subject <span>optional</span></label>
            <input id="nl-subject" name="subject" type="text" maxlength="80"/>
          </div>
        </div>
        <label class="consent">
          <input type="checkbox" name="consent" value="yes" required/>
          <span>I'm happy to get occasional emails from Get It?, unsubscribe any time. <a href="https://app.dotheygetit.app/privacy">Privacy</a> &middot; <a href="/terms/">Terms</a>.</span>
        </label>
        <button class="btn" type="submit">Send me the checks</button>
        <p class="fine">New to teaching? <a href="/new-teacher-pack/">The survival pack</a> is free to read, with a PDF if you want one.</p>
        <p class="fine">First lesson back after half term? <a href="/first-day-back-after-half-term/">12 free KS3 starter questions</a>.</p>
      </form>
    </div>
  </div>
</aside>
`;

function ensureNewsletter(html) {
  if (html.includes('name="newsletter"')) return html;
  if (!html.includes('</article>')) throw new Error('newsletter insert point missing');
  return html.replace('</article>', NEWSLETTER + '\n</article>');
}

/* Same fields on every copy, so Netlify treats them as one form.
   Subject is required here. The weekly form keeps subject optional. */
const TOOLKIT = `
<div id="getit-capture" class="getit-capture" hidden>
  <div class="getit-capture-panel" role="dialog" aria-modal="false" aria-labelledby="getit-capture-title">
    <button type="button" class="getit-capture-close" aria-label="Close">&times;</button>
    <p class="getit-capture-kicker">For GCSE teachers</p>
    <h2 id="getit-capture-title" tabindex="-1">Free: the top GCSE misconceptions in your subject, each with a ready-made hinge question</h2>
    <p class="getit-capture-dek">Maths, Combined Science, English, History or Geography.</p>
    <form name="toolkit-download" method="POST" action="/toolkit-thanks/" data-netlify="true" netlify netlify-honeypot="bot-field">
      <input type="hidden" name="form-name" value="toolkit-download"/>
      <p class="hp" aria-hidden="true">
        <label>Leave this empty <input name="bot-field" tabindex="-1" autocomplete="off"/></label>
      </p>
      <label for="tk-first">First name
        <input id="tk-first" name="first-name" type="text" autocomplete="given-name" required maxlength="80"/>
      </label>
      <label for="tk-email">Email
        <input id="tk-email" name="email" type="email" autocomplete="email" inputmode="email" required maxlength="160" placeholder="you@school.sch.uk"/>
      </label>
      <label for="tk-subject">Subject
        <select id="tk-subject" name="subject" required>
          <option value="" disabled selected>Choose a subject</option>
          <option value="maths">Maths</option>
          <option value="science">Science (Combined)</option>
          <option value="english">English (Language and Literature)</option>
          <option value="history">History</option>
          <option value="geography">Geography</option>
        </select>
      </label>
      <label class="getit-capture-consent">
        <input type="checkbox" name="consent" value="yes" required/>
        <span>I'm happy to get occasional emails from Get It?, unsubscribe any time. <a href="https://app.dotheygetit.app/privacy">Privacy</a> &middot; <a href="/terms/">Terms</a>.</span>
      </label>
      <label class="getit-capture-consent">
        <input type="checkbox" name="marketing_consent" value="yes"/>
        <span>Send me occasional teaching tips from Get It? (unsubscribe anytime)</span>
      </label>
      <button class="getit-capture-send" type="submit">Send me the PDF</button>
    </form>
  </div>
</div>`;

const CAPTURE_BEGIN = '<!-- BEGIN toolkit-capture -->';
const CAPTURE_END = '<!-- END toolkit-capture -->';

function captureBlock() {
  return CAPTURE_BEGIN + '\n' + TOOLKIT.trim() + '\n' + CAPTURE_END;
}

function footHtml() {
  return FOOT + '\n' + captureBlock() + '\n<script src="/capture.js" defer></script>\n</body>\n</html>\n';
}

function ensureCapture(html) {
  const block = captureBlock();
  const marker = /<!-- BEGIN toolkit-capture -->[\s\S]*?<!-- END toolkit-capture -->/;
  let next = html;
  if (marker.test(next)) next = next.replace(marker, block);
  else {
    if (!next.includes('</body>')) throw new Error('capture insert point missing');
    next = next.replace('</body>', block + '\n</body>');
  }
  if (!next.includes('href="/capture.css"')) {
    if (!next.includes('</head>')) throw new Error('capture stylesheet insert point missing');
    next = next.replace('</head>', '<link rel="stylesheet" href="/capture.css"/>\n</head>');
  }
  if (!next.includes('src="/capture.js"')) {
    next = next.replace('</body>', '<script src="/capture.js" defer></script>\n</body>');
  }
  return next;
}

function assertToolkit(html, label) {
  const need = [
    'name="toolkit-download"',
    'netlify-honeypot="bot-field"',
    'data-netlify="true"',
    'name="form-name" value="toolkit-download"',
    '<select id="tk-subject" name="subject" required>',
    'value="maths"',
    'value="science"',
    'value="english"',
    'value="history"',
    'value="geography"',
    "I'm happy to get occasional emails from Get It?, unsubscribe any time.",
    'name="marketing_consent"',
    'Send me occasional teaching tips from Get It? (unsubscribe anytime)'
  ];
  need.forEach((bit) => {
    if (!html.includes(bit)) throw new Error('toolkit form incomplete on ' + label + ': ' + bit);
  });
  if (!html.includes(' src="/capture.js"') && !html.includes('src="/capture.js"')) {
    throw new Error('capture script missing on ' + label);
  }
}

function head(o) {
  const twitter = o.twitter || o.desc;
  if (!o.image) throw new Error('share image missing for ' + o.canonical);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>

<!-- Google Consent Mode v2: everything denied until the visitor chooses. -->
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted'
  });
</script>
<link rel="stylesheet" href="/consent.css"/>
<script src="/consent.js" defer></script>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${attr(o.title)}</title>
<link rel="canonical" href="${o.canonical}"/>
<meta name="description" content="${attr(o.metaDesc || o.desc)}"/>
<link rel="icon" href="/favicon.ico" sizes="any"/>
<link rel="icon" type="image/svg+xml" href="/favicon.svg"/>
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png"/>
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"/>
<meta name="theme-color" content="#4f8cff"/>
<meta property="og:type" content="${o.ogType || 'article'}"/>
<meta property="og:site_name" content="Get It?"/>
<meta property="og:title" content="${attr(o.title)}"/>
<meta property="og:description" content="${attr(o.metaDesc || o.desc)}"/>
<meta property="og:url" content="${o.canonical}"/>
<meta property="og:image" content="${o.image}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${attr(o.title)}"/>
<meta name="twitter:description" content="${attr(twitter)}"/>
<meta name="twitter:image" content="${o.image}"/>
<link rel="stylesheet" href="/blog/blog.css"/>
<link rel="stylesheet" href="/capture.css"/>
${o.jsonld || ''}

</head>
<body>
${NAV}`;
}

function card(p) {
  return `    <a class="card" href="/${p.slug}"><h2>${p.title}</h2><p>${p.desc}</p><span class="meta">${p.mins} min read</span></a>`;
}

function indexCard(p) {
  return `    <a class="card" href="/${p.slug}">
      <h2>${p.title}</h2>
      <p>${p.desc}</p>
      <span class="meta">${p.mins} min read</span>
    </a>`;
}

function renderPost(p, bySlug) {
  const canonical = `${SITE}/${p.slug}`;
  const modified = p.dateModified || p.date;
  const related = (p.related || []).map((slug) => {
    const hit = bySlug[slug];
    if (!hit) throw new Error(p.slug + ' related missing: ' + slug);
    return hit;
  });
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: p.title,
    description: p.desc,
    datePublished: p.date,
    dateModified: modified,
    author: {
      '@type': 'Person',
      name: 'Sam Whitfield',
      url: SITE + '/#top',
      jobTitle: 'Founder, Get It?'
    },
    publisher: { '@type': 'Organization', name: 'Get It?' },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    image: `${SITE}/og/${p.slug}.png`
  };
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: p.faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a }
    }))
  };
  const crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: SITE + '/blog/' },
      { '@type': 'ListItem', position: 3, name: p.title, item: canonical }
    ]
  };
  const faqHtml = `
<h2>Questions people ask</h2>
<div class="faqlist">
${p.faq.map((item) => `  <details class="faqitem">
    <summary>${item.q}</summary>
    <p>${item.a}</p>
  </details>`).join('\n')}
</div>`;
  const next = `
<div class="next">
  <h3>Read next</h3>
  <div class="cards">
${related.map(card).join('\n')}
  </div>
</div>`;

  return head({
    title: p.title + ' | Get It?',
    canonical,
    desc: p.desc,
    metaDesc: p.metaDesc || p.desc,
    twitter: p.twitter || p.desc,
    image: `${SITE}/og/${p.slug}.png`,
    jsonld: [ld(article), ld(faq), ld(crumbs)].join('\n')
  }) + `
<header class="post">
  <div class="wrap">
    <div class="kicker">Teaching</div>
    <h1>${p.h1}</h1>
    <p class="lede">${p.lede}</p>
    <div class="byline">
      <span class="avatar" aria-hidden="true">SW</span>
      <span class="who"><b>Sam Whitfield</b><span>${p.mins} min read &middot; Updated ${modified}</span></span>
    </div>
  </div>
</header>

<article>
  <div class="wrap">
${p.body.trim()}
${faqHtml}
${CTA}
${next}
  </div>
${NEWSLETTER}
</article>
` + footHtml();
}

function loadNewPosts() {
  const dir = path.join(__dirname, 'posts');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.js'));
  const posts = files.map((name) => require(path.join(dir, name)));
  const bySlug = {};
  posts.forEach((p) => {
    if (bySlug[p.slug]) throw new Error('duplicate slug ' + p.slug);
    bySlug[p.slug] = p;
  });
  return posts;
}

function assertSlugFree(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('bad slug ' + slug);
  if (RESERVED.has(slug)) throw new Error('slug clashes with an existing route: ' + slug);
  const asDir = path.join(ROOT, slug);
  if (fs.existsSync(asDir) && fs.statSync(asDir).isDirectory()) {
    throw new Error('slug clashes with a directory: ' + slug);
  }
  fs.readdirSync(ROOT).forEach((name) => {
    if (name === slug + '.html') return;
    if (name === slug || name.startsWith(slug + '.')) {
      throw new Error('slug clashes with ' + name);
    }
  });
}

function rewritePostUrls(html, slugs) {
  slugs.slice().sort((a, b) => b.length - a.length).forEach((slug) => {
    html = html.split('/blog/' + slug).join('/' + slug);
  });
  return html;
}

function setOgImage(html, slug) {
  const url = `${SITE}/og/${slug}.png`;
  const next = html
    .replace(/<meta property="og:image" content="[^"]*"\/>/, `<meta property="og:image" content="${url}"/>`)
    .replace(/<meta name="twitter:image" content="[^"]*"\/>/, `<meta name="twitter:image" content="${url}"/>`)
    .replace(/"image":"https:\/\/dotheygetit\.app\/[^"]*"/, `"image":"${url}"`);
  if (!next.includes(`content="${url}"`) || !next.includes(`"image":"${url}"`)) {
    throw new Error('og image not set on ' + slug);
  }
  return next;
}

function buildOgImages() {
  const script = path.join(__dirname, '..', 'scripts', 'build-og-images.py');
  const result = spawnSync('python3', [script], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('share image build failed');
}

function relocateOriginals(slugs) {
  Object.keys(ORIGINAL).forEach((slug) => {
    assertSlugFree(slug);
    const oldPath = path.join(BLOG, slug + '.html');
    const newPath = path.join(ROOT, slug + '.html');
    let html = null;
    if (fs.existsSync(oldPath)) html = fs.readFileSync(oldPath, 'utf8');
    else if (fs.existsSync(newPath)) html = fs.readFileSync(newPath, 'utf8');
    else throw new Error('missing original post ' + slug);
    fs.writeFileSync(newPath, setOgImage(rewritePostUrls(html, slugs), slug));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  });
}

function writeRedirects(slugs) {
  const begin = '# BEGIN blog-post-redirects';
  const end = '# END blog-post-redirects';
  const toml = fs.readFileSync(NETLIFY, 'utf8');
  if (!toml.includes(begin) || !toml.includes(end)) {
    throw new Error('netlify.toml is missing blog redirect markers');
  }
  const rules = slugs.map((slug) => `[[redirects]]
  from = "/blog/${slug}"
  to = "/${slug}"
  status = 301
  force = true

[[redirects]]
  from = "/blog/${slug}/"
  to = "/${slug}"
  status = 301
  force = true`).join('\n\n');
  const next = toml.replace(
    new RegExp(begin + '[\\s\\S]*?' + end),
    begin + '\n' + rules + '\n' + end
  );
  fs.writeFileSync(NETLIFY, next);
}

function patchOriginals() {
  const jobs = [
    {
      file: 'how-do-you-know-who-understood.html',
      from: '<p>Avoid recall of a definition, anything copied from the board, and anything with a one in two chance of being right by luck.</p>',
      to: '<p>A question with two plausible answers is a <a href="/hinge-questions">hinge question</a> cut down to size. A longer menu of checks that do not stop the lesson is in <a href="/checking-for-understanding">checking for understanding</a>. Hands-up still only tells you about the volunteers. <a href="/cold-calling-vs-no-hands-up">Cold calling and no-hands-up</a> change who speaks, and they still leave the other twenty-nine untested. More of these notes are on <a href="/blog/">the blog</a>.</p>\n\n<p>Avoid recall of a definition, anything copied from the board, and anything with a one in two chance of being right by luck.</p>'
    },
    {
      file: 'how-do-you-know-who-understood.html',
      from: '<a class="card" href="/pupils-quietly-faking-it"><h2>How to spot the pupils who are quietly faking it</h2><p>The echo, the confident wrong answer, the shrug with a smile. Six tells that a pupil has no idea, and three questions that flush it out without embarrassing anyone.</p><span class="meta">7 min read</span></a>',
      to: '<a class="card" href="/pupils-quietly-faking-it"><h2>How to spot the pupils who are quietly faking it</h2><p>The echo, the confident wrong answer, the shrug with a smile. Six tells that a pupil has no idea, and three questions that flush it out without embarrassing anyone.</p><span class="meta">7 min read</span></a>\n    <a class="card" href="/checking-for-understanding"><h2>Checking for understanding: quick techniques that show you the whole class</h2><p>Seven checks you can run without a worksheet. What each one shows you, what it hides, and when a private answer is the one that tells the truth.</p><span class="meta">8 min read</span></a>'
    },
    {
      file: 'exit-tickets-why-teachers-stop.html',
      from: '<p>Keep all four. The only thing that needs to change is the medium.</p>',
      to: '<p>Keep all four. The only thing that needs to change is the medium. If you want the questions themselves, there is a set of <a href="/exit-ticket-ideas">exit ticket ideas by subject</a>. This piece is about why the pile wins. The wider set of notes is on <a href="/blog/">the blog</a>.</p>'
    },
    {
      file: 'exit-tickets-why-teachers-stop.html',
      from: '<p>And if you use mini whiteboards for a quick show-me: they\'re fast, but everyone can see everyone, and the pupil who is lost can copy the board next to them before you look. For the confident-wrong and the quietly-lost, a private answer on a phone screen is more honest.</p>',
      to: '<p>And if you use mini whiteboards for a quick show-me: they\'re fast, but everyone can see everyone, and the pupil who is lost can copy the board next to them before you look. <a href="/mini-whiteboards-vs-digital-checks">Mini whiteboards and a digital check</a> do different jobs, and a private answer is the more honest one for the pupil who is quietly lost. A wider look at what is free, and the catch, is in <a href="/free-formative-assessment-tools">free formative assessment tools</a>.</p>'
    },
    {
      file: 'exit-tickets-why-teachers-stop.html',
      from: '<a class="card" href="/pupils-quietly-faking-it"><h2>How to spot the pupils who are quietly faking it</h2><p>The echo, the confident wrong answer, the shrug with a smile. Six tells that a pupil has no idea, and three questions that flush it out without embarrassing anyone.</p><span class="meta">7 min read</span></a>',
      to: '<a class="card" href="/pupils-quietly-faking-it"><h2>How to spot the pupils who are quietly faking it</h2><p>The echo, the confident wrong answer, the shrug with a smile. Six tells that a pupil has no idea, and three questions that flush it out without embarrassing anyone.</p><span class="meta">7 min read</span></a>\n    <a class="card" href="/exit-ticket-ideas"><h2>Exit ticket ideas: examples that tell you who got it</h2><p>One question per subject, written so a wrong answer tells you what to reteach. Maths, English, science and the rest of the timetable.</p><span class="meta">8 min read</span></a>'
    },
    {
      file: 'pupils-quietly-faking-it.html',
      from: '<p>And there\'s a second problem: the moment you ask a question out loud, you\'ve made it public. The pupil who most needs to answer honestly is the one with the most to lose by doing so.</p>',
      to: '<p>And there\'s a second problem: the moment you ask a question out loud, you\'ve made it public. The pupil who most needs to answer honestly is the one with the most to lose by doing so. <a href="/cold-calling-vs-no-hands-up">Cold calling</a> chooses who speaks. It still leaves a public answer in the room. A confident wrong idea is a different problem from a bluff, and that one is in <a href="/spot-misconceptions-in-lesson">how to spot a misconception before the bell</a>. The checks themselves sit in <a href="/checking-for-understanding">checking for understanding</a>. More of this is on <a href="/blog/">the blog</a>.</p>'
    },
    {
      file: 'pupils-quietly-faking-it.html',
      from: '<a class="card" href="/exit-tickets-why-teachers-stop"><h2>Exit tickets: why most teachers quietly stop using them</h2><p>Exit tickets are good practice. The paper is the problem. Four reasons they get abandoned within a term, and how to keep the ritual without the pile.</p><span class="meta">6 min read</span></a>',
      to: '<a class="card" href="/exit-tickets-why-teachers-stop"><h2>Exit tickets: why most teachers quietly stop using them</h2><p>Exit tickets are good practice. The paper is the problem. Four reasons they get abandoned within a term, and how to keep the ritual without the pile.</p><span class="meta">6 min read</span></a>\n    <a class="card" href="/cold-calling-vs-no-hands-up"><h2>Cold calling vs no-hands-up: how to find who is actually lost</h2><p>They are not the same routine. How to run each one without turning it into a humiliation, and why neither one shows you the whole class.</p><span class="meta">8 min read</span></a>'
    }
  ];

  const touched = new Set();
  jobs.forEach((job) => {
    const file = path.join(ROOT, job.file);
    let html = fs.readFileSync(file, 'utf8');
    if (html.includes(job.to)) return;
    if (!html.includes(job.from)) {
      throw new Error('Patch point missing in ' + job.file);
    }
    html = html.replace(job.from, job.to);
    fs.writeFileSync(file, html);
    touched.add(job.file);
  });

  touched.forEach((name) => {
    const file = path.join(ROOT, name);
    let html = fs.readFileSync(file, 'utf8');
    html = html.replace(
      '"datePublished":"2026-09-20","dateModified":"2026-09-20"',
      '"datePublished":"2026-09-20","dateModified":"2026-10-27"'
    );
    html = html.replace('Updated 2026-09-20', 'Updated 2026-10-27');
    fs.writeFileSync(file, html);
  });
}

function renderIndex(all) {
  const desc = 'Practical writing for UK teachers: exit tickets, AfL, hinge questions, retrieval practice, and finding out who actually understood.';
  const blogLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Get It? Blog',
    url: SITE + '/blog/',
    description: 'Practical writing about checking understanding in the classroom.',
    blogPost: all.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      description: p.desc,
      url: `${SITE}/${p.slug}`,
      datePublished: p.date
    }))
  };
  const html = head({
    title: 'Blog | Get It?',
    canonical: SITE + '/blog/',
    desc,
    metaDesc: desc,
    ogType: 'website',
    image: `${SITE}/og/blog.png`,
    jsonld: ld(blogLd)
  }) + `
<header class="post">
  <div class="wrap">
    <div class="kicker">Blog</div>
    <h1>Checking understanding, without the <em>pile of paper</em></h1>
    <p class="lede">Short, practical writing for teachers. What actually tells you whether the class got it &mdash; and what just feels like it does.</p>
  </div>
</header>

<div class="wrap">
  <div class="cards">
${all.map(indexCard).join('\n')}
  </div>
${CTA}
</div>
${NEWSLETTER}
` + footHtml();
  fs.writeFileSync(path.join(BLOG, 'index.html'), html);
}

function renderSitemap(all) {
  const urls = [
    { loc: `${SITE}/`, lastmod: '2026-09-20', changefreq: 'weekly', priority: '1.0' },
    { loc: `${SITE}/contact/`, lastmod: '2026-09-20', changefreq: 'yearly', priority: '0.6' },
    { loc: `${SITE}/terms/`, lastmod: '2026-10-17', changefreq: 'yearly', priority: '0.4' },
    { loc: `${SITE}/new-teacher-pack/`, lastmod: '2026-10-27', changefreq: 'monthly', priority: '0.9' },
    { loc: `${SITE}/first-day-back-after-half-term/`, lastmod: '2026-10-31', changefreq: 'monthly', priority: '0.9' },
    { loc: `${SITE}/first-day-back-after-half-term/first-day-back-starter-pack.pdf`, lastmod: '2026-10-31', changefreq: 'yearly', priority: '0.6' },
    { loc: `${SITE}/blog/`, lastmod: '2026-10-27', changefreq: 'weekly', priority: '0.8' },
    ...all.map((p) => ({
      loc: `${SITE}/${p.slug}`,
      lastmod: p.dateModified || p.date,
      changefreq: 'monthly',
      priority: '0.7'
    }))
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
  return urls.length;
}

function assertPost(p, bySlug) {
  const problems = [];
  if (!p.faq || p.faq.length < 3) problems.push('faq');
  const blob = `${p.body}\n${p.faq.map((f) => f.q + ' ' + f.a).join('\n')}\n${p.lede}`;
  const count = wordsFrom(blob).length;
  if (count < 900 || count > 1500) problems.push('words ' + count);
  if (!p.body.includes('href="/blog/"')) problems.push('no blog index link');
  if (!p.body.includes('href="/thank-you/"')) problems.push('no CTA link');
  (p.related || []).forEach((slug) => {
    if (!bySlug[slug] && !ORIGINAL[slug]) problems.push('related ' + slug);
    if (!p.body.includes('href="/' + slug + '"')) problems.push('body missing related ' + slug);
  });
  const canonical = `${SITE}/${p.slug}`;
  if (p.metaDesc && p.metaDesc.length > 200) problems.push('meta ' + p.metaDesc.length);
  if (problems.length) {
    throw new Error(p.slug + ': ' + problems.join(', '));
  }
  return { slug: p.slug, words: count, canonical };
}

function main() {
  const fresh = loadNewPosts();
  const bySlug = {};
  fresh.forEach((p) => { bySlug[p.slug] = p; });
  Object.keys(ORIGINAL).forEach((slug) => { bySlug[slug] = Object.assign({ slug }, ORIGINAL[slug]); });

  const reports = fresh.map((p) => {
    assertPost(p, bySlug);
    const html = renderPost(p, bySlug);
    if (!html.includes(`<link rel="canonical" href="${SITE}/${p.slug}"/>`)) {
      throw new Error('canonical missing ' + p.slug);
    }
    if (!html.includes(`${SITE}/og/${p.slug}.png`)) {
      throw new Error('og image missing ' + p.slug);
    }
    if (!html.includes('"@type":"FAQPage"') || !html.includes('"@type":"Article"')) {
      throw new Error('json-ld missing ' + p.slug);
    }
    if (!html.includes('name="newsletter"') || !html.includes('netlify-honeypot="bot-field"')) {
      throw new Error('newsletter form missing ' + p.slug);
    }
    assertToolkit(html, p.slug);
    assertSlugFree(p.slug);
    fs.writeFileSync(path.join(ROOT, p.slug + '.html'), html);
    const stale = path.join(BLOG, p.slug + '.html');
    if (fs.existsSync(stale)) fs.unlinkSync(stale);
    return wordsFrom(p.lede + ' ' + p.body + ' ' + p.faq.map((f) => f.q + ' ' + f.a).join(' ')).length;
  });

  fresh.forEach((p, i) => {
    console.log(p.slug + '  ' + reports[i] + ' words');
  });

  const all = POST_ORDER.map((slug) => {
    const post = bySlug[slug];
    if (!post) throw new Error('missing from order: ' + slug);
    return {
      slug,
      title: post.title,
      desc: post.desc,
      date: post.date,
      dateModified: slug in ORIGINAL ? '2026-10-27' : (post.dateModified || post.date),
      mins: post.mins
    };
  });

  relocateOriginals(POST_ORDER);
  patchOriginals();
  Object.keys(ORIGINAL).forEach((slug) => {
    const file = path.join(ROOT, slug + '.html');
    let html = ensureNewsletter(fs.readFileSync(file, 'utf8'));
    html = ensureCapture(html);
    if (!html.includes('name="newsletter"')) throw new Error('newsletter missing on ' + slug);
    assertToolkit(html, slug);
    fs.writeFileSync(file, html);
  });
  const homePath = path.join(ROOT, 'index.html');
  const home = ensureCapture(fs.readFileSync(homePath, 'utf8'));
  assertToolkit(home, 'homepage');
  fs.writeFileSync(homePath, home);
  [
    'new-teacher-pack/index.html',
    'first-day-back-after-half-term/index.html',
    'pack-thanks/index.html',
    'newsletter-thanks/index.html',
    'toolkit-thanks/index.html',
    'contact/index.html',
    'terms/index.html',
    'thank-you/index.html'
  ].forEach((rel) => {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (html.includes('name="toolkit-download"') || html.includes('src="/capture.js"')) {
      throw new Error('popup leaked onto ' + rel);
    }
  });
  buildOgImages();
  renderIndex(all);
  assertToolkit(fs.readFileSync(path.join(BLOG, 'index.html'), 'utf8'), 'blog index');
  const n = renderSitemap(all);
  writeRedirects(POST_ORDER);
  console.log('index + sitemap (' + n + ' urls)');
}

main();
