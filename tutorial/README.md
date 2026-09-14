# Understanding Check — Tutorial Factory

Films a real tutorial of the app automatically: real server, real UI, visible cursor,
click ripples and captions. No screen recorder, no manual clicking.

## Run

```bat
cd tutorial
node record.js
```

Output lands in `tutorial/out/`:
- `understanding-check-tutorial.webm`
- `understanding-check-tutorial.mp4`

## What it does

1. Copies the app into `tutorial/.run/` (a throwaway folder) and boots it on port **4591**.
   Your real `data.json` and any running instance are never touched.
2. Opens Chromium via the Playwright already installed in `../briefs` (v1.61).
3. Injects a cursor + click-ripple + caption overlay into the page, then films.
4. Walks the full two-sided story:
   teacher signs up → adds a class → types a topic → AI writes questions →
   creates the check → student joins with the code → answers the examiner →
   teacher sees the 🟢🟡🔴 breakdown.
5. Cleans up.

## Camera (scrolling)

The whole app is one tall vertical page, so the panel being generated often lands
*below* the fold. The harness therefore treats the viewport as a camera:

- `focus(page, sel, { block })` smooth-scrolls a target into view (`start` / `center` /
  `end` / `nearest`) and waits for the scroll to actually stop before measuring.
- `glideClick` / `glideTo` / `typeIn` all call `focus` first, so the cursor always
  arrives *after* the page has moved and the click lands on real coordinates.
- After generating questions it centres `#qwrap`, then hovers each question in turn.
- Through the student chat it keeps `#answer` pinned at the bottom of the frame.
- On the reveal it centres the 🟢🟡🔴 summary, then walks down each pupil card.

To see the camera trace and in-frame assertions:

```bat
set "TRACE=1"
node record.js
```

```text
[cam] scrollY= 506  block=center   #qwrap
[view] questions generated    {"top":320,"bottom":530,"vh":800,"fully":true}
```

`fully:true` means the element was entirely inside the recorded frame at that moment.

## Mocked vs live AI

By default the three OpenRouter endpoints (`/api/generate`, `/api/chat`, `/api/verdict`)
are **intercepted with canned responses**. That makes the take:

- instant (no waiting on model latency)
- deterministic (same video every time — a bad take is just a re-run)
- free (no tokens burned)

To record a genuine live demo instead:

```bat
set USE_REAL=1
node record.js
```

Expect slower takes and answers that vary between runs.

Note: the "3 students" on the results screen — one is the student driven on camera,
the other two are seeded silently via the API just before the reveal, so the
🟢🟡🔴 summary looks realistic. That is deliberate; remove the `post('/api/result', ...)`
lines in `record.js` if you want only the on-camera student.

## Editing the tutorial

Everything narrative lives in one block at the top of `record.js`:

| Constant | What it controls |
|---|---|
| `TOPIC` | the subject being taught |
| `QUESTIONS` | the questions shown on the teacher screen |
| `ANSWERS` | what the student types (paced for reading) |
| `V_MAYA` / `V_TOM` / `V_PRIYA` | the verdicts shown on the results screen |

Caption text lives inline in `main()`. The cursor itself is the SVG in `OVERLAY()`.

## Pointing it at another app

The harness is generic in shape — for a different app you would change:

1. `APP` (path) and `PORT`.
2. The click-through in `main()` (selectors + captions).
3. The mock rules, if that app calls an LLM.

Everything else — isolation, overlay, recording, overlay self-check — is reusable.

## Troubleshooting

- **`EADDRINUSE`** — something is already on port 4591; change `PORT`.
- **Black video** — the page never finished loading; check `[server]` output.
- **No cursor in the video** — look for `Overlay check : {"hasCursor":true...}` in the
  console. If that line is missing, the overlay failed to inject.
- **Video looks static / misses a panel** — re-run with `set "TRACE=1"` and read the
  `[cam]` lines. The scroll position should change at each scene; if it stays at 0 the
  target was already fully on screen. Add an explicit `focus(page, '#panel', ...)`
  before the step that generates it.
