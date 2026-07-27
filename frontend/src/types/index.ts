// Catalog

/**
 * Business category of a product (Jira 9502/9503). Drives UI / admin / order-snapshot dispatch
 * (which selectors, panels, and editors to render), distinct from {@link PricingModel} which drives
 * pricing behavior, and distinct from the free-text display tag `productType`. Existing products
 * backfill to "Garment". Mirrors the backend `ProductKind` enum (Garment=0, Badge=1, Banner=2, Other=3).
 */
export type ProductKind = 'Garment' | 'Badge' | 'Banner' | 'Other'

/**
 * Pricing behavior of a product (Jira 9502/9503). The single behavioral discriminator the backend
 * pricing strategy dispatches on. Separate from {@link ProductKind} so one category can later support
 * several pricing models. Mirrors the backend `PricingModel` enum
 * (GarmentPrint=0, QuantityTierUnit=1, FixedSize=2, AreaBased=3, CustomQuoteOnly=4).
 */
export type PricingModel =
  | 'GarmentPrint'
  | 'QuantityTierUnit'
  | 'FixedSize'
  | 'AreaBased'
  | 'CustomQuoteOnly'

export interface ProductListItem {
  id: string
  name: string
  basePrice: number
  productType: string
  /** Business category (Jira 9503). Lets list/grid views branch without a detail fetch. */
  kind: ProductKind
  /** Pricing behavior (Jira 9503). */
  pricingModel: PricingModel
  /** Minimum sellable quantity (Jira 9503), enforced server-side. */
  minimumQuantity: number
  isActive: boolean
  thumbnailUrl: string | null
  primaryImageUrl: string | null
  variantCount: number
  /** Printed "from" price (Jira 9203): fixed garment price + cheapest active print tier, or null. */
  fromPrice: number | null
  /** True when the product's group has active print price tiers (Jira 9203). */
  hasPriceTiers: boolean
  /** Hero "from/reference" pricing so cards mirror the product-detail hero card (Jira 9303). Null when no printable tier. */
  hero: ProductHeroPrice | null
}

/** Display-only hero pricing for a product card — mirrors the product-detail hero card (Jira 9303). */
export interface ProductHeroPrice {
  /** Garment "from" price + the chosen print size's price at the reference quantity. */
  price: number
  /** Name of the chosen print size (first printable by sort order), e.g. "A3". */
  printSizeName: string
  /** Quantity the price is referenced at (reference quantity, or the tier break when higher). */
  quantity: number
  /** The resolved tier's actual MinQuantity — drives the "(Minimum N pieces)" vs reference copy. */
  tierMinQuantity: number
  /** Fixed garment "from" price (base + cheapest variant adjustment). */
  garmentFromPrice: number
  /** Per-size garment price adjustments. */
  sizeAdjustments: { size: string; adjustment: number }[]
}

/** Informational inventory state for a variant (Jira 9002/9003). Decoupled from sellability. */
export type InventoryStatus = 'NotRecorded' | 'InStock' | 'LowStock' | 'OutOfStock'

export interface ProductVariant {
  id: string
  sku: string
  color: string
  size: string
  priceAdjustment: number
  /** Null = not tracked. Always null when inventoryStatus is 'NotRecorded'. */
  stockQuantity: number | null
  isAvailable: boolean
  // Inventory (informational only; never gates checkout/availability)
  inventoryStatus: InventoryStatus
  lowStockThreshold: number | null
  inventoryNote: string | null
  inventoryUpdatedAt: string | null
  inventoryUpdatedBy: string | null
}

export interface UpsertProductVariantItem {
  id?: string
  sku: string
  color: string
  size: string
  priceAdjustment: number
  stockQuantity: number
  isAvailable: boolean
}

export interface BulkSaveProductVariantsPayload {
  variants: UpsertProductVariantItem[]
}

export interface MatrixCell {
  variantId?: string
  size: string
  color: string
  /** Empty string means the field is blank/invalid and blocks save. */
  priceAdjustment: number | ''
  isAvailable: boolean
  sku?: string
  stockQuantity: number
  isDirty: boolean
}

export interface ProductImage {
  id: string
  url: string
  isPrimary: boolean
  sortOrder: number
  color: string | null
}

/**
 * DEPRECATED (Jira 9203): legacy all-in quantity-break price tier (Jira 9102/9103). No longer used
 * by pricing. Kept only for backward compatibility; do not build new UI against this.
 * Use {@link ProductPrintPriceTier} (print-only tiers) instead.
 */
export interface ProductPriceTier {
  id: string
  productVariantId: string | null
  minQuantity: number
  unitPrice: number
}

/** @deprecated Legacy all-in tier row. See {@link CreateUpdateProductPrintPriceTier}. */
export interface CreateUpdateProductPriceTier {
  productVariantId?: string | null
  minQuantity: number
  unitPrice: number
}

/** @deprecated Legacy all-in replace payload. See {@link SetProductPrintPriceTiersPayload}. */
export interface SetProductPriceTiersPayload {
  tiers: CreateUpdateProductPriceTier[]
}

// Print pricing groups + print-only tiers (Jira 9203)

/**
 * Print-pricing aggregation group. Products in the same group combine quantities when resolving
 * print-tier breaks. The group governs the tier threshold only; PrintSize selects the price ladder.
 * Garment price is unaffected by groups.
 */
export interface PrintPricingGroup {
  id: string
  name: string
  code: string
  isActive: boolean
  sortOrder: number
}

export interface CreateUpdatePrintPricingGroup {
  name: string
  code: string
  isActive: boolean
  sortOrder: number
}

/**
 * Print-only quantity-break tier (Jira 9203). UnitPrintPrice is the resolved price for printing one
 * PrintSize on one garment at/above MinQuantity; NOT an all-in unit price. Belongs to a group.
 * size null = group default; non-null = garment-size override matching ProductVariant.Size.
 */
export interface ProductPrintPriceTier {
  id: string
  printPricingGroupId: string
  size: string | null
  printSizeId: string
  minQuantity: number
  unitPrintPrice: number
  isActive: boolean
  sortOrder: number
}

/** One tier row in a SetProductPrintPriceTiers replace payload. */
export interface CreateUpdateProductPrintPriceTier {
  size?: string | null
  printSizeId: string
  minQuantity: number
  unitPrintPrice: number
  isActive: boolean
  sortOrder: number
}

/** Replace-the-whole-set payload for a group's print price tiers. Empty list clears them. */
export interface SetProductPrintPriceTiersPayload {
  tiers: CreateUpdateProductPrintPriceTier[]
}

// Product/size scoped allowed print options (Jira 9204)

/**
 * A product/size scoped allowed print option (Jira 9204): which (PrintArea, PrintSize) a product,
 * optionally a specific garment size, permits a customer to select. Governs selectability only,
 * never price. size null = product default; non-null = garment-size override.
 */
export interface ProductPrintConfigOption {
  id: string
  productId: string
  size: string | null
  printAreaId: string
  printSizeId: string
  isActive: boolean
  sortOrder: number
}

/** One row in a SetProductPrintConfigOptions replace payload. */
export interface CreateUpdateProductPrintConfigOption {
  size?: string | null
  printAreaId: string
  printSizeId: string
  isActive: boolean
  sortOrder: number
}

/** Replace-the-whole-set payload for a product's scoped print options. Empty list reverts to global. */
export interface SetProductPrintConfigOptionsPayload {
  options: CreateUpdateProductPrintConfigOption[]
}

// Badge quantity-tier unit pricing (Jira 9503)

/**
 * A Badge quantity-break unit price rule (Jira 9503). Among active tiers the highest MinQuantity ≤
 * order quantity wins; line total = UnitPrice × quantity. Written only via the dedicated
 * quantity-price-tiers endpoint (single-writer); ordinary product save never touches these.
 */
export interface ProductQuantityPriceTier {
  id: string
  productId: string
  minQuantity: number
  unitPrice: number
  isActive: boolean
  sortOrder: number
}

/** One tier row in a {@link SetProductQuantityPriceTiersPayload} replace payload. */
export interface CreateUpdateProductQuantityPriceTier {
  minQuantity: number
  unitPrice: number
  isActive: boolean
  sortOrder: number
}

/**
 * Replace-the-whole-set payload for a product's Badge quantity-tier unit prices (single-writer
 * endpoint, Jira 9503). Empty list clears the product's quantity tiers (no resolvable Badge price
 * until configured again).
 */
export interface SetProductQuantityPriceTiersPayload {
  tiers: CreateUpdateProductQuantityPriceTier[]
}

// Banner fixed-size price options (Jira 9516/9517)

/**
 * A Banner fixed-size price option (Jira 9516): a catalogued standard size (e.g. "Pull-up 850×2000 mm")
 * with a known unit price. The customer selects one active option; the line prices authoritatively as
 * UnitPrice × quantity. Written only via the dedicated fixed-size-price-options endpoint (single-writer);
 * ordinary product save never touches these. Active rows only on the public product GET.
 */
export interface ProductFixedSizePriceOption {
  id: string
  productId: string
  label: string
  width: number
  height: number
  unit: BannerDimensionUnit
  unitPrice: number
  isActive: boolean
  sortOrder: number
}

/** One option row in a {@link SetProductFixedSizePriceOptionsPayload} replace payload. */
export interface CreateUpdateProductFixedSizePriceOption {
  /** Existing option id (ignored — the set endpoint replaces the whole set). Optional. */
  id?: string | null
  label: string
  width: number
  height: number
  unit: BannerDimensionUnit
  unitPrice: number
  isActive: boolean
  sortOrder: number
}

/**
 * Replace-the-whole-set payload for a product's Banner fixed-size price options (single-writer
 * endpoint, Jira 9516). Allowed only for Banner + FixedSize products. Empty list clears the product's
 * options (no selectable fixed-size price until configured again). No resolved price is ever sent
 * beyond the per-option unit price.
 */
export interface SetProductFixedSizePriceOptionsPayload {
  options: CreateUpdateProductFixedSizePriceOption[]
}

export interface Product {
  id: string
  name: string
  description: string | null
  basePrice: number
  productType: string
  /** Business category (Jira 9503). Drives storefront/admin dispatch. */
  kind: ProductKind
  /** Pricing behavior (Jira 9503). Drives the pricing strategy. */
  pricingModel: PricingModel
  /** Minimum sellable quantity (Jira 9503), enforced server-side. Always ≥ 1. */
  minimumQuantity: number
  /** When true, an order item for this product must carry a design asset (Jira 9503). */
  designUploadRequired: boolean
  isActive: boolean
  creationTime: string
  /** Print-pricing group assignment (Jira 9203). Null = ungrouped. Written via product update. */
  printPricingGroupId: string | null
  variants: ProductVariant[]
  images: ProductImage[]
  /** @deprecated Legacy all-in tiers (Jira 9102). Inert in pricing; do not use in new UI. */
  priceTiers: ProductPriceTier[]
  /** Print-only tiers resolved from this product's group (Jira 9203). Read-only here. */
  printPriceTiers: ProductPrintPriceTier[]
  /** Product/size scoped allowed print options (Jira 9204). Empty = global matrix fallback. */
  printConfigOptions: ProductPrintConfigOption[]
  /**
   * Badge quantity-tier unit prices (Jira 9503). Empty for non-Badge products. Active rows only on
   * the public GET; written via the dedicated quantity-price-tiers endpoint.
   */
  quantityPriceTiers: ProductQuantityPriceTier[]
  /**
   * Banner fixed-size price options (Jira 9516/9517). Empty for non-Banner / non-FixedSize products.
   * Active rows only on the public GET (customer-selectable standard sizes); written via the dedicated
   * fixed-size-price-options endpoint. Each option prices its line as unit × quantity.
   */
  fixedSizePriceOptions: ProductFixedSizePriceOption[]
}

// Customization

export interface PrintArea {
  id: string
  name: string
  code: string
  basePrice: number
  isActive: boolean
  sortOrder: number
}

export interface PrintSize {
  id: string
  name: string
  code: string
  basePrice: number
  isActive: boolean
  sortOrder: number
}

export interface PrintAreaSizeOption {
  id: string
  printAreaId: string
  printSizeId: string
  isActive: boolean
  sortOrder: number
  printSize: PrintSize
}

export interface CreateUpdatePrintAreaInput {
  name: string
  code: string
  basePrice: number
  isActive: boolean
  sortOrder: number
}

export interface CreateUpdatePrintSizeInput {
  name: string
  code: string
  basePrice: number
  isActive: boolean
  sortOrder: number
}

export interface SetPrintAreaSizeOptionInput {
  printSizeId: string
  isActive: boolean
  sortOrder: number
}

export interface PriceCalculationPrintItem {
  printAreaId: string
  printSizeId: string
}

export interface PriceCalculationRequest {
  productId: string
  /**
   * Garment variant (Jira 9503): required for garment quotes (enforced server-side), omitted for
   * non-garment quotes such as Badge (price depends only on quantity, not variant).
   */
  variantId?: string
  quantity: number
  /**
   * Total quantity of this product across all selected variant lines on the page (Jira 9104).
   * Drives quantity-break tier resolution. When omitted the backend falls back to `quantity`.
   */
  tierQuantity?: number
  prints: PriceCalculationPrintItem[]
  /**
   * Banner configuration (Jira 9516/9517). Required for a FixedSize Banner live quote — the server
   * reads only `sizePresetId` (the selected fixed-size option) for pricing; all other size fields are
   * ignored. Omitted for Garment/Badge quotes. Carries no price fields (backend is authoritative).
   */
  bannerDetail?: BannerDetailInput
}

export type PricingMode = 'Additive' | 'Tiered'

export interface PrintAddOnPrice {
  printAreaId: string
  printAreaName: string
  /** PrintArea base price: informational only; NOT charged under the print-only model (Jira 9203). */
  printAreaPrice: number
  printSizeId: string
  printSizeName: string
  /** PrintSize base price (informational). */
  printSizePrice: number
  /** The print price actually charged for this print (resolved tier or PrintSize base fallback). */
  resolvedUnitPrintPrice: number
  /** Applied print-tier break for this print, or null when base-price fallback was used. */
  appliedTierMinQuantity: number | null
  /** Next higher print-tier break for this print (for "add N more" hints), or null at the top. */
  nextTierMinQuantity: number | null
  nextTierUnitPrintPrice: number | null
  /** Charged amount for this print entry (= resolvedUnitPrintPrice). */
  linePrice: number
}

export interface PriceCalculationResponse {
  productBasePrice: number
  variantAdjustment: number
  printAddOns: PrintAddOnPrice[]
  /** Fixed garment unit price = productBasePrice + variantAdjustment. Never discounted (Jira 9203). */
  garmentUnitPrice: number
  /** Sum of resolved print prices across all selected prints (0 when none). */
  printUnitPrice: number
  /** garmentUnitPrice + printUnitPrice. */
  unitPrice: number
  quantity: number
  lineTotal: number
  currency: string
  /** "Additive" (no print tier applied) or "Tiered" (at least 1 print tier applied). */
  pricingMode: PricingMode
  /** Backward-compat: applied print-tier break of the first tiered print, or null. */
  appliedTierMinQuantity: number | null
  /** Backward-compat: resolved print price of the first tiered print, or null. */
  appliedTierUnitPrice: number | null
  /** Backward-compat: next break of the first tiered print, for hints. */
  nextTierMinQuantity: number | null
  nextTierUnitPrice: number | null
  /** @deprecated Always 0 under the print-only model (Jira 9203). No standard print is included. */
  includedStandardPrintAmount: number
}

// Files

export interface UploadedAsset {
  assetId: string
  fileUrl: string
  originalFileName: string
  fileSizeBytes: number
}

// Banner quote enquiries (Jira 9511/9512) — enquiry-first; no price, no order, no payment.

/** How a banner size is specified. Mirrors backend `BannerSizeMode` (Preset=0, Custom=1). */
export type BannerSizeMode = 'Preset' | 'Custom'

/** Unit of banner width/height. Mirrors backend `BannerDimensionUnit` (Mm=0, Cm=1, M=2). */
export type BannerDimensionUnit = 'Mm' | 'Cm' | 'M'

/** Banner material. Mirrors backend `BannerMaterial` (PullUp=0, Pvc=1, Mesh=2, Fabric=3, Other=4). */
export type BannerMaterial = 'PullUp' | 'Pvc' | 'Mesh' | 'Fabric' | 'Other'

/** Banner quote enquiry workflow status. Mirrors backend `BannerQuoteRequestStatus`. */
export type BannerQuoteRequestStatus = 'New' | 'Reviewed' | 'ConvertedToOrder' | 'Cancelled'

/**
 * Banner configuration input (Jira 9511/9512). Mirrors the backend `BannerDetailInputDto`. Carries no
 * price and no area — the server computes `areaSquareMetres`.
 */
export interface BannerDetailInput {
  sizeMode: BannerSizeMode
  sizePresetId?: string | null
  sizeLabel?: string | null
  width?: number | null
  height?: number | null
  unit?: BannerDimensionUnit | null
  material: BannerMaterial
  materialDisplayName?: string | null
  finishingEyelets: boolean
  finishingHemming: boolean
  finishingPolePocket: boolean
  finishingOther?: string | null
  standIncluded: boolean
  standReplacementOnly: boolean
  notes?: string | null
}

/**
 * Banner configuration snapshot returned on an order item (Jira 9511/9514). Mirrors the backend
 * `BannerDetailDto`. `areaSquareMetres` is server-computed. No price fields.
 */
export interface BannerDetail {
  id: string
  sizeMode: BannerSizeMode
  sizePresetId?: string | null
  sizeLabel?: string | null
  width?: number | null
  height?: number | null
  unit?: BannerDimensionUnit | null
  areaSquareMetres?: number | null
  material: BannerMaterial
  materialDisplayName?: string | null
  finishingEyelets: boolean
  finishingHemming: boolean
  finishingPolePocket: boolean
  finishingOther?: string | null
  standIncluded: boolean
  standReplacementOnly: boolean
  notes?: string | null
}

/** Banner quote enquiry submission payload (Jira 9512). No price fields, no variant, no prints. */
export interface BannerEnquiryRequest {
  productId: string
  quantity: number
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  message?: string | null
  uploadedAssetId?: string | null
  uploadedAssetUrl?: string | null
  designNote?: string | null
  bannerDetail: BannerDetailInput
}

/** Result of submitting a Banner enquiry (Jira 9512). No payment URL. */
export interface BannerEnquiryResult {
  id: string
  status: BannerQuoteRequestStatus
  productId: string
  productName: string
  quantity: number
  areaSquareMetres?: number | null
  message: string
}

/** Full Banner enquiry for the admin review surface (Jira 9512). */
export interface BannerQuoteRequest {
  id: string
  productId: string
  productNameSnapshot: string
  quantity: number
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  message?: string | null
  uploadedAssetId?: string | null
  uploadedAssetUrl?: string | null
  designNote?: string | null
  sizeMode: BannerSizeMode
  sizePresetId?: string | null
  sizeLabel?: string | null
  width?: number | null
  height?: number | null
  unit?: BannerDimensionUnit | null
  areaSquareMetres?: number | null
  material: BannerMaterial
  materialDisplayName?: string | null
  finishingEyelets: boolean
  finishingHemming: boolean
  finishingPolePocket: boolean
  finishingOther?: string | null
  standIncluded: boolean
  standReplacementOnly: boolean
  bannerNotes?: string | null
  status: BannerQuoteRequestStatus
  convertedOrderId?: string | null
  creationTime: string
}

/** Admin conversion of a Banner enquiry to an unpaid priced order (Jira 9513). No price from customer. */
export interface ConvertBannerQuoteRequest {
  quotedTotal: number
  adminNote?: string | null
  customerNote?: string | null
  deliveryMethod?: DeliveryMethod | null
}

/** Result of converting a Banner enquiry to an order (Jira 9513). No payment URL. */
export interface ConvertBannerQuoteRequestResult {
  quoteRequestId: string
  status: BannerQuoteRequestStatus
  orderId: string
  orderNumber: string
  orderTotal: number
}

// Orders

export type OrderStatus =
  | 'Pending'
  | 'Cancelled'
  | 'Paid'
  | 'Reviewing'
  | 'Printing'
  | 'Ready'
  | 'Completed'

export type DeliveryMethod = 'Pickup' | 'Shipping'

export type PaymentStatus =
  | 'Unpaid'
  | 'DepositRequired'
  | 'DepositPaid'
  | 'PartiallyPaid'
  | 'Paid'
  | 'Refunded'
  | 'PaymentFailed'

export type PaymentRequirementType =
  | 'DepositThenBalance'
  | 'FullPaymentRequired'

export type ManualPaymentMethod =
  | 'Cash'
  | 'Eftpos'
  | 'BankTransfer'
  | 'Online'
  | 'Other'

export interface PaymentTransaction {
  id: string
  orderId: string
  amount: number
  method: ManualPaymentMethod
  reference?: string | null
  note?: string | null
  creationTime: string
}

export interface RecordPaymentInput {
  amount: number
  method: ManualPaymentMethod
  reference?: string | null
  note?: string | null
}

export interface OrderPriceAdjustment {
  id: string
  orderId: string
  oldTotalAmount: number
  newTotalAmount: number
  adjustmentAmount: number
  reason: string
  adjustedByUser?: string | null
  creationTime: string
  creatorId?: string | null
}

export interface AdjustOrderPriceInput {
  newTotalAmount: number
  reason: string
}

export type OrderEventType =
  | 'StatusChanged'
  | 'ApprovedForPrinting'
  | 'AdminNoteAdded'
  | 'CustomerNotificationRecorded'
  | 'PaymentReceived'
  | 'PriceAdjusted'

export interface OrderTimelineEntry {
  id: string
  eventType: OrderEventType
  status: OrderStatus | null
  description: string
  creationTime: string
}

export interface ShippingAddress {
  fullName: string
  addressLine1: string
  addressLine2?: string
  city: string
  state?: string
  postalCode: string
  country: string
  phone?: string
}

export interface OrderItemPrint {
  id: string
  printAreaId: string
  printAreaName: string
  printAreaCode?: string
  printAreaPrice?: number
  printSizeId: string
  printSizeName: string
  printSizeCode?: string
  printSizePrice?: number
  sortOrder?: number
  notes?: string | null
  uploadedAssetId?: string | null
  uploadedAssetUrl?: string | null
  designNote?: string | null
  // Print-only tier snapshot (Jira 9203); exposed by the backend DTO. 0 / null for pre-9203 rows.
  resolvedUnitPrintPrice?: number
  appliedPrintTierMinQuantity?: number | null
}

// Grouped print read model (Jira 9403/9404). Additive; computed by the backend from order items.
// Display-only: never use these rows to compute order totals (one item with multiple prints appears
// in multiple groups, so summing row line totals across groups double-counts).
export interface OrderPrintGroupRow {
  orderItemId: string
  orderItemPrintId: string
  productName: string
  variantLabel: string
  color?: string | null
  garmentSize?: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
  uploadedAssetId?: string | null
  uploadedAssetUrl?: string | null
  designNote?: string | null
  printNotes?: string | null
  resolvedUnitPrintPrice: number
  appliedPrintTierMinQuantity?: number | null
  isLegacyPricingSnapshot: boolean
}

export interface OrderPrintGroup {
  groupKey: string
  designName: string
  designKey: string
  printAreaId: string
  printAreaName: string
  printAreaCode?: string | null
  printSizeId: string
  printSizeName: string
  printSizeCode?: string | null
  totalQuantity: number
  rows: OrderPrintGroupRow[]
}

export interface OrderItem {
  id: string
  productId: string
  /** Garment variant id; null for non-garment items such as Badge (Jira 9503). */
  productVariantId: string | null
  productName: string
  /** "Color / Size" snapshot for garments; null for non-garment items (Jira 9503). */
  variantLabel: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
  // ── Model snapshot (Jira 9503) ───────────────────────────────────────────
  pricingModel?: PricingModel
  productKind?: ProductKind
  // ── Item-level design (Jira 9503; used by Badge, null for garments) ───────
  uploadedAssetId?: string | null
  uploadedAssetUrl?: string | null
  designNote?: string | null
  /** Applied Badge quantity-tier MinQuantity snapshot (Jira 9503); null when not applicable. */
  appliedQuantityTierMinQuantity?: number | null
  /** Legacy reserved JSON config (superseded by {@link bannerDetail}); null for Banner. */
  configurationJson?: string | null
  /** Banner configuration snapshot (Jira 9511/9514). Non-null only for Banner items. */
  bannerDetail?: BannerDetail | null
  prints?: OrderItemPrint[]
}

// Admin order-content edit (Jira 9405/9406). These mirror the backend Update*ContentDto shapes:
// IDs + quantities + design/note fields only. NEVER carry price fields — the backend is the sole
// pricing authority and ignores any client-supplied price.

export interface UpdateOrderItemPrintContent {
  /** Existing OrderItemPrint id when editing/replacing; omitted/undefined when adding. */
  id?: string
  printAreaId: string
  printSizeId: string
  uploadedAssetId?: string | null
  uploadedAssetUrl?: string | null
  designNote?: string | null
  printNotes?: string | null
}

export interface UpdateOrderItemContent {
  /** Existing OrderItem id when editing/replacing; omitted/undefined when adding. */
  id?: string
  productId: string
  /** Garment variant: required for garments (server-enforced), omitted for Badge (Jira 9503). */
  productVariantId?: string | null
  quantity: number
  // ── Item-level design (Jira 9503) — used by non-garment items (Badge). NEVER price fields. ──
  uploadedAssetId?: string | null
  uploadedAssetUrl?: string | null
  designNote?: string | null
  /** Reserved non-garment configuration (Banner). Ignored for Garment/Badge MVP. */
  configurationJson?: string | null
  prints: UpdateOrderItemPrintContent[]
}

/** Full desired item set (replace semantics): omitted items are removed on save. */
export interface UpdateOrderContent {
  items: UpdateOrderItemContent[]
}

/**
 * Preview of how a content change affects the order's payment snapshot (no persistence).
 * PaidAmount and payment transactions are never altered by repricing.
 */
export interface PaymentImpact {
  paidAmount: number
  oldBalanceAmount: number
  newBalanceAmount: number
  oldRequiredPaymentAmount: number
  newRequiredPaymentAmount: number
  oldRequiredDepositAmount?: number | null
  newRequiredDepositAmount?: number | null
  currentPaymentStatus: string
  previewPaymentStatus: string
  /** True when the new total differs from the current total. */
  totalChanged: boolean
  /** True when saving would cancel one or more Pending online payment sessions. */
  wouldCancelPendingPaymentSessions: boolean
  /** True when the change cannot be saved as-is (see {@link blockingReasons}). */
  isBlocked: boolean
  /** Machine-friendly blocking reason codes (e.g. "NewTotalBelowPaidAmount", "OrderCancelled"). */
  blockingReasons: string[]
}

/**
 * Result of a non-persisting admin order-content preview (Jira 9405). The `previewOrder` carries the
 * repriced totals + regrouped PrintGroups, but item/print ids on brand-new rows are EPHEMERAL preview
 * ids and must never be treated as stable saved ids.
 */
export interface OrderContentQuoteResult {
  oldTotalAmount: number
  newTotalAmount: number
  previewOrder: Order
  payment: PaymentImpact
  /** Human-readable, non-blocking notes (e.g. pending sessions will be cancelled). */
  warnings: string[]
}

export interface Order {
  id: string
  orderNumber: string
  status: OrderStatus
  displayStatus: string
  isApprovedForPrinting: boolean
  deliveryMethod: DeliveryMethod | null
  customerName: string
  customerEmail: string
  totalAmount: number
  shippingAddress: ShippingAddress
  items: OrderItem[]
  // Additive grouped print read model (Jira 9403). Optional so an older backend that omits it
  // never breaks the page. Display-only; order totals stay based on `items` / `totalAmount`.
  printGroups?: OrderPrintGroup[]
  notes: string | null
  adminNotes: string | null
  creationTime: string
  timeline: OrderTimelineEntry[]
  // Payment fields
  paymentStatus: PaymentStatus
  paymentRequirementType: PaymentRequirementType
  requiredDepositAmount: number | null
  requiredPaymentAmount: number
  paidAmount: number
  balanceAmount: number
  depositPaidAt: string | null
  fullyPaidAt: string | null
  lastPaymentMethod: ManualPaymentMethod | null
  lastPaymentReference: string | null
  lastPaymentNote: string | null
  paymentTransactions: PaymentTransaction[]
  // Price adjustment fields
  priceAdjustments: OrderPriceAdjustment[]
  hasPriceAdjustment: boolean
  lastPriceAdjustedAt?: string | null
  lastPriceAdjustmentReason?: string | null
  lastPriceAdjustmentAmount?: number | null
}

// Cart (client-side)

export interface CartItemPrint {
  printAreaId: string
  printAreaName: string
  printSizeId: string
  printSizeName: string
  uploadedAssetId?: string
  uploadedAssetUrl?: string
  designNote?: string
}

export interface CartItem {
  cartItemKey: string
  productId: string
  /** Garment variant id; omitted for non-garment items such as Badge (Jira 9503/9504). */
  productVariantId?: string
  productName: string
  /** "Color / Size" for garments; omitted for Badge (no variant) (Jira 9504). */
  variantLabel?: string
  color?: string
  size?: string
  unitPrice: number
  quantity: number
  /**
   * Print-pricing group of the product (Jira 9207). `string` = grouped, `null` = ungrouped,
   * `undefined` = legacy cart item from before this field existed (backfilled by useCartPricing).
   * Drives group-aware print-tier quantity aggregation in the cart/checkout quote.
   */
  printPricingGroupId?: string | null
  // ── Product model + Badge support (Jira 9504) ─────────────────────────────
  /** Business category — lets the cart/checkout branch display + payload by kind. */
  kind?: ProductKind
  /** Pricing behavior — drives the quote path (Badge sends no variant/prints). */
  pricingModel?: PricingModel
  /** Minimum sellable quantity (Badge); UX validation only, backend authoritative. */
  minimumQuantity?: number
  // ── Item-level design (Jira 9504; used by Badge, garment design lives in prints) ──
  uploadedAssetId?: string
  uploadedAssetUrl?: string
  designNote?: string
  /** Reserved non-garment configuration (legacy; superseded by {@link bannerDetail}). */
  configurationJson?: string
  /**
   * Banner configuration (Jira 9517). Non-null only for FixedSize Banner lines: carries
   * `sizeMode='Preset'` + the selected `sizePresetId` plus the non-priced material/finishing/stand/notes.
   * Sent to the backend quote and create-order (never any price). Undefined for Garment/Badge lines.
   */
  bannerDetail?: BannerDetailInput
  prints?: CartItemPrint[]
}

// Dashboard

export interface DashboardRecentOrder {
  id: string
  orderNumber: string
  customerName: string
  totalAmount: number
  status: OrderStatus
  creationTime: string
  itemCount: number
}

export interface DashboardDailyCount {
  date: string
  count: number
}

export interface DashboardStats {
  totalOrders: number
  ordersToday: number
  ordersThisMonth: number
  ordersByStatus: Record<string, number>
  totalRevenue: number
  revenueToday: number
  revenueThisMonth: number
  totalProducts: number
  activeProducts: number
  lowStockVariants: number
  recentOrders: DashboardRecentOrder[]
  dailyOrderCounts: DashboardDailyCount[]
}

// Admin Assets

export interface AdminAsset {
  id: string
  originalFileName: string
  fileUrl: string
  contentType: string
  fileSizeBytes: number
  creationTime: string
  linkedOrderId: string | null
  linkedOrderNumber: string | null
  linkedCustomerName: string | null
  linkedOrderItemId: string | null
  linkedProductName: string | null
  printAreaName: string | null
  designNote: string | null
}

// Online Payments

export type PaymentProvider = 'Stripe' | 'Windcave' | 'Poli' | 'PayPal'

export type PaymentPurpose = 'FullPayment' | 'Deposit' | 'Balance'

export type OnlinePaymentSessionStatus =
  | 'Pending'
  | 'Completed'
  | 'Cancelled'
  | 'Expired'
  | 'Failed'

export interface CreateOnlinePaymentSessionInput {
  provider?: PaymentProvider
  purpose?: PaymentPurpose
  /**
   * Fingerprint of the payment quote the customer was actually shown. NOT an amount and NOT an
   * authorisation token — the backend recalculates every monetary value and uses this only to reject a
   * payment based on a stale disclosure. Required once the Stripe surcharge is enabled; omitted otherwise.
   *
   * Only ever send the fingerprint of the CURRENTLY displayed, successfully loaded quote.
   */
  paymentQuoteFingerprint?: string | null
}

/**
 * Server-authoritative online payment quote. Every amount here is calculated by the backend from trusted
 * commercial pricing and the persisted surcharge configuration — the browser must never recompute, adjust
 * or submit any of these values. The response carries no secret and no provider (Test/Live) mode.
 */
export interface OnlinePaymentQuote {
  provider: PaymentProvider
  currency: string
  /** Purpose the server derived from the order/draft state; drives the breakdown's first-row label. */
  purpose: PaymentPurpose
  /** Commercial amount due — the only amount ever applied to the order. */
  baseAmount: number
  surchargeEnabled: boolean
  /** Card-processing surcharge. Zero when the surcharge is disabled. */
  surchargeAmount: number
  /** Total the card will be charged. Authoritative — never display baseAmount + surchargeAmount instead. */
  chargedAmount: number
  /** Exact disclosure to display verbatim. Null when the surcharge is disabled. */
  surchargeDisclosureText?: string | null
  surchargePercentageBasisPoints: number
  surchargeFixedAmount: number
  calculationVersion?: string | null
  /** Echo back on session creation. Empty/null for providers that issue no quote contract. */
  quoteFingerprint?: string | null
}

/** Quote request for an existing order. Carries no monetary value. */
export interface CreateOnlinePaymentQuoteInput {
  provider?: PaymentProvider
  purpose?: PaymentPurpose
}

export interface OnlinePaymentSession {
  id: string
  orderId: string
  orderNumber: string
  provider: PaymentProvider
  providerSessionId: string
  providerCheckoutUrl: string
  amount: number
  currency: string
  purpose: PaymentPurpose
  status: OnlinePaymentSessionStatus
  creationTime: string
}

// Email Settings

export interface EmailSettings {
  adminNotificationEmail: string | null
  replyToAddress: string | null
  senderName: string | null
  shopContactInfo: string | null
  readyPickupMessage: string | null
  readyShippingMessage: string | null
  completedMessage: string | null
  adminOrderBaseUrl: string | null
}

// Inventory Settings

export interface InventorySettings {
  autoDeductOnPressedEnabled: boolean
  lastModificationTime: string | null
}

// Admin Users

export interface AdminUser {
  id: string
  username: string
  displayName: string | null
  role: string
  isActive: boolean
  lastLoginAt: string | null
  creationTime: string
}

export interface CreateAdminUserInput {
  username: string
  password: string
  role: string
  displayName: string | null
}

export interface UpdateAdminUserInput {
  displayName: string | null
  role: string
  isActive: boolean
  newPassword: string | null
}

// API Pagination

export interface PagedResult<T> {
  items: T[]
  totalCount: number
}

// ── Payment provider settings (Jira 9902) ──────────────────────────────────
// Persisted, admin-managed Stripe Test-mode configuration. Secrets are never
// returned by the API — only configured/last-4 masked state.
export type PaymentProviderMode = 'Test' | 'Live'
export type PaymentProviderValidationStatus = 'NotValidated' | 'Valid' | 'Invalid'

export interface PaymentProviderSetting {
  provider: string
  mode: PaymentProviderMode
  isEnabled: boolean
  currency: string
  publishableKey: string | null
  secretKeyConfigured: boolean
  secretKeyLast4: string | null
  webhookSecretConfigured: boolean
  webhookSecretLast4: string | null
  successReturnBaseUrl: string | null
  cancelReturnBaseUrl: string | null
  lastValidatedAt: string | null
  lastValidationStatus: PaymentProviderValidationStatus
  lastValidationMessageCode: string | null
  // Readiness signals (Jira 9903) — all safe/non-secret.
  isConfigured: boolean
  canCreateCheckoutSession: boolean
  liveModeBlocked: boolean
  encryptionPassphraseConfigured: boolean
  webhookEndpointPath: string
  webhookEndpointUrl: string | null
  secretsRuntimeSource: string
  configRuntimeSource: string
  missingPrerequisites: string[]
  readinessCode: string
  surchargeEnabled: boolean
  surchargePercentageBasisPoints: number
  surchargeFixedAmount: number
  surchargeDisclosureText: string
  surchargeCalculationVersion: string
}

export type PaymentWebhookEventStatus =
  | 'Received' | 'Processing' | 'Processed' | 'Duplicate' | 'Ignored'
  | 'Rejected' | 'RequiresManualReview' | 'Failed'
export type AdminPaymentReconciliationStatus =
  | 'Reconciled' | 'Pending' | 'RequiresReview' | 'Failed' | 'Cancelled' | 'Expired'

export interface AdminOnlinePaymentSession {
  id: string
  provider: PaymentProvider
  providerMode: PaymentProviderMode | null
  purpose: PaymentPurpose
  status: OnlinePaymentSessionStatus
  currency: string
  baseAmount: number
  surchargeAmount: number
  chargedAmount: number
  surchargePercentageBasisPoints: number
  surchargeFixedAmount: number
  surchargeCalculationVersion: string
  providerSessionId: string
  providerPaymentId: string | null
  providerEventId: string | null
  paymentTransactionId: string | null
  commercialTransactionAmount: number | null
  creationTime: string
  completedTime: string | null
  rawProviderStatus: string | null
  webhookStatus: PaymentWebhookEventStatus | null
  observedProviderAmount: number | null
  observedCurrency: string | null
  reviewReasonCode: string | null
  reconciliationStatus: AdminPaymentReconciliationStatus
  reconciliationMessage: string | null
}

export interface UpdateStripeTestSettings {
  isEnabled: boolean
  currency: string
  publishableKey?: string | null
  // Write-only secrets. Leave blank/undefined to keep the currently stored value.
  secretKey?: string | null
  webhookSecret?: string | null
  successReturnBaseUrl?: string | null
  cancelReturnBaseUrl?: string | null
  surchargeEnabled?: boolean
  surchargePercentageBasisPoints?: number
  surchargeFixedAmount?: number
  surchargeDisclosureText?: string
  surchargeCalculationVersion?: string
}

// ── Live mode (Jira 9908) ──────────────────────────────────────────────────
// Guarded Live-mode write. Rejected by the server unless the unlock flag is set
// AND confirmationPhrase is exactly "ENABLE LIVE MODE". Only live keys accepted.
export interface UpdateStripeLiveSettings {
  confirmationPhrase: string
  isEnabled: boolean
  currency: string
  publishableKey?: string | null
  // Write-only secrets. Leave blank/undefined to keep the currently stored value.
  secretKey?: string | null
  webhookSecret?: string | null
  successReturnBaseUrl?: string | null
  cancelReturnBaseUrl?: string | null
  surchargeEnabled?: boolean
  surchargePercentageBasisPoints?: number
  surchargeFixedAmount?: number
  surchargeDisclosureText?: string
  surchargeCalculationVersion?: string
}

// Combined masked overview of both modes plus server-side Live-mode gating state.
export interface PaymentSettingsOverview {
  test: PaymentProviderSetting
  live: PaymentProviderSetting
  liveModeConfigurationUnlocked: boolean
  activeMode: PaymentProviderMode
  activeModeIsLive: boolean
  activeModeSource: string
  liveConfirmationPhrase: string
}

export interface StripeTestSettingsValidationResult {
  status: PaymentProviderValidationStatus
  messageCode: string | null
  isEnabled: boolean
  secretKeyConfigured: boolean
  webhookSecretConfigured: boolean
  returnUrlsValid: boolean
  // Readiness signals (Jira 9903).
  canCreateCheckoutSession: boolean
  encryptionPassphraseConfigured: boolean
  liveModeBlocked: boolean
  missingPrerequisites: string[]
}
