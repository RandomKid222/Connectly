# Connectly

Public site: [connectlyplace.netlify.app](https://connectlyplace.netlify.app/).

A small social network built with React and Node.js. It supports accounts,
profiles, profile photos, image posts, follows, likes, comments and direct messages. The top
bar suggests matching users as you type. A red dot marks unread messages in
the navigation and beside unread conversations; opening a conversation clears
its dot. While the site is open, the feed, profiles, and visible comments
refresh about every 30 seconds. Open chats check for messages every 15 seconds;
the unread dot checks about every 30 seconds.

Log in → **Forgot password?** emails a 30-minute, single-use reset link once
you set up Brevo on Render. See [DEPLOY.md](DEPLOY.md#6-turn-on-password-reset-email)
for the sender verification and environment variable steps. Resetting a password
also invalidates old login sessions.

On your own profile, use **Add photo** or **Change photo** to upload a JPG,
PNG, or WebP image under 5 MB. Profile pictures appear beside names across
the app and can be removed. Production photos use the existing Cloudinary
account; the backend shrinks them and strips image metadata before storage.

The browser tab uses the Connectly icon in `frontend/public/favicon.svg`.
`frontend/index.html` also contains a page description and social link preview
metadata. If you change the site's public URL, update the canonical, Open Graph,
and Twitter image URLs there and `CORS_ORIGIN` in `render.yaml` and Render.

Read [DEPLOY.md](DEPLOY.md) for the exact GitHub → Turso/Cloudinary → Render →
Netlify steps. The backend uses local SQLite and local image files for local
development. Production requires Turso for persistent data and Cloudinary for
persistent images. The frontend is a Vite single-page app.

## Run locally (Node 24)

In one terminal:

```sh
cd backend
npm ci
cp .env.example .env
# Edit .env and replace JWT_SECRET with a private random string.
npm start
```

On Windows PowerShell use `Copy-Item .env.example .env` instead of `cp`.
Turso and Cloudinary settings are optional locally; without them, development
uses `backend/social.db` and `backend/uploads/`.

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. The Vite server proxies API requests to
`localhost:4000`. Local data files and secrets are excluded from Git. See
`backend/.env.example` for variable names; never commit working credentials.
