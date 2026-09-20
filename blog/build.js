/* Blog generator.
 *
 *   node blog/build.js
 *
 * Writes landing-site/blog/*.html, landing-site/blog/blog.css and regenerates
 * landing-site/sitemap.xml so the two can never drift apart.
 *
 * Source lives here, output lives in landing-site/blog/ (which is what Netlify
 * publishes). Nothing in this folder is served.
 *
 * Adding a post: append to POSTS, run the script, push. Done.
 */

const fs = require('fs');
const path = require('path');

const SITE = 'https://dotheygetit.app';
const APP = 'https://app.dotheygetit.app';
const TODAY = '2026-09-20';
const OUT = path.join(__dirname, '..', 'landing-site', 'blog');

/* ------------------------------------------------------------------ head --- */

const head = (o) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>

<!-- Google Analytics (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HT4BJ8KBY1"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-HT4BJ8KBY1');
</script>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${o.title}</title>
<link rel="canonical" href="${o.canonical}"/>
<meta name="description" content="${o.desc}"/>
<link rel="icon" href="/favicon.ico" sizes="any"/>
<link rel="icon" type="image/svg+xml" href="/favicon.svg"/>
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png"/>
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"/>
<meta name="theme-color" content="#4f8cff"/>
<meta property="og:type" content="${o.ogType || 'article'}"/>
<meta property="og:site_name" content="Get It?"/>
<meta property="og:title" content="${o.title}"/>
<meta property="og:description" content="${o.desc}"/>
<meta property="og:url" content="${o.canonical}"/>
<meta property="og:image" content="${SITE}/og-image.png"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${o.title}"/>
<meta name="twitter:description" content="${o.desc}"/>
<meta name="twitter:image" content="${SITE}/og-image.png"/>
<link rel="stylesheet" href="/blog/blog.css"/>
${o.jsonld || ''}
</head>
<body>

<nav>
  <div class="wrap">
    <a class="brand" href="/">
      <span class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg></span>
      <span>Get It?<small>Do they get it?</small></span>
    </a>
    <div class="navlinks">
      <a href="/blog/">Blog</a>
      <a href="/#pricing">Pricing</a>
      <a class="navcta" href="${APP}/">Try it free</a>
    </div>
  </div>
</nav>
`;

const foot = `
<footer>
  <div class="wrap">
    <div class="brand"><span class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg></span><span>Get It?<small>Do they get it?</small></span></div>
    <p>Know who got it &mdash; before the test does.</p>
    <p class="fine"><a href="/blog/">Blog</a> &middot; <a href="${APP}/help">How it works</a> &middot; <a href="${APP}/privacy">Privacy</a> &middot; <a href="mailto:support@dotheygetit.app">Contact</a> &middot; Made by <a href="https://rapidwebdevs.co.uk" target="_blank" rel="noopener">RapidWeb</a></p>
  </div>
</footer>

</body>
</html>
`;

const cta = `
<section class="band">
  <h2>Try it on one class.</h2>
  <p>One lesson. One question. Two minutes. If it doesn't tell you something you didn't already know, walk away.</p>
  <a class="btn" href="${APP}/">Try it free &mdash; no card</a>
  <p class="fine">Students need no account. They just need the code.</p>
</section>
`;

/* ------------------------------------------------------------------ posts --- */

const POSTS = [
  {
    slug: 'how-do-you-know-who-understood',
    title: 'How do you know who actually understood the lesson?',
    h1: 'How do you know who <em>actually</em> understood the lesson?',
    desc: 'The nod is not evidence. Why "does that make sense?" tells you nothing, and how to find out in two minutes who understood, who is shaky, and who is quietly bluffing.',
    date: '2026-09-20',
    mins: 6,
    lede: 'You finish explaining. You ask "does that make sense?" Thirty heads nod. You move on. Then the test happens and a third of them can\'t do it.',
    body: `
<p>The nod is not evidence. It never was.</p>

<h2>Why the nod lies</h2>

<p>Three things are happening when thirty heads go down and up at once, and none of them is comprehension.</p>

<p><b>Nobody wants to be the one who says no.</b> Asking "does that make sense?" in front of twenty-nine other people is a social question wearing a learning question's clothes. The honest answer costs something, and the dishonest one is free.</p>

<p><b>You asked about the lesson, not about them.</b> A pupil can follow every word you said and still be unable to do the thing you want them to do. Understanding a demonstration and being able to reproduce it are different skills, and only one of them shows up in a nod.</p>

<p><b>The pupils you most need to hear from are the least likely to speak.</b> When you're genuinely lost, you often don't know what to ask. The ones who ask questions are usually the ones who are nearly there.</p>

<p>Self-assessment is unreliable at the best of times. For a fourteen-year-old in front of their mates, it is close to worthless.</p>

<h2>Why marking the books doesn't solve it either</h2>

<p>You can find out exactly who understood, of course. Mark thirty books and you'll know. The trouble is that by the time you know, it's Thursday.</p>

<p>The whole point of checking understanding is that you can still do something about it. Feedback that arrives three days later is a report on a lesson that has already been left behind. Useful for reports. Useless for teaching.</p>

<h2>The three things a real check needs</h2>

<p>Strip away the method and any check worth doing has the same three properties:</p>

<ul>
  <li><b>Everyone answers.</b> Not the six who always put their hand up. Hands up tells you about the six.</li>
  <li><b>You see it per pupil.</b> A class average of 68% tells you nothing actionable. Which six are the 68%?</li>
  <li><b>It is quick enough that you will actually do it.</b> A check you skip on a busy Tuesday is not a system, it's an intention.</li>
</ul>

<h2>The four questions worth asking</h2>

<p>Most checking fails at the question, not the method. "Do you understand?" is unanswerable. So is "any questions?" So is anything a pupil can answer by reading the board back to you.</p>

<p>Ask things they can only answer if they genuinely get it:</p>

<ul>
  <li><b>Give them a wrong answer and ask what's wrong with it.</b> Spotting an error takes more understanding than producing a correct answer, and it can't be done by recall.</li>
  <li><b>Ask for the next step, not the final answer.</b> Getting to the end can be done by pattern-matching. Knowing what to do first cannot.</li>
  <li><b>Ask why, not what.</b> "What is the answer" is a memory question. "Why is that the answer" is a thinking question.</li>
  <li><b>Give two plausible options and make them choose.</b> A yes/no question has a fifty per cent floor and a very high guess rate. A good distractor catches the specific misconception you're worried about.</li>
</ul>

<p>Avoid recall of a definition, anything copied from the board, and anything with a one in two chance of being right by luck.</p>

<h2>What to do with the answer</h2>

<p>This is the part people get wrong. A check is not a score. It is a routing decision.</p>

<ul>
  <li><b>Got it.</b> Move on &mdash; and use them. Ask one of them to explain it to someone who hasn't.</li>
  <li><b>Shaky.</b> They followed you but can't yet do it alone. One more example, worked through differently to the way you did it the first time.</li>
  <li><b>Lost.</b> This is the important group, and the one a class average hides. They have usually missed something <em>earlier</em>, not something in this lesson. Finding them in the same lesson is worth more than anything else you do that day.</li>
</ul>

<p>Reteaching two minutes after the check lands completely differently to reteaching it at the start of the next lesson, when half the class has forgotten the question.</p>

<h2>The two-minute version</h2>

<p>One question on the board. A code the class types into their phones &mdash; no accounts, no app, no logins to lose. You watch the names come in, colour-coded, and you know before the bell who needs you tomorrow and who needs you now.</p>

<p>That's it. The method is not clever. It's just that for once the answer arrives while you can still use it.</p>
`
  },

  {
    slug: 'exit-tickets-why-teachers-stop',
    title: 'Exit tickets: why most teachers quietly stop using them',
    h1: 'Exit tickets: why most teachers quietly stop using them',
    desc: 'Exit tickets are good practice. The paper is the problem. Four reasons they get abandoned within a term, and how to keep the ritual without the pile.',
    date: '2026-09-20',
    mins: 6,
    lede: 'The idea is solid and half a century old. So why does almost everyone who starts using exit tickets quietly stop within a term?',
    body: `
<p>Exit tickets are one of the few teaching techniques with genuinely good evidence behind them. Short, low-stakes, at the end, everyone answers. The research is not ambiguous.</p>

<p>And yet. Ask around a staffroom and you'll find a lot of people who tried it, liked it, and stopped. Not because the idea was wrong.</p>

<h2>Reason one: the pile</h2>

<p>Thirty slips of paper. You collect them at the bell, you put them in your bag, and they come out again at four o'clock, or on Thursday.</p>

<p>By the time you read them you already know roughly who struggled, because you were in the room. The slips confirm a hunch you had three days ago. What they can't do is tell you anything you can still act on.</p>

<h2>Reason two: the deadline you just gave yourself</h2>

<p>To be worth its three minutes, an exit ticket has to be read before the next lesson. That's a hard deadline you have just created, five times a day, on top of everything else.</p>

<p>Most people manage it for a fortnight.</p>

<h2>Reason three: the pupils you most need are the thinnest</h2>

<p>There is a cruel pattern in exit tickets. The pupil who is lost writes <em>"idk"</em>, or a single word, or nothing at all. The pupil who has got it writes three lines and a diagram.</p>

<p>You end up with the most information about the pupils you were least worried about, and a shrug from the ones who needed you.</p>

<h2>Reason four: anonymous slips</h2>

<p>Some teachers make them anonymous, on the reasonable grounds that pupils are more honest when it isn't attributable. They usually are.</p>

<p>But now you know that four people in the room don't understand, and you have no idea which four. It's an interesting fact rather than a useful one.</p>

<h2>What exit tickets get right</h2>

<p>Before throwing them out, notice that four of their properties are exactly right, and they are the four that matter:</p>

<ul>
  <li><b>At the end, not the start.</b> The information is freshest at the bell.</li>
  <li><b>Low stakes.</b> No marks, no grade, so pupils answer honestly.</li>
  <li><b>Everyone answers.</b> Not just the confident ones.</li>
  <li><b>One question, not ten.</b> A single well-chosen question beats a worksheet.</li>
</ul>

<p>Keep all four. The only thing that needs to change is the medium.</p>

<h2>The same ritual, without the pile</h2>

<p>One question on the board at the end of the lesson. Pupils type a class code into their phones &mdash; the same code all year, no accounts to create, nothing to install. Their answers land on your screen as they're packing up, attached to names, colour-coded.</p>

<p>You now have the thing paper couldn't give you: the answer while the pupils are still in the room. Which means the two minutes before the bell can be a reteach instead of the first ten minutes of the next lesson being a guess.</p>

<h2>If you'd rather keep the paper</h2>

<p>Fair enough &mdash; it costs nothing and it never runs out of battery. Two things make it work better:</p>

<ul>
  <li><b>Don't collect thirty.</b> Collect six, from the six you're genuinely unsure about. You'll read them at the bell, not at four o'clock.</li>
  <li><b>Don't make them anonymous.</b> A check you can't act on isn't a check.</li>
</ul>

<p>And if you use mini whiteboards for a quick show-me: they're fast, but everyone can see everyone, and the pupil who is lost can copy the board next to them before you look. For the confident-wrong and the quietly-lost, a private answer on a phone screen is more honest.</p>
`
  },

  {
    slug: 'pupils-quietly-faking-it',
    title: 'How to spot the pupils who are quietly faking it',
    h1: 'How to spot the pupils who are <em>quietly</em> faking it',
    desc: 'The echo, the confident wrong answer, the shrug with a smile. Six tells that a pupil has no idea, and three questions that flush it out without embarrassing anyone.',
    date: '2026-09-20',
    mins: 7,
    lede: 'They never cause trouble, never ask for help, and are not following a word of it. They have simply learned to look like they are.',
    body: `
<p>Every class has them. The pupil who nods in the right places, copies the board neatly, and agrees with whoever spoke last. They are not lazy. They are not even necessarily disengaged.</p>

<p>They are embarrassed. Being lost in front of twenty-nine people is a social risk, and they have decided it is a risk not worth taking. So they have learned a set of moves that make them invisible, and those moves are good enough that most teachers don't spot them until the test.</p>

<p>Here is what to look for.</p>

<h2>1. The echo</h2>

<p>You ask a question. They answer using your own words back at you. "So it's the mitochondria." "So you multiply it by the bottom one."</p>

<p>If the only phrasing they can produce is the one they just heard, they have memorised a sound, not built an idea. The tell is that they can't say it a second, different way &mdash; and they can't answer "why?"</p>

<h2>2. The confident wrong answer</h2>

<p>Speed is often a substitute for certainty. The pupil who fires an answer out fast and loud is sometimes the one who most needs the question to be over with before anyone looks too closely.</p>

<p>Confidence is worth watching as a signal. It correlates with knowing the answer, but not as strongly as we assume.</p>

<h2>3. They agree with whoever spoke last</h2>

<p>Ask the same question twice in a different order and watch the answer move. If their answer flips to match the pupil who answered before them, they are reading the room, not the question.</p>

<p>This is why "who agrees with that?" is one of the worst questions in teaching. It rewards exactly the behaviour you're trying to catch.</p>

<h2>4. Perfect notes, blank page</h2>

<p>The book is beautiful. Every heading underlined, every diagram copied. Then you ask them to start the exercise and nothing happens.</p>

<p>Copying is a low-risk way to look busy, and it produces a page that looks like evidence of learning without being any.</p>

<h2>5. The shrug with a smile</h2>

<p>"I don't get it" delivered as a joke, with a laugh, so that it doesn't count as asking. It's a real request for help wearing a disguise.</p>

<p>Take it seriously and drop the joke. That pupil just took the biggest risk they were willing to take today.</p>

<h2>6. The one who helps everyone else</h2>

<p>Being the explainer is a great way to never be tested. Some pupils put themselves in the helper role precisely because it keeps the focus off their own understanding.</p>

<p>Ask them to do it rather than explain it. The two are not the same.</p>

<h2>Why you can't catch this by eye</h2>

<p>You have thirty of them and one of you. The pupils who are best at hiding it are the ones you notice least, because by design they never give you a reason to look.</p>

<p>And there's a second problem: the moment you ask a question out loud, you've made it public. The pupil who most needs to answer honestly is the one with the most to lose by doing so.</p>

<h2>Three questions that flush it out</h2>

<p>You don't need to catch them in the act. You need a question they can't fake.</p>

<ul>
  <li><b>"Which of these two is wrong, and why?"</b> Give two plausible answers. This cannot be done by recall, and the wrong one catches the specific misconception. Someone bluffing has to actually think, and thinking out loud is where it shows.</li>
  <li><b>"Explain it as if I've never seen it before."</b> Forces their own words. If they can only give you yours, you've found the echo.</li>
  <li><b>"What would happen if&hellip;?"</b> Change one thing and ask. Recall doesn't transfer. Understanding does.</li>
</ul>

<p>And ask the quiet ones <em>first</em>, before the confident ones have set the answer for the room.</p>

<h2>What to do when you find one</h2>

<p>Don't make it public. The whole reason they're hiding is that being seen not to know feels worse than not knowing.</p>

<p>This is the argument for private, per-pupil answers rather than hands up. When every pupil answers on their own screen and only you can see the result, the pupil who is lost can say so at no social cost. You find out in two minutes what a whole lesson of questioning was hiding &mdash; and nobody in the room finds out except you.</p>
`
  }
];

/* ------------------------------------------------------------------- css --- */

const CSS = `/* Get It? blog. Shares the design tokens of the landing page. */
:root{
  --bg:#070b16; --bg2:#0b1122; --surface:#111a2e; --surface2:#16223c;
  --line:#25324e; --text:#eaf0ff; --muted:#94a3c4;
  --accent:#4f8cff; --accent2:#8b5cff; --green:#3ddc84; --amber:#ffc857; --red:#ff6b6b;
  --radius:18px;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0;background:var(--bg);color:var(--text);
  font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
  font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased;overflow-x:hidden;
}
.wrap{max-width:820px;margin:0 auto;padding:0 22px}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}

nav{position:sticky;top:0;z-index:50;background:rgba(7,11,22,.86);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
nav .wrap{max-width:1080px;display:flex;align-items:center;justify-content:space-between;height:68px}
.brand{display:flex;align-items:center;gap:11px;font-weight:800;font-size:18px;letter-spacing:-.02em;color:var(--text)}
.brand:hover{text-decoration:none}
.brand small{display:block;font-size:11px;font-weight:600;color:var(--muted);letter-spacing:.01em}
.mark{width:32px;height:32px;border-radius:10px;flex:0 0 32px;display:grid;place-items:center;
  background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff}
.mark svg{width:17px;height:17px}
.navlinks{display:flex;align-items:center;gap:22px}
.navlinks a{color:var(--muted);font-weight:600;font-size:15px}
.navlinks a:hover{color:var(--text);text-decoration:none}
.navcta{background:var(--accent)!important;color:#fff!important;padding:9px 17px;border-radius:11px;font-weight:700}
.navcta:hover{filter:brightness(1.1)}

header.post{padding:62px 0 12px}
header.post .kicker{font-size:13px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--accent);margin-bottom:16px}
h1{font-size:clamp(31px,5.4vw,46px);line-height:1.1;letter-spacing:-.03em;font-weight:800;margin:0 0 20px}
h1 em{font-style:normal;background:linear-gradient(100deg,#8fc0ff,#4f8cff 45%,#a98bff);-webkit-background-clip:text;background-clip:text;color:transparent}
.lede{font-size:20px;color:#c3d0ea;margin:0 0 26px}
.byline{font-size:14px;color:var(--muted);border-top:1px solid var(--line);padding-top:18px;margin:0}

article{padding:14px 0 30px}
article h2{font-size:26px;line-height:1.22;letter-spacing:-.02em;font-weight:800;margin:44px 0 14px}
article h3{font-size:20px;font-weight:700;margin:32px 0 10px}
article p{margin:0 0 20px}
article ul{margin:0 0 22px;padding-left:22px}
article li{margin-bottom:11px}
article b,article strong{color:#fff}
article em{color:#cfdcf6}
article a{border-bottom:1px solid rgba(79,140,255,.4)}
article blockquote{margin:26px 0;padding:16px 20px;border-left:3px solid var(--accent);
  background:var(--surface);border-radius:0 12px 12px 0;color:#c3d0ea}

.band{margin:56px 0 20px;padding:38px 32px;border-radius:var(--radius);text-align:center;
  background:radial-gradient(700px 340px at 50% 0%,rgba(79,140,255,.20),transparent 70%),var(--surface);
  border:1px solid var(--line)}
.band h2{font-size:27px;font-weight:800;letter-spacing:-.02em;margin:0 0 12px}
.band p{color:#c3d0ea;margin:0 0 24px;font-size:17px}
.band .fine{font-size:14px;color:var(--muted);margin:16px 0 0}
.btn{display:inline-block;background:var(--accent);color:#fff;font-weight:700;font-size:17px;
  padding:14px 28px;border-radius:13px;box-shadow:0 12px 30px rgba(79,140,255,.32)}
.btn:hover{text-decoration:none;filter:brightness(1.08)}

.next{margin:44px 0 0;padding-top:30px;border-top:1px solid var(--line)}
.next h3{font-size:14px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin:0 0 16px;font-weight:700}

.cards{display:grid;gap:18px;margin:30px 0 10px}
.card{display:block;padding:26px 26px 22px;border-radius:var(--radius);background:var(--surface);
  border:1px solid var(--line);transition:transform .18s ease,border-color .18s ease}
.card:hover{text-decoration:none;transform:translateY(-3px);border-color:#3a4c74}
.card h2{font-size:22px;font-weight:800;letter-spacing:-.02em;margin:0 0 10px;color:var(--text);line-height:1.25}
.card p{color:#a9b8d8;margin:0 0 14px;font-size:16px}
.card .meta{font-size:13px;color:var(--muted);font-weight:600}

footer{border-top:1px solid var(--line);margin-top:64px;padding:40px 0 60px;background:var(--bg2)}
footer .wrap{max-width:1080px}
footer .brand{margin-bottom:12px}
footer p{color:var(--muted);margin:0;font-size:15px}
footer .fine{margin-top:14px;font-size:14px}

@media(max-width:620px){
  nav .wrap{height:60px}
  .navlinks{gap:14px}
  .navlinks a:not(.navcta){display:none}
  header.post{padding:44px 0 8px}
  .band{padding:30px 22px}
  .card{padding:22px 20px}
}
`;

/* ------------------------------------------------------------------ build --- */

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'blog.css'), CSS);

const articleLd = (p) => `<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: p.title,
  description: p.desc,
  datePublished: p.date,
  dateModified: p.date,
  author: { '@type': 'Organization', name: 'Get It?' },
  publisher: { '@type': 'Organization', name: 'Get It?' },
  mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}/blog/${p.slug}` },
  image: `${SITE}/og-image.png`
})}
</script>
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: 'Blog', item: SITE + '/blog/' },
    { '@type': 'ListItem', position: 3, name: p.title, item: `${SITE}/blog/${p.slug}` }
  ]
})}
</script>
`;

// posts
POSTS.forEach((p) => {
  const others = POSTS.filter((x) => x.slug !== p.slug);
  const next = `
<div class="next">
  <h3>Read next</h3>
  <div class="cards">
${others.map((o) => `    <a class="card" href="/blog/${o.slug}"><h2>${o.title}</h2><p>${o.desc}</p><span class="meta">${o.mins} min read</span></a>`).join('\n')}
  </div>
</div>`;

  const html = head({
    title: `${p.title} | Get It?`,
    canonical: `${SITE}/blog/${p.slug}`,
    desc: p.desc,
    jsonld: articleLd(p)
  }) + `
<header class="post">
  <div class="wrap">
    <div class="kicker">Teaching</div>
    <h1>${p.h1}</h1>
    <p class="lede">${p.lede}</p>
    <p class="byline">${p.mins} min read &middot; Updated ${p.date}</p>
  </div>
</header>

<article>
  <div class="wrap">
${p.body.trim()}
${cta}${next}
  </div>
</article>
` + foot;

  fs.writeFileSync(path.join(OUT, p.slug + '.html'), html);
});

// index
const indexHtml = head({
  title: 'Blog | Get It?',
  canonical: `${SITE}/blog/`,
  desc: 'Practical writing about checking understanding: exit tickets, formative assessment, and finding the pupils who are quietly faking it.',
  ogType: 'website',
  jsonld: `<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: 'Get It? Blog',
  url: SITE + '/blog/',
  description: 'Practical writing about checking understanding in the classroom.',
  blogPost: POSTS.map((p) => ({
    '@type': 'BlogPosting',
    headline: p.title,
    description: p.desc,
    url: `${SITE}/blog/${p.slug}`,
    datePublished: p.date
  }))
})}
</script>
`
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
${POSTS.map((p) => `    <a class="card" href="/blog/${p.slug}">
      <h2>${p.title}</h2>
      <p>${p.desc}</p>
      <span class="meta">${p.mins} min read</span>
    </a>`).join('\n')}
  </div>
${cta}
</div>
` + foot;

fs.writeFileSync(path.join(OUT, 'index.html'), indexHtml);

// sitemap, regenerated so it can never go stale
const urls = [
  { loc: `${SITE}/`, changefreq: 'weekly', priority: '1.0' },
  { loc: `${SITE}/blog/`, changefreq: 'weekly', priority: '0.8' },
  ...POSTS.map((p) => ({ loc: `${SITE}/blog/${p.slug}`, changefreq: 'monthly', priority: '0.7' }))
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

fs.writeFileSync(path.join(__dirname, '..', 'landing-site', 'sitemap.xml'), sitemap);

console.log('wrote landing-site/blog/blog.css');
POSTS.forEach((p) => console.log('wrote landing-site/blog/' + p.slug + '.html'));
console.log('wrote landing-site/blog/index.html');
console.log('wrote landing-site/sitemap.xml  (' + urls.length + ' urls)');
