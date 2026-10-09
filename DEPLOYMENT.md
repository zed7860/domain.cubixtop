# Deploy to Vercel

The app uses Next.js with a persistent remote libSQL database on Vercel. Local development continues to use `.local/domains.sqlite`. Hosted requests never fall back to temporary SQLite storage.

## Required environment variables

Create a **libSQL** database in Turso. Use a separate database for previews. Set these variables in the Vercel project before deployment:

| Variable | Value |
| --- | --- |
| TURSO_DATABASE_URL | Your libsql:// database URL |
| TURSO_AUTH_TOKEN | Private database token |
| SETTINGS_ENCRYPTION_KEY | One stable 64-character hexadecimal secret |
| ADMIN_EMAIL | Administrator email |
| ADMIN_PASSWORD | Strong password, at least 12 characters |
| NEXT_PUBLIC_SITE_URL | Public HTTPS website URL |
| COOKIE_SECURE | true |

Generate a new encryption key locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Save it privately and keep the same key across deployments. Losing it makes saved merchant credentials unreadable. Add SMTP and optional NAMESILO_API_KEY values from `.env.example`. Configure merchants and registrar settings in Admin > Integrations.

The app creates its runtime tables on first database access. The older `supabase/schema.sql` describes a different data model and is not used by this application.

## Upload and deploy

Import the source into Vercel with the **Next.js** preset and **Node.js 24.x**. Select the folder containing package.json as the root. vercel.json uses npm ci and npm run build; leave the output directory at its framework default.

Generate `cubixtop-vercel.zip` with `npm run package:vercel`. The archive contains source and the lockfile, and excludes node_modules, .next, .local, .env.local, logs, and test results. If your import workflow requires a repository, commit the archive's source contents to a repository and import that repository.

Check login, account creation, admin access, and saved settings across requests and redeployments. Confirm registrar outbound-IP requirements. Configure gateway callbacks using the public website URL and complete sandbox checkout and signed notification checks before using production payments. Automated payments use fixtures and do not prove merchant activation or live registration.

## Preserve existing accounts and settings

Stop local writes and back up `.local/domains.sqlite` and `.local/settings.key`. Import the SQLite database into an empty remote **libSQL** database using Turso's SQLite import workflow. This preserves runtime tables, accounts, orders, and encrypted payment snapshots. Do not apply supabase/schema.sql over it.

Set SETTINGS_ENCRYPTION_KEY to the **hexadecimal encoding of the original settings.key file**, rather than generating a replacement. Keep it private. Verify imported records and decrypted integrations before changing the production URL. No remote database has been provisioned and no existing records have been uploaded automatically.

## Troubleshooting

### GitHub automatic deployment and Zoho email

Push this project's source to the GitHub repository already connected to your Vercel project. Vercel must track the branch you push. Keep the Next.js preset, Node.js 24, `npm ci` install and `npm run build` build commands.

The verified local Zoho SMTP host for info@cubixtop.com is **smtp.zoho.in**, using port **587**, `SMTP_SECURE=false`, and required STARTTLS. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD and EMAIL_FROM in **Vercel's environment variables**. The updated local app password remains in the ignored `.env.local`; GitHub pushes do not copy it into Vercel. If changing the Zoho account or plan, use the host shown in that mailbox's Server Configuration Details.

Run `npm run verify:email` to verify SMTP authentication without sending mail. Run `npm run check:deployment` to identify missing hosted configuration. The remote database variables TURSO_DATABASE_URL, TURSO_AUTH_TOKEN and SETTINGS_ENCRYPTION_KEY still need to be supplied in Vercel if not already configured there. Redeploy after changing Vercel environment variables.

Signup welcome emails and password-reset emails use these SMTP settings. Password reset links expire in two hours and become invalid after a successful reset. Set NEXT_PUBLIC_SITE_URL to the actual HTTPS production domain so email links point to the deployed application. The email-flow test runs an isolated server with a captured mailbox and verifies the signup message, browser recovery flow, expiry, token replacement, single use, concurrent submissions, session revocation and delivery failure. It sends no real emails.

Authentication initialization failures return JSON HTTP 503 and log `Authentication service initialization failed`. Inspect Vercel runtime logs for missing database credentials, invalid encryption keys, and connection errors. DATA_DIRECTORY=/tmp cannot provide persistent hosted storage.

Login initialization depends on the persistent database, not the merchant-settings encryption key. Missing database credentials now return a specific configuration error naming the missing environment variable. An existing administrator can log in without ADMIN_PASSWORD being present; that variable is required when creating the first hosted administrator. SETTINGS_ENCRYPTION_KEY remains required to read or save encrypted payment and registrar settings. Database credentials and the encryption key are private Vercel environment variables and are never committed to GitHub.

Local development without remote database variables retains SQLite and the existing key. Back up both files together. Netlify deployments also require the remote database and stable key, using its Next.js runtime.

References: [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Turso TypeScript SDK](https://docs.turso.tech/sdk/ts/reference).
