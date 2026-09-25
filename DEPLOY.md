# Connectly: exact deployment guide

The GitHub repository holds code. Render runs the Node/Express backend. Netlify
hosts the React frontend. Turso stores users, posts, likes, comments and messages.
Cloudinary stores uploaded images. The backend starts the database tables itself.
Use Node 24; the included configuration sets it for both hosts.

## 1. Which files to put on GitHub

Unzip the project first. The **root of the repository** should show:

```
backend/             backend code, routes, .node-version, package.json, package-lock.json, .env.example
frontend/            frontend code, public/_redirects, .node-version, package.json, package-lock.json
render.yaml          Render backend configuration
.gitignore           excludes local secrets and generated files
README.md
DEPLOY.md
```

Upload all project files under `backend/` and `frontend/`, including the lockfiles,
source files and dotfiles. Do not upload just the ZIP, just `dist/`, or just
`frontend/`. Do **not** upload a real `.env` or `.env.production`,
`node_modules/`, `dist/`, `social.db`, or real files in `backend/uploads/`.
The included `.env.example` is a public template containing no working secrets.

**Windows / GitHub Desktop:** Extract the ZIP. Install [GitHub Desktop](https://desktop.github.com/)
and sign in. Choose **File → Add local repository → Choose** and select the
extracted project folder (the one containing `render.yaml`). If prompted that
it is not a Git repository, click **Create a repository here**. In the Changes
tab, review the files, enter a summary such as `Initial Connectly app`, click
**Commit to main**, then **Publish repository**. Choose **Private** if you want
to keep the code private; both hosts can connect to it when you grant access.
Check on GitHub that `backend/`, `frontend/` and `render.yaml` are at the top
level. The website still has its own public URL when you deploy it.

**Browser alternative:** Create an empty GitHub repository. In its **Add file →
Upload files** page, drag the extracted `backend` and `frontend` folders plus
`render.yaml`, `.gitignore`, `README.md`, and `DEPLOY.md` from inside the
extracted folder. Commit the upload. Check the top-level layout afterward.
Never drag the ZIP itself or a folder containing `node_modules`.

## 2. Free hosted storage

1. Create a free [Turso](https://turso.tech/) account and a database, for
   example `connectly`. On its connection page copy the database URL
   (`libsql://...`). Generate/copy a **database auth token**. Those become
   `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` on Render. If the dashboard
   does not show a token action, the [Turso CLI quickstart](https://docs.turso.tech/sdk/ts/quickstart)
   documents `turso db show --url connectly` and
   `turso db tokens create connectly`. A database URL is not a token.
2. Create a free [Cloudinary](https://cloudinary.com/) account. In its
   Console **Settings → API Keys**, copy your cloud name, API key and API secret.
   Those become `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and
   `CLOUDINARY_API_SECRET` on Render. Do not create an unsigned browser upload
   preset; the backend performs signed uploads.
3. Keep both services' credentials private. Do not paste them into GitHub,
   Netlify, messages, screenshots or the public frontend build.

As of September 2026, Turso advertises a free database tier and Cloudinary a
free media plan with usage limits. Check their dashboards for current limits;
free does not mean unlimited. The database and Cloudinary images persist
independently of Render restarts. Back up data you care about.

## 3. Start the backend on Render

1. Sign in to [Render](https://render.com/) and connect your GitHub account.
2. Click **New → Blueprint**, choose your repository and branch. It reads the
   root `render.yaml`; this creates a Node web service with `backend` as its
   root directory, `npm ci` as build command, `node server.js` as start command,
   and `/api/health` as health check. Choose the **Free** instance if offered.
3. The Blueprint prompts for these variables:

   | Name | Enter |
   | --- | --- |
   | `CORS_ORIGIN` | Initially `https://placeholder.invalid`; replace with the real Netlify URL in step 5. |
   | `TURSO_DATABASE_URL` | The full `libsql://...` URL from Turso. |
   | `TURSO_AUTH_TOKEN` | The private Turso database token. |
   | `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name. |
   | `CLOUDINARY_API_KEY` | Cloudinary API key. |
   | `CLOUDINARY_API_SECRET` | Cloudinary API secret. |

   Render generates `JWT_SECRET` automatically. Do not paste the example value
   from `.env.example`. `NODE_ENV=production` and `NODE_VERSION=24` are also set
   by the Blueprint. Do not put a real secret in `render.yaml` or the frontend.
   For an *existing* Blueprint, set newly added variables manually in the
   service's **Environment** page; `sync: false` prompts only on creation.
4. Deploy. Copy your actual HTTPS Render URL, such as
   `https://social-network-backend-xxxx.onrender.com`. Open
   `<your-render-url>/api/health`; it should show `{ "ok": true }`.
   If startup fails, inspect **Logs** and check all credentials. The database
   schema is created automatically on first startup.

## 4. Start the frontend on Netlify

1. Sign in to [Netlify](https://netlify.com/) and select **Add new project/site →
   Import an existing project**. Authorize GitHub and choose the same repository.
2. Set **Base directory** to `frontend`; **Build command** to `npm run build`;
   **Publish directory** to `dist` (relative to the base directory). Node 24
   is selected by `frontend/.node-version`.
3. Add the build environment variable `VITE_API_URL` with the full HTTPS
   Render URL from step 3, without `/api` or a trailing slash. Example:
   `https://social-network-backend-xxxx.onrender.com`. This URL is public and
   is the only variable that belongs on Netlify.
4. Deploy. Copy your HTTPS Netlify URL, for example
   `https://connectly-example.netlify.app`. `frontend/public/_redirects`
   makes refreshes on `/profile/...` and `/messages/...` load correctly.
   If you change `VITE_API_URL` later, trigger a new frontend deploy.

## 5. Connect and test

1. Render → your backend → **Environment**: replace `CORS_ORIGIN` with the
   exact Netlify origin: `https://connectly-example.netlify.app` (your actual
   URL, no path, no trailing slash). Save and allow the service to redeploy.
2. Visit the Netlify URL. Sign up with a test account; create a post with an
   image; refresh and check it remains. Test login, like, comment, follow,
   and messaging with a second test account. A free Render web service may
   take around a minute to wake after being idle.
3. If the browser shows a CORS error, compare `CORS_ORIGIN` with the exact
   URL in the address bar. If requests go to Netlify `/api/...` instead of
   Render, check `VITE_API_URL`, then rebuild Netlify. A 500 on startup means
   check Render logs and the Turso/Cloudinary values.
4. If signup says it cannot reach the backend, check that Netlify's
   `VITE_API_URL` is the Render origin (not `/api/health`), that Netlify was
   redeployed after adding the variable, and that Render's `CORS_ORIGIN` is
   exactly the Netlify origin. Passwords must be at least 12 characters;
   usernames must be 3–30 letters, numbers, or underscores. The frontend
   build now stops with an error if `VITE_API_URL` is missing or malformed.

## Where to put a long secret

`backend/.env.example` is a template. **Do not put a real secret there.**
For local development you may copy it to `backend/.env`, then replace
`JWT_SECRET` there with a unique random value at least 32 characters long.
For deployment, Render generates `JWT_SECRET` for you; there is no need to set
it a second time. Real Turso and Cloudinary credentials also go in Render's
Environment page, never in `.env.example`. `VITE_API_URL` is a public address,
not a secret. Never use a `VITE_` variable for a credential.

## Security and operating limits

The app rejects missing production credentials and a weak JWT secret, caps text
and JSON sizes, rate limits requests, sets security headers, checks and
re-encodes image bytes, and returns generic internal errors. Passwords are
hashed. CORS controls browser access from another site; it does **not** make a
public API private. Rate limits are in memory, so they reset when the backend
restarts. JWTs last seven days and cannot be revoked individually; tokens in
`localStorage` remain vulnerable if an attacker can run script in the page.
Do not render untrusted HTML with `dangerouslySetInnerHTML`.

This is appropriate for a small test with people you know. It is not yet a
fully moderated public social network: there is no report/block workflow,
email verification, account recovery, automated backup, or shared rate limit
across instances. Direct messages are not end-to-end encrypted. Review those
features and privacy handling before inviting strangers or storing sensitive
information. Run `npm audit` periodically in **both** package directories.
