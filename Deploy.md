# MUSH HQ — Deployment Guide

## What's in this folder

```
mush-hq/
├── index.html          ← The full app (one file, goes on GitHub Pages)
├── schema.sql          ← Run this once in Supabase SQL Editor
├── edge-function.ts    ← Deploy to Supabase Edge Functions
└── DEPLOY.md           ← This file
```

---

## Step 1 — Run the SQL Schema

1. Go to your Supabase project: https://dgtbsudilclltvikasza.supabase.co
2. Left sidebar → **SQL Editor** → **New query**
3. Open `schema.sql`, copy the entire contents, paste it in
4. Click **Run**
5. You should see "Success" — this creates all your tables

---

## Step 2 — Add the Anon Key to index.html

1. In Supabase: **Project Settings** → **API**
2. Copy the **anon public** key (starts with `eyJ...`)
3. Open `index.html` and find this line near the top of the `<script>`:
   ```js
   const SUPA_ANON = 'REPLACE_WITH_YOUR_ANON_KEY';
   ```
4. Replace `REPLACE_WITH_YOUR_ANON_KEY` with your actual anon key

---

## Step 3 — Deploy the Edge Function

This is the secure server function that calls the Claude API.
Your Claude API key lives here — never in the browser.

### Install Supabase CLI (one time):
```bash
brew install supabase/tap/supabase
```

### Login:
```bash
supabase login
```

### Link your project:
```bash
cd ~/Desktop/MUSH
supabase link --project-ref dgtbsudilclltvikasza
```

### Create the functions folder and copy the file:
```bash
mkdir -p supabase/functions/generate-commentary
cp edge-function.ts supabase/functions/generate-commentary/index.ts
```

### Add your Claude API key as a secret:
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
```

### Deploy the function:
```bash
supabase functions deploy generate-commentary
```

Done. Your Claude API key is now secure on Supabase's servers.

---

## Step 4 — Create Your Admin Account

1. In Supabase: **Authentication** → **Users** → **Add user**
2. Enter your email + password
3. Click **Create user**
4. Then go to **SQL Editor** and run:
   ```sql
   UPDATE public.profiles 
   SET role = 'admin', display_name = 'Jason'
   WHERE id = (SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL_HERE');
   ```

### Add other users (the friend group):
For each friend:
1. **Authentication** → **Users** → **Add user** → their email + a temp password
2. Tell them to log in and change their password
3. They default to 'viewer' role — no extra SQL needed

---

## Step 5 — Put it on GitHub Pages

1. Go to github.com → **New repository**
   - Name: `mush-hq`
   - Set to **Private** (friends will still be able to access the URL)
   - Click **Create repository**

2. Upload `index.html` to the repo (drag and drop on the GitHub page)

3. Go to **Settings** → **Pages**
   - Source: **Deploy from a branch**
   - Branch: **main** / **root**
   - Click **Save**

4. Your URL will be: `https://YOUR_USERNAME.github.io/mush-hq`

Share this URL with the group. Everyone logs in with their own email/password.

---

## Weekly Workflow

**Thursday (when Mush drops picks):**
1. Open the app, log in as Jason
2. Click **Admin** tab
3. Fill in "Week Label" (e.g. "Week 12 · 2025 Season"), season, week number
4. Click **Create New Week**
5. Paste the Mush's pick sheet text
6. Click **Generate Jonathan's Commentary**
7. Wait ~10 seconds — Jonathan reacts to every pick
8. Click **Publish Live** — friends can now see it
9. Share the link to the group chat

**Sunday night (after games):**
1. Log in as admin
2. Select the current week
3. For each pick: type the final score (e.g. "23-17") OR click MUSH W / MUSH L / PUSH
4. Meltdown banner fires automatically if Mush is getting destroyed
5. The running record updates live for everyone

---

## NFL Schedule Note

Picks are tagged by game window:
- `thursday` — Thursday Night Football
- `saturday` — Saturday games (playoffs/late season)
- `sunday_early` — 1pm ET games
- `sunday_late` — 4pm ET games  
- `sunday_night` — Sunday Night Football
- `monday` — Monday Night Football
- `special` — Any other special game

The app groups picks by window and tracks Mr. Thursday Night's record separately.

---

## Adding Video Clips

For GitHub Pages hosting, drop your .mp4 files in the same repo folder:
1. Upload your clips to the GitHub repo alongside index.html
2. In the Video Wall tab, the slots accept local uploads for preview
3. For permanent hosted video, upload to the repo and reference by filename

---

## Troubleshooting

**Login doesn't work:**
- Check that you ran schema.sql in Supabase
- Verify the anon key is correct in index.html
- Make sure the user was created in Supabase Auth

**Commentary not generating:**
- Check that the Edge Function was deployed
- Verify ANTHROPIC_API_KEY secret was set
- Check Supabase Edge Function logs for errors

**Friends can't see picks:**
- Make sure you clicked "Publish Live" — draft weeks are only visible to admin
- Check that their Supabase Auth accounts were created

---

*Built for the Mush HQ · All-time record: 196-261 · Data is Data!!!!*