# Get It?

**A simple tool that finds out who *really* knows something — when AI can fake the work.**

A student chats with an AI examiner for 2 minutes. The teacher sees a simple list:
🟢 gets it · 🟡 shaky · 🔴 faking.

- No installs, no npm packages. Just Node.
- On Render, checks run on Gemini (Google AI Studio). OpenRouter is only the fallback.
- Costs fractions of a penny per check.

---

## 1. Get a key

1. Sign up at <https://openrouter.ai> and make an API key.
2. In this folder, make a file called **`key.txt`** and paste the key in it (nothing else).

   (Easier: copy `key.txt.example` to `key.txt` and replace the line.)

## 2. Run it

```
node server.js
```

Open **http://localhost:3000**.

## 3. Try it

1. **Teacher** tab → type a topic (e.g. *comparing fractions*) → **Create check**.
2. Copy the code shown.
3. **Student** tab → paste the code, type a name → **Start**.
4. Answer the AI's questions.
5. Back on **Teacher → Refresh** → see the 🟢🟡🔴 list.

---

## Render: Gemini first, OpenRouter as fallback

Pupils and teachers hit the hosted app. That usage should stay off the OpenRouter
account (those credits are for coding). In **Render → the service → Environment**, set:

| Variable | What to put |
|---|---|
| `GEMINI_API_KEY` | API key from [Google AI Studio](https://aistudio.google.com/apikey). When this is set, every check calls Gemini first. |
| `AI_PROVIDER` | Optional. `gemini` or `openrouter`. Leave it unset: Gemini is used when `GEMINI_API_KEY` is set, otherwise OpenRouter. |
| `OPENROUTER_API_KEY` | Keep the existing key. It is only used if Gemini fails (no credits, auth, rate limit, 5xx, or a network error). |

If `GEMINI_API_KEY` is not set, the app talks to OpenRouter exactly as before
(`key.txt` locally, or `OPENROUTER_API_KEY`). Nothing in the pupil or teacher screens changes.

Model names in `config.json` stay in OpenRouter form (`google/gemini-2.5-flash-lite`).
Gemini is sent the id with `google/` removed. An id AI Studio does not serve
(`google/gemini-3.8-flash`, or anything that is not a Gemini model) is sent as
`gemini-2.5-flash`. Gemini 2.5 Flash and Flash-Lite are called with thinking
off. A clear amount is marked in code. Anything else goes to Flash-Lite first,
and 2.5 Flash is only the second opinion.

When the fallback happens the server logs one line, for example
`AI fallback: Gemini failed (HTTP 402); using OpenRouter`. Keys are never logged.

```
node test-ai-fallback.js
```

## Keep the cost at £0 (optional)

Open `config.json` and change `brainModel` to a **free** model:

```json
"brainModel": "nvidia/nemotron-3-super-120b-a12b:free"
```

Free models can be slower / rate-limited. `google/gemini-2.5-flash-lite` (the
default) is very cheap and reliable — a whole check is a tiny fraction of a penny.

## Files

| File | What it is |
|------|------------|
| `server.js` | The engine. Talks to Gemini, then OpenRouter if Gemini fails. |
| `llm.js` | Which provider is called, and the fallback. |
| `test-ai-fallback.js` | Mocked calls: a Gemini 402 is answered by OpenRouter; no `GEMINI_API_KEY` stays on OpenRouter. |
| `public/` | The screens (teacher + student). |
| `config.json` | Model, number of questions, port. |
| `key.txt` | Your API key (never share it). |
| `data.json` | Saved results (made automatically). |
| `test-admin-delete.js` | Boots the app on a throwaway port and proves only the owner can remove a teacher. |

## The owner view

Whoever signs up with `ADMIN_EMAIL` (default `craigokelly121@hotmail.com`) is the owner.
The owner gets an extra card on the dashboard: every teacher, what they have made, a
button to test the AI, and a button to read the last 20 errors.

**Remove teacher** deletes that account, its classes, every check inside them and every
answer in them, and signs their browser out. Their join codes stop working. The owner
cannot remove their own account, or another owner account. The confirm says the real
numbers before it asks, and nothing here can be undone.

```
node test-admin-delete.js     :: 16 checks: a teacher is refused, the owner is allowed
```

## Facebook lead ads (misconception PDFs)

Instant Form leads can get the same PDF email as the on-site toolkit form.
Point Make.com (Facebook Lead Ads trigger, then an HTTP module) at:

`POST https://dotheygetit.app/.netlify/functions/fb-lead`

Header: `x-lead-secret: <LEAD_WEBHOOK_SECRET>`

```json
{ "full_name": "Jane Smith", "email": "jane@school.sch.uk", "subject": "Maths" }
```

Set `LEAD_WEBHOOK_SECRET` on the Netlify site. The send still uses `PRIVATEEMAIL_PASSWORD`. A raw Facebook lead is also fine: `field_data` entries named `full_name`, `email`, and `subject` fill anything the flat body left out.

`subject` is `Maths`, `Science`, `English`, `History`, `Geography`, or `Other` (any case). `Other`, a missing subject, or anything that is not one of those five gets an email linking all five PDFs. `400` means the email is invalid. `502` means the send failed and the caller should retry.

```
node test-fb-lead.js
```

`marketing_consent` is optional on that webhook. `"true"`, `"1"`, and `"yes"` (any case) opt the lead into teaching tips. `""`, `"false"`, or a missing field do not, and the PDF email is still sent.

## Teaching tips

People who opt in on the misconception-bank form, the survival-pack form, or the Facebook lead webhook can get a follow-up sequence: day 2, day 5, day 9, day 14, then every 14 days. Copy lives in `netlify/functions/lib/nurture-copy.js`. The PDF email itself is unchanged, and it still goes out when the optional box is left unticked.

Nothing in the sequence sends until `NURTURE_ENABLED` is set to `true` on the Netlify site. Also set `NURTURE_UNSUBSCRIBE_SECRET` (at least 16 characters) before turning it on. `PRIVATEEMAIL_PASSWORD` is the mailbox password the PDF emails already use. Subscribers are stored in Netlify Blobs. There is no separate database.

```
node test-nurture.js
node scripts/nurture-dry-run.js --date 2026-10-29
```

The dry run prints which tip would go to which sample subscriber on that UK date. It does not send.

## Coming next (not built yet)

- Voice (speak + listen) via OpenRouter's free speech models.
- Shared question bank that grows as teachers use it.
- Accounts + paid tier.