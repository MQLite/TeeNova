// ─── Catalog ─────────────────────────────────────────────────────────────────

export interface ProductListItem {
  id: string
  name: string
  basePrice: number
  productType: string
  isActive: boolean
  thumbnailUrl: string | null
  primaryImageUrl: string | null
  variantCount: number
}

export interface ProductVariant {
  id: string
  sku: string
  color: string
  size: string
  priceAdjustment: number
  stockQuantity: number
  isAvailable: boolean
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

export interface Product {
  id: string
  name: string
  description: string | null
  basePrice: number
  productType: string
  isActive: boolean
  creationTime: string
  variants: ProductVariant[]
  images: ProductImage[]
}

// ─── Customization ────────────────────────────────────────────────────────────

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
  prints: PriceCalculationPrintItem[]
}

export interface PrintAddOnPrice {
  printAreaId: string
  printAreaName: string
  printAreaPrice: number
  printSizeId: string
  printSizeName: string
  printSizePrice: number
  linePrice: number
}

export interface PriceCalculationResponse {
  productBasePrice: number
  variantAdjustment: number
  printAddOns: PrintAddOnPrice[]
  unitPrice: number
  quantity: number
  lineTotal: number
  currency: string
}

// ─── Files ────────────────────────────────────────────────────────────────────

export interface UploadedAsset {
  assetId: string
  fileUrl: string
  originalFileName: string
  fileSizeBytes: number
}

// ─── Orders ───────────────────────────────────────────────────────────────────

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

export type OrderEventType =
  | 'StatusChanged'
  | 'ApprovedForPrinting'
  | 'AdminNoteAdded'
  | 'CustomerNotificationRecorded'
  | 'PaymentReceived'

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
}

// ─── Cart (client-side) ───────────────────────────────────────────────────────

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
  prints?: CartItemPrint[]
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

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

// ─── Admin Assets ─────────────────────────────────────────────────────────────

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

// ─── Online Payments ──────────────────────────────────────────────────────────

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

// ─── Email Settings ───────────────────────────────────────────────────────────

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

// ─── API Pagination ───────────────────────────────────────────────────────────

export interface PagedResult<T> {
  items: T[]
  totalCount: number
}
