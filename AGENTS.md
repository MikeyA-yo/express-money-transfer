# AGENTS.md — Engineering Architecture & Contribution Playbook

This document serves as the single source of truth for all software engineers and AI agents working on the **Express Money Transfer** codebase. It outlines the architectural design, non-negotiable coding conventions, feature implementation workflows, and recommended patterns for external integrations (such as Paystack and Flutterwave).

---

## 1. System Architecture Overview

The application follows a strictly decoupled, layered architecture:

```
                  ┌─────────────────────────────────────────┐
                  │             HTTP Client                 │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │        Security & Global Middleware     │
                  │ (Helmet, Morgan, MongoSanitize, CORS)   │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │       Route Definition & Schemas        │
                  │  (routes/*.js, request-schemas/*.js)    │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │         Auth & Role Middleware          │
                  │  (authenticate, requireRole / Roles)    │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │               Controllers               │
                  │   (controllers/*.js — DI via Currying)  │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │             Service Layer               │
                  │ (services/*.js — Core Business Logic)   │
                  └──────┬───────────────────────────┬──────┘
                         │                           │
                         ▼                           ▼
        ┌────────────────────────────────┐  ┌────────────────────────────────┐
        │        MongoDB Database        │  │          Redis Cache           │
        │  • Atomic Mongoose Operations  │  │  • Distributed Mutex Locks     │
        │  • Multi-doc Transactions      │  │  • Idempotency Deduplication   │
        │  • Dinero / Minor-Unit Money   │  │  • Cached API Responses        │
        └────────────────────────────────┘  └────────────────────────────────┘
```

### Layer Responsibilities

1. **Routes (`routes/*.js`)**: Map URI endpoints, attach schema validation middlewares, and apply authentication/authorization policies.
2. **Request Schemas (`request-schemas/*.schema.js`)**: Zod-based validators for request `body`, `params`, `query`, and `headers`.
3. **Response Schemas (`response-schema/*.js`)**: DTO formatters and response transformers. Formats domain models into standardized external API response representations (e.g., rendering minor units to currency strings, formatting timestamps).
4. **Controllers (`controllers/*.js`)**: Curried handlers receiving injected services. Unpack validated HTTP input, call domain services, log contextual events, and return HTTP status codes.
5. **Gateways (`gateways/<provider>/*.js`)**: External integration adapters (Paystack, Flutterwave). Abstract network requests, SDK details, and external API quirks behind consistent local domain interfaces.
6. **Services (`services/*.js`)**: Pure domain business logic. Manages transactions, distributed locks, database calls, and throws domain exceptions.
7. **Domain Exceptions (`common/domain-exceptions/`)**: Typed, operational HTTP exceptions (`BadRequestError`, `NotFoundError`, `InsufficientFundsError`, `ConflictError`, etc.).
8. **Models (`models/*.js`)**: Mongoose schemas built on `baseSchema(schema)` with soft deletion, UUID/nanoid strings, and BigInt minor-unit balances.
9. **Cache / Idempotency (`util/idempotency.js`, `config/cache.js`)**: Distributed locking and 24-hour response caching for idempotent state-changing operations.

---

## 2. Non-Negotiable Engineering Rules & Conventions

### Rule 1: Explicit Compulsory Parameters vs. Options
- **Mandatory parameters must be explicit positional arguments** in function signatures.
- **Never bury compulsory parameters inside an `options` object with loose fallbacks.**
  - ❌ **Forbidden:**
    ```javascript
    export async function createAccount(name, email, balance, options = {}) {
      const userId = options.userId || id; // Anti-pattern!
    }
    ```
  - ✅ **Mandatory Standard:**
    ```javascript
    export async function createAccount(name, email, balance, userId, options = {}) {
      // userId is compulsory and explicit
    }
    ```
- The `options` parameter is strictly reserved for optional configurations and dependency injection (e.g. `{ Account = models.Account, session }`).

---

### Rule 2: Schema-First Validation (Zod)
- Every incoming HTTP parameter must be validated before reaching a controller.
- If a parameter is required in a service or model, it **must be strictly required in its Zod schema**.
- Use schema refinements for business invariants (e.g., verifying `fromAccountId !== toAccountId`).
- Validate headers (e.g. `X-Idempotency-Key`) via `schemaMiddleware(transferHeaders, "headers")`.

---

### Rule 3: Monetary Calculations & Atomic Ledger Updates
- **Minor Units Only**: Balances and transaction amounts are stored as integers/`BigInt` minor units (e.g., cents or kobo, never floating-point decimals).
- **Format Presentation**: Use `common/money-value-object/index.js` to render major (`100.00 USD`) and minor (`10000 USDMINOR`) strings on API outputs.
- **Race Condition Prevention (Atomic `$inc`)**:
  - **Never** perform a Read-Modify-Write pattern on monetary balances:
    - ❌ `account.balance -= amount; await account.save()`
  - **Always** use MongoDB atomic operators (`$inc`, `$gte`) inside transaction sessions:
    ```javascript
    // Atomically debit sender only if sufficient balance exists
    const fromRes = await Account.updateOne(
      { id: fromAccountId, balance: { $gte: BigInt(amount) } },
      { $inc: { balance: -BigInt(amount) } },
      { session }
    );
    if (fromRes.modifiedCount === 0) {
      throw InsufficientFundsError("Insufficient funds", { ... });
    }

    // Atomically credit recipient
    const toRes = await Account.updateOne(
      { id: toAccountId },
      { $inc: { balance: BigInt(amount) } },
      { session }
    );
    if (toRes.modifiedCount === 0) {
      throw NotFoundError("Account not found", { ... });
    }
    ```

---

### Rule 4: Domain Exceptions Hierarchy
- Never throw generic JavaScript `Error` objects or return raw HTTP status numbers from service layers.
- Always instantiate and throw domain errors from [`common/domain-exceptions/domain-exceptions.js`](file:///c:/Users/PROGRESSIVE/Desktop/express-money-transfer/common/domain-exceptions/domain-exceptions.js):
  - `BadRequestError` (400)
  - `UnauthorizedError` (401)
  - `ForbiddenError` (403)
  - `NotFoundError` (404)
  - `ConflictError` (409) — e.g. concurrent idempotent lock contention
  - `UnprocessableEntityError` (422) — e.g. idempotency key fingerprint mismatch
  - `InsufficientFundsError` (400)

---

### Rule 5: Two-Phase Idempotency & Distributed Locking
State-changing financial operations (transfers, deposits, payouts) must implement the following 6-step lifecycle:
1. **Check existing record in Redis**:
   - If `status === "COMPLETED"`: Compare request fingerprint. If matching, return cached response immediately; if mismatched, throw `UnprocessableEntityError`.
   - If `status === "PENDING"`: Throw `ConflictError` ("Request currently being processed. Please retry shortly").
2. **Acquire Mutex Lock**: Call `acquireLock(client, lockKey, ttlSeconds)`. If false, throw `ConflictError`.
3. **Record PENDING State**: Write `{ status: "PENDING", fingerprint, createdAt }` with TTL to Redis.
4. **Execute Core Transaction**: Open Mongoose session with `session.withTransaction(...)` and execute atomic ledger operations.
5. **Persist COMPLETED Response**: Store `{ status: "COMPLETED", fingerprint, response }` in Redis (24-hour TTL).
6. **Error & Lock Cleanup**:
   - In `catch`: Delete the `PENDING` Redis record so clients can retry safely.
   - In `finally`: Always release the distributed lock (`releaseLock(client, lockKey)`).

---

### Rule 6: Controller Structure & Dependency Injection
- Controllers must use higher-order functions (currying) with default parameter injection for service dependencies:
  ```javascript
  export const createTransferHandler = ({ newTransfer = transferService.newTransfer } = {}) => async (req, res) => {
    // 1. Extract validated inputs
    // 2. Delegate to service
    // 3. Log audit info
    // 4. Return HTTP status
  };
  ```
- This pattern allows unit tests to test controllers in complete isolation without complex mocking libraries.

---

### Rule 7: Models & `baseSchema`
- All models must wrap their schemas using `baseSchema` ([`models/basePlugin.js`](file:///c:/Users/PROGRESSIVE/Desktop/express-money-transfer/models/basePlugin.js)):
  ```javascript
  accountSchema = baseSchema(accountSchema, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  });
  ```
- `baseSchema` automatically adds:
  - `id`: Unique string identifier
  - `deleted`: Boolean for soft deletions
  - `schemaVersion`: Integer tracking schema migrations
- Use Mongoose `virtual` fields for relational references rather than embedding foreign IDs across both sides.

---

### Rule 8: Testing Organization
- Test runner: Native Node.js runner (`node:test` + `node:assert/strict`).
- **Structure**: One large `describe` block per controller / service / integration suite, with descriptive `it` blocks underneath.
- Unit tests (`tests/unit/*.test.js`) must mock database sessions and models accurately.
- Integration tests (`tests/*.test.js`, `tests/e2e/*.test.js`) execute real HTTP queries with an in-memory replica set (`MongoMemoryReplSet`) to test genuine database transactions.

---

### Rule 9: Reusable Micro-Units & Factory Utilities (Avoid Monolithic Wrappers)
- **Always construct small, single-purpose, composable micro-units instead of monolithic black-box functions.**
- When creating utilities, middlewares, or domain helpers, design them so they can be flexibly plugged into different execution paths without trapping business logic inside rigid wrapper callbacks.
- **Core Design Patterns in this Codebase**:
  1. **Configurable Middleware Factories**:
     - Examine `schemaMiddleware` in [`request-schemas/index.js`](file:///c:/Users/PROGRESSIVE/Desktop/express-money-transfer/request-schemas/index.js):
       ```javascript
       export const schemaMiddleware = (schema, options = 'body') => (req, res, next) => {
         const dataToValidate = options === 'headers' ? req.headers : req[options];
         const parsed = schema.parse(dataToValidate);
         req.validatedData = { ...req.validatedData, ...parsed };
         next();
       };
       ```
       Instead of creating distinct, rigid middlewares for every input source, a single factory accepts the schema and target string (`'body' | 'params' | 'query' | 'headers'`), producing reusable, pluggable units across all route chains.
  2. **Modular Primitives vs. Monolithic Callback Wrappers**:
     - Previously, a monolithic `idempotent(key, userId, body, fn, options)` function wrapped execution in a single black-box callback. This was intentionally scrapped because it obscured control flow, hindered granular error handling, and tightly coupled business logic to the runner.
     - It was decomposed into discrete, pluggable micro-units in [`util/idempotency.js`](file:///c:/Users/PROGRESSIVE/Desktop/express-money-transfer/util/idempotency.js):
       - `acquireLock(client, lockKey, ttl)`
       - `releaseLock(client, lockKey)`
       - `fingerprint(payload)`
       - `createRedisKey(type, userId, key)`
       - `createRedisLockKey(type, userId, key)`
       - `get(client, key)` / `set(client, key, val, options)` / `del(client, key)`
     - Any service, webhook handler, or payout queue can compose these atomic primitives exactly as needed.
  3. **Higher-Order Functions & Currying**:
     - Prefer currying and factory functions for dependency injection and parameterization. Micro-units stay pure, easily mockable, and testable in total isolation.

---

### Rule 10: Response Schemas & Presentation Transformers (`response-schema/`)
- **Never embed response formatting or transformation logic inside services or controllers.**
- All response mapping and DTO transformer functions (e.g., `toExternalTransferResponse`, `toExternalTransfersResponse`) belong strictly in [`response-schema/`](file:///c:/Users/PROGRESSIVE/Desktop/express-money-transfer/response-schema/index.js).
- **Why this separation matters**:
  - Services must remain focused on pure business logic and domain entities (database transactions, balance mutations, external API calls).
  - Response schemas own presentation concerns: translating `BigInt` minor units to major formatted strings (`toMajorFormat`), formatting ISO timestamps, stripping internal system fields (`__v`, `deleted`), and providing uniform API contracts across different consumers.
- Services should import and re-export or reference transformer helpers from `response-schema/`, keeping the domain decoupled from presentation structures.

---

### Rule 11: Centralized Redis Client & Circular Dependency Prevention
- **Never instantiate separate Redis connections** via `getRedisClient()` directly inside domain services or background handlers.
- **Consume the Centralized Client from [`app.js`](file:///c:/Users/PROGRESSIVE/Desktop/express-money-transfer/app.js)**:
  - [`app.js`](file:///c:/Users/PROGRESSIVE/Desktop/express-money-transfer/app.js) exports a shared, globally connected `redisClient` promise:
    ```javascript
    export const redisClient = getRedisClient().then((client) => {
      logger.info("Connected to Redis");
      return client;
    }).catch((err) => {
      logger.error("Failed to connect to Redis:", err);
      process.exit(1);
    });
    ```
- **Preventing ES Module Circular Dependency Deadlocks**:
  - In our layered architecture: `app.js` -> `routes/` -> `controllers/` -> `services/`.
  - Adding a top-level static `import { redisClient } from '../app.js'` in a service file creates an ES module cycle. Because `routes/` immediately executes controller factory functions at module evaluation time (`resolveAccountHandler()`), referencing exports while `app.js` is still in the evaluation queue causes a **Temporal Dead Zone (TDZ) ReferenceError**.
  - **The Solution**: Services must resolve Redis dynamically or lazily at runtime, while still allowing dependency injection in unit tests:
    ```javascript
    async function resolveRedis(injectedRedis) {
        if (injectedRedis !== undefined) {
            return injectedRedis;
        }
        try {
            const { redisClient } = await import('../app.js');
            return await redisClient;
        } catch {
            const { getRedisClient } = await import('../util/idempotency.js');
            return await getRedisClient();
        }
    }
    ```
  - This ensures that by the time any HTTP request or worker reaches `resolveRedis`, `app.js` is fully initialized and exports the ready `redisClient`.

---

### Rule 12: External Gateway Settlement: Webhooks vs. Polling & Status Endpoints
- **Never rely exclusively on incoming webhooks for transaction finality**:
  - In local development, testing sandboxes, or during transient network/firewall outages, webhook delivery may be disabled, delayed, or fail to reach the server.
- **Dual-Verification Strategy**:
  1. **Immediate Auto-Settlement at Initiation**:
     - When initiating an external payout (`POST /api/v1/transfers/external`), wait a brief window (e.g. `settlementDelayMs = 2000`) and query the gateway status immediately. If Paystack/Flutterwave has already settled the transfer (`success` or `failed`), transition the transaction state and execute any necessary ledger refunds without waiting for a webhook.
  2. **Dedicated Real-Time Status Endpoint**:
     - Expose a dedicated status endpoint (`GET /api/v1/transfers/external/:id/status`).
     - If the transfer is still `PENDING`, this endpoint queries the gateway API directly (`verifyTransfer(reference)`), updates the record in MongoDB, and triggers atomic balance refunds if the gateway reported a failure.
     - Enforce ownership and authorization checks: users can only check their own transfers; admins can check any transfer.
  3. **Gateway Specifics (e.g., Paystack Finalize vs. Verify)**:
     - `POST /transfer/finalize_transfer` is strictly an OTP submission endpoint for live transfers where OTP is enabled. It is NOT for status querying.
     - Status checks must always call `GET /transfer/verify/:reference`.

---

## 3. Step-by-Step Guide: Adding a New Feature

When adding any new domain feature (e.g. Account Cards, Beneficiaries, Statements, External Payouts), follow this structured workflow:

### Step 1: Define the Model
- File: `models/<feature>.js`
- Build schema with types, pre-validation checks, and wrap with `baseSchema`.
- Export model: `export default mongoose.models.<Feature> || mongoose.model('<Feature>', schema);`

### Step 2: Define Request Schemas (Validation)
- File: `request-schemas/<feature>.schema.js`
- Create schemas for body (`create<Feature>Schema`), query parameters (`list<Feature>Query`), route parameters (`featureParams`), and headers (`transferHeaders`) if needed.
- Export in `request-schemas/index.js`.

### Step 3: Define Response Schemas & Transformers (Presentation)
- File: `response-schema/index.js` (or `response-schema/<feature>.schema.js`)
- Write transformer functions (e.g., `to<Feature>Response`, `to<Feature>sResponse`) to standardize API payloads, format `BigInt` currency fields into major/minor representations, and strip internal database fields.

### Step 4: Implement Domain Exceptions (if needed)
- File: `common/domain-exceptions/domain-exceptions.js`
- Add any domain-specific exceptions using `createErrorType` if standard errors are insufficient.

### Step 5: Implement Gateway Adapters (for External Integrations)
- File: `gateways/<provider>/<feature>.js`
- Isolate external API calls (e.g. Paystack, Flutterwave) behind clean domain methods (`resolveAccount`, `initiateTransfer`, `verifyTransfer`).
- Never leak provider-specific HTTP headers or raw error structures into controllers or services.

### Step 6: Implement the Service Layer
- File: `services/<feature>.js`
- Ensure all compulsory parameters are explicit positional arguments.
- Pass model, gateway, and client dependencies in the trailing `options` object.
- Resolve Redis via lazy `resolveRedis` helper to prevent circular module evaluation deadlocks.
- If modifying ledger balances, open a Mongoose transaction and execute atomic `$inc` updates.
- If mutating state, wrap or integrate with the Redis lock & idempotency pattern.

### Step 7: Implement the Controller
- File: `controllers/<feature>.js`
- Curried handler with default service injection.
- Unpack validated inputs, call service, log success with correlation identifiers, and return appropriate HTTP status (201 for creation, 200 for queries, 204 for deletions).

### Step 8: Define Routes & Wire API
- File: `routes/<feature>.js`
- Chain middlewares: `schemaMiddleware` -> `authenticate()` -> `requireRoles()` -> controller handler.
- Mount router in [`routes/index.js`](file:///c:/Users/PROGRESSIVE/Desktop/express-money-transfer/routes/index.js) under `/api/v1/<feature>`.

### Step 9: Write Tests
- **Unit Tests**: `tests/unit/<feature>.service.test.js` & `tests/unit/<feature>.controller.test.js` (test happy paths, validation failures, concurrency edge cases, insufficient funds).
- **Integration Tests**: `tests/<feature>.test.js` (test routes end-to-end via `supertest`, headers, and auth tokens).

---

## 4. Architectural Design: Integrating Payment Gateways (Paystack & Flutterwave)

Payment gateways like **Paystack** and **Flutterwave** involve two distinct financial flows:
1. **Inflow (Deposits / Top-ups)**: Moving funds from an external card/bank account into the user's ledger account.
2. **Outflow (Withdrawals / Payouts)**: Moving funds from the user's ledger account to an external commercial bank account.

### Recommended Architectural Pattern: Adapter / Strategy Pattern

Do not couple controllers or business logic directly to Paystack or Flutterwave SDKs. Implement a unified payment gateway interface:

```
                          ┌───────────────────────────┐
                          │   Deposit / Payout Service│
                          └─────────────┬─────────────┘
                                        │
                                        ▼
                          ┌───────────────────────────┐
                          │  Payment Gateway Adapter  │
                          │        (Interface)        │
                          └──────┬─────────────┬──────┘
                                 │             │
                    ┌────────────┘             └────────────┐
                    ▼                                       ▼
        ┌───────────────────────┐               ┌───────────────────────┐
        │   PaystackGateway     │               │   FlutterwaveGateway  │
        │ • initializePayment() │               │ • initializePayment() │
        │ • verifyPayment()     │               │ • verifyPayment()     │
        │ • initiatePayout()    │               │ • initiatePayout()    │
        │ • verifyWebhook()     │               │ • verifyWebhook()     │
        └───────────────────────┘               └───────────────────────┘
```

---

### Inflow (Deposit / Account Funding) Lifecycle

```
1. Client POST /api/v1/payments/deposit/initialize
   ├── Validate body: { accountId, amountMinor, currency, paymentMethod }
   ├── Verify user owns accountId
   ├── Create Deposit record in DB: status = "PENDING", reference = nanoid()
   ├── Call Gateway Adapter: initializePayment({ email, amountMinor, reference, callbackUrl })
   └── Return { authorizationUrl, reference } to Client (HTTP 200)

2. Customer Completes Payment on Provider Hosted Checkout / USSD / Card

3. Provider Webhook Dispatch -> POST /api/v1/webhooks/paystack (or /flutterwave)
   ├── Verify Webhook HMAC Signature using raw request body
   ├── Check Redis Idempotency Lock on event.id / data.reference
   ├── If payment SUCCESS:
   │   ├── Open Mongoose Transaction:
   │   │   ├── Find Deposit record by reference (must be PENDING)
   │   │   ├── Atomically increment account balance:
   │   │   │   Account.updateOne({ id: deposit.accountId }, { $inc: { balance: deposit.amount } }, { session })
   │   │   ├── Update Deposit record: status = "SUCCESS", externalId, paidAt
   │   │   └── Create Audit/Ledger Transaction record
   │   └── Cache event as PROCESSED in Redis
   └── Return HTTP 200 OK immediately to Provider
```

#### Inflow Fallback (Reconciliation)
Webhooks can occasionally fail due to network partitions. Implement a reconciliation endpoint:
- `POST /api/v1/payments/deposit/verify/:reference`
- Queries the provider's verification endpoint (`/transaction/verify/:reference`), verifies the status, and credits the account atomically if not yet processed.

---

### Outflow (Withdrawal / Payout) Lifecycle

Outflows carry high financial risk because money leaves the ecosystem into a commercial bank. The operation must be two-phase:

```
1. Client POST /api/v1/payments/withdraw
   ├── X-Idempotency-Key required in headers
   ├── Validate body: { accountId, amountMinor, bankCode, accountNumber, recipientName }
   ├── Verify user owns accountId
   ├── Open Mongoose Transaction (Phase 1: Reserve Funds):
   │   ├── Atomically debit account balance:
   │   │   Account.updateOne(
   │   │     { id: accountId, balance: { $gte: BigInt(amountMinor) } },
   │   │     { $inc: { balance: -BigInt(amountMinor) } },
   │   │     { session }
   │   │   )
   │   │   (Throw InsufficientFundsError if modifiedCount === 0)
   │   └── Create Withdrawal record: status = "PENDING", reference = nanoid()
   │
   ├── Phase 2: External Dispatch
   │   ├── Call Gateway Adapter: initiatePayout({ amountMinor, bankCode, accountNumber, reference })
   │   └── If Gateway rejects synchronously:
   │       ├── Open Refund Transaction:
   │       │   Account.updateOne({ id: accountId }, { $inc: { balance: BigInt(amountMinor) } }, { session })
   │       └── Update Withdrawal record: status = "FAILED", reason = err.message
   │
   └── Return Withdrawal Details (status: "PENDING")

2. Provider Webhook Resolution -> POST /api/v1/webhooks/paystack
   ├── Case A: transfer.success -> Update Withdrawal record: status = "SUCCESS"
   └── Case B: transfer.failed / transfer.reversed ->
       ├── Open Mongoose Transaction:
       │   ├── Atomically refund user balance:
       │   │   Account.updateOne({ id: accountId }, { $inc: { balance: BigInt(amountMinor) } }, { session })
       │   └── Update Withdrawal record: status = "REFUNDED" / "FAILED"
       └── Log alert for audit tracking
```

---

### Critical Security & Webhook Rules for Gateways

1. **Raw Body for HMAC Verification**:
   - Webhooks from Paystack use `x-paystack-signature` (HMAC SHA512 of the request body with `PAYSTACK_SECRET_KEY`).
   - Webhooks from Flutterwave use `verif-hash` (secret verification hash).
   - Ensure the Express JSON parser preserves the raw buffer:
     ```javascript
     app.use(express.json({
       verify: (req, res, buf) => {
         req.rawBody = buf;
       }
     }));
     ```
2. **Never Trust Client-Side Redirects**:
   - Never credit an account based on a browser query parameter (e.g. `?trxref=...&reference=...`).
   - Only credit accounts after cryptographic webhook signature validation or direct server-to-server verification.
3. **Webhook Idempotency**:
   - Gateways resend webhooks if the server doesn't respond with 200 OK within 5–10 seconds.
   - Always lock on `reference` in Redis to prevent processing the same webhook event multiple times.
4. **Explicit Compulsory Positional Parameters in Webhook Handlers**:
   - As in [`services/webhook.js`](file:///c:/Users/PROGRESSIVE/Desktop/express-money-transfer/services/webhook.js), webhook processing functions must require payload, signature, and rawBody as positional parameters:
     ```javascript
     export async function handlePaystackWebhook(
         eventPayload,
         signature,
         rawBody,
         {
             Account = models.Account,
             ExternalTransfer = models.ExternalTransfer,
             secretKey,
             redis
         } = {}
     )
     ```
   - This prevents silent undefined errors or accidental parameter omission.
5. **Gateway Absence Fallback (Testing & Sandboxes)**:
   - Because webhooks cannot reach localhost without a tunnel (like ngrok) and may be disabled in test environments, never build features that stall indefinitely waiting for a webhook. Always provide an auto-settlement query window at creation and an on-demand status verification endpoint (`GET /:id/status`).
6. **Paystack Endpoint Distinctions**:
   - `POST /transfer/finalize_transfer`: Exclusively for submitting OTPs when OTP protection is turned on for transfers.
   - `GET /transfer/verify/:reference`: Used for checking the real-time status of any transfer.

