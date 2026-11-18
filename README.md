# Personal Board

Projects, daily reviews, and a work history you can return to next month.

Built by [Haka Gashi](https://github.com/hakagashii).

## What it does
- Keep private projects, review drafts, completed reviews and reports in an account-backed database.
- Log work by project, date and timezone.
- Browse a GitHub-style activity calendar with month/project filters and day details.
- Download an activity PNG or export your account data.
- Detect conflicting saves rather than silently overwrite another device.

Activity colors represent **recorded work entries**, not a productivity or performance score.

## Current status
This repository contains the runnable local application and a backend intended for self-hosting. **There is no public hosted signup service yet.** The existing hosted owner test is private, not a public demo. Publishing this repository does not enable public registration or deploy anything automatically.

GitHub Pages alone cannot run the account/database backend. The backend uses Cloudflare Workers, D1, Better Auth and Drizzle; the interface is vanilla JavaScript.

## Run locally
Requires Node.js 22+, npm and a browser.

```sh
npm ci
node -e "require('fs').writeFileSync('.dev.vars', 'BETTER_AUTH_SECRET='+require('crypto').randomBytes(48).toString('base64url')+'\n', {mode:0o600,flag:'wx'})"
npm run db:local
npm run build
npm run dev
```

Open **http://127.0.0.1:4791**. Register with a synthetic address such as `demo@example.test` and a password of at least 12 characters. Local mode only accepts `@example.test` addresses. It stores test recovery links in the local database and sends no email. **Never deploy local mode to a public host.**

`npm run build` only builds assets and runs a deployment dry-run. It does not publish a Worker. Keep `.dev.vars` private; the command deliberately refuses to overwrite an existing file.

## Verify
```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
# With npm run dev running in another terminal:
npm run test:e2e
```
Browser tests use synthetic local accounts. They exercise real persistence, account isolation, calendar export, conflicts, rejected writes, sessions and local recovery—not live email delivery.

## Hosting
See [deployment prerequisites](docs/DEPLOYMENT.md). Provision your own database, auth secret and email provider; no maintainer credentials or user records are included. Do not reuse the local configuration unchanged for a public deployment.

## Limitations
- Public email verification and recovery require a configured, verified sender and real inbox testing.
- Old browser-local backups cannot yet be imported into the account-backed app.
- Account export and board erasure exist; full account deletion and public privacy/retention policy need completion before a public launch.
- A prior-month test entry demonstrates history retrieval, not a month of elapsed retention.
- Remote backup/restore and abuse monitoring must be verified by the operator.
- AI workflows remain manual copy/paste; the app does not automatically call an AI provider.

## Security
Never commit credentials, database files, session cookies or personal data. Report security issues privately rather than including exploit details or secrets in a public issue. Do not put sensitive real data into an unreviewed test deployment.

## License
An open-source license for the application has not yet been selected. Public source visibility is not a blanket license to redistribute the application. Third-party dependencies retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
