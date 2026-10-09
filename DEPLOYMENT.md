# Supabase and Vercel deployment

This application supports Supabase PostgreSQL through a server-only DATABASE_URL. The Supabase URL and API keys alone do not provide a PostgreSQL connection or database password. Local tests use isolated SQLite and an embedded PostgreSQL test engine, never the production database.

## Production environment upload

1. In Supabase, open your project and click **Connect > Transaction pooler**. Copy the PostgreSQL connection string. Replace [YOUR-PASSWORD] with your database password and URL-encode reserved password characters. Use the supplied host, port and username exactly.
2. Put that string in DATABASE_URL in `.env.local`, then run `npm run export:vercel-env`. This creates the private `.env.vercel` upload file with your existing Supabase, Zoho and admin credentials. It also preserves the original local settings encryption key when available.
3. Import `.env.vercel` into your Vercel project's **Production** environment. Review the new settings before removing old ones. Never upload this file to GitHub or commit it. The source ZIP excludes private environment files.
4. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY` from Supabase Project Settings. Use NEXT_PUBLIC_SITE_URL=https://domain.cubixtop.com and COOKIE_SECURE=true. Ensure ADMIN_EMAIL and ADMIN_PASSWORD match the intended administrator login. SETTINGS_ENCRYPTION_KEY must be a stable 64-character hexadecimal secret; keep a private backup.
5. Use Next.js, Node.js 24, npm ci and npm run build in Vercel, then redeploy. A GitHub push does not upload local secrets into Vercel.

The app creates its business-data tables in the private **cubixtop** PostgreSQL schema on first startup. Customer signup, sign-in, email verification and password recovery use Supabase Auth. A private customer row is mirrored for orders and profiles, while the administrator authenticates only against `ADMIN_EMAIL` and `ADMIN_PASSWORD`. The service-role key is used only in server routes and must never be exposed or prefixed with `NEXT_PUBLIC_`.

## Zoho email

Configure Supabase Auth email templates and add `https://domain.cubixtop.com/verify` and `https://domain.cubixtop.com/reset-password` to the Auth redirect allow list. Supabase sends customer verification and reset messages. The Zoho SMTP settings remain available for application emails; `npm run verify:email` checks that connection without sending a message.

## Preserve local accounts and integration settings

Existing SQLite records are not automatically imported into a new Supabase schema. Back up .local/domains.sqlite and .local/settings.key, configure DATABASE_URL, then run `npm run migrate:supabase`. Business records and private settings are preserved, but old application password hashes cannot be used by Supabase Auth. Create or invite those customers in Supabase Auth before launch, or have them use Supabase password recovery. Preserve the original SETTINGS_ENCRYPTION_KEY.

## Checks and troubleshooting

Run `npm run check:deployment`, `npm run typecheck`, `npm run build` and `npm test`. PostgreSQL tests exercise real PostgreSQL SQL semantics, login, profiles, orders and admin pages against an isolated engine. Merchant tests use fixtures and do not purchase domains or make real charges.

Missing DATABASE_URL produces SUPABASE_CONNECTION_MISSING. Missing first-administrator credentials produce ADMIN_BOOTSTRAP_MISSING. For invalid credentials, certificate errors or connection timeouts, inspect Vercel runtime logs following Authentication service initialization failed. PostgreSQL certificates are verified; the code does not disable TLS checks. Login does not require the merchant-settings encryption key, but encrypted integration settings do.

Use a separate database for preview deployments. Configure payment callbacks and verify sandbox payment-to-registration behavior before enabling production merchants. DATA_DIRECTORY=/tmp is not persistent hosted storage.

References: [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
