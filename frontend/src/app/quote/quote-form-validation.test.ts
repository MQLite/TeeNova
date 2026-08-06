import { describe, expect, it } from 'vitest'
import {
  SERVICE_OPTIONS, serviceFromSlug, serviceNeedsDimensions, serviceUsesQuantity,
  type QuoteFormValues, validateQuoteForm,
} from './quote-form-validation'

const valid = (overrides: Partial<QuoteFormValues> = {}): QuoteFormValues => ({
  serviceType: 'GarmentPrinting', serviceTypeOther: '', quantity: '10', width: '', height: '',
  dimensionUnit: 'Millimetres', requiredDate: '', fulfilmentPreference: 'NotSure', deliverySuburb: '',
  customerName: 'Customer', customerEmail: 'customer@example.com', customerPhone: '',
  organisationName: '', notes: '', ...overrides,
})

describe('quote form validation', () => {
  it('keeps the stable eight-service map', () => {
    expect(SERVICE_OPTIONS.map((item) => item.value)).toEqual([
      'GarmentPrinting', 'BringYourOwnGarment', 'Badges', 'Banners',
      'BusinessCards', 'StickersLabels', 'Signage', 'Other',
    ])
  })
  it.each([
    ['garment-printing', 'GarmentPrinting'], ['bring-your-own-garment', 'BringYourOwnGarment'],
    ['badges', 'Badges'], ['banners', 'Banners'], ['business-cards', 'BusinessCards'],
    ['stickers-labels', 'StickersLabels'], ['signage', 'Signage'], ['other', 'Other'],
  ] as const)('maps safe service slug %s', (slug, expected) => expect(serviceFromSlug(slug)).toBe(expected))
  it('rejects arbitrary service slugs', () => expect(serviceFromSlug('https://evil.example')).toBeUndefined())
  it.each(['Banners', 'Signage'] as const)('requires dimensions for %s', (serviceType) => {
    expect(serviceNeedsDimensions(serviceType)).toBe(true)
    expect(validateQuoteForm(valid({ serviceType }))).toMatchObject({ width: expect.any(String), height: expect.any(String) })
  })
  it.each(['GarmentPrinting', 'BringYourOwnGarment', 'Badges', 'BusinessCards', 'StickersLabels'] as const)('uses quantity for %s', (service) => expect(serviceUsesQuantity(service)).toBe(true))
  it('lets Other omit quantity but requires a description', () => {
    expect(validateQuoteForm(valid({ serviceType: 'Other', quantity: '' }))).toHaveProperty('serviceTypeOther')
    expect(validateQuoteForm(valid({ serviceType: 'Other', quantity: '', serviceTypeOther: 'Foil work' }))).toEqual({})
  })
  it.each(['0', '-1', '1.5', '1000001', 'abc'])('rejects unsafe quantity %s', (quantity) => expect(validateQuoteForm(valid({ quantity }))).toHaveProperty('quantity'))
  it('requires a delivery suburb only for delivery', () => {
    expect(validateQuoteForm(valid({ fulfilmentPreference: 'Delivery' }))).toHaveProperty('deliverySuburb')
    expect(validateQuoteForm(valid({ fulfilmentPreference: 'Pickup' }))).not.toHaveProperty('deliverySuburb')
  })
  it.each(['', 'missing-at.example.com', '@example.com'])('rejects invalid email %s', (customerEmail) => expect(validateQuoteForm(valid({ customerEmail }))).toHaveProperty('customerEmail'))
  it('rejects a past date and accepts today', () => {
    const today = new Date(2026, 7, 5, 12)
    expect(validateQuoteForm(valid({ requiredDate: '2026-08-04' }), today)).toHaveProperty('requiredDate')
    expect(validateQuoteForm(valid({ requiredDate: '2026-08-05' }), today)).not.toHaveProperty('requiredDate')
  })
  it('bounds phone, organisation and notes', () => {
    expect(validateQuoteForm(valid({ customerPhone: 'x'.repeat(41), organisationName: 'x'.repeat(161), notes: 'x'.repeat(2001) }))).toMatchObject({
      customerPhone: expect.any(String), organisationName: expect.any(String), notes: expect.any(String),
    })
  })
})
