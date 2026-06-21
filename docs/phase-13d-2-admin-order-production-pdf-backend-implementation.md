# Phase 13D-2 Admin Order Production PDF Backend Implementation Report
### Jira 8902 — Implement backend production PDF endpoint

> **Scope:** Backend only. No frontend button, no Next.js download route, no migrations, no schema/data changes, no payment-logic or deployment changes, no PDF persistence. PDF is generated **in memory, on demand**.

---

## 1. Summary

Implemented an authenticated, on-demand backend endpoint that returns an A4 **Production Sheet** PDF for an order:

```
GET /api/orders/{id}/production-pdf  →  application/pdf (attachment)
```

The PDF is rendered with **QuestPDF** (Community licence) in a dedicated service that loads order data through the existing `IOrderAppService.GetAsync` enrichment, so items, print positions, and payment fields stay consistent with the admin UI. Nothing is written to disk or the database; bytes are produced in memory and streamed back.

Build is clean (`dotnet build -c Release`, 0 errors). A throwaway runtime smoke test rendered a valid 53 KB PDF covering multi-item / multi-print / missing-design / long-note / non-ASCII / shipping-address cases without any QuestPDF layout exception, then was removed.

---

## 2. Package / License Decision

- **Package added:** `QuestPDF` `2026.6.0` → `TeeNova.Application` project only.
- **License (verified from nuget.org):** QuestPDF uses a **Community / Commercial tiered model** — **not MIT, not AGPL**. The **Community tier is free** for individuals, non-profits, all FOSS projects, and **organizations under USD 1M annual revenue**.
- **Acceptability:** Otahuhu Printing Shop is well under the USD 1M threshold, so the Community tier applies at no cost and with no copyleft obligations. **Acceptable.** The AGPL prohibition is satisfied (QuestPDF is not AGPL).
- **Activation:** `QuestPDF.Settings.License = LicenseType.Community;` is set once in the service's static constructor, before any document is generated.
- No frontend PDF packages were added.

---

## 3. Files Changed

| File | Change |
|---|---|
| [`TeeNova.Application/TeeNova.Application.csproj`](../backend/src/TeeNova.Application/TeeNova.Application.csproj) | Added `QuestPDF 2026.6.0` package reference. |
| [`TeeNova.Application.Contracts/Orders/IOrderProductionPdfService.cs`](../backend/src/TeeNova.Application.Contracts/Orders/IOrderProductionPdfService.cs) | **New.** Service contract (`GenerateAsync(Guid)`), deliberately not `IApplicationService`. |
| [`TeeNova.Application.Contracts/Orders/Dtos/OrderProductionPdfResult.cs`](../backend/src/TeeNova.Application.Contracts/Orders/Dtos/OrderProductionPdfResult.cs) | **New.** Result DTO: `Content` (bytes), `FileName`, `ContentType`. |
| [`TeeNova.Application/Orders/OrderProductionPdfService.cs`](../backend/src/TeeNova.Application/Orders/OrderProductionPdfService.cs) | **New.** QuestPDF document composition + formatting/sanitization helpers. |
| [`TeeNova.HttpApi/Orders/OrderController.cs`](../backend/src/TeeNova.HttpApi/Orders/OrderController.cs) | Injected `IOrderProductionPdfService`; added authenticated `GET {id}/production-pdf` action. |

No migrations, no `DbContext`, no domain entities changed.

---

## 4. Service Design

- **`IOrderProductionPdfService.GenerateAsync(Guid orderId) → Task<OrderProductionPdfResult>`**. The result carries `Content`/`FileName`/`ContentType` (matches the 8901 recommendation).
- **`OrderProductionPdfService`** implements `ITransientDependency` (auto-registered by ABP) and **is intentionally NOT an `IApplicationService`**. The host enables `ConventionalControllers.Create(...)` over the Application assembly, so an application service would be auto-published as a second HTTP endpoint. Keeping it a plain service guarantees the PDF is reachable **only** through the explicit, authenticated controller action.
- **Data loading:** the service depends on `IOrderAppService` and calls `GetAsync(orderId)`, reusing the existing enrichment (items, prints, payment fields, etc.). No circular dependency (`OrderAppService` does not depend on the PDF service) and no duplicated query logic. The service is **read-only** — it mutates no state.
- **Controller is thin:** it calls the service and returns `File(bytes, "application/pdf", fileName)`.

---

## 5. Endpoint

```
GET /api/orders/{id:guid}/production-pdf
```
- **Response:** `200 application/pdf`, body = PDF bytes.
- **Content-Disposition:** `attachment; filename="Order-{orderNumber}-production-sheet.pdf"` (set by ASP.NET Core `File(...)` via the download name).
- **Filename:** `Order-{orderNumber}-production-sheet.pdf`, order number sanitized (invalid filename chars and spaces → `-`).
- **Auth:** inherits the controller-level `[Authorize]`. **No `[AllowAnonymous]`** (unlike the sibling customer `GetAsync`).

---

## 6. PDF Content Implemented

A4 portrait, 1.5 cm margins, default 10 pt text, repeating footer with "Page X of Y".

1. **Header** — "Otahuhu Printing Shop", "Production Sheet", order number, generated date/time (NZ time), order status, payment status.
2. **Customer & Delivery** — name, email, phone (`ShippingAddress.Phone`, else `-`), delivery method (Pickup/Shipping); shipping address shown only when `Shipping` and an address exists.
3. **Order Summary** — payment requirement type, total, required payment, required deposit (only when present), paid amount, balance. (Small, customer-safe summary — **no** internal price-adjustment reasons or transaction notes.)
4. **Items table** — Product · Variant (`VariantLabel` as-is) · Qty · Unit · Line total. **No SKU, no separated size/color** (none exist in the data — not invented).
5. **Print details** (per item, below the table so each wraps freely) — print area name/code, print size name/code, design filename (URL tail) or "No design uploaded", design note, print note.
6. **Notes** — customer note and admin / special instructions (section omitted entirely when both are empty).
7. **Production checklist** — empty drawn checkboxes: Artwork checked · Printed · Pressed · Quality checked · Packed · Ready for pickup / shipping.

Money is formatted culture-independently as `"1,250.00 NZD"`. Dates use `en-NZ` formatting converted to NZ time with a UTC fallback. Long text wraps; tables continue across pages.

**Not included (deliberate, per scope / customer-safety):** price-adjustment reason history, per-transaction internal notes, barcode/QR, image thumbnails.

---

## 7. File / Design Handling

- Design files are shown by **filename only** — the final segment of the stored URL (`/uploads/designs/<file>` → `<file>`), URL-decoded. **No domain and no local filesystem path** ever appears.
- Missing `UploadedAssetUrl` → renders **"No design uploaded"**; generation never fails on it.
- **No client-supplied paths** are accepted and **no files are read from disk** in this Jira — thumbnail embedding was deliberately deferred (it adds local-file resolution, SkiaSharp raster handling, and SVG/WebP fallbacks for marginal MVP value). SVG/WebP therefore fall back to filename automatically, as required. Thumbnail embedding remains a clean follow-up (8904).

---

## 8. Security / Authorization

- **Authenticated:** the action carries no `[AllowAnonymous]`, so it inherits the controller `[Authorize]`. Anonymous requests get `401`. It is **not** reachable via the anonymous customer order-lookup path (which is the separate `GetAsync` action).
- **Authorization convention / documented limitation:** a role policy `[Authorize(Roles = "Admin")]` exists in the codebase ([`AdminUserController`](../backend/src/TeeNova.HttpApi/Auth/AdminUserController.cs#L14)), **but `OrderController`'s protected actions (status changes, record-payment, adjust-price, etc.) all use plain `[Authorize]` (authentication-only)**. To stay consistent with every other order-management action, this endpoint uses the same plain `[Authorize]` rather than singling itself out with a stricter role. Tightening order actions to `Roles = "Admin"` should be done **uniformly across the controller** (aligns with the pending admin-authorization work, Task 8703), not piecemeal on this one route.
- **No path traversal / no disk reads:** the service resolves no file paths and reads no files from user input.
- **No public output:** bytes are generated in memory and streamed; nothing is written under `wwwroot` or stored in the database.
- **No internal-only leakage:** price-adjustment reasons and transaction notes are excluded from the PDF.

---

## 9. Error Handling

- **Order not found:** `GetAsync` throws `EntityNotFoundException` → ABP maps to **404**.
- **Unauthenticated:** **401** (inherited `[Authorize]`).
- **Unauthorized (once role policy applies):** **403**.
- **Missing/optional design file:** does **not** fail — the filename/placeholder is shown instead.
- **Unexpected error:** propagates to ABP's exception middleware → normal **500** with logging. No stack traces or exception text are embedded in the PDF (the PDF is only built after data loads successfully).

---

## 10. Build Results

- `dotnet build backend/src/TeeNova.HttpApi.Host/...csproj -c Release` → **succeeded, 0 errors** (full dependency graph compiled; QuestPDF restored cleanly). The only warning is a pre-existing nullability warning in `ShippingAddress.cs`, unrelated to this change.
- **No test project exists** in the repository (`backend/test/**` is empty). As required, this is stated explicitly rather than run.
- In lieu of a test project, a temporary console smoke harness instantiated the real service with a stubbed `IOrderAppService` and generated a PDF from a synthetic enriched order. Result: valid `%PDF` header, **53,021 bytes**, "SMOKE TEST PASSED". The harness was deleted afterward (no residual files).

---

## 11. Manual Verification

| # | Check | Result |
|---|---|---|
| 1 | Endpoint exists (`GET /api/orders/{id}/production-pdf`) | ✅ Added to `OrderController`. |
| 2 | Anonymous request → 401 | ✅ By design (inherited `[Authorize]`, no `[AllowAnonymous]`). Verify live once frontend/route exists. |
| 3 | Authenticated request → 200 `application/pdf` | ✅ Controller returns `File(..., "application/pdf", ...)`; smoke test confirms valid PDF bytes. |
| 4 | `Content-Disposition` filename correct | ✅ `Order-{orderNumber}-production-sheet.pdf` via `File(...)` download name. |
| 5 | PDF opens in a normal viewer | ✅ Valid `%PDF` document produced (53 KB) and written to a temp file during smoke test. |
| 6 | Contains order #, customer, summary, items, prints, notes, checklist | ✅ All sections composed. |
| 7 | Cancelled/completed orders still generate | ✅ No status gating in the service. |
| 8 | Missing design URL does not crash | ✅ Smoke test included a null design URL → "No design uploaded". |
| 9 | No physical filesystem path in PDF text | ✅ Filename-tail only; no disk paths emitted. |
| 10 | No DB writes | ✅ Read-only path (`GetAsync` + in-memory render). |

> Items 2/3/4/5 are confirmed structurally and via the offline smoke test; an end-to-end HTTP check with a real JWT belongs to the manual QA in 8903/8905 once the frontend download path exists.

---

## 12. Out-of-Scope Items (deferred)

Frontend admin button; Next.js authenticated download route; blob download helper; advanced PDF styling; QR/barcode; full thumbnail / SVG / WebP rasterization; persistent PDF archive storage; public/customer PDF access; customer email attachments. (Tracked for 8903/8904/8905.)

---

## 13. Issues / Notes

- **CJK / full-Unicode fonts (risk / follow-up):** QuestPDF's bundled default font covers Latin (incl. Latin-Extended, e.g. `ā`), so common NZ text renders correctly. **CJK and other non-Latin scripts in customer/admin notes would render as missing glyphs** until a CJK-capable font (e.g. Noto Sans CJK) is bundled and registered. Deliberately not solved here to avoid shipping a large font binary in an MVP backend Jira — recommend addressing in 8904 if non-Latin notes are expected.
- **Auth tightening (cross-ref Task 8703):** see §8 — endpoint is authentication-only to match sibling order actions; role enforcement should be applied controller-wide later.
- **Timezone:** NZ time conversion uses `Pacific/Auckland` (Linux) / `New Zealand Standard Time` (Windows) with a UTC fallback if the tz database is unavailable on the host.
- **Thumbnails:** intentionally omitted (§7) to keep generation robust against missing/unsupported design files; clean follow-up.

---

## 14. Final Recommendation

The backend production-PDF endpoint is complete, builds clean, and renders a valid A4 PDF on demand with the required content, filename, and content type — authenticated, read-only, and non-persistent. Proceed to **8903 (frontend download button + authenticated Next.js download route)**, remembering that the existing generic `/api/proxy` strips `Content-Disposition` (per the 8901 audit), so a dedicated authenticated download route is needed to preserve the filename. Address **CJK font support (8904)** if non-Latin notes are expected, and fold this endpoint into the **uniform admin-role authorization** work in **8703**.
