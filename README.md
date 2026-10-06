# Connectly

The interface uses an ink-and-acid design: a black masthead, lime cutouts,
warm paper surfaces, oversized headlines, serif thread titles and sharp edges.
A new interlocking connection mark appears in the header, favicon, Apple
touch icon and social preview. Desktop has side navigation; phones have a
five-item bottom menu. Existing light/dark/device preferences are preserved.

Two new features: private **Saved** threads and polls with **2–6 choices**.
Use Save on any accessible thread, then open Saved to revisit it. Add poll in
the composer creates a poll; each account can vote once, change its choice or
remove its vote. Polls can include photos. This version updates both frontend
and backend. See [UPDATE_GUIDE.md](UPDATE_GUIDE.md) before deploying.

Primary public site: [connectly.lol](https://connectly.lol/).
The alternate domain [contactly.lol](https://contactly.lol/) redirects to it.
Follow [DOMAIN_SETUP.md](DOMAIN_SETUP.md) to connect both GoDaddy domains to
your existing Netlify project before deploying this version.

A small social network built with React and Node.js. It supports accounts,
profiles, profile photos, photo threads, follows, upvotes, nested replies and direct messages. The top
bar suggests matching users as you type. A red dot marks unread messages in
the navigation and beside unread conversations; opening a conversation clears
its dot. While the site is open, the feed, profiles, and visible comments
refresh about every 30 seconds. Open chats check for messages every 15 seconds;
the unread dot checks about every 30 seconds.

Threads have a title and their own page at `/threads/<id>`. You can publish
text and photos from either the feed or your own profile, and reply to comments.
DMs accept JPG, PNG, and WebP photos up to 5 MB, with or without a caption.
The bell opens recent follows, follow requests, upvotes, comments, replies,
and messages. These activities update about every 30 seconds.

Settings includes light/dark/device themes, private profiles with follow
approval, DM permissions, search and Explore visibility, follow-list sharing,
an account-data download, password changes, and signing out other sessions.
Settings persist on the account. Private profiles keep existing followers;
new follow requests are accepted or declined in the notification dropdown.
New thread and DM photos are protected Cloudinary assets, delivered through
the API after checking access. Existing public thread photos are converted
when their owner switches to a private profile. Provider caches can take time
to clear; photos someone already downloaded cannot be recalled.

Times use each viewer's device timezone and locale. SQLite's UTC timestamps
are parsed as UTC before conversion, including older timestamps.
Deleted database IDs are intentionally not reused or renumbered.
Read [UPDATE_GUIDE.md](UPDATE_GUIDE.md) for this release's update checklist.

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

## Run the integration checks

```sh
cd backend
npm test
```

The checks use temporary databases and test credentials. They cover migration,
photo access, replies, privacy, discoverability, notifications, password/session
changes, reset links, timezone conversion, bookmarks, poll validation,
vote changes, transaction rollback, and mocked Cloudinary operations.
They do not send real email or contact a live Cloudinary account.
