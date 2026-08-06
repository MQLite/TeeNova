import type { QuoteFulfilmentPreference, QuoteServiceType } from '@/types'

export const SERVICE_OPTIONS: { value: QuoteServiceType; label: string; slug: string }[] = [
  { value: 'GarmentPrinting', label: 'Garment printing', slug: 'garment-printing' },
  { value: 'BringYourOwnGarment', label: 'Bring your own garment', slug: 'bring-your-own-garment' },
  { value: 'Badges', label: 'Badges', slug: 'badges' },
  { value: 'Banners', label: 'Banners', slug: 'banners' },
  { value: 'BusinessCards', label: 'Business cards', slug: 'business-cards' },
  { value: 'StickersLabels', label: 'Stickers and labels', slug: 'stickers-labels' },
  { value: 'Signage', label: 'Signage', slug: 'signage' },
  { value: 'Other', label: 'Other', slug: 'other' },
]

export const serviceFromSlug = (slug?: string): QuoteServiceType | undefined =>
  SERVICE_OPTIONS.find((item) => item.slug === slug)?.value

export const serviceNeedsDimensions = (service: QuoteServiceType) =>
  service === 'Banners' || service === 'Signage'

export const serviceUsesQuantity = (service: QuoteServiceType) => service !== 'Other'

export interface QuoteFormValues {
  serviceType: QuoteServiceType
  serviceTypeOther: string
  quantity: string
  width: string
  height: string
  dimensionUnit: string
  requiredDate: string
  fulfilmentPreference: QuoteFulfilmentPreference
  deliverySuburb: string
  customerName: string
  customerEmail: string
  customerPhone: string
  organisationName: string
  notes: string
}

export type QuoteFormErrors = Partial<Record<keyof QuoteFormValues | 'attachments', string>>

export function validateQuoteForm(values: QuoteFormValues, today = new Date()): QuoteFormErrors {
  const errors: QuoteFormErrors = {}
  if (values.serviceType === 'Other' && !values.serviceTypeOther.trim())
    errors.serviceTypeOther = 'Describe the service you need.'
  if (serviceUsesQuantity(values.serviceType)) {
    const quantity = Number(values.quantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000)
      errors.quantity = 'Enter a quantity between 1 and 1,000,000.'
  } else if (values.quantity && (!Number.isInteger(Number(values.quantity)) || Number(values.quantity) < 1)) {
    errors.quantity = 'Enter a whole number greater than zero.'
  }
  if (serviceNeedsDimensions(values.serviceType)) {
    if (!(Number(values.width) > 0)) errors.width = 'Enter a width greater than zero.'
    if (!(Number(values.height) > 0)) errors.height = 'Enter a height greater than zero.'
    if (!values.dimensionUnit) errors.dimensionUnit = 'Select a unit.'
  }
  if (values.requiredDate) {
    const date = new Date(`${values.requiredDate}T00:00:00`)
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (Number.isNaN(date.valueOf()) || date < start) errors.requiredDate = 'Choose today or a future date.'
  }
  if (values.fulfilmentPreference === 'Delivery' && !values.deliverySuburb.trim())
    errors.deliverySuburb = 'Enter the delivery suburb.'
  if (!values.customerName.trim()) errors.customerName = 'Enter your name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.customerEmail.trim()))
    errors.customerEmail = 'Enter a valid email address.'
  if (values.customerPhone.length > 40) errors.customerPhone = 'Phone must be 40 characters or fewer.'
  if (values.organisationName.length > 160) errors.organisationName = 'Organisation must be 160 characters or fewer.'
  if (values.notes.length > 2000) errors.notes = 'Notes must be 2,000 characters or fewer.'
  return errors
}
