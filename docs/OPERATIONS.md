# OGSERC Registry: operations guide

For whoever hosts and looks after the system. Registry staff need [USER_GUIDE.md](USER_GUIDE.md) instead.

## 1. What it needs

| Item | Minimum |
|---|---|
| Server | Linux VPS in Nigeria (or in-country), 2 vCPU, 4 GB RAM, 40 GB SSD |
| Software | Docker (recommended), or Node.js 22.12+ and PostgreSQL 16+ (18 is what the app is tested on) |
| Network | HTTPS only, with a certificate (Coolify, Caddy or nginx in front). Open ports 80/443 and SSH only. PostgreSQL is never exposed |
| Access | Staff only. Ideally an office IP allowlist or VPN in front of the app as well as the logins |
| Ownership | Hosting account and billing in the Commission's name, with at least two people able to administer it |

Shared cPanel-style hosting can't run it: it needs a long-running Node server and PostgreSQL.

## 2. Settings (environment variables)

| Variable | Needed | What it is |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection, e.g. `postgresql://user:pass@db:5432/ogserc_registry` |
| `BETTER_AUTH_SECRET` | yes | 32+ random characters; signs sign-in sessions. Changing it signs everyone out |
| `DATABASE_URL_UNPOOLED` | Vercel + Neon | Direct connection used by migrations and seeding (set by the Neon integration). Elsewhere leave unset |
| `BETTER_AUTH_URL` | yes (not on Vercel) | The public HTTPS address, e.g. `https://registry.ogserc.gov.ng`. On Vercel, if unset, the production `*.vercel.app` address is used |
| `CRON_SECRET` | for scheduled jobs | Random secret the scheduler sends to `/api/jobs/<job>` |
| `BACKUP_DIR` | for backups | Folder `scripts/backup-db.sh` writes to and the Backup check job reads |
| `BACKUP_KEEP_DAYS` | no | Days of backups kept on the server (default 30) |
| `BACKUP_UPLOAD_CMD` | recommended | Command that copies each backup off the server; `{}` is the file |

These dev/test-only settings must not be set in production: `APP_NOW`, `APP_NOW_FILE`, `DEV_SEED_PASSWORD`. If any of them is set, the app refuses to start and exits with code 1. It also refuses if `BETTER_AUTH_SECRET` is short, or if the database contains dev accounts (`@example.invalid`).

## 3. First deployment

### With Docker (recommended; Coolify can run the same compose file)

```sh
git clone <repo> ogserc-registry && cd ogserc-registry
cp .env.production.example .env.production      # fill in every value
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec app npm run db:seed
docker compose -f docker-compose.prod.yml exec app npm run admin:create -- --email it@ogserc.gov.ng --name "IT Officer"
```

- The container applies database migrations every time it starts.
- `db:seed` loads the reference data (types, units, lists, holidays, settings). It only fills empty tables, so running it again is harmless.
- `admin:create` prints a temporary password once. The admin must change it at first sign-in.

> The Docker files have not been built on the development machine, which has no Docker. The same steps without Docker (below) were rehearsed: production build, migrations, seed, `admin:create`, start, sign-in redirect, and the start-up guard refusing a dev database. Build the image once on the server and check it before go-live.

### Without Docker

```sh
npm ci
npx prisma migrate deploy
npm run db:seed
npm run admin:create -- --email it@ogserc.gov.ng --name "IT Officer"
npm run build
NODE_ENV=production npx next start -p 3000      # run under systemd or pm2
```

### On Vercel (chosen hosting: `*.vercel.app` address, no custom domain)

Vercel runs the app; the database is a managed PostgreSQL from the Vercel Marketplace (Neon). Use a **Pro** team in the Commission's name, not Hobby.

> **Data location:** Vercel and Neon have no Nigerian region. `vercel.json` pins the functions to London (`lhr1`); create the Neon database in the nearest EU region too (e.g. Frankfurt or London). Records then sit outside Nigeria. Get sign-off under the NDPA from the Commission's legal adviser / DPO before go-live.

1. Import the repo into Vercel (framework: Next.js). Add the Neon integration to the project: it sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct).
2. Project › Settings › Environment Variables (Production): `BETTER_AUTH_SECRET` and `CRON_SECRET`. Leave `BETTER_AUTH_URL` unset to use the production `*.vercel.app` address. Never set `APP_NOW`, `APP_NOW_FILE` or `DEV_SEED_PASSWORD`.
3. Deploy. The build (`npm run vercel-build`) runs `prisma migrate deploy`, then `next build`. Migrations run **only for production deployments**; preview builds skip them, so a preview can never change the live database. A preview with its own Neon branch can set `MIGRATE_ON_BUILD=1`.
4. Seed and create the first admin once, from a trusted machine, against the production database:

   ```sh
   vercel env pull .env.production.local --environment=production
   npx tsx --env-file=.env.production.local prisma/seed.ts
   npx tsx --env-file=.env.production.local scripts/create-admin.ts --email it@ogserc.gov.ng --name "IT Officer"
   rm .env.production.local
   ```

5. Restrict preview deployments with Vercel Deployment Protection (Standard Protection is enough), so only team members can open them.

Notes:
- The address is public. The app's own sign-in is what protects it. The app sends `X-Robots-Tag: noindex` and a `robots.txt` that disallows everything, so search engines don't list it.
- The Vercel cron jobs (refresh status, holiday check) are in `vercel.json` and use `CRON_SECRET` automatically (see §4).
- Nothing is written to the local disk at run time. The PDF fonts and logo in `assets/` are bundled into the PDF functions, so after adding `assets/logo.png` you must redeploy.

### Then, in the app

1. **Admin › Settings:** the Secretary to the Commission's name, the Effective Date (Q1), the closing time and the slip footers.
2. **Admin › Users:** one account per member of staff, with the right role. Unit officers need their unit. Signatories need "Signs outgoing letters" and a designation.
3. **Head of Registry › Reference:** check the types, response targets (Q6), lists and the holiday calendar.
4. **Logo:** put `assets/logo.png` in place for slips and reports, then rebuild/redeploy.

## 4. Scheduled jobs

Call these from the server's scheduler (cron, Coolify scheduled tasks), Lagos time:

| When | Job | Why |
|---|---|---|
| 23:30 | `scripts/backup-db.sh` | Nightly backup |
| 00:30 | `POST /api/jobs/refresh-status` | Statuses change at midnight (overdue) |
| 06:00 | `POST /api/jobs/backup-check` | Fails if last night's backup is missing, empty or old |
| 07:00 | `POST /api/jobs/holiday-check` | Lists unconfirmed holidays in the next 30 days |

```sh
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/jobs/refresh-status
```

Every run is recorded under **Jobs**, and a failed run shows there in red. An admin can also run any job from that screen.

**On Vercel**, `vercel.json` schedules the two app jobs. Vercel Cron runs in UTC, so the times there are one hour earlier than Lagos time (`30 23 * * *` is 00:30 Lagos, `0 6 * * *` is 07:00 Lagos). Vercel calls them with `GET` and the project's `CRON_SECRET`. The backup script and Backup check job aren't scheduled there: see §5.

## 5. Backups and restore

**Backup:**
- `scripts/backup-db.sh` writes `registry-<UTC time>.dump` (compressed `pg_dump --format=custom`) to `BACKUP_DIR` and deletes files older than `BACKUP_KEEP_DAYS`.
- With `BACKUP_UPLOAD_CMD` set, it also copies each file off the server, e.g. `aws s3 cp --only-show-errors {} s3://ogserc-registry-backups/`.
- Keep the off-site copies in the same jurisdiction, with their own retention: 30 daily + 12 monthly is a sensible start.

**On Vercel + Neon:** Neon keeps point-in-time restore history (its length depends on the plan; choose at least 7 days). That alone isn't an off-site backup. Also run `scripts/backup-db.sh` nightly from a machine the Commission controls, with `DATABASE_URL` set to the `DATABASE_URL_UNPOOLED` value and `BACKUP_UPLOAD_CMD` set. A Neon restore goes to a new branch first; check it as below before you promote it.

**Restore** (to a new, empty database first, never straight over the live one):

```sh
createdb ogserc_registry_restore
pg_restore --no-owner --no-privileges -d ogserc_registry_restore registry-20270115T2230Z.dump
```

Then check it:
1. Point a test copy of the app at the restored database.
2. Sign in, and check that today's Daily Register and the Dashboard counts match the live system as of the backup time.
3. Check that the latest ACK and OUT numbers match.

Only then switch `DATABASE_URL` and restart.

**Before go-live, restore once for real**, and repeat the drill every quarter. A backup that has never been restored doesn't count. Record each drill (date, file, who, result).

## 6. Upgrades

1. Take a backup (`scripts/backup-db.sh`).
2. Deploy the new version. Docker: `git pull && docker compose -f docker-compose.prod.yml up -d --build`.
3. Migrations run on start and are forward-only. To roll back, restore the backup and redeploy the previous version.

## 7. Monitoring and security checklist

- [ ] Uptime monitor on `https://<host>/login` (UptimeRobot or similar), alerting two people.
- [ ] Jobs screen checked weekly for failed runs.
- [ ] Automatic security updates on the server; SSH keys only; firewall 80/443/SSH.
- [ ] Secrets only in the server's environment / `.env.production`, never in git.
- [ ] At least two active admin accounts; leavers deactivated on their last day.
- [ ] The audit log (Head of Registry / Admin › Audit) is reviewed when something looks wrong. It can't be edited or deleted.

## 8. When something goes wrong

| Symptom | Cause / fix |
|---|---|
| App exits at start: "will not start in production" | Read the listed reasons: test clock set, short secret, `DEV_SEED_PASSWORD`, or a dev/test database |
| "CRON_SECRET is not configured" from a job call | Set `CRON_SECRET` and restart |
| A user is locked out | 5 wrong passwords lock an account for 15 minutes; an admin can unlock it under Users |
| Everyone signed out at once | `BETTER_AUTH_SECRET` changed |
| Deadlines look a day off | Check the holiday calendar (Reference › Public holidays). The server's time zone doesn't matter: the app always uses Africa/Lagos |
