# Phase 13D-3 Admin Order Production PDF Frontend Implementation Report
### Jira 8903 — Implement frontend admin production PDF download

> **Scope:** Frontend only. No backend, DB, payment, email, Nginx/deployment, or image-URL changes. No browser PDF generation, no PDF libraries added. The public `/api/download` route is not used.

---

## 1. Summary

Added an admin-only download flow for the order production PDF. A **dedicated authenticated Next.js route** (`GET /api/admin/orders/{id}/production-pdf`) reads the HttpOnly `admin_token` cookie, calls the backend PDF endpoint with a Bearer token, and returns the binary body while **preserving `Content-Type` and `Content-Disposition`**. A **"Download Production PDF"** button in the admin order detail header triggers a `fetch`-blob download with loading and friendly error states.

All checks pass: **type-check (0 errors), lint (0 warnings/errors), production build (passes; new route registered).**

---

## 2. Files Changed

| File | Change |
|---|---|
| `frontend/src/app/api/admin/orders/[id]/production-pdf/route.ts` | **New.** Authenticated binary download route (cookie → Bearer → backend PDF). |
| `frontend/src/components/admin/DownloadProductionPdfButton.tsx` | **New.** Client button: fetch-blob download, loading/error handling. |
| `frontend/src/app/admin/orders/[id]/page.tsx` | Imported and rendered the button in the page header (right-aligned). |

Public customer order page (`frontend/src/app/orders/[id]/page.tsx`) was **not** touched — the button is admin-only.

---

## 3. Authenticated Download Route

`GET /api/admin/orders/{id}/production-pdf`:

- Reads `admin_token` via `cookies().get(...)` — same pattern as `/api/proxy/[...path]/route.ts`. Token stays server-side; never exposed to the browser.
- **Missing `id` → 400**; **missing token → 401**.
- Calls the **fixed** backend route only: `{BACKEND_URL}/api/orders/{encodeURIComponent(id)}/production-pdf`, with `Authorization: Bearer <token>` and `Accept: application/pdf`. `BACKEND_URL` resolves from `BACKEND_URL` → `NEXT_PUBLIC_API_BASE_URL` → `https://localhost:44300` (same precedence as the proxy).
- On success: returns the backend `arrayBuffer()` with preserved `Content-Type` and `Content-Disposition` (fallback `attachment; filename="order-production-sheet.pdf"` if the backend omits it), plus `Cache-Control: no-store`.
- On backend failure: returns the backend **status** with a generic message — the backend body is **not** forwarded (avoids leaking error/stack-trace detail). Network failure → 503.
- Does not use the typed admin client (which expects JSON); uses raw `fetch` + `arrayBuffer` for binary. `arrayBuffer` is used (not streaming) — fine for a single order PDF.

---

## 4. Admin UI Button

- Location: order detail **page header**, right of the order number / status badge (the header row is `flex … items-start`, with the title block `flex-1`, so the button sits top-right).
- Label: **"Download Production PDF"**; loading label **"Preparing PDF…"**.
- Built on the existing `Button` component (`variant="white"`, `size="sm"`, built-in `loading` spinner) so it matches other admin actions. Includes a download icon.
- **Visible for all statuses** (including Cancelled/Completed) for archive/workshop use — it is in the always-rendered header, with no status gating.
- Disabled while downloading. (The header only renders after the order has loaded — during load the page shows a skeleton — so it is inherently unavailable while loading.)

---

## 5. Download Flow

Chosen mechanism: **Option B — button + `fetch` blob**, because admin pages use loading states and toast feedback, and `redirectToLogin` exists for 401 handling.

1. `fetch('/api/admin/orders/{order.id}/production-pdf', { cache: 'no-store' })` — same-origin, so the HttpOnly cookie is sent automatically.
2. `401` → `redirectToLogin('session-expired')`.
3. `!res.ok` → friendly error via `onError` (wired to the page toast).
4. `res.blob()` → filename from `Content-Disposition` (parses RFC 5987 `filename*` and plain `filename`), fallback `Order-{orderNumber}-production-sheet.pdf`.
5. `URL.createObjectURL` → temporary `<a download>` click → `URL.revokeObjectURL`.
6. Button disabled throughout; re-enabled in `finally`.

No order state mutation, no timeline/payment writes, no order refresh, nothing persisted.

---

## 6. Error Handling

| Condition | Behavior |
|---|---|
| 401 | `redirectToLogin('session-expired')`. |
| 403 | Toast: "You do not have permission to download this production PDF." |
| 404 | Toast: "Order not found or PDF is unavailable." |
| 500 / other / network | Toast: "Could not generate the production PDF. Please try again." |

Errors surface through the page's existing toast via the `onError` callback.

---

## 7. Security Review

- ✅ Admin token read server-side from HttpOnly cookie; never sent to the browser.
- ✅ Only the fixed backend production-pdf route is called; `id` is the sole user input and is `encodeURIComponent`-encoded. No user-provided URL/path accepted; the public `/api/download` route is not used.
- ✅ Backend error bodies are not forwarded → no stack-trace/filesystem-path leakage; only status + a generic message.
- ✅ `Cache-Control: no-store` on the response (PDF contains customer/internal data).
- ✅ Button is admin-only (admin page); the public order page does not render it.

---

## 8. Build Results

- `npm run type-check` → **0 errors**.
- `npm run lint` → **No ESLint warnings or errors**.
- `npm run build` → **passes**; new route `ƒ /api/admin/orders/[id]/production-pdf` registered; `/admin/orders/[id]` page builds (13.3 kB).

> Note during implementation: the two new files were initially written to a doubled `frontend/frontend/...` path (relative-path resolution quirk) and were moved to the correct locations before the checks; the stray directory was removed. Final `git status` shows only the intended three paths.

---

## 9. Manual Verification

Live end-to-end download was **not** run here (no running backend + admin JWT in this environment). Verified by code review:

- ✅ Route reads cookie, injects Bearer, calls fixed backend route, preserves `Content-Type`/`Content-Disposition`, handles 401/4xx/5xx, falls back filename.
- ✅ Button hits `/api/admin/orders/{id}/production-pdf`, downloads via blob, parses filename, handles 401 → login and other statuses → toast.
- ✅ Button present only on the admin page; absent from public `/orders/[id]`.
- ✅ Type-check / lint / build all green.

**Pending live QA (8905):** log in as admin → open an order → click download → confirm a PDF named `Order-{orderNumber}-production-sheet.pdf` downloads and opens; confirm the route returns **401** when unauthenticated; confirm no console errors.

---

## 10. Issues / Notes

- Live download is **pending 8905** (no local backend+token here), per the Jira's fallback instruction.
- `arrayBuffer` (buffered) is used rather than streaming — appropriate for a single order PDF and consistent with the existing proxy.
- The button only renders post-load, so an explicit `disabled-while-loading` guard is unnecessary; a `disabled` prop is still supported for future use.
- CJK font support in the PDF body remains an 8904 backend follow-up (unrelated to this frontend work).

---

## 11. Final Recommendation

Frontend download flow is complete, secure, and passes type-check, lint, and build. Recommend proceeding; perform the live authenticated download + 401 checks as part of **8905** smoke testing. Safe to commit.
