# Real Provider Sandbox Integration Plan

**Project:** TeeNova / Otahuhu Printing Shop  
**Phase:** 13A (Jira 7033)  
**Date:** 2026-05-27  
**Architecture:** Multi-provider hosted payment (Stripe · PayPal · Windcave · POLi)  
**Status:** Planning only — no provider SDKs or credentials added

---

## Table of Contents

1. [Current Architecture Summary](#1-current-architecture-summary)
2. [Recommended Implementation Sequence](#2-recommended-implementation-sequence)
3. [Provider-Specific Sandbox Planning](#3-provider-specific-sandbox-planning)
   - [3.1 Stripe](#31-stripe)
   - [3.2 PayPal](#32-paypal)
   - [3.3 Windcave](#33-windcave)
   - [3.4 POLi](#34-poli)
4. [Proposed Future Jira Breakdown](#4-proposed-future-jira-breakdown)
5. [Shared Provider Contract Risks](#5-shared-provider-contract-risks)
6. [Configuration Strategy](#6-configuration-strategy)
7. [Sandbox QA Strategy](#7-sandbox-qa-strategy)
8. [Out of Scope](#8-out-of-scope)

---

## 1. Current Architecture Summary

### 1.1 Provider-Neutral Session Creation

Session creation is orchestrated by `OrderAppService.CreateOnlinePaymentSessionAsync` in
`backend/src/TeeNova.Application/Orders/OrderAppService.cs`.

The method:
1. Validates order state (not Cancelled, not Completed, balance > 0).
2. Resolves the requested provider via `IOnlinePaymentProviderResolver`.
3. Builds a `CreateOnlinePaymentProviderSessionRequest` containing `OrderId`, `OrderNumber`,
   `Provider`, `Purpose`, `Amount`, `Currency`, `CustomerEmail`, `SuccessUrl`, and `CancelUrl`.
4. Calls `IOnlinePaymentProvider.CreatePaymentSessionAsync(request)`.
5. Persists an `OnlinePaymentSession` record (status `Pending`) with the returned
   `ProviderSessionId` and `ProviderCheckoutUrl`.
6. Returns `OnlinePaymentSessionDto` to the frontend, which redirects the customer to
   `ProviderCheckoutUrl`.

No provider SDK calls are made outside the provider implementation. The app service sees only the
provider-neutral `CreateOnlinePaymentProviderSessionResult`.

### 1.2 Provider-Neutral Webhook Result Model

`IOnlinePaymentProvider.ParseWebhookAsync` accepts the raw HTTP body string and a
case-insensitive header dictionary, and returns `OnlinePaymentWebhookResult`.

The result carries:

| Field | Meaning |
|-------|---------|
| `Provider` | Enum value (`Stripe`, `Windcave`, `Poli`, `PayPal`) |
| `Outcome` | `Ignored`, `PaymentCompleted`, `PaymentCancelled`, `PaymentExpired`, `PaymentFailed` |
| `ProviderSessionId` | Provider's own checkout session ID — used to look up the local `OnlinePaymentSession` |
| `ProviderPaymentId` | Provider's charge / capture / payment ID — stored for reconciliation |
| `ProviderEventId` | Provider's webhook event ID — used for idempotency and duplicate detection |
| `RawProviderStatus` | Provider's raw status string — stored for debugging, never used in logic |
| `Amount` | Decimal payment amount as reported by the provider |
| `Currency` | Uppercase ISO-4217 currency code as reported by the provider |

Each real provider implementation is responsible for mapping its own webhook event structure and
signature format onto this model. The webhook handler (`OnlinePaymentWebhookAppService`) never
reads provider-specific fields.

### 1.3 Hosted Checkout Redirect Flow

```
Customer browser
    │
    │  POST /api/app/order/{id}/online-payment-session
    ▼
OrderAppService
    │  CreatePaymentSessionAsync(request)
    ▼
IOnlinePaymentProvider implementation
    │  calls provider API to create hosted session
    ▼
Provider API returns session ID + checkout URL
    │
    │  returns CreateOnlinePaymentProviderSessionResult
    ▼
OrderAppService persists OnlinePaymentSession (Pending)
    │  returns OnlinePaymentSessionDto
    ▼
Frontend redirects customer to ProviderCheckoutUrl
    │
    ▼
Customer completes payment on provider-hosted page
    │
    ▼
Provider redirects customer back to SuccessReturnBaseUrl or CancelReturnBaseUrl
    │
    │  (asynchronously)
    ▼
Provider POSTs webhook to POST /api/payment-webhooks/{provider}
    │
    ▼
PaymentWebhookController → OnlinePaymentWebhookAppService
    │  ParseWebhookAsync → match OnlinePaymentSession by ProviderSessionId
    │  validate amount + currency + order state
    │  create PaymentTransaction, update order, send receipt
    ▼
HTTP 200 returned to provider
```

### 1.4 Webhook as Source of Truth

The application **never** marks an order as paid based on the customer's return URL.
`PaymentWebhookController` is the only path that creates `PaymentTransaction` records and
transitions order payment status.

The frontend return URL lands on `/checkout/success` which displays an amber "pending
confirmation" notice until the backend `PaymentStatus` field reflects `Paid`. The page polls
order status; it does not trust URL query parameters for payment confirmation.

### 1.5 Manual Payment Coexistence

Manual payments (admin-recorded bank transfers, cash, etc.) use a separate
`RecordPaymentAsync` path in `OrderAppService`. Online payment sessions use
`ManualPaymentMethod.Online` as the payment method when recording the `PaymentTransaction`.
Both paths write to the same `PaymentTransaction` table and call the same
`order.ApplyPayment(...)` domain method. There is no coupling between the online and manual
paths — each can be used independently for the same or different orders.

### 1.6 Mock Providers vs. Real Providers

`MockOnlinePaymentProviderBase` (and the four concrete subclasses) implement
`IOnlinePaymentProvider` identically to how real providers will.

| Characteristic | Mock providers | Real providers |
|----------------|---------------|----------------|
| Session creation | Generates a `mock_<provider>_<guid>` session ID; checkout URL is the success return URL with debug query params appended | Calls the provider REST API; returns a real hosted checkout URL |
| Webhook parsing | Deserialises a simple hand-crafted JSON body; no signature check | Verifies provider-specific HMAC / signature; parses the real event schema |
| External I/O | None | HTTPS calls to provider API |
| Credentials required | None | `SecretKey`, `WebhookSecret`, provider-specific extras |
| Suitable for | Local development, CI, QA pipeline | Sandbox and production |

When `OnlinePaymentOptions.UseMockProviders` is `true`, the DI registration switches all
four providers to mock implementations. Setting it to `false` will cause the resolver to throw
unless a real implementation is registered for each enabled provider.

---

## 2. Recommended Implementation Sequence

### Sequence

1. **Stripe** (Jira 7034–7036)
2. **PayPal** (Jira 7037–7039)
3. **Windcave** (Jira 7040)
4. **POLi** (Jira 7041)

### Why Stripe First

Stripe should be the first real provider implemented for the following reasons:

**Strongest sandbox tooling.** The Stripe CLI provides `stripe listen --forward-to` for
local webhook forwarding without a public tunnel, test card numbers with predictable outcomes,
and `stripe trigger checkout.session.completed` to fire webhook events without completing a
real checkout.

**Clear hosted checkout model.** Stripe Checkout Sessions map directly onto
`CreateOnlinePaymentProviderSessionResult`: the session creation API returns a `session.id`
(`ProviderSessionId`) and a `url` (`ProviderCheckoutUrl`). The request model maps cleanly to
Stripe's `line_items`, `success_url`, `cancel_url`, `customer_email`, and `metadata` fields.

**Clear webhook signature validation.** Stripe uses a well-documented HMAC-SHA256 scheme
(`Stripe-Signature` header with `t=` timestamp and `v1=` signature components). The
`Stripe.net` SDK exposes `EventUtility.ConstructEvent` which handles signature validation,
replay attack prevention (timestamp tolerance), and event parsing in a single call. This
establishes the implementation pattern that other providers will follow.

**Best reference implementation.** Completing Stripe first produces a working, tested
real-provider implementation that documents the class structure, DI registration pattern,
error handling, and test approach to be reused for PayPal and Windcave.

### Why PayPal Second

PayPal offers a sandbox environment with a developer dashboard and test buyer accounts. Its
Orders API v2 supports a hosted approval flow (redirect URL), and its webhook verification uses
a dedicated verification API call (rather than local HMAC), making it the second-most
approachable implementation.

### Why Windcave Third

Windcave (Payment Express PX Pay 2.0) is a New Zealand-focused provider. Its sandbox requires
obtaining test credentials from Windcave support, which may have a lead time. The API is
XML/REST hybrid and less standardised than Stripe or PayPal. Implementing after Stripe and
PayPal ensures the pattern is well-established before encountering Windcave's quirks.

### Why POLi Last

POLi is a bank-transfer provider (no card processing). It does not have a standard webhook
push model — payment status must be polled via the POLi API using the transaction token.
This diverges most significantly from the current webhook-as-source-of-truth contract and
requires additional design work (polling strategy, background worker, or a hybrid approach).
POLi should be planned last once the webhook pattern is proven with card-based providers.

---

## 3. Provider-Specific Sandbox Planning

### 3.1 Stripe

#### Required Package / SDK

```
Stripe.net (NuGet package: Stripe.net)
```

The SDK is used for two purposes:
- `SessionService.CreateAsync` — creates a Checkout Session.
- `EventUtility.ConstructEvent` — validates the `Stripe-Signature` header and deserialises the event.

The raw HTTP body string must be passed unmodified to `ConstructEvent`; any re-serialisation
will break the HMAC signature.

#### Required Config Keys

| Key | Description |
|-----|-------------|
| `OnlinePayments:Providers:Stripe:SecretKey` | `sk_test_...` (sandbox) / `sk_live_...` (production) |
| `OnlinePayments:Providers:Stripe:WebhookSecret` | `whsec_...` from Stripe Dashboard → Webhooks |
| `OnlinePayments:Providers:Stripe:PublicKey` | `pk_test_...` (optional; not needed for server-side hosted checkout) |

#### Sandbox Credentials Required

- Stripe account at [dashboard.stripe.com](https://dashboard.stripe.com)
- Test mode API key (`sk_test_...`) from Dashboard → Developers → API keys
- Webhook signing secret from Dashboard → Developers → Webhooks → Add endpoint
  (`POST https://<tunnel-or-staging>/api/payment-webhooks/stripe`)

#### Hosted Checkout Session Creation Mapping

| `CreateOnlinePaymentProviderSessionRequest` field | Stripe Checkout Session field |
|--------------------------------------------------|-------------------------------|
| `Amount` | `line_items[0].price_data.unit_amount` (convert to **minor units / cents** — see Section 5.1) |
| `Currency` | `line_items[0].price_data.currency` (lowercase) |
| `OrderNumber` | `line_items[0].price_data.product_data.name` (e.g., `"Order #TN-001234"`) |
| `CustomerEmail` | `customer_email` |
| `SuccessUrl` | `success_url` |
| `CancelUrl` | `cancel_url` |
| `OrderId` | `metadata["order_id"]` |
| `OrderNumber` | `metadata["order_number"]` |
| `Purpose` | `metadata["payment_purpose"]` |
| `Provider` | Not sent; always `Stripe` by definition |

Session mode should be `"payment"` (one-time payment, not subscription).

#### Provider Session ID Mapping

`session.id` (e.g., `cs_test_a1b2c3...`) → `CreateOnlinePaymentProviderSessionResult.ProviderSessionId`

#### Provider Checkout URL Mapping

`session.url` → `CreateOnlinePaymentProviderSessionResult.ProviderCheckoutUrl`

#### Provider Payment ID Mapping

`checkout.session.completed` event → `session.payment_intent` (e.g., `pi_3...`) →
`OnlinePaymentWebhookResult.ProviderPaymentId`

#### Webhook Event Types

| Stripe Event | Action |
|-------------|--------|
| `checkout.session.completed` | `PaymentCompleted` — payment captured |
| `checkout.session.expired` | `PaymentExpired` — session timed out |
| `payment_intent.payment_failed` | `PaymentFailed` — card declined or error |
| All other events | `Ignored` |

> **Note:** `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`
> are emitted for delayed payment methods (e.g., BACS, Bancontact). If the shop enables
> only card payments, these can be ignored. If ACH or bank debit is enabled in future,
> these events must be handled.

#### Webhook Signature / Verification Approach

1. Read raw body **before** any middleware touches it (already the case in `PaymentWebhookController`).
2. Read `Stripe-Signature` header.
3. Call `Stripe.EventUtility.ConstructEvent(rawBody, stripeSignatureHeader, webhookSecret)`.
4. If the call throws `StripeException`, the signature is invalid — return `Ignored` (do not throw;
   log a warning).
5. The returned `Event` object contains the typed `Data.Object` (a `Session` for checkout events).

The timestamp tolerance in `ConstructEvent` defaults to 300 seconds (5 minutes) to prevent
replay attacks. This default is acceptable.

#### Amount and Currency Handling

- Stripe requires amounts in **minor units** (cents). For NZD: `amount * 100`, rounded to
  the nearest integer.
- Stripe returns amounts in `checkout.session.completed` as `session.amount_total` (minor units).
- The webhook normalisation layer must convert back: `amountMinorUnits / 100m` before
  populating `OnlinePaymentWebhookResult.Amount`, so the app service can compare it against
  `OnlinePaymentSession.Amount` (which is stored in major units / dollars).
- Currency code must be lowercased for Stripe API calls; the result should be uppercased
  before populating `OnlinePaymentWebhookResult.Currency`.

#### Idempotency Key Strategy

Pass `session.id` (or a stable order-level key) as the `IdempotencyKey` on the Stripe API
call. Using `OrderId + "_" + Purpose` (e.g., `"3f2a..._FullBalance"`) ensures that a
duplicate session creation request for the same order returns the same Stripe session rather
than creating a new one.

#### Return URL Behaviour

Stripe appends `?session_id={CHECKOUT_SESSION_ID}` to the `success_url` if the template
variable `{CHECKOUT_SESSION_ID}` is included, or returns to the URL verbatim if not included.
The app should not rely on URL-appended session IDs — the webhook is the authoritative signal.
The frontend success page should not read `session_id` from the URL.

#### Failure / Cancellation Behaviour

- **Customer cancels:** Stripe redirects to `cancel_url`. No `checkout.session.expired`
  event is fired immediately; the session expires after 24 hours, at which point Stripe fires
  `checkout.session.expired`.
- **Payment fails:** Stripe keeps the session open (customer can retry within the session
  expiry window). A `payment_intent.payment_failed` event is fired per failed attempt.
- **Session expires:** After 24 hours, `checkout.session.expired` is fired.

#### Known Risks / Unknowns

- The 24-hour session expiry window means a customer who abandons checkout and returns
  the next day will find the session expired. A new session must be created.
- Stripe Checkout `success_url` must be an HTTPS URL in production; `http://localhost` is
  permitted in test mode only.
- NZD is a supported Stripe currency; no special configuration is needed.
- The `Stripe.net` package version must match the Stripe API version used in the dashboard.
  Pin the package version and note the API version compatibility.
- The `EventUtility.ConstructEvent` call is synchronous and allocates a `Stripe.Event` object.
  For very high webhook throughput this may be a concern; not relevant at current scale.

---

### 3.2 PayPal

#### Required Package / SDK

```
PayPalCheckoutSdk (NuGet: PayPalCheckoutSdk)
```

Alternatively, the PayPal REST API can be called directly via `HttpClient`. The official
.NET SDK is less actively maintained; direct `HttpClient` usage is often preferred for
control over serialisation and error handling.

#### Required Config Keys

| Key | Description |
|-----|-------------|
| `OnlinePayments:Providers:PayPal:ClientId` | From PayPal Developer Dashboard |
| `OnlinePayments:Providers:PayPal:SecretKey` | Client secret from PayPal Developer Dashboard |
| `OnlinePayments:Providers:PayPal:WebhookSecret` | Webhook ID from PayPal Developer Dashboard (used for webhook verification) |
| `OnlinePayments:Providers:PayPal:Extra["Mode"]` | `"sandbox"` or `"live"` |

#### Sandbox Credentials Required

- PayPal Developer account at [developer.paypal.com](https://developer.paypal.com)
- Sandbox application Client ID and Secret
- Sandbox webhook endpoint registered at PayPal Developer → My Apps & Credentials → Webhooks
  (`POST https://<tunnel-or-staging>/api/payment-webhooks/paypal`)
- Sandbox buyer account for manual checkout testing

#### Hosted Checkout Session Creation Mapping

| `CreateOnlinePaymentProviderSessionRequest` field | PayPal Orders API v2 field |
|--------------------------------------------------|----------------------------|
| `Amount` | `purchase_units[0].amount.value` (decimal string, e.g., `"209.93"`) |
| `Currency` | `purchase_units[0].amount.currency_code` (uppercase, e.g., `"NZD"`) |
| `OrderId` | `purchase_units[0].custom_id` or `purchase_units[0].invoice_id` |
| `OrderNumber` | `purchase_units[0].description` |
| `CustomerEmail` | `payer.email_address` (optional hint; PayPal overrides with logged-in payer) |
| `SuccessUrl` | `application_context.return_url` |
| `CancelUrl` | `application_context.cancel_url` |

The `intent` field must be `"CAPTURE"` (not `"AUTHORIZE"`) to match the current model
where payment is captured immediately.

`application_context.landing_page` = `"BILLING"` to show the card/PayPal wallet selector.
`application_context.user_action` = `"PAY_NOW"` to show a "Pay Now" button (instead of
"Continue") on the PayPal page.

#### Provider Session ID Mapping

PayPal Orders API create response `id` (e.g., `"5O190127TN364715T"`) →
`CreateOnlinePaymentProviderSessionResult.ProviderSessionId`

#### Provider Checkout URL Mapping

From the create response `links` array, the link with `rel: "approve"` provides the hosted
checkout URL → `CreateOnlinePaymentProviderSessionResult.ProviderCheckoutUrl`

#### Provider Payment ID Mapping

`PAYMENT.CAPTURE.COMPLETED` event → `resource.id` (the capture ID, e.g., `"1P0470XXXXX"`) →
`OnlinePaymentWebhookResult.ProviderPaymentId`

#### Webhook Event Types

| PayPal Event | Action |
|-------------|--------|
| `PAYMENT.CAPTURE.COMPLETED` | `PaymentCompleted` — payment captured |
| `PAYMENT.CAPTURE.DENIED` | `PaymentFailed` — capture denied |
| `CHECKOUT.ORDER.APPROVED` | `Ignored` (approval only; wait for capture event) |
| `CHECKOUT.ORDER.CANCELLED` | `PaymentCancelled` |
| `CHECKOUT.ORDER.VOIDED` | `PaymentCancelled` |
| All other events | `Ignored` |

> **Note:** `CHECKOUT.ORDER.APPROVED` fires when the customer approves but before PayPal
> captures the payment. Do not mark the order paid on this event alone. Wait for
> `PAYMENT.CAPTURE.COMPLETED`.

#### Webhook Signature / Verification Approach

PayPal webhook verification uses a **remote API call** rather than a local HMAC computation:

1. Collect: `PAYPAL-AUTH-ALGO`, `PAYPAL-CERT-URL`, `PAYPAL-TRANSMISSION-ID`,
   `PAYPAL-TRANSMISSION-SIG`, `PAYPAL-TRANSMISSION-TIME` headers.
2. POST to `https://api-m.paypal.com/v1/notifications/verify-webhook-signature` with:
   - `auth_algo`, `cert_url`, `transmission_id`, `transmission_sig`, `transmission_time`
   - `webhook_id` (from config — `WebhookSecret` key)
   - `webhook_event` (the raw event JSON, re-serialised)
3. Response `verification_status = "SUCCESS"` means the signature is valid.
4. If the call fails or returns `verification_status != "SUCCESS"`, return `Ignored` and log.

> **Risk:** The verification API call adds latency (typically 100–300 ms) to every webhook
> event. This is unavoidable with PayPal's model. The webhook endpoint's total response time
> must still be under 30 seconds.

#### Amount and Currency Handling

- PayPal amounts are **decimal strings** (not minor units). `"209.93"` for NZD 209.93.
- PayPal currency codes are uppercase ISO-4217 (`"NZD"`).
- When parsing the webhook, read `resource.amount.value` (string) and
  `resource.amount.currency_code`, convert to `decimal` using invariant culture.
- No minor-unit conversion is required.

#### Idempotency Key Strategy

Set `PayPal-Request-Id` header on the Orders API create call to a stable value
(e.g., `OrderId.ToString()` or `OrderId + "_" + Purpose`). PayPal will return the existing
order if the same request ID is received within the idempotency window.

#### Return URL Behaviour

PayPal appends `?token={ORDER_ID}&PayerID={PAYER_ID}` to the `return_url`. The frontend
must not use these to confirm payment — wait for the webhook.

#### Failure / Cancellation Behaviour

- Customer cancels: PayPal redirects to `cancel_url`. The order remains in `CREATED` state.
  No webhook is fired immediately; a `CHECKOUT.ORDER.VOIDED` webhook may follow.
- Payment fails: `PAYMENT.CAPTURE.DENIED` event is fired.
- Order expires: PayPal orders expire after 3 hours by default. No expiry webhook is
  guaranteed; the stale-session cleanup worker (see production checklist Issue 3) will handle
  cleanup.

#### Known Risks / Unknowns

- **OAuth token management:** PayPal's API requires a bearer token obtained via
  `POST /v1/oauth2/token` with Basic auth. The token expires (typically 9 hours). The
  provider implementation must handle token caching and automatic refresh.
- **Remote webhook verification latency** (see above).
- PayPal sandbox webhook delivery can be unreliable; the Stripe CLI-style local listener is
  not available. Use a tunnel (ngrok / Cloudflare tunnel) for local testing.
- PayPal does not guarantee webhook delivery order; `CHECKOUT.ORDER.APPROVED` may arrive
  after `PAYMENT.CAPTURE.COMPLETED`.
- NZD is a supported PayPal currency; verify the sandbox merchant account is configured for NZD.
- The official `PayPalCheckoutSdk` NuGet package is in maintenance mode. Evaluate using
  direct `HttpClient` calls against the PayPal REST API as an alternative.

---

### 3.3 Windcave

#### Required Package / SDK

No official .NET SDK. Windcave uses the **PX Pay 2.0** REST API, consumed via `HttpClient`.

#### Required Config Keys

| Key | Description |
|-----|-------------|
| `OnlinePayments:Providers:Windcave:SecretKey` | PX Pay 2.0 API key (from Windcave merchant portal) |
| `OnlinePayments:Providers:Windcave:WebhookSecret` | HMAC key for notification validation (if supported) |
| `OnlinePayments:Providers:Windcave:Extra["PxUserId"]` | PX Pay User ID assigned by Windcave |
| `OnlinePayments:Providers:Windcave:Extra["BaseUrl"]` | `https://sec.windcave.com/pxaccess/pxpay.aspx` (or test equivalent) |

#### Sandbox Credentials Required

- Windcave test account — must contact Windcave support to obtain a test PX Pay User ID and
  API key. There is no self-service sandbox sign-up.
- Confirm with Windcave support whether test mode is a separate endpoint or a flag on the
  production endpoint.

#### Hosted Checkout Session Creation Mapping

The PX Pay 2.0 API uses an XML request/response format:

| `CreateOnlinePaymentProviderSessionRequest` field | PX Pay 2.0 field |
|--------------------------------------------------|-----------------|
| `Amount` | `AmountInput` (decimal string, 2 decimal places, e.g., `"209.93"`) |
| `Currency` | `CurrencyInput` (`"NZD"`) |
| `OrderNumber` | `MerchantReference` |
| `OrderId` | Not a direct field; embed in `MerchantReference` or `TxnData1`/`TxnData2`/`TxnData3` |
| `SuccessUrl` | `UrlSuccess` |
| `CancelUrl` | `UrlFail` |

The API responds with XML containing a `URI` element (the hosted payment URL) and a
`valid` attribute. If `valid="1"`, the `URI` is the checkout URL.

#### Provider Session ID Mapping

The PX Pay 2.0 session does not return a discrete session ID in the same way Stripe does.
The `MerchantReference` (set to `OrderNumber`) is used to correlate the response.
Alternatively, generate a unique `TxnId` value and pass it in the request to serve as
`ProviderSessionId`.

> **Design decision required:** Determine whether `TxnId` or `MerchantReference` is more
> suitable as `ProviderSessionId`. This must be resolved before implementation begins.

#### Provider Checkout URL Mapping

`URI` element from PX Pay 2.0 response → `CreateOnlinePaymentProviderSessionResult.ProviderCheckoutUrl`

#### Provider Payment ID Mapping

After a successful payment, Windcave redirects back to `UrlSuccess` with a `result` query
parameter token. The provider calls the PX Pay 2.0 result lookup API with this token to
retrieve the `DpsTxnRef` (Windcave's transaction reference) →
`OnlinePaymentWebhookResult.ProviderPaymentId`.

#### Webhook Event Types

Windcave uses an **HTTP notification** (not a standard webhook event model). The provider
POSTs a notification to a registered URL after payment completion or failure. The exact
notification format and fields must be confirmed with Windcave documentation or support.

Mapping:
- Success notification → `PaymentCompleted`
- Failure notification → `PaymentFailed`
- No standard cancellation notification; customer cancel redirects to `UrlFail` only.

#### Webhook Signature / Verification Approach

Windcave's notification verification approach must be confirmed from current Windcave
PX Pay 2.0 documentation. Options include:
- HMAC over the notification body using the `WebhookSecret` (API key).
- IP allowlisting for Windcave server IP ranges.
- Token-based result lookup (call the PX Pay result API with the token received in the
  notification, rather than trusting the notification body alone).

> **Risk:** Verification method is currently unknown and must be confirmed before implementation.

#### Amount and Currency Handling

- PX Pay 2.0 amounts are **decimal strings** with 2 decimal places (`"209.93"`).
- Currency is a 3-letter uppercase ISO-4217 code (`"NZD"`).
- No minor-unit conversion is required.

#### Idempotency Key Strategy

The `TxnId` field in PX Pay 2.0 must be unique per transaction. Use a combination of
`OrderId` and a timestamp or sequence to ensure uniqueness across retry attempts.

#### Return URL Behaviour

Windcave redirects to `UrlSuccess` or `UrlFail` with a `result` query parameter token.
The result token is required to call the PX Pay result lookup API. The frontend must pass
this token to the backend, or the backend must intercept the redirect and perform the lookup.

> **Design decision required:** Determine whether the result lookup happens via:
> (a) a new backend endpoint that the frontend calls with the `result` token, or
> (b) the existing webhook notification flow only (preferred — keeps webhook as source of truth).

#### Failure / Cancellation Behaviour

- Customer cancels: Windcave redirects to `UrlFail`. May also send a failure notification.
- Payment fails: Redirect to `UrlFail` and possibly a notification.
- No session expiry event documented; the stale-session cleanup worker will handle cleanup.

#### Known Risks / Unknowns

- **No self-service sandbox.** Test credentials must be obtained from Windcave. This may
  introduce lead time before implementation can begin.
- **XML API.** PX Pay 2.0 uses XML (not JSON), requiring `System.Xml` or an XML serialiser.
- **Notification vs. webhook ambiguity.** Windcave's notification model may not match the
  push-webhook model assumed by `PaymentWebhookController`. Further research is required.
- **Result token handling.** The `result` parameter passed back to `UrlSuccess` may be
  required for the result lookup. This may require a dedicated result-processing endpoint or
  a background result-fetching step.
- **NZ-specific provider.** No known issues with NZD; Windcave is a New Zealand provider.

---

### 3.4 POLi

#### Required Package / SDK

No official .NET SDK. POLi uses a REST API consumed via `HttpClient`.

#### Required Config Keys

| Key | Description |
|-----|-------------|
| `OnlinePayments:Providers:Poli:SecretKey` | Authentication Code assigned by POLi |
| `OnlinePayments:Providers:Poli:Extra["MerchantCode"]` | Merchant Code assigned by POLi |
| `OnlinePayments:Providers:Poli:Extra["BaseUrl"]` | `https://poliapi.apac.paywithpoli.com/api/` (or sandbox equivalent) |

#### Sandbox Credentials Required

- POLi merchant account — contact POLi Payments at [polipayments.com](https://www.polipayments.com).
- Test credentials are provided on application. POLi is only available in New Zealand and
  Australia; a New Zealand merchant account is required.
- Confirm with POLi whether a sandbox environment exists with simulated bank responses, or
  whether testing is limited to the production environment with a test flag.

#### Hosted Checkout Session Creation Mapping

POLi's Initiate Transaction API call:

| `CreateOnlinePaymentProviderSessionRequest` field | POLi Initiate Transaction field |
|--------------------------------------------------|--------------------------------|
| `Amount` | `Amount` (decimal, e.g., `209.93`) |
| `Currency` | `CurrencyCode` (`"NZD"`) |
| `OrderNumber` | `MerchantReference` |
| `SuccessUrl` | `SuccessURL` |
| `CancelUrl` | `FailureURL` |
| `OrderId` | Embed in `MerchantReference` or a custom field |

#### Provider Session ID Mapping

POLi Initiate Transaction response → `Token` (e.g., `"0000010e"`) →
`CreateOnlinePaymentProviderSessionResult.ProviderSessionId`

This token is critical: it is used both to construct the checkout URL and to query payment
status after return.

#### Provider Checkout URL Mapping

`NavigateURL` from the Initiate Transaction response →
`CreateOnlinePaymentProviderSessionResult.ProviderCheckoutUrl`

The URL is typically `https://poliapi.apac.paywithpoli.com/Transaction/Navigate?token=<Token>`.

#### Provider Payment ID Mapping

After payment, POLi returns the customer to `SuccessURL` with `token` appended. Call the
POLi Get Transaction API (`GET /api/Transaction/GetTransaction?token=<Token>`) to retrieve
`TransactionRefNo` → `OnlinePaymentWebhookResult.ProviderPaymentId`.

#### Webhook Event Types

**POLi does not use a server-sent webhook push model.** POLi notifies payment status by:
1. Redirecting the customer to `SuccessURL` or `FailureURL` with a `token` query parameter.
2. Providing a Get Transaction API that the merchant calls with the token to retrieve status.

This is fundamentally different from the current `ParseWebhookAsync` contract, which expects
the provider to push a webhook event to `POST /api/payment-webhooks/poli`.

> **Design decision required — significant architecture impact:**
>
> The current webhook architecture assumes providers push events to `/api/payment-webhooks/{provider}`.
> POLi requires polling or a backend-triggered status lookup. Options:
>
> **Option A — Polling background worker:** After session creation, a background worker
> periodically calls the POLi Get Transaction API for Pending POLi sessions. When a terminal
> state is detected, the worker triggers the same `HandleWebhookAsync` logic. This is the
> purest approach (no frontend changes) but adds infrastructure complexity.
>
> **Option B — Return URL interceptor endpoint:** Create a new API endpoint (e.g.,
> `GET /api/poli-return`) that the frontend calls after being redirected to `SuccessURL`.
> The backend fetches the transaction status from POLi and processes it. This is simpler but
> makes the frontend a passive participant in payment confirmation, which weakens the
> webhook-as-source-of-truth invariant.
>
> **Option C — Hybrid:** Use the return URL to trigger an immediate lookup (fast path),
> with a background worker as a fallback for missed returns. This is the most robust but
> most complex approach.
>
> **Recommendation:** Design decision must be made in Jira 7041 before implementation begins.
> The preferred approach is Option A (polling background worker) to preserve the webhook-as-
> source-of-truth contract.

#### Webhook Signature / Verification Approach

Not applicable. POLi uses the `token` parameter on the return URL to identify the transaction.
The token is used to call the Get Transaction API over HTTPS, which acts as implicit
verification (only the merchant with valid credentials can call the API).

#### Amount and Currency Handling

- POLi amounts are decimal values (not minor units). `209.93` for NZD 209.93.
- Currency is `"NZD"` for New Zealand. POLi supports NZD and AUD only.
- The Get Transaction API response contains `Amount` and `CurrencyCode` which must match the
  session values before processing.

#### Idempotency Key Strategy

The POLi `token` is unique per transaction initiation. The `OnlinePaymentSession.ProviderSessionId`
stores this token. The duplicate-webhook guard in `OnlinePaymentWebhookAppService`
(checking `Status == Completed || PaymentTransactionId.HasValue`) will prevent double-processing
if the polling worker runs multiple times.

#### Return URL Behaviour

POLi redirects to `SuccessURL?token=<Token>` on success, `FailureURL?token=<Token>` on
failure, and `CancellationURL?token=<Token>` on cancellation (if `CancellationURL` is
configured). The token must be used to call the Get Transaction API.

#### Failure / Cancellation Behaviour

- Customer cancels: Redirect to `FailureURL` or `CancellationURL` (if configured).
- Payment fails (bank declines): Redirect to `FailureURL`. Get Transaction API returns
  failure status.
- Transaction expires: POLi transactions expire after a short window (confirm exact duration
  with POLi documentation). No push notification is sent; the polling worker must detect
  expired tokens.

#### Known Risks / Unknowns

- **No standard webhook push.** This is the most significant architectural divergence from
  the existing pattern (see Design decision above).
- **No self-service sandbox.** Credentials must be obtained from POLi directly. Testing may
  require a registered merchant account.
- **Bank simulation.** POLi sandbox may only simulate a limited set of New Zealand banks.
  Not all NZ banks may be testable in sandbox mode.
- **NZ/AU only.** POLi is not available for international customers. The provider should only
  be offered to NZ-based orders.
- **Short transaction expiry.** Confirm the expiry window to set appropriate polling intervals.
- **Polling infrastructure.** A background polling worker is not yet present in the codebase
  for payment purposes. The existing `OrphanedAssetCleanupWorker` pattern can serve as a
  reference, but a new payment-specific worker must be designed.

---

## 4. Proposed Future Jira Breakdown

The following tasks are **planning references only**. No code has been created for them.

| Jira | Title | Notes |
|------|-------|-------|
| 7034 | Implement Stripe sandbox hosted checkout provider | Real `StripeOnlinePaymentProvider` class; `Stripe.net` SDK integration; `SessionService.CreateAsync`; maps `CreateOnlinePaymentProviderSessionRequest` to Stripe session parameters; stores `session.id` and `session.url` in result |
| 7035 | Implement Stripe webhook signature validation and sandbox events | `EventUtility.ConstructEvent`; map `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed` to `OnlinePaymentWebhookOutcome`; extract amount in minor units and convert to decimal; extract `ProviderEventId` for idempotency |
| 7036 | QA Stripe sandbox payment flow | Full QA matrix (Section 7) against Stripe sandbox; use Stripe CLI for webhook forwarding; verify no secrets committed; confirm mock providers still work unchanged |
| 7037 | Implement PayPal sandbox hosted checkout provider | Real `PayPalOnlinePaymentProvider`; OAuth token caching; Orders API v2 create call; extract `id` and approval `href` from response |
| 7038 | Implement PayPal webhook verification and sandbox events | Remote PayPal webhook verification API call; map `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `CHECKOUT.ORDER.CANCELLED` to outcomes; handle OAuth token for verification API |
| 7039 | QA PayPal sandbox payment flow | Full QA matrix against PayPal sandbox; use ngrok or Cloudflare tunnel for webhook delivery; confirm no secrets committed |
| 7040 | Plan Windcave sandbox implementation details | Obtain test credentials from Windcave; confirm XML API details; confirm notification/webhook model; confirm `result` token lookup approach; produce implementation spec |
| 7041 | Plan POLi sandbox implementation details | Obtain test credentials from POLi; confirm polling vs. return-URL approach; design background polling worker if required; produce implementation spec |
| 7042 | Real provider production readiness review | Review all provider implementations against production configuration checklist; confirm all Stage 2 prerequisites from `docs/online-payment-production-configuration-checklist.md` are complete; gate on security review |

---

## 5. Shared Provider Contract Risks

### 5.1 Decimal Amount vs. Minor Unit Amount (Cents)

**Risk:** Different providers use different amount representations.

| Provider | Amount format | Conversion required |
|---------|--------------|---------------------|
| Stripe | Minor units (cents) as integer | `Math.Round(amount * 100)` for send; `/100m` for receive |
| PayPal | Decimal string (`"209.93"`) | None (NZD has 2 decimal places) |
| Windcave | Decimal string (`"209.93"`) | None |
| POLi | Decimal (`209.93`) | None |

**Rule:** Each provider implementation is responsible for its own amount conversion.
The `OnlinePaymentWebhookResult.Amount` field must always be in **major units (dollars)**
so that `OnlinePaymentWebhookAppService` can compare it directly against
`OnlinePaymentSession.Amount`.

### 5.2 Rounding Rules

For Stripe minor-unit conversion, use `Math.Round(amount * 100, MidpointRounding.AwayFromZero)`
to match standard financial rounding. Do not use truncation or banker's rounding.

NZD has 2 decimal places; no 3-decimal currency issues exist for the current implementation.

### 5.3 Currency Code Casing

Providers have differing case requirements:

| Provider | API send | API receive |
|---------|---------|-------------|
| Stripe | lowercase (`"nzd"`) | uppercase (`"NZD"`) |
| PayPal | uppercase (`"NZD"`) | uppercase (`"NZD"`) |
| Windcave | uppercase (`"NZD"`) | uppercase (`"NZD"`) |
| POLi | uppercase (`"NZD"`) | uppercase (`"NZD"`) |

**Rule:** `OnlinePaymentWebhookResult.Currency` must always be **uppercase** before return.
The app service comparison uses `StringComparison.OrdinalIgnoreCase`, which tolerates case
differences, but uppercase is the canonical form for storage.

### 5.4 Webhook Retry Behaviour

Each provider retries webhook delivery on non-2xx responses:

| Provider | Retry count | Retry window |
|---------|------------|-------------|
| Stripe | ~15–18 retries | Up to 72 hours |
| PayPal | ~15 retries | Up to 3 days |
| Windcave | Confirm from documentation | Unknown |
| POLi | N/A (no push webhook) | N/A |

**Rule:** The `PaymentWebhookController` must return HTTP 200 for all known non-retryable
business rejections (amount mismatch, currency mismatch, cancelled order, etc.). This is
already implemented via `KnownWebhookRejectionCodes` and the controller's `catch` clause.
Confirm that all rejection codes used by real provider paths are included in this set.

### 5.5 Signature Validation Failure Behaviour

When a webhook signature cannot be verified:

- **Return `Ignored` from `ParseWebhookAsync`** — do not throw, do not update any session state.
- **Log a warning** with the provider name and a truncated header value for diagnostics.
- **Return HTTP 200 to the provider** (the `Ignored` path returns early in `HandleWebhookAsync`).
- **Do not return HTTP 401 or HTTP 403** — this causes providers to log a failed delivery
  and in some cases alerts the merchant dashboard.

Rationale: An invalid signature could indicate a misconfigured secret, a clock-skew issue,
or a forged request. The `Ignored` path is safe regardless of cause.

### 5.6 Provider Event ID Storage

`OnlinePaymentSession.LastProviderEventId` stores the most recent `ProviderEventId`.
For duplicate detection, the app service checks:
```
session.Status == OnlinePaymentSessionStatus.Completed || session.PaymentTransactionId.HasValue
```
This guards against re-processing on duplicate webhook delivery without needing to query
a separate event log table.

**Limitation:** If a future requirement needs full event history (e.g., for audit or dispute
resolution), the current model only stores the last event ID. A separate event log table
would be required.

### 5.7 Duplicate Webhook Handling

The idempotency guard in `ProcessPaymentCompletedAsync` returns early if the session is
already `Completed` or has a `PaymentTransactionId`. This is provider-agnostic and requires
no change for real providers.

All non-completed outcomes (`PaymentCancelled`, `PaymentExpired`, `PaymentFailed`) also
guard via:
```
if (session.Status != OnlinePaymentSessionStatus.Pending) return; // ignore
```

### 5.8 Provider Session Expiry

Each provider's checkout session has a maximum lifetime:

| Provider | Default session expiry |
|---------|----------------------|
| Stripe Checkout Session | 24 hours |
| PayPal Order | 3 hours |
| Windcave | Confirm from documentation |
| POLi Transaction | Confirm from documentation (expected: 30–60 minutes) |

**Implication:** A customer who abandons checkout and returns after expiry will have a
`Pending` session that will never receive a `Completed` webhook. The production configuration
checklist (Issue 3) documents the need for a background worker to transition stale
`Pending` sessions to `Expired`. This worker must be implemented before any real provider
goes live.

### 5.9 Cancellation Behaviour

- **Stripe:** Customer cancel → redirect to `cancel_url`. No webhook fired immediately.
  Session expires after 24 hours → `checkout.session.expired` event.
- **PayPal:** Customer cancel → redirect to `cancel_url`. `CHECKOUT.ORDER.VOIDED` or
  `CHECKOUT.ORDER.CANCELLED` webhook may follow (not guaranteed).
- **Windcave:** Customer cancel → redirect to `UrlFail`. Notification may follow.
- **POLi:** Customer cancel → redirect to `FailureURL` / `CancellationURL`. No push event.

**Implication:** Relying on cancellation webhooks is unreliable. The stale-session cleanup
worker provides the safety net for all providers.

### 5.10 Provider Checkout URL Expiry

The checkout URL is stored in `OnlinePaymentSession.ProviderCheckoutUrl`. If the customer
navigates away and returns to the success page later, the frontend may attempt to reuse this
URL. Real provider URLs expire with the session — a Stripe checkout URL is unusable after
24 hours. The frontend must not display the checkout URL after the session has expired.
The backend `OnlinePaymentSessionDto` includes the `Status` field, which the frontend should
use to determine whether to offer a new session or show the expiry message.

### 5.11 Refunds and Chargebacks (Out of Scope)

Refunds and chargebacks are explicitly out of scope (see Section 8). These involve
`CHARGE.REFUNDED`, `PAYMENT.CAPTURE.REFUNDED`, and `charge.refunded` / `charge.dispute.created`
event types on the respective providers. The current `OnlinePaymentWebhookResult` model does
not include a `Refunded` or `Disputed` outcome. If these are added in future, they will require
new `OnlinePaymentSessionStatus` values and corresponding UI / email changes.

---

## 6. Configuration Strategy

### 6.1 `UseMockProviders = false` for Sandbox Provider Testing

Setting `OnlinePayments:UseMockProviders` to `false` switches the DI registration from mock
implementations to real implementations. The application module must be updated to register
real providers conditionally:

```csharp
if (!opts.UseMockProviders)
{
    // Register real providers
    context.Services.AddTransient<IOnlinePaymentProvider, StripeOnlinePaymentProvider>();
    // ... PayPal, Windcave when implemented
}
else
{
    context.Services.AddTransient<IOnlinePaymentProvider, MockStripeOnlinePaymentProvider>();
    // ... other mocks
}
```

A provider with `Enabled: false` should not be registered. The resolver will throw if a
disabled provider is requested.

### 6.2 Provider Enabled Flags

Each provider has an `Enabled` flag under `OnlinePayments:Providers:<Name>:Enabled`.
Only enabled providers should be registered and resolvable. Calling
`IOnlinePaymentProviderResolver.Resolve(PaymentProvider.Stripe)` for a disabled provider
must throw with a clear error message (the current resolver already does this for
unregistered providers).

### 6.3 Sandbox / Live Mode Separation

| Setting | Sandbox | Production |
|---------|---------|-----------|
| `UseMockProviders` | `false` | `false` |
| `Stripe:SecretKey` | `sk_test_...` | `sk_live_...` |
| `Stripe:WebhookSecret` | Sandbox endpoint's `whsec_...` | Live endpoint's `whsec_...` |
| `PayPal:Extra["Mode"]` | `"sandbox"` | `"live"` |
| `SuccessReturnBaseUrl` | Staging domain | Production domain |
| Provider `Enabled` | Only tested providers | Only live-contracted providers |

Sandbox and production configurations must be completely separate (different secrets,
different webhook endpoints registered in provider dashboards).

### 6.4 No Secrets in Source Control

`appsettings.json` (committed) must contain only placeholders:

```json
{
  "OnlinePayments": {
    "Enabled": false,
    "UseMockProviders": true,
    "DefaultProvider": "",
    "Currency": "NZD",
    "SuccessReturnBaseUrl": "#{REPLACE_WITH_SUCCESS_URL}#",
    "CancelReturnBaseUrl":  "#{REPLACE_WITH_CANCEL_URL}#",
    "Providers": {
      "Stripe":   { "Enabled": false },
      "Windcave": { "Enabled": false },
      "Poli":     { "Enabled": false },
      "PayPal":   { "Enabled": false }
    }
  }
}
```

Verify with `git grep "sk_test\|sk_live\|whsec_\|client_secret\|AuthenticationCode"` — must
return no matches.

### 6.5 Environment Variables / Deployment Secrets

ASP.NET Core maps `__` to `:` in environment variable names:

```
OnlinePayments__Enabled=true
OnlinePayments__UseMockProviders=false
OnlinePayments__Providers__Stripe__Enabled=true
OnlinePayments__Providers__Stripe__SecretKey=sk_test_...
OnlinePayments__Providers__Stripe__WebhookSecret=whsec_...
```

Recommended injection options (in order of preference):
1. **Azure Key Vault / AWS Secrets Manager / HashiCorp Vault** — for hosted environments.
2. **Environment variables** — for Docker / Kubernetes / App Service.
3. **`appsettings.Sandbox.json` / `appsettings.Staging.json`** — gitignored, deployed via
   CI/CD artifact without committing to source control.

### 6.6 Local Developer Secret Strategy

Use `dotnet user-secrets` for local sandbox development:

```
dotnet user-secrets set "OnlinePayments:UseMockProviders" "false"
dotnet user-secrets set "OnlinePayments:Providers:Stripe:Enabled" "true"
dotnet user-secrets set "OnlinePayments:Providers:Stripe:SecretKey" "sk_test_..."
dotnet user-secrets set "OnlinePayments:Providers:Stripe:WebhookSecret" "whsec_..."
```

`secrets.json` is stored in the user profile (not in the repository) and is automatically
loaded by ASP.NET Core in Development mode. It must never be committed.

Each developer who wants to run real-provider tests locally must obtain their own test
API keys from the provider dashboard and configure them via `dotnet user-secrets`.

### 6.7 Webhook Signing Secrets

Each provider's webhook signing secret is distinct from the API key:
- Stripe: `WebhookSecret` = `whsec_...` (from the specific webhook endpoint entry in dashboard)
- PayPal: `WebhookSecret` = the `webhook_id` from the PayPal Developer webhook registration
- Windcave: `WebhookSecret` = HMAC key (if supported; confirm with Windcave)
- POLi: Not applicable

Signing secrets must be rotated if compromised. After rotation:
1. Update the secret in the secrets manager.
2. Restart the application.
3. Verify the next incoming webhook is accepted (not rejected as invalid signature).

### 6.8 Success / Cancel Return URLs

`SuccessReturnBaseUrl` and `CancelReturnBaseUrl` are set in `OnlinePaymentOptions`.
The app service appends `?orderId=...&orderNumber=...` before passing to the provider.

- In sandbox: use the staging domain (`https://staging.teanova.co.nz/checkout/success`)
  or a localhost tunnel URL.
- In production: use the live HTTPS domain.
- URLs must be HTTPS — providers reject plain HTTP return URLs (Stripe allows `http://localhost`
  in test mode as an exception).
- The path `/checkout/success` must not require authentication.

### 6.9 Localhost + Tunnel Strategy for Sandbox Webhooks

Real payment providers cannot deliver webhooks to `http://localhost`. Options:

| Tool | Approach | Notes |
|------|---------|-------|
| **Stripe CLI** | `stripe listen --forward-to http://localhost:5000/api/payment-webhooks/stripe` | Best option for Stripe; no tunnel required; provides test event injection |
| **ngrok** | `ngrok http 5000` → `https://<random>.ngrok.io` | Works for all providers; free tier has URL changes on restart |
| **Cloudflare Tunnel** | `cloudflared tunnel --url http://localhost:5000` | Stable URL with free account; works for all providers |
| **VS Dev Tunnels** | Built into Visual Studio / VS Code | Convenient for VS users; URL is stable per session |

For PayPal, Windcave, and POLi (which lack a CLI forwarder), a persistent tunnel URL
(Cloudflare Tunnel or ngrok with a paid plan) is preferred so the webhook endpoint URL
does not need to be re-registered in the provider dashboard on every development session.

### 6.10 Production Requires Public HTTPS Domain

Before any provider can be enabled in production:
- The application must be deployed at a public HTTPS domain.
- The TLS certificate must be valid (not self-signed).
- `POST /api/payment-webhooks/{provider}` must return HTTP 200 for a valid minimal payload.
- The domain must be registered as a webhook endpoint in each provider's dashboard.

---

## 7. Sandbox QA Strategy

The following matrix applies to each provider as it is implemented. Run the full matrix for
every provider before marking its QA Jira as complete.

### QA Matrix

| # | Scenario | Steps | Expected Result |
|---|---------|-------|----------------|
| **Session Creation** | | | |
| S-01 | Session creation — success | POST `online-payment-session` for an order with a balance | Returns `OnlinePaymentSessionDto` with `providerCheckoutUrl` pointing to the real provider hosted page (not `mock_` URL) |
| S-02 | Session creation — UseMockProviders = false, SecretKey missing | Attempt session creation without configuring `SecretKey` | Throws a configuration or provider exception; does not create a session record |
| S-03 | Session creation — provider disabled | Attempt session creation with `Providers:Stripe:Enabled = false` | Returns an error; no session created |
| S-04 | Session creation — order already paid | Attempt session creation for a fully-paid order | Returns `TeeNova:Payment:OnlinePaymentNoAmountDue` error |
| **Hosted Checkout Redirect** | | | |
| R-01 | Checkout redirect — URL opens provider page | Open `providerCheckoutUrl` in browser | Provider's hosted payment page renders correctly with correct amount and currency |
| R-02 | Checkout redirect — amount matches | Verify amount shown on provider page | Matches `OnlinePaymentSession.Amount` exactly |
| **Successful Payment Webhook** | | | |
| W-01 | Successful payment — complete flow | Complete payment on provider sandbox page (use test card / test buyer) | Provider delivers webhook; `OnlinePaymentSession.Status = Completed`; `PaymentTransaction` created; order `PaymentStatus = Paid` or `DepositPaid`; receipt email sent |
| W-02 | Successful payment — `ProviderPaymentId` stored | After W-01 | `OnlinePaymentSession.ProviderPaymentId` is populated with the provider's charge/capture ID |
| W-03 | Successful payment — `ProviderEventId` stored | After W-01 | `OnlinePaymentSession.LastProviderEventId` is populated with the provider's event ID |
| **Duplicate Webhook** | | | |
| D-01 | Duplicate webhook — already Completed | Resend the same webhook event (use provider dashboard replay or re-POST) | HTTP 200; no new `PaymentTransaction`; session remains `Completed`; no email sent |
| D-02 | Duplicate webhook — same event ID | Resend with same `ProviderEventId` | HTTP 200; idempotent — no duplicate processing |
| **Failed Payment** | | | |
| F-01 | Failed payment — declined card | Use provider sandbox declined card number | Provider delivers failure webhook; `OnlinePaymentSession.Status = Failed`; order `PaymentStatus` unchanged |
| F-02 | Failed payment — amount visible in admin | After F-01 | Admin order view shows the failed session with `Failed` status |
| **Cancelled Payment** | | | |
| C-01 | Cancelled payment — customer cancels | Click "Cancel" on provider hosted page | Customer redirected to `CancelReturnBaseUrl`; no `PaymentTransaction` created; session eventually transitions to `Cancelled` via webhook or cleanup worker |
| **Expired Payment** | | | |
| E-01 | Expired payment — session times out | Create session; do not complete; wait for provider expiry (or trigger via provider tool) | Provider delivers expiry webhook; `OnlinePaymentSession.Status = Expired` |
| **Amount Mismatch** | | | |
| A-01 | Amount mismatch — webhook reports wrong amount | Send webhook with amount differing from session amount (use mock endpoint for this scenario after real provider validation) | HTTP 200 with `rejected: true`; session transitions to `Failed`; no `PaymentTransaction`; provider does not retry |
| **Currency Mismatch** | | | |
| CU-01 | Currency mismatch — webhook reports wrong currency | Send webhook with currency differing from session currency | HTTP 200 with `rejected: true`; session transitions to `Failed`; provider does not retry |
| **Signature Verification Failure** | | | |
| SIG-01 | Invalid signature — tampered body | Send POST to `/api/payment-webhooks/{provider}` with invalid body and wrong signature | HTTP 200; `Ignored` outcome; no session update; warning logged |
| SIG-02 | Invalid signature — missing header | Send POST without signature header | HTTP 200; `Ignored` outcome; warning logged |
| SIG-03 | Invalid signature — expired timestamp (Stripe) | Send POST with `Stripe-Signature` older than 5 minutes | HTTP 200; `Ignored` outcome; warning logged |
| **Session Not Found** | | | |
| SNF-01 | Session not found — unknown `ProviderSessionId` | Send a valid webhook event with an unknown `ProviderSessionId` | HTTP 200 with `rejected: true`; `WebhookSessionNotFound` code; no session update |
| **Order Cancelled Before Webhook** | | | |
| OC-01 | Order cancelled before webhook | Cancel the order in admin; then deliver a `PaymentCompleted` webhook for its session | HTTP 200 with `rejected: true`; `WebhookOrderCancelled` code; session transitions to `Failed` |
| **Fully Paid Order Before Webhook** | | | |
| OP-01 | Fully paid order — duplicate webhook after payment | Record a manual payment covering full balance; then deliver a `PaymentCompleted` webhook | HTTP 200 with `rejected: true`; `WebhookNoBalanceDue` or `WebhookOverpayment` code; session transitions to `Failed` |
| **Manual Payment Regression** | | | |
| MP-01 | Manual payment unaffected by real provider | Record a manual payment while real provider is enabled | Manual payment records correctly; no online session created; no provider API called |
| MP-02 | Manual + online payment for same order | Record partial manual payment; create online session for remaining balance | Both payments record independently; order `PaymentStatus` correct after both |
| **Frontend Return Pending Safety** | | | |
| FE-01 | Return URL — no premature "paid" display | Complete checkout on provider page; return to success page before webhook delivers | Success page shows amber "pending confirmation" notice; does not show "payment confirmed" |
| FE-02 | Return URL — status updates after webhook | After FE-01, wait for webhook to process | After webhook processes, refreshing success page shows correct `Paid` status |
| **Secrets Audit** | | | |
| SEC-01 | No secrets in source control | After any sandbox config change | `git grep "sk_test\|sk_live\|whsec_\|client_secret"` returns no matches |
| SEC-02 | appsettings.json contains only placeholders | Inspect committed `appsettings.json` | No real keys, URLs, or credentials present |
| SEC-03 | User secrets not committed | Inspect `secrets.json` path | File exists only in user profile; not tracked by git |

---

## 8. Out of Scope

The following items are explicitly excluded from this plan and from all tasks in the 7034–7042 range:

| Item | Reason |
|------|--------|
| **Live production enablement** | Requires Stage 3 prerequisites from `docs/online-payment-production-configuration-checklist.md`; separate gate |
| **Real customer payments** | Sandbox only; no live money is processed during this phase |
| **Refunds** | No refund API or UI exists; requires new model, new endpoint, new provider API calls |
| **Chargebacks** | Handled through provider dashboard; no application-layer support needed |
| **Reconciliation reports** | Separate business requirement; not part of the payment pipeline |
| **Admin provider dashboard** | No admin UI for provider management exists; out of scope for this Epic |
| **Saved cards / tokenisation** | Architecture uses hosted redirect; card details never touch the application server |
| **Recurring / subscription payments** | Not part of the order model |
| **Production credential setup** | Must not be done during sandbox phase |
| **Merchant account creation** | A business/compliance task; not a development task |
| **PCI DSS self-assessment** | Required for Stage 3; not applicable during sandbox |
| **Multi-currency support** | System is NZD-only; currency is a server-side constant |
| **Tax / GST invoice generation** | Separate concern |
| **Fraud detection configuration** | Configured in provider dashboard; no application changes needed |
| **Stale `Pending` session cleanup worker** | Listed as Issue 3 in production checklist; must be designed separately |
| **Expanding Epic 7100 or Epic 7200** | Out of scope per standing constraint |
| **Modifying mock provider behaviour** | Mock providers must remain unchanged for regression testing |
| **Modifying manual payment behaviour** | Manual payment path is stable; must not be affected |
| **Modifying frontend payment success behaviour** | Frontend success page behaviour must remain unchanged |

---

*Document maintained by the TeeNova development team.*  
*Phase 13A — Planning only. No SDK packages, credentials, or appsettings changes were made.*

*Pre-conditions for Jira 7034:*  
*— Issue 1 (currency symbol locale): Resolved in Jira 7030. Currency display is now locale-independent using explicit NZD formatting (`FormatCurrency` → `$"{amount:F2} NZD"`).*  
*— Issue 2 (HTTP 500 for non-retryable webhook rejections): Resolved in Phase 12D-8. `PaymentWebhookController` returns HTTP 200 with `rejected: true` for all `KnownWebhookRejectionCodes`.*  
*Both pre-conditions are satisfied. Jira 7034 may begin.*
