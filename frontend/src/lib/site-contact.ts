// The business has two confirmed mailboxes — otahuhuprint@gmail.com and qualitycanvasltd@gmail.com.
// Which mailbox plays which role (public contact, quote notifications, reply-to, privacy contact) is
// NOT decided, so no role is hard-coded: every role reads from configuration. This fallback is only
// the general contact address carried over from Jira 10301/10302 and is deliberately left unchanged
// until the owner assigns roles.
const FALLBACK_CONTACT_EMAIL = 'qualitycanvasltd@gmail.com'
const FALLBACK_BUSINESS_PHONE = '(09) 270 3378'
const FALLBACK_BUSINESS_MOBILE = '027 276 7379'

export const quoteFormEnabled = process.env.NEXT_PUBLIC_QUOTE_FORM_ENABLED === 'true'
export const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || FALLBACK_CONTACT_EMAIL
/**
 * Privacy-enquiry mailbox (Jira 10303). Falls back to the general contact address rather than
 * assigning either confirmed mailbox the privacy role without an owner decision.
 */
export const privacyContactEmail =
  process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() || contactEmail
export const privacyContactHref = `mailto:${privacyContactEmail}`
// Owner-provided public numbers. Deployments can still override either value without changing UI.
export const businessPhone =
  process.env.NEXT_PUBLIC_BUSINESS_PHONE?.trim() || FALLBACK_BUSINESS_PHONE
export const businessMobile =
  process.env.NEXT_PUBLIC_BUSINESS_MOBILE?.trim() || FALLBACK_BUSINESS_MOBILE
export const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim() || null

export const emailHref = `mailto:${contactEmail}`
export const phoneHref = `tel:${businessPhone.replace(/[^+\d]/g, '')}`
export const mobileHref = `tel:${businessMobile.replace(/[^+\d]/g, '')}`
export const whatsappHref = whatsappNumber
  ? `https://wa.me/${whatsappNumber.replace(/\D/g, '')}`
  : null

/**
 * Messenger contact links are deliberately configuration-only until the business supplies its
 * actual Meta handle. Only specific HTTPS m.me or messenger.com paths are accepted, so the contact
 * card can never turn a placeholder or platform homepage into a broken public action.
 */
export function verifiedMessengerHref(value: string | undefined | null): string | null {
  const raw = value?.trim()
  if (!raw || raw === '#') return null

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '')
  const path = url.pathname.replace(/\/+$/, '')
  if (url.protocol !== 'https:' || url.username || url.password) return null
  if (!['m.me', 'messenger.com'].includes(hostname)) return null
  if (!path || path === '/') return null

  return url.toString()
}

export const messengerHref = verifiedMessengerHref(process.env.NEXT_PUBLIC_MESSENGER_URL)

export function quoteHref(context?: { service?: string; product?: string; source?: string }): string {
  if (!quoteFormEnabled) return emailHref
  const params = new URLSearchParams()
  if (context?.service) params.set('service', context.service)
  if (context?.product) params.set('product', context.product)
  if (context?.source) params.set('source', context.source)
  const query = params.toString()
  return query ? `/quote?${query}` : '/quote'
}
