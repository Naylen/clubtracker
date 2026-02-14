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

## Run with Docker Desktop

### 1. Create local env file

```bash
cp .env.example .env
```

Use safe local values in `.env` (never commit real secrets).

### 2. Start app + Postgres (dev target)

```bash
docker compose up --build
```

- App: `http://localhost:3000`
- Postgres: `localhost:5432`

The app container uses Docker Compose networking, so `DATABASE_URL` points to `db` internally.

### 3. Run Prisma migrations in-container

Run this once after containers are up:

```bash
docker compose exec app npm run db:migrate
```

For production-style migration command:

```bash
docker compose exec app npm run db:migrate:deploy
```

Optional seed:

```bash
docker compose exec app npm run db:seed
```

### 4. Verify health endpoint

```bash
curl http://localhost:3000/api/health
```

### 5. Stop and clean up

```bash
docker compose down
```

Remove database volume too:

```bash
docker compose down -v
```

### Production image target

Use the production target (runs `next start` and executes `prisma migrate deploy` in entrypoint):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
```

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

If the app is running in Docker Desktop, this command still works because port `3000` is mapped to the container.

5. Use [Stripe test cards](https://stripe.com/docs/testing) for payments.
