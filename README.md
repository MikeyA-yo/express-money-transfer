# Express Money Transfer API

A RESTful money-transfer API built with Node.js, Express 5, MongoDB (Mongoose) and Redis. It supports JWT-authenticated users and admins, internal account-to-account transfers, payouts to Nigerian bank accounts through Paystack, idempotent request handling, background email notifications and a Dockerised local stack.

For architecture rules and contribution conventions, see [AGENTS.md](AGENTS.md).

## Features

- **Authentication & Roles**: Sign up, log in and fetch your profile with JWTs. Routes are guarded by `user`, `admin` and `superadmin` roles.
- **Account Management**: Create, read, update and soft-delete accounts. Balances are stored as `BigInt` minor units (cents/kobo), never floats.
- **Internal Transfers**: Move money between accounts inside a MongoDB transaction using atomic `$inc` updates, so concurrent transfers can't overdraw an account.
- **External Transfers (Paystack)**: Resolve a recipient's bank account, then pay out to it. Funds are reserved first and refunded automatically if Paystack rejects, fails or reverses the transfer.
- **Settlement without relying on webhooks**: External transfers are checked against Paystack shortly after initiation, can be re-checked on demand through a status endpoint, and are also updated by signed Paystack webhooks.
- **Idempotency**: State-changing transfer requests require an `X-Idempotency-Key` header. Redis locks and cached responses make retries safe: a repeated request returns the original result instead of moving money twice.
- **Events & Notifications**:
  - Internal transfers enqueue a BullMQ job that emails a transfer receipt (Nodemailer + React Email template).
  - External transfers publish `transfer.completed` / `transfer.failed` events on Redis Pub/Sub, backed by an Outbox record while the transfer is in flight.
- **Admin Dashboard Endpoints**: System statistics and a paginated audit trail of all transfers.
- **Security & Observability**: Helmet, request sanitisation against NoSQL injection, Zod validation on every input, request IDs, response-time headers, and Winston + Morgan logging.
- **Database Migrations**: Versioned migrations with `migrate-mongo`.
- **Docker**: Multi-stage Dockerfile plus a Compose stack (API, MongoDB replica set, Redis).

## Tech Stack

| Area | Tools |
|---|---|
| Runtime & framework | Node.js 24 (ES Modules), Express 5 |
| Database | MongoDB + Mongoose 9 (replica set required for transactions) |
| Cache, locks, queues | Redis (`redis` client), BullMQ (`ioredis`) |
| Validation | Zod, `znv` (environment variables) |
| Money | `dinero.js` with BigInt minor units |
| Payments | Paystack |
| Email | Nodemailer, React Email |
| Auth | `jsonwebtoken`, `bcrypt` |
| Logging & security | Winston, Morgan, Helmet, `express-mongo-sanitize` |
| Testing | `node:test`, Supertest, `mongodb-memory-server` |
| Containers | Docker, Docker Compose |

## Prerequisites

Choose one of:

- **Docker** (recommended): [Docker Desktop](https://www.docker.com/products/docker-desktop/). MongoDB and Redis run in containers, so nothing else needs installing.
- **Local setup**: Node.js 24+, a MongoDB **replica set** (e.g. MongoDB Atlas or a local single-node replica set) and a Redis server.

> MongoDB transactions only work on a replica set. A standalone `mongod` fails with *"Transaction numbers are only allowed on a replica set member"*.

## Environment Variables

Create a `.env` file in the project root:

```env
PORT=8000
MONGODB_URI=mongodb://localhost:27017/express-money-transfer?replicaSet=rs0
REDIS_URL=redis://localhost:6379

JWT_SECRET=change-me

PAYSTACK_TEST_PUBLIC_KEY=pk_test_xxx
PAYSTACK_TEST_SECRET_KEY=sk_test_xxx

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
```

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | No (default `8000`) | HTTP port |
| `MONGODB_URI` | Yes | MongoDB connection string (must point at a replica set) |
| `REDIS_URL` | Yes | Redis connection for idempotency, locks, Pub/Sub and BullMQ |
| `JWT_SECRET` | Strongly recommended | Secret for signing JWTs. Falls back to an insecure default if unset. |
| `PAYSTACK_TEST_PUBLIC_KEY` / `PAYSTACK_TEST_SECRET_KEY` | Yes | Paystack API keys. The secret key also verifies webhook signatures. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Yes | SMTP server for transfer notification emails |

Environment variables are validated at startup in [config/env.js](config/env.js). The app refuses to start if a required value is missing.

## Running with Docker (recommended)

```bash
docker compose up --build -d     # build the API image and start API, MongoDB and Redis
docker compose logs -f api       # follow the API logs
```

The API is available at `http://localhost:8000`.

Inside Compose, `MONGODB_URI` and `REDIS_URL` are overridden to use the service hostnames (`mongo`, `redis`), so your `.env` can keep its `localhost` values for local development. MongoDB starts as a single-node replica set (`rs0`) and initialises itself on first boot through its healthcheck, so transactions work with no extra setup.

| Command | Purpose |
|---|---|
| `docker compose exec api npm run migrate:up` | Apply database migrations |
| `docker compose exec api npm run seed` | Seed admins and users |
| `docker compose ps` | Show container status and health |
| `docker compose down` | Stop the stack (data is kept in volumes) |
| `docker compose down -v` | Stop the stack and delete all MongoDB/Redis data |

To connect MongoDB Compass from your machine, use `mongodb://localhost:27017/?directConnection=true`.

## Running Locally (without Docker)

```bash
npm install
npm run migrate:up   # apply migrations
npm run seed         # optional: seed admins and users
npm run watch        # start with auto-restart on file changes
# or
npm start
```

## Seed Data

`npm run seed` creates two admins and a user login for every existing account. All seeded passwords are `123456`.

| Email | Role |
|---|---|
| `admin1@email.com` | admin |
| `admin2@email.com` | admin |

## Authentication

Protected endpoints expect a bearer token:

```
Authorization: Bearer <jwt>
```

Get a token from `POST /api/v1/auth/login` (or `/auth/signup`).

## API Endpoints

All routes are prefixed with `/api/v1`. Amounts in request bodies are integer **minor units** (e.g. `50000` = 500.00).

### Auth — `/api/v1/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/signup` | Public | Register a user and create a linked account (random starting balance unless `balance` is given) |
| POST | `/login` | Public | Log in as a user or admin and receive a JWT |
| POST | `/token` | Public | Issue a token for testing. **Development only.** |
| GET | `/me` | Any authenticated | Get the current user's profile |

```json
// POST /signup
{ "name": "John Doe", "email": "john@example.com", "password": "secret123" }

// POST /login
{ "email": "admin1@email.com", "password": "123456", "role": "admin" }
```

### Accounts — `/api/v1/accounts`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | admin, superadmin | List accounts (`page`, `limit` query params) |
| GET | `/:id` | user, admin, superadmin | Get an account by ID |
| POST | `/` | Public | Create an account |
| PATCH | `/:id` | user | Update an account (`name`, `email`, `balance`) |
| DELETE | `/:id` | user | Soft-delete an account |

```json
// POST /
{ "name": "John Doe", "email": "john@example.com", "balance": 500000, "userId": "<user-id>" }
```

### Internal Transfers — `/api/v1/transfers`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | user | Transfer between two accounts. **Requires `X-Idempotency-Key` header.** |
| GET | `/` | user, admin, superadmin | List transfers (`page`, `limit`) |
| GET | `/:id` | user, admin, superadmin | Get a transfer by ID |

```http
POST /api/v1/transfers
Authorization: Bearer <jwt>
X-Idempotency-Key: 3f1c9a2e-7b44-4d0e-9a51-1c2d3e4f5a6b
Content-Type: application/json

{ "fromAccountId": "<source-id>", "toAccountId": "<destination-id>", "amountMinor": 50000 }
```

`fromAccountId` and `toAccountId` must differ. Responses render amounts in both major (`500.00 USD`) and minor (`50000 USDMINOR`) form.

### External Transfers (Paystack) — `/api/v1/transfers/external`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/resolve-account` | user, admin, superadmin | Look up a bank account's name (`accountNumber`, `bankCode` query params) |
| POST | `/` | user | Pay out to a bank account. **Requires `X-Idempotency-Key` header.** |
| GET | `/` | user, admin, superadmin | List external transfers (`page`, `limit`) |
| GET | `/:id` | user, admin, superadmin | Get an external transfer |
| GET | `/:id/status` | user, admin, superadmin | Re-check a pending transfer with Paystack and settle or refund it |

```json
// POST /
{
  "fromAccountId": "<source-id>",
  "amountMinor": 100000,
  "recipientAccountNumber": "0123456789",
  "recipientBankCode": "058",
  "recipientName": "Jane Doe",
  "reason": "Rent"
}
```

`amountMinor` must be at least `100`, and `recipientAccountNumber` must be exactly 10 digits.

**Lifecycle:** `PENDING` → `PROCESSING` → `COMPLETED`, or `FAILED` / `REVERSED` with the reserved funds refunded to the sender.

1. The amount is debited from the sender's balance inside a transaction, and an Outbox entry is recorded.
2. The payout is sent to Paystack. If Paystack rejects it straight away, the funds are refunded.
3. After a short settlement window (~2s), the service checks the transfer status with Paystack and settles it if the result is final.
4. Anything still pending is resolved later by the Paystack webhook or by calling `GET /:id/status`.

### Webhooks — `/api/v1/webhooks`

| Method | Path | Description |
|---|---|---|
| POST | `/paystack` | Paystack event receiver (`transfer.success`, `transfer.failed`, `transfer.reversed`) |

Requests are verified using the `x-paystack-signature` header (HMAC-SHA512 of the raw body with your Paystack secret key). Each reference is processed only once, even if Paystack sends the event again. To receive webhooks locally, expose the server with a tunnel such as ngrok.

### Admin — `/api/v1/admin`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/stats` | admin | System statistics (accounts, transfers) |
| GET | `/transfers` | admin | Paginated audit of all transfers (`page`, `limit`, default 20) |

### Error Format

Errors are returned as JSON with an appropriate status code:

```json
{ "error": "Insufficient funds", "details": { "fromBalance": "1000", "transferAmount": "50000" } }
```

| Status | Meaning |
|---|---|
| 400 | Validation error or insufficient funds |
| 401 / 403 | Missing or invalid token / insufficient role |
| 404 | Resource not found |
| 409 | A request with the same idempotency key is still being processed. Retry shortly. |
| 422 | Idempotency key reused with a different request body |
| 503 | A temporary error. Retry. |

## Project Structure

```
├── app.js                  # Express app, global middleware, error handler, shared Redis client
├── server.js               # Entry point: connects MongoDB and starts the HTTP server
├── config/                 # Env validation, MongoDB, Redis, BullMQ, Paystack, SMTP, logger
├── routes/                 # Route definitions (auth, accounts, transfers, external, webhooks, admin)
├── request-schemas/        # Zod validators + schemaMiddleware factory
├── response-schema/        # Response transformers (money formatting, field stripping)
├── controllers/            # Curried HTTP handlers with injected services
├── services/               # Business logic, transactions, idempotency
├── gateways/
│   ├── paystack/           # Paystack transfer adapter
│   └── react-email/        # Email template + Nodemailer sender
├── events/
│   ├── bullmq/             # Notification queue producer & worker
│   ├── pub/                # Redis Pub/Sub publishers
│   └── sub/                # Redis Pub/Sub subscribers
├── models/                 # Mongoose models built on baseSchema
├── middlewares/            # authenticate, authorize, requestId, responseTime, idempotency
├── common/                 # Domain exceptions, money value object
├── util/                   # Idempotency primitives (locks, fingerprints, Redis keys)
├── migrations/             # migrate-mongo migrations
├── tests/                  # Integration, e2e and unit tests
├── Dockerfile              # Multi-stage production image
└── docker-compose.yml      # API + MongoDB replica set + Redis
```

## Testing

```bash
npm test
```

- Uses Node's built-in test runner (`node:test`).
- **Unit tests** (`tests/unit/`) inject mocked models and services. No database is needed.
- **Integration and e2e tests** (`tests/*.test.js`, `tests/e2e/`) make real HTTP calls against an in-memory MongoDB replica set (`mongodb-memory-server`). They also need a reachable Redis at `REDIS_URL` (default `redis://localhost:6379`). You can start one with `docker compose up -d redis`.

## Database Migrations

This project uses [`migrate-mongo`](https://github.com/seppevs/migrate-mongo) with native ES Modules for versioned, production-safe database migrations.

### Available Migration Commands

```bash
# Check status of applied vs pending migrations
npm run migrate:status

# Apply all pending migrations (up)
npm run migrate:up

# Rollback the last applied migration (down)
npm run migrate:down

# Create a new migration file in migrations/
npm run migrate:create <migration-name>
```

### Best Practices for MongoDB Migrations

1. **Idempotency**: Always write migrations so they can run multiple times safely without producing duplicate updates or errors (e.g. query with `{ field: { $exists: false } }`).
2. **Batch Processing with Cursors**: Avoid `find()` loading all documents into memory. Use `.cursor().batchSize(500)` and `collection.bulkWrite()` for memory-safe updates.
3. **Schema Versioning**: Models inherit `schemaVersion` from `models/basePlugin.js`. Increment or check this field when migrating documents.
