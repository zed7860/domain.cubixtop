# Hosting readiness

The design and build are prepared for the Next.js runtime. `vercel.json`, `netlify.toml` and `.nvmrc` specify build settings. These files do not make the existing storage serverless compatible.

## Current production blocker

Do not launch this application's accounts or payment flows on Vercel or Netlify yet. `lib/db.ts` uses synchronous local SQLite and `lib/settings.ts` stores an encryption key on disk. Both require persistent storage shared across requests. Serverless function filesystems cannot supply this guarantee. Setting `DATA_DIRECTORY=/tmp` would lose accounts and orders and is not a fix.

To launch on either platform:

1. Migrate users, sessions, auth tokens, checkouts, settings, payment attempts, private admin notes and admin activity to a managed database. Update all synchronous SQL callers to the database's supported API.
2. Preserve unique order constraints and atomic payment/provisioning claims. Retest concurrent callbacks against the deployed database.
3. Store one stable 32-byte encryption key in a server-only environment variable, and migrate existing encrypted settings using the original key. Never generate a different key per function instance.
4. Configure Node.js 24, install with `npm ci`, build with `npm run build`, and use the platform's Next.js integration. Netlify requires its Next.js runtime, not a static export.
5. Configure values from `.env.example` in the hosting dashboard, including the public HTTPS URL, secure cookies, administrator credentials, SMTP and registrar settings. Do not commit `.env.local` or `.local`.
6. Confirm NameSilo's outbound-IP requirements with the chosen platform, configure payment callback URLs, and complete authorized sandbox and production payment-to-registration checks.

Until the migration is completed, use one Node.js 24 server with persistent private storage as described in README.md. Neither cloud deployment nor real merchant payments were performed by the automated tests.

## Verification

`npm run typecheck`, `npm run build`, and `npm test` validate the current implementation. Browser coverage includes 320, 390, 768, 1024 and 1440 pixel widths, both themes, domain result currency conversion, public pages, account lifecycle, cart, checkout handoff, administrator access and payment integrity. Merchant responses are fixtures.
