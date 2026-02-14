# MCFGC Club Management — Technical Design

## 1. Overview

Web application for the **Montgomery County Fish & Game Club, Inc.** (est. 1976), a 501(c)(7) non-profit shooting sports club located at 6701 Old Nest Egg Rd, Mt Sterling, KY 40353. The app manages annual membership (capped at 350), renewals, payments, and basic member communication.

---

## 2. Stack Choice

**Next.js 14 (App Router) + TypeScript + Prisma + PostgreSQL**

Justification:

| Criterion | Why this stack |
|---|---|
| Self-hosting | Runs on any VPS via `next start` or Docker; no vendor lock-in. |
| Simplicity | Single deployable (no separate API server); API routes co-located with pages. |
| Type safety | TypeScript end-to-end; Prisma generates typed client from schema. |
| Ecosystem | Stripe SDK, nodemailer, next-auth all have first-class TS support. |
| Maintenance | One language (TS) for a small volunteer team to learn. |
| Cost | Postgres can run on the same VPS; no managed-service bills required. |

Runtime: **Node.js 20 LTS**. Database: **PostgreSQL 15+**.

---

## 3. Authentication & Authorization

**NextAuth.js (Auth.js v5)** with the Credentials provider (email + password) for the MVP.

### Roles

| Role | Capabilities |
|---|---|
| `ADMIN` | Full CRUD on members, override signup date, view payments, send communications, manage system settings. |
| `MEMBER` | View own profile, pay renewal, update contact info. |

Role is stored on the `Member` record. Middleware checks `session.user.role` and redirects unauthorized requests. Admin routes live under `/admin/*`.

Future: Add OAuth (Google) or magic-link login if requested.

---

## 4. Data Model

```
┌──────────────┐      ┌───────────────────┐
│   Member     │──1:N─│ MembershipEnroll-  │
│              │      │ ment (per year)    │
│              │      └────────┬───────────┘
│              │               │ 1:N
│              │      ┌────────▼───────────┐
│              │      │    Payment         │
│              │      └────────────────────┘
│              │
│              │──1:N─│ Dependent          │
│              │      └────────────────────┘
│              │
│              │──1:N─│ CommunicationLog   │
│              │      └────────────────────┘
└──────────────┘

┌──────────────────┐
│ MembershipYear   │  (system-wide year config)
└──────────────────┘

┌──────────────────┐
│ SystemSettings   │  (key-value for runtime config)
└──────────────────┘
```

### 4.1 Member

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| email | String | Unique, used for login |
| passwordHash | String | bcrypt |
| firstName | String | |
| lastName | String | |
| phone | String? | |
| address, city, state, zip | String | Mt Sterling KY default context |
| dateOfBirth | DateTime? | Used for 65+ discount eligibility |
| isDisabledVeteran | Boolean | Default false; admin-verified |
| role | Enum(ADMIN, MEMBER) | Default MEMBER |
| status | Enum(ACTIVE, INACTIVE, PENDING) | |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### 4.2 Dependent

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| memberId | UUID | FK → Member |
| firstName | String | |
| lastName | String | |
| relationship | String | e.g. "Spouse", "Child" |
| dateOfBirth | DateTime? | |

### 4.3 MembershipYear

One row per calendar year. Holds year-specific config.

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| year | Int | Unique, e.g. 2026 |
| standardPrice | Int | Cents, default 15000 ($150) |
| discountPrice | Int | Cents, default 10000 ($100) |
| renewalDeadline | DateTime | Default Jan 31 of that year |
| signupDate | DateTime? | First Saturday in Feb by default; admin-overridable |
| signupEnabled | Boolean | Admin toggle |
| membershipCap | Int | Default 350 |
| createdAt | DateTime | |

### 4.4 MembershipEnrollment

One row per member per year.

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| memberId | UUID | FK → Member |
| membershipYearId | UUID | FK → MembershipYear |
| status | Enum(PENDING, PAID, LAPSED, RELEASED) | |
| priceCharged | Int | Cents |
| discountApplied | Boolean | |
| discountReason | String? | "AGE_65_PLUS", "DISABLED_VETERAN" |
| enrolledAt | DateTime | |
| paidAt | DateTime? | |

Unique constraint: (memberId, membershipYearId).

### 4.5 Payment

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| enrollmentId | UUID | FK → MembershipEnrollment |
| stripeSessionId | String? | Checkout Session ID |
| stripePaymentIntentId | String? | |
| amount | Int | Cents |
| status | Enum(PENDING, SUCCEEDED, FAILED, REFUNDED) | |
| provider | Enum(STRIPE, MANUAL) | MANUAL for cash/check |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### 4.6 CommunicationLog

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| memberId | UUID? | FK → Member; null for broadcast |
| channel | Enum(EMAIL, SMS) | |
| subject | String? | |
| body | String | |
| sentAt | DateTime | |
| status | Enum(SENT, FAILED, QUEUED) | |

### 4.7 SystemSettings

Key-value store for runtime configuration.

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| key | String | Unique |
| value | String | JSON-encoded |
| updatedAt | DateTime | |

Reserved keys: `signup_day_override`, `late_renewal_policy`, `stripe_webhook_secret` (encrypted).

---

## 5. Renewal Rules

### 5.1 Timeline

1. **Membership term**: January 1 – December 31.
2. **Renewal window opens**: ~December 1 (configurable via SystemSettings).
3. **Renewal payment deadline**: January 31 (stored per MembershipYear).
4. **Slot release**: After Jan 31, unpaid enrollments transition to `RELEASED`. A scheduled job (cron or on-demand admin action) runs this.
5. **New-member signup day**: First Saturday in February (default). Admin can override the exact date/time per year via `MembershipYear.signupDate`.

### 5.2 Late Renewal Policy

Configurable admin decision stored in `SystemSettings.late_renewal_policy`:

- `STRICT` — No renewal after Jan 31; member must re-apply on signup day.
- `GRACE_PERIOD` — Admin can manually extend deadline per member (adds a `graceDeadline` field on enrollment).
- `ADMIN_OVERRIDE` — Admin can mark any lapsed member as paid at any time (manual payment entry).

Default: `ADMIN_OVERRIDE` (maximum flexibility for a small club).

### 5.3 Slot Counting

`available_slots = MembershipYear.membershipCap - COUNT(enrollments WHERE status IN (PAID, PENDING))`

When available_slots reaches 0, new signups are blocked (waitlist future enhancement).

---

## 6. Stripe Integration

### 6.1 Checkout Flow

1. Member clicks "Pay Renewal" or "Sign Up".
2. Server creates a Stripe Checkout Session (`mode: 'payment'`) with:
   - `line_items`: membership fee (standard or discounted).
   - `metadata`: `{ enrollmentId, memberId, year }`.
   - `success_url` / `cancel_url` pointing back to the app.
3. Member is redirected to Stripe-hosted checkout.
4. On success, Stripe redirects to `success_url` with `session_id`.

### 6.2 Webhook Verification

- Endpoint: `POST /api/webhooks/stripe`
- Verify signature using `stripe.webhooks.constructEvent()` with `STRIPE_WEBHOOK_SECRET`.
- Handle events:
  - `checkout.session.completed` → mark Payment as SUCCEEDED, Enrollment as PAID, set `paidAt`.
  - `payment_intent.payment_failed` → mark Payment as FAILED.
- Idempotency: check if payment already processed before updating.

### 6.3 Environment Variables

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 6.4 Future Payment Providers

Payment creation is abstracted behind a `PaymentService` interface:

```typescript
interface PaymentService {
  createCheckoutSession(enrollment: Enrollment): Promise<{ url: string }>;
  handleWebhook(req: Request): Promise<void>;
}
```

Adding PayPal/Venmo later means implementing this interface without touching enrollment logic.

---

## 7. Email Integration

### 7.1 Interface

```typescript
interface EmailService {
  send(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<{ success: boolean; messageId?: string }>;
}
```

### 7.2 Implementation

MVP uses **nodemailer** with SMTP. Swappable to SendGrid, Mailgun, or SES by replacing the transport.

### 7.3 Environment Variables

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=notifications@mcfgcinc.com
SMTP_PASS=...
EMAIL_FROM="MCFGC <notifications@mcfgcinc.com>"
```

### 7.4 Use Cases

- Renewal reminders (December, mid-January).
- Payment confirmation receipts.
- Signup-day announcement.
- Admin broadcast to all active members.

---

## 8. Project Structure

```
clubtracker/
├── docs/
│   └── architecture.md          # This file
├── prisma/
│   ├── schema.prisma            # Data model
│   └── seed.ts                  # Seed data (admin user, initial year)
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout
│   │   ├── page.tsx             # Home page
│   │   ├── admin/
│   │   │   └── page.tsx         # Admin dashboard (protected)
│   │   └── api/
│   │       ├── health/
│   │       │   └── route.ts     # GET /api/health
│   │       └── webhooks/
│   │           └── stripe/
│   │               └── route.ts # POST /api/webhooks/stripe
│   ├── lib/
│   │   ├── db.ts                # Prisma client singleton
│   │   ├── stripe.ts            # Stripe client
│   │   ├── email.ts             # Email service
│   │   └── auth.ts              # NextAuth config
│   └── services/
│       ├── payment.ts           # PaymentService interface + Stripe impl
│       ├── membership.ts        # Enrollment, renewal, slot logic
│       └── communication.ts     # Send + log communications
├── __tests__/                   # Test files
├── .env.example
├── .gitignore
├── .github/
│   └── workflows/
│       └── ci.yml               # Lint + test
├── next.config.ts
├── tsconfig.json
├── package.json
├── tailwind.config.ts
├── postcss.config.mjs
└── README.md
```

---

## 9. Deployment Notes

- **Self-hosted**: Run behind nginx/Caddy reverse proxy with `next start`.
- **Docker**: Dockerfile planned (not in MVP scaffold).
- **Database**: Postgres on same host or managed (e.g., Supabase free tier for dev).
- **Secrets**: All in environment variables; never committed.
- **Backups**: pg_dump cron job recommended for production.
