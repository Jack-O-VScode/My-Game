# Getting Pet Rock live and multiplayer

Your site will be at **https://jack-o-vscode.github.io/My-Game/**

## Where this repo already is

| | |
| --- | --- |
| ✅ Game code, tests, deploy workflow | pushed |
| ✅ Supabase keys wired into [`js/config.js`](js/config.js) | project `dkxuivfyivwskhwfakyx` |
| ⬜ **Database tables created** | Step 1 below — **re-run it**, accounts are new |
| ⬜ **GitHub Pages switched on** | Step 2 below |

Two steps left, about 4 minutes. Neither can be automated: creating tables
needs your database, and creating a Pages site needs admin rights that the
Actions token deliberately does not have.

*(Forked this repo, or want your own backend? See
[Using a different Supabase project](#using-a-different-supabase-project).)*

---

## Step 1 — Create the tables (~2 min)

In the [Supabase dashboard](https://supabase.com/dashboard) for your project:
**SQL Editor** (sidebar) → **New query**.

Open [`supabase/schema.sql`](supabase/schema.sql), copy the **whole file**,
paste it into the editor, click **Run**.

You want **"Success. No rows returned"**. That is the correct result — the
script creates a table, a security policy and a function, none of which
return rows. Running it twice is safe.

To confirm: **Table Editor** should now list **`accounts`**, **`sessions`** and
**`pets`**, all empty until someone signs up.

> Already ran an older version of this file? Run it again. It renames the old
> device-keyed board to `pets_legacy` rather than deleting it, and creates the
> account tables alongside. Players keep the progress saved in their own
> browser: the first time they open the updated game it offers them an account,
> and registering carries that rock over. You can drop `pets_legacy` once
> everyone has signed up.

---

## Step 2 — Put the site on the internet (~2 min)

**2.1** Go to
[Settings → Pages](https://github.com/Jack-O-VScode/My-Game/settings/pages).

**2.2** Under **Build and deployment → Source**, choose **GitHub Actions**.
There is no save button — it applies immediately.

**2.3** Open the [Actions tab](https://github.com/Jack-O-VScode/My-Game/actions).
**Deploy to GitHub Pages** should go green in about a minute. If the newest
run is red *from before* you did 2.2, open it → **Re-run all jobs**.

**2.4** Visit **https://jack-o-vscode.github.io/My-Game/**.

---

## Step 3 — Check multiplayer works (~2 min)

**3.1** Open the site on **two devices** — phone and laptop, or a normal
window and a private window. Each is its own device with its own pet.

**3.2** On each, create an account with a different username when the game
asks. The username is the name other keepers see.

**3.3** Open **Ranks** on both. Each row draws that keeper's own rock. You want
the green line:

> 🌐 Live · 2 keepers online · updated just now

with both names listed and yours highlighted. Tap **Highest first** to
reverse the order — it works the same on a live board.

**3.4** For proof from the database side: Supabase → **Table Editor** →
**accounts** lists the usernames, **pets** one row each. Note that
`password_hash` holds bcrypt hashes, not passwords.

**3.5** The real test of accounts: sign out on one device and sign back in with
the *other* device's username and password. The same rock, level and cosmetics
should appear.

Anything else on that status line? See [Troubleshooting](#troubleshooting).

---

## Step 4 — Install it as an app

| Device | How |
| --- | --- |
| **Android** — Chrome | **More → Install**, or browser menu ⋮ → **Install app** |
| **iPhone / iPad** — **Safari only** | **Share** ⬆️ → **Add to Home Screen** → **Add**. Chrome and Firefox on iOS cannot install web apps. |
| **Windows** — Chrome/Edge | Install icon in the address bar, or menu → **Apps → Install this site as an app** |

It then opens full screen, keeps its own save, and plays offline. Share the
URL with anyone — they join the same leaderboard automatically, with nothing
to configure.

---

## Troubleshooting

The app names the problem on the **Ranks** screen. Find your message:

| Message | Cause | Fix |
| --- | --- | --- |
| ⚠️ **Table or function missing** | `schema.sql` never ran on this project | Step 1 |
| 🎮 **Practice mode** | No keys in the deployed site | Only happens on a fork — see below |
| ⚠️ **Supabase rejected the key** | Key wrong, or `schema.sql` ran on a *different* project | Check the ref in the key matches the project you ran the SQL in |
| ⚠️ **Could not reach Supabase** | Project paused, or a typo in the URL | Open the dashboard and resume the project |
| ⚠️ **did not answer in time** | Slow network, or a cold project waking up | Tap the status line to retry |
| Board shows only you | Nobody else has opened the site yet | Open it on a second device |

On a desktop browser, <kbd>F12</kbd> → **Console** shows the underlying error.

---

## Using a different Supabase project

Only needed if you forked this repo, or want to move to another project.

**1. Create it.** [supabase.com](https://supabase.com) → sign in with GitHub →
**New project**. Generate the database password (you will not need it again),
pick the nearest region, Free plan. Provisioning takes ~2 minutes.

**2. Run** [`supabase/schema.sql`](supabase/schema.sql) as in Step 1.

**3. Find your two values.** The dashboard has reorganised these more than
once, so the reliable route is your project **ref** — the code in your
dashboard URL:

```
https://supabase.com/dashboard/project/dkxuivfyivwskhwfakyx/...
                                        └──── the ref ────┘
```

- **Project URL** is always **`https://<ref>.supabase.co`**. You never have to
  find it in the UI. (Current dashboards do show it under
  **Settings → Data API**; older ones had it under *Settings → API*.)
- **anon key** — **Settings → API Keys**. Take the one labelled **`anon`** /
  **`public`**; on newer projects this may be called the **publishable** key,
  and classic ones live under a **Legacy** tab. Both work.

> ⚠️ Never use the key marked **`service_role`** or **`secret`**. It bypasses
> every protection in `schema.sql` and must never appear in a website. If one
> ever leaks, rotate it in the dashboard immediately.
>
> A quick sanity check: paste the key into [jwt.io](https://jwt.io) — the
> payload must say `"role": "anon"`. The same payload contains your `ref`.

**4. Put them in** [`js/config.js`](js/config.js):

```js
export const SUPABASE = {
  url: 'https://<your ref>.supabase.co',
  anonKey: 'eyJhbGciOi…',
};
```

Commit, and Pages redeploys itself. To try a project *before* committing to
it, use **More → Connect Supabase** in the app — that saves on your device
only, and overrides the built-in keys until you press **Play offline**.

---

## Things worth knowing

- **Free Supabase projects pause after ~7 days with no activity.** The board
  drops to practice mode until you resume it from the dashboard. Regular
  players keep it awake.
- **The anon key is public on purpose.** It names the project; it does not
  grant access. `schema.sql` is what protects the data: read-only row level
  security, `secret` not readable at all, and every write forced through
  `submit_pet()`, which verifies the device secret and clamps its input.
  The flip side of a public repo is that anyone can read that key and add
  rows to the board. They cannot read secrets, overwrite another device's
  row, or post out-of-range values — but junk entries are possible. If that
  ever happens, rate limiting in the SQL function is the fix.
- **One rock per account.** Signing in anywhere brings it with you. Playing
  without an account keeps everything on that device only.
- **Passwords cannot be recovered.** There is no email address on file and so
  no reset link. A forgotten password means a new account; you can delete the
  old row from the Table Editor.
- **Scores are self-reported.** The server clamps them and enforces one row
  per device, but cannot tell whether a level was truly earned. Friendly
  competition, not a ranked ladder.
- **Shipping changes:** edit, commit, and Pages redeploys. The service worker
  fetches code network-first, so one refresh picks up a new version.
- **Custom domain:** point a `CNAME` at `jack-o-vscode.github.io`, set it under
  Settings → Pages → Custom domain, and keep *Enforce HTTPS* on — installing
  a PWA requires it.
