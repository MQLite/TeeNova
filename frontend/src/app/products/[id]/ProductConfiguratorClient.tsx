'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { filesApi } from '@/api/files'
import { pricingApi } from '@/api/pricing'
import { printConfigApi } from '@/api/print-config'
import { PricingBreakdownPanel } from '@/components/products/PricingBreakdownPanel'
import { PrintAreaSelector } from '@/components/products/PrintAreaSelector'
import { PrintSizeSelector } from '@/components/products/PrintSizeSelector'
import { PrintPriceTierTable } from '@/components/products/PrintPriceTierTable'
import { ProductImageGallery } from '@/components/products/ProductImageGallery'
import { ProductDetailsSection } from '@/components/products/ProductDetailsSection'
import { ProductHeroPrice } from '@/components/products/ProductHeroPrice'
import { useCartStore } from '@/features/cart/cart-store'
import { executeBatchWithRetry } from '@/features/cart/cart-pricing-orchestrator'
import {
  getCachedPrintAreaSizes,
  loadPrintAreaSizes,
} from '@/features/products/print-area-sizes-cache'
import {
  buildProductPricingBatches,
  mapProductPricingBatchResults,
} from '@/features/products/product-pricing-batch'
import {
  isMobileConfiguratorStep,
  restoreProductConfiguration,
  saveProductConfiguration,
  type MobileConfiguratorStep,
} from '@/features/products/configuration-persistence'
import { filterImagesForColor, resolveImageUrl } from '@/lib/image-utils'
import { formatMoneyNZD, cheapestPrintTierPrice, groupDefaultPrintLadders, resolveHeroPrintPrice } from '@/lib/pricing'
import { printableSizeIdsFromOptions, resolveAllowedPrintOptions, unsupportedSizesForPair } from '@/lib/print-options'
import type {
  BatchPriceCalculationResult,
  CartItemPrint,
  PriceCalculationResponse,
  PrintArea,
  PrintAreaSizeOption,
  PrintSize,
  Product,
  UploadedAsset,
} from '@/types'
import { MobileGarmentConfigurator } from './MobileGarmentConfigurator'

interface SelectedVariantLine {
  variantId: string
  color: string
  size: string
  quantity: number
}

interface Props {
  /** Product detail fetched by the server shell. The client never refetches it on mount. */
  product: Product
  /** Global active print areas fetched by the server shell. */
  printAreas: PrintArea[]
  /** Global active print sizes fetched by the server shell. */
  printSizes: PrintSize[]
}

const DEFAULT_CURRENCY = 'NZD'

function buildPrintSignature(prints: Array<{ printAreaId: string; printSizeId: string }>) {
  return prints.length === 0
    ? 'blank'
    : prints
        .map((print) => `${print.printAreaId}:${print.printSizeId}`)
        .sort()
        .join('|')
}

function buildSelectedVariantLines(product: Product, variantQtys: Record<string, number>): SelectedVariantLine[] {
  return product.variants
    .filter((variant) => variant.isAvailable)
    .map((variant) => ({
      variantId: variant.id,
      color: variant.color,
      size: variant.size,
      quantity: variantQtys[variant.id] ?? 0,
    }))
    .filter((line) => Number.isInteger(line.quantity) && line.quantity > 0)
}

/**
 * Interactive garment configurator (Jira 10304).
 *
 * Extracted verbatim from the former `'use client'` product route: every configuration rule — variant
 * and colour selection, scoped print-option resolution, per-area size loading, tier display,
 * validation, add-to-cart payload and cart item key — is unchanged. What changed is only *how data
 * arrives and how requests are shaped*:
 *
 *   • Initial product / print-area / print-size data arrives as props from the server shell, so this
 *     component issues **no** fetch on mount. Because it is server-rendered with those props, the
 *     product name, image, price and description are present in the HTML document.
 *   • Per-area size options come from a shared cache with in-flight deduplication.
 *   • Pricing uses the batch endpoint with a monotonic sequence guard so a slow earlier response can
 *     never overwrite a newer selection.
 *   • Non-sensitive selections are mirrored to `sessionStorage` so a refresh or a recoverable route
 *     error does not discard the customer's setup.
 *
 * The backend remains the sole pricing authority — nothing here computes a charged price.
 */
export function ProductConfiguratorClient({ product, printAreas, printSizes }: Props) {
  const addItem = useCartStore((state) => state.addItem)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [resetNotice, setResetNotice] = useState<string | null>(null)
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null)
  const [selectedPrintAreas, setSelectedPrintAreas] = useState<string[]>([])
  const [printSizeByArea, setPrintSizeByArea] = useState<Record<string, string | undefined>>({})
  const [allowedSizesByArea, setAllowedSizesByArea] = useState<Record<string, PrintAreaSizeOption[]>>({})
  const [allowedSizesLoadingByArea, setAllowedSizesLoadingByArea] = useState<Record<string, boolean>>({})
  const [allowedSizesErrorByArea, setAllowedSizesErrorByArea] = useState<Record<string, string | undefined>>({})
  const [printAreaUploads, setPrintAreaUploads] = useState<Record<string, UploadedAsset | undefined>>({})
  const [printAreaNotes, setPrintAreaNotes] = useState<Record<string, string>>({})
  const [printAreaUploadErrors, setPrintAreaUploadErrors] = useState<Record<string, string | undefined>>({})
  const [uploadingPrintAreaId, setUploadingPrintAreaId] = useState<string | null>(null)
  const [dragOverPrintAreaId, setDragOverPrintAreaId] = useState<string | null>(null)
  const selectedPrintAreasRef = useRef<string[]>([])
  const [variantQtys, setVariantQtys] = useState<Record<string, number>>({})
  const [quantityTextByVariant, setQuantityTextByVariant] = useState<Record<string, string | undefined>>({})
  const [invalidQuantityVariantIds, setInvalidQuantityVariantIds] = useState<string[]>([])
  const [debouncedVariantQtys, setDebouncedVariantQtys] = useState<Record<string, number>>({})
  const [focusedVariantId, setFocusedVariantId] = useState<string | null>(null)
  const [selectedColor, setSelectedColor] = useState<string | null>(product.variants[0]?.color ?? null)
  const [selectedColors, setSelectedColors] = useState<string[]>(
    product.variants[0]?.color ? [product.variants[0].color] : [],
  )
  const [mobileStep, setMobileStep] = useState<MobileConfiguratorStep>('colour')
  const [openQuantityColor, setOpenQuantityColor] = useState<string | null>(product.variants[0]?.color ?? null)
  const [progressionError, setProgressionError] = useState<string | null>(null)
  const [restoreComplete, setRestoreComplete] = useState(false)
  // SSR and the first hydration render use the desktop presentation. matchMedia switches the single
  // interactive tree after mount without reading viewport globals during render.
  const [isMobilePresentation, setIsMobilePresentation] = useState(false)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [pricingByVariantId, setPricingByVariantId] = useState<Record<string, PriceCalculationResponse | undefined>>({})
  const [pricingErrorsByVariantId, setPricingErrorsByVariantId] = useState<Record<string, string | undefined>>({})
  const [pricingLoading, setPricingLoading] = useState(false)
  const [pricingError, setPricingError] = useState<string | null>(null)
  const [addedToCart, setAddedToCart] = useState(false)
  const [addToCartError, setAddToCartError] = useState<string | null>(null)

  /** Set once the session-restore pass has run; gates persistence so defaults never clobber it. */
  const restoredRef = useRef(false)
  /** Monotonic pricing generation — only the newest run may write pricing state. */
  const pricingSequenceRef = useRef(0)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(max-width: 1023px)')
    const update = () => setIsMobilePresentation(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])

  const displayedImages = useMemo(
    () => filterImagesForColor(product.images, selectedColor),
    [product, selectedColor],
  )

  const selectedVariantLines = useMemo(
    () => buildSelectedVariantLines(product, variantQtys),
    [product, variantQtys],
  )

  const debouncedSelectedVariantLines = useMemo(
    () => buildSelectedVariantLines(product, debouncedVariantQtys),
    [product, debouncedVariantQtys],
  )

  const selectedAreaDetails = useMemo(
    () => selectedPrintAreas
      .map((areaId) => printAreas.find((area) => area.id === areaId))
      .filter((area): area is PrintArea => Boolean(area)),
    [printAreas, selectedPrintAreas],
  )

  const printSizeNames = useMemo(
    () => Object.fromEntries(printSizes.map((s) => [s.id, s.name])),
    [printSizes],
  )

  const printSizeSortOrder = useMemo(
    () => Object.fromEntries(printSizes.map((s) => [s.id, s.sortOrder])),
    [printSizes],
  )

  // ── Product/size scoped allowed print options (Jira 9206) ────────────────────
  // Distinct garment sizes the customer has entered quantities for (drives option scoping).
  const selectedSizes = useMemo(
    () => Array.from(new Set(selectedVariantLines.map((l) => l.size))),
    [selectedVariantLines],
  )

  const activeScopedOptions = useMemo(
    () => (product.printConfigOptions ?? []).filter((o) => o.isActive),
    [product],
  )

  // 'global' = use the global PrintAreaSizeOption matrix (unchanged); 'scoped' = offer the union of the
  // selected garment sizes' allowed pairs (Jira 9204). A print size suitable for only some selected
  // sizes stays offered — the smaller garments get a smaller print (see printedSmallerByArea below).
  const scopeResolution = useMemo(
    () => resolveAllowedPrintOptions(activeScopedOptions, selectedSizes),
    [activeScopedOptions, selectedSizes],
  )

  // Areas offered to the customer: all global areas, or (scoped) only those with an allowed size.
  const availableAreas = useMemo(() => {
    if (scopeResolution.mode === 'scoped') {
      return printAreas.filter((a) => scopeResolution.allowed.has(a.id))
    }
    return printAreas
  }, [printAreas, scopeResolution])

  // Per-area print sizes for display: the loaded global options, narrowed by the scoped union when scoped.
  const displayAllowedSizesByArea = useMemo(() => {
    if (scopeResolution.mode !== 'scoped') return allowedSizesByArea
    const out: Record<string, PrintAreaSizeOption[]> = {}
    for (const [areaId, opts] of Object.entries(allowedSizesByArea)) {
      const allowedSet = scopeResolution.allowed.get(areaId)
      out[areaId] = allowedSet ? opts.filter((o) => allowedSet.has(o.printSizeId)) : []
    }
    return out
  }, [allowedSizesByArea, scopeResolution])

  // Per-area "printed smaller" hint: for each chosen print size, the selected garment sizes that don't
  // natively fit it. Shown so the customer knows those sizes get a smaller image at the same price.
  const printedSmallerByArea = useMemo(() => {
    const out: Record<string, string> = {}
    for (const areaId of selectedPrintAreas) {
      const sizeId = printSizeByArea[areaId]
      if (!sizeId) continue
      const sizes = unsupportedSizesForPair(activeScopedOptions, selectedSizes, areaId, sizeId)
      if (sizes.length > 0) {
        out[areaId] = `We may print a smaller image on ${sizes.join(', ')} — the chosen print size doesn't fully fit these garment sizes.`
      }
    }
    return out
  }, [activeScopedOptions, selectedSizes, selectedPrintAreas, printSizeByArea])

  const missingPrintSizeAreaIds = useMemo(
    () =>
      selectedPrintAreas.filter((areaId) => {
        if (allowedSizesLoadingByArea[areaId]) return true
        if (allowedSizesErrorByArea[areaId]) return true
        const allowed = displayAllowedSizesByArea[areaId]
        if (!allowed || allowed.length === 0) return true
        const selectedSizeId = printSizeByArea[areaId]
        if (!selectedSizeId) return true
        return !allowed.some((o) => o.printSizeId === selectedSizeId)
      }),
    [displayAllowedSizesByArea, allowedSizesErrorByArea, allowedSizesLoadingByArea, printSizeByArea, selectedPrintAreas],
  )

  const perAreaValidationErrors = useMemo(
    () =>
      Object.fromEntries(
        missingPrintSizeAreaIds
          .filter((areaId) => {
            const allowed = displayAllowedSizesByArea[areaId]
            return (
              allowed &&
              allowed.length > 0 &&
              !allowedSizesErrorByArea[areaId] &&
              !allowedSizesLoadingByArea[areaId]
            )
          })
          .map((areaId) => [areaId, 'Choose a print size for this area.']),
      ),
    [displayAllowedSizesByArea, allowedSizesErrorByArea, allowedSizesLoadingByArea, missingPrintSizeAreaIds],
  )

  const totalQty = selectedVariantLines.reduce((sum, line) => sum + line.quantity, 0)

  // ── Print-only pricing (Jira 9206) ──────────────────────────────────────────
  const printTiers = useMemo(() => product.printPriceTiers ?? [], [product])

  // Display-only widgets (hero card + print-price matrix) must not advertise print sizes this product
  // can never select. The pricing group may price more sizes (e.g. A3) than the product allows via its
  // scoped config options (Jira 9204) — drop those before deriving any display tiers. null = global
  // mode (no scoped rows), so no narrowing. The live quote path stays driven by the actual selection.
  const printableSizeIds = useMemo(
    () => printableSizeIdsFromOptions(activeScopedOptions),
    [activeScopedOptions],
  )
  const displayPrintTiers = useMemo(
    () =>
      printableSizeIds == null
        ? printTiers
        : printTiers.filter((t) => printableSizeIds.has(t.printSizeId)),
    [printTiers, printableSizeIds],
  )

  const printLadders = useMemo(() => groupDefaultPrintLadders(displayPrintTiers), [displayPrintTiers])
  const hasPrintTiers = printLadders.length > 0

  // Default ladder for the compact tier table (Jira 9304/9303): the first print size by
  // PrintSize.SortOrder, matching the hero card's chosen size. Display-only; the live
  // PricingBreakdownPanel remains authoritative for the actually-selected configuration.
  const defaultPrintSizeId = useMemo(() => {
    const sortOrderById = new Map(printSizes.map((s) => [s.id, s.sortOrder]))
    return [...printLadders].sort(
      (a, b) =>
        (sortOrderById.get(a.printSizeId) ?? Number.MAX_SAFE_INTEGER) -
        (sortOrderById.get(b.printSizeId) ?? Number.MAX_SAFE_INTEGER),
    )[0]?.printSizeId
  }, [printSizes, printLadders])

  // Fixed garment "from" = base price + cheapest variant adjustment (garment price never discounted).
  const garmentFromPrice = useMemo(() => {
    const adjustments = product.variants.map((v) => v.priceAdjustment)
    return product.basePrice + (adjustments.length ? Math.min(...adjustments) : 0)
  }, [product])

  // Cheapest achievable printed-from = fixed garment + cheapest active print tier price.
  const cheapestPrint = useMemo(() => cheapestPrintTierPrice(displayPrintTiers), [displayPrintTiers])
  const printedFromPrice =
    hasPrintTiers && garmentFromPrice !== null && cheapestPrint !== null
      ? garmentFromPrice + cheapestPrint
      : null

  // Display-only hero "from/reference" price (Jira 9303): prefers the A3 ladder resolved at 10 pieces,
  // with fallbacks to the first ladder, printed-from, then garment-only. Never the live selected price.
  const heroPriceInfo = useMemo(
    () =>
      resolveHeroPrintPrice({
        tiers: displayPrintTiers,
        printSizes,
        printSizeNames,
        garmentFromPrice,
        printedFromPrice,
      }),
    [displayPrintTiers, printSizes, printSizeNames, garmentFromPrice, printedFromPrice],
  )

  // First tiered quote response that has arrived — used to highlight the applied print break.
  const appliedTierPricing = useMemo(() => {
    for (const line of selectedVariantLines) {
      const pricing = pricingByVariantId[line.variantId]
      if (pricing && pricing.pricingMode === 'Tiered') return pricing
    }
    return undefined
  }, [selectedVariantLines, pricingByVariantId])

  // Print-volume preview hint. Phrased as a product-page preview because this page only knows THIS
  // product's quantity — full cross-product group totals are resolved at checkout (Jira 9207).
  const nextTierHint = useMemo(() => {
    if (!appliedTierPricing) return null
    if (appliedTierPricing.nextTierMinQuantity == null || appliedTierPricing.nextTierUnitPrice == null)
      return 'Best print price applied'
    const remaining = appliedTierPricing.nextTierMinQuantity - totalQty
    if (remaining <= 0) return 'Best print price applied'
    return `Add ${remaining} more in this group to reach ${formatMoneyNZD(appliedTierPricing.nextTierUnitPrice)} print`
  }, [appliedTierPricing, totalQty])

  const pricingGrandTotal = selectedVariantLines.reduce(
    (sum, line) => sum + (pricingByVariantId[line.variantId]?.lineTotal ?? 0),
    0,
  )

  const pricingCurrency = selectedVariantLines
    .map((line) => pricingByVariantId[line.variantId]?.currency)
    .find((currency): currency is string => Boolean(currency)) ?? DEFAULT_CURRENCY

  const pricingIsComplete =
    selectedVariantLines.length > 0 &&
    missingPrintSizeAreaIds.length === 0 &&
    !pricingLoading &&
    selectedVariantLines.every(
      (line) => Boolean(pricingByVariantId[line.variantId]) && !pricingErrorsByVariantId[line.variantId],
    )

  const validationMessage = useMemo(() => {
    if (selectedVariantLines.length === 0) return 'Enter at least one quantity to preview pricing.'
    if (selectedPrintAreas.some((id) => allowedSizesLoadingByArea[id]))
      return 'Loading available print sizes…'
    if (selectedPrintAreas.some((id) => allowedSizesErrorByArea[id]))
      return 'Could not load print sizes for one or more areas. Deselect and reselect the area to retry.'
    if (missingPrintSizeAreaIds.length > 0) return 'Select a print size for every chosen print area to price this order.'
    if (pricingError) return pricingError
    return null
  }, [
    allowedSizesErrorByArea,
    allowedSizesLoadingByArea,
    missingPrintSizeAreaIds.length,
    pricingError,
    selectedPrintAreas,
    selectedVariantLines.length,
  ])

  // Screen-reader announcement for the asynchronous price update (Jira 10304 accessibility).
  // Mirrors what the visible panel shows; never announces a price that isn't complete.
  const priceAnnouncement = pricingLoading
    ? 'Updating price preview'
    : pricingIsComplete
    ? `Price preview updated. ${totalQty} item${totalQty !== 1 ? 's' : ''}, estimated total ${formatMoneyNZD(pricingGrandTotal)}.`
    : ''

  // ── Session restore (Jira 10304) ────────────────────────────────────────────
  // Runs once after mount, never during render, so the server and client first paints match.
  // Everything restored is re-validated against the product currently on screen.
  useEffect(() => {
    const restored = restoreProductConfiguration({ product, printAreas, printSizes })
    restoredRef.current = true
    setRestoreComplete(true)
    if (!restored) return

    const { state, dropped } = restored
    if (state.selectedColors.length > 0) setSelectedColors(state.selectedColors)
    if (state.selectedColor !== null) setSelectedColor(state.selectedColor)
    if (state.selectedImageId !== null) setSelectedImageId(state.selectedImageId)
    if (Object.keys(state.variantQtys).length > 0) setVariantQtys(state.variantQtys)
    if (state.selectedPrintAreas.length > 0) setSelectedPrintAreas(state.selectedPrintAreas)
    if (Object.keys(state.printSizeByArea).length > 0) setPrintSizeByArea(state.printSizeByArea)
    setMobileStep(state.mobileStep)
    setOpenQuantityColor(state.openQuantityColor)

    setRestoreNotice(
      dropped
        ? 'We restored your previous selection. Some options are no longer available and were removed — please check your choices.'
        : 'We restored your previous selection on this product.',
    )
    // Mount-only: restoring is a one-shot recovery of the customer's prior setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mirror the non-sensitive selection to sessionStorage. Uploads and design notes are deliberately
  // excluded (see configuration-persistence.ts).
  useEffect(() => {
    if (!restoredRef.current) return
    const printSizeEntries = Object.entries(printSizeByArea).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    )
    saveProductConfiguration(product.id, {
      selectedColors,
      selectedColor,
      selectedImageId,
      variantQtys,
      selectedPrintAreas,
      printSizeByArea: Object.fromEntries(printSizeEntries),
      mobileStep,
      openQuantityColor,
    })
  }, [product.id, selectedColors, selectedColor, selectedImageId, variantQtys, selectedPrintAreas, printSizeByArea, mobileStep, openQuantityColor])

  // The URL is the primary history source on mobile. A valid query wins over persisted presentation
  // state; an invalid value is corrected with replace so it does not create a broken history entry.
  useEffect(() => {
    if (!isMobilePresentation || !restoreComplete) return
    const queryStep = searchParams.get('step')
    if (isMobileConfiguratorStep(queryStep)) {
      const queryIndex = ['colour', 'print', 'quantities', 'artwork', 'review'].indexOf(queryStep)
      const fallback: MobileConfiguratorStep | null =
        queryIndex > 0 && selectedColors.length === 0
          ? 'colour'
          : queryIndex > 1 && missingPrintSizeAreaIds.length > 0
          ? 'print'
          : queryIndex > 2 && (selectedVariantLines.length === 0 || invalidQuantityVariantIds.length > 0)
          ? 'quantities'
          : null
      if (!fallback) {
        setMobileStep(queryStep)
        return
      }
      const params = new URLSearchParams(searchParams.toString())
      params.set('step', fallback)
      setMobileStep(fallback)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      return
    }

    const params = new URLSearchParams(searchParams.toString())
    params.set('step', 'colour')
    setMobileStep('colour')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [invalidQuantityVariantIds.length, isMobilePresentation, missingPrintSizeAreaIds.length, pathname, restoreComplete, router, searchParams, selectedColors.length, selectedVariantLines.length])

  const navigateMobileStep = useCallback((step: MobileConfiguratorStep) => {
    setProgressionError(null)
    setMobileStep(step)
    const params = new URLSearchParams(searchParams.toString())
    params.set('step', step)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  useEffect(() => {
    if (!restoreNotice) return
    const timeout = window.setTimeout(() => setRestoreNotice(null), 8000)
    return () => window.clearTimeout(timeout)
  }, [restoreNotice])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedVariantQtys(variantQtys)
    }, 400)

    return () => window.clearTimeout(timeout)
  }, [variantQtys])

  // Per-area global size options. The shared cache serves a repeat selection instantly and collapses
  // concurrent requests for the same area into one; the ref check still discards a response for an
  // area the customer has since deselected.
  useEffect(() => {
    selectedPrintAreasRef.current = selectedPrintAreas

    const toFetch = selectedPrintAreas.filter((id) => allowedSizesByArea[id] === undefined)
    if (toFetch.length === 0) return

    toFetch.forEach((areaId) => {
      const cached = getCachedPrintAreaSizes(areaId)
      if (cached) {
        setAllowedSizesByArea((prev) => (prev[areaId] ? prev : { ...prev, [areaId]: cached }))
        setAllowedSizesLoadingByArea((prev) => ({ ...prev, [areaId]: false }))
        setAllowedSizesErrorByArea((prev) => ({ ...prev, [areaId]: undefined }))
        setPrintSizeByArea((prev) => {
          const current = prev[areaId]
          if (current && !cached.some((o) => o.printSizeId === current)) {
            return { ...prev, [areaId]: undefined }
          }
          return prev
        })
        return
      }

      setAllowedSizesLoadingByArea((prev) => ({ ...prev, [areaId]: true }))
      setAllowedSizesErrorByArea((prev) => ({ ...prev, [areaId]: undefined }))

      loadPrintAreaSizes(areaId, (id) => printConfigApi.getAreaSizes(id))
        .then((options) => {
          if (!selectedPrintAreasRef.current.includes(areaId)) return
          setAllowedSizesByArea((prev) => ({ ...prev, [areaId]: options }))
          setAllowedSizesLoadingByArea((prev) => ({ ...prev, [areaId]: false }))
          setPrintSizeByArea((prev) => {
            const current = prev[areaId]
            if (current && !options.some((o) => o.printSizeId === current)) {
              return { ...prev, [areaId]: undefined }
            }
            return prev
          })
        })
        .catch((err) => {
          if (!selectedPrintAreasRef.current.includes(areaId)) return
          setAllowedSizesErrorByArea((prev) => ({
            ...prev,
            [areaId]: err instanceof Error ? err.message : 'Could not load print sizes for this area.',
          }))
          setAllowedSizesLoadingByArea((prev) => ({ ...prev, [areaId]: false }))
        })
    })
  }, [selectedPrintAreas, allowedSizesByArea])

  // Authoritative pricing preview. One batch request per ≤50 lines replaces the previous one request
  // per line; the backend result set is mapped back by correlation key. A stale generation is
  // discarded on arrival, so a slow earlier response can never overwrite a newer configuration.
  useEffect(() => {
    if (debouncedSelectedVariantLines.length === 0 || missingPrintSizeAreaIds.length > 0) {
      pricingSequenceRef.current += 1
      setPricingByVariantId({})
      setPricingErrorsByVariantId({})
      setPricingLoading(false)
      setPricingError(null)
      return
    }

    const prints = selectedPrintAreas.map((areaId) => ({
      printAreaId: areaId,
      printSizeId: printSizeByArea[areaId]!,
    }))

    // Tier scope is per-product across the page: every line's quote uses the SAME tierQuantity =
    // total quantity of this product across all selected variant lines (matches backend order rule).
    const tierQuantity = debouncedSelectedVariantLines.reduce((sum, line) => sum + line.quantity, 0)

    const sequence = pricingSequenceRef.current + 1
    pricingSequenceRef.current = sequence
    const isCurrent = () => pricingSequenceRef.current === sequence

    const controller = new AbortController()
    setPricingLoading(true)
    setPricingError(null)

    const batches = buildProductPricingBatches({
      productId: product.id,
      lines: debouncedSelectedVariantLines,
      tierQuantity,
      prints,
    })

    // Batches run sequentially so a large matrix cannot burst past the public rate limit.
    const run = async () => {
      const results: BatchPriceCalculationResult[] = []
      for (const batch of batches) {
        const { response } = await executeBatchWithRetry(batch, (items) =>
          pricingApi.calculateBatch(items, controller.signal),
        )
        results.push(...response.results)
        if (!isCurrent()) return null
      }
      return results
    }

    run()
      .then((results) => {
        if (!isCurrent() || results === null) return

        const { pricingByVariantId: nextPricing, errorsByVariantId: nextErrors } =
          mapProductPricingBatchResults(debouncedSelectedVariantLines, results)

        setPricingByVariantId(nextPricing)
        setPricingErrorsByVariantId(nextErrors)
        setPricingError(
          Object.keys(nextErrors).length > 0
            ? 'Pricing is unavailable for one or more selected variant lines.'
            : null,
        )
      })
      .catch(() => {
        if (!isCurrent()) return
        setPricingByVariantId({})
        setPricingErrorsByVariantId({})
        setPricingError('Pricing preview is temporarily unavailable.')
      })
      .finally(() => {
        if (isCurrent()) setPricingLoading(false)
      })

    return () => {
      // Invalidate this generation before aborting so a late rejection can never write state,
      // including on unmount.
      pricingSequenceRef.current += 1
      controller.abort()
    }
  }, [
    debouncedSelectedVariantLines,
    missingPrintSizeAreaIds.length,
    printSizeByArea,
    product.id,
    selectedPrintAreas,
  ])

  useEffect(() => {
    if (!addedToCart) return

    const timeout = window.setTimeout(() => setAddedToCart(false), 2500)
    return () => window.clearTimeout(timeout)
  }, [addedToCart])

  // Reset print selections that become invalid when the scoped allowed options change (e.g. the
  // customer switches garment sizes). Depends only on the scope (synchronous) so it never races
  // with the async per-area global-size loads. Global mode imposes no scoped narrowing here.
  useEffect(() => {
    if (scopeResolution.mode === 'global') return
    const allowed = scopeResolution.mode === 'scoped'
      ? scopeResolution.allowed
      : new Map<string, Set<string>>()

    const validAreas = selectedPrintAreas.filter((areaId) => allowed.has(areaId))
    const sizeResets = validAreas.filter((areaId) => {
      const sel = printSizeByArea[areaId]
      const set = allowed.get(areaId)
      return sel != null && (!set || !set.has(sel))
    })
    const areasChanged = validAreas.length !== selectedPrintAreas.length
    if (!areasChanged && sizeResets.length === 0) return

    if (areasChanged) handlePrintAreasChange(validAreas)
    if (sizeResets.length > 0) {
      setPrintSizeByArea((prev) => {
        const next = { ...prev }
        sizeResets.forEach((areaId) => { next[areaId] = undefined })
        return next
      })
    }
    setResetNotice('Your print selection was reset because it is not available for the selected size.')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeResolution])

  useEffect(() => {
    if (!resetNotice) return
    const timeout = window.setTimeout(() => setResetNotice(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [resetNotice])

  async function handlePrintAreaFileUpload(areaId: string, file: File) {
    setUploadingPrintAreaId(areaId)
    setPrintAreaUploadErrors((prev) => ({ ...prev, [areaId]: undefined }))
    try {
      const asset = await filesApi.upload(file)
      setPrintAreaUploads((prev) => ({ ...prev, [areaId]: asset }))
    } catch (error) {
      setPrintAreaUploads((prev) => ({ ...prev, [areaId]: undefined }))
      setPrintAreaUploadErrors((prev) => ({
        ...prev,
        [areaId]: error instanceof Error ? error.message : 'Could not upload this design. Please try again.',
      }))
    } finally {
      setUploadingPrintAreaId(null)
    }
  }

  function removePrintAreaUpload(areaId: string) {
    setPrintAreaUploads((prev) => {
      const next = { ...prev }
      delete next[areaId]
      return next
    })
    setPrintAreaUploadErrors((prev) => {
      const next = { ...prev }
      delete next[areaId]
      return next
    })
  }

  function setQty(variantId: string, value: string) {
    const nextQty = Math.max(0, Math.min(999, parseInt(value, 10) || 0))
    setVariantQtys((prev) => ({ ...prev, [variantId]: nextQty }))
    const variant = product.variants.find((item) => item.id === variantId)
    if (variant) setSelectedColors((prev) => prev.includes(variant.color) ? prev : [...prev, variant.color])
  }

  function setMobileQuantityText(variantId: string, value: string) {
    setQuantityTextByVariant((prev) => ({ ...prev, [variantId]: value }))
    if (!/^\d*$/.test(value) || (value !== '' && Number(value) > 999)) {
      setInvalidQuantityVariantIds((prev) => prev.includes(variantId) ? prev : [...prev, variantId])
      setVariantQtys((prev) => ({ ...prev, [variantId]: 0 }))
      return
    }
    setInvalidQuantityVariantIds((prev) => prev.filter((id) => id !== variantId))
    setQty(variantId, value)
  }

  function adjustMobileQuantity(variantId: string, delta: number) {
    const current = invalidQuantityVariantIds.includes(variantId) ? 0 : (variantQtys[variantId] ?? 0)
    const next = Math.max(0, Math.min(999, current + delta))
    setQuantityTextByVariant((prev) => ({ ...prev, [variantId]: next === 0 ? '' : String(next) }))
    setInvalidQuantityVariantIds((prev) => prev.filter((id) => id !== variantId))
    setQty(variantId, String(next))
  }

  function toggleMobileColor(color: string) {
    if (selectedColors.includes(color)) {
      setSelectedColors((prev) => prev.filter((item) => item !== color))
      const removedIds = product.variants.filter((variant) => variant.color === color).map((variant) => variant.id)
      setVariantQtys((prev) => {
        const next = { ...prev }
        removedIds.forEach((id) => delete next[id])
        return next
      })
      setQuantityTextByVariant((prev) => {
        const next = { ...prev }
        removedIds.forEach((id) => delete next[id])
        return next
      })
      setInvalidQuantityVariantIds((prev) => prev.filter((id) => !removedIds.includes(id)))
      if (selectedColor === color) {
        const fallback = selectedColors.find((item) => item !== color) ?? null
        setSelectedColor(fallback)
        setSelectedImageId(null)
      }
      if (openQuantityColor === color) setOpenQuantityColor(null)
      return
    }
    setSelectedColors((prev) => [...prev, color])
    setSelectedColor(color)
    setSelectedImageId(null)
    if (!openQuantityColor) setOpenQuantityColor(color)
  }

  function focusFirstInvalid(selector: string) {
    window.setTimeout(() => document.querySelector<HTMLElement>(selector)?.focus(), 0)
  }

  function continueMobileJourney() {
    setProgressionError(null)
    if (mobileStep === 'colour') {
      if (selectedColors.length === 0) {
        setProgressionError('Choose at least one available colour to continue.')
        focusFirstInvalid('[aria-label^="Black"], [aria-pressed]')
        return
      }
      navigateMobileStep('print')
      return
    }
    if (mobileStep === 'print') {
      if (missingPrintSizeAreaIds.length > 0) {
        setProgressionError('Choose a print size for every selected print position.')
        focusFirstInvalid('#mobile-step-heading')
        return
      }
      navigateMobileStep('quantities')
      return
    }
    if (mobileStep === 'quantities') {
      if (invalidQuantityVariantIds.length > 0 || totalQty === 0) {
        setProgressionError(invalidQuantityVariantIds.length > 0 ? 'Correct the invalid quantities before continuing.' : 'Enter at least one quantity to continue.')
        const firstId = invalidQuantityVariantIds[0]
        focusFirstInvalid(firstId ? `[aria-label*="${product.variants.find((variant) => variant.id === firstId)?.color ?? ''}, size"]` : '[aria-label^="Quantity for"]')
        return
      }
      navigateMobileStep('artwork')
      return
    }
    if (mobileStep === 'artwork') {
      if (uploadingPrintAreaId !== null) {
        setProgressionError('Wait for the artwork upload to finish before reviewing the price.')
        return
      }
      if (Object.values(printAreaUploadErrors).some(Boolean)) {
        setProgressionError('Resolve the artwork upload error before reviewing the price.')
        focusFirstInvalid('[role="alert"]')
        return
      }
      navigateMobileStep('review')
    }
  }

  function handlePrintAreasChange(areaIds: string[]) {
    const removed = selectedPrintAreas.filter((id) => !areaIds.includes(id))

    setSelectedPrintAreas(areaIds)
    setPrintSizeByArea((prev) => {
      const next: Record<string, string | undefined> = {}
      areaIds.forEach((areaId) => {
        next[areaId] = prev[areaId]
      })
      return next
    })

    if (removed.length > 0) {
      setAllowedSizesByArea((prev) => {
        const next = { ...prev }
        removed.forEach((id) => delete next[id])
        return next
      })
      setAllowedSizesLoadingByArea((prev) => {
        const next = { ...prev }
        removed.forEach((id) => delete next[id])
        return next
      })
      setAllowedSizesErrorByArea((prev) => {
        const next = { ...prev }
        removed.forEach((id) => delete next[id])
        return next
      })
      setPrintAreaUploads((prev) => {
        const next = { ...prev }
        removed.forEach((id) => delete next[id])
        return next
      })
      setPrintAreaNotes((prev) => {
        const next = { ...prev }
        removed.forEach((id) => delete next[id])
        return next
      })
      setPrintAreaUploadErrors((prev) => {
        const next = { ...prev }
        removed.forEach((id) => delete next[id])
        return next
      })
      if (removed.includes(uploadingPrintAreaId ?? '')) {
        setUploadingPrintAreaId(null)
      }
      if (removed.includes(dragOverPrintAreaId ?? '')) {
        setDragOverPrintAreaId(null)
      }
    }
  }

  function handlePrintSizeChange(areaId: string, sizeId: string) {
    setPrintSizeByArea((prev) => ({ ...prev, [areaId]: sizeId }))
  }

  function handleAddToCart() {
    setAddToCartError(null)

    if (selectedVariantLines.length === 0) {
      setAddToCartError('Enter at least one quantity before adding to cart.')
      return
    }

    if (missingPrintSizeAreaIds.length > 0) {
      setAddToCartError('Select a print size for every chosen print area before adding to cart.')
      return
    }

    if (!pricingIsComplete) {
      setAddToCartError('Wait for pricing preview to finish before adding these items to cart.')
      return
    }

    try {
      const prints: CartItemPrint[] = selectedPrintAreas.map((areaId) => {
        const area = printAreas.find((item) => item.id === areaId)
        const selectedSizeId = printSizeByArea[areaId]
        const sizeOption = displayAllowedSizesByArea[areaId]?.find((o) => o.printSizeId === selectedSizeId)

        if (!area || !sizeOption) {
          throw new Error('Print configuration is incomplete.')
        }

        const asset = printAreaUploads[areaId]
        const note = printAreaNotes[areaId]?.trim()

        return {
          printAreaId: area.id,
          printAreaName: area.name,
          printSizeId: sizeOption.printSize.id,
          printSizeName: sizeOption.printSize.name,
          uploadedAssetId: asset?.assetId,
          uploadedAssetUrl: asset?.fileUrl,
          designNote: note || undefined,
        }
      })

      const printSignature = buildPrintSignature(
        prints.map((print) => ({
          printAreaId: print.printAreaId,
          printSizeId: print.printSizeId,
        })),
      )

      selectedVariantLines.forEach((line) => {
        const pricing = pricingByVariantId[line.variantId]
        if (!pricing) {
          throw new Error('Pricing preview is incomplete for one or more selected variants.')
        }

        addItem({
          cartItemKey: `${line.variantId}__${printSignature}`,
          productId: product.id,
          productVariantId: line.variantId,
          productName: product.name,
          variantLabel: `${line.color} / ${line.size}`,
          color: line.color,
          size: line.size,
          unitPrice: pricing.unitPrice,
          quantity: line.quantity,
          // Persist group membership so the cart can aggregate print-tier quantity group-wide (Jira 9207).
          printPricingGroupId: product.printPricingGroupId ?? null,
          prints,
        })
      })

      setAddToCartError(null)
      setAddedToCart(true)
    } catch (error) {
      setAddToCartError(error instanceof Error ? error.message : 'Could not add these items to cart.')
    }
  }

  const activeImage =
    (selectedImageId ? displayedImages.find((image) => image.id === selectedImageId) : null) ??
    displayedImages[0] ??
    null

  // Build ordered unique lists by iterating variants in API order (backend returns by SortOrder)
  const uniqueColors: string[] = []
  const uniqueSizes: string[] = []
  const seenColors = new Set<string>()
  const seenSizes = new Set<string>()
  for (const v of product.variants) {
    if (!seenColors.has(v.color)) { seenColors.add(v.color); uniqueColors.push(v.color) }
    if (!seenSizes.has(v.size))   { seenSizes.add(v.size);   uniqueSizes.push(v.size) }
  }

  // O(1) variant lookup keyed by "color|size"
  const variantLookup = new Map<string, typeof product.variants[number]>()
  for (const v of product.variants) variantLookup.set(`${v.color}|${v.size}`, v)

  // First resolved image URL per color (null if none assigned)
  const colorFirstImageUrl = new Map<string, string | null>()
  for (const color of uniqueColors) {
    const imgs = filterImagesForColor(product.images, color)
    colorFirstImageUrl.set(color, imgs[0] ? resolveImageUrl(imgs[0].url) : null)
  }

  const priceAdjustments = uniqueSizes
    .map((size) => {
      const variant = product.variants.find((item) => item.size === size)
      return variant && variant.priceAdjustment !== 0 ? { size, adjustment: variant.priceAdjustment } : null
    })
    .filter((item): item is { size: string; adjustment: number } => item !== null)

  return (
    // The breadcrumb and page frame are owned by the server shell, which renders them before this
    // island streams in (see page.tsx).
    <div className="bg-white">
      <div className="section-container py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Image column scrolls with the page (Jira 9307) — no desktop sticky, so the long
              right-hand options/config tables get full vertical space. */}
          <div className="lg:self-start">
            {!isMobilePresentation && uniqueColors.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {uniqueColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-pressed={selectedColor === color}
                    onClick={() => {
                      setSelectedColor(color)
                      setSelectedImageId(null)
                    }}
                    className={`rounded-full border px-3 py-1.5 eyebrow transition-colors ${
                      selectedColor === color
                        ? 'border-ink bg-surface-inverse text-white'
                        : 'border-line-strong bg-white text-ink-muted hover:border-line-control hover:text-ink'
                    }`}
                  >
                    {color}
                  </button>
                ))}
              </div>
            )}

            <ProductImageGallery
              productName={product.name}
              activeImage={activeImage}
              images={displayedImages}
              onSelectImage={setSelectedImageId}
              selectedColor={selectedColor}
            />
          </div>

          <div className="flex flex-col gap-5">
            <div className="card p-6">
              <span className="mb-3 inline-block rounded-full border border-line px-3 py-0.5 eyebrow text-ink-muted">
                {product.productType}
              </span>
              <h1 className="text-2xl text-ink" style={{ fontWeight: 600 }}>
                {product.name}
              </h1>
              <ProductHeroPrice
                heroInfo={heroPriceInfo}
                garmentFromPrice={garmentFromPrice}
                basePrice={product.basePrice}
                priceAdjustments={priceAdjustments}
              />
            </div>

            {restoreNotice && (
              <p
                role="status"
                className="rounded-2xl border border-line bg-surface-sunken px-4 py-2.5 text-xs text-ink-secondary"
              >
                {restoreNotice}
              </p>
            )}

            {!isMobilePresentation && hasPrintTiers && (
              <div className="card p-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-ink" style={{ fontWeight: 500 }}>
                      Print volume pricing
                    </p>
                    <p className="mt-1 eyebrow text-ink-muted">
                      Print price per item · garment price is separate
                    </p>
                  </div>
                  {nextTierHint && (
                    <span className="rounded-full border border-line bg-surface-sunken px-3 py-1 text-[11px] text-ink-secondary">
                      {nextTierHint}
                    </span>
                  )}
                </div>
                <PrintPriceTierTable
                  tiers={displayPrintTiers}
                  printSizeNames={printSizeNames}
                  printSizeSortOrder={printSizeSortOrder}
                  appliedMinQuantity={appliedTierPricing?.appliedTierMinQuantity ?? null}
                  defaultPrintSizeId={defaultPrintSizeId}
                  collapsible
                />
              </div>
            )}
          </div>
        </div>

        {/* Configuration sections span the full page width below the gallery (Jira 9307) — the
            image column no longer pins, so the print area / sizes / wide quantity matrix fill the page. */}
        {isMobilePresentation ? (
          <div className="mt-6">
            <MobileGarmentConfigurator
              product={product}
              currentStep={mobileStep}
              selectedColors={selectedColors}
              uniqueColors={uniqueColors}
              uniqueSizes={uniqueSizes}
              colorImageUrls={colorFirstImageUrl}
              variantLookup={variantLookup}
              variantQtys={variantQtys}
              quantityTextByVariant={quantityTextByVariant}
              invalidQuantityVariantIds={invalidQuantityVariantIds}
              openQuantityColor={openQuantityColor}
              availableAreas={availableAreas}
              selectedAreas={selectedAreaDetails}
              selectedAreaIds={selectedPrintAreas}
              allowedSizesByArea={displayAllowedSizesByArea}
              allowedSizesLoadingByArea={allowedSizesLoadingByArea}
              allowedSizesErrorByArea={allowedSizesErrorByArea}
              printSizeByArea={printSizeByArea}
              printSizeNames={printSizeNames}
              perAreaValidationErrors={perAreaValidationErrors}
              printedSmallerByArea={printedSmallerByArea}
              printAreaUploads={printAreaUploads}
              printAreaNotes={printAreaNotes}
              printAreaUploadErrors={printAreaUploadErrors}
              uploadingPrintAreaId={uploadingPrintAreaId}
              dragOverPrintAreaId={dragOverPrintAreaId}
              selectedLines={selectedVariantLines}
              totalQty={totalQty}
              pricingByVariantId={pricingByVariantId}
              pricingErrorsByVariantId={pricingErrorsByVariantId}
              pricingGrandTotal={pricingGrandTotal}
              pricingCurrency={pricingCurrency}
              pricingIsComplete={pricingIsComplete}
              pricingLoading={pricingLoading}
              pricingError={pricingError}
              validationMessage={validationMessage}
              addedToCart={addedToCart}
              addToCartError={addToCartError}
              progressionError={progressionError}
              onToggleColor={toggleMobileColor}
              onSetQuantityText={setMobileQuantityText}
              onAdjustQuantity={adjustMobileQuantity}
              onSetOpenQuantityColor={setOpenQuantityColor}
              onPrintAreasChange={handlePrintAreasChange}
              onPrintSizeChange={handlePrintSizeChange}
              onUploadFile={handlePrintAreaFileUpload}
              onRemoveUpload={removePrintAreaUpload}
              onNoteChange={(areaId, note) => setPrintAreaNotes((prev) => ({ ...prev, [areaId]: note }))}
              onDragOver={setDragOverPrintAreaId}
              onDragLeave={() => setDragOverPrintAreaId(null)}
              onNavigate={navigateMobileStep}
              onContinue={continueMobileJourney}
              onAddToCart={handleAddToCart}
            />
            <ProductDetailsSection description={product.description} />
          </div>
        ) : (
        <div className="mt-8 flex flex-col gap-5" data-testid="desktop-configurator">
            <div className="card p-6">
              <PrintAreaSelector
                areas={availableAreas}
                selectedAreaIds={selectedPrintAreas}
                onChange={handlePrintAreasChange}
              />
              {resetNotice && (
                <p role="status" className="mt-3 rounded-2xl border border-warning-border bg-warning-surface px-4 py-2.5 text-xs text-amber-800">
                  {resetNotice}
                </p>
              )}
            </div>

            <div className="card p-6">
              <div className="mb-4">
                <p className="text-sm text-ink" style={{ fontWeight: 500 }}>
                  Print Sizes
                </p>
                <p className="mt-1 eyebrow text-ink-muted">
                  PrintArea controls placement · PrintSize controls print price
                </p>
              </div>
              <PrintSizeSelector
                selectedAreas={selectedAreaDetails}
                allowedSizesByArea={displayAllowedSizesByArea}
                allowedSizesLoadingByArea={allowedSizesLoadingByArea}
                allowedSizesErrorByArea={allowedSizesErrorByArea}
                printSizeByArea={printSizeByArea}
                errors={perAreaValidationErrors}
                printedSmallerNoteByArea={printedSmallerByArea}
                onChange={handlePrintSizeChange}
                printAreaUploads={printAreaUploads}
                printAreaNotes={printAreaNotes}
                printAreaUploadErrors={printAreaUploadErrors}
                uploadingPrintAreaId={uploadingPrintAreaId}
                dragOverPrintAreaId={dragOverPrintAreaId}
                onUploadFile={handlePrintAreaFileUpload}
                onRemoveUpload={removePrintAreaUpload}
                onNoteChange={(areaId, note) => setPrintAreaNotes((prev) => ({ ...prev, [areaId]: note }))}
                onDragOver={setDragOverPrintAreaId}
                onDragLeave={() => setDragOverPrintAreaId(null)}
              />
            </div>

            <div className="card p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-ink" style={{ fontWeight: 500 }}>
                    Sizes and Quantities
                  </p>
                  <p className="mt-1 eyebrow text-ink-muted">
                    Choose quantities per size and colour
                  </p>
                </div>
                {totalQty > 0 && (
                  <span className="eyebrow text-ink-muted">
                    {totalQty} item{totalQty !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {/* Constrained-height scroll box so the size-name header row can stick on scroll: an
                  overflow-x-only wrapper becomes the scroll container and breaks `sticky top`, so we
                  scroll both axes here (short matrices fit and never scroll). */}
              <div className="relative max-h-[70vh] w-full overflow-auto">
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      {/* Frozen corner: sticks both top (header row) and left (Colour column). */}
                      <th className="sticky left-0 top-0 z-40 w-36 border-b border-line bg-white pb-2 pr-3 text-left font-mono text-[11px] font-normal uppercase tracking-[0.54px] text-ink-muted shadow-[2px_0_4px_rgba(0,0,0,0.06)]">
                        Colour
                      </th>
                      {uniqueSizes.map((size) => {
                        const adjustment = variantLookup.get(`${uniqueColors[0]}|${size}`)?.priceAdjustment
                          ?? product.variants.find((v) => v.size === size)?.priceAdjustment
                          ?? 0
                        return (
                          <th
                            key={size}
                            className="sticky top-0 z-30 min-w-[4rem] border-b border-line bg-white px-1.5 pb-2 text-center font-mono text-[11px] font-normal uppercase tracking-[0.54px] text-ink-muted"
                          >
                            {size}
                            {adjustment !== 0 && <span className="block text-[9px] opacity-60">+${adjustment.toFixed(2)}</span>}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06]">
                    {uniqueColors.map((color) => {
                      return (
                        <tr key={color}>
                          {/* Sticky Color cell */}
                          <td className="sticky left-0 z-20 bg-white py-2 pr-3 align-middle shadow-[2px_0_4px_rgba(0,0,0,0.06)]">
                            <div className="flex items-center gap-2">
                              {colorFirstImageUrl.get(color) ? (
                                // Small decorative swatch: kept as a plain lazy <img>. It is one of many
                                // per row, never the LCP element, and its box is fixed at 32×32.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={colorFirstImageUrl.get(color)!}
                                  alt=""
                                  width={32}
                                  height={32}
                                  loading="lazy"
                                  className="h-8 w-8 shrink-0 rounded-lg border border-line bg-surface-sunken object-contain p-0.5"
                                />
                              ) : (
                                <span className="h-8 w-8 shrink-0 rounded-lg border border-line bg-surface-sunken" />
                              )}
                              <span className="text-xs text-ink">{color}</span>
                            </div>
                          </td>
                          {uniqueSizes.map((size) => {
                            const variant = variantLookup.get(`${color}|${size}`)
                            const unavailable = !variant || !variant.isAvailable
                            const isFocused = focusedVariantId === variant?.id
                            const displayValue = variant
                              ? isFocused && (variantQtys[variant.id] ?? 0) === 0
                                ? ''
                                : variantQtys[variant.id] || ''
                              : ''

                            return (
                              <td key={size} className="px-1.5 py-2 text-center align-middle">
                                {unavailable ? (
                                  <span aria-hidden="true" className="text-[10px] text-ink-muted">-</span>
                                ) : (
                                  <input
                                    type="number"
                                    min={0}
                                    max={999}
                                    value={displayValue}
                                    placeholder="0"
                                    aria-label={`Quantity for ${color} ${size}`}
                                    onFocus={() => setFocusedVariantId(variant.id)}
                                    onBlur={() => setFocusedVariantId(null)}
                                    onChange={(event) => setQty(variant.id, event.target.value)}
                                    className="w-14 rounded-lg border border-line bg-white px-1.5 py-1.5 text-center text-sm text-ink outline-none transition-colors focus:border-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  />
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 eyebrow text-ink-muted">
                Leave blank or enter 0 to skip. Final custom pricing is shown below.
              </p>
            </div>

            <PricingBreakdownPanel
              selectedLines={selectedVariantLines}
              pricingByVariantId={pricingByVariantId}
              pricingErrorsByVariantId={pricingErrorsByVariantId}
              grandTotal={pricingGrandTotal}
              currency={pricingCurrency}
              isComplete={pricingIsComplete}
              loading={pricingLoading}
              error={pricingError}
              validationMessage={validationMessage}
            />

            {/* Announces the asynchronous price update without moving focus or changing layout. */}
            <p role="status" aria-live="polite" className="sr-only">
              {priceAnnouncement}
            </p>

            <div className="card p-6">
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={pricingLoading || uploadingPrintAreaId !== null}
                className="btn-black w-full py-3 text-sm disabled:opacity-40"
              >
                {addedToCart
                  ? 'Added to Cart'
                  : totalQty > 0
                  ? `Add ${totalQty} Item${totalQty !== 1 ? 's' : ''} to Cart`
                  : 'Select quantities above'}
              </button>
              <p className="mt-3 text-center text-sm text-ink-muted">
                Frontend prices are previews only. Final order pricing is recalculated by the backend at checkout.
              </p>
              {addToCartError && (
                <p role="alert" className="mt-3 rounded-lg border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger">
                  {addToCartError}
                </p>
              )}
              {addedToCart && (
                <div className="mt-3 flex gap-2">
                  <Link href="/products" className="btn-glass btn-sm flex-1 text-center">Continue Shopping</Link>
                  <Link href="/cart" className="btn-black btn-sm flex-1 text-center">View Cart</Link>
                </div>
              )}
            </div>

            <ProductDetailsSection description={product.description} />
        </div>
        )}
      </div>
    </div>
  )
}
