# brand/

Every image Get It? uses — the favicon, the app icon, the link-preview image —
is generated from **one** file: `mark.js`. Change the tick there and everything
changes together, so the tab icon and the social card can never drift apart.

## Rebuild everything

```
node brand/make.js          # all of it
node brand/make.js icons    # just the favicon / app icons / logos
node brand/make.js social   # just the OG / Twitter / banner images
node brand/verify.js        # checks the output is actually usable
node brand/install.js       # copies the web ones into public/ and landing-site/
node brand/patch-head.js    # drops the <head> block into the three pages
node brand/test-assets.js   # boots the real server and proves it all serves
node brand/deploy-landing.js# pushes landing-site/ to Netlify and checks it live
```

Then commit and push — Render picks up the app side automatically.

Open `brand/out/preview.html` to see everything on one page (checkerboard
means transparent).

## What gets made

| File | Where it's used |
|---|---|
| `favicon.ico` | browsers, old ones and link previews. 16+32+48 in one file |
| `favicon.svg` | modern browsers. Stays sharp at any zoom |
| `favicon-16/32.png` | explicit sizes for browsers that prefer them |
| `apple-touch-icon.png` | iPhone/iPad home screen. Full bleed — iOS adds its own rounding |
| `android-chrome-192/512.png` | Android home screen / PWA install |
| `android-chrome-maskable-512.png` | Android may crop to a circle, so the tick is shrunk to stay inside the safe zone |
| `mstile-150.png` | Windows Start menu / Teams |
| `site.webmanifest` | makes the app installable |
| `og-image.png` 1200×630 | the preview card on WhatsApp, Facebook, LinkedIn, Slack |
| `og-square.png` 1080×1080 | Instagram / WhatsApp status |
| `story-1080x1920.png` | Instagram / TikTok story |
| `linkedin-banner-1584x396.png` | LinkedIn profile or company banner |
| `twitter-card-1200x600.png` | X/Twitter card |
| `logo-horizontal.png`, `logo-stacked.png` | press, decks, email signature. Transparent |
| `logo-mark.svg`, `tick-white/dark.svg` | the mark on its own, for slides and video end cards |

## Why there are tests

A broken favicon is invisible until a browser tab shows a blank square, and a
bad link-preview image is invisible until someone shares the site. So:

- `verify.js` renders each social image and asserts nothing overflows the
  canvas, no readable word is under 18px (it would be a smudge in a thumbnail),
  the image isn't a blank fill, and the tick still shows up as real ink at 16px.
- `test-assets.js` boots the actual server and checks every file the pages
  advertise returns 200 with the right content-type and the right dimensions —
  and that `favicon.ico` really is an `.ico`, not a PNG someone renamed.

Both exit non-zero, so they can be wired into a pre-push check later.

## Notes

- Colours live in `PALETTE` in `mark.js` and match the app's stylesheet.
- `tar` needs the file names listed explicitly when zipping for Netlify —
  passing `.` writes `./index.html` entries, which Netlify stores at the wrong
  path and then 404s on. That one cost a deploy.
- The Netlify token is read from the CLI's own config on this machine
  (`brand/deploy-landing.js`). Nothing secret is in this repo.
