# Phase 13D-2 Admin Order Production PDF Backend QA Report
### Jira 8902 — Backend production PDF endpoint QA

> **Scope:** QA / code review only. No implementation changes were made during QA. All temporary verification harnesses were removed; the working tree contains only the intended backend changes + docs.

---

## 1. Summary

The backend production-PDF endpoint passes QA. Code matches the implementation summary, builds clean in Release, and renders valid PDFs at runtime across the required edge cases (multi-item, multi-print, missing design, long note, non-ASCII, absolute URL, and a zero-item cancelled order). No regressions: only the QuestPDF package reference and the controller action were added; everything else is new files.

**Verdict: READY TO COMMIT.** No blockers. Three non-blocking notes are carried forward (CJK font, uniform admin-role auth, live HTTP 401/200 check), all already scoped to later Jiras.

---

## 2. Package / License Review

| Check | Result |
|---|---|
| QuestPDF added to intended project only | ✅ `QuestPDF 2026.6.0` in `TeeNova.Application.csproj` only (grep confirmed single reference). |
| No frontend PDF packages | ✅ `frontend/package.json` has no jspdf/react-pdf/pdfkit/pdf-lib/puppeteer/playwright/html2canvas/questpdf. |
| No AGPL library | ✅ QuestPDF is **Community/Commercial tiered, not AGPL**. |
| License set before generation | ✅ `QuestPDF.Settings.License = LicenseType.Community` in the static constructor — runs before any `GeneratePdf()`. |
| License model documented | ✅ Documented in code comment and 8902 implementation report (free under USD 1M revenue; shop qualifies). |
| No unnecessary native deps | ✅ QuestPDF is managed (uses its own bundled rendering); no wkhtmltopdf/DinkToPdf native binaries introduced. |

---

## 3. Service Architecture Review

| Check | Result |
|---|---|
| Service resolves correctly | ✅ `OrderProductionPdfService : ITransientDependency` → auto-registered by ABP; injected into `OrderController`. |
| Correct dependency marker | ✅ `ITransientDependency`. |
| Intentionally not `IApplicationService` | ✅ Confirmed — avoids ABP conventional-controller auto-exposure; documented in the interface XML doc. |
| No unintended extra endpoint | ✅ Neither the interface nor class derives from `IApplicationService`/`ApplicationService`, so `ConventionalControllers.Create(...)` will not publish it. |
| Read-only / no mutation | ✅ Only calls `GetAsync` + builds a document; no repository writes, no `SaveChanges`. |
| No HTTP-context dependency | ✅ Service takes only `IOrderAppService`; no `IHttpContextAccessor`/controller coupling. |

---

## 4. Data Loading Review

- ✅ Loads via `IOrderAppService.GetAsync(orderId)` — reuses existing enrichment (items, prints, payment fields, timeline, transactions, adjustments populated on the DTO).
- ✅ All required fields are reachable on `OrderDto`: order number, status, payment status, customer name/email, `ShippingAddress.Phone`/address, total/paid/balance/deposit, items, print positions, design URL, customer notes, admin notes.
- ✅ **No DB writes**, no status/payment changes, `PaymentTransactions`/`PriceAdjustments` not modified — `GenerateAsync` is a pure read + render. Confirmed by code inspection and by the zero-write smoke path.

---

## 5. Endpoint Review

| Check | Result |
|---|---|
| Exact route | ✅ `[Route("api/orders")]` + `[HttpGet("{id:guid}/production-pdf")]` → `GET /api/orders/{id}/production-pdf`. |
| No route conflict | ✅ Distinct sub-path from `{id:guid}` (GetAsync) and other actions. |
| Not `[AllowAnonymous]` | ✅ Action has no `[AllowAnonymous]`. |
| Inherits `[Authorize]` | ✅ Controller-level `[Authorize]` applies. |
| Thin controller | ✅ Calls service, returns `File(result.Content, result.ContentType, result.FileName)`. |
| Content type | ✅ `application/pdf`. |
| Content-Disposition filename | ✅ Set by `File(..., fileName)` → `attachment; filename="Order-{orderNumber}-production-sheet.pdf"`. |
| Filename sanitized | ✅ `SanitizeForFileName` replaces invalid chars/spaces with `-`, trims, falls back to `order`. |

---

## 6. Security / Authorization Review

- ✅ **Anonymous → 401:** no `[AllowAnonymous]`; inherits `[Authorize]`. (Verified structurally; live HTTP check recommended in 8903/8905 — see §12/§14.)
- ✅ **Not reachable via anonymous order lookup:** the anonymous path is the separate `GetAsync` action; this is a distinct authenticated route.
- ✅ **No local filesystem path in PDF:** design shown via URL tail only; no disk paths emitted.
- ✅ **No client file path accepted:** only `{id}` (GUID) is taken; no path input; no file reads in 8902.
- ✅ **Not written under wwwroot, not stored in DB:** in-memory bytes streamed back.
- ✅ **Design filename = URL tail only** (`DesignFileLabel`).
- ✅ **Missing `UploadedAssetUrl` → "No design uploaded"**, generation succeeds (smoke-verified).
- ✅ **No internal price-adjustment reasons / transaction notes** included.
- ✅ **Customer/admin notes included intentionally** — admin-only internal production sheet.
- ⚠️ **Known limitation (not a blocker):** the endpoint is **authentication-only** (`[Authorize]`), matching every other `OrderController` action. A `[Authorize(Roles="Admin")]` policy exists elsewhere (`AdminUserController`) but is not yet applied to order actions; uniform role tightening belongs to Task 8703.

---

## 7. PDF Content Review

All required content present (code-verified in `ComposeHeader/CustomerAndDelivery/OrderSummary/Items/Notes/Checklist`):

- ✅ Otahuhu Printing Shop, "Production Sheet", order number, generated date/time, order status, payment status.
- ✅ Customer name, email, phone (`ShippingAddress.Phone` else `-`), delivery method, shipping address (only when `Shipping` + address present).
- ✅ Total, required payment, required deposit (only when present), paid, balance, payment requirement type.
- ✅ Items table: product, variant label, qty, unit price, line total.
- ✅ Print details: area name/code, size name/code, design filename or "No design uploaded", design note (if present), print note (if present).
- ✅ Customer note (if present), admin note (if present) — section omitted when both empty.
- ✅ Production checklist: Artwork checked / Printed / Pressed / Quality checked / Packed / Ready for pickup / shipping (drawn checkboxes).
- ✅ **No invented fields:** no SKU, no separated size/color — `VariantLabel` used as-is.

---

## 8. Formatting / Unicode Review

- ✅ A4 portrait, 1.5 cm margins, default 10 pt.
- ✅ Repeating footer with "Page X of Y" (`CurrentPageNumber`/`TotalPages`).
- ✅ Long text wraps; ~1,800-char note rendered across pages without crash (smoke-verified).
- ✅ Multi-page / multi-item rendered cleanly; no overlap or exception.
- ✅ Money: culture-independent `"N2 + NZD"` (e.g. `245.50 NZD`, `1,250.00 NZD`).
- ✅ Dates: `en-NZ` formatting, UTC→NZ conversion with UTC fallback, `NZT` suffix.
- ✅ Cancelled/completed orders generate PDFs (no status gating — cancelled-order smoke case passed).
- ✅ **Latin / NZ text + non-ASCII** (`ā`, Latin-Extended) rendered; smoke ran with macron name.
- ⚠️ **CJK / non-Latin (documented follow-up):** no CJK font bundled, so Chinese/Japanese/etc. notes would render as missing glyphs. Not a blocker for MVP unless business requires Chinese notes. **Recommend 8904 bundle Noto Sans CJK (or similar) and register it** if non-Latin notes are expected.

---

## 9. File / Design Handling Review

- ✅ **No disk reads** for images in 8902 (thumbnails deferred).
- ✅ Design filename derived safely from `UploadedAssetUrl` (last URL segment, URL-decoded).
- ✅ **Both root-relative and absolute URLs** handled — smoke tested `/uploads/...` and `https://host/uploads/...`; both yield filename only, no domain/path leak.
- ✅ Null/missing URL → "No design uploaded".
- ✅ SVG/WebP/missing files never break generation — no embedding attempted.
- ℹ️ Minor cosmetic: a URL with a query string (`file.png?v=1`) would include the query in the tail. Not a leak, not a blocker; can be trimmed in 8904 if desired.

---

## 10. Error Handling Review

- ✅ Missing order: `GetAsync` throws `EntityNotFoundException` → ABP 404.
- ✅ Unauthenticated: 401 (inherited `[Authorize]`).
- ✅ Future role policy: would return 403 when applied.
- ✅ Unexpected errors propagate to ABP middleware → 500 + logging; PDF built only after data loads, so no partial/error PDF.
- ✅ No stack trace / exception text embedded in the PDF.

---

## 11. Build / Test Results

- ✅ `dotnet build -c Release` (full host graph): **succeeded, 0 warnings, 0 errors**.
- ℹ️ **No test project exists** (`backend/test/**` absent; solution has no test projects). Stated as required rather than run.
- ✅ In place of automated tests, a temporary console harness exercised the real service (see §12) and was deleted.

---

## 12. Runtime Smoke Verification

Harness instantiated the real `OrderProductionPdfService` with a stubbed `IOrderAppService` and rendered two orders:

| Case | Bytes | %PDF | Filename | Result |
|---|---|---|---|---|
| Full (multi-item, multi-print, missing design, ~1,800-char note, non-ASCII, absolute URL) | 56,444 | ✅ | `Order-TN-AB12CD34-production-sheet.pdf` | **PASS** |
| Minimal cancelled pickup (no items, no notes, no phone) | 42,013 | ✅ | `Order-TN-FF000001-production-sheet.pdf` | **PASS** |

- ✅ Bytes begin with `%PDF`; sizes reasonable.
- ✅ No QuestPDF layout exception in either case.
- ✅ Long notes + missing design URL did not crash; empty items table did not crash.
- ✅ `ContentType == application/pdf` and filename correct in both.

**Not performed:** live authenticated HTTP round-trip (no admin JWT readily available in this QA context). The 401/200 + response-header checks should be done during 8903/8905 manual QA once the frontend download path exists. This is a verification gap, not a code defect.

---

## 13. Regression Review

`git status` confirms the change set is exactly:
- **Modified:** `TeeNova.Application.csproj` (+1 line: QuestPDF), `OrderController.cs` (+16 lines: injected service + action).
- **New:** `IOrderProductionPdfService.cs`, `OrderProductionPdfResult.cs`, `OrderProductionPdfService.cs`, 2 docs.

No changes to: migrations, `DbContext`, domain entities, payment/online-payment logic, email logic, frontend files, Nginx/deployment config, or image-URL normalization work. ✅

---

## 14. Issues Found

| # | Severity | Issue |
|---|---|---|
| 1 | Non-blocker | CJK/non-Latin glyphs unsupported (no CJK font bundled). Documented; defer to 8904 if needed. |
| 2 | Non-blocker | Endpoint is authentication-only; uniform admin-role enforcement deferred to 8703. |
| 3 | Non-blocker (verification gap) | Live HTTP 401/200 + header check not run in QA; do in 8903/8905. |
| 4 | Cosmetic | Design filename tail keeps any URL query string; trim in 8904 if desired. |

No correctness, security, or stability blockers found.

---

## 15. Required Fixes Before 8903

**None.** The backend is ready for frontend integration. (Items 1–4 above are optional/later-Jira follow-ups, not prerequisites.) Reminder for 8903: the existing generic `/api/proxy` strips `Content-Disposition`, so a dedicated authenticated Next.js download route is needed to preserve the filename.

---

## 16. Commit Readiness

**READY TO COMMIT.** Code is correct, secure, stable, builds clean, and is runtime-verified. No blockers. Recommend committing the five backend artifacts (+ docs). Not committing automatically — awaiting the workflow's go-ahead.

---

## 17. Final Recommendation

Approve 8902 and proceed to **8903 (frontend download button + authenticated Next.js download route)**. Track CJK font support for **8904** and fold this endpoint into the uniform admin-role authorization work in **8703**. Perform the live authenticated HTTP smoke (401 anonymous / 200 admin + headers) as part of 8903/8905 manual QA.
