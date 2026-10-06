# Update Connectly: slogan, verified badges and administration

The slogan is now **Stay close, stay connected.**
The ink-and-acid colours and interlocking logo are preserved. Main headings
are smaller and use sentence case. Labels are simpler, and the social preview
uses the same new slogan.

This ZIP contains the complete app for https://connectly.lol, including saved
threads, polls, photos, messages, notifications, themes, privacy and security
features from the previous release.

## New controls

- **Verified accounts:** an administrator can add or remove a lime check badge.
  The badge appears in profiles, threads, comments, search, messages, follow
  lists and activity. It does not grant administrator permissions.
- **Administration:** an administrator can search and review threads and
  comments, remove them with a reason, and review the history of these actions.
  Administrators can review private threads for moderation, but cannot access
  unrelated direct messages or DM photos.
- **Account roles:** all accounts start as members. Make your own existing
  account an administrator once through Turso using ADMIN_GUIDE.md.
  No administrator is silently assigned on startup or signup.
- **Action history:** verification and content changes are recorded with their
  acting administrator, time, target and reason/status.

The normal member-facing profile and thread privacy rules are preserved.
Admin API requests check the current database role on every request. Revoking
an administrator role blocks the next admin request, including with an older
login token.

## Deploy the update

1. Extract the ZIP. Copy its contents into your existing GitHub repository,
   keeping backend/, frontend/ and render.yaml in the repository root.
   Include the guides and .gitignore. Never upload a real .env, database,
   uploaded photos, node_modules/ or dist/.
2. Commit and push. If using GitHub's website, open the matching folder before
   uploading files. DEPLOY.md lists the complete paths. New files are:
   - backend/routes/admin.js
   - backend/tests/admin.test.js
   - frontend/src/components/VerifiedBadge.jsx
   - frontend/src/pages/Admin.jsx
   - frontend/src/refinement.css
   - ADMIN_GUIDE.md
   Existing files were also updated, including ProtectedImage.jsx, which now
   supports the protected moderation-photo route.
3. Deploy the existing, working Render backend first. Do not create another
   service. Use Manual Deploy → Deploy latest commit if auto-deploy is off.
   Your API remains https://social-network-backend-b7h6.onrender.com.
4. Wait for backend success, then open its /api/health endpoint.
   On startup it adds users.role, users.is_verified and admin_actions in your
   existing Turso database, along with any missing older migrations.
   Existing accounts, settings, posts, messages and IDs remain intact.
5. Let your existing Netlify project rebuild from the same commit.
   Keep Base directory frontend, Build command npm run build,
   Publish directory dist and
   VITE_API_URL=https://social-network-backend-b7h6.onrender.com.
   Keep Render's CORS_ORIGIN=https://connectly.lol and your current secrets.
   No new environment variables or dependencies are required.
6. Open https://connectly.lol and refresh an old tab once.
7. Follow ADMIN_GUIDE.md to enable your own administrator account.
   Then open Settings → Open admin panel, or https://connectly.lol/admin.

## Check after deployment

1. Log into your enabled administrator account. In Accounts, find a test
   account and choose Verify account. Check its profile and authored thread
   for the badge, then try Remove badge.
2. Log into that ordinary verified account. It must not have admin controls.
3. Create a test thread. From the admin panel, choose Remove thread, then
   Cancel. Confirm it still exists. Repeat with a reason and Confirm removal.
   Check the History tab and confirm the thread is gone.
4. Try removing a test comment and confirm its child replies disappear while
   its thread remains.
5. Check a photo DM from sender and recipient, a private thread from an
   approved follower, polls and Saved, search, activity and light/dark themes.
6. Check the admin panel on your phone through Settings.

Photo cleanup is requested after a thread is removed from the database.
If the storage service fails that request, the backend logs the failure; the
removed thread and its protected photo endpoint stay inaccessible in the app.

## Deleted IDs and local times

Do not reuse or renumber missing IDs. Thread, comment and message IDs identify
rows and are referenced by links, votes, replies and saved items. Deleting
content leaves gaps, and new IDs continuing at a higher number is correct.

Timestamps stay in UTC in Turso. The app displays them in each viewer's device
timezone and locale, including daylight-saving changes. Render's server
location does not determine the viewer's time.

## Verification before packaging

All 29 backend checks passed. Coverage includes migration and old IDs, safe
photos, private access and follow approvals, DMs, notifications, settings,
exports, password/session changes, reset links, local times, polls and saved
threads, as well as:
- Admin API rejection for unauthenticated, ordinary and verified members.
- Rejection of privilege changes through signup, profile fields or JWT claims.
- Badge assignment/removal and action history.
- Private thread/photo moderation, cascading removal and rollback on audit failure.
- Comment-branch removal and immediate role revocation.
- Unrelated DM privacy and simulated Cloudinary photo removal.

The production frontend build passed using the current Render URL.
Desktop and mobile browser checks passed at 1280, 390 and 320 pixels, including
badges, admin navigation, image previews, cancel/confirm removals, comments,
history, mobile Settings access, polls/Saved and existing account/message flows.
No browser runtime errors, unexpected failed API requests or horizontal
overflow were found in the final checks.

These are isolated local checks. Cloudinary and email operations were mocked;
no live accounts, messages or production database rows were changed.
The deployed website changes only when you upload and deploy this code.
