# Getting Pet Rock live and multiplayer

Everything from where the code is now to a public website with a shared
leaderboard. About **10 minutes**, all free, no credit card.

You need a GitHub account (you have one) and a Supabase account (step 1
makes one). Do the parts in order — Supabase first, so the site only has to
be deployed once.

Your site will end up at **https://jack-o-vscode.github.io/My-Game/**

---

## Part 1 — Create the backend (~5 min)

This is what makes the leaderboard shared instead of simulated.

**1.1** Go to [supabase.com](https://supabase.com) → **Start your project** →
sign in with GitHub.

**1.2** **New project**:

| Field | What to put |
| --- | --- |
| Name | `pet-rock` (anything) |
| Database password | Click generate. You won't need it again, but save it somewhere. |
| Region | Whichever is closest to you |
| Plan | Free |

Click **Create new project** and wait ~2 minutes while it provisions.

**1.3 Create the table.** In the left sidebar: **SQL Editor** → **New query**.
Open [`supabase/schema.sql`](supabase/schema.sql) in this repo, copy the
**whole file**, paste it into the editor, click **Run**.

You should see **"Success. No rows returned"**. That's correct — it creates a
table, a security policy and a function, none of which return rows.

**1.4 Copy your two keys.** Left sidebar: **Project Settings** (the gear) →
**API**. You need:

- **Project URL** — looks like `https://abcdefghijkl.supabase.co`
- The key labelled **`anon`** / **`public`** — a long string starting `eyJ…`
  (some newer dashboards call this the **publishable** key)

> ⚠️ Take the **anon / public** key only. Never copy the one marked
> `service_role` or `secret` — that one bypasses all security and must never
> go in a website.

---

## Part 2 — Put the keys in the app (~2 min)

The anon key is *designed* to be public and belongs in the code. Security
comes from `schema.sql`, not from hiding this key.

Open [`js/config.js`](js/config.js) on GitHub → click the **pencil** (Edit) →
find this near the top and fill in both strings:

```js
export const SUPABASE = {
  url: 'https://abcdefghijkl.supabase.co',
  anonKey: 'eyJhbGciOi…your long anon key…',
};
```

Click **Commit changes**.

---

## Part 3 — Put the site on the internet (~2 min)

**3.1** Go to
[Settings → Pages](https://github.com/Jack-O-VScode/My-Game/settings/pages).

**3.2** Under **Build and deployment → Source**, choose **GitHub Actions**
from the dropdown. There is nothing to save — it applies immediately.

This step cannot be automated: creating a Pages site needs admin rights that
the Actions token deliberately does not have.

**3.3** Go to the [Actions tab](https://github.com/Jack-O-VScode/My-Game/actions).
The **Deploy to GitHub Pages** run should go green in about a minute. If the
most recent run is red from before you did 3.2, open it and click
**Re-run all jobs**.

**3.4** Open **https://jack-o-vscode.github.io/My-Game/** — your rock is live.

---

## Part 4 — Check multiplayer actually works (~2 min)

**4.1** Open the site on **two different devices** (phone + laptop, or a
normal window + a private window). Each counts as its own device and gets its
own pet — that's the "one pet per device" rule.

**4.2** On each, go to **More** and set a different **Keeper** name, so you
can tell them apart.

**4.3** Tap **Ranks** on both. You want a green line reading:

> 🌐 Live · 2 keepers online · updated just now

and both names in the list, with yours highlighted. Tap **Highest first** to
flip the order — it works the same on a live board.

**4.4** For proof from the other side: in Supabase, **Table Editor** →
**pets**. One row per device, with the levels and names you just saw.

If it says **🎮 Practice mode** instead, the keys did not reach the deployed
site — see Troubleshooting.

---

## Part 5 — Install it as an app

| Device | How |
| --- | --- |
| **Android** — Chrome | Open the site → **More → Install**, or browser menu ⋮ → **Install app** |
| **iPhone / iPad** — **Safari only** | **Share** ⬆️ → **Add to Home Screen** → **Add**. Chrome and Firefox on iOS cannot install web apps. |
| **Windows** — Chrome/Edge | Install icon in the address bar, or menu → **Apps → Install this site as an app** |

Installed, it opens full screen, keeps its own save, and plays offline. Share
the URL with anyone — they join the same leaderboard automatically.

---

## Troubleshooting

The app tells you what is wrong on the **Ranks** screen. Match the message:

| Message | Cause | Fix |
| --- | --- | --- |
| 🎮 **Practice mode** | No keys in the deployed site | Part 2 — check both strings are filled in and the commit deployed (Actions tab is green) |
| ⚠️ **Supabase rejected the key** | Wrong key, or `schema.sql` never ran | Re-copy the **anon/public** key; re-run Part 1.3 |
| ⚠️ **Table or function missing** | `schema.sql` not run on *this* project | Part 1.3, making sure you are in the right project |
| ⚠️ **Could not reach Supabase** | Typo in the URL, or the project is paused | Check the URL; open the Supabase dashboard and resume the project |
| ⚠️ **did not answer in time** | Slow network or a cold project | Tap the status line to retry |
| Board shows only you | Nobody else has opened the site yet | Open it on a second device |

**Still stuck?** Open the site, press <kbd>F12</kbd> → **Console** on a
desktop browser. The app logs the real reason there.

---

## Things worth knowing

- **Free Supabase projects pause after ~7 days with no activity.** The board
  falls back to practice mode until you open the dashboard and resume it. If
  people play regularly, it never pauses.
- **One pet per device, no accounts.** Clearing site data, or using a
  different browser, means a new device and a fresh pet. *Start over*
  replaces your row rather than leaving a duplicate.
- **Scores are self-reported.** The server clamps them to sane ranges and
  stops anyone writing to another device's row, but it cannot tell whether a
  level was really earned. Friendly competition, not a ranked ladder.
- **Changing the game later:** edit, commit, and Pages redeploys itself. The
  service worker fetches code from the network first, so a refresh is enough
  to pick up a new version.
- **Custom domain:** point a `CNAME` record at `jack-o-vscode.github.io`,
  then set it under Settings → Pages → Custom domain. Keep *Enforce HTTPS*
  on — installing a PWA requires it.
