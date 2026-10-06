# Connectly administrator and verified badge setup

Deploy this ZIP to your existing GitHub, Render and Netlify projects first.
Render adds users.role, users.is_verified and admin_actions when it starts.
All existing accounts stay ordinary members, and no one is automatically verified.

## 1. Make your own existing account an administrator

Use the existing Turso database that your working Render service connects to.
You only need this database step once; later moderation and verification happen
in the site itself.

1. Sign up normally on https://connectly.lol if you do not already have an account.
2. Finish deploying the updated Render backend. Do this before editing the new columns.
3. Open your database in the Turso dashboard. Use its SQL editor/Studio
   (the dashboard's Edit Data section provides the database editor).
4. Run the following query, replacing YOUR_USERNAME with your exact site username:

~~~sql
SELECT id, username, email, role
FROM users
WHERE username = 'YOUR_USERNAME';
~~~

Check that it returns exactly your own account and email. If it returns no rows,
check the username and database; do not create a database user row manually.

5. Once you have confirmed the account, run:

~~~sql
UPDATE users
SET role = 'admin'
WHERE username = 'YOUR_USERNAME';
~~~

6. Confirm the change:

~~~sql
SELECT id, username, role
FROM users
WHERE username = 'YOUR_USERNAME';
~~~

The role should now be admin. This change does not give the account a badge.

7. Refresh https://connectly.lol while logged into that account. The desktop
   side menu will include Administration. On a phone, open Settings and choose
   Open admin panel. You can also open https://connectly.lol/admin directly.

If you prefer the Turso CLI, its [official SQL shell documentation](https://docs.turso.tech/cli/db/shell)
shows how to run queries against your database using turso db shell.
The [official dashboard editor announcement](https://turso.tech/blog/outerbase-studio-added-to-turso-cloud)
shows the Studio entry point. Dashboard labels may change; the SQL above stays
the same for this app.

Administrator roles can only be assigned using trusted database access.
The site has no public sign-up field, profile setting or badge control that
lets someone make themselves an administrator. Do not grant the role to an
account until you have confirmed who owns it.

## 2. Give a particular account a verified badge

1. Log into your administrator account and open Administration.
2. Choose Accounts.
3. Search for the exact username. Check the account name and ID in its card.
4. Click Verify account. To reverse it, click Remove badge.
5. Open that user's profile or a thread they authored. The lime check badge
   appears next to their name. An already-open page may need its next automatic
   update or one reload.

Badges also appear beside authors in replies, search suggestions, messages,
follow lists and activity. The badge is a designation you assign on Connectly;
it is not an automatic identity check. A verified member has the same ordinary
permissions as other members and cannot use the admin API.

## 3. Remove a thread or comment

1. Open Administration and choose Threads or Comments.
2. Search by text or the author's username.
3. Choose Remove thread or Remove comment.
4. Enter a short reason, then Confirm removal. Cancel leaves the content in place.

Removing a thread deletes its replies, upvotes, poll options/votes and saved
references. Its uploaded photo is removed from storage. Removing a comment
also deletes the replies beneath that comment, while keeping the thread.
Photo cleanup is requested after deleting the thread. If storage cleanup fails,
the backend logs it; the removed thread's protected photo URL no longer works
in the app. Provider caches may take time to clear.
These removals cannot be undone in the app. Do not renumber the remaining IDs.

## 4. Review changes

The History tab records the administrator, action, target, reason/status and
time. Badge changes and content removal are committed with their history entry.
If writing that entry fails, the content or badge change is rolled back.
History does not contain account passwords or database credentials.

## Permissions and privacy

Administrators can review threads, their photos and comments from all profiles,
including private profiles, to moderate the site. Ordinary member-facing
profile/feed access remains governed by follow approval. The privacy settings
page explains this moderation access.

Administrator status does not bypass direct-message permissions or expose
private DM photos belonging to other people. An administrator's own
conversations work like any other member's.

Every admin API request checks the current role in the database. Editing
localStorage, page HTML, a profile field or a client-side role claim cannot
grant permission. Normal password and session protections still apply.

To revoke an administrator's role, use trusted Turso access:

~~~sql
UPDATE users
SET role = 'member'
WHERE username = 'THE_ADMIN_USERNAME';
~~~

An already-issued login token then fails its next admin request. The account
continues to function as an ordinary member.

## Troubleshooting

- No such column: role: deploy the updated backend to the correct existing Render
  service first. Its startup migration creates the column.
- No admin menu: confirm role = admin in the same database Render uses, then
  refresh your logged-in site. A verified badge alone does not enable the menu.
- Administrator access required: the current database role is not admin.
- Badge not yet visible: reload that user's profile; existing feeds also poll.
- Removal failed: check Render logs. A database failure returns a generic
  error and leaves the content in place. Image-cleanup failures are logged
  separately after a thread has been removed from the app.

No new environment variables, email sender or Cloudinary preset are needed.
Keep your real credentials on Render; the included .env.example stays a template.
