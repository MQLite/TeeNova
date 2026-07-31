'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { makeOrdersApi } from '@/api/orders'
import { makeCatalogApi } from '@/api/catalog'
import { makePrintConfigApi } from '@/api/print-config'
import { makeFilesApi } from '@/api/files'
import { adminApiClient, redirectToLogin } from '@/lib/admin-client'
import { ApiError } from '@/lib/api-client'
import type {
  Order,
  OrderContentQuoteResult,
  PrintArea,
  PrintSize,
  Product,
  ProductKind,
  ProductListItem,
  UpdateOrderContent,
} from '@/types'

// Admin-authenticated clients (never the anonymous customer routes).
const ordersApi = makeOrdersApi(adminApiClient)
const catalogApi = makeCatalogApi(adminApiClient)
const printConfigApi = makePrintConfigApi(adminApiClient)
const filesApi = makeFilesApi(adminApiClient)

// ── Field styles (match existing admin form style) ──────────────────────────────

const FIELD = [
  'w-full rounded-xl border border-black/[0.10] bg-white px-3 py-2 text-sm text-black',
  'placeholder:text-black/30',
  'focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-black/[0.06]',
  'disabled:opacity-50',
].join(' ')

const LABEL = 'mb-1 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55'

// ── Working-copy model (localKey drives React identity; ids are saved-row ids only) ──

interface WorkingPrint {
  localKey: string
  /** Existing OrderItemPrint id; absent on new rows. Never derived from preview ids. */
  id?: string
  printAreaId: string
  printSizeId: string
  uploadedAssetId?: string | null
  uploadedAssetUrl?: string | null
  designNote: string
  printNotes: string
}

interface WorkingItem {
  localKey: string
  /** Existing OrderItem id; absent on new rows. Never derived from preview ids. */
  id?: string
  productId: string
  /** Business category (Jira 9505). Drives which editor renders; non-garment = design-only (Badge). */
  productKind: ProductKind
  /** Garment variant; '' for non-garment items (Badge has no variant). */
  productVariantId: string
  quantity: number
  prints: WorkingPrint[]
  // ── Item-level design (Jira 9505) — used by non-garment items (Badge). Garment design is per-print.
  uploadedAssetId?: string | null
  uploadedAssetUrl?: string | null
  designNote: string
}

/** Non-garment items (Badge etc.) edit through the design-only editor: no variant, no print rows. */
function isNonGarment(kind: ProductKind): boolean {
  return kind !== 'Garment'
}

function newKey(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Math.random().toString(36).slice(2)}`
}

function buildWorkingCopy(order: Order): WorkingItem[] {
  return order.items.map((item) => ({
    localKey: newKey('item'),
    id: item.id,
    productId: item.productId ?? '',
    productKind: item.productKind ?? 'Garment',
    // Badge order items have a null variant (Jira 9503/9505); coerce to '' so the garment variant
    // <select> stays controlled. The badge editor ignores this field entirely.
    productVariantId: item.productVariantId ?? '',
    quantity: item.quantity,
    uploadedAssetId: item.uploadedAssetId ?? null,
    uploadedAssetUrl: item.uploadedAssetUrl ?? null,
    designNote: item.designNote ?? '',
    prints: (item.prints ?? []).map((p) => ({
      localKey: newKey('print'),
      id: p.id,
      printAreaId: p.printAreaId,
      printSizeId: p.printSizeId,
      uploadedAssetId: p.uploadedAssetId ?? null,
      uploadedAssetUrl: p.uploadedAssetUrl ?? null,
      designNote: p.designNote ?? '',
      printNotes: p.notes ?? '',
    })),
  }))
}

function buildPayload(items: WorkingItem[]): UpdateOrderContent {
  return {
    items: items.map((item) => {
      const base = {
        // Only send a real saved id; new rows omit id so the backend adds them.
        ...(item.id ? { id: item.id } : {}),
        productId: item.productId,
        quantity: item.quantity,
      }
      // Non-garment items (Badge, Jira 9505): no variant, no prints, item-level design only.
      // NEVER carries price fields — the backend is the sole pricing authority.
      if (isNonGarment(item.productKind)) {
        return {
          ...base,
          productVariantId: null,
          uploadedAssetId: item.uploadedAssetId ?? null,
          uploadedAssetUrl: item.uploadedAssetUrl ?? null,
          designNote: item.designNote.trim() ? item.designNote.trim() : null,
          prints: [],
        }
      }
      // Garment items: variant + per-print design (unchanged behaviour).
      return {
        ...base,
        productVariantId: item.productVariantId,
        prints: item.prints.map((p) => ({
          ...(p.id ? { id: p.id } : {}),
          printAreaId: p.printAreaId,
          printSizeId: p.printSizeId,
          uploadedAssetId: p.uploadedAssetId ?? null,
          uploadedAssetUrl: p.uploadedAssetUrl ?? null,
          designNote: p.designNote.trim() ? p.designNote.trim() : null,
          printNotes: p.printNotes.trim() ? p.printNotes.trim() : null,
        })),
      }
    }),
  }
}

function money(value: number): string {
  return `$${value.toFixed(2)}`
}

function getFileName(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return decodeURIComponent(url.split('/').pop() ?? 'design')
  } catch {
    return url.split('/').pop() ?? 'design'
  }
}

// ── Backend error-code → friendly message map (Jira 9405 codes) ─────────────────

const ERROR_MESSAGES: Record<string, string> = {
  CannotEditContentForTerminalOrder: 'This order is completed or cancelled and its content can no longer be edited.',
  CannotEditContentInventoryDeducted: 'Stock has already been deducted for this order, so its content cannot be edited.',
  InventoryAlreadyDeducted: 'Stock has already been deducted for this order, so its content cannot be edited.',
  AdjustedTotalBelowPaidAmount: 'The new total cannot be less than the amount already paid.',
  NewTotalBelowPaidAmount: 'The new total cannot be less than the amount already paid.',
  NewTotalNotPositive: 'The new total must be greater than zero.',
  OrderMustHaveItems: 'An order must have at least one item.',
  ItemQuantityMustBePositive: 'Every item must have a quantity of at least 1.',
  VariantNotFound: 'A selected garment variant could not be found. Please re-select it.',
  PrintAreaInactive: 'A selected print position is no longer active. Please choose another.',
  PrintSizeInactive: 'A selected print size is no longer active. Please choose another.',
  InvalidPrintAreaSizeOption: 'A selected print position / size combination is not allowed.',
  PrintOptionNotAllowedForProduct: 'A selected print option is not allowed for this product.',
  DuplicateOrderItemId: 'An item was referenced twice. Please re-open the editor and try again.',
  DuplicateOrderItemPrintId: 'A print was referenced twice. Please re-open the editor and try again.',
  OrderItemNotInOrder: 'An item no longer belongs to this order. Please re-open the editor and try again.',
  OrderItemPrintNotInItem: 'A print no longer belongs to its item. Please re-open the editor and try again.',
  OrderCancelled: 'This order is cancelled and cannot be edited.',
  OrderCompleted: 'This order is completed and cannot be edited.',
  // ── Badge / quantity-tier pricing (Jira 9503/9505) ──────────────────────────
  BelowMinimumQuantity: 'A custom-product item is below its minimum order quantity. Increase the quantity and try again.',
  DesignRequired: 'A custom-product item requires a design upload before it can be saved. Please upload artwork.',
  NoQuantityTiers: 'Pricing for a custom product isn’t configured yet (no quantity tiers). Please set it up first.',
  QuantityTierUnitDoesNotSupportPrints: 'A quantity-tier product is priced by quantity only and can’t take print placements.',
  UnsupportedPricingModel: 'A product on this order can’t be priced automatically yet. Please contact the shop / set up pricing.',
}

function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      redirectToLogin('session-expired')
      return 'Your session has expired. Please sign in again.'
    }
    // ABP surfaces the business code as details.error.code (e.g. "TeeNova:Order:VariantNotFound").
    const code = (err.details as { error?: { code?: string } })?.error?.code ?? ''
    const shortCode = code.split(':').pop() ?? ''
    if (shortCode && ERROR_MESSAGES[shortCode]) return ERROR_MESSAGES[shortCode]

    const raw = (err.message ?? '').toLowerCase()
    for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
      if (raw.includes(key.toLowerCase())) return message
    }
    if (err.message) return err.message
  }
  return 'Something went wrong. Please review the changes and try again.'
}

// ── Reusable bits ───────────────────────────────────────────────────────────────

function ImpactRow({ label, oldValue, newValue }: { label: string; oldValue: string; newValue: string }) {
  const changed = oldValue !== newValue
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">{label}</span>
      <span className="flex items-center gap-2" style={{ letterSpacing: '-0.14px' }}>
        <span className={changed ? 'text-black/35 line-through' : 'text-black/70'}>{oldValue}</span>
        {changed && (
          <>
            <span className="text-black/30">→</span>
            <span className="text-black" style={{ fontWeight: 540 }}>{newValue}</span>
          </>
        )}
      </span>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  order: Order
  open: boolean
  onClose: () => void
  onSaved: (updated: Order) => void
}

export function OrderContentEditModal({ order, open, onClose, onSaved }: Props) {
  const [items, setItems] = useState<WorkingItem[]>([])
  const [products, setProducts] = useState<ProductListItem[]>([])
  const [areas, setAreas] = useState<PrintArea[]>([])
  const [sizes, setSizes] = useState<PrintSize[]>([])
  const [productDetails, setProductDetails] = useState<Record<string, Product>>({})

  const [loadingData, setLoadingData] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)

  const [quote, setQuote] = useState<OrderContentQuoteResult | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  /** Working copy changed since the last successful quote — forces a re-preview before save. */
  const [dirty, setDirty] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [ackCancelSessions, setAckCancelSessions] = useState(false)

  // Keep the latest details map for async helpers without stale closures.
  const detailsRef = useRef(productDetails)
  detailsRef.current = productDetails

  const ensureProductLoaded = useCallback(async (productId: string): Promise<Product | null> => {
    if (!productId) return null
    const cached = detailsRef.current[productId]
    if (cached) return cached
    try {
      const detail = await catalogApi.getProduct(productId)
      setProductDetails((prev) => ({ ...prev, [productId]: detail }))
      detailsRef.current = { ...detailsRef.current, [productId]: detail }
      return detail
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) redirectToLogin('session-expired')
      return null
    }
  }, [])

  // Initialise working copy + selection data each time the modal opens.
  useEffect(() => {
    if (!open) return
    setItems(buildWorkingCopy(order))
    setQuote(null)
    setQuoteError(null)
    setSaveError(null)
    setDirty(false)
    setAckCancelSessions(false)
    setLoadingData(true)
    setDataError(null)

    let cancelled = false
    ;(async () => {
      try {
        const [productPage, areaList, sizeList] = await Promise.all([
          catalogApi.getProducts({ isActive: true, maxResultCount: 200 }),
          printConfigApi.getAreas(),
          printConfigApi.getSizes(),
        ])
        if (cancelled) return
        setProducts(productPage.items)
        setAreas(areaList)
        setSizes(sizeList)

        // Preload variant detail for every product already on the order.
        const distinctIds = Array.from(new Set(
          order.items
            .map((item) => item.productId)
            .filter((productId): productId is string => Boolean(productId)),
        ))
        const details = await Promise.all(distinctIds.map((pid) => catalogApi.getProduct(pid).catch(() => null)))
        if (cancelled) return
        const map: Record<string, Product> = {}
        distinctIds.forEach((pid, idx) => { const d = details[idx]; if (d) map[pid] = d })
        setProductDetails(map)
        detailsRef.current = map
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) { redirectToLogin('session-expired'); return }
        setDataError('Could not load product / print configuration. Please close and try again.')
      } finally {
        if (!cancelled) setLoadingData(false)
      }
    })()

    return () => { cancelled = true }
  }, [open, order])

  // Any working-copy mutation invalidates the current quote.
  const mutate = useCallback((updater: (prev: WorkingItem[]) => WorkingItem[]) => {
    setItems(updater)
    setDirty(true)
    setQuote(null)
    setQuoteError(null)
    setSaveError(null)
    setAckCancelSessions(false)
  }, [])

  // ── Item / print mutations ────────────────────────────────────────────────────

  function updateItem(localKey: string, patch: Partial<WorkingItem>) {
    mutate((prev) => prev.map((it) => (it.localKey === localKey ? { ...it, ...patch } : it)))
  }

  function updatePrint(itemKey: string, printKey: string, patch: Partial<WorkingPrint>) {
    mutate((prev) => prev.map((it) =>
      it.localKey === itemKey
        ? { ...it, prints: it.prints.map((p) => (p.localKey === printKey ? { ...p, ...patch } : p)) }
        : it,
    ))
  }

  async function handleProductChange(localKey: string, productId: string) {
    const detail = await ensureProductLoaded(productId)
    const kind: ProductKind = detail?.kind ?? 'Garment'
    // Switching to a non-garment product clears the variant and any garment prints; switching to a
    // garment seeds the first available variant. The server still re-validates either way.
    if (isNonGarment(kind)) {
      updateItem(localKey, { productId, productKind: kind, productVariantId: '', prints: [] })
    } else {
      const firstVariant = detail?.variants.find((v) => v.isAvailable) ?? detail?.variants[0]
      updateItem(localKey, { productId, productKind: kind, productVariantId: firstVariant?.id ?? '' })
    }
  }

  async function handleAddItem() {
    const first = products[0]
    if (!first) return
    const detail = await ensureProductLoaded(first.id)
    const kind: ProductKind = detail?.kind ?? first.kind ?? 'Garment'
    const firstVariant = isNonGarment(kind)
      ? undefined
      : detail?.variants.find((v) => v.isAvailable) ?? detail?.variants[0]
    mutate((prev) => [
      ...prev,
      {
        localKey: newKey('item'),
        productId: first.id,
        productKind: kind,
        productVariantId: firstVariant?.id ?? '',
        quantity: Math.max(1, first.minimumQuantity ?? 1),
        uploadedAssetId: null,
        uploadedAssetUrl: null,
        designNote: '',
        prints: [],
      },
    ])
  }

  async function handleItemDesignUpload(itemKey: string, file: File) {
    try {
      const result = await filesApi.upload(file)
      updateItem(itemKey, { uploadedAssetId: result.assetId, uploadedAssetUrl: result.fileUrl })
    } catch {
      setSaveError('Could not upload that design file. Please try again.')
    }
  }

  function handleRemoveItem(localKey: string) {
    mutate((prev) => prev.filter((it) => it.localKey !== localKey))
  }

  function handleAddPrint(itemKey: string) {
    const area = areas[0]
    const size = sizes[0]
    mutate((prev) => prev.map((it) =>
      it.localKey === itemKey
        ? {
            ...it,
            prints: [
              ...it.prints,
              {
                localKey: newKey('print'),
                printAreaId: area?.id ?? '',
                printSizeId: size?.id ?? '',
                uploadedAssetId: null,
                uploadedAssetUrl: null,
                designNote: '',
                printNotes: '',
              },
            ],
          }
        : it,
    ))
  }

  function handleRemovePrint(itemKey: string, printKey: string) {
    mutate((prev) => prev.map((it) =>
      it.localKey === itemKey ? { ...it, prints: it.prints.filter((p) => p.localKey !== printKey) } : it,
    ))
  }

  async function handleUploadDesign(itemKey: string, printKey: string, file: File) {
    try {
      const result = await filesApi.upload(file)
      updatePrint(itemKey, printKey, { uploadedAssetId: result.assetId, uploadedAssetUrl: result.fileUrl })
    } catch {
      setSaveError('Could not upload that design file. Please try again.')
    }
  }

  // ── Quote / save ────────────────────────────────────────────────────────────

  // Per-item client-side validity (the server is still the authority; this only gates the buttons and
  // surfaces inline hints). Garments need a variant; non-garment items (Badge) need a quantity at or
  // above the product minimum and a design when the product requires one.
  function itemMinQuantity(it: WorkingItem): number {
    return productDetails[it.productId]?.minimumQuantity ?? 1
  }
  function itemDesignRequired(it: WorkingItem): boolean {
    return productDetails[it.productId]?.designUploadRequired ?? false
  }
  function isItemValid(it: WorkingItem): boolean {
    if (!it.productId) return false
    if (isNonGarment(it.productKind)) {
      if (it.quantity < itemMinQuantity(it)) return false
      if (itemDesignRequired(it) && !it.uploadedAssetId) return false
      return true
    }
    return !!it.productVariantId
  }

  const hasItems = items.length > 0
  const everyItemValid = items.every(isItemValid)
  const canQuote = !quoting && !saving && hasItems && everyItemValid

  async function handleQuote() {
    setQuoting(true)
    setQuoteError(null)
    setSaveError(null)
    try {
      const result = await ordersApi.quoteContentUpdate(order.id, buildPayload(items))
      setQuote(result)
      setDirty(false)
      setAckCancelSessions(false)
    } catch (err) {
      setQuote(null)
      setQuoteError(friendlyError(err))
    } finally {
      setQuoting(false)
    }
  }

  const blocked = quote?.payment.isBlocked ?? false
  const needsSessionAck = !!quote && quote.payment.totalChanged && quote.payment.wouldCancelPendingPaymentSessions
  const canSave =
    !!quote && !blocked && !dirty && !quoting && !saving && (!needsSessionAck || ackCancelSessions)

  async function handleSave() {
    if (!quote) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await ordersApi.updateContent(order.id, buildPayload(items))
      onSaved(updated)
    } catch (err) {
      setSaveError(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const busy = quoting || saving

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-[2px] p-4 sm:items-start">
      <div
        className="relative my-6 w-full max-w-4xl rounded-[28px] border border-black/[0.08] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/[0.06] px-6 py-4">
          <div>
            <h2 className="text-base text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
              Edit Order Content
            </h2>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
              {order.orderNumber} · prices resolved by the server on preview &amp; save
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex h-8 w-8 items-center justify-center rounded-full text-black/35 transition-colors hover:bg-black/[0.06] hover:text-black disabled:opacity-40"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
          {dataError && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{dataError}</p>
          )}
          {loadingData && (
            <p className="rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3 text-sm text-black/55">
              Loading products and print options…
            </p>
          )}

          {/* Items */}
          {items.map((item, idx) => {
            const variants = productDetails[item.productId]?.variants ?? []
            const variantsLoading = !!item.productId && !productDetails[item.productId]
            const nonGarment = isNonGarment(item.productKind)
            const minQty = itemMinQuantity(item)
            const designRequired = itemDesignRequired(item)
            const itemDesignName = getFileName(item.uploadedAssetUrl)
            const belowMin = nonGarment && item.quantity < minQty
            const designMissing = nonGarment && designRequired && !item.uploadedAssetId
            return (
              <div key={item.localKey} className="rounded-2xl border border-black/[0.08] bg-black/[0.01] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
                    Item {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.localKey)}
                    disabled={busy}
                    className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40 transition-colors hover:text-red-600 disabled:opacity-40"
                  >
                    Remove item
                  </button>
                </div>

                <div className={nonGarment
                  ? 'grid grid-cols-1 gap-3 sm:grid-cols-[1fr_90px]'
                  : 'grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_90px]'}>
                  <div>
                    <label className={LABEL}>Product</label>
                    <select
                      className={FIELD}
                      value={item.productId}
                      disabled={busy || loadingData}
                      onChange={(e) => handleProductChange(item.localKey, e.target.value)}
                    >
                      {/* Keep the current product selectable even if it is not in the active list. */}
                      {!products.some((p) => p.id === item.productId) && item.productId && (
                        <option value={item.productId}>
                          {productDetails[item.productId]?.name ?? 'Current product'}
                        </option>
                      )}
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  {/* Variant — garment only (Badge has no variant, Jira 9505). */}
                  {!nonGarment && (
                    <div>
                      <label className={LABEL}>Variant (colour / size)</label>
                      <select
                        className={FIELD}
                        value={item.productVariantId}
                        disabled={busy || variantsLoading}
                        onChange={(e) => updateItem(item.localKey, { productVariantId: e.target.value })}
                      >
                        {variantsLoading && <option value="">Loading…</option>}
                        {!variantsLoading && variants.length === 0 && <option value="">No variants</option>}
                        {variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.color} / {v.size}{v.sku ? ` · ${v.sku}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className={LABEL}>Qty</label>
                    <input
                      type="number"
                      min={nonGarment ? minQty : 1}
                      max={100000}
                      className={FIELD}
                      value={item.quantity}
                      disabled={busy}
                      onChange={(e) => updateItem(item.localKey, { quantity: Math.max(1, parseInt(e.target.value || '1', 10) || 1) })}
                    />
                  </div>
                </div>

                {/* Non-garment (Badge, Jira 9505): item-level design + note, no variant, no prints. */}
                {nonGarment && (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-xl border border-black/[0.08] bg-white p-3">
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className={LABEL}>Design note</label>
                          <input
                            className={FIELD}
                            value={item.designNote}
                            disabled={busy}
                            placeholder="e.g. 25mm round button badge, full-bleed artwork"
                            onChange={(e) => updateItem(item.localKey, { designNote: e.target.value })}
                          />
                        </div>
                      </div>

                      {/* Item-level design asset */}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">
                          {item.uploadedAssetUrl ? `Design: ${itemDesignName}` : 'No design file'}
                        </span>
                        <label className="inline-flex cursor-pointer items-center rounded-[50px] border border-dashed border-black/[0.15] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45 transition-colors hover:border-black/30 hover:text-black">
                          {item.uploadedAssetUrl ? 'Replace' : 'Upload'}
                          <input
                            type="file"
                            accept="image/*,.pdf,.ai,.svg"
                            className="hidden"
                            disabled={busy}
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) handleItemDesignUpload(item.localKey, file)
                              e.target.value = ''
                            }}
                          />
                        </label>
                        {item.uploadedAssetUrl && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => updateItem(item.localKey, { uploadedAssetId: null, uploadedAssetUrl: null })}
                            className="inline-flex items-center rounded-[50px] border border-black/[0.10] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/40 transition-colors hover:border-red-200 hover:text-red-600 disabled:opacity-40"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {/* Validity hints */}
                      {belowMin && (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
                          Minimum order quantity for this product is {minQty}.
                        </p>
                      )}
                      {designMissing && (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
                          This product requires a design upload before it can be saved.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Prints — garment only */}
                {!nonGarment && (
                <div className="mt-3 space-y-3">
                  {item.prints.map((print) => {
                    const fileName = getFileName(print.uploadedAssetUrl)
                    return (
                      <div key={print.localKey} className="rounded-xl border border-black/[0.08] bg-white p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Print</span>
                          <button
                            type="button"
                            onClick={() => handleRemovePrint(item.localKey, print.localKey)}
                            disabled={busy}
                            className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40 transition-colors hover:text-red-600 disabled:opacity-40"
                          >
                            Remove print
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className={LABEL}>Print position</label>
                            <select
                              className={FIELD}
                              value={print.printAreaId}
                              disabled={busy}
                              onChange={(e) => updatePrint(item.localKey, print.localKey, { printAreaId: e.target.value })}
                            >
                              {!areas.some((a) => a.id === print.printAreaId) && print.printAreaId && (
                                <option value={print.printAreaId}>Current position</option>
                              )}
                              {areas.map((a) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={LABEL}>Print size</label>
                            <select
                              className={FIELD}
                              value={print.printSizeId}
                              disabled={busy}
                              onChange={(e) => updatePrint(item.localKey, print.localKey, { printSizeId: e.target.value })}
                            >
                              {!sizes.some((s) => s.id === print.printSizeId) && print.printSizeId && (
                                <option value={print.printSizeId}>Current size</option>
                              )}
                              {sizes.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={LABEL}>Design note</label>
                            <input
                              className={FIELD}
                              value={print.designNote}
                              disabled={busy}
                              placeholder="e.g. centre chest, 20cm wide"
                              onChange={(e) => updatePrint(item.localKey, print.localKey, { designNote: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className={LABEL}>Print note</label>
                            <input
                              className={FIELD}
                              value={print.printNotes}
                              disabled={busy}
                              placeholder="internal production note"
                              onChange={(e) => updatePrint(item.localKey, print.localKey, { printNotes: e.target.value })}
                            />
                          </div>
                        </div>

                        {/* Design asset */}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">
                            {print.uploadedAssetUrl ? `Design: ${fileName}` : 'No design file'}
                          </span>
                          <label className="inline-flex cursor-pointer items-center rounded-[50px] border border-dashed border-black/[0.15] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45 transition-colors hover:border-black/30 hover:text-black">
                            {print.uploadedAssetUrl ? 'Replace' : 'Upload'}
                            <input
                              type="file"
                              accept="image/*,.pdf,.ai,.svg"
                              className="hidden"
                              disabled={busy}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleUploadDesign(item.localKey, print.localKey, file)
                                e.target.value = ''
                              }}
                            />
                          </label>
                          {print.uploadedAssetUrl && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => updatePrint(item.localKey, print.localKey, { uploadedAssetId: null, uploadedAssetUrl: null })}
                              className="inline-flex items-center rounded-[50px] border border-black/[0.10] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/40 transition-colors hover:border-red-200 hover:text-red-600 disabled:opacity-40"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  <button
                    type="button"
                    onClick={() => handleAddPrint(item.localKey)}
                    disabled={busy || areas.length === 0 || sizes.length === 0}
                    className="w-full rounded-xl border border-dashed border-black/[0.15] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45 transition-colors hover:border-black/30 hover:text-black disabled:opacity-40"
                  >
                    + Add print
                  </button>
                </div>
                )}
              </div>
            )
          })}

          {!hasItems && !loadingData && (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              An order must have at least one item. Add an item to continue.
            </p>
          )}

          <button
            type="button"
            onClick={handleAddItem}
            disabled={busy || loadingData || products.length === 0}
            className="w-full rounded-2xl border border-dashed border-black/[0.15] px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50 transition-colors hover:border-black/30 hover:text-black disabled:opacity-40"
          >
            + Add item
          </button>

          {/* Quote / preview */}
          {quoteError && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{quoteError}</p>
          )}

          {quote && (
            <div className="space-y-3 rounded-2xl border border-black/[0.08] bg-black/[0.02] px-4 py-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">Price Preview</span>
                <span className="rounded-full bg-black/[0.06] px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.54px] text-black/45">
                  Preview only — not saved
                </span>
              </div>

              <div className="space-y-1.5">
                <ImpactRow label="Order total" oldValue={money(quote.oldTotalAmount)} newValue={money(quote.newTotalAmount)} />
                <ImpactRow label="Balance due" oldValue={money(quote.payment.oldBalanceAmount)} newValue={money(quote.payment.newBalanceAmount)} />
                <ImpactRow label="Required payment" oldValue={money(quote.payment.oldRequiredPaymentAmount)} newValue={money(quote.payment.newRequiredPaymentAmount)} />
                {(quote.payment.oldRequiredDepositAmount != null || quote.payment.newRequiredDepositAmount != null) && (
                  <ImpactRow
                    label="Required deposit"
                    oldValue={quote.payment.oldRequiredDepositAmount != null ? money(quote.payment.oldRequiredDepositAmount) : '—'}
                    newValue={quote.payment.newRequiredDepositAmount != null ? money(quote.payment.newRequiredDepositAmount) : '—'}
                  />
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">Already paid</span>
                  <span className="text-black/70" style={{ letterSpacing: '-0.14px' }}>{money(quote.payment.paidAmount)}</span>
                </div>
                <ImpactRow label="Payment status" oldValue={quote.payment.currentPaymentStatus} newValue={quote.payment.previewPaymentStatus} />
              </div>

              {/* Custom-product (Badge, Jira 9505) line summary from the repriced preview order. Display
                  only — never treat preview ids as stable. */}
              {quote.previewOrder.items.some((it) => (it.productKind ?? 'Garment') !== 'Garment') && (
                <div className="space-y-1.5 rounded-xl border border-black/[0.08] bg-white px-3 py-2.5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Custom product items</p>
                  {quote.previewOrder.items
                    .filter((it) => (it.productKind ?? 'Garment') !== 'Garment')
                    .map((it, i) => (
                      <div key={it.id || `badge-${i}`} className="flex items-center justify-between gap-3 text-xs">
                        <span className="min-w-0 flex-1 truncate text-black/70" style={{ letterSpacing: '-0.14px' }}>
                          {it.productName}
                          {it.appliedQuantityTierMinQuantity != null && (
                            <span className="ml-1 text-black/40">· Tier {it.appliedQuantityTierMinQuantity}+</span>
                          )}
                        </span>
                        <span className="shrink-0 text-black/50">×{it.quantity}</span>
                        <span className="shrink-0 text-black" style={{ fontWeight: 540 }}>{money(it.lineTotal)}</span>
                      </div>
                    ))}
                </div>
              )}

              {/* Blocking reasons */}
              {blocked && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-red-600">Cannot be saved</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-red-700">
                    {quote.payment.blockingReasons.map((code) => (
                      <li key={code}>{ERROR_MESSAGES[code] ?? code}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {quote.warnings.map((w) => (
                <p key={w} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{w}</p>
              ))}

              {/* Pending-session cancellation confirmation */}
              {needsSessionAck && (
                <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={ackCancelSessions}
                    onChange={(e) => setAckCancelSessions(e.target.checked)}
                  />
                  <span>Saving changes the total and will cancel any pending online payment session(s). I understand.</span>
                </label>
              )}

              {dirty && (
                <p className="rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-xs text-black/55">
                  Content changed since this preview — preview again before saving.
                </p>
              )}
            </div>
          )}

          {saveError && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</p>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center gap-3 border-t border-black/[0.06] px-6 py-4">
          <Button type="button" size="sm" variant="white" loading={quoting} disabled={!canQuote} onClick={handleQuote}>
            Preview changes
          </Button>
          <Button type="button" size="sm" loading={saving} disabled={!canSave} onClick={handleSave}>
            Save changes
          </Button>
          <Button type="button" size="sm" variant="glass" disabled={busy} onClick={onClose} className="ml-auto">
            Cancel
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
