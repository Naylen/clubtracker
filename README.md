# MCFGC Club Management

Membership management web application for the **Montgomery County Fish & Game Club, Inc.** — a 501(c)(7) non-profit shooting sports club in Mt Sterling, KY.

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Prisma** ORM + PostgreSQL
- **Stripe** for payments
- **Tailwind CSS** for styling
- **Vitest** for testing

## Prerequisites

- Node.js 20+
- PostgreSQL 15+
- A Stripe account (test mode for development)

## Local Development Setup

### 1. Clone and install

```bash
git clone https://github.com/Naylen/clubtracker.git
cd clubtracker
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

- `DATABASE_URL` — your Postgres connection string
- `AUTH_SECRET` (or `NEXTAUTH_SECRET`) — generate with `openssl rand -base64 32`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — initial seeded admin login
- `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` — from Stripe dashboard (use test keys)
- `STRIPE_WEBHOOK_SECRET` — from Stripe CLI or dashboard
- SMTP settings for email broadcasts:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `EMAIL_FROM`

### 3. Set up database

```bash
npx prisma generate       # Generate Prisma client
npm run db:migrate        # Create/apply migrations
npm run db:seed           # Seed initial data (membership year + settings)
```

### 4. Start dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Docker Desktop (Dev - Default)

### 1. Create local env file

```bash
cp .env.example .env
```

Use safe local values in `.env` (never commit real secrets).

### 2. Start app + Postgres (default)

```bash
docker compose up --build -d
```

- Dev app: `http://localhost:3000`
- Postgres: `localhost:5432`

### 3. Run Prisma migration + seed in dev container

```bash
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma db seed
```

Seed requires an up-to-date schema, so run migrations first.

## Docker (Prod-like)

### 1. Start prod profile

```bash
docker compose --profile prod up --build -d
```

This starts the prod container as `app-prod` (exposed at `http://localhost:3001`) and Postgres.
The prod entrypoint runs `prisma migrate deploy` automatically when the app container starts.
If you want only prod services in this mode, run:

```bash
docker compose --profile prod up --build -d db app-prod
```

### 2. Run Prisma migration + seed in prod container

```bash
docker compose --profile prod exec app-prod npx prisma migrate deploy
docker compose --profile prod exec app-prod npx prisma db seed
```

## Reset DB

```bash
# dev/default
docker compose down -v

# prod profile
docker compose --profile prod down -v
```

Guardrail: if `docker compose ps` shows only `db`, you started the wrong command/service (for example `docker compose up db`). Use full stack commands above.
`prisma db seed` requires migrations first and an app container (`app` or `app-prod`) to execute in.

Windows note: if entrypoint fails with `^M`, Git line endings are wrong for shell files. `.gitattributes` in this repo enforces LF for `.sh`, Dockerfile, and compose YAML files.

## Available Commands

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run format` | Check formatting (Prettier) |
| `npm run format:fix` | Auto-fix formatting |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:push` | Push schema changes to DB |
| `npm run db:migrate` | Create and run migrations |
| `npm run db:migrate:deploy` | Apply existing migrations (deploy-safe) |
| `npm run db:seed` | Seed database |
| `npm run db:studio` | Open Prisma Studio (DB GUI) |
| `npm run docker:dev` | Docker Compose dev up/build |
| `npm run docker:prod` | Docker Compose prod target up/build |
| `npm run docker:down` | Docker Compose down |
| `npm run docker:down:volumes` | Docker Compose down and remove volumes |

## Key Routes

| Route | Description |
|---|---|
| `/` | Home page |
| `/admin` | Admin dashboard (auth required) |
| `/admin/members/import` | Admin CSV member import (preview + confirm) |
| `/api/health` | Health check endpoint (JSON) |

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full technical design.

## Stripe Setup (for development)

1. Set `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET` in `.env`.
2. In Stripe Dashboard, add a webhook endpoint pointing to:
   - `https://<your-domain>/api/webhooks/stripe`
   - Local dev: `http://localhost:3000/api/webhooks/stripe`
3. Subscribe to at least:
   - `checkout.session.completed`
   - `payment_intent.payment_failed`
4. For local testing, run Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

If the app is running in Docker Desktop, this still works because port `3000` is mapped to the container.

5. Use [Stripe test cards](https://stripe.com/docs/testing) for payments.

## Admin Member CSV Import

Admins can import members at `/admin/members/import` using a preview-first flow.

- Upload CSV and preview parsed rows before import.
- Invalid rows are reported and skipped.
- `role=ADMIN` is rejected to prevent privilege escalation.
- Default behavior is idempotent upsert by email.

Supported headers are case-insensitive and accept common aliases:

- Required: `email`
- Name: `name` or `firstName` + `lastName`
- Optional: `phone`, `address`, `city`, `state`, `zip`, `dateOfBirth`, `isDisabledVeteran`, `status`, `role`
- `dateOfBirth` format: `YYYY-MM-DD` or `MM/DD/YYYY`
- `isDisabledVeteran`: `true/false`, `yes/no`, `1/0`
- `status`: `ACTIVE`, `INACTIVE`, `PENDING`

Example file: `docs/examples/members.sample.csv`

```csv
email,firstName,lastName,phone,address,city,state,zip,dateOfBirth,isDisabledVeteran,status
alice@example.com,Alice,Carson,859-555-1000,101 Oak St,Mount Sterling,KY,40353,1958-03-14,yes,ACTIVE
bob@example.com,Bob,King,859-555-1001,202 Pine Rd,Mount Sterling,KY,40353,07/22/1989,no,INACTIVE
```
