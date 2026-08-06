import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('site contact configuration', () => {
  it('defaults the quote feature off and preserves the existing email fallback', async () => {
    vi.stubEnv('NEXT_PUBLIC_QUOTE_FORM_ENABLED', '')
    vi.stubEnv('NEXT_PUBLIC_CONTACT_EMAIL', '')
    const contact = await import('./site-contact')
    expect(contact.quoteFormEnabled).toBe(false)
    expect(contact.quoteHref()).toBe('mailto:qualitycanvasltd@gmail.com')
  })
  it('builds a safe internal quote URL only when enabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_QUOTE_FORM_ENABLED', 'true')
    const contact = await import('./site-contact')
    expect(contact.quoteHref({ service: 'banners', product: 'p1', source: '/products/p1' }))
      .toBe('/quote?service=banners&product=p1&source=%2Fproducts%2Fp1')
  })
  it('renders no phone or WhatsApp configuration when values are absent', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_PHONE', '')
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_NUMBER', '')
    const contact = await import('./site-contact')
    expect(contact.phoneHref).toBeNull()
    expect(contact.whatsappHref).toBeNull()
  })
  it('normalizes configured phone and WhatsApp URLs without inventing display text', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_PHONE', '+64 9 123 4567')
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_NUMBER', '+64 21 555 0101')
    const contact = await import('./site-contact')
    expect(contact.businessPhone).toBe('+64 9 123 4567')
    expect(contact.phoneHref).toBe('tel:+6491234567')
    expect(contact.whatsappHref).toBe('https://wa.me/64215550101')
  })
  it('uses a configured contact email consistently', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONTACT_EMAIL', 'quotes@example.test')
    const contact = await import('./site-contact')
    expect(contact.contactEmail).toBe('quotes@example.test')
    expect(contact.emailHref).toBe('mailto:quotes@example.test')
  })
})
