# Get It? — narrated tutorials

Fourteen short videos, recorded from the real app, cut into chapters and voiced over.
They live in `../public/help/` (laptop) and `../public/help/mobile/` (phone), and are
listed on `app.dotheygetit.app/help`.

The point of this folder: the videos are **generated**, not edited. Change the app,
re-run three commands, and the tutorials match again.

## The pipeline

```
record.js  ->  out/raw.webm   }  one continuous take of the whole journey
record-why.js -> out/why.webm }  the landing page, for "why I built this"

build.js --scan       finds the chapter cuts with ffmpeg blackdetect -> chapters.json
narrate.js            writes the voiceover                      -> voice/*.mp3
build.js              retimes + muxes                           -> out/tutorials/*.mp4
```

Then copy `out/tutorials/*.mp4` into `../public/help/`.

```bat
cd tutorial
set "CAPTIONS=0"
node record.js
node record-why.js
node build.js --scan
node narrate.js
node build.js
node check.js            :: verify picture + audio are there
node preview.js out/tutorials/01-what-get-it-is.mp4 3.0   :: ASCII preview of a frame
node test-help.js        :: /help, Range headers, all 30 published files
copy /y out\tutorials\*.mp4 ..\public\help\
copy /y out\tutorials\index.json ..\public\help\index.json
```

`CAPTIONS=0` records with no on-screen captions, which is how the published set is
filmed: the voiceover carries the narration. The hold time on each scene is still
spent, so chapter lengths — and therefore the sync — are unchanged. Write it as
`set "CAPTIONS=0"`, with the quotes: `set CAPTIONS=0 && node ...` leaves a trailing
space in the value, and the code only treats an exact `0` as off.

## The phone set (`MOBILE=1`)

The same journey, filmed in a phone viewport instead of a laptop one. The app is
responsive, so this is the real mobile layout, not a cropped desktop one.

```bat
cd tutorial
set "CAPTIONS=0"
set "MOBILE=1"
node record.js            :: 390x844 -> out/raw-mobile.webm
node record-why.js        ::         out/why-mobile.webm
node build.js --scan      :: -> chapters-mobile.json
node build.js             :: -> out/tutorials-mobile/*.mp4
node check.js             :: reads the mobile index automatically
copy /y out\tutorials-mobile\*.mp4 ..\public\help\mobile\
copy /y out\tutorials-mobile\index.json ..\public\help\mobile\index.json
```

Nothing above touches the laptop set: different takes, a different chapter file,
a different output folder. Both sets can be built and shipped side by side.

- Frame size is taken **from the take**, not assumed. `build.js` reads the take's
  own dimensions and scales to those, so a 390x844 phone take stays 390x844
  instead of being stretched into 1280x800.
- `isMobile` + `hasTouch` are on, so the app serves its phone layout and the
  cursor/ripple behave like a touch screen.
- The phone take is **390x844**, a real phone screen. `recordVideo.size` must be the
  viewport, *not* `viewport × deviceScaleFactor`: Playwright does not scale a
  capture up, it pads. Asking for 780x1688 recorded the page into the top-left of a
  grey 780x1688 frame — which also put the chapter cards at 25% of the picture, so
  `blackdetect` found **zero** chapters and the sync had nothing to lock onto.
- The chapter card shrinks below 520px wide. This is not cosmetic: at 390px the
  desktop 46px title covers enough of the screen to drop the card to **97.7%**
  black, under the 98.5% that `blackdetect` needs. At 30px it measures 98.9%.
- Phone cards still only clear the default threshold by a hair, so `build.js` scans
  the phone take at `pic_th 0.975` instead of 0.985. Nothing else in either take is
  within 70 points of that (the next darkest frames are ~24% black), so the wider
  setting cannot invent a chapter.
- `CAPTIONS=0` still works, and matters less on a phone: the voiceover carries it.


## Why the voiceover cannot drift out of sync

The hard part of narration is lining it up with the picture. The trick here is to
stop guessing:

1. `record.js` shows a **solid-black title card** for 2.2s at every chapter
   boundary — `#__card`, injected by the film overlay.
2. `ffmpeg -vf blackdetect` finds the exact first and last frame of each black
   run. That is the chapter boundary, to the frame. No timestamps to trust.
3. `build.js --scan` stores those numbers in `chapters.json`.
4. For each chapter the video is retimed by `window / (voice + 1.2s)`, capped at
   1.32×, so the picture finishes just after the narration instead of the
   narration being stretched or clipped.
5. The voice clip is laid in with `adelay` at the chapter's own offset.

So a chapter can only ever be wrong if the words are wrong — never because the
audio slid.

Result: 14 chapters, 7 min 41 s, 0.83–1.32× speed, ~19 MB (laptop) / ~15 MB (phone).

Speed stays near 1× wherever the scene is roughly as long as the words. The two
slowest (0.83× and 0.84×) are chapters whose scene is *shorter* than the
narration, so the picture is eased down to make room rather than clipping the
voice. If a scene is much longer than its words, the fix is to add words, not to
raise `MAX_SPEED` — chapter 4 ran at the 1.32× cap and then sat silent for six
seconds until 23 words were added to `03b`.

## Files

| file | what |
|---|---|
| `record.js` | records the main take. Isolated copy of the app in `.run/` on port 4591. |
| `record-why.js` | records the landing page for chapter 7. `WHY_URL=...` to point elsewhere. |
| `build.js` | `--scan` finds cuts; otherwise builds the MP4s. |
| `narrate.js` | generates the voice. `FORCE=1` to regenerate existing clips. |
| `check.js` | duration / codec / volume / silence map, plus frame grabs. |
| `preview.js` | renders a frame as ASCII, so the picture can be checked without eyes on it. |
| `test-help.js` | boots the app and exercises `/help` + Range on all 30 published files (both sets). |
| `narration.json` | **the scripts, and the voice id.** Edit here. |
| `chapters.json` | generated. Do not hand-edit. |
| `chapters-mobile.json` | generated, for `MOBILE=1`. Same rule. |
| `.eleven.key` | the ElevenLabs key. Gitignored. |

## Scratch verifiers

Small, single-purpose scripts written to answer one question each while the set was
being re-recorded. None of them are part of the pipeline, but each one saves a take
when something looks wrong, so they are kept:

| file | answers |
|---|---|
| `_probe.js` | do the scene selectors actually work, on desktop **and** a real phone context? |
| `_pre.js` | does `record.js` still agree with `narration.json` (count, order, titles, length)? |
| `_voicechk.js` | which clips are missing, and has any *existing* clip's words changed? |
| `_dark.js` | how black does a chapter card actually get, frame by frame? |
| `_crop.js` | does `blackdetect` find the cards, and how much headroom is there? |
| `_scan.js` | numeric luma grid of a frame - where in the picture is the app actually drawn? |
| `_shot.js` | pull one frame out of a take as a PNG. |
| `_geo.js` | which `recordVideo` config fills the frame (this is what found the padding bug). |
| `_clip.js` | does the copy button toast "copied", or fall back to "Press Ctrl+C"? |
| `_help.js` | drive the real `/help` page: 14 rows, deep links, laptop/phone toggle. |

`_scenes.txt` is a stale dump of an old scene block and can be deleted.

## Notes

- Playwright is reused from `../../briefs/node_modules/playwright` (override with `PW_DIR`).
- `USE_REAL=1` hits the live LLM instead of the mocked endpoints.
- `TRACE=1` prints camera scroll positions and whether the thing being filmed is
  actually inside the frame.
- On the `/help` page the player defaults to **1×** and remembers whatever you pick.
  There is also a Laptop / Phone toggle: it switches between the two published
  sets, keeping your place in the running order.

## The voice

Designed in ElevenLabs (Voices → Voice Design) from this description, then saved
as a custom voice. The id is in `narration.json`.

> A warm, calm British woman in her late 30s. She sounds like a friendly primary
> school teacher explaining something clearly to a colleague — not a TV advert,
> not corporate. Natural, unhurried, lightly reassuring. Slight smile in her
> voice. Crisp consonants, no theatrics. Mid-range pitch, moderate pace.

The key needs **Text to Speech** permission. It does *not* need `user_read` or
`voices_read` — so `/v1/voices` will 401 even when everything needed works.
