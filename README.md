# Vor-To-Do App

A task manager web app with **real user accounts and cloud sync**, built with plain HTML/CSS/JavaScript + [Supabase](https://supabase.com) (free tier).

## Features

- 📧 **Real accounts** — register & log in with email + password (confirmation emails, password reset emails, persistent sessions)
- ☁️ **Cloud sync** — tasks are stored in a hosted Postgres database and follow you to any device/browser
- 🔒 **Private by design** — Row Level Security ensures users can only ever read/write their own tasks
- 🏷️ Priorities, categories, search, filters, sorting, inline editing, drag & drop reordering
- ↩️ Undo delete, progress bar, overdue detection, dark mode, JSON export
- 👤 **Guest mode** — use it locally on one device without an account

## Setup (one time, ~10 minutes)

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account + project.
2. Open the **SQL Editor** in the dashboard, paste the contents of [`supabase-setup.sql`](supabase-setup.sql), and click **Run**. This creates the `tasks` table with Row Level Security.

### 2. Connect the app

1. In Supabase, go to **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open [`config.js`](config.js) and paste them in:

   ```js
   window.SUPABASE_CONFIG = {
       url: 'https://yourproject.supabase.co',
       anonKey: 'eyJhbGci...'
   };
   ```

The anon key is safe to publish — it can't read anyone's data because of Row Level Security.

### 3. Configure authentication

In Supabase **Authentication → Providers → Email**:

- Keep **Enable Email provider** on.
- **Confirm email**: leave ON for production (users must click a link in their inbox before their first login), or turn it OFF for instant logins while testing.

In **Authentication → URL Configuration**, set **Site URL** to your website address (e.g. `https://vor3030.github.io/Vor-To-Do-App/` or `http://localhost:5500` for local dev) so confirmation/reset email links redirect back to your site.

## Running locally

Just open `index.html` in a browser, or serve the folder (nicer URLs + no file:// quirks):

```bash
npx serve .          # or: python -m http.server 5500
```

## Deploying

The whole app is static — host it anywhere:

- **GitHub Pages**: Settings → Pages → Deploy from branch → `main` / root.
- **Netlify / Vercel**: drag-and-drop the folder or connect the repo.

After deploying, update **Authentication → URL Configuration → Site URL** in Supabase to your live URL so email links work.

## Security notes

- Passwords are handled entirely by Supabase Auth (bcrypt-hashed server-side) — never stored in the browser.
- The Supabase anon key is a *public* key; all data protection comes from the `tasks` Row Level Security policy in `supabase-setup.sql`.
