// Catalog

export interface ProductListItem {
  id: string
  name: string
  basePrice: number
  productType: string
  isActive: boolean
  thumbnailUrl: string | null
  primaryImageUrl: string | null
  variantCount: number
  /** Printed "from" price (Jira 9203): fixed garment price + cheapest active print tier, or null. */
  fromPrice: number | null
  /** True when the product's group has active print price tiers (Jira 9203). */
  hasPriceTiers: boolean
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

export interface Product {
  id: string
  name: string
  description: string | null
  basePrice: number
  productType: string
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
  variantId: string
  quantity: number
  /**
   * Total quantity of this product across all selected variant lines on the page (Jira 9104).
   * Drives quantity-break tier resolution. When omitted the backend falls back to `quantity`.
   */
  tierQuantity?: number
  prints: PriceCalculationPrintItem[]
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
}

export interface OrderItem {
  id: string
  productId: string
  productVariantId: string
  productName: string
  variantLabel: string
  quantity: number
  unitPrice: number
  lineTotal: number
  prints?: OrderItemPrint[]
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
  productVariantId: string
  productName: string
  variantLabel: string
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
