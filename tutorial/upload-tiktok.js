/**
 * Don Vincetti - TikTok Uploader
 * 
 * First run:  node tiktok-upload.js --login   (links your TikTok account ONCE)
 * Every run:  node tiktok-upload.js
 *
 * Login is stored in the persistent Brave profile at tiktok_profile\
 * (NOT just a cookies file -- the profile is what keeps you signed in).
 * 
 * Posts the latest un-uploaded video immediately to TikTok.
 * Windows Task Scheduler fires this at 7AM and 6PM daily.
 * If no new video exists at that time, exits silently.
 */

/* Playwright lives in the shared apps\briefs install, not in this project, so
   fall back to it rather than downloading a second copy here. */
const { chromium } = (() => {
    try { return require('playwright'); }
    catch (_) {
        return require(process.env.PLAYWRIGHT_DIR
            || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright');
    }
})();
const fs   = require('fs');
const path = require('path');

const COOKIES_PATH = path.join(__dirname, 'tiktok_cookies.json');
const PROFILE_DIR  = path.join(__dirname, 'tiktok_profile'); // persistent Brave profile = the real account link
const OUTPUT_DIR   = path.join(__dirname, '..', 'marketing', 'out', 'beats');
const BRAVE_PATH   = 'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';

function braveExecutable() {
    const candidates = [
        BRAVE_PATH,
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    ];
    for (const c of candidates) { if (fs.existsSync(c)) return c; }
    return BRAVE_PATH;
}

// TikTok is picky about cookie shape -- expiring 0/sameSite 'unspecified' get rejected
// and then the session silently doesn't apply.
function normalizeCookies(rawCookies) {
    return (rawCookies || []).map((c) => {
        let sameSite = c.sameSite;
        if (!sameSite || sameSite === 'unspecified' || sameSite === null) sameSite = 'Lax';
        if (sameSite === 'no_restriction' || sameSite === 'None') sameSite = 'None';
        if (typeof sameSite === 'string') {
            const v = sameSite.toLowerCase();
            if (v === 'lax') sameSite = 'Lax';
            else if (v === 'strict') sameSite = 'Strict';
            else if (v === 'none' || v === 'no_restriction') sameSite = 'None';
            else sameSite = 'Lax';
        }
        let expires = c.expires;
        if (expires == null && c.expirationDate != null) expires = c.expirationDate;
        if (expires == null || expires === 0) expires = -1;
        return {
            name: c.name,
            value: c.value,
            domain: c.domain || '.tiktok.com',
            path: c.path || '/',
            expires,
            httpOnly: !!c.httpOnly,
            secure: c.secure !== false,
            sameSite,
        };
    }).filter(c => c.name && c.value != null);
}

async function openTikTokBrowser(options = {}) {
    const { slowMo = 0 } = options;
    if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });

    // The persistent profile is the account link. A plain launch() + cookies file is NOT
    // enough -- TikTok ties the session to the profile fingerprint and throttles retries.
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        slowMo,
        executablePath: braveExecutable(),
        args: [
            '--no-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=ChromeWhatsNewUI',
        ],
        viewport: { width: 1280, height: 900 },
        ignoreDefaultArgs: ['--enable-automation'],
    });

    if (fs.existsSync(COOKIES_PATH)) {
        try {
            const raw = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
            const cookies = normalizeCookies(raw);
            if (cookies.length) {
                await context.addCookies(cookies);
                console.log('[TikTok] Loaded ' + cookies.length + ' cookies into profile');
            }
        } catch (e) {
            console.log('[TikTok] Cookie load skipped: ' + e.message);
        }
    }

    return context;
}

async function saveSessionFromContext(context) {
    const cookies = await context.cookies();
    const normalized = normalizeCookies(cookies);
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(normalized, null, 2));
    return normalized;
}

// =============================================================================
// CAPTION BUILDER
// =============================================================================
function readSavedTitle(folderPath, topic) {
    try {
        const p = path.join(folderPath, 'title.txt');
        if (fs.existsSync(p)) {
            const t = fs.readFileSync(p, 'utf8').replace(/\s+/g, ' ').trim();
            if (t && !/^the downfall of/i.test(t) && !/^what happened to/i.test(t)) return t;
        }
    } catch (_) {}
    return '';
}

function buildCaptionLegacy(topic, folderPath) {
    const saved = folderPath ? readSavedTitle(folderPath, topic) : '';
    const hooks = [
        `${topic} never saw the last night coming.`,
        `His own crew sold him out. ${topic}`,
        `The raid that ended ${topic}.`,
        `They buried the story of ${topic}.`,
    ];
    const hook = saved || hooks[Math.floor(Math.random() * hooks.length)];
    const description =
        `${hook}\n\n` +
        `Follow for daily stories of extinct gangsters and vanished crime empires. New case file daily. \n\n` +
        `#donvincetti #truecrime #mobsters #mafiahistory #historytiktok ` +
        `#didyouknow #crimefacts #weirdhistory #gangsters #viral #fyp #foryou #truecrimecommunity #organizedcrime #mafia`;
    return { title: hook.slice(0, 150), description };
}

// =============================================================================
// FIND LATEST UN-UPLOADED VIDEO
// =============================================================================
function getLatestVideoLegacy() {
    if (!fs.existsSync(OUTPUT_DIR)) return null;
    const folders = fs.readdirSync(OUTPUT_DIR)
        .filter(n => fs.statSync(path.join(OUTPUT_DIR, n)).isDirectory())
        .map(n => ({ name: n, time: fs.statSync(path.join(OUTPUT_DIR, n)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);

    for (const folder of folders) {
        const d = path.join(OUTPUT_DIR, folder.name);
        if (fs.existsSync(path.join(d, 'TIKTOK_UPLOADED.txt'))) continue;
        let file = fs.readdirSync(d).find(f => f.endsWith('-final-withending.mp4'));
        if (!file) file = fs.readdirSync(d).find(f => f.endsWith('-final.mp4'));
        if (!file) continue;
        const topic = folder.name.replace(/-\d+$/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        return { videoPath: path.join(d, file), folderPath: d, topic };
    }
    return null;
}

// =============================================================================
// ONE-TIME LOGIN - saves cookies
// =============================================================================
/* Get It? adverts sit flat in marketing/out/beats as <ad>-story-app.mp4.
   They go up ONE A DAY, in this order; already-posted ads are skipped, so the
   daily task just posts the next one and does nothing when the list is done.
   Force one ad:  node upload-tiktok.js nod          Preview only:  --dry */
const STATE_PATH = path.join(__dirname, 'tiktok_state.json');
const MIN_GAP_HOURS = 20;   // one post per day, hard floor. Never spam.
const AD_ORDER = ['nod', 'ninepm', 'twominutes', 'middle', 'cover', 'proof', 'before', 'speak', 'plainly', 'sayit'];

function readState() {
    try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
    catch (_) { return { posted: {}, lastAttempt: null }; }
}
function writeState(st) { fs.writeFileSync(STATE_PATH, JSON.stringify(st, null, 2)); }
function postedSet() { return new Set(Object.keys(readState().posted || {})); }
/* Recorded BEFORE the upload so a failed verification can never re-post the same ad. */
function markAttempt(topic) {
    const st = readState();
    st.posted = st.posted || {};
    st.posted[topic] = new Date().toISOString();
    st.lastAttempt = new Date().toISOString();
    writeState(st);
}
const markPosted = markAttempt;
function lastAttemptAgeHours() {
    const t = readState().lastAttempt;
    if (!t) return Infinity;
    return (Date.now() - new Date(t).getTime()) / 3600000;
}

function getLatestVideoLegacy() {
    if (!fs.existsSync(OUTPUT_DIR)) return null;
    const folders = fs.readdirSync(OUTPUT_DIR)
        .filter(n => fs.statSync(path.join(OUTPUT_DIR, n)).isDirectory())
        .map(n => ({ name: n, time: fs.statSync(path.join(OUTPUT_DIR, n)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);

    for (const folder of folders) {
        const d = path.join(OUTPUT_DIR, folder.name);
        if (fs.existsSync(path.join(d, 'TIKTOK_UPLOADED.txt'))) continue;
        let file = fs.readdirSync(d).find(f => f.endsWith('-final-withending.mp4'));
        if (!file) file = fs.readdirSync(d).find(f => f.endsWith('-final.mp4'));
        if (!file) continue;
        const topic = folder.name.replace(/-\d+$/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        return { videoPath: path.join(d, file), folderPath: d, topic };
    }
    return null;
}

// =============================================================================
// ONE-TIME LOGIN - saves cookies
// =============================================================================
function nextInOrder() {
    if (!fs.existsSync(OUTPUT_DIR)) return null;
    const films = fs.readdirSync(OUTPUT_DIR).filter(f => /-story-app\.mp4$/.test(f) || f.endsWith('-story.mp4'));
    const posted = postedSet();
    const pick = (topic) => {
        const f = films.find(x => x === topic + '-story-app.mp4') || films.find(x => x === topic + '-story.mp4');
        return f ? { videoPath: path.join(OUTPUT_DIR, f), folderPath: OUTPUT_DIR, topic } : null;
    };
    for (const t of AD_ORDER) { if (!posted.has(t)) { const p = pick(t); if (p) return p; } }
    return null;
}
function getLatestVideo() {
    const want = (process.argv[2] || '').replace(/^--+/, '');
    if (!fs.existsSync(OUTPUT_DIR)) return null;
    const films = fs.readdirSync(OUTPUT_DIR)
        .filter(f => /-story-app\.mp4$/.test(f) || f.endsWith('-story.mp4'));
    const pick = (topic) => {
        const f = films.find(x => x === topic + '-story-app.mp4') || films.find(x => x === topic + '-story.mp4');
        return f ? { videoPath: path.join(OUTPUT_DIR, f), folderPath: OUTPUT_DIR, topic } : null;
    };
    if (want) return pick(want);
    const posted = postedSet();
    for (const t of AD_ORDER) {
        if (!posted.has(t)) { const p = pick(t); if (p) return p; }
    }
    return null;
}

/* One caption per ad, keyed by the ad id. Kept to a single line. */
const CAPTIONS = {
    sayit: 'Not every pupil will write an answer. They can just say it out loud - Get It? turns speech into text, so you still see who understood. Free for teachers: dotheygetit.app  #teachersoftiktok #ukteachers #edtech #primaryteacher #assessment #send #eal',
    plainly: 'Half the class nodded. You still do not know who actually got it. Get It? is a free website that checks what your class has just learned - type a topic, it writes the questions, pupils answer privately on any device. dotheygetit.app  #ukteachers #teachersoftiktok #edtech #assessment #ks2 #ks3',
    ninepm: '9pm. Thirty books still to mark. And you still do not know who got it. Get It? writes a quick quiz on your topic and shows you who understood, in two minutes. Free. dotheygetit.app  #teachersoftiktok #ukteachers #marking #workload #teacherlife',
    nod: 'Everyone nodded. Half of them had not got it. Free two-minute check: type a topic, pupils answer privately on any device, you see who got it and who needs help. dotheygetit.app  #ukteachers #teachersoftiktok #edtech #assessment #reteach',
    quiet: 'Same five hands. Every lesson. Get It? asks the whole class, not just the confident ones - typed or spoken, so the quiet ones get a say too. Free. dotheygetit.app  #ukteachers #teachersoftiktok #oracy #assessment #ks3',
    middle: '16 got it. 39 needed help. What about the other 35 in the middle, who got nothing either way? Get It? shows you all three groups by name. Free. dotheygetit.app  #ukteachers #teachersoftiktok #assessment #differentiation #edtech',
    speak: 'He can say it fine. He writes one line. Get It? lets pupils speak their answer and turns it into text, so the ones who hate writing still show what they know. Free. dotheygetit.app  #ukteachers #teachersoftiktok #send #eal #literacy',
    twominutes: 'Exit tickets tell you on Thursday. Get It? tells you in two minutes, while you can still reteach it in the same lesson. Free. dotheygetit.app  #ukteachers #teachersoftiktok #assessment #reteach #marking',
    cover: 'Year 9 cover, no plan. Type the topic, get four questions, and you know who followed it before the bell. Free. dotheygetit.app  #coverteacher #ukteachers #teachersoftiktok #supplyteacher #edtech',
    before: 'You found out in the mock. Next time find out in the lesson - Get It? checks the whole class in two minutes, free. dotheygetit.app  #ukteachers #teachersoftiktok #gcse #assessment #edtech',
    proof: 'When your head of department asks how you know they got it, show them names instead of nods. Free. dotheygetit.app  #ukteachers #teachersoftiktok #evidence #assessment #slt',
};
const CAPTION_FALLBACK = 'Know who understood, before the next lesson. Free for teachers: dotheygetit.app  #teachersoftiktok #ukteachers #edtech #primaryteacher #assessment';

function buildCaption(topic, folderPath) {
    const c = CAPTIONS[topic] || CAPTION_FALLBACK;
    return { title: c.slice(0, 150), description: c };
}

async function saveLogin() {
    console.log('\n[TikTok] Opening Brave to LINK your account...');
    console.log('[TikTok] This uses a dedicated profile folder: tiktok_profile');
    console.log('[TikTok] Your normal Brave windows are separate - you must sign in HERE once.');

    const context = await openTikTokBrowser();
    const page = context.pages()[0] || await context.newPage();

    // Hit Studio upload first - if the profile is already linked this proves the session works
    await page.goto('https://www.tiktok.com/tiktokstudio/upload', {
        waitUntil: 'domcontentloaded',
        timeout: 90000,
    }).catch(() => {});
    await page.waitForTimeout(4000);

    if (/login|signup|passport/i.test(page.url())) {
        console.log('[TikTok] Not linked yet. Opening login page...');
        await page.goto('https://www.tiktok.com/login', {
            waitUntil: 'domcontentloaded',
            timeout: 90000,
        });
    } else {
        console.log('[TikTok] Looks like this profile may already be signed in.');
        console.log('[TikTok] If you see TikTok Studio/upload, you are linked.');
    }

    console.log('\n========================================');
    console.log(' LINK YOUR TIKTOK ACCOUNT');
    console.log(' 1. In the Brave window that just opened, sign into TikTok');
    console.log(' 2. Use QR / Google / phone / email - whatever you normally use');
    console.log(' 3. Wait until you can see your account (For You / profile / Studio)');
    console.log(' 4. Come back here and press ENTER');
    console.log('========================================\n');

    await new Promise(resolve => {
        process.stdin.resume();
        process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
    });

    console.log('[TikTok] Checking account link...');
    await page.goto('https://www.tiktok.com/tiktokstudio/upload', {
        waitUntil: 'domcontentloaded',
        timeout: 90000,
    }).catch(() => {});
    await page.waitForTimeout(4000);

    if (/login|signup|passport/i.test(page.url())) {
        console.log('[TikTok] FAIL Still on login page. Account is NOT linked.');
        console.log('[TikTok] If TikTok says "too many attempts", STOP and wait 30-60 min.');
        console.log('[TikTok] Then run again:  node tiktok-upload.js --login');
        await page.screenshot({ path: 'tiktok_error.png' }).catch(() => {});
        await context.close();
        process.exit(1);
    }

    const saved = await saveSessionFromContext(context);
    const hasSession = saved.some(c => c.name === 'sessionid' || c.name === 'sid_tt');
    console.log('[TikTok] OK Account linked!');
    console.log('[TikTok] Saved ' + saved.length + ' cookies to tiktok_cookies.json');
    console.log('[TikTok] Persistent profile saved to tiktok_profile\\');
    if (!hasSession) {
        console.log('[TikTok] !! Warning: sessionid cookie not found. You may still get bounced to login.');
    } else {
        console.log('[TikTok] sessionid present - good.');
    }
    console.log('[TikTok] Next: node tiktok-upload.js');
    await context.close();
}


// =============================================================================
// UPLOAD - posts immediately, no scheduling UI
// =============================================================================
async function uploadToTikTok(videoData) {
    if (!fs.existsSync(COOKIES_PATH) && !fs.existsSync(PROFILE_DIR)) {
        console.log('[TikTok] FAIL TikTok not linked yet. Run: node tiktok-upload.js --login');
        process.exit(1);
    }

    const caption = buildCaption(videoData.topic, videoData.folderPath);
    console.log(`\n[TikTok] Uploading: "${videoData.topic}"`);
    console.log(`[TikTok] File: ${videoData.videoPath}`);

    const context = await openTikTokBrowser({ slowMo: 60 });
    const page = context.pages()[0] || await context.newPage();
    let success = false;

    try {
        // == Step 1: Navigate ==================================================
        console.log('[TikTok] Navigating to upload page...');
        await page.goto('https://www.tiktok.com/upload', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);

        if (page.url().includes('login')) {
            console.log('[TikTok] [X] Session expired! Run: node tiktok-upload.js --login');
            await context.close(); process.exit(1);
        }

        // == Step 2: Upload file ===============================================
        console.log('[TikTok] Uploading video file...');
        const fileInput = page.locator('input[type="file"]').first();
        await fileInput.setInputFiles(videoData.videoPath);

        console.log('[TikTok] Waiting for TikTok to process video...');
        await page.waitForTimeout(5000);
        await page.waitForSelector('[data-text="true"]', { timeout: 120000 });
        console.log('[TikTok] [OK] Video processed!');

        // == Step 3: Dismiss any tutorial overlay =============================
        try {
            const overlay = page.locator('[data-test-id="overlay"]').first();
            if (await overlay.isVisible({ timeout: 3000 })) {
                await overlay.click({ force: true });
                await page.waitForTimeout(1000);
            }
        } catch(e) {}
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);

        // == Step 4: Type caption word by word (dismissing hashtag dropdowns) ==
        console.log('[TikTok] Entering caption...');
        const captionBox = page.locator('[data-text="true"]').first();
        await captionBox.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(500);

        const parts = caption.description.split('#');
        const textPart = parts[0].trim();
        const hashtags = parts.slice(1).map(h => '#' + h.trim());

        await page.keyboard.type(textPart, { delay: 30 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);

        for (const tag of hashtags) {
            console.log(`[TikTok] Injecting hashtag: ${tag}`);
            await page.keyboard.type(tag, { delay: 50 });
            await page.waitForTimeout(1500);
            try {
                const suggestionSelector = 'div[class*="recommend-item"], div[class*="search-suggest-item"], [role="option"]';
                const suggestions = page.locator(suggestionSelector);
                if (await suggestions.count() > 0) {
                    await suggestions.first().click();
                    console.log(`[TikTok] Selected suggestion for ${tag}`);
                    await page.waitForTimeout(1000);
                } else {
                    console.log(`[TikTok] No suggestion found for ${tag}, committing manually`);
                    await page.keyboard.press('Space');
                    await page.waitForTimeout(500);
                }
            } catch (err) {
                console.log(`[TikTok] Suggestion click failed for ${tag}: ${err.message}`);
                await page.keyboard.press('Space');
            }
        }
        await page.waitForTimeout(2000);

        // --- Step 4.5: Native TikTok sound DISABLED ---
        // The sound-editor automation was unreliable and threw 'Sound check failed',
        // which aborted the post every run. The video already carries its baked-in VO
        // audio, so upload it as-is (same decision as the working briefs uploader).
        console.log('[TikTok] Skipping native TikTok sound step - posting video audio as-is.');

        // == Step 4.7: Custom cover from thumbnail.jpg =========================
        const thumbPath = path.join(videoData.folderPath, 'thumbnail.jpg');
        if (!fs.existsSync(thumbPath)) {
            console.log('[TikTok] No thumbnail.jpg in folder - keeping TikTok default cover.');
        } else {
            console.log('[TikTok] Setting custom cover from thumbnail.jpg...');
            try {
                const wait = (ms) => page.waitForTimeout(ms);

                // 1. Open the cover editor
                const openSelectors = [
                    '[data-e2e="cover_edit_button"]',
                    'button:has-text("Edit cover")',
                    'text=/^Edit cover$/i',
                    'div[class*="cover"] button',
                    'text=/^Cover$/i',
                ];
                let opened = false;
                for (const sel of openSelectors) {
                    const el = page.locator(sel).first();
                    if (await el.isVisible({ timeout: 2500 }).catch(() => false)) {
                        await el.click({ force: true }).catch(() => {});
                        opened = true;
                        console.log('[TikTok] Cover editor opened via: ' + sel);
                        break;
                    }
                }

                if (!opened) {
                    console.log('[TikTok] Cover editor not found - keeping TikTok default cover.');
                    await page.screenshot({ path: 'tiktok_cover_notfound.png' }).catch(() => {});
                } else {
                    await wait(2500);

                    // 2. Switch to the "Upload cover" tab if the modal defaults to video frames
                    for (const tabSel of ['text=/upload cover/i', '[data-e2e="cover_upload_tab"]']) {
                        const tab = page.locator(tabSel).first();
                        if (await tab.isVisible({ timeout: 1500 }).catch(() => false)) {
                            await tab.click({ force: true }).catch(() => {});
                            console.log('[TikTok] Switched to Upload cover tab');
                            await wait(1200);
                            break;
                        }
                    }

                    // 3. Feed the image to the cover file input (last = the modal's, not the video one)
                    const imgInput = page.locator('input[type="file"]').last();
                    await imgInput.setInputFiles(thumbPath).catch((e) => {
                        console.log('[TikTok] Cover file input failed: ' + e.message);
                    });
                    console.log('[TikTok] Cover image handed to input');
                    await wait(3000);
                    await page.screenshot({ path: 'tiktok_cover_uploaded.png' }).catch(() => {});

                    // 4. Confirm / save the crop
                    const saveSelectors = [
                        '[data-e2e="cover_save_button"]',
                        'button:has-text("Confirm")',
                        'button:has-text("Apply")',
                        'button:has-text("Save")',
                        'button:has-text("Done")',
                    ];
                    for (const sel of saveSelectors) {
                        const b = page.locator(sel).last();
                        if (await b.isVisible({ timeout: 1500 }).catch(() => false)) {
                            await b.click({ force: true }).catch(() => {});
                            console.log('[TikTok] Cover confirmed via: ' + sel);
                            break;
                        }
                    }
                    await wait(2000);
                    console.log('[TikTok] Cover step finished.');
                }
            } catch (e) {
                console.log('[TikTok] Cover step error (non-fatal): ' + e.message);
                await page.screenshot({ path: 'tiktok_cover_error.png' }).catch(() => {});
            }
        }

        // == Step 5: Make sure "Post now" / "Now" is selected (not Schedule) ==
        console.log('[TikTok] Ensuring "Post Now" is selected...');
        try {
            const postNow = page.locator('text=/^(Post now|Now)$/i').first()
                .or(page.getByRole('radio', { name: /post now|now/i }).first())
                .or(page.locator('label:has-text("Post now"), label:has-text("Now")').first());
            if (await postNow.isVisible({ timeout: 3000 }).catch(() => false)) {
                await postNow.click({ force: true }).catch(() => {});
                console.log('[TikTok] Selected Post Now');
                await page.waitForTimeout(800);
            }
        } catch (e) {
            console.log('[TikTok] Post Now toggle skipped: ' + e.message);
        }

        // -- Step 6: Click Post --
        console.log('[TikTok] Clicking Post button...');
        const postSelectors = [
            'button[data-e2e="post_video_button"]',
            'button[class*="TUXButton--primary"]:has-text("Post")',
            'button:has-text("Post video")',
            'button:has-text("Post"):not(:has-text("Post now"))',
            'button:has-text("Post")',
        ];

        async function confirmContinueToPostIfNeeded() {
            // TikTok often shows "Continue to post?" while the content check is still running.
            // Without clicking the modal "Post now", the video never actually goes live.
            for (let attempt = 0; attempt < 6; attempt++) {
                const dialog = page.locator('text=/Continue to post\?/i').first();
                const dialogVisible = await dialog.isVisible({ timeout: 1500 }).catch(() => false);
                if (!dialogVisible) {
                    const partial = page.locator('text=/still checking your video|continue posting before the check/i').first();
                    if (!(await partial.isVisible({ timeout: 800 }).catch(() => false))) return false;
                }

                console.log('[TikTok] Content-check confirmation modal detected - confirming Post now...');
                const confirmBtn = page.locator(
                    'div[role="dialog"] button:has-text("Post now"), [role="dialog"] button:has-text("Post now"), button:has-text("Post now")'
                ).last();

                let clicked = false;
                if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                    try {
                        await confirmBtn.click({ force: true, timeout: 5000 });
                        clicked = true;
                        console.log('[TikTok] Clicked modal "Post now" via locator');
                    } catch (_) {}
                }

                if (!clicked) {
                    const coords = await page.evaluate(() => {
                        const nodes = Array.from(document.querySelectorAll('button, [role="button"]'));
                        const matches = nodes.filter(el => {
                            const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
                            return /^post now$/i.test(t);
                        });
                        matches.sort((a, b) => {
                            const ar = a.getBoundingClientRect();
                            const br = b.getBoundingClientRect();
                            const ac = Math.abs((ar.left + ar.right) / 2 - window.innerWidth / 2)
                                + Math.abs((ar.top + ar.bottom) / 2 - window.innerHeight / 2);
                            const bc = Math.abs((br.left + br.right) / 2 - window.innerWidth / 2)
                                + Math.abs((br.top + br.bottom) / 2 - window.innerHeight / 2);
                            return ac - bc;
                        });
                        const el = matches[0];
                        if (!el) return null;
                        const r = el.getBoundingClientRect();
                        return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: (el.textContent || '').trim() };
                    });
                    if (coords) {
                        await page.mouse.click(coords.x, coords.y);
                        clicked = true;
                        console.log(`[TikTok] Mouse-clicked modal "${coords.t}" at (${Math.round(coords.x)}, ${Math.round(coords.y)})`);
                    }
                }

                if (!clicked) {
                    console.log('[TikTok] Modal seen but Post now not clickable yet, retrying...');
                    await page.waitForTimeout(1000);
                    continue;
                }

                await page.waitForTimeout(2000);
                await page.locator('text=/Continue to post\?/i').first()
                    .waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
                return true;
            }
            return false;
        }

        let posted = false;
        let clickedVia = '';

        // TikTok keeps the Post button DISABLED until its content check finishes.
        // Clicking a disabled button throws nothing and does nothing - that is how
        // the last version "reached the Post button" and still posted nothing.
        async function findPostButton() {
            for (const sel of postSelectors) {
                const loc = page.locator(sel);
                const n = await loc.count().catch(() => 0);
                for (let i = n - 1; i >= 0; i--) {
                    const btn = loc.nth(i);
                    if (!(await btn.isVisible().catch(() => false))) continue;
                    const label = ((await btn.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
                    if (/^post now$/i.test(label)) continue;   // that is the schedule/now radio, not the CTA
                    const box = await btn.boundingBox().catch(() => null);
                    if (!box || box.width < 40 || box.height < 20) continue;
                    return { btn, label, sel, box };
                }
            }
            return null;
        }

        async function postButtonEnabled(btn) {
            return await btn.evaluate(el => {
                if (el.disabled) return false;
                if (el.getAttribute('aria-disabled') === 'true') return false;
                return !el.className.split(/\s+/).some(c => /disabled/i.test(c));
            }).catch(() => true);
        }

        console.log('[TikTok] Waiting for the Post button to become enabled (content check)...');
        const postDeadline = Date.now() + 180000;   // up to 3 minutes
        let target = null;
        while (Date.now() < postDeadline) {
            target = await findPostButton();
            if (target && await postButtonEnabled(target.btn)) break;
            target = null;
            await page.keyboard.press('Escape').catch(() => {});
            await page.waitForTimeout(3000);
        }
        if (!target) {
            await page.screenshot({ path: 'tiktok_error.png' }).catch(() => {});
            throw new Error('Post button never became enabled after 3 minutes - content check stuck or still uploading.');
        }
        console.log(`[TikTok] Post button is ready: "${target.label}" via ${target.sel}`);

        for (let attempt = 1; attempt <= 4 && !posted; attempt++) {
            try {
                // NO force: a refusal must surface as an error instead of silently doing nothing
                await target.btn.click({ timeout: 10000 });
                posted = true;
                clickedVia = `${target.sel} attempt ${attempt}`;
                console.log('[TikTok] Clicked Post');
            } catch (e) {
                console.log(`[TikTok] Post click attempt ${attempt} refused: ${e.message}`);
                if (attempt >= 3) {
                    const box = await target.btn.boundingBox().catch(() => null);
                    if (box) {
                        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                        posted = true;
                        clickedVia = 'mouse fallback';
                        console.log('[TikTok] Mouse fallback click sent');
                    }
                }
                await page.waitForTimeout(2500);
            }
        }
        if (!posted) {
            await page.screenshot({ path: 'tiktok_error.png' }).catch(() => {});
            throw new Error('Post button refused every click - video was NOT posted.');
        }

        // -- Confirm the continue-to-post modal, watched for a long time --
        let confirmed = await confirmContinueToPostIfNeeded();
        if (!confirmed) {
            for (let i = 0; i < 20 && !confirmed; i++) {
                await page.waitForTimeout(3000);
                confirmed = await confirmContinueToPostIfNeeded();
            }
        }
        console.log('[TikTok] Modal confirmed = ' + confirmed);

        // -- REAL proof: TikTok navigates away from /upload once it accepts the post --
        console.log('[TikTok] Waiting for TikTok to accept the post (redirect off /upload)...');
        let leftUpload = false;
        for (let i = 0; i < 40; i++) {
            await page.waitForTimeout(3000);
            if (!page.url().includes('/upload')) { leftUpload = true; break; }
            if (await confirmContinueToPostIfNeeded()) confirmed = true;
        }

        const successHint = await page.locator('text=/uploaded|posted|under review|manage posts|your videos/i').first()
            .isVisible({ timeout: 3000 }).catch(() => false);
        const onUploadPage = page.url().includes('/upload');
        console.log(`[TikTok] Verify: leftUpload=${leftUpload}, confirmedModal=${confirmed}, onUploadPage=${onUploadPage}, successHint=${successHint}`);

        if (!leftUpload || onUploadPage) {
            await page.screenshot({ path: 'tiktok_error.png' }).catch(() => {});
            fs.writeFileSync(
                path.join(videoData.folderPath, 'TIKTOK_FAILED.txt'),
                `failed ${new Date().toISOString()}\ntopic=${videoData.topic}\nreason=still on /upload after stepping through the post button\nconfirmedModal=${confirmed}\nclickedVia=${clickedVia}\n`
            );
            throw new Error('Post was never accepted - TikTok stayed on the upload page. NOT marked as uploaded, so it will retry.');
        }

        success = true;
        const marker = path.join(videoData.folderPath, 'TIKTOK_UPLOADED.txt');
        fs.writeFileSync(
            marker,
            `uploaded ${new Date().toISOString()}\ntopic=${videoData.topic}\nfile=${videoData.videoPath}\nconfirmedModal=${confirmed}\nclickedVia=${clickedVia}\nleftUpload=${leftUpload}\nsuccessHint=${successHint}\n`
        );
        markPosted(videoData.topic);
        console.log(`[TikTok] VERIFIED posted. Marked: ${marker}`);
        await page.screenshot({ path: 'tiktok_posted.png' }).catch(() => {});
        await page.waitForTimeout(2000);

    } catch(e) {
        console.error(`\n[TikTok] [X] Failed: ${e.message}`);
        await page.screenshot({ path: 'tiktok_error.png' });
        console.log('[TikTok] Error screenshot saved as tiktok_error.png');
    } finally {
        await context.close();
    }

}

// == Entry point ==
// SAFETY: this never posts unless you name the ad (or pass --post-next), and it
// refuses if anything posted in the last MIN_GAP_HOURS. There is no loop here.
(async () => {
    const raw = process.argv.slice(2);
    const arg = (raw[0] || '').replace(/^--+/, '');
    const force = raw.includes('--force');

    if (raw.includes('--login')) { await saveLogin(); return; }
    if (raw.includes('--status')) {
        const st = readState();
        console.log('[TikTok] posted:', JSON.stringify(st.posted || {}, null, 2));
        console.log('[TikTok] last attempt:', st.lastAttempt || 'never',
            '(' + (lastAttemptAgeHours() === Infinity ? 'n/a' : lastAttemptAgeHours().toFixed(1) + 'h ago') + ')');
        return;
    }

    const video = (arg && !arg.startsWith('post-next')) ? getLatestVideo() : nextInOrder();
    if (!video) { console.log('[TikTok] Nothing to post. Exiting.'); return; }

    if (raw.includes('--dry')) {
        console.log('[TikTok] DRY RUN - would post:', video.topic, '\n  file:', video.videoPath);
        console.log('[TikTok] last attempt was', lastAttemptAgeHours() === Infinity ? 'never' : lastAttemptAgeHours().toFixed(1) + 'h ago');
        return;
    }

    const age = lastAttemptAgeHours();
    if (age < MIN_GAP_HOURS && !force) {
        console.log('[TikTok] Refusing: last post was ' + age.toFixed(1) + 'h ago (floor is ' + MIN_GAP_HOURS + 'h). Use --force to override.');
        return;
    }

    console.log('[TikTok] Found video: ' + video.topic);
    markAttempt(video.topic);            // recorded first, on purpose
    await uploadToTikTok(video);
})();
