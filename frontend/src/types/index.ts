// ─── Catalog ─────────────────────────────────────────────────────────────────

export interface ProductListItem {
  id: string
  name: string
  basePrice: number
  productType: string
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
}

export interface Product {
  id: string
  name: string
  description: string | null
  basePrice: number
  productType: string
  isActive: boolean
  variants: ProductVariant[]
  images: ProductImage[]
}

// ─── Customization ────────────────────────────────────────────────────────────

export interface PrintPositionOption {
  value: number
  name: string
  displayLabel: string
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
  | 'Confirmed'
  | 'InProduction'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled'

export interface ShippingAddress {
  fullName: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  postalCode: string
  country: string
  phone?: string
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
  uploadedAssetId: string | null
  uploadedAssetUrl: string | null
  printPosition: PrintPosition | null
  designNote: string | null
}

export interface Order {
  id: string
  orderNumber: string
  status: OrderStatus
  customerName: string
  customerEmail: string
  totalAmount: number
  shippingAddress: ShippingAddress
  items: OrderItem[]
  creationTime: string
}

// ─── Cart (client-side) ───────────────────────────────────────────────────────

export interface PrintPositionUpload {
  position: PrintPosition
  uploadedAssetId?: string
  uploadedAssetUrl?: string
  designNote?: string
}

export interface CartItem {
  productId: string
  productVariantId: string
  productName: string
  variantLabel: string
  unitPrice: number
  quantity: number
  printPositions?: PrintPositionUpload[]
  // legacy single-position fields kept for checkout API compatibility
  uploadedAssetId?: string
  uploadedAssetUrl?: string
  printPosition?: PrintPosition
}

// ─── API Pagination ───────────────────────────────────────────────────────────

export interface PagedResult<T> {
  items: T[]
  totalCount: number
}
