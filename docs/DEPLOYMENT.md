# Hosting prerequisites

The checked-in wrangler.json is **local development only**. GitHub stores source; Cloudflare runs the backend and database.

1. Authenticate your own Cloudflare account and create a dedicated D1 database.
2. Make a private deployment config with a distinct Worker name, your DB binding and your exact HTTPS APP_ORIGIN. Use APP_ENV=production. Never deploy APP_ENV=local.
3. Apply migrations to that dedicated remote database after checking the target.
4. Set BETTER_AUTH_SECRET through Worker secrets, never committed files. It must be stable across deployments.
5. Configure MAIL_API_KEY (the current adapter uses Resend) and MAIL_FROM with a verified sender. The production auth API intentionally fails closed when these are absent. Provider configuration is not proof of successful inbox delivery.
6. Build with `npm run build`, review the resulting assets, then deploy using the explicit private config. No deploy workflow is included or auto-enabled here.
7. Verify actual signup, email delivery, one-time verification/reset links, Secure HttpOnly cookies, logout/session revocation, ownership boundaries, conflicts, failed-save warnings, and remote database persistence.
8. Before accepting public users, finish account deletion, privacy/retention policy, abuse monitoring, a remote backup/restore rehearsal and migration preview for existing device-local users.

The optional owner-test mode is **not public signup**. It requires an explicit OWNER_EMAILS allowlist and an operator's approval of the exact pending request through a trusted channel. It offers no working email recovery. Do not automatically approve accounts because an email string matches. Manual approval is not proof of inbox verification; require actual email verification before converting those users to public email-auth enrollment.

Keep deployment-specific configuration, account identifiers and allowlists out of the public repository. Use your own provider accounts and review their quotas/pricing. No hosted reliability or retention guarantee is provided by this source release.
