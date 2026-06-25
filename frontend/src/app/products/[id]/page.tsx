'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { catalogApi } from '@/api/catalog'
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
import { filterImagesForColor, resolveImageUrl } from '@/lib/image-utils'
import { formatMoneyNZD, cheapestPrintTierPrice, groupDefaultPrintLadders, findPrintSizeIdByName, resolveHeroPrintPrice } from '@/lib/pricing'
import { resolveAllowedPrintOptions } from '@/lib/print-options'
import type {
  CartItemPrint,
  PriceCalculationResponse,
  PrintArea,
  PrintAreaSizeOption,
  PrintSize,
  Product,
  UploadedAsset,
} from '@/types'

interface SelectedVariantLine {
  variantId: string
  color: string
  size: string
  quantity: number
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

function buildSelectedVariantLines(product: Product | null, variantQtys: Record<string, number>): SelectedVariantLine[] {
  if (!product) return []

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

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const addItem = useCartStore((state) => state.addItem)

  const [product, setProduct] = useState<Product | null>(null)
  const [printAreas, setPrintAreas] = useState<PrintArea[]>([])
  const [printSizes, setPrintSizes] = useState<PrintSize[]>([])
  const [resetNotice, setResetNotice] = useState<string | null>(null)
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
  const loadingAreasRef = useRef<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [variantQtys, setVariantQtys] = useState<Record<string, number>>({})
  const [debouncedVariantQtys, setDebouncedVariantQtys] = useState<Record<string, number>>({})
  const [focusedVariantId, setFocusedVariantId] = useState<string | null>(null)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [pricingByVariantId, setPricingByVariantId] = useState<Record<string, PriceCalculationResponse | undefined>>({})
  const [pricingErrorsByVariantId, setPricingErrorsByVariantId] = useState<Record<string, string | undefined>>({})
  const [pricingLoading, setPricingLoading] = useState(false)
  const [pricingError, setPricingError] = useState<string | null>(null)
  const [addedToCart, setAddedToCart] = useState(false)
  const [addToCartError, setAddToCartError] = useState<string | null>(null)

  const displayedImages = useMemo(
    () => (product ? filterImagesForColor(product.images, selectedColor) : []),
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

  // ── Product/size scoped allowed print options (Jira 9206) ────────────────────
  // Distinct garment sizes the customer has entered quantities for (drives option scoping).
  const selectedSizes = useMemo(
    () => Array.from(new Set(selectedVariantLines.map((l) => l.size))),
    [selectedVariantLines],
  )

  const activeScopedOptions = useMemo(
    () => (product?.printConfigOptions ?? []).filter((o) => o.isActive),
    [product],
  )

  // 'global' = use the global PrintAreaSizeOption matrix (unchanged); 'scoped' = narrow to the
  // resolved pairs; 'empty' = selected sizes share no common print option (block prints).
  const scopeResolution = useMemo(
    () => resolveAllowedPrintOptions(activeScopedOptions, selectedSizes),
    [activeScopedOptions, selectedSizes],
  )

  const printSelectionBlocked = scopeResolution.mode === 'empty'

  // Areas offered to the customer: all global areas, or (scoped) only those with an allowed size.
  const availableAreas = useMemo(() => {
    if (scopeResolution.mode === 'scoped') {
      return printAreas.filter((a) => scopeResolution.allowed.has(a.id))
    }
    if (scopeResolution.mode === 'empty') return []
    return printAreas
  }, [printAreas, scopeResolution])

  // Per-area print sizes for display: the loaded global options, narrowed by the scoped set when scoped.
  const displayAllowedSizesByArea = useMemo(() => {
    if (scopeResolution.mode !== 'scoped') return allowedSizesByArea
    const out: Record<string, PrintAreaSizeOption[]> = {}
    for (const [areaId, opts] of Object.entries(allowedSizesByArea)) {
      const allowedSet = scopeResolution.allowed.get(areaId)
      out[areaId] = allowedSet ? opts.filter((o) => allowedSet.has(o.printSizeId)) : []
    }
    return out
  }, [allowedSizesByArea, scopeResolution])

  const multiSizeScopedNote =
    scopeResolution.mode === 'scoped' && selectedSizes.length > 1
      ? 'Some selected sizes support different print options. Only shared print options are shown.'
      : null

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
  const printTiers = useMemo(() => product?.printPriceTiers ?? [], [product])
  const printLadders = useMemo(() => groupDefaultPrintLadders(printTiers), [printTiers])
  const hasPrintTiers = printLadders.length > 0

  // Default ladder for the compact tier table (Jira 9304): prefer the A3 PrintSize when it has a
  // ladder, otherwise fall back to the first available group-default ladder. Display-only; the live
  // PricingBreakdownPanel remains authoritative for the actually-selected configuration.
  const defaultPrintSizeId = useMemo(() => {
    const a3 = findPrintSizeIdByName(printSizes, 'A3')
    if (a3 && printLadders.some((l) => l.printSizeId === a3)) return a3
    return printLadders[0]?.printSizeId
  }, [printSizes, printLadders])

  // Fixed garment "from" = base price + cheapest variant adjustment (garment price never discounted).
  const garmentFromPrice = useMemo(() => {
    if (!product) return null
    const adjustments = product.variants.map((v) => v.priceAdjustment)
    return product.basePrice + (adjustments.length ? Math.min(...adjustments) : 0)
  }, [product])

  // Cheapest achievable printed-from = fixed garment + cheapest active print tier price.
  const cheapestPrint = useMemo(() => cheapestPrintTierPrice(printTiers), [printTiers])
  const printedFromPrice =
    hasPrintTiers && garmentFromPrice !== null && cheapestPrint !== null
      ? garmentFromPrice + cheapestPrint
      : null

  // Display-only hero "from/reference" price (Jira 9303): prefers the A3 ladder resolved at 10 pieces,
  // with fallbacks to the first ladder, printed-from, then garment-only. Never the live selected price.
  const heroPriceInfo = useMemo(
    () =>
      resolveHeroPrintPrice({
        tiers: printTiers,
        printSizes,
        printSizeNames,
        garmentFromPrice,
        printedFromPrice,
      }),
    [printTiers, printSizes, printSizeNames, garmentFromPrice, printedFromPrice],
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
    if (loadError) return loadError
    if (!product) return 'Product could not be loaded.'
    if (selectedVariantLines.length === 0) return 'Enter at least one quantity to preview pricing.'
    if (printSelectionBlocked)
      return 'The selected sizes do not share a common print option. Please split the order or choose different sizes/options.'
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
    loadError,
    missingPrintSizeAreaIds.length,
    pricingError,
    printSelectionBlocked,
    product,
    selectedPrintAreas,
    selectedVariantLines.length,
  ])

  useEffect(() => {
    let isMounted = true

    setLoading(true)
    setLoadError(null)

    Promise.all([
      catalogApi.getProduct(id),
      printConfigApi.getAreas(),
      printConfigApi.getSizes(),
    ])
      .then(([loadedProduct, loadedAreas, loadedSizes]) => {
        if (!isMounted) return

        setProduct(loadedProduct)
        setPrintAreas(loadedAreas)
        setPrintSizes(loadedSizes)
        setSelectedColor(loadedProduct.variants[0]?.color ?? null)
      })
      .catch((error) => {
        if (!isMounted) return
        setLoadError(error instanceof Error ? error.message : 'Could not load this product.')
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [id])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedVariantQtys(variantQtys)
    }, 400)

    return () => window.clearTimeout(timeout)
  }, [variantQtys])

  useEffect(() => {
    selectedPrintAreasRef.current = selectedPrintAreas

    const toFetch = selectedPrintAreas.filter(
      (id) => allowedSizesByArea[id] === undefined && !loadingAreasRef.current.has(id),
    )

    if (toFetch.length === 0) return

    toFetch.forEach((areaId) => {
      loadingAreasRef.current.add(areaId)
      setAllowedSizesLoadingByArea((prev) => ({ ...prev, [areaId]: true }))
      setAllowedSizesErrorByArea((prev) => ({ ...prev, [areaId]: undefined }))

      printConfigApi.getAreaSizes(areaId)
        .then((options) => {
          loadingAreasRef.current.delete(areaId)
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
          loadingAreasRef.current.delete(areaId)
          if (!selectedPrintAreasRef.current.includes(areaId)) return
          setAllowedSizesErrorByArea((prev) => ({
            ...prev,
            [areaId]: err instanceof Error ? err.message : 'Could not load print sizes for this area.',
          }))
          setAllowedSizesLoadingByArea((prev) => ({ ...prev, [areaId]: false }))
        })
    })
  }, [selectedPrintAreas, allowedSizesByArea])

  useEffect(() => {
    if (!product) {
      setPricingByVariantId({})
      setPricingErrorsByVariantId({})
      setPricingLoading(false)
      setPricingError(null)
      return
    }

    if (debouncedSelectedVariantLines.length === 0) {
      setPricingByVariantId({})
      setPricingErrorsByVariantId({})
      setPricingLoading(false)
      setPricingError(null)
      return
    }

    if (missingPrintSizeAreaIds.length > 0) {
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

    let cancelled = false
    setPricingLoading(true)
    setPricingError(null)

    Promise.allSettled(
      debouncedSelectedVariantLines.map((line) =>
        pricingApi.calculatePricing({
          productId: product.id,
          variantId: line.variantId,
          quantity: line.quantity,
          tierQuantity,
          prints,
        }),
      ),
    )
      .then((results) => {
        if (cancelled) return

        const nextPricing: Record<string, PriceCalculationResponse | undefined> = {}
        const nextErrors: Record<string, string | undefined> = {}

        results.forEach((result, index) => {
          const line = debouncedSelectedVariantLines[index]
          if (!line) return

          if (result.status === 'fulfilled') {
            nextPricing[line.variantId] = result.value
          } else {
            nextErrors[line.variantId] = result.reason instanceof Error
              ? result.reason.message
              : 'Could not calculate pricing for this line.'
          }
        })

        setPricingByVariantId(nextPricing)
        setPricingErrorsByVariantId(nextErrors)

        if (Object.keys(nextErrors).length > 0) {
          setPricingError('Pricing is unavailable for one or more selected variant lines.')
        }
      })
      .catch(() => {
        if (cancelled) return
        setPricingByVariantId({})
        setPricingErrorsByVariantId({})
        setPricingError('Pricing preview is temporarily unavailable.')
      })
      .finally(() => {
        if (!cancelled) setPricingLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    debouncedSelectedVariantLines,
    missingPrintSizeAreaIds.length,
    printSizeByArea,
    product,
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
      removed.forEach((id) => loadingAreasRef.current.delete(id))
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

    if (!product) {
      setAddToCartError('Product could not be loaded.')
      return
    }

    if (selectedVariantLines.length === 0) {
      setAddToCartError('Enter at least one quantity before adding to cart.')
      return
    }

    if (printSelectionBlocked) {
      setAddToCartError('The selected sizes do not share a common print option. Split the order or choose different sizes/options.')
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

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-black" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-5xl font-thin text-black/20">?</p>
        <h2 className="text-lg text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
          Product not found
        </h2>
        {loadError && (
          <p className="max-w-md text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
            {loadError}
          </p>
        )}
        <Link href="/products" className="btn-glass btn-sm">Back to Products</Link>
      </div>
    )
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
    <div className="min-h-screen bg-white">
      <div className="border-b border-black/[0.08]">
        <div className="section-container py-3">
          <nav className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
            <Link href="/" className="hover:text-black transition-colors">Home</Link>
            <span className="opacity-40">/</span>
            <Link href="/products" className="hover:text-black transition-colors">Products</Link>
            <span className="opacity-40">/</span>
            <span className="text-black">{product.name}</span>
          </nav>
        </div>
      </div>

      <div className="section-container py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Image column scrolls with the page (Jira 9307) — no desktop sticky, so the long
              right-hand options/config tables get full vertical space. */}
          <div className="lg:self-start">
            {uniqueColors.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {uniqueColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      setSelectedColor(color)
                      setSelectedImageId(null)
                    }}
                    className={`rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.54px] transition-colors ${
                      selectedColor === color
                        ? 'border-black bg-black text-white'
                        : 'border-black/[0.12] bg-white text-black/55 hover:border-black/30 hover:text-black'
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
            />

            <div className="mt-3 grid grid-cols-3 gap-2">
              {['Premium cotton', 'Vivid print', 'Fast ship'].map((tag) => (
                <div key={tag} className="card flex items-center justify-center py-2.5 text-center">
                  <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">{tag}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="card p-6">
              <span className="mb-3 inline-block rounded-full border border-black/[0.08] px-3 py-0.5 font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
                {product.productType}
              </span>
              <h1 className="text-2xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.96px' }}>
                {product.name}
              </h1>
              <ProductHeroPrice
                heroInfo={heroPriceInfo}
                garmentFromPrice={garmentFromPrice}
                basePrice={product.basePrice}
                priceAdjustments={priceAdjustments}
              />
            </div>

            {hasPrintTiers && (
              <div className="card p-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                      Print volume pricing
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                      Print price per item · garment price is separate
                    </p>
                  </div>
                  {nextTierHint && (
                    <span className="rounded-full border border-black/[0.10] bg-black/[0.02] px-3 py-1 text-[11px] text-black/60" style={{ letterSpacing: '-0.14px' }}>
                      {nextTierHint}
                    </span>
                  )}
                </div>
                <PrintPriceTierTable
                  tiers={printTiers}
                  printSizeNames={printSizeNames}
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
        <div className="mt-8 flex flex-col gap-5">
            <div className="card p-6">
              {printSelectionBlocked ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  The selected sizes do not share a common print option. Please split the order or choose
                  different sizes/options to add prints.
                </div>
              ) : (
                <>
                  <PrintAreaSelector
                    areas={availableAreas}
                    selectedAreaIds={selectedPrintAreas}
                    onChange={handlePrintAreasChange}
                  />
                  {multiSizeScopedNote && (
                    <p className="mt-3 rounded-2xl border border-black/[0.08] bg-black/[0.02] px-4 py-2.5 text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>
                      {multiSizeScopedNote}
                    </p>
                  )}
                  {resetNotice && (
                    <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800" style={{ letterSpacing: '-0.14px' }}>
                      {resetNotice}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="card p-6">
              <div className="mb-4">
                <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                  Print Sizes
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
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
                  <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                    Sizes and Quantities
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                    Choose quantities per size and colour
                  </p>
                </div>
                {totalQty > 0 && (
                  <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
                    {totalQty} item{totalQty !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="relative w-full overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="border-b border-black/[0.08]">
                      {/* Sticky Color header */}
                      <th className="sticky left-0 z-30 w-36 bg-white pb-2 pr-3 text-left font-mono text-[11px] font-normal uppercase tracking-[0.54px] text-black/50 shadow-[2px_0_4px_rgba(0,0,0,0.06)]">
                        Colour
                      </th>
                      {uniqueSizes.map((size) => {
                        const adjustment = variantLookup.get(`${uniqueColors[0]}|${size}`)?.priceAdjustment
                          ?? product.variants.find((v) => v.size === size)?.priceAdjustment
                          ?? 0
                        return (
                          <th
                            key={size}
                            className="min-w-[4rem] px-1.5 pb-2 text-center font-mono text-[11px] font-normal uppercase tracking-[0.54px] text-black/50"
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
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={colorFirstImageUrl.get(color)!}
                                  alt={color}
                                  className="h-8 w-8 shrink-0 rounded-lg border border-black/[0.08] bg-black/[0.02] object-contain p-0.5"
                                />
                              ) : (
                                <span className="h-8 w-8 shrink-0 rounded-lg border border-black/[0.06] bg-black/[0.03]" />
                              )}
                              <span className="text-xs text-black" style={{ letterSpacing: '-0.14px' }}>{color}</span>
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
                                  <span className="text-[10px] text-black/20">-</span>
                                ) : (
                                  <input
                                    type="number"
                                    min={0}
                                    max={999}
                                    value={displayValue}
                                    placeholder="0"
                                    onFocus={() => setFocusedVariantId(variant.id)}
                                    onBlur={() => setFocusedVariantId(null)}
                                    onChange={(event) => setQty(variant.id, event.target.value)}
                                    className="w-14 rounded-lg border border-black/[0.10] bg-white px-1.5 py-1.5 text-center text-sm text-black outline-none transition-colors focus:border-black [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
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

            <div className="card p-6">
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={pricingLoading || uploadingPrintAreaId !== null || printSelectionBlocked}
                className="btn-black w-full py-3 text-sm disabled:opacity-40"
              >
                {addedToCart
                  ? 'Added to Cart'
                  : totalQty > 0
                  ? `Add ${totalQty} Item${totalQty !== 1 ? 's' : ''} to Cart`
                  : 'Select quantities above'}
              </button>
              <p className="mt-3 text-center text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
                Frontend prices are previews only. Final order pricing is recalculated by the backend at checkout.
              </p>
              {addToCartError && (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
      </div>
    </div>
  )
}
