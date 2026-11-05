# Production email setup — Gmail SMTP

Use the Neon `production` branch and the existing private R2 bucket
`journal-assets-prod`. The database and bucket names do not need to match.
Gmail SMTP is deployed and verified. Resend is not required.

## 1. Enable Google 2-Step Verification

1. Sign in to the Gmail account that will send the app's emails.
2. Open https://myaccount.google.com/security.
3. Under **How you sign in to Google**, open **2-Step Verification**.
4. Follow Google's prompts to enable it.

## 2. Create an App Password

1. Open https://myaccount.google.com/apppasswords while signed in to that account.
2. Sign in again if requested.
3. Enter `Dear Days` as the app name and click **Create**.
4. Copy the generated 16-character password into `SMTP_PASS` in the existing
   ignored `.env` file. Remove Google's display spaces. Keep your normal Google
   account password out of this field.

If App Passwords is unavailable, confirm 2-Step Verification is enabled. Work or
school policies, security-key-only verification, and Advanced Protection can
prevent App Passwords from being offered. See
[Google's App Password instructions](https://support.google.com/accounts/answer/185833).

## 3. Fill in the email settings

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-account@gmail.com
SMTP_PASS=your-generated-app-password
EMAIL_FROM="Dear Days <your-account@gmail.com>"
```

Replace the sample address in both places with the same sending Gmail account.
Replace the sample password locally. Keep all SMTP credentials server-only;
never prefix them with `VITE_`. `SMTP_SECURE=true` means TLS starts immediately.
Gmail supports this on port 465; see
[Google's SMTP documentation](https://developers.google.com/workspace/gmail/imap/imap-smtp).

## 4. Complete the production settings

- `DATABASE_URL`: pooled connection from Neon's `production` branch.
- `DATABASE_URL_UNPOOLED`: direct connection from the same branch, for migrations.
- `R2_BUCKET_NAME=journal-assets-prod`.
- R2 access keys must have Object Read & Write access to `journal-assets-prod`.
  A token restricted to a different bucket will not work.
- `BETTER_AUTH_URL` and `APP_ORIGIN`: both
  `https://dear-days.pages.dev`, the deployed website origin,
  without a trailing path. Update both if a custom domain is added later.
- `VITE_API_BASE_URL=/api`: the frontend and API share one Cloudflare Pages origin.
- Keep the existing `BETTER_AUTH_SECRET` private.

The local `.env` file is not deployed automatically. The production Pages project
has `DATABASE_URL`, `BETTER_AUTH_SECRET`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`
configured as secrets. Public origin and SMTP connection settings are in
`wrangler.jsonc`. The direct database URL remains local for migrations; R2 is
connected through the native `JOURNAL_FILES` binding.

## Implementation status

The deployed backend supports signup, email verification, password reset, private
media and cloud sync. Real Gmail delivery and verification/reset links have been
tested, including session revocation after reset. The temporary test accounts and
uploads are removed after the check.

The Worker uses a direct TLS hostname connection supplied to Nodemailer; the
ordinary pre-resolved IP connection was rejected by Cloudflare's socket proxy.
Credentials are unchanged. Connections are request-scoped, use TLS on port 465,
and have bounded timeouts inside `waitUntil` tasks. No passwords or verification
links are printed in logs.

`npm run test:live` explicitly sends verification/reset emails to a unique
plus-address of the configured Gmail sender, reads only those test messages via
IMAP, verifies auth/sync/R2 behavior, and cleans up the test account and files.
It is an integration check, not a startup or deploy hook.
