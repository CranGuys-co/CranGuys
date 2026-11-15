# Setting up Supabase for CranGuys

Supabase gives CranGuys:

- **Accounts.** Players sign in with a 6-digit code sent to their email. There are no passwords.
- **Cloud saves.** A player's bean, Cranberries, Crowns, items, CranPass and rank follow them to any device. The first sign-in can bring the bean they already have on that device.
- **Server-checked progress.** Rewards, the Shop, the Locker, CranPass and promo codes are applied by the server using the game's own rules. A player can't edit their save to give themselves anything.
- **A leaderboard you can trust.** Ranked points only count when the other players in the match confirm it, and world records need an account. Before, anyone could overwrite any entry on the public servers.
- **Smoother multiplayer.** Players find and join each other's rooms through Supabase, on the same secure connection as the website. School and office networks that block the old public servers can now find games. The room list for quick play and the live player counts come from the database.

**Until this is set up, the game works exactly as before:** guest play, progress saved on the device, and online play through the public servers. You can set it up whenever you like.

Two keys you'll see:

- The **publishable key** goes in `src/online/cloud/config.js`. It's meant to be public: on its own it can only do what the security rules in `supabase/setup.sql` allow.
- The **secret key** never goes in the game's code or this repository. Only the `cg-api` Edge Function uses it, and Supabase hands it over on its own servers.

The game's address is `https://harryxgreenhalgh-prog.github.io/CranGuys/`. If you use a custom domain, use that instead wherever it appears below.

## Checklist (everything, in order, no terminal needed)

1. **Make a project.** On [supabase.com](https://supabase.com/dashboard), click **New project**, name it `CranGuys`, pick the region nearest your players, and save the database password somewhere safe (the game never needs it). The free plan allows two active projects. If you already have two, see *Sharing CranSki's project* at the bottom.
2. **Create the database.** Go to **SQL Editor** → **New query**, paste all of `supabase/setup.sql`, and click **Run**. You should see "Success. No rows returned". It's safe to run again.
3. **Connect the game.** Under **Project Settings** → **API Keys**, copy the **Project URL** and the **Publishable key** (it starts `sb_publishable_`) into `src/online/cloud/config.js` (section 1).
4. **Turn on email sign-in.** Go to **Authentication** → **Sign In / Providers** → **Email** (section 2).
5. **Allow your website.** In **Authentication** → **URL Configuration**, set the Site URL and Redirect URLs (section 2).
6. **Put the code in the emails.** In **Authentication** → **Emails** → **Templates**, edit **Confirm signup** and **Magic Link** (section 2).
7. **Set up your own email sender.** In **Authentication** → **Emails** → **SMTP Settings**, do this before you invite players. Supabase's built-in sender only manages a couple of emails an hour (section 3).
8. **Check Realtime.** Under **Realtime** → **Settings**, leave **Allow public access** on (section 4).
9. **Let GitHub deploy the server code.** In your GitHub repository, go to **Settings** → **Secrets and variables** → **Actions** → **New repository secret** and add `SUPABASE_ACCESS_TOKEN` (section 5).
10. **Publish with GitHub Actions.** In GitHub, go to **Settings** → **Pages** and set the **Source** to **GitHub Actions**.
11. **Merge to `main`.** GitHub Actions tests and publishes the game (**Deploy to GitHub Pages**) and deploys the server code (**Deploy Supabase function**). Both should go green on the **Actions** tab.
12. **Try it on the live site** (section 6).

---

## 1. Connect the game

1. In Supabase: **Project Settings** → **API Keys**.
2. Copy the **Project URL** (`https://<something>.supabase.co`) and the **Publishable key** (`sb_publishable_…`). If you only see "anon" and "service_role" keys, use the **anon** key. Never use `service_role` or a secret key.
3. On GitHub, open `src/online/cloud/config.js`, click the pencil to edit it, and fill in the two lines:

   ```js
   export const SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';
   export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_…';
   ```

4. Commit the change. The function deploy reads the project from this URL too, so there's nothing else to fill in.

## 2. Email sign-in

1. **Authentication** → **Sign In / Providers** (called **Providers** in some versions) → **Email**:
   - **Enable Email provider**: on.
   - **Confirm email**: on.
   - **Email OTP Length**: `6`, if this setting is shown.
   - Save.

   The email provider also supports passwords, but CranGuys never shows a password form.
2. **Authentication** → **URL Configuration**:
   - **Site URL**: `https://harryxgreenhalgh-prog.github.io/CranGuys/`
   - **Redirect URLs**: click **Add URL** for each of these:
     - `https://harryxgreenhalgh-prog.github.io/CranGuys/**`
     - `http://localhost:5173/**` (for `npm run dev`)
     - `http://localhost:4173/**` (for `npm run preview`)
   - Save.
3. **Put the sign-in code in the emails.** Players type the code from the email into the game. This works on phones and school laptops, and when an email app turns links off. Supabase uses two templates, and both need the code:
   - **Authentication** → **Emails** → **Templates** → **Confirm signup**: sent the first time someone signs in.
   - **Authentication** → **Emails** → **Templates** → **Magic Link**: sent every time after that.

   For each one, set the **Subject** to `Your CranGuys sign-in code`, replace the **Body** with this, and save:

   ```html
   <h2>Sign in to CranGuys</h2>
   <p>Your sign-in code is:</p>
   <p style="font-size:30px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
   <p>Type it into the game, or <a href="{{ .ConfirmationURL }}">open this link on the device you're playing on</a>.</p>
   <p>The code works once and expires after an hour. If you asked for more than one email, only the newest one works.</p>
   <p>If you didn't ask to sign in to CranGuys, you can ignore this email.</p>
   ```

## 3. Send email for real players

Supabase's built-in email sender is only for testing. It sends a couple of emails an hour at most, and new projects may only deliver to your own Supabase team. Before you invite players:

1. Get SMTP details from an email service, for example Resend, Postmark, Brevo or Amazon SES. You'll need to verify a domain you own with them.
2. **Authentication** → **Emails** → **SMTP Settings**: turn on **Enable custom SMTP**, enter the host, port, username, password and a sender address, and save.
3. **Authentication** → **Rate Limits**: raise the email limit if you need to.

**Using a Gmail account instead** is fine for a small game (about 500 emails a day). It works best with a Gmail account made just for the game, because players see the sender:

| Setting | Value |
| --- | --- |
| Sender email address | the same Gmail address as the username (Gmail won't send "from" any other address) |
| Sender name | `CranGuys` |
| Host | `smtp.gmail.com` |
| Port number | `465` |
| Username | the Gmail address |
| Password | a Google **App Password**, not the normal password. Turn on 2-Step Verification, create one at myaccount.google.com/apppasswords, and paste its 16 letters without spaces |

These emails can land in spam at first. Marking one **Not spam** helps for that inbox, and the code in the email works either way.

## 4. Realtime

**Realtime** → **Settings**: leave **Allow public access** on.

Players who haven't signed in still play online, and they find each other's rooms through public Realtime channels. Those channels only pass "here's my room / let me in" messages between browsers. They can't read or change anything in the database.

The game itself still runs directly between players' browsers, not through Supabase. If two browsers can't connect directly, they relay through the public servers as before. Supabase's free plan allows only about 100 Realtime messages a second for the whole game, and a relay needs about 30 a second per player, so relaying through Supabase isn't an option on it.

## 5. Deploying the server code (the `cg-api` function) without a terminal

`.github/workflows/deploy-functions.yml` deploys `supabase/functions/cg-api` whenever it changes on `main`. You can also run it by hand: **Actions** → **Deploy Supabase function** → **Run workflow**. It needs one secret:

1. On supabase.com, click your avatar (top right) → **Account preferences** → **Access Tokens** → **Generate new token**. Name it `GitHub CranGuys` and copy it.
2. On GitHub, open the repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   - Name: `SUPABASE_ACCESS_TOKEN`
   - Secret: the token you copied.

This token is not the project's secret key, and it never goes in a file. If `SUPABASE_URL` in `config.js` is still empty, the workflow just says so and does nothing.

## 6. Check it works

On `https://harryxgreenhalgh-prog.github.io/CranGuys/`:

1. Click the **person icon** (top right) → enter your email → **Email me a code**. Type the code from the email and click **Sign in**. You should see "Welcome, …! Your bean is now saved to your account."
2. In Supabase, open **Table Editor** → `cg_profiles`. Your bean is there.
3. Play a **Solo** show. When it ends, your Cranberries go up, and `cg_profiles` shows one more show.
4. Open the game on another device or browser and sign in with the same email. It's the same bean.
5. **Top** → **Ranked** shows the leaderboard. It fills up as signed-in players play ranked matches.
6. Under the PLAY button, the live counts (for example "3 online now") come from the database.

If something doesn't work:

| What you see | What to check |
| --- | --- |
| "Requested function was not found" when signing in | The **Deploy Supabase function** workflow hasn't run yet, or it failed. Check the **Actions** tab (section 5). |
| The sign-in link opens "requested path is invalid" or the wrong site | The address isn't on the Redirect URLs list (section 2). Typing the code avoids this. |
| No email arrives | Check spam. Then set up your own email sender (section 3): the built-in one only sends a couple an hour. |
| "That code didn't work" | Only the newest email's code works, and codes expire after an hour. |
| The leaderboard says it can't connect | `supabase/setup.sql` hasn't been run (step 2), or the URL or key in `config.js` is wrong. |

## Looking after the game

Everything is in **Table Editor**:

| Table | What's in it |
| --- | --- |
| `cg_profiles` | One row per account: name, rank (`rp`), wins, level, and the whole save in `data`. **To hide a cheater from the leaderboard and records, tick `banned`.** |
| `cg_ranked` | Every ranked match each player booked, and how it ended. |
| `cg_records` | The world record for each map. Delete a row to free that record up. |
| `cg_rooms`, `cg_live` | Public rooms and live counts. They clean themselves up. |

Deleting a user under **Authentication** → **Users** deletes everything that belongs to them. Players can also do this themselves from the game's Account screen.

### How fair is it?

CranGuys has no game server: every show runs in one player's browser (the host), so Supabase can't watch the games. What the server does check:

- **Rewards:** each show pays out once, never faster than a show can be played, and at most 250 shows count per account per day.
- **Shop, Locker, CranPass and promo codes:** the game's own rules decide everything (`src/online/progress.js`).
- **Ranked:** points only move when the other players booked the same match too. In a duel only one player can win; in a ranked show at least 5 signed-in players must have booked it and only one can take the crown. Each opponent's real rank comes from the server, not from what their game says.
- **Bringing a guest bean into a new account:** its rank is capped at Gold I (600 RP), and the OWNER tag only ever comes from a promo code redeemed on the server.

Someone who hosts a show and changes the game's code could still fake a result. Use `banned` for them. The limits are in `LIMITS` at the top of `supabase/functions/cg-api/handler.js`.

### Free plan limits

- **Realtime:** about 100 messages a second and 200 players connected at once. CranGuys only uses it while players are finding and joining rooms.
- **Pausing:** free projects pause after about a week with no activity. Guests can still play, and the game falls back to the public servers. Restore the project from the dashboard to bring accounts back.
- **Email:** see section 3.

## Updating later

- **Changed the reward, shop or ranked rules** (`src/online/progress.js` or the files it imports)? Run `npm run build:functions` so the server uses the same rules (the tests remind you), then merge. The workflow redeploys the function.
- **Changed the database?** Add a new file to `supabase/migrations/`, run `npm run build:sql`, and paste `supabase/setup.sql` into the SQL Editor again.

## Trying a project without changing the code

Open the game, then in the browser console run:

```js
localStorage.setItem('cg.supabase', JSON.stringify({ url: 'https://<ref>.supabase.co', key: 'sb_publishable_…' })); location.reload();
```

`localStorage.removeItem('cg.supabase')` goes back to the normal settings, and `localStorage.setItem('cg.supabase', '"off"')` switches Supabase off in that browser.

## Sharing CranSki's project instead

If you can't make another free project, CranGuys can live in CranSki's: everything it adds is named `cg_…` and the function is `cg-api`, so nothing clashes. Use CranSki's URL and publishable key in step 3, skip step 1, and also:

- Add the CranGuys addresses to CranSki's **Redirect URLs** (section 2). Its email templates will say "CranSki".
- One account then works in both games, and deleting it from either game deletes it from both.
- CranSki's guide turns **Realtime** → **Allow public access** off. With it off, CranGuys players find each other through the public servers instead, as they do today. Signed-in features all still work.
- Both games share the free plan's limits.
