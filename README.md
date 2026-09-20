# Get It?

**A simple tool that finds out who *really* knows something — when AI can fake the work.**

A student chats with an AI examiner for 2 minutes. The teacher sees a simple list:
🟢 gets it · 🟡 shaky · 🔴 faking.

- No installs, no npm packages. Just Node.
- Runs on OpenRouter (one key, no other accounts).
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
| `server.js` | The engine. Talks to OpenRouter. |
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

## Coming next (not built yet)

- Voice (speak + listen) via OpenRouter's free speech models.
- Shared question bank that grows as teachers use it.
- Accounts + paid tier.