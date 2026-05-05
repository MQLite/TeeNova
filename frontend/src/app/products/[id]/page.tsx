'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { catalogApi } from '@/api/catalog'
import { customizationApi } from '@/api/customization'
import { filesApi } from '@/api/files'
import { pricingApi } from '@/api/pricing'
import { printConfigApi } from '@/api/print-config'
import { PricingBreakdownPanel } from '@/components/products/PricingBreakdownPanel'
import { PrintAreaSelector } from '@/components/products/PrintAreaSelector'
import { PrintPositionSelector } from '@/components/products/PrintPositionSelector'
import { PrintSizeSelector } from '@/components/products/PrintSizeSelector'
import { useCartStore } from '@/features/cart/cart-store'
import { filterImagesForColor } from '@/lib/image-utils'
import type {
  CartItemPrint,
  PriceCalculationResponse,
  PrintArea,
  PrintAreaSizeOption,
  PrintPosition,
  PrintPositionOption,
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
  const [positions, setPositions] = useState<PrintPositionOption[]>([])
  const [selectedPositions, setSelectedPositions] = useState<number[]>([])
  const [positionUploads, setPositionUploads] = useState<Record<number, UploadedAsset>>({})
  const [positionNotes, setPositionNotes] = useState<Record<number, string>>({})
  const [uploadingPosition, setUploadingPosition] = useState<number | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<number | null>(null)
  const [printAreas, setPrintAreas] = useState<PrintArea[]>([])
  const [selectedPrintAreas, setSelectedPrintAreas] = useState<string[]>([])
  const [printSizeByArea, setPrintSizeByArea] = useState<Record<string, string | undefined>>({})
  const [allowedSizesByArea, setAllowedSizesByArea] = useState<Record<string, PrintAreaSizeOption[]>>({})
  const [allowedSizesLoadingByArea, setAllowedSizesLoadingByArea] = useState<Record<string, boolean>>({})
  const [allowedSizesErrorByArea, setAllowedSizesErrorByArea] = useState<Record<string, string | undefined>>({})
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

  const missingPrintSizeAreaIds = useMemo(
    () =>
      selectedPrintAreas.filter((areaId) => {
        if (allowedSizesLoadingByArea[areaId]) return true
        if (allowedSizesErrorByArea[areaId]) return true
        const allowed = allowedSizesByArea[areaId]
        if (!allowed || allowed.length === 0) return true
        const selectedSizeId = printSizeByArea[areaId]
        if (!selectedSizeId) return true
        return !allowed.some((o) => o.printSizeId === selectedSizeId)
      }),
    [allowedSizesByArea, allowedSizesErrorByArea, allowedSizesLoadingByArea, printSizeByArea, selectedPrintAreas],
  )

  const perAreaValidationErrors = useMemo(
    () =>
      Object.fromEntries(
        missingPrintSizeAreaIds
          .filter((areaId) => {
            const allowed = allowedSizesByArea[areaId]
            return (
              allowed &&
              allowed.length > 0 &&
              !allowedSizesErrorByArea[areaId] &&
              !allowedSizesLoadingByArea[areaId]
            )
          })
          .map((areaId) => [areaId, 'Choose a print size for this area.']),
      ),
    [allowedSizesByArea, allowedSizesErrorByArea, allowedSizesLoadingByArea, missingPrintSizeAreaIds],
  )

  const totalQty = selectedVariantLines.reduce((sum, line) => sum + line.quantity, 0)
  const garmentOnlyTotal = product
    ? product.variants.reduce((sum, variant) => {
        const qty = variantQtys[variant.id] ?? 0
        return sum + (qty > 0 ? (product.basePrice + variant.priceAdjustment) * qty : 0)
      }, 0)
    : 0

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
    if (missingPrintSizeAreaIds.length > 0) return 'Select a print size for every chosen print area to price this order.'
    if (pricingError) return pricingError
    return null
  }, [loadError, missingPrintSizeAreaIds.length, pricingError, product, selectedVariantLines.length])

  useEffect(() => {
    let isMounted = true

    setLoading(true)
    setLoadError(null)

    Promise.all([
      catalogApi.getProduct(id),
      customizationApi.getPrintPositions(),
      printConfigApi.getAreas(),
    ])
      .then(([loadedProduct, loadedPositions, loadedAreas]) => {
        if (!isMounted) return

        setProduct(loadedProduct)
        setPositions(loadedPositions)
        setPrintAreas(loadedAreas)
        setSelectedColor(loadedProduct.variants[0]?.color ?? null)

        const front = loadedPositions.find((position) => position.name === 'FrontCenter')
        if (front) setSelectedPositions([front.value])
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

    let cancelled = false
    setPricingLoading(true)
    setPricingError(null)

    Promise.allSettled(
      debouncedSelectedVariantLines.map((line) =>
        pricingApi.calculatePricing({
          productId: product.id,
          variantId: line.variantId,
          quantity: line.quantity,
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

  async function handleFileUpload(file: File, positionValue: number) {
    setUploadingPosition(positionValue)
    try {
      const asset = await filesApi.upload(file)
      setPositionUploads((prev) => ({ ...prev, [positionValue]: asset }))
    } finally {
      setUploadingPosition(null)
    }
  }

  function removePositionUpload(positionValue: number) {
    setPositionUploads((prev) => {
      const next = { ...prev }
      delete next[positionValue]
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
        const sizeOption = allowedSizesByArea[areaId]?.find((o) => o.printSizeId === selectedSizeId)

        if (!area || !sizeOption) {
          throw new Error('Print configuration is incomplete.')
        }

        return {
          printAreaId: area.id,
          printAreaName: area.name,
          printSizeId: sizeOption.printSize.id,
          printSizeName: sizeOption.printSize.name,
        }
      })

      const printSignature = buildPrintSignature(
        prints.map((print) => ({
          printAreaId: print.printAreaId,
          printSizeId: print.printSizeId,
        })),
      )

      const printPositions = selectedPositions
        .map((positionValue) => {
          const positionName = positions.find((position) => position.value === positionValue)?.name as PrintPosition | undefined
          const asset = positionUploads[positionValue]
          return positionName
            ? {
                position: positionName,
                uploadedAssetId: asset?.assetId,
                uploadedAssetUrl: asset?.fileUrl,
                designNote: positionNotes[positionValue] || undefined,
              }
            : null
        })
        .filter((position): position is NonNullable<typeof position> => position !== null)

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
          prints,
          printPositions,
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

  const uniqueColors = [...new Set(product.variants.map((variant) => variant.color))]
  const uniqueSizes = [...new Set(product.variants.map((variant) => variant.size))]
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
          <div className="lg:sticky lg:top-24 lg:self-start">
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

            <div className="card overflow-hidden">
              {activeImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeImage.url}
                  alt={product.name}
                  className="h-full w-full object-contain p-8"
                  style={{ minHeight: 360 }}
                />
              ) : (
                <div className="flex items-center justify-center bg-black/[0.02]" style={{ minHeight: 360 }}>
                  <svg viewBox="0 0 200 220" className="h-36 w-36 text-black/[0.06]" fill="currentColor">
                    <path d="M 59 36 L 30 48 L 14 85 L 41 94 L 44 85 L 44 185 L 156 185 L 156 85 L 159 94 L 186 85 L 170 48 L 141 36 C 134 54 118 61 100 61 C 82 61 66 54 59 36 Z" />
                  </svg>
                </div>
              )}
            </div>

            {displayedImages.length > 1 && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {displayedImages.map((image) => {
                  const isActive = image.id === activeImage?.id
                  return (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => setSelectedImageId(image.id)}
                      className={`relative overflow-hidden rounded-2xl border bg-white transition-all ${
                        isActive ? 'border-black shadow-sm' : 'border-black/[0.08] hover:border-black/[0.20]'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.url} alt="" className="aspect-square h-full w-full object-contain p-2" />
                    </button>
                  )
                })}
              </div>
            )}

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
              {product.description && (
                <p className="mt-2 text-sm leading-relaxed text-black/50" style={{ letterSpacing: '-0.14px', fontWeight: 400 }}>
                  {product.description}
                </p>
              )}
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl text-black" style={{ fontWeight: 400, letterSpacing: '-0.96px' }}>
                  ${product.basePrice.toFixed(2)}
                </span>
                <span className="text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>base garment price</span>
              </div>
              {priceAdjustments.length > 0 && (
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
                  {priceAdjustments.map((item) => `${item.size}: +$${item.adjustment.toFixed(2)}`).join(' | ')}
                </p>
              )}
            </div>

            <div className="card p-6">
              <PrintAreaSelector
                areas={printAreas}
                selectedAreaIds={selectedPrintAreas}
                onChange={handlePrintAreasChange}
              />
            </div>

            <div className="card p-6">
              <div className="mb-4">
                <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                  Print Sizes
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                  One shared print setup is applied to every selected garment line
                </p>
              </div>
              <PrintSizeSelector
                selectedAreas={selectedAreaDetails}
                allowedSizesByArea={allowedSizesByArea}
                allowedSizesLoadingByArea={allowedSizesLoadingByArea}
                allowedSizesErrorByArea={allowedSizesErrorByArea}
                printSizeByArea={printSizeByArea}
                errors={perAreaValidationErrors}
                onChange={handlePrintSizeChange}
              />
            </div>

            <div className="card p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                    Legacy Design Upload
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                    Legacy print-position flow kept separate in this phase
                  </p>
                </div>
              </div>
              <PrintPositionSelector
                positions={positions}
                selected={selectedPositions}
                onChange={setSelectedPositions}
              />
            </div>

            <div className="card p-6">
              <p className="mb-4 text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                Upload Designs
              </p>
              {selectedPositions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-black/[0.12] py-6 text-center text-sm text-black/55" style={{ letterSpacing: '-0.14px' }}>
                  Select a print position above first
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedPositions.map((positionValue) => {
                    const positionLabel = positions.find((position) => position.value === positionValue)?.displayLabel ?? ''
                    const asset = positionUploads[positionValue]
                    const isUploading = uploadingPosition === positionValue
                    const isDragOver = dragOverPosition === positionValue

                    return (
                      <div key={positionValue} className="space-y-2 rounded-lg border border-black/[0.08] p-3">
                        <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">{positionLabel}</p>
                        <div className="flex items-center gap-2">
                          <label
                            className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 transition-colors ${
                              isDragOver
                                ? 'border-black bg-black/[0.03]'
                                : asset
                                ? 'border-green-300 bg-green-50'
                                : 'border-black/[0.12] hover:border-black/30'
                            }`}
                            onDragOver={(event) => {
                              event.preventDefault()
                              setDragOverPosition(positionValue)
                            }}
                            onDragLeave={() => setDragOverPosition(null)}
                            onDrop={(event) => {
                              event.preventDefault()
                              setDragOverPosition(null)
                              const file = event.dataTransfer.files[0]
                              if (file) handleFileUpload(file, positionValue)
                            }}
                          >
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/svg+xml,image/webp,.ai,application/pdf"
                              className="hidden"
                              onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (file) handleFileUpload(file, positionValue)
                              }}
                            />
                            {isUploading ? (
                              <div className="flex items-center gap-2">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-black" />
                                <span className="text-xs text-black/55">Uploading...</span>
                              </div>
                            ) : asset ? (
                              <div className="flex w-full items-center gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={asset.fileUrl}
                                  alt=""
                                  className="h-7 w-7 shrink-0 rounded border border-black/[0.08] object-contain"
                                />
                                <span className="flex-1 truncate text-xs text-black">{asset.originalFileName}</span>
                                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.54px] text-black/50">
                                  change
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-black/55" style={{ letterSpacing: '-0.14px' }}>
                                Drop or click to upload
                              </span>
                            )}
                          </label>
                          {asset && (
                            <button
                              type="button"
                              onClick={() => removePositionUpload(positionValue)}
                              className="shrink-0 text-black/25 transition-colors hover:text-red-500"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <textarea
                          rows={2}
                          value={positionNotes[positionValue] ?? ''}
                          onChange={(event) => setPositionNotes((prev) => ({ ...prev, [positionValue]: event.target.value }))}
                          placeholder="Describe your design requirements..."
                          className="form-input resize-none text-xs"
                        />
                      </div>
                    )
                  })}
                </div>
              )}
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                PNG, JPG, SVG, WebP, AI, PDF | max 10 MB
              </p>
            </div>

            <div className="card p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
                    Sizes and Quantities
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                    Matrix selections share one print configuration
                  </p>
                </div>
                {totalQty > 0 && (
                  <span className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">
                    {totalQty} item{totalQty !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-black/[0.08]">
                      <th className="w-28 pb-2 pr-3 text-left font-mono text-[11px] uppercase tracking-[0.54px] text-black/50 font-normal">
                        Colour
                      </th>
                      {uniqueSizes.map((size) => {
                        const adjustment = product.variants.find((variant) => variant.size === size)?.priceAdjustment ?? 0
                        return (
                          <th
                            key={size}
                            className="min-w-[4rem] pb-2 px-1.5 text-center font-mono text-[11px] uppercase tracking-[0.54px] text-black/50 font-normal"
                          >
                            {size}
                            {adjustment !== 0 && <span className="block text-[9px] opacity-60">+${adjustment.toFixed(2)}</span>}
                          </th>
                        )
                      })}
                      <th className="pb-2 pl-3 text-right font-mono text-[11px] uppercase tracking-[0.54px] text-black/50 font-normal">
                        Garment
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06]">
                    {uniqueColors.map((color) => {
                      const rowGarmentTotal = uniqueSizes.reduce((sum, size) => {
                        const variant = product.variants.find((item) => item.color === color && item.size === size)
                        if (!variant) return sum
                        return sum + (variantQtys[variant.id] ?? 0) * (product.basePrice + variant.priceAdjustment)
                      }, 0)

                      return (
                        <tr key={color}>
                          <td className="py-2 pr-3 text-xs text-black align-middle" style={{ letterSpacing: '-0.14px' }}>
                            {color}
                          </td>
                          {uniqueSizes.map((size) => {
                            const variant = product.variants.find((item) => item.color === color && item.size === size)
                            const unavailable = !variant || !variant.isAvailable
                            const isFocused = focusedVariantId === variant?.id
                            const displayValue = variant
                              ? isFocused && (variantQtys[variant.id] ?? 0) === 0
                                ? ''
                                : variantQtys[variant.id] || ''
                              : ''

                            return (
                              <td key={size} className="py-2 px-1.5 text-center align-middle">
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
                          <td className="py-2 pl-3 text-right text-xs tabular-nums text-black align-middle">
                            {rowGarmentTotal > 0 ? `$${rowGarmentTotal.toFixed(2)}` : <span className="text-black/20">-</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {totalQty > 0 && (
                    <tfoot>
                      <tr className="border-t border-black/[0.08]">
                        <td colSpan={uniqueSizes.length + 1} className="pt-2.5 pr-3 font-mono text-[11px] uppercase tracking-[0.54px] text-black/50">
                          Garment-only subtotal before print pricing
                        </td>
                        <td className="pt-2.5 pl-3 text-right text-sm text-black tabular-nums" style={{ fontWeight: 540 }}>
                          ${garmentOnlyTotal.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
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
                disabled={pricingLoading || uploadingPosition !== null}
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
          </div>
        </div>
      </div>
    </div>
  )
}
