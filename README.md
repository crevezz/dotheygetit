# Understanding Check

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

## Coming next (not built yet)

- Voice (speak + listen) via OpenRouter's free speech models.
- Shared question bank that grows as teachers use it.
- Accounts + paid tier.