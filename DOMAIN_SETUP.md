# Connect connectly.lol and contactly.lol

Use your existing Connectly Netlify project and Render backend. The intended
addresses are:

| Address | Purpose |
| --- | --- |
| `https://connectly.lol/` | Main site, canonical address, and password reset link destination |
| `https://contactly.lol/` | Redirect to the main site, keeping the page path |
| `www` variants of both domains | Redirect to `https://connectly.lol/` |
| `connectlyplace.netlify.app` | Existing Netlify project hostname and DNS target; redirects to the main site after deployment |

`contactly.lol` is a separate domain, used here as a domain alias. A subdomain
of `connectly.lol` would look like `contact.connectly.lol`.

## 1. Assign the domains to the existing Netlify project

1. Open your Connectly project in Netlify, then **Domain management →
   Production domains → Add a domain → Add a domain you already own**.
2. Enter `connectly.lol`. Choose **External DNS Provider**. In its **Options**
   menu choose **Set as primary domain**. The primary address for this ZIP is
   the version without `www`.
3. Choose **Add domain alias** and add `contactly.lol` to this same project.
4. Ensure `www.connectly.lol` and `www.contactly.lol` are also listed. Netlify
   may add these automatically; add a missing address as an alias.

Do not create a second website for the alternate domain.

## 2. Point both domains to Netlify

These instructions keep GoDaddy as the DNS provider. In GoDaddy, open each
domain and select **DNS → DNS Records**. Update the existing website records
or add a missing record:

| Domain | Type | Name / Host | Value / Points to |
| --- | --- | --- | --- |
| `connectly.lol` | A | `@` | `75.2.60.5` |
| `connectly.lol` | CNAME | `www` | `connectlyplace.netlify.app` |
| `contactly.lol` | A | `@` | `75.2.60.5` |
| `contactly.lol` | CNAME | `www` | `connectlyplace.netlify.app` |

Enter just the hostname in the CNAME value: no `https://`, path, or slash.
Use the default TTL. Replace a parked-site A record at `@` or an old `www`
website record rather than adding a conflicting duplicate. Preserve existing
email MX records and email/authentication TXT or CNAME records. Netlify's
**Pending DNS verification** link shows the customized records it expects.
The IP above is for the standard Netlify network used by this app.

If you have already changed the domain's nameservers to Netlify, manage its
DNS in Netlify instead. DNS records are managed at the provider named by the
active nameservers. Changing nameservers is not required for this setup.

## 3. Finish DNS and HTTPS before uploading this version

In Netlify's **Domain management**, check DNS verification and the HTTPS
certificate for the main domain and every alias. Let all four purchased-domain
addresses finish verification before deploying the redirect rules. DNS
updates may take up to 48 hours. This prevents redirects to an address that
does not yet load securely.

## 4. Update the application and Render

1. In Render, open your existing backend → **Environment**. Set:

   ```text
   CORS_ORIGIN=https://connectly.lol
   ```

   Use no trailing slash. Choose **Save and deploy**.
2. Upload the changed files from this ZIP into the matching folders of your
   GitHub repository, then commit and push:

   | Repository path | File |
   | --- | --- |
   | `frontend/` | `index.html` |
   | `frontend/public/` | `_redirects` |
   | `backend/` | `.env.example` (template only) |
   | root | `render.yaml`, `README.md`, `DEPLOY.md`, `DOMAIN_SETUP.md` |

3. Wait for Render and Netlify to finish their deployments. Netlify's
   `VITE_API_URL` still points to your existing Render backend. The backend,
   Turso database, and Cloudinary account stay the same.
4. Open `https://contactly.lol/login`; it should end at
   `https://connectly.lol/login`. Test both `www` variants and the previous
   Netlify address too. Then test login, upload, messaging, and password reset
   on the main site.

The included `_redirects` rules preserve page paths, run before the React
page fallback, and keep redirects off the main HTTPS origin to avoid loops.
Accounts and posts remain in Turso. You may need to sign in again because the
login token in your browser's local storage belongs to the previous hostname.

## 5. Authenticate the email domain in Brevo

1. In Brevo, open **Settings → Senders, Domains, IPs → Domains**, add
   `connectly.lol`, then follow its authentication instructions.
2. Copy the Brevo verification TXT record, DKIM record(s), and DMARC TXT
   record into the DNS settings for `connectly.lol`. With the GoDaddy DNS
   setup above, that is the GoDaddy DNS page. Use Brevo's exact generated
   names, record types, and values. If a DMARC record already exists, follow
   Brevo's instructions to update it rather than adding a second DMARC record.
3. Return to Brevo and verify authentication. Add a sender on that domain,
   for example `no-reply@connectly.lol`, and ensure Brevo accepts/verifies it.
   Domain authentication does not itself create an email inbox.
4. In Render, set `EMAIL_FROM` to the exact sender address and keep
   `BREVO_API_KEY` set to your private Brevo API key. **Save and deploy**.
5. Test **Forgot password?** using an account whose email inbox you control.
   The reset link should start with `https://connectly.lol/reset-password`.

Only authenticate `contactly.lol` for email if you intend to send from an
address ending in `@contactly.lol`. Redirecting its website does not require
email-domain authentication. Brevo keys belong on Render, never GitHub or
the browser frontend.

Official references:

- [Assign a Netlify domain](https://docs.netlify.com/manage/domains/manage-domains/assign-a-domain-to-your-site-app/)
- [Netlify external DNS records](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/)
- [Netlify domain aliases](https://docs.netlify.com/manage/domains/configure-domains/add-a-domain-alias/)
- [Netlify domain redirects](https://docs.netlify.com/manage/routing/redirects/redirect-options/#domain-level-redirects)
- [Brevo domain authentication](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)
