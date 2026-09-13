# Move Quantumy: Vercel → Render + Cloudflare

The app is a Vite SPA plus Vercel-style handlers in `/api`. `server.js` loads those same handlers on Render so you do not rewrite chat, OAuth, STT/TTS, or admin routes.

Target public URL: `https://quantumy.work` (change if yours is different).

## 1. Create the Render web service

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service** → connect `GOFATgraphics/quantum-ai-chatbot`.
2. Settings:
   - **Runtime:** Node
   - **Branch:** `main`
   - **Build command:** `npm install && npm run build`
   - **Start command:** `node server.js`
   - **Instance:** Starter or higher (chat SSE can run several minutes; free tier will spin down and cut streams)
3. Or apply `render.yaml` via **New → Blueprint**.

First deploy gives you something like `https://quantumy.onrender.com`. Confirm that URL loads before pointing DNS.

## 2. Environment variables (Render → Environment)

Copy these from Vercel → Project → Settings → Environment Variables.

| Name | Notes |
|------|--------|
| `VITE_SUPABASE_URL` | Baked in at **build** time |
| `VITE_SUPABASE_ANON_KEY` | Baked in at **build** time |
| `ANTHROPIC_API_KEY` | Server only |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only |
| `GOOGLE_CLIENT_ID` | Server |
| `GOOGLE_CLIENT_SECRET` | Server |
| `APP_URL` | **`https://quantumy.work`** (no trailing slash) |
| `CRON_SECRET` | Same value as Vercel |
| `ELEVENLABS_API_KEY` | If you use STT/TTS |
| `GOOGLE_RISC_SERVICE_ACCOUNT_EMAIL` | If RISC is enabled |
| `GOOGLE_RISC_SERVICE_ACCOUNT_PRIVATE_KEY` | Keep the `\n` escapes |
| `TAVILY_API_KEY` / `SERPER_API_KEY` / `BRAVE_SEARCH_API_KEY` | Optional search |

`VITE_*` only apply if they exist **during the build**. After adding them, trigger a **manual deploy** (Clear build cache).

## 3. Cloudflare DNS + SSL

1. Cloudflare → domain `quantumy.work` → DNS.
2. Records (proxy **orange cloud** on):

   | Type | Name | Target | Proxy |
   |------|------|--------|-------|
   | CNAME | `@` | `quantumy.onrender.com` (your real Render hostname) | Proxied |
   | CNAME | `www` | `quantumy.onrender.com` | Proxied |

   If Cloudflare blocks CNAME on apex, use a CNAME flatten / ALIAS, or an A/AAAA that Cloudflare documents for CNAME flattening. Do **not** point at Vercel IPs anymore.

3. SSL/TLS → **Overview** → mode **Full (strict)**.
4. SSL/TLS → **Edge Certificates** → always use HTTPS on.
5. Optional: Rules → Redirect `www` → apex (or the other way). Pick one canonical host and set `APP_URL` to that exact origin.

Render → your service → **Custom Domains** → add `quantumy.work` and `www.quantumy.work`. Render will show a CNAME target; that is the hostname you put in Cloudflare.

Wait until both Cloudflare and Render show the domain as active.

## 4. Google OAuth + Supabase redirects

Google Cloud → Credentials → your OAuth client → Authorized redirect URIs, add:

- `https://quantumy.work/api/connectors/google-callback`
- `https://www.quantumy.work/api/connectors/google-callback` (only if www is canonical)

Keep the old Vercel URI until you confirm login works, then remove it.

Authorized JavaScript origins:

- `https://quantumy.work`

Supabase → Authentication → URL configuration:

- Site URL: `https://quantumy.work`
- Redirect URLs: `https://quantumy.work/**`

## 5. Cron (notes reminders)

The Blueprint includes `quantumy-notes-reminders` (`0 13 * * *` UTC), which calls:

`GET $APP_URL/api/cron/notes-reminders` with `Authorization: Bearer $CRON_SECRET`.

If you created the web service by hand, add a **Cron Job** with start command:

```bash
node scripts/run-cron.mjs
```

and the same `APP_URL` + `CRON_SECRET`.

## 6. Cut over

1. Render URL works (auth, chat stream, Gmail connect).
2. Cloudflare points at Render; `https://quantumy.work` loads.
3. Set `APP_URL=https://quantumy.work` and redeploy Render.
4. Re-test OAuth (connect Gmail once on the new domain).
5. Vercel → pause or delete the old project so you are not billed twice.

## Local prod-style run

```bash
npm install
npm run build
APP_URL=http://localhost:10000 node server.js
```
