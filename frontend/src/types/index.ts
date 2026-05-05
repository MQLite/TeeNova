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

export interface PrintPositionOption {
  value: number
  name: string
  displayLabel: string
}

export interface PrintArea {
  id: string
  name: string
  code: string
  basePrice: number
  isActive: boolean
  sortOrder: number
  legacyPositionValue?: number | null
}

export interface PrintSize {
  id: string
  name: string
  code: string
  basePrice: number
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

export type PrintPosition =
  | 'FrontCenter'
  | 'BackCenter'
  | 'LeftChest'
  | 'RightChest'
  | 'LeftSleeve'
  | 'RightSleeve'
  | 'NeckLabel'

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

export type OrderEventType =
  | 'StatusChanged'
  | 'ApprovedForPrinting'
  | 'AdminNoteAdded'
  | 'CustomerNotificationRecorded'

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

export interface OrderItemPositionEntry {
  position: PrintPosition
  assetUrl?: string
  assetId?: string
  designNote?: string
}

export interface OrderItemPositionAsset {
  id: string
  position: PrintPosition
  uploadedAssetId: string | null
  uploadedAssetUrl: string | null
  designNote: string | null
  originalFileName: string | null
  fileName: string | null
  fileSizeBytes: number | null
}

export interface OrderItemPrint {
  id?: string
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
  positionAssets: OrderItemPositionAsset[]
  prints?: OrderItemPrint[]
}

export interface Order {
  id: string
  orderNumber: string
  status: OrderStatus
  displayStatus: string
  isApprovedForPrinting: boolean
  isDesignReviewed: boolean
  isPrintPositionConfirmed: boolean
  isFileDownloaded: boolean
  isGarmentConfirmed: boolean
  isReadyToPrint: boolean
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
}

// ─── Cart (client-side) ───────────────────────────────────────────────────────

export interface PrintPositionUpload {
  position: PrintPosition
  uploadedAssetId?: string
  uploadedAssetUrl?: string
  designNote?: string
}

export interface CartItemPrint {
  printAreaId: string
  printAreaName: string
  printSizeId: string
  printSizeName: string
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
  printPositions?: PrintPositionUpload[]
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
  printPosition: string | null
  designNote: string | null
}

// ─── API Pagination ───────────────────────────────────────────────────────────

export interface PagedResult<T> {
  items: T[]
  totalCount: number
}
