# Update Connectly: the charcoal design

This release refreshes the interface with a black conversation-mark logo, new
favicon and social preview, charcoal colours, clearer thread cards, profile
headers, a redesigned inbox and account pages, and visual theme choices.
Desktop has a side menu; phones have a bottom menu. The bell and search stay
in the top bar. Your saved light/dark/device preference is preserved.

## Updating from the previous threads-and-settings ZIP

Only the frontend and documentation changed in this design update. The backend,
database schema, environment variables and lockfiles are unchanged.

1. Extract this ZIP and copy its contents into your existing repository,
   preserving the `backend/` and `frontend/` folders.
2. Commit and push. Your existing Netlify project builds the new frontend.
   If you upload files through GitHub's website, include the four new components
   `AuthLayout.jsx`, `Brand.jsx`, `Icon.jsx` and `Sidebar.jsx` in
   `frontend/src/components/`, along with the updated frontend source and assets.
   `DEPLOY.md` lists the complete repository paths.
3. Wait for Netlify to finish successfully, then open https://connectly.lol.
   An old open tab or cached tab icon may need a reload or a new tab.
   No Render environment change or manual Turso edit is needed for this design.

Use Settings → Appearance to try the theme preview cards, then Save settings.
On a phone, open Messages to see the inbox. Choose a conversation and use its
back arrow to return to the inbox. Log out is in the desktop side menu or the
top-right arrow icon on a phone.

The production build, all 10 backend tests and desktop/mobile browser checks
passed before this ZIP was made. Browser checks cover search, navigation,
threads and nested replies, photo DMs and profiles, editing a bio, notifications,
privacy approval, theme cards and persistence, exports, passwords and sessions,
mobile inbox navigation, logout, and 320 px/390 px layouts without horizontal
overflow or browser runtime errors. Cloudinary checks use simulated uploads;
live account configuration should still be checked after deployment.

## Previous feature update: threads, photos, activity and settings

This ZIP contains the whole updated project. It uses your existing GitHub repo,
Render backend, Netlify frontend, Turso database, Cloudinary account and Brevo setup.
The main site remains https://connectly.lol.

### Install the feature update if you have not done so yet

1. Extract the ZIP. Copy its contents into your existing local repository so
   `backend/`, `frontend/` and `render.yaml` stay at the repository root.
   Keep your real credentials in Render. The included `.env.example` is a template.
2. If using GitHub Desktop, review the changes, commit them and push.
   If uploading in GitHub's browser, use the matching folder for each file.
   The upload table in `DEPLOY.md` lists the paths. Upload code, not the ZIP,
   local databases, uploaded photos, `node_modules/` or `dist/`.
3. Let the existing Render service deploy the updated backend. It automatically
   adds the new Turso columns and tables. No SQL, database reset, ID edits,
   new service or new environment variable is needed.
   If auto-deploy is off, use Manual Deploy → Deploy latest commit on your
   existing service: https://social-network-backend-b7h6.onrender.com.
4. Let your existing Netlify project rebuild the frontend. Keep
   `VITE_API_URL=https://social-network-backend-b7h6.onrender.com`.
   Wait until both deployments are successful before testing the new features.
5. Open https://connectly.lol. If an old tab still displays the previous version,
   reload it once. Ongoing feed, thread, message and activity updates then use polling.

## What to try

- Feed or your own profile → enter a thread title, optional text and a photo →
  Publish thread. Open thread to see its discussion and reply to a comment.
- Messages → choose a member → Photo → select a JPG, PNG or WebP up to 5 MB →
  optionally add text → Send. Click a delivered photo to open the full photo.
- Bell → recent activity. Open an item or use Mark all read. Follow requests
  can be accepted or declined here.
- Settings → choose Light, Dark or Use device setting → Save settings.
  The preference is saved to your account.
- Private profile: existing followers keep access; new followers need approval.
  Your username and profile photo remain visible. Older public thread photos
  are converted to protected storage when making the profile private.
  Cloudinary CDN invalidation can take time, and downloaded copies cannot be recalled.
- Who can message you: All members, People I follow, or No one. It governs
  new messages even in existing conversations.
- Discoverability: user-search and Explore switches are applied by the backend.
  Hiding from Explore does not hide your threads from approved followers.
- Data sharing: hide your follower/following member lists from other users,
  or download your own text/account data as JSON. Photo files are not in the export.
- Security: change your password or sign out other sessions. Your current browser
  receives a new login token; old sessions become invalid.

## Local time and missing IDs

The database continues storing UTC. The browser converts it to the viewer's
device timezone and locale, including daylight-saving changes. There is no
need to infer a timezone from Render's IP address or its server location.
Check the timezone setting on your phone/computer if a displayed time is unexpected.

IDs such as 2 and 3 stay missing after deleting those posts. That is normal:
IDs identify rows, and likes, replies and links refer to them. They are not a
post count. Do not renumber rows or change `sqlite_sequence` to fill gaps.
New posts continuing at 5 or higher is correct. Deleted content is recoverable
only from a backup that contained it.

## Verification

Run `cd backend` and `npm test` for the included checks. They use isolated
temporary databases and test credentials. They cover old-data migration,
ID gaps, text/photo messages, invalid and oversized files, image permissions,
nested replies, upvotes, notifications, private profiles and follow approval,
discovery and follow-list permissions, account exports, password changes,
session invalidation, reset links, and timezone/daylight-saving conversion.
Cloudinary upload/delivery/type-conversion behavior is checked with a mock;
these checks do not send real email or modify a live Cloudinary account.

Before creating this ZIP, all 10 backend tests passed. Desktop and mobile browser
checks also passed for threads, photo messages, profile photos, notifications,
privacy, theme persistence, account exports and security settings, with no browser
runtime errors. The production frontend build passed using your Render API URL.

After deploying, send one small photo between two test accounts and check it
from the recipient. Check a private thread from an approved follower and a
third account. Your existing production credentials are used for those live tests.
