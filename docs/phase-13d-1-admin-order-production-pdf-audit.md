# Phase 13D-1 Admin Order Production PDF Audit Report
### Jira 8901 — Audit admin order production PDF requirements and technical approach

> **Status:** Audit / planning only. No source code, migrations, database, packages, payment logic, or deployment config were changed. No PDF was generated.

---

## 1. Summary

The admin order detail page needs a button that produces a clean, printable **A4 production sheet** for the workshop (and archival). All the data required for an MVP production sheet **already exists** in `OrderDto` and is already loaded by `OrderAppService.GetAsync` (items, prints, timeline, payment transactions, price adjustments). No new query or DTO is strictly required for the MVP.

There is **no PDF tooling anywhere** in the codebase today — no .NET PDF library and no frontend PDF library.

**Recommendation:** Build a **backend-generated PDF endpoint** (Option A) using **QuestPDF** (MIT/Community license, pure-managed, no native binaries, .NET 8 + Linux friendly). The endpoint is admin-authenticated, generates the PDF on demand, and does not persist anything. The frontend adds a single "Download Production PDF" button in the order header. Because the existing admin proxy and the existing public download proxy are **both unsuitable as-is** for an authenticated binary download, the frontend needs a **small dedicated download route** (or a blob-fetch helper) — this is the main piece of plumbing to get right.

Two notable data gaps to flag with the business (neither blocks MVP):
- There is **no product SKU** and **no separate size/color** on order items — variant is a single `VariantLabel` string (e.g. `"Red / XL"`).
- There is **no dedicated customer phone** — the only phone is `ShippingAddress.Phone`.

---

## 2. Current Order Data Available for PDF

Source of truth: [`OrderDto.cs`](../backend/src/TeeNova.Application.Contracts/Orders/Dtos/OrderDto.cs), enriched by [`OrderAppService.GetAsync`](../backend/src/TeeNova.Application/Orders/OrderAppService.cs#L163).

### Order — available
| Requested field | Available? | Source |
|---|---|---|
| order id | ✅ | `OrderDto.Id` |
| order number | ✅ | `OrderNumber` (e.g. `TN-1A2B3C4D`) |
| order status | ✅ | `Status` enum + `DisplayStatus` (customer-facing label) |
| payment status | ✅ | `PaymentStatus` |
| payment requirement type | ✅ | `PaymentRequirementType` (`FullPaymentRequired` / `DepositThenBalance`) |
| created date | ✅ | `CreationTime` |
| updated date | ⚠️ | **Not in DTO.** Entity is `FullAuditedAggregateRoot` so `LastModificationTime` exists in DB; would need to be exposed on the DTO if wanted. |
| total amount | ✅ | `TotalAmount` |
| required payment amount | ✅ | `RequiredPaymentAmount` |
| required deposit amount | ✅ | `RequiredDepositAmount` (nullable) |
| paid amount | ✅ | `PaidAmount` |
| balance amount | ✅ | `BalanceAmount` |
| customer notes | ✅ | `Notes` |
| admin notes | ✅ | `AdminNotes` |
| pickup/shipping method | ✅ | `DeliveryMethod` (nullable: `Pickup` / `Shipping`) |
| shipping address | ✅ | `ShippingAddress` (full address + optional phone) |

Extra payment fields also present: `DepositPaidAt`, `FullyPaidAt`, `LastPaymentMethod`, `LastPaymentReference`, `LastPaymentNote`.

### Customer — mostly available
| Requested field | Available? | Source |
|---|---|---|
| name | ✅ | `CustomerName` |
| email | ✅ | `CustomerEmail` |
| phone | ⚠️ | **No dedicated customer phone.** Only `ShippingAddress.Phone` (nullable). Use that as the phone for the sheet. |

### Items — available (with two gaps)
Source: [`OrderItemDto.cs`](../backend/src/TeeNova.Application.Contracts/Orders/Dtos/OrderItemDto.cs)
| Requested field | Available? | Source |
|---|---|---|
| product name | ✅ | `ProductName` |
| product SKU | ❌ | **Not stored on the order item.** Only `ProductId` / `ProductVariantId` GUIDs. |
| product variant | ✅ | `VariantLabel` (single string, e.g. `"Red / XL"`) |
| size | ⚠️ | Not separated — embedded in `VariantLabel`. |
| color | ⚠️ | Not separated — embedded in `VariantLabel`. |
| quantity | ✅ | `Quantity` |
| unit price | ✅ | `UnitPrice` |
| line total | ✅ | `LineTotal` (computed `UnitPrice * Quantity`) |

### Print details (per item) — available
Source: [`OrderItemPrintDto.cs`](../backend/src/TeeNova.Application.Contracts/Orders/Dtos/OrderItemPrintDto.cs)
| Requested field | Available? | Source |
|---|---|---|
| print positions | ✅ | one `OrderItemPrintDto` per position (`SortOrder` orders them) |
| print area | ✅ | `PrintAreaName` + `PrintAreaCode` + `PrintAreaPrice` |
| print size | ✅ | `PrintSizeName` + `PrintSizeCode` + `PrintSizePrice` |
| selected print options | ✅ | area + size snapshots are the print options |
| uploaded design URL | ✅ | `UploadedAssetUrl` (root-relative, nullable) |
| uploaded design note | ✅ | `DesignNote` + per-position `Notes` |
| uploaded design filename | ⚠️ | **Not on the print DTO.** Currently derived from the URL tail in the UI. The real original filename lives on `UploadedAsset.OriginalFileName` but is **not joined** into the order DTO. |

### Payment / history — available
- `PaymentTransactions` — full list (`Amount`, `Method`, `Reference`, `Note`, `CreationTime`). Source: [`PaymentTransactionDto.cs`](../backend/src/TeeNova.Application.Contracts/Orders/Dtos/PaymentTransactionDto.cs)
- Last payment method/reference/note — `LastPaymentMethod` / `LastPaymentReference` / `LastPaymentNote`.
- Price adjustments (Phase 13C) — `PriceAdjustments[]`, `HasPriceAdjustment`, `LastPriceAdjustedAt`, `LastPriceAdjustmentReason`, `LastPriceAdjustmentAmount`. Source: [`OrderPriceAdjustmentDto.cs`](../backend/src/TeeNova.Application.Contracts/Orders/Dtos/OrderPriceAdjustmentDto.cs). ⚠️ Adjustment `Reason` and `AdjustedByUser` are **internal admin data** — include with care (see §11 security).
- Timeline events — `Timeline[]` (`EventType`, `Status`, `Description`, `CreationTime`). Source: [`OrderTimelineEntryDto.cs`](../backend/src/TeeNova.Application.Contracts/Orders/Dtos/OrderTimelineEntryDto.cs)

**Conclusion:** The DTO covers ~95% of the requested PDF content. Gaps (updated date, SKU, separated size/color, original design filename) are minor and can be added later by extending the DTO/mapper — they are not MVP blockers.

---

## 3. Current Admin Order UI Findings

Source: [`admin/orders/[id]/page.tsx`](../frontend/src/app/admin/orders/[id]/page.tsx)

The page is a client component (`'use client'`) that fetches the full order via `ordersApi.getById(id)` through `adminApiClient`. Layout:

- **Page header** (lines ~490–509): back link, `order.orderNumber` title, `OrderStatusBadge`, placed date. **There is currently no actions row here** — this is the natural home for the new button.
- **OrderActionPanel** — status/activation actions.
- **Pipeline progress card** — fulfillment actions (Mark Ready / Complete / Cancel).
- **Left column:** Customer card, Shipping Address card, `PaymentSection`, Customer Note, `NotesPanel` (admin notes), `NotificationPanel`, Activity `OrderTimeline`, `FulfillmentPanel`.
- **Right column:** Order Items with per-print `PrintDesignCard` (thumbnail, area/size badges, filename, design note, download/replace/clear).

**The page already has all required data loaded** — the same `OrderDto` the PDF needs. No extra data fetch is required for the UI.

### Button recommendation
- **Label:** **"Download Production PDF"** (clearest action + intent). "Production Sheet" is a good secondary/short label; avoid "Print Order PDF" (implies browser print).
- **Placement:** **Order title/header row**, right-aligned (add a flex actions area opposite the order number). It is an always-available, order-wide action (not tied to a status or to fulfillment), so it does not belong inside the pipeline, payment, or fulfillment panels.
- **Visibility:** Show for all statuses including Completed/Cancelled (archival use). Optionally disable while `loading`.

---

## 4. Existing File / Download Patterns

Two download mechanisms exist; **neither is directly reusable** for an authenticated binary PDF:

**(a) Public design download — [`/api/download/route.ts`](../frontend/src/app/api/download/route.ts)**
Used by [`DownloadDesignButton`](../frontend/src/components/orders/DownloadDesignButton.tsx) (`/api/download?url=...`). It `new URL(url)`'s the param (so it **requires an absolute URL**), blocks non-http(s) schemes, fetches the file, and streams it back with `Content-Disposition: attachment`. **It adds no auth** — it is a generic public passthrough. Not suitable for an admin-only PDF, and it can't address an authenticated backend endpoint that needs the bearer token.

**(b) Admin API proxy — [`/api/proxy/[...path]/route.ts`](../frontend/src/app/api/proxy/[...path]/route.ts)**
Reads the HttpOnly `admin_token` cookie, adds `Authorization: Bearer`, forwards to the backend. **Two problems for binary:**
1. It only forwards `Content-Type` — it **drops `Content-Disposition`**, so the suggested filename would be lost.
2. The client wrapper [`admin-client.ts`](../frontend/src/lib/admin-client.ts) `handleResponse` always calls `res.json()`, so the typed `adminApiClient.get()` **cannot return a binary blob**.
   (The route itself does buffer the body via `arrayBuffer()` and return it, so binary *can* physically pass through — but via a hand-rolled `fetch`, not the typed client.)

### How admin-authenticated PDF download should be implemented
Two viable options:

- **Option 1 (recommended) — dedicated Next.js download route**, e.g. `app/api/orders/[id]/production-pdf/route.ts`. It reads the `admin_token` cookie (same pattern as the proxy), calls the backend PDF endpoint with the bearer token, and **passes through both `Content-Type` and `Content-Disposition`**. The button is a plain `<a href download>` — simplest UX, correct filename, no client JS needed. This mirrors the existing `/api/download` shape but adds admin auth.
- **Option 2 — client blob fetch**: button does `fetch('/api/proxy/api/orders/{id}/production-pdf')`, reads `res.blob()`, and triggers a client-side `URL.createObjectURL` download. Reuses the existing proxy but requires manual filename handling (since `Content-Disposition` is stripped) and a loading state.

**Direct backend URL download would lose admin auth** (the token is an HttpOnly cookie scoped to the Next.js origin; the browser would hit the backend with no bearer token). So a server-side proxy/route that injects the bearer is mandatory.

---

## 5. Existing PDF Support

**None.** Confirmed by inspecting every `.csproj` and `frontend/package.json`:
- Backend: no QuestPDF, PdfSharp, iText, DinkToPdf, wkhtmltopdf, PuppeteerSharp, Playwright, SkiaSharp, Magick — nothing.
- Frontend: no jsPDF, react-pdf, pdfkit, pdf-lib, puppeteer, playwright, html2canvas, html2pdf.

A new dependency is therefore unavoidable for any "real PDF" approach. (Only Option C — browser print — avoids a new dependency.) Adding the package is **out of scope for this Jira** and belongs to 8902.

---

## 6. PDF Generation Strategy Recommendation

| | A — Backend .NET library | B — Frontend JS (jsPDF/react-pdf) | C — Print-friendly HTML + browser print |
|---|---|---|---|
| Output consistency | ✅ High | ⚠️ Browser-dependent | ❌ Browser/printer-dependent |
| Server-side admin auth | ✅ Native | ⚠️ Data already in client | ⚠️ Data already in client |
| Data completeness | ✅ Authoritative DTO | ✅ Has page data | ✅ Has page data |
| Design image embedding | ✅ Resolve local file server-side | ⚠️ CORS / fetch issues | ⚠️ Print rendering only |
| New dependency | ⚠️ Yes (NuGet) | ⚠️ Yes (npm) | ✅ None |
| Archival fidelity | ✅ Stable file | ⚠️ Variable | ❌ Weakest |
| Effort | Medium | Medium | Low |

**Recommendation: Option A (backend-generated PDF).** It is the only option that gives consistent, archive-grade output, lets the server enforce admin auth, uses the authoritative order data, and can resolve uploaded design files to local disk for embedding. It matches the business intent ("printing, workshop management, saving/archive").

**Library choice: QuestPDF (Community license).** Pure managed C#, no native binaries (unlike DinkToPdf/wkhtmltopdf which need a native lib on Ubuntu), excellent table/layout API, strong Unicode/font control, actively maintained, .NET 8 compatible. iText (AGPL) and PdfSharp (weaker layout/Unicode) are less suitable. Confirm the Community license fits revenue thresholds before adoption.

---

## 7. Recommended PDF Content and Layout (A4 portrait)

**Header band**
- "Otahuhu Printing Shop / TeeNova" + "PRODUCTION SHEET"
- Order number (large), order status, generated date/time (NZ time), page X of Y.

**Customer / Delivery block** (two columns)
- Name, email, phone (`ShippingAddress.Phone`)
- Delivery method (Pickup / Shipping); shipping address shown only when `Shipping`.

**Order summary strip**
- Order status, payment status, payment requirement type
- Total, paid, balance; deposit required (only when `DepositThenBalance`).

**Items table**
- Product · Variant (`VariantLabel`) · Qty · Unit price · Line total; total row.

**Per-item print details** (sub-blocks under each item)
- Print area (name/code), print size (name/code), per-position note (`Notes`)
- Design filename/URL tail + design note (`DesignNote`)
- Optional thumbnail (see §8).

**Production checklist** (empty checkboxes for the workshop)
- ☐ Artwork checked ☐ Printed ☐ Pressed ☐ Quality checked ☐ Packed ☐ Ready for pickup/shipping

**Notes**
- Customer note, admin note, special instructions.

**Optional (later / 8904)**
- Payment transaction summary, price-adjustment summary (internal — see §11), order-number barcode/QR, larger design thumbnails.

---

## 8. Uploaded Image / Design Handling

Findings ([`LocalFileStorageService.cs`](../backend/src/TeeNova.Domain/Files/LocalFileStorageService.cs), [`UploadedAsset.cs`](../backend/src/TeeNova.Domain/Customization/UploadedAsset.cs)):
- Design files are stored under `{ContentRoot}/wwwroot/uploads/designs/` and served publicly by `UseStaticFiles()`.
- Stored URLs are **root-relative** (`/uploads/designs/...`); some legacy rows may be absolute.
- `LocalFileStorageService.ResolveLocalPath` + `GetAsync(fileUrl)` already converts a stored URL back to a physical path and returns a `FileStream` — so **the backend can read the bytes server-side** for embedding (no HTTP round-trip, no CORS).
- Accepted upload types include PNG, JPEG, SVG, WebP. **SVG and WebP are not natively embeddable** by most PDF libraries; **transparent PNG** renders fine; large images need scaling/compression.

**MVP recommendation:** Embed a small thumbnail **only for raster JPEG/PNG/WebP** that resolve to an existing local file. For SVG/PDF/AI or missing/deleted files, **print the filename + design note** and skip the image (graceful fallback — never throw). Treat full/large image embedding, SVG rasterization, and WebP handling as a **8904 follow-up**. Always guard for missing files (deleted asset, legacy bad path) and for path-traversal (resolve only within `uploadsRoot`).

---

## 9. Backend API Recommendation

**Endpoint:** `GET /api/orders/{id}/production-pdf` on [`OrderController`](../backend/src/TeeNova.HttpApi/Orders/OrderController.cs).

**Response:**
- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="Order-{orderNumber}-production-sheet.pdf"`
- Body: freshly generated PDF bytes.

**Auth — critical:** The controller is `[Authorize]` at class level, but `CreateAsync` and `GetAsync` are explicitly `[AllowAnonymous]` (customer order-tracking page). The new action **must NOT carry `[AllowAnonymous]`** so it inherits the authenticated requirement. (Per memory note, admin endpoints are authenticated but not yet *role*-restricted — Task 8703; the PDF endpoint should ride along with whatever admin authorization 8703 establishes.)

**Behavior:**
- Generate **on demand only**. Reuse `GetAsync`'s enrichment to assemble the data (or call a shared internal method), then render. No DB writes, no order mutation, no emails, no payment side effects.
- **Do not persist** the PDF to the filesystem and **do not** add a DB record of generated PDFs for MVP. Only revisit if the business explicitly requires an immutable archive (then store under a non-public path, not `wwwroot`).

---

## 10. Frontend UI Recommendation

- **Button:** "Download Production PDF" in the order header actions area (§3).
- **Mechanism:** dedicated authenticated download route (§4 Option 1) → button is `<a href="/api/orders/{id}/production-pdf" download>`; or blob-fetch with a manual loading spinner (Option 2).
- **Loading state:** show a spinner/disabled state if using blob-fetch; a plain link needs none but feels instant-but-silent — a brief "Preparing…" toast is nice-to-have.
- **Download vs new tab:** **download** (attachment) — it is an archival/print artifact, not a page to browse.
- **Filename:** server-set `Order-{orderNumber}-production-sheet.pdf`; ensure the chosen route preserves `Content-Disposition` (the generic proxy does not — §4).
- **Errors:** map 401 → `redirectToLogin('session-expired')` (existing helper); 404/500 → friendly toast ("Couldn't generate the production sheet. Please try again.").
- **Mobile:** acceptable; mobile browsers will open/save the PDF natively. Low priority — this is an admin/workshop tool used on desktop.

---

## 11. Security / Privacy Review

- **Endpoint must require admin auth** — no `[AllowAnonymous]`; verify it is NOT reachable anonymously the way `GetAsync` currently is. The PDF carries customer contact details, internal admin notes, and (optionally) price-adjustment reasons.
- **Not available from the anonymous order-lookup path** — the customer tracking page uses anonymous `GET /api/orders/{id}`; the PDF route must be separate and authenticated.
- **Internal data exposure:** admin notes, price-adjustment `Reason`, and `AdjustedByUser` are internal. Include them deliberately (production sheet is internal) but make the price-adjustment section optional/clearly internal so the sheet isn't handed to a customer with that data.
- **No local filesystem paths in the PDF** — print the design **filename/URL tail only**, never `ResolveLocalPath` output.
- **Path traversal:** when embedding images, resolve strictly within `wwwroot/uploads` and reject anything that escapes it; rely on the asset's stored URL, not on any client-supplied path.
- **No public storage:** generate in-memory and stream; do not write the PDF under `wwwroot` (it would become publicly downloadable).
- **Transport:** download flows over HTTPS via the Next.js origin; the bearer token stays server-side (HttpOnly cookie → proxy/route).

---

## 12. Technical Risks

| Risk | Notes / mitigation |
|---|---|
| .NET 8 compatibility | QuestPDF supports .NET 8 — low risk. |
| Ubuntu 22.04 fonts | Container/host may lack fonts; bundle a font (e.g. Open Sans/Noto) with QuestPDF's font registration. Test on the deploy target. |
| Chinese / non-English notes | Customer/admin notes may be non-Latin; use a **Noto Sans CJK** (or similar) font and register it, or CJK glyphs render as boxes. |
| Image embedding from local files | SVG/WebP not natively embeddable; missing/deleted files. Mitigate per §8 (raster-only, graceful fallback). |
| Transparent PNG | Renders fine in QuestPDF — low risk. |
| Long notes overflow | Use wrapping text + page breaks; QuestPDF handles flow. |
| Multi-page orders | Many items/prints → multiple pages; include "page X of Y" and repeating header. |
| Currency / timezone | Format `decimal` as NZD (`$0.00`), dates in NZ time consistently (UI already uses `en-NZ`). |
| Large uploaded images | Could slow generation / spike memory; downscale thumbnails before embedding. |
| Binary download through Next proxy | Generic `/api/proxy` **strips `Content-Disposition`** and the typed client only does `res.json()` — use a dedicated route or blob-fetch (§4). |
| Memory for large PDFs | On-demand in-memory generation is fine for single orders; avoid caching bytes. |
| Page breaks / print margins | Use standard A4 margins (~1.5–2 cm); verify checklist/table don't split awkwardly. |

---

## 13. Recommended Implementation Plan

**8902 — Backend PDF generation service & endpoint**
- Files: `TeeNova.HttpApi.Host.csproj` (add QuestPDF), new `TeeNova.Application/Orders/OrderProductionPdfService.cs` (+ contract interface), `OrderController.cs` (new `GET {id}/production-pdf` action), font asset + registration in host module.
- Deliverables: authenticated endpoint returning a valid A4 PDF with header/customer/summary/items/prints/checklist/notes; reuses order enrichment; no persistence; graceful handling of missing design files.

**8903 — Frontend admin download button**
- Files: `admin/orders/[id]/page.tsx` (header button), new `app/api/orders/[id]/production-pdf/route.ts` (authenticated download route preserving `Content-Disposition`) **or** a small blob-download helper in `lib/admin-client.ts`, possibly a `DownloadProductionPdfButton.tsx` component.
- Deliverables: working button with loading/error states, correct filename, 401→login handling.

**8904 — PDF template / layout refinement**
- Files: `OrderProductionPdfService.cs` template, optional DTO/mapper extension to add `OriginalFileName` / `LastModificationTime` / SKU if business wants them.
- Deliverables: thumbnail embedding for raster designs, SVG/WebP handling decision, barcode/QR, polished typography, payment & price-adjustment sections.

**8905 — QA & deployment smoke test**
- Files: test notes / QA checklist; verify on Ubuntu deploy target (fonts, CJK, HTTPS).
- Deliverables: §14 scenarios executed; production smoke test over the real HTTPS domain.

---

## 14. QA Scenarios for Later Jiras

- Simple unpaid order; fully paid order; pickup order with deposit (`DepositThenBalance`); shipping order with address.
- Single-item order; multi-item order; item with multiple print positions.
- Item with uploaded design (raster); item without uploaded design; item with SVG/WebP design (fallback to filename).
- Long customer note; long admin note (wrapping / page break).
- Cancelled order; completed order (archival).
- **Anonymous access blocked** (must 401, unlike `GET /api/orders/{id}`).
- **Non-admin authenticated access** behaves per 8703 authorization.
- Filename is `Order-{orderNumber}-production-sheet.pdf`; PDF opens in common viewers; prints cleanly on A4; works over the production HTTPS domain.
- PDF exposes **no local filesystem paths**; missing/deleted design file handled gracefully (no 500).
- Non-English (CJK) customer note renders correctly.

---

## 15. Open Questions

1. **SKU / size / color** — business wants these on the sheet? They aren't stored on order items (only `VariantLabel`). Need a backfill/lookup if required.
2. **Phone** — is `ShippingAddress.Phone` acceptable as the customer phone, or is a dedicated customer phone field expected?
3. **Updated date** — include `LastModificationTime` (needs DTO exposure) or just `CreationTime`?
4. **Price-adjustment / internal reasons** — include on the production sheet, or omit to keep it customer-safe?
5. **Thumbnails in MVP** — embed raster thumbnails now, or list filenames only and defer all images to 8904?
6. **Archival storage** — is on-demand generation sufficient, or does the business require a stored immutable PDF per order?
7. **QuestPDF Community license** — does projected revenue stay within the free-tier threshold?
8. **Authorization** — should 8902 wait on 8703 (role-based admin authorization), or ship behind the current authenticated-only gate and tighten later?

---

## 16. Final Recommendation

Proceed with **Option A — a backend-generated, admin-authenticated, on-demand PDF endpoint** using **QuestPDF**, exposed as `GET /api/orders/{id}/production-pdf`, with the frontend adding a **"Download Production PDF"** button in the order header backed by a **dedicated authenticated Next.js download route** (so admin auth is enforced and the filename header survives). All required data already lives in `OrderDto`; no migration or new query is needed for MVP. Keep image embedding minimal (raster thumbnails with graceful fallback) and defer SVG/WebP, barcodes, and richer layout to 8904. Resolve the §15 open questions — especially SKU/size/color, internal price-adjustment inclusion, and the authorization gate — with the business before 8902 begins.
