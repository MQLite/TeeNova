// The business has two confirmed mailboxes — otahuhuprint@gmail.com and qualitycanvasltd@gmail.com.
// Which mailbox plays which role (public contact, quote notifications, reply-to, privacy contact) is
// NOT decided, so no role is hard-coded: every role reads from configuration. This fallback is only
// the general contact address carried over from Jira 10301/10302 and is deliberately left unchanged
// until the owner assigns roles.
const FALLBACK_CONTACT_EMAIL = 'qualitycanvasltd@gmail.com'

export const quoteFormEnabled = process.env.NEXT_PUBLIC_QUOTE_FORM_ENABLED === 'true'
export const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || FALLBACK_CONTACT_EMAIL
/**
 * Privacy-enquiry mailbox (Jira 10303). Falls back to the general contact address rather than
 * assigning either confirmed mailbox the privacy role without an owner decision.
 */
export const privacyContactEmail =
  process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() || contactEmail
export const privacyContactHref = `mailto:${privacyContactEmail}`
export const businessPhone = process.env.NEXT_PUBLIC_BUSINESS_PHONE?.trim() || null
export const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim() || null

export const emailHref = `mailto:${contactEmail}`
export const phoneHref = businessPhone ? `tel:${businessPhone.replace(/[^+\d]/g, '')}` : null
export const whatsappHref = whatsappNumber
  ? `https://wa.me/${whatsappNumber.replace(/\D/g, '')}`
  : null

export function quoteHref(context?: { service?: string; product?: string; source?: string }): string {
  if (!quoteFormEnabled) return emailHref
  const params = new URLSearchParams()
  if (context?.service) params.set('service', context.service)
  if (context?.product) params.set('product', context.product)
  if (context?.source) params.set('source', context.source)
  const query = params.toString()
  return query ? `/quote?${query}` : '/quote'
}
