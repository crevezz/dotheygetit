# Get It? — narrated tutorials

Seven short videos, recorded from the real app, cut into chapters and voiced over.
They live in `../public/help/` and are listed on `app.dotheygetit.app/help`.

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
node record.js
node record-why.js
node build.js --scan
node narrate.js
node build.js
node check.js            :: verify picture + audio are there
node preview.js out/tutorials/01-create-account.mp4 4.5   :: ASCII preview of a frame
node test-help.js        :: /help, Range headers, all 8 files
copy /y out\tutorials\*.mp4 ..\public\help\
```

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

Result: 7 chapters, 3 min 23 s, 1.24–1.32× speed (visually identical), ~17 MB.

## Files

| file | what |
|---|---|
| `record.js` | records the main take. Isolated copy of the app in `.run/` on port 4591. |
| `record-why.js` | records the landing page for chapter 7. `WHY_URL=...` to point elsewhere. |
| `build.js` | `--scan` finds cuts; otherwise builds the MP4s. |
| `narrate.js` | generates the voice. `FORCE=1` to regenerate existing clips. |
| `check.js` | duration / codec / volume / silence map, plus frame grabs. |
| `preview.js` | renders a frame as ASCII, so the picture can be checked without eyes on it. |
| `test-help.js` | boots the app and exercises `/help` + Range on all 8 videos. |
| `narration.json` | **the scripts, and the voice id.** Edit here. |
| `chapters.json` | generated. Do not hand-edit. |
| `.eleven.key` | the ElevenLabs key. Gitignored. |

## Notes

- Playwright is reused from `../../briefs/node_modules/playwright` (override with `PW_DIR`).
- `USE_REAL=1` hits the live LLM instead of the mocked endpoints.
- `TRACE=1` prints camera scroll positions and whether the thing being filmed is
  actually inside the frame.
- On the `/help` page the player defaults to **1.5×** — the video is already
  retimed for narration, and teachers do not want a 3-minute video at 1×.

## The voice

Designed in ElevenLabs (Voices → Voice Design) from this description, then saved
as a custom voice. The id is in `narration.json`.

> A warm, calm British woman in her late 30s. She sounds like a friendly primary
> school teacher explaining something clearly to a colleague — not a TV advert,
> not corporate. Natural, unhurried, lightly reassuring. Slight smile in her
> voice. Crisp consonants, no theatrics. Mid-range pitch, moderate pace.

The key needs **Text to Speech** permission. It does *not* need `user_read` or
`voices_read` — so `/v1/voices` will 401 even when everything needed works.
