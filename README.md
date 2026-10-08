# Cubixtop Domains

Next.js domain reseller website with customer accounts, domain search, checkout, signed payment notifications, domain provisioning, DNS management and an administrator control center.

The interface uses a Hostick-inspired blue theme, responsive layouts and an accessible icon-only light/dark switch. See [DEPLOYMENT.md](DEPLOYMENT.md) for Vercel and Netlify build settings and the required persistent-storage migration before a serverless production launch.

Administrators can search all registered accounts in **Admin > Registered users**, including accounts with no orders. **View profile** shows account metadata, email verification, domain orders, per-domain registrant contact details and payment history. Phone and address are collected during checkout; accounts without submitted checkout details display them as unavailable. Passwords, session tokens and integration credentials are excluded from profiles.

The administration workspace has eight navigation areas: Overview, Customers, Domain orders, Payments, Review queue, Integrations, Launch & security, and Admin activity. The overview shows real order activity and active-order value before costs. Customer, order and payment CSV exports require an administrator session and protect against spreadsheet formula injection. Order and payment lists support search, status filters and pagination. Customer profiles support private notes and revoking all customer sessions. Support actions and integration changes are recorded in the activity log; it is not a complete historical log of all application events. Email customer opens the administrator's email client.

Customers can edit their name, email, mobile and address in **Account**. Administrators can edit customer profiles and reset passwords from **Customers > View profile**. Email changes clear verification and revoke existing sessions; a customer must supply their current password when changing their own email. Administrator password replacements revoke customer sessions and existing recovery links. Reset and verification emails require working SMTP; otherwise the interface reports that delivery is unavailable. Previously submitted registrar contacts remain attached to the original domain order.

**Cancel unpaid order** is available in the customer dashboard, admin order list and customer profile. Cancelled orders leave the current dashboard and default admin lists but remain in history; admins can choose the **cancelled** status filter. Existing gateway attempts must be checked before cancellation. Paid, provisioning and review orders cannot be cancelled here. A payment received after cancellation is retained for manual review instead of registering a domain automatically. **Check payment status** lets admins reconcile an order with its gateway. The customer directory can be filtered to accounts with active domains.

## Run

Requires Node.js 24 or later (the application uses built-in SQLite).

```powershell
npm install
# Copy .env.example to .env.local and enter your server configuration.
npm run build
npm run start -- --hostname 127.0.0.1 --port 3002
```

## Payment gateway setup

Sign in as an administrator and open **Admin > Payment gateways**. Select a provider to see its required fields. Save its settings to select it for customer checkout. You can retain separate settings for all five providers and switch using **Use saved settings**. Customers use the administrator’s selected gateway; its supported UPI, card, wallet and net banking methods appear inside the merchant checkout.

| Gateway | Required credentials | Integration | Merchant notification URL |
| --- | --- | --- | --- |
| Cashfree | App ID, secret key | Cashfree v3 browser SDK and order API | `/api/payments/cashfree/webhook` |
| Razorpay | Key ID, key secret, webhook secret | Official Node SDK and Standard Checkout browser SDK | `/api/payments/razorpay/webhook` |
| Paytm | Merchant ID, 16-byte merchant key, website name | Official checksum package, signed APIs and merchant CheckoutJS | `/api/payments/paytm/callback` |
| PayU / PayUMoney | Hosted Checkout merchant key and salt | Hosted form, server SHA-512 hashes and Verify Payment API | `/api/payments/payu/callback` |
| Easebuzz | Merchant key and salt | Initiate Payment API, hosted checkout and Transaction V2 API | `/api/payments/easebuzz/callback` |

Prefix notification paths with your public HTTPS website URL, for example `https://domain.cubixtop.com`. Hosted PayU and Easebuzz checkout requires no browser SDK installation. The application automatically loads the browser SDK for the selected SDK-based provider.

Cashfree and Razorpay credentials are checked against their APIs; Paytm settings are checked with a signed status response. PayU and Easebuzz settings are checked for required fields and saved, with a clear instruction to complete a sandbox payment to validate the credentials. Saving settings alone does not prove merchant activation or successful payment processing.

The integration forms show **Successfully connected** after verified API authentication, retain the last verification time, and support testing saved credentials without entering secrets again. NameSilo verification also survives reload. Failed checks of saved credentials clear the verified badge. PayU and Easebuzz show **Saved · verification pending** until a remotely verified payment proves the current credentials; proof does not carry over to replacement keys or a different environment. API authentication does not verify Razorpay's webhook secret, Paytm's website name, callback delivery, merchant activation or registrar funding; complete a sandbox checkout and signed notification test for those settings.

1. Activate the merchant account and obtain credentials for the selected environment.
2. Start with **Sandbox**, save the provider’s settings and complete a test checkout.
3. Cashfree: enable payment events and whitelist the website domain when required.
4. Razorpay: configure the same webhook secret, enable `order.paid` and `payment.captured`, and enable automatic capture in the merchant dashboard.
5. Paytm: use the correct merchant website name, usually `WEBSTAGING` for test and `DEFAULT` for production. Allow the callback URL in the merchant account.
6. PayU / PayUMoney: use credentials for the supported PayU Hosted Checkout integration. The key is the merchant key, not the merchant ID.
7. Easebuzz: use the merchant key and salt for its hosted payment integration.
8. Verify that the payment is shown as **Sandbox payment verified**. Sandbox payments never purchase a real domain.
9. Configure your public HTTPS server and production credentials, then select **Production**. Complete a merchant-authorized live payment and verify payment-to-registration before opening the website to customers.

Official integration references: [Cashfree](https://www.cashfree.com/docs/payments/online/web), [Razorpay](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/), [Paytm](https://www.paytmpayments.com/docs/js-checkout/), [PayU](https://docs.payu.in/docs/prebuilt-checkout-page-integration), [Easebuzz](https://docs.easebuzz.in/).

## Payment behavior

The server rechecks domain availability and computes the INR amount from the live registrar price, exchange rate and markup. Browser-provided amounts are never trusted. Payment notifications have their signatures checked, then the server verifies the gateway’s payment status and original INR amount before registering a domain.

Each payment attempt retains an encrypted snapshot of its credentials. Changing the selected provider, keys or environment does not change existing attempts. Duplicate callbacks and status checks claim registration atomically, so they do not purchase the same domain twice. Amount mismatches, registrar failures and payments received for replaced attempts require administrator review. Registration email failure cannot downgrade an active domain.

The customer dashboard shows payment, registration and review states, offers **Check payment**, and can resume the original pending checkout without creating another payment. The return page polls briefly for confirmation. A payment check can also recover a successful payment whose notification was missed. Confirm pending orders in the dashboard before retrying payment. Paid orders that require review must be resolved with the merchant dashboard and registrar; automatic refunds and administrative reprovisioning are not implemented.

## Production configuration

The Admin **Production configuration** section reports configuration presence. It does not perform live merchant, DNS, SMTP or registrar-balance checks.

Set these in `.env.local` or the production server environment:

- `NEXT_PUBLIC_SITE_URL`: public HTTPS URL used for return, callback and email links.
- `COOKIE_SECURE=true`: for deployment behind HTTPS.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`: administrator credentials. If no initial password is supplied, it is generated into the private `.local/admin-credentials.txt` file.
- NameSilo API key in Admin, or `NAMESILO_API_KEY`. Allow the server’s fixed outbound IP and fund the reseller balance before taking live payments.
- `DEFAULT_MARKUP_PERCENT`: markup applied to registrar prices, default 25.
- `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`: for verification, reset and activation email.
- `DATA_DIRECTORY`: persistent, private storage directory, default `.local`.

Missing email settings disable email delivery. Merchant activation, real credentials, DNS, HTTPS and funded registrar access are external prerequisites and must be configured before the website can transact live.

## Storage and deployment

Deploy on one persistent Node.js server. SQLite is stored in `DATA_DIRECTORY/domains.sqlite`. Credentials are encrypted with `DATA_DIRECTORY/settings.key`; back up this key with the database and restrict access to both. Losing the key makes saved integration credentials unreadable. This version must not run on ephemeral serverless storage or multiple independent servers.

Point the website domain at your server, terminate HTTPS and expose the notification routes publicly. Merchant callbacks cannot reach localhost. Set up private backups and keep the data directory outside publicly served files. Accounts with payment records need support-assisted closure so payment and registration records are not lost.

## Verification

```powershell
npm run typecheck
npm run build
npm test
```

Playwright uses an isolated test-server database and Microsoft Edge. Tests cover the storefront, gateway form selection, signed API responses, tampered signatures, payment amount mismatches, sandbox isolation and concurrent duplicate confirmations. Gateway API responses in automated tests are fixtures; these tests do not certify live merchant credentials or bank settlement.
