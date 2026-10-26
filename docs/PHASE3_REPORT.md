# Phase 3 report

Branch `phase-3` (stacked on `phase-2`). Auth, users and roles.

## 1. What's built

| Area | Where |
|---|---|
| Who may do what (SPEC §10): capabilities per role, deny by default, unit read scope, void rule | `src/domain/permissions.ts` |
| Password rules; lockout after 5 failures for 15 minutes | `src/domain/passwords.ts` |
| Better Auth: email + password, argon2id, sessions in the DB, no sign-up | `src/server/auth.ts` |
| Sign-in with lockout (audited), sign-out, session → user | `src/server/session.ts` |
| Admin user management: create with temporary password, edit, deactivate, reset password, unlock | `src/server/users.ts` |
| Settings read/update, Zod-validated, audited with old and new values | `src/server/settings.ts` |
| Read scopes as database filters; scoped queries | `src/server/access.ts`, `src/server/queries.ts` |
| Permission checks inside create and void, so no caller can skip them | `src/server/registers.ts` |
| Screens: `/login`, `/account/password`, `/admin/users`, `/admin/users/[id]`, `/admin/settings`, 403 page | `src/app/` |
| First-admin script | `npm run admin:create` |
| Startup refuses `APP_NOW` in production | `src/instrumentation.ts` |

**Roles** (SPEC §10):

| Role | Can |
|---|---|
| Registry officer | Log and handle items; File Desk (no Confidential/Personnel files); reports; dashboard |
| Head of Registry | As officer, plus void, edit any field, Confidential files, manage types/lists/holidays |
| Unit officer | Read only: non-void items routed to their unit, outward items their unit originated |
| Secretary / management | Read everything, including Confidential files; reports; dashboard |
| Admin | Users and settings only; no access to the registers |

## 2. Tests

- `npm test`: 137 pass, including 20 new Phase 3 integration tests.
- `npm run test:e2e`: 6 pass in a real browser.

The done-when criteria, each proven against the database:
- **Unit officers** can't list or open another unit's items, even by id. They can't log, void, change settings or manage users, and a refused write leaves no trace (no number used).
- **Only the Head of Registry can void.** Officers, secretaries, unit officers and admins are refused. A head can't void an item they logged unless the setting allows it.
- **Only Admin manages users and settings.** The Head of Registry is refused, and admins can't see the registers.

Also covered:
- **Lockout:** 5 failures lock the account for 15 minutes, and an admin can unlock it early.
- **Deactivation** ends the user's sessions, and **expired sessions** are rejected.
- **Passwords:** a temporary password forces a change at first sign-in; password rules are enforced.
- **Admins and audit:** the last admin can't be removed, and passwords never reach the audit log.

## 3. Decisions to check

1. **No Better Auth HTTP endpoints.** Sign-in, sign-out and password changes go through server actions, so nobody can bypass the lockout by calling `/api/auth/...` directly. The Phase 0 route map's `/api/auth/[...all]` is dropped.
2. **Lockout:** 5 failures in a row → 15 minutes, per account. Every attempt on a known account is audited. Unknown emails get the same message as a wrong password. The lockout message does say the account is locked, which helps staff but tells a guesser the email exists. Acceptable for an internal app?
3. **Sessions last 12 hours and slide while in use** (refreshed at most hourly). Not a setting yet.
4. **Password rules:** at least 12 characters, letters mixed with something else, not your name or email, no common words. No forced expiry (current NCSC/NIST advice).
5. **Unit officers see every non-void item routed to their unit**, including Noted/filed (Phase 0 proposal for SPEC §10). They see no files: the spec doesn't give them File Desk access.
6. **The Secretary role** covers both "Secretary / management" and signatories such as the Chairman. Whether someone signs letters is a separate tick on the user.
7. **E2E tests have their own database** (port 5445), reset and seeded each run, so they never touch your dev data.

## 4. Notes

- I set a random `BETTER_AUTH_SECRET` in your local `.env`. It was empty, and sign-in needs it. It isn't committed.
- Your dev database now has a dev login per role (see README, "Signing in locally").
- Q5 (do unit officers record anything?) and Q-D (may the head void own items?) remain open. Both follow the defaults: read-only, and off.
