'use client'

import { useEffect, useRef } from 'react'
import { PricingBreakdownPanel } from '@/components/products/PricingBreakdownPanel'
import { PrintAreaSelector } from '@/components/products/PrintAreaSelector'
import { PrintSizeSelector } from '@/components/products/PrintSizeSelector'
import {
  MOBILE_CONFIGURATOR_STEPS,
  type MobileConfiguratorStep,
} from '@/features/products/configuration-persistence'
import { formatMoneyNZD } from '@/lib/pricing'
import type {
  PriceCalculationResponse,
  PrintArea,
  PrintAreaSizeOption,
  Product,
  UploadedAsset,
} from '@/types'

interface VariantLine {
  variantId: string
  color: string
  size: string
  quantity: number
}

interface Props {
  product: Product
  currentStep: MobileConfiguratorStep
  selectedColors: string[]
  uniqueColors: string[]
  uniqueSizes: string[]
  colorImageUrls: Map<string, string | null>
  variantLookup: Map<string, Product['variants'][number]>
  variantQtys: Record<string, number>
  quantityTextByVariant: Record<string, string | undefined>
  invalidQuantityVariantIds: string[]
  openQuantityColor: string | null
  availableAreas: PrintArea[]
  selectedAreas: PrintArea[]
  selectedAreaIds: string[]
  allowedSizesByArea: Record<string, PrintAreaSizeOption[]>
  allowedSizesLoadingByArea: Record<string, boolean>
  allowedSizesErrorByArea: Record<string, string | undefined>
  printSizeByArea: Record<string, string | undefined>
  printSizeNames: Record<string, string>
  perAreaValidationErrors: Record<string, string>
  printedSmallerByArea: Record<string, string>
  printAreaUploads: Record<string, UploadedAsset | undefined>
  printAreaNotes: Record<string, string>
  printAreaUploadErrors: Record<string, string | undefined>
  uploadingPrintAreaId: string | null
  dragOverPrintAreaId: string | null
  selectedLines: VariantLine[]
  totalQty: number
  pricingByVariantId: Record<string, PriceCalculationResponse | undefined>
  pricingErrorsByVariantId: Record<string, string | undefined>
  pricingGrandTotal: number
  pricingCurrency: string
  pricingIsComplete: boolean
  pricingLoading: boolean
  pricingError: string | null
  validationMessage: string | null
  addedToCart: boolean
  addToCartError: string | null
  progressionError: string | null
  onToggleColor: (color: string) => void
  onSetQuantityText: (variantId: string, value: string) => void
  onAdjustQuantity: (variantId: string, delta: number) => void
  onSetOpenQuantityColor: (color: string | null) => void
  onPrintAreasChange: (areaIds: string[]) => void
  onPrintSizeChange: (areaId: string, sizeId: string) => void
  onUploadFile: (areaId: string, file: File) => void
  onRemoveUpload: (areaId: string) => void
  onNoteChange: (areaId: string, note: string) => void
  onDragOver: (areaId: string) => void
  onDragLeave: () => void
  onNavigate: (step: MobileConfiguratorStep) => void
  onContinue: () => void
  onAddToCart: () => void
}

const LABELS: Record<MobileConfiguratorStep, string> = {
  colour: 'Colour',
  print: 'Print position and size',
  quantities: 'Sizes and quantities',
  artwork: 'Artwork',
  review: 'Review price',
}

export function MobileGarmentConfigurator(props: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const stepIndex = MOBILE_CONFIGURATOR_STEPS.indexOf(props.currentStep)
  const printIncomplete = props.selectedAreaIds.some((areaId) =>
    !props.printSizeByArea[areaId] ||
    props.allowedSizesLoadingByArea[areaId] ||
    Boolean(props.allowedSizesErrorByArea[areaId]),
  )

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [props.currentStep])

  const stickyStatus = props.invalidQuantityVariantIds.length > 0
    ? 'Correct quantity errors'
    : printIncomplete
    ? 'Complete print options'
    : props.totalQty === 0
    ? 'Enter quantities'
    : props.pricingLoading
    ? 'Updating price…'
    : props.pricingIsComplete
    ? `${props.totalQty} items · ${formatMoneyNZD(props.pricingGrandTotal)}`
    : 'Price unavailable'

  return (
    <div className="pb-[calc(7.5rem+env(safe-area-inset-bottom))] lg:hidden" data-testid="mobile-configurator">
      <nav aria-label="Product configuration progress" className="mb-5 overflow-hidden rounded-2xl border border-line bg-white p-3">
        <p className="mb-2 text-xs text-ink-secondary">Step {stepIndex + 1} of 5</p>
        <ol className="grid grid-cols-5 gap-1">
          {MOBILE_CONFIGURATOR_STEPS.map((step, index) => {
            const reachable = index <= stepIndex
            return (
              <li key={step}>
                <button
                  type="button"
                  disabled={!reachable}
                  aria-current={step === props.currentStep ? 'step' : undefined}
                  aria-label={`${LABELS[step]}${index < stepIndex ? ', completed' : step === props.currentStep ? ', current step' : ', not completed'}`}
                  onClick={() => props.onNavigate(step)}
                  className="flex min-h-11 w-full items-center justify-center rounded-xl border border-line text-xs disabled:cursor-not-allowed disabled:text-ink-muted enabled:text-ink"
                >
                  {index < stepIndex ? '✓' : index + 1}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      {props.currentStep !== 'colour' && (
        <div className="mb-4 flex flex-wrap gap-2" aria-label="Selected colours">
          {props.selectedColors.map((color) => (
            <span key={color} className="rounded-full border border-line px-3 py-1 text-xs text-ink-secondary">{color}</span>
          ))}
        </div>
      )}

      <section aria-labelledby="mobile-step-heading" className="card p-4 sm:p-6">
        <h2
          id="mobile-step-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-xl text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          {LABELS[props.currentStep]}
        </h2>

        {props.progressionError && (
          <div role="alert" tabIndex={-1} className="mt-3 rounded-xl border border-danger-border bg-danger-surface p-3 text-sm text-danger">
            {props.progressionError}
          </div>
        )}

        {props.currentStep === 'colour' && (
          <div className="mt-4">
            <p className="mb-3 text-sm text-ink-secondary">Choose one or more garment colours.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {props.uniqueColors.map((color) => {
                const selected = props.selectedColors.includes(color)
                const available = props.product.variants.some((variant) => variant.color === color && variant.isAvailable)
                const imageUrl = props.colorImageUrls.get(color)
                return (
                  <button
                    key={color}
                    type="button"
                    aria-pressed={selected}
                    aria-disabled={!available}
                    disabled={!available}
                    onClick={() => props.onToggleColor(color)}
                    className={`relative flex min-h-14 items-center gap-2 rounded-xl border p-2 text-left ${
                      selected ? 'border-ink bg-surface-inverse text-white ring-2 ring-ink ring-offset-2' : 'border-line-strong text-ink'
                    } disabled:border-dashed disabled:bg-surface-sunken disabled:text-ink-muted`}
                  >
                    {imageUrl ? (
                      // Decorative 36px swatch; the optimized primary gallery image remains the LCP candidate.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt="" loading="lazy" width={36} height={36} className="h-9 w-9 rounded-lg object-contain" />
                    ) : <span aria-hidden="true" className="h-9 w-9 rounded-lg border bg-surface-sunken" />}
                    <span className="text-sm">{color}{!available ? ' — unavailable' : ''}</span>
                    {selected && <span aria-hidden="true" className="ml-auto">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {props.currentStep === 'print' && (
          <div className="mt-4 space-y-4">
            <PrintAreaSelector areas={props.availableAreas} selectedAreaIds={props.selectedAreaIds} onChange={props.onPrintAreasChange} />
            <PrintSizeSelector
              selectedAreas={props.selectedAreas}
              allowedSizesByArea={props.allowedSizesByArea}
              allowedSizesLoadingByArea={props.allowedSizesLoadingByArea}
              allowedSizesErrorByArea={props.allowedSizesErrorByArea}
              printSizeByArea={props.printSizeByArea}
              errors={props.perAreaValidationErrors}
              printedSmallerNoteByArea={props.printedSmallerByArea}
              onChange={props.onPrintSizeChange}
            />
          </div>
        )}

        {props.currentStep === 'quantities' && (
          <div className="mt-4 space-y-3">
            {props.selectedColors.map((color) => {
              const open = props.openQuantityColor === color
              const subtotal = props.product.variants
                .filter((variant) => variant.color === color)
                .reduce((sum, variant) => sum + (props.variantQtys[variant.id] ?? 0), 0)
              return (
                <div key={color} className="rounded-2xl border border-line">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => props.onSetOpenQuantityColor(open ? null : color)}
                    className="flex min-h-14 w-full items-center gap-3 p-3 text-left"
                  >
                    {props.colorImageUrls.get(color) ? (
                      // Decorative 36px accordion swatch; avoids creating another responsive image candidate.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={props.colorImageUrls.get(color)!} alt="" loading="lazy" width={36} height={36} className="h-9 w-9 rounded-lg object-contain" />
                    ) : null}
                    <span className="flex-1 text-sm text-ink">{color}</span>
                    <span className="text-xs text-ink-muted">{subtotal} items</span>
                    <span aria-hidden="true">{open ? '−' : '+'}</span>
                  </button>
                  {open && (
                    <div className="space-y-2 border-t border-line p-3">
                      {props.uniqueSizes.map((size) => {
                        const variant = props.variantLookup.get(`${color}|${size}`)
                        if (!variant?.isAvailable) return <div key={size} className="flex min-h-11 items-center text-sm text-ink-muted"><span className="flex-1">{size}</span><span>Unavailable</span></div>
                        const invalid = props.invalidQuantityVariantIds.includes(variant.id)
                        const value = props.quantityTextByVariant[variant.id] ?? (props.variantQtys[variant.id] ? String(props.variantQtys[variant.id]) : '')
                        const errorId = `quantity-error-${variant.id}`
                        return (
                          <div key={size}>
                            <div className="grid grid-cols-[minmax(2.5rem,1fr)_2.75rem_minmax(4rem,5rem)_2.75rem] items-center gap-2">
                              <span id={`quantity-label-${variant.id}`} className="text-sm text-ink">{size}</span>
                              <button type="button" aria-label={`Decrease quantity for ${color}, size ${size}`} onClick={() => props.onAdjustQuantity(variant.id, -1)} className="min-h-11 rounded-lg border border-line-strong text-lg">−</button>
                              <input
                                type="text"
                                inputMode="numeric"
                                enterKeyHint="done"
                                value={value}
                                aria-label={`Quantity for ${color}, size ${size}`}
                                aria-invalid={invalid}
                                aria-describedby={invalid ? errorId : undefined}
                                onChange={(event) => props.onSetQuantityText(variant.id, event.target.value)}
                                className="min-h-11 min-w-0 scroll-mb-[calc(7.5rem+env(safe-area-inset-bottom))] rounded-lg border border-line-strong px-2 text-center text-base"
                              />
                              <button type="button" aria-label={`Increase quantity for ${color}, size ${size}`} onClick={() => props.onAdjustQuantity(variant.id, 1)} className="min-h-11 rounded-lg border border-line-strong text-lg">+</button>
                            </div>
                            {invalid && <p id={errorId} className="mt-1 text-xs text-danger">Enter a whole number from 0 to 999.</p>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            <p className="text-sm text-ink-secondary">Total quantity: <strong>{props.totalQty}</strong></p>
          </div>
        )}

        {props.currentStep === 'artwork' && (
          <div className="mt-4">
            <p className="mb-3 text-sm text-ink-secondary">Artwork is optional for garment products. Add a file or design note to the matching print position.</p>
            <PrintSizeSelector
              selectedAreas={props.selectedAreas}
              allowedSizesByArea={props.allowedSizesByArea}
              allowedSizesLoadingByArea={props.allowedSizesLoadingByArea}
              allowedSizesErrorByArea={props.allowedSizesErrorByArea}
              printSizeByArea={props.printSizeByArea}
              onChange={props.onPrintSizeChange}
              showSizeControls={false}
              printAreaUploads={props.printAreaUploads}
              printAreaNotes={props.printAreaNotes}
              printAreaUploadErrors={props.printAreaUploadErrors}
              uploadingPrintAreaId={props.uploadingPrintAreaId}
              dragOverPrintAreaId={props.dragOverPrintAreaId}
              onUploadFile={props.onUploadFile}
              onRemoveUpload={props.onRemoveUpload}
              onNoteChange={props.onNoteChange}
              onDragOver={props.onDragOver}
              onDragLeave={props.onDragLeave}
            />
          </div>
        )}

        {props.currentStep === 'review' && (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-line p-4 text-sm">
              <p><strong>{props.product.name}</strong></p>
              <p className="mt-2 text-ink-secondary">Colours: {props.selectedColors.join(', ')}</p>
              <ul className="mt-2 space-y-1 text-ink-secondary">
                {props.selectedLines.map((line) => <li key={line.variantId}>{line.color}, {line.size}: {line.quantity}</li>)}
              </ul>
              <p className="mt-2 text-ink-secondary">Total quantity: {props.totalQty}</p>
              <p className="mt-2 text-ink-secondary">Prints: {props.selectedAreas.length === 0 ? 'Blank garment' : props.selectedAreas.map((area) => `${area.name} — ${props.printSizeNames[props.printSizeByArea[area.id] ?? ''] ?? 'incomplete'}`).join(', ')}</p>
              <p className="mt-2 text-ink-secondary">Artwork: {props.selectedAreas.length === 0 ? 'Not applicable' : props.selectedAreas.map((area) => `${area.name}: ${props.printAreaUploads[area.id] ? 'uploaded' : 'not supplied'}`).join(', ')}</p>
            </div>
            {(!props.pricingIsComplete || props.addToCartError) && (
              <div role="alert" tabIndex={-1} className="rounded-2xl border border-warning-border bg-warning-surface p-4">
                <h3 className="text-sm font-medium text-warning">Check your configuration</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {props.selectedColors.length === 0 && <button type="button" onClick={() => props.onNavigate('colour')} className="underline">Choose colours</button>}
                  {Object.keys(props.perAreaValidationErrors).length > 0 && <button type="button" onClick={() => props.onNavigate('print')} className="underline">Complete print options</button>}
                  {(props.totalQty === 0 || props.invalidQuantityVariantIds.length > 0) && <button type="button" onClick={() => props.onNavigate('quantities')} className="underline">Correct quantities</button>}
                  {props.addToCartError && <span className="text-sm text-warning">{props.addToCartError}</span>}
                </div>
              </div>
            )}
            <PricingBreakdownPanel
              selectedLines={props.selectedLines}
              pricingByVariantId={props.pricingByVariantId}
              pricingErrorsByVariantId={props.pricingErrorsByVariantId}
              grandTotal={props.pricingGrandTotal}
              currency={props.pricingCurrency}
              isComplete={props.pricingIsComplete}
              loading={props.pricingLoading}
              error={props.pricingError}
              validationMessage={props.validationMessage}
            />
            <p className="text-sm text-ink-muted">Frontend prices are previews only. Final order pricing is recalculated by the backend at checkout.</p>
          </div>
        )}
      </section>

      <p role="status" aria-live="polite" className="sr-only">Step {stepIndex + 1} of 5: {LABELS[props.currentStep]}</p>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden" data-testid="mobile-sticky-bar">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="truncate text-xs text-ink-muted">{stickyStatus}</p>
            {props.pricingLoading && props.pricingGrandTotal > 0 && <p className="text-[10px] text-ink-muted">Previous total hidden while updating</p>}
          </div>
          {props.currentStep === 'review' ? (
            <button type="button" onClick={props.onAddToCart} disabled={!props.pricingIsComplete || props.uploadingPrintAreaId !== null} className="btn-black min-h-11 disabled:opacity-40">{props.addedToCart ? 'Added to cart' : 'Add to cart'}</button>
          ) : (
            <button type="button" onClick={props.onContinue} className="btn-black min-h-11">{props.currentStep === 'artwork' ? 'View price' : 'Continue'}</button>
          )}
        </div>
      </div>
    </div>
  )
}
