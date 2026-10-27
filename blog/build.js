/* Blog generator.
 *
 *   node blog/build.js
 *
 * Writes the ten posts in blog/posts/ into landing-site/blog/, rebuilds the
 * index, refreshes sitemap.xml, and adds the internal links on the three
 * original posts. blog.css is hand-maintained and is not rewritten.
 *
 * Nothing in blog/ is served. Netlify publishes landing-site/.
 */

const fs = require('fs');
const path = require('path');

const SITE = 'https://dotheygetit.app';
const OUT = path.join(__dirname, '..', 'landing-site', 'blog');
const ROOT = path.join(__dirname, '..', 'landing-site');

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
</body>
</html>
`;

const CTA = `
<section class="band">
  <h2>Try it on one class.</h2>
  <p>One lesson. One question. Two minutes. If it doesn't tell you something you didn't already know, walk away.</p>
  <a class="btn" href="/thank-you/">Try it free &mdash; no card</a>
  <p class="fine">Students need no account. They just need the code.</p>
</section>
`;

function head(o) {
  const twitter = o.twitter || o.desc;
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
<meta property="og:image" content="${SITE}/og-image.png"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${attr(o.title)}"/>
<meta name="twitter:description" content="${attr(twitter)}"/>
<meta name="twitter:image" content="${SITE}/og-image.png"/>
<link rel="stylesheet" href="/blog/blog.css"/>
${o.jsonld || ''}

</head>
<body>
${NAV}`;
}

function card(p) {
  return `    <a class="card" href="/blog/${p.slug}"><h2>${p.title}</h2><p>${p.desc}</p><span class="meta">${p.mins} min read</span></a>`;
}

function indexCard(p) {
  return `    <a class="card" href="/blog/${p.slug}">
      <h2>${p.title}</h2>
      <p>${p.desc}</p>
      <span class="meta">${p.mins} min read</span>
    </a>`;
}

function renderPost(p, bySlug) {
  const canonical = `${SITE}/blog/${p.slug}`;
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
    image: SITE + '/og-image.png'
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
</article>
` + FOOT;
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

function patchOriginals() {
  const jobs = [
    {
      file: 'how-do-you-know-who-understood.html',
      from: '<p>Avoid recall of a definition, anything copied from the board, and anything with a one in two chance of being right by luck.</p>',
      to: '<p>A question with two plausible answers is a <a href="/blog/hinge-questions">hinge question</a> cut down to size. A longer menu of checks that do not stop the lesson is in <a href="/blog/checking-for-understanding">checking for understanding</a>. Hands-up still only tells you about the volunteers. <a href="/blog/cold-calling-vs-no-hands-up">Cold calling and no-hands-up</a> change who speaks, and they still leave the other twenty-nine untested. More of these notes are on <a href="/blog/">the blog</a>.</p>\n\n<p>Avoid recall of a definition, anything copied from the board, and anything with a one in two chance of being right by luck.</p>'
    },
    {
      file: 'how-do-you-know-who-understood.html',
      from: '<a class="card" href="/blog/pupils-quietly-faking-it"><h2>How to spot the pupils who are quietly faking it</h2><p>The echo, the confident wrong answer, the shrug with a smile. Six tells that a pupil has no idea, and three questions that flush it out without embarrassing anyone.</p><span class="meta">7 min read</span></a>',
      to: '<a class="card" href="/blog/pupils-quietly-faking-it"><h2>How to spot the pupils who are quietly faking it</h2><p>The echo, the confident wrong answer, the shrug with a smile. Six tells that a pupil has no idea, and three questions that flush it out without embarrassing anyone.</p><span class="meta">7 min read</span></a>\n    <a class="card" href="/blog/checking-for-understanding"><h2>Checking for understanding: quick techniques that show you the whole class</h2><p>Seven checks you can run without a worksheet. What each one shows you, what it hides, and when a private answer is the one that tells the truth.</p><span class="meta">8 min read</span></a>'
    },
    {
      file: 'exit-tickets-why-teachers-stop.html',
      from: '<p>Keep all four. The only thing that needs to change is the medium.</p>',
      to: '<p>Keep all four. The only thing that needs to change is the medium. If you want the questions themselves, there is a set of <a href="/blog/exit-ticket-ideas">exit ticket ideas by subject</a>. This piece is about why the pile wins. The wider set of notes is on <a href="/blog/">the blog</a>.</p>'
    },
    {
      file: 'exit-tickets-why-teachers-stop.html',
      from: '<p>And if you use mini whiteboards for a quick show-me: they\'re fast, but everyone can see everyone, and the pupil who is lost can copy the board next to them before you look. For the confident-wrong and the quietly-lost, a private answer on a phone screen is more honest.</p>',
      to: '<p>And if you use mini whiteboards for a quick show-me: they\'re fast, but everyone can see everyone, and the pupil who is lost can copy the board next to them before you look. <a href="/blog/mini-whiteboards-vs-digital-checks">Mini whiteboards and a digital check</a> do different jobs, and a private answer is the more honest one for the pupil who is quietly lost. A wider look at what is free, and the catch, is in <a href="/blog/free-formative-assessment-tools">free formative assessment tools</a>.</p>'
    },
    {
      file: 'exit-tickets-why-teachers-stop.html',
      from: '<a class="card" href="/blog/pupils-quietly-faking-it"><h2>How to spot the pupils who are quietly faking it</h2><p>The echo, the confident wrong answer, the shrug with a smile. Six tells that a pupil has no idea, and three questions that flush it out without embarrassing anyone.</p><span class="meta">7 min read</span></a>',
      to: '<a class="card" href="/blog/pupils-quietly-faking-it"><h2>How to spot the pupils who are quietly faking it</h2><p>The echo, the confident wrong answer, the shrug with a smile. Six tells that a pupil has no idea, and three questions that flush it out without embarrassing anyone.</p><span class="meta">7 min read</span></a>\n    <a class="card" href="/blog/exit-ticket-ideas"><h2>Exit ticket ideas: examples that tell you who got it</h2><p>One question per subject, written so a wrong answer tells you what to reteach. Maths, English, science and the rest of the timetable.</p><span class="meta">8 min read</span></a>'
    },
    {
      file: 'pupils-quietly-faking-it.html',
      from: '<p>And there\'s a second problem: the moment you ask a question out loud, you\'ve made it public. The pupil who most needs to answer honestly is the one with the most to lose by doing so.</p>',
      to: '<p>And there\'s a second problem: the moment you ask a question out loud, you\'ve made it public. The pupil who most needs to answer honestly is the one with the most to lose by doing so. <a href="/blog/cold-calling-vs-no-hands-up">Cold calling</a> chooses who speaks. It still leaves a public answer in the room. A confident wrong idea is a different problem from a bluff, and that one is in <a href="/blog/spot-misconceptions-in-lesson">how to spot a misconception before the bell</a>. The checks themselves sit in <a href="/blog/checking-for-understanding">checking for understanding</a>. More of this is on <a href="/blog/">the blog</a>.</p>'
    },
    {
      file: 'pupils-quietly-faking-it.html',
      from: '<a class="card" href="/blog/exit-tickets-why-teachers-stop"><h2>Exit tickets: why most teachers quietly stop using them</h2><p>Exit tickets are good practice. The paper is the problem. Four reasons they get abandoned within a term, and how to keep the ritual without the pile.</p><span class="meta">6 min read</span></a>',
      to: '<a class="card" href="/blog/exit-tickets-why-teachers-stop"><h2>Exit tickets: why most teachers quietly stop using them</h2><p>Exit tickets are good practice. The paper is the problem. Four reasons they get abandoned within a term, and how to keep the ritual without the pile.</p><span class="meta">6 min read</span></a>\n    <a class="card" href="/blog/cold-calling-vs-no-hands-up"><h2>Cold calling vs no-hands-up: how to find who is actually lost</h2><p>They are not the same routine. How to run each one without turning it into a humiliation, and why neither one shows you the whole class.</p><span class="meta">8 min read</span></a>'
    }
  ];

  const touched = new Set();
  jobs.forEach((job) => {
    const file = path.join(OUT, job.file);
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
    const file = path.join(OUT, name);
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
      url: `${SITE}/blog/${p.slug}`,
      datePublished: p.date
    }))
  };
  const html = head({
    title: 'Blog | Get It?',
    canonical: SITE + '/blog/',
    desc,
    metaDesc: desc,
    ogType: 'website',
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
` + FOOT;
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
}

function renderSitemap(all) {
  const urls = [
    { loc: `${SITE}/`, lastmod: '2026-09-20', changefreq: 'weekly', priority: '1.0' },
    { loc: `${SITE}/contact/`, lastmod: '2026-09-20', changefreq: 'yearly', priority: '0.6' },
    { loc: `${SITE}/terms/`, lastmod: '2026-10-17', changefreq: 'yearly', priority: '0.4' },
    { loc: `${SITE}/new-teacher-pack/`, lastmod: '2026-09-28', changefreq: 'monthly', priority: '0.9' },
    { loc: `${SITE}/blog/`, lastmod: '2026-10-27', changefreq: 'weekly', priority: '0.8' },
    ...all.map((p) => ({
      loc: `${SITE}/blog/${p.slug}`,
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
    if (!p.body.includes('/blog/' + slug)) problems.push('body missing related ' + slug);
  });
  const canonical = `${SITE}/blog/${p.slug}`;
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
    if (!html.includes(`<link rel="canonical" href="${SITE}/blog/${p.slug}"/>`)) {
      throw new Error('canonical missing ' + p.slug);
    }
    if (!html.includes('https://dotheygetit.app/og-image.png')) {
      throw new Error('og image missing ' + p.slug);
    }
    if (!html.includes('"@type":"FAQPage"') || !html.includes('"@type":"Article"')) {
      throw new Error('json-ld missing ' + p.slug);
    }
    fs.writeFileSync(path.join(OUT, p.slug + '.html'), html);
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

  patchOriginals();
  renderIndex(all);
  const n = renderSitemap(all);
  console.log('index + sitemap (' + n + ' urls)');
}

main();
