# Update Connectly: ink and acid

This ZIP contains the complete updated app for https://connectly.lol.
It uses your existing GitHub repository, Render backend, Netlify frontend,
Turso database, Cloudinary account and Brevo setup.

## What changed

The new identity combines an ink-black masthead, acid-lime accents, warm
paper backgrounds, oversized headlines, serif thread titles, cutout labels,
taped notes and sharp borders. It includes a new geometric interlocking
connection logo, favicon, Apple icon and social preview. Feed, profiles,
messages, account pages, saved threads and settings share this style.
Light, dark and device themes remain available.

Two new features are fully connected to the backend:

- **Saved threads:** use Save on a thread, then open Saved in the navigation.
  Saving is private to your account; the author receives no notification.
  The list shows your latest 100 accessible saved threads. Unsave removes
  a thread immediately. Private threads still require the author's approval.
  If you lose access, the thread disappears from this list; saving does not
  grant access or make a permanent copy.
- **Polls:** use Add poll in the feed or your own profile. Enter a question
  as the title and 2–6 different choices of up to 80 characters each.
  A poll can include text and a photo. Each account has one vote per poll.
  Pick another choice to change it, or use Remove vote. Results refresh with
  the thread. The app shows aggregate counts and your choice; it does not
  publish a voter list. This is not a promise of anonymous voting: database
  administrators can access stored votes.

Data downloads now include your saved-thread references and your own votes.
Existing threads, accounts, messages, settings, photo permissions and IDs
are preserved. This update adds three tables on backend startup and does
not need new environment variables or dependencies.

## Update your existing site, step by step

1. Extract the ZIP into a separate folder. Copy its contents into your
   existing local GitHub repository, preserving the same folder structure.
   The repository root must contain backend/, frontend/ and render.yaml.
   Upload the included README, deployment guides and .gitignore as well.
   Never copy a real .env, database, uploaded photos, node_modules/ or dist/.
   The included backend/.env.example is a template with placeholders.
2. In GitHub Desktop, review the changes, commit them and push.
   If using GitHub's website, open each matching repository folder before
   uploading its files. Do not put all files into the repository root.
   DEPLOY.md lists every folder and the files it should contain.
   This update adds Poll.jsx, SavedThreads.jsx, creative.css and
   backend/tests/community.test.js; include them with the changed files.
3. Open the **existing, working Render backend service**. Let it deploy the
   latest commit, or use **Manual Deploy → Deploy latest commit** if needed.
   Its public API is https://social-network-backend-b7h6.onrender.com.
   Do not create a second service. Wait for a successful deployment.
   On startup it creates bookmarks, poll_options and poll_votes in Turso.
   Do not manually edit SQL, delete data or change the ID sequence.
4. Open https://social-network-backend-b7h6.onrender.com/api/health.
   It should return {"ok":true}. Keep all current Render environment variables,
   including JWT_SECRET, database/image/email credentials and
   CORS_ORIGIN=https://connectly.lol.
5. Let your **existing Netlify project** finish its GitHub build. If it
   did not deploy automatically, trigger a deploy from the latest commit
   after the backend is ready. Keep Base directory frontend, Build command
   npm run build, Publish directory dist, and
   VITE_API_URL=https://social-network-backend-b7h6.onrender.com.
   This public URL is the only app environment value needed on Netlify.
6. Wait until both deployments succeed, then open https://connectly.lol.
   Refresh an old tab once to load the new code. A cached favicon may need
   a new tab. Ongoing feed, message and activity updates continue polling.

If Netlify builds while Render is still updating, the new controls may fail
temporarily. Finish the backend deployment and reload the site. No additional
Turso token, Cloudinary preset or Brevo sender is required for this release.

## Check after deployment

1. Log in, publish a regular thread and a poll, then vote. Change your choice
   and remove it; the total must not accumulate duplicate votes.
2. Save a thread, open Saved, and refresh. Log into another account and check
   that its Saved list is separate. Unsave the thread and check it disappears.
3. Save a private author's thread as an approved follower. Unfollow that author
   and confirm their private thread is no longer visible in Saved.
4. Send one small JPG/PNG/WebP photo between two test accounts. Check its display
   from the recipient, and check a profile photo and a photo thread.
5. Try mobile navigation, the activity bell and Light/Dark/Device appearance.
   Save settings and reload to confirm your preference persists.

## Existing features still included

- Thread pages, upvotes, nested replies and photos on the feed or your profile.
- Photo DMs up to 5 MB, unread red dots and recent-activity notifications.
- Private profiles and follow approvals in the activity dropdown.
- Search and Explore visibility, follow-list sharing and DM permissions.
- Account-data downloads, password changes, signing out other sessions and
  one-time password reset emails using your existing Brevo configuration.
- Local times based on each viewer's device timezone, including daylight saving.

New thread and DM photos use protected Cloudinary storage and are delivered
through the API after checking access. Profile photos remain public.
Older public thread photos are converted when making the author's profile
private. Provider caches can take time to clear; downloaded copies cannot
be recalled.

## Local time and deleted IDs

Turso keeps UTC timestamps. The browser converts them to the viewer's device
timezone and locale. Render's IP address and location do not set the viewer's
time. Check your phone or computer timezone if the displayed time is unexpected.

Missing post or message IDs after deletion are normal. IDs identify rows;
likes, replies, votes and links refer to them. Do not renumber rows or change
sqlite_sequence to fill gaps. New items continuing at 5 or higher is correct.
Deleted content can only be recovered from a backup containing it.

## Verification before packaging

All 19 backend checks passed, including repeatable migrations, old data and
ID gaps, poll validation and rollback, vote changes, saved-list privacy,
follow-access changes, cascading deletion, safe photo uploads, DM permissions,
notifications, account exports, password/session security, reset links,
timezone conversion and mocked Cloudinary operations.

The production frontend build passed using your Render API URL.
Desktop and mobile browser checks passed at 1280, 390 and 320 pixels:
poll creation and votes, saving/unsaving and persistence, search, thread photos
and replies, profile editing, photo DMs, follow approvals, notifications,
theme persistence, exports, security actions, mobile inbox navigation,
logout and account-page navigation. No browser runtime errors or horizontal
overflow were found in these checks.

These were isolated local tests. Cloudinary and email checks were simulated;
no real messages were emailed and no live accounts were modified.
Your deployed site changes only after you upload and deploy this code.
