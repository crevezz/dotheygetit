# Get It? Advert Standard (APPROVED 25 Sep 2026)

All 10 ads in `out/beats/*-story-app.mp4` are signed off. Every new ad must match them or beat them.
**Read this file before touching any advert.**

## The source of truth
- `_rebuild.js`: the ad definitions (hooks, names, questions, answers, results order). **Add or change ads HERE**, then run `node _rebuild.js`. It rewrites `scripts/*.json` and the OVERRIDES/PARAMS in `beats.config.js`.
- `_icons.js`: the per-ad chip icons (`CHIP_ICONS` in scenes.js, `icon` param). Run it after `_rebuild.js`, because the rebuild resets the params.
- NEVER run `_make9.js` (the rejected template generator). NEVER hand-overwrite OVERRIDES/PARAMS wholesale: that wiped every icon and name once.

## The spine (every ad, 6 beats)
| # | Scene | Onscreen | VO |
|---|---|---|---|
| 0 | chips (+ fitting icon) | Hook, teachers' own words | Hook + 1–3 pupil names, cards pop in time |
| 1 | chips quiet (1 card, second icon) | The pain | The one pupil who got missed |
| 2 | laptop | Type a topic. It writes the questions. | Get It? You type the topic. It writes the questions. |
| 3 | phone `tab:1` (tablet look) | Every pupil answers. Any device. | Every pupil answers privately, on any device. (+ optional short tag) |
| 4 | results `hl:[g,a,r]` | Marked. Sorted. By name. | It marks every answer. X got it. Y is unsure. Z needs help. |
| 5 | domain `min:1` | dotheygetit.app | Free. Nothing to install. dotheygetit dot app. |

## Hard rules
- NEVER say or show "phone". UK schools are banning them. Always say **"any device"**, with a tablet-style screen.
- No buzzwords. Use teachers' language: exit tickets, cold calling, marking, mocks, cover, head of department.
- By ~15s the viewer MUST have seen: type topic → private answers → who got it / unsure / needs help **BY NAME**.
- Results VO names all three groups (got it, unsure, needs help), in the same order they light up.
- The tablet question and answer must be **correct** and match the ad's subject.
- The names in the hook = the names on the results screen.
- Icons must fit the hook (hand only for hands-up; thumbs for nod; mic for speak ...). Never one icon for every ad.
- VO must not narrate what the pupil types (no "Maya types ...").
- End card: domain solid **#fff with a black drop shadow**, minimal, corner watermark fades on the last beat.

## Build and check
```
cd marketing
node _rebuild.js && node _icons.js
del /q out\beats\vo\<id>-*.mp3        (ALWAYS when VO changed, or the old audio is reused)
set POSTER=2&& set OUTNAME=app&& node beat-film.js <id>
node beat-film.js <id> --plan          (beat start times, so you sample the right frames)
set GEMINI_MODEL=gpt-5-2&& node _eyes.js <id>-story-app.mp4 <t1,t2,...>
```
- Sample frames LATE in each beat (names animate in). Check: icons, names visible, correct answer, results names.
- In cmd: no space before `&&` after `set`.
- Build one ad at a time, check it with eyes, show the user, then build the next. Never batch-generate blind.

## Approved line-up
quiet, nod, ninepm, twominutes, middle, cover, proof, before, speak, plainly. Hooks and names are in `_rebuild.js`.
Gold reference: `out/beats/quiet-story-app.mp4`.

## Landing page video (16:9)
- Source script: `marketing/scripts/explainer.json`. Render: `set POSTER=2&& set OUTNAME=app&& set SIZES=hd&& node beat-film.js explainer` -> `out/beats/explainer-hd-app.mp4` (1920x1080, ~67s).
- The `hd` size is added by `marketing/_hd.js` (tokens.js + scenes.js + beats.config.js). Landscape layout: caption left, picture right.
- Web assets: `node marketing/make-web-video.js` -> `landing-site/media/` (hero.mp4/webm/jpg = silent 21s loop; what-is-get-it.mp4 + poster = full video). Run this after every explainer re-render.
- Landing page: `landing-site/index.html` - hero autoplay loop (muted, CTA stays above the fold) + a `#what` section with the full video, play on click.
- YouTube: scheduled via tutorial/upload-story-ads.js (the explainer entry has its own `file` and `wide:1` so it is not tagged #Shorts).
