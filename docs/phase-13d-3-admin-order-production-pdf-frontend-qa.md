# Phase 13D-3 Admin Order Production PDF Frontend QA Report
### Jira 8903 — Frontend production PDF download QA

> **Scope:** QA / code review only. No code changed during QA. No blockers found.

---

## 1. Summary

The 8903 frontend download flow passes QA. The authenticated route and admin button are correct, secure, and minimal in scope. All quality gates pass independently in QA: **type-check (exit 0), lint (0 warnings/errors), build (compiled successfully, new route registered)**. The accidental `frontend/frontend` path from implementation is fully gone. Live end-to-end download is **pending 8905** (no local backend + admin token here), per the Jira's fallback — not a reason to fail 8903.

**Verdict: PASS — ready to complete.** No required fixes.

---

## 2. File Scope Verification

`git status` shows exactly the intended set:
- **Modified:** `frontend/src/app/admin/orders/[id]/page.tsx` (import + header button only — diff is purely additive).
- **New:** `frontend/src/app/api/admin/orders/[id]/production-pdf/route.ts`, `frontend/src/components/admin/DownloadProductionPdfButton.tsx` (+ this QA doc / impl doc).

No changes to: backend code, migrations, payment logic, email logic, the public `/api/download` route, the generic `/api/proxy` route, image-URL logic, or deployment config. ✅
**Doubled `frontend/frontend` path:** removed — not present in the tree or git status. ✅

---

## 3. Authenticated Download Route Review

`frontend/src/app/api/admin/orders/[id]/production-pdf/route.ts`:

| Check | Result |
|---|---|
| Path `GET /api/admin/orders/{id}/production-pdf` | ✅ |
| Reads `admin_token` HttpOnly cookie (same name/pattern as proxy) | ✅ `cookies().get('admin_token')` |
| Missing token → 401 | ✅ |
| Missing/invalid id → safe error | ✅ `!id` → 400 |
| Calls only fixed backend route `/api/orders/{id}/production-pdf` | ✅ |
| No arbitrary user-provided backend URL | ✅ URL is constructed server-side from a constant base |
| Safe id handling | ✅ `encodeURIComponent(id)` |
| Adds `Authorization: Bearer <token>` | ✅ |
| Adds `Accept: application/pdf` | ✅ |
| Token not exposed to browser | ✅ read server-side only, never returned |
| Does not use public `/api/download` | ✅ |
| Does not use typed JSON admin client | ✅ raw `fetch` |
| Binary handled correctly | ✅ `arrayBuffer()` (appropriate for a single PDF) |

`BACKEND_URL` precedence (`BACKEND_URL` → `NEXT_PUBLIC_API_BASE_URL` → localhost) matches the existing proxy. ✅

---

## 4. Header Preservation Review

- ✅ Preserves `Content-Type` (fallback `application/pdf` if backend omits).
- ✅ Preserves `Content-Disposition` (fallback `attachment; filename="order-production-sheet.pdf"` if backend omits).
- ✅ Sets `Cache-Control: no-store` on the returned response.

---

## 5. Error Handling Review

| Case | Behavior |
|---|---|
| Backend 401 | ✅ Passes through as 401 (`status: backendRes.status`). |
| Backend 403 | ✅ Passes through as 403. |
| Backend 404 | ✅ Passes through as 404. |
| Backend 500 | ✅ Passes through as 500 with a generic message. |
| Backend error body | ✅ **Not forwarded** — only status + generic `"Could not generate the production PDF."` So no stack traces / filesystem paths leak. |
| Network failure (backend unreachable) | ✅ `catch` → 503 `"Backend unreachable."` |

---

## 6. Download Button Review

`DownloadProductionPdfButton.tsx`:

| Check | Result |
|---|---|
| Fetches `/api/admin/orders/{orderId}/production-pdf` | ✅ |
| Same-origin fetch (cookie sent automatically) | ✅ default credentials; no manual token read |
| Does not read/expose `admin_token` | ✅ |
| Disables while downloading | ✅ `disabled={disabled || downloading}` |
| Loading state | ✅ `loading` spinner + "Preparing PDF…" |
| 401 → `redirectToLogin('session-expired')` | ✅ |
| 403 → permission message | ✅ |
| 404 → order/PDF unavailable message | ✅ |
| 500/network → generic message | ✅ (`messageForStatus` + catch) |
| Reads blob | ✅ `res.blob()` |
| Extracts filename from `Content-Disposition` | ✅ |
| Supports `filename*=UTF-8''…` and `filename="…"` | ✅ both regex branches (star then plain) |
| Fallback `Order-{orderNumber}-production-sheet.pdf` | ✅ |
| Temp object URL + anchor click | ✅ |
| Revokes object URL | ✅ after click (in the try, before return) |
| No order-state mutation / no refresh | ✅ download-only |

Minor note: the object URL is revoked at the end of the success path rather than in `finally`. Since it is only created on the success path and revoked immediately after the click, there is no leak — acceptable.

---

## 7. Admin Page Integration Review

- ✅ Button rendered only on the admin order detail page (`/admin/orders/[id]`).
- ✅ Public `/orders/[id]` page does **not** render it (grep: not present).
- ✅ Placement: order header, right of title/status badge (header row is `flex … items-start`, title block `flex-1`, button sits top-right). Visually appropriate.
- ✅ Visible for all statuses incl. Cancelled/Completed (in the always-rendered header, after the loading/404 early returns; no status gating).
- ✅ Does not interfere with existing actions (purely additive diff).
- ✅ `onError` wired to `showToast(msg, 'error')` (signature matches the page's `showToast(msg, tone)`).
- ✅ Admin order page still loads/builds.

---

## 8. Security Review

- ✅ Token stays server-side (HttpOnly cookie read in the route only).
- ✅ Public `/api/download` route not used.
- ✅ Public customer order page has no production-PDF button.
- ✅ User input limited to order `id`; `encodeURIComponent`-encoded.
- ✅ No arbitrary URL proxying; fixed backend route only.
- ✅ No local filesystem path exposure (backend body not forwarded).
- ✅ `Cache-Control: no-store` prevents browser/proxy caching of customer/internal PDF data.
- ✅ Sensitive backend error details not forwarded.

---

## 9. Build Results

Independently re-run in QA:
- `npm run type-check` → **exit 0**, no `error TS`.
- `npm run lint` → **No ESLint warnings or errors**.
- `npm run build` → **✓ Compiled successfully**, exit 0.
  - New route present: `ƒ /api/admin/orders/[id]/production-pdf`.
  - Existing `ƒ /api/download` and `ƒ /api/proxy/[...path]` still present → **no route conflict / no removal**.

---

## 10. Manual Verification

Live download **not** run (no local running backend + admin JWT in this QA environment). Verified by code/build review (sections 3–8). Per the Jira fallback, **live download is marked pending 8905** and is not a reason to fail 8903.

Pending-8905 live checklist: admin login → open order → click Download → PDF downloads as `Order-{orderNumber}-production-sheet.pdf` and opens; route returns 401 when unauthenticated; public order page shows no button; no console errors.

---

## 11. Regression Review

- ✅ Admin order detail page change is additive only (import + button); page compiles in the production build.
- ✅ Payment section, order items, and existing admin actions untouched (not in the diff).
- ✅ No frontend route conflict with `/api/proxy` or `/api/download` (both still build alongside the new route).
- ✅ No customer/public behavior changed (public order page untouched).

---

## 12. Issues Found

| # | Severity | Issue |
|---|---|---|
| 1 | Non-blocker (env) | Live end-to-end download not exercisable in this QA env → pending 8905. |
| 2 | Nit | Object URL revoked at end of success path rather than in `finally`; no leak in practice. |

No correctness, security, or build blockers.

---

## 13. Required Fixes Before Completion

**None.** Items in §12 are environmental / cosmetic and do not block 8903.

---

## 14. Final Recommendation

Approve **8903**. The authenticated download route and admin button are correct, secure, scope-clean, and pass type-check, lint, and build with the new route registered and no route conflicts. Carry the live authenticated download + 401 checks into **8905** smoke testing. Safe to commit.
