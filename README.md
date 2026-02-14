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
- `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
- `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` — from Stripe dashboard (use test keys)
- `STRIPE_WEBHOOK_SECRET` — from Stripe CLI or dashboard
- SMTP settings for email (optional for local dev)

### 3. Set up database

```bash
npx prisma generate       # Generate Prisma client
npx prisma db push        # Push schema to database
npm run db:seed           # Seed initial data (membership year + settings)
```

### 4. Start dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
| `npm run db:seed` | Seed database |
| `npm run db:studio` | Open Prisma Studio (DB GUI) |

## Key Routes

| Route | Description |
|---|---|
| `/` | Home page |
| `/admin` | Admin dashboard (auth required) |
| `/api/health` | Health check endpoint (JSON) |

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full technical design.

## Stripe Setup (for development)

1. Install the [Stripe CLI](https://stripe.com/docs/stripe-cli).
2. Run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
3. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET` in `.env`.
4. Use [Stripe test cards](https://stripe.com/docs/testing) for payments.
