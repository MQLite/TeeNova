# Online Payment — Production Configuration Checklist

**Project:** TeeNova / Otahuhu Printing Shop  
**Phase:** 12D-10 (Jira 7028)  
**Date:** 2026-05-25  
**Architecture:** Multi-provider hosted payment (Stripe · Windcave · POLi · PayPal)

---

## Table of Contents

1. [Environment Configuration](#1-environment-configuration)
2. [Secret Management](#2-secret-management)
3. [Provider-Specific Future Configuration](#3-provider-specific-future-configuration)
4. [Webhook URLs](#4-webhook-urls)
5. [Frontend Return URLs](#5-frontend-return-urls)
6. [Deployment Validation Checklist](#6-deployment-validation-checklist)
7. [Known Issues to Resolve Before Real-Provider Go-Live](#7-known-issues-to-resolve-before-real-provider-go-live)
8. [Production Readiness Decision Checklist](#8-production-readiness-decision-checklist)
9. [Out of Scope](#9-out-of-scope)

---

## 1. Environment Configuration

The `OnlinePayments` block in `appsettings.json` (or injected via environment variables / secrets manager at deployment time) controls all online payment behaviour.

### 1.1 Required Keys

| Key | Type | Dev (mock) value | Production value |
|-----|------|-----------------|-----------------|
| `OnlinePayments:Enabled` | `bool` | `true` | `true` |
| `OnlinePayments:UseMockProviders` | `bool` | `true` | **`false`** |
| `OnlinePayments:DefaultProvider` | `string` | `"Stripe"` | Provider name matching a configured, enabled provider |
| `OnlinePayments:Currency` | `string` | `"NZD"` | `"NZD"` (or ISO-4217 code for the store currency) |
| `OnlinePayments:SuccessReturnBaseUrl` | `string` | `http://localhost:3000/checkout/success` | `https://<production-domain>/checkout/success` |
| `OnlinePayments:CancelReturnBaseUrl` | `string` | `http://localhost:3000/checkout/success` | `https://<production-domain>/checkout/success` (or a dedicated cancel page) |
| `OnlinePayments:Providers:Stripe:Enabled` | `bool` | `true` | `true` / `false` per which providers are contracted |
| `OnlinePayments:Providers:Windcave:Enabled` | `bool` | `true` | `true` / `false` |
| `OnlinePayments:Providers:Poli:Enabled` | `bool` | `true` | `true` / `false` |
| `OnlinePayments:Providers:PayPal:Enabled` | `bool` | `true` | `true` / `false` |

### 1.2 Critical Production Switches

- **`UseMockProviders` MUST be `false` in production.** Mock providers create fake sessions, never charge the customer, and never validate webhook signatures.
- **`SuccessReturnBaseUrl` MUST be the HTTPS production domain.** The backend appends `?orderId=&orderNumber=` to this URL. If the URL is wrong, the customer lands on a broken page after checkout.
- **`CancelReturnBaseUrl` MUST be HTTPS.** Payment providers will refuse to redirect to non-HTTPS cancel URLs.
- Only enable provider entries for providers that have been fully configured with real credentials (see Section 3). A provider with `Enabled: true` but missing credentials will throw at session-creation time.

### 1.3 appsettings.json Placeholder Policy

`appsettings.json` (committed to source control) must contain only placeholders:

```json
{
  "OnlinePayments": {
    "Enabled": false,
    "UseMockProviders": true,
    "DefaultProvider": "",
    "Currency": "NZD",
    "SuccessReturnBaseUrl": "#{REPLACE_WITH_SUCCESS_URL}#",
    "CancelReturnBaseUrl": "#{REPLACE_WITH_CANCEL_URL}#",
    "Providers": {
      "Stripe":   { "Enabled": false },
      "Windcave": { "Enabled": false },
      "Poli":     { "Enabled": false },
      "PayPal":   { "Enabled": false }
    }
  }
}
```

Real values are injected via `appsettings.Production.json` (gitignored), environment variables, or a secrets manager (see Section 2).

---

## 2. Secret Management

### 2.1 Secrets That Must Never Appear in Source Control

| Secret | Purpose | Provider |
|--------|---------|---------|
| `Stripe:SecretKey` | API calls to create checkout sessions | Stripe |
| `Stripe:WebhookSecret` | Webhook signature verification (HMAC) | Stripe |
| `Windcave:ApiKey` | Session creation | Windcave |
| `Windcave:WebhookSecret` | Webhook HMAC | Windcave |
| `Poli:MerchantId` | Session creation | POLi |
| `Poli:ApiKey` | Session creation | POLi |
| `PayPal:ClientId` | OAuth token | PayPal |
| `PayPal:ClientSecret` | OAuth token | PayPal |
| `PayPal:WebhookId` | Webhook event verification | PayPal |

**Rule:** `.gitignore` must exclude `appsettings.Production.json`, `appsettings.Development.json`, and any `secrets.json`. Verify with `git ls-files --error-unmatch appsettings.Production.json` — this command should fail (file not tracked).

### 2.2 Recommended Injection Patterns

**Option A — Environment variables (Docker / Kubernetes / Azure App Service)**

ASP.NET Core maps double-underscore `__` to `:` in config keys:

```
OnlinePayments__Enabled=true
OnlinePayments__UseMockProviders=false
OnlinePayments__DefaultProvider=Stripe
OnlinePayments__Providers__Stripe__Enabled=true
OnlinePayments__Providers__Stripe__SecretKey=sk_live_...
OnlinePayments__Providers__Stripe__WebhookSecret=whsec_...
```

**Option B — Azure Key Vault / AWS Secrets Manager / HashiCorp Vault**

Store each secret as a named secret; inject into the container/App Service at startup. The ABP configuration pipeline resolves them transparently.

**Option C — `appsettings.Production.json` (gitignored, deployed separately)**

Suitable for simple VM deployments. The file must be excluded from all source-control tools and CI artifact caches.

### 2.3 Rotation Policy

- Rotate webhook secrets immediately if ever logged, leaked, or committed.
- Rotate API keys on a 90-day schedule or on staff departure.
- After rotation, update the live environment and re-run the deployment validation checklist (Section 6) before allowing new orders.

---

## 3. Provider-Specific Future Configuration

The codebase currently includes **mock provider implementations only**. Real provider SDK integration is a future task. This section documents what configuration each provider will require when real implementations are built.

### 3.1 Stripe

| Config key | Description |
|------------|-------------|
| `Providers:Stripe:SecretKey` | `sk_test_...` (sandbox) or `sk_live_...` (production) |
| `Providers:Stripe:WebhookSecret` | `whsec_...` from Stripe Dashboard → Webhooks |
| `Providers:Stripe:PublishableKey` | Displayed to frontend if using Stripe.js (not required for hosted checkout) |

**Webhook events to subscribe:** `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`

**Dashboard steps:**
1. Create a Webhook endpoint: `https://<production-domain>/api/payment-webhooks/stripe`
2. Subscribe to events listed above.
3. Copy the signing secret (`whsec_...`) into the secrets manager.
4. Set the success/cancel URL in the Stripe session creation request (handled server-side by the real provider implementation — never from the frontend).

### 3.2 Windcave (Payment Express)

| Config key | Description |
|------------|-------------|
| `Providers:Windcave:ApiKey` | PX Pay 2.0 User ID / API key from Windcave merchant portal |
| `Providers:Windcave:WebhookSecret` | HMAC key for notification validation |
| `Providers:Windcave:PxUserId` | PX Pay User ID (may be same as ApiKey depending on integration type) |

**Notes:**
- Windcave's hosted payment page (PX Pay 2.0) redirects back to the supplied `UrlSuccess` and `UrlFail` — these map to `SuccessReturnBaseUrl` and `CancelReturnBaseUrl`.
- Register the webhook notification URL in the Windcave merchant portal.

### 3.3 POLi Payments

| Config key | Description |
|------------|-------------|
| `Providers:Poli:MerchantCode` | Assigned by POLi |
| `Providers:Poli:AuthenticationCode` | Assigned by POLi (equivalent to API key) |

**Notes:**
- POLi is a bank-transfer provider (NZ / AU). There is no webhook signing secret; instead, transactions are verified by polling the POLi API using the token returned during session creation.
- POLi does not support international cards — enable only for NZ/AU customers.

### 3.4 PayPal

| Config key | Description |
|------------|-------------|
| `Providers:PayPal:ClientId` | From PayPal Developer Dashboard |
| `Providers:PayPal:ClientSecret` | From PayPal Developer Dashboard |
| `Providers:PayPal:WebhookId` | Created when registering the webhook URL in the dashboard |
| `Providers:PayPal:Mode` | `"sandbox"` or `"live"` |

**Webhook events to subscribe:** `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `CHECKOUT.ORDER.APPROVED`, `CHECKOUT.ORDER.CANCELLED`

---

## 4. Webhook URLs

### 4.1 Route Pattern

All payment provider webhooks are handled at a single parameterised route:

```
POST /api/payment-webhooks/{provider}
```

| Provider | Full URL |
|----------|---------|
| Stripe | `https://<production-domain>/api/payment-webhooks/stripe` |
| Windcave | `https://<production-domain>/api/payment-webhooks/windcave` |
| POLi | `https://<production-domain>/api/payment-webhooks/poli` |
| PayPal | `https://<production-domain>/api/payment-webhooks/paypal` |

The `{provider}` segment is case-insensitive and maps to the `PaymentProvider` enum.

### 4.2 Controller Details

- **Controller:** `PaymentWebhookController` (`backend/src/TeeNova.HttpApi/Payments/PaymentWebhookController.cs`)
- **Authorization:** `[AllowAnonymous]` — no auth token required (providers cannot supply one)
- **Body handling:** Raw body read before model binding (required for HMAC signature verification)
- **Idempotency:** The application layer guards against duplicate processing: if the session is already `Completed` or a `PaymentTransactionId` is already set, the webhook is acknowledged and discarded without re-processing.

### 4.3 Infrastructure Requirements

- The webhook endpoint must be publicly reachable over HTTPS on port 443.
- No IP allowlisting that would block provider IP ranges (Stripe, PayPal publish their IP ranges; Windcave/POLi may require contacting support for IP ranges).
- TLS certificate must be valid (not self-signed). Providers reject webhooks to endpoints with invalid certificates.
- Firewall/WAF rules must allow `POST` to `/api/payment-webhooks/*` from provider IP ranges.
- Response time must be under the provider timeout (typically 30 seconds). The handler is async and returns HTTP 200 after committing to the database; the receipt email is sent as a best-effort fire-and-forget after the 200 response.

### 4.4 Webhook Retry Behaviour (Current Implementation)

**Important:** The current implementation propagates `BusinessException` for non-retryable mismatches (amount/currency mismatch, cancelled order, no remaining balance) as **HTTP 500**. Payment providers interpret HTTP 5xx as a transient failure and **will retry the webhook**, potentially indefinitely.

This is a known issue (see Section 7, Issue 2). It must be fixed before enabling real providers.

---

## 5. Frontend Return URLs

### 5.1 How Return URLs Work

After the customer completes (or cancels) checkout on the provider's hosted page, they are redirected back to:

```
{SuccessReturnBaseUrl}?orderId={orderId}&orderNumber={orderNumber}
```

For mock providers, additional debug params are appended: `mockProvider`, `mockSessionId`, `mockAmount`, `mockCurrency`, `mockPurpose`. These will not be present with real providers.

### 5.2 What the Frontend Does on Return

The checkout success page (`frontend/src/app/checkout/success/page.tsx`) follows these rules:

- **It does NOT record payment success.** Payment status is determined entirely by the backend via the provider webhook.
- When the page detects it was reached from an online provider return (via the presence of `mockProvider` or `mockSessionId` query params in mock mode), it displays an **amber "pending confirmation" notice** explaining that payment is being verified.
- The page polls or refreshes the order status from the backend. If `OrderDto.PaymentStatus` is `Paid`, it shows a confirmation. If still pending, it continues to show the amber notice.
- **The page never displays "payment successful" based solely on URL parameters.** The backend `PaymentStatus` field is the only authoritative source.

### 5.3 Production Return URL Requirements

- Must be HTTPS.
- Must be on the same domain as the `SameSite` cookie policy allows (relevant if using session cookies for the user's cart/order context).
- The path `/checkout/success` must not be behind authentication middleware — customers may not be logged in.
- The cancel URL should lead to a page that allows the customer to try again (e.g., back to the checkout page with the order preserved).

---

## 6. Deployment Validation Checklist

Run this checklist after every production deployment that touches payment configuration, provider credentials, or related application code.

### 6.1 Configuration Verification

- [ ] `OnlinePayments:Enabled` is `true`
- [ ] `OnlinePayments:UseMockProviders` is `false`
- [ ] `OnlinePayments:DefaultProvider` matches an enabled, fully-configured provider
- [ ] `OnlinePayments:Currency` is `NZD` (or the correct store currency)
- [ ] `OnlinePayments:SuccessReturnBaseUrl` resolves to the live HTTPS frontend URL
- [ ] `OnlinePayments:CancelReturnBaseUrl` resolves to the live HTTPS frontend URL
- [ ] No provider has `Enabled: true` without the corresponding credentials being present
- [ ] `appsettings.json` in source control contains only placeholders, not real values

### 6.2 Secret Verification

- [ ] Stripe `SecretKey` begins with `sk_live_` (not `sk_test_`)
- [ ] Stripe `WebhookSecret` is present and matches the value shown in Stripe Dashboard
- [ ] All other provider secrets are present in the secrets manager / environment
- [ ] Running `git grep "sk_live\|whsec_\|sk_test_"` returns no matches

### 6.3 Webhook Endpoint Verification

- [ ] `POST https://<production-domain>/api/payment-webhooks/stripe` returns HTTP 200 (or HTTP 400 for invalid body — not 404)
- [ ] TLS certificate is valid and not self-signed (`curl -I https://<production-domain>/api/payment-webhooks/stripe`)
- [ ] Webhook URL registered in each enabled provider's dashboard matches the production URL exactly
- [ ] Stripe Dashboard → Webhooks → endpoint shows status "Enabled"

### 6.4 Session Creation Smoke Test

- [ ] Create a test order with `DeliveryMethod` set (Pickup or Shipping)
- [ ] Call `POST /api/app/order/{orderId}/online-payment-session` with `{provider: "Stripe"}` (or enabled provider)
- [ ] Response contains a valid `providerCheckoutUrl` pointing to the provider's hosted page (not a `mock_` URL)
- [ ] Opening the URL in a browser shows the provider's payment page

### 6.5 Webhook Processing Smoke Test (Sandbox)

- [ ] Complete a test payment using the provider's sandbox credentials
- [ ] Provider delivers webhook to `POST /api/payment-webhooks/{provider}`
- [ ] Order `PaymentStatus` transitions to `Paid` (or `DepositPaid` for pickup orders)
- [ ] `PaymentTransaction` record created with correct amount and currency
- [ ] Receipt email delivered to test recipient
- [ ] Re-sending the same webhook event results in HTTP 200 without duplicate `PaymentTransaction`

### 6.6 Frontend Return URL Test

- [ ] After completing sandbox payment, browser is redirected to `SuccessReturnBaseUrl?orderId=...`
- [ ] The success page does not show "payment confirmed" before the webhook has been processed
- [ ] After webhook processing, refreshing the success page shows the correct `Paid` status
- [ ] Cancel flow: customer clicks "cancel" on provider page → redirected to `CancelReturnBaseUrl` → no payment recorded

### 6.7 Currency and Amount Verification

- [ ] Payment session amount matches the server-calculated `BalanceAmount` or `RequiredDepositAmount`
- [ ] Webhook-reported amount matches the session amount (mismatch returns HTTP 500 — see Section 7)
- [ ] Currency in webhook matches `OnlinePayments:Currency` (mismatch returns HTTP 500 — see Section 7)
- [ ] Email receipt displays amount with correct `NZD` currency symbol (see Section 7, Issue 1)

### 6.8 Rollback Criteria

Roll back to the previous deployment if:

- [ ] Any webhook endpoint returns 404
- [ ] Session creation throws an unhandled exception
- [ ] A PaymentTransaction is created with incorrect amount
- [ ] A receipt email is sent without a corresponding PaymentTransaction
- [ ] Duplicate PaymentTransactions are created for the same payment

---

## 7. Known Issues to Resolve Before Real-Provider Go-Live

These issues were identified during Phase 12D-9B live scenario QA. None affect the mock implementation but will cause problems with real payment providers.

### Issue 1 — Incorrect Currency Symbol in Email Receipts (`{Amount:C}` Server Locale)

**Severity:** Medium  
**Symptom:** The `{Amount:C}` format specifier in email templates uses the server's OS locale. On servers with a non-NZD locale (e.g., Japanese `ja-JP`), amounts display as `¥209.93` instead of `NZ$209.93`.  
**Affected file:** `backend/src/TeeNova.Application/Email/OrderEmailTemplates.cs`  
**Required fix:** Replace `{Amount:C}` with an explicit culture-aware format:
```csharp
amount.ToString("C", new CultureInfo("en-NZ"))
// or inject the configured currency code and format accordingly
```
**Must fix before:** First real receipt email is sent to a customer.

### Issue 2 — HTTP 500 for Non-Retryable Webhook Rejections

**Severity:** High  
**Symptom:** When `ProcessPaymentCompletedAsync` rejects a webhook for a legitimate business reason (amount mismatch, currency mismatch, cancelled order, no remaining balance), the `BusinessException` propagates to the HTTP layer as **HTTP 500**. Payment providers treat 5xx as transient failures and **retry the webhook**, potentially hundreds of times.  
**Affected file:** `backend/src/TeeNova.Application/Payments/OnlinePaymentWebhookAppService.cs`  
**Required fix:** Catch `BusinessException` in `PaymentWebhookController` (or in the app service) for known non-retryable error codes and return **HTTP 400** (Bad Request) or **HTTP 422** (Unprocessable Entity). Providers treat 4xx as permanent failures and stop retrying.  
**Must fix before:** Any real provider webhook is registered.

### Issue 3 — Stale `Pending` Sessions After Rejection

**Severity:** Low–Medium  
**Symptom:** When a webhook is rejected (Issue 2 scenarios), the `OnlinePaymentSession` remains in `Pending` status indefinitely. There is no scheduled cleanup or auto-failure transition.  
**Impact:** The customer may see a "pending" payment session when returning to the order. The session cannot be reused (provider IDs are unique per checkout attempt).  
**Required fix:** Add a background worker (or leverage the existing `OrphanedAssetCleanupWorker` pattern) to transition `Pending` sessions older than a configurable threshold (e.g., 2 hours) to `Expired`.  
**Must fix before:** Production launch (cosmetic issue, not a data-integrity issue).

---

## 8. Production Readiness Decision Checklist

Use this checklist to gate progression through environment stages.

### Stage 1 — Mock Environment (Current State ✅)

- [x] All 20 online payment scenarios pass in mock mode
- [x] Webhook idempotency verified
- [x] Manual payment coexists with online payment
- [x] Frontend never records payment success
- [x] Backend is sole source of payment truth

### Stage 2 — Sandbox / Test Provider Credentials

**Prerequisites (must complete before Stage 2):**

- [ ] Issue 2 fixed: HTTP 500 → HTTP 400/422 for non-retryable webhook rejections
- [ ] Issue 1 fixed: Currency symbol uses explicit culture
- [ ] Real provider SDK implemented for at least one provider (new task, out of scope for Phase 12)
- [ ] Webhook signature verification implemented in the real provider (new task)
- [ ] `UseMockProviders: false` tested in staging environment
- [ ] All Deployment Validation Checklist items in Section 6 pass against staging
- [ ] Penetration test of webhook endpoint (ensure no SSRF, no replay outside idempotency window)

### Stage 3 — Live Provider Credentials (Production)

**Prerequisites (must complete before Stage 3):**

- [ ] All Stage 2 items complete
- [ ] Issue 3 fixed: stale Pending session cleanup
- [ ] PCI DSS self-assessment questionnaire completed (SAQ A — applicable for hosted redirect providers)
- [ ] Payment provider merchant agreements signed and accounts verified
- [ ] Customer-facing refund/dispute process documented
- [ ] Operations team briefed on webhook retry monitoring
- [ ] Alerting configured for webhook delivery failures (provider dashboard alerts + application-level logging)

### Stage 4 — Production Hardening (Post-Launch)

- [ ] Webhook signature verification tested with rotated secrets (zero-downtime rotation)
- [ ] Load test: concurrent session creations do not produce duplicate transactions
- [ ] Webhook replay test: re-delivered events do not double-charge
- [ ] Monitoring dashboard shows webhook success rate > 99%
- [ ] Receipt email delivery rate monitored via SMTP provider dashboard

---

## 9. Out of Scope

The following items are explicitly **not** covered by this checklist and must be handled separately:

| Topic | Reason |
|-------|--------|
| Real provider SDK implementation (Stripe, Windcave, POLi, PayPal) | Separate development task; not part of Phase 12 |
| Webhook signature verification code | Part of real provider implementation, not yet built |
| Refund processing | No refund API or UI exists in the current codebase |
| Partial refunds | Not part of the payment model |
| Multi-currency support | System is NZD-only; currency is a server-side constant |
| Card detail collection or tokenisation | Architecture uses hosted redirect — card details never touch the application server |
| PCI DSS audit | Engagement with a QSA is a business/compliance task |
| Customer dispute / chargeback handling | Handled through provider dashboard; no application-layer support needed |
| Subscription / recurring payments | Not part of the order model |
| Tax calculation or GST invoices | Separate concern; not part of the payment pipeline |
| Provider-level fraud detection configuration | Configured in provider dashboard, not in application config |

---

*Document maintained by the TeeNova development team. Update Section 7 whenever new issues are found during QA, and update Section 8 checklists as each stage is completed.*
