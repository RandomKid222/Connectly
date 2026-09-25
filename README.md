# Connectly

A small social network built with React and Node.js. It supports accounts,
profiles, image posts, follows, likes, comments and direct messages.

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
