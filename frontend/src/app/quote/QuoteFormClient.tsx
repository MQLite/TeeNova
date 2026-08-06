'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { quoteRequestsApi } from '@/api/quote-requests'
import { businessPhone, contactEmail, emailHref, phoneHref, whatsappHref } from '@/lib/site-contact'
import type { QuoteAttachmentToken, QuoteRequestResult, QuoteServiceType } from '@/types'
import {
  SERVICE_OPTIONS, serviceNeedsDimensions, serviceUsesQuantity,
  type QuoteFormErrors, type QuoteFormValues, validateQuoteForm,
} from './quote-form-validation'

const MAX_FILES = 5
const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_BYTES = 60 * 1024 * 1024
const ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf,.ai'

type UploadItem = {
  id: string
  file: File
  state: 'uploading' | 'ready' | 'failed'
  token?: QuoteAttachmentToken
  error?: string
}

const initialValues = (service: QuoteServiceType): QuoteFormValues => ({
  serviceType: service, serviceTypeOther: '', quantity: '', width: '', height: '',
  dimensionUnit: 'Millimetres', requiredDate: '', fulfilmentPreference: 'NotSure',
  deliverySuburb: '', customerName: '', customerEmail: '', customerPhone: '',
  organisationName: '', notes: '',
})

function submissionKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

export function QuoteFormClient({
  initialService, productId, sourcePath,
}: { initialService: QuoteServiceType; productId?: string; sourcePath: string }) {
  const [values, setValues] = useState(() => initialValues(initialService))
  const [errors, setErrors] = useState<QuoteFormErrors>({})
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [website, setWebsite] = useState('')
  const [result, setResult] = useState<QuoteRequestResult | null>(null)
  const startedAt = useRef(new Date().toISOString())
  const key = useRef(submissionKey())
  const errorSummaryRef = useRef<HTMLDivElement>(null)
  const confirmationRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => { if (result) confirmationRef.current?.focus() }, [result])

  const update = (name: keyof QuoteFormValues, value: string) => {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const incoming = Array.from(files)
    const totalBytes = uploads.reduce((sum, item) => sum + item.file.size, 0) + incoming.reduce((sum, file) => sum + file.size, 0)
    if (uploads.length + incoming.length > MAX_FILES) {
      setErrors((current) => ({ ...current, attachments: `Choose no more than ${MAX_FILES} files.` }))
      return
    }
    if (incoming.some((file) => file.size > MAX_FILE_BYTES) || totalBytes > MAX_TOTAL_BYTES) {
      setErrors((current) => ({ ...current, attachments: 'Each file must be 20 MB or smaller and the total must be 60 MB or smaller.' }))
      return
    }
    setErrors((current) => ({ ...current, attachments: undefined }))
    const items = incoming.map((file) => ({ id: submissionKey(), file, state: 'uploading' as const }))
    setUploads((current) => [...current, ...items])
    for (const item of items) {
      try {
        const token = await quoteRequestsApi.upload(item.file)
        setUploads((current) => current.map((entry) => entry.id === item.id ? { ...entry, state: 'ready', token } : entry))
      } catch {
        setUploads((current) => current.map((entry) => entry.id === item.id
          ? { ...entry, state: 'failed', error: 'Upload failed. Remove this file and try it again.' } : entry))
      }
    }
  }

  const retryUpload = async (item: UploadItem) => {
    setErrors((current) => ({ ...current, attachments: undefined }))
    setUploads((current) => current.map((entry) => entry.id === item.id
      ? { ...entry, state: 'uploading', error: undefined } : entry))
    try {
      const token = await quoteRequestsApi.upload(item.file)
      setUploads((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, state: 'ready', token } : entry))
    } catch {
      setUploads((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, state: 'failed', error: 'Upload failed. Retry or remove this file.' } : entry))
    }
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const nextErrors = validateQuoteForm(values)
    if (uploads.some((item) => item.state === 'failed')) nextErrors.attachments = 'Remove or retry failed uploads.'
    setErrors(nextErrors)
    setSubmitError(null)
    if (Object.keys(nextErrors).length > 0) {
      requestAnimationFrame(() => errorSummaryRef.current?.focus())
      return
    }
    if (uploads.some((item) => item.state === 'uploading')) return
    setSubmitting(true)
    try {
      const response = await quoteRequestsApi.create({
        serviceType: values.serviceType,
        serviceTypeOther: values.serviceTypeOther.trim() || undefined,
        productId,
        quantity: values.quantity ? Number(values.quantity) : undefined,
        width: values.width ? Number(values.width) : undefined,
        height: values.height ? Number(values.height) : undefined,
        dimensionUnit: serviceNeedsDimensions(values.serviceType) ? values.dimensionUnit as 'Millimetres' : undefined,
        requiredDate: values.requiredDate || undefined,
        fulfilmentPreference: values.fulfilmentPreference,
        deliverySuburb: values.deliverySuburb.trim() || undefined,
        customerName: values.customerName.trim(), customerEmail: values.customerEmail.trim(),
        customerPhone: values.customerPhone.trim() || undefined,
        organisationName: values.organisationName.trim() || undefined,
        notes: values.notes.trim() || undefined,
        submissionKey: key.current, sourcePath,
        attachmentTokens: uploads.flatMap((item) => item.token ? [item.token.attachmentToken] : []),
        website, formStartedAtUtc: startedAt.current,
      })
      setResult(response)
    } catch {
      setSubmitError('We could not submit the form just now. Your entered details are still here; please retry or contact us directly.')
    } finally { setSubmitting(false) }
  }

  if (result) {
    const service = SERVICE_OPTIONS.find((item) => item.value === values.serviceType)?.label ?? values.serviceType
    return (
      <section className="card p-6 sm:p-10" aria-labelledby="quote-confirmation-heading">
        <p className="eyebrow text-ink-muted">Request received</p>
        <h2 id="quote-confirmation-heading" ref={confirmationRef} tabIndex={-1} className="display-page mt-3 outline-none">
          Thanks — your reference is <span className="whitespace-nowrap">{result.reference}</span>
        </h2>
        <p className="mt-5 text-ink-secondary">We received your {service.toLowerCase()} request. No payment has been taken, and this is not yet an order.</p>
        <p className="mt-3 text-ink-secondary">Keep the reference above if you need to amend your request. We have not claimed that an acknowledgement email was delivered.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a className="btn-black" href={emailHref}>Email {contactEmail}</a>
          {phoneHref && businessPhone && <a className="btn-glass" href={phoneHref} aria-label={`Call ${businessPhone}`}>Call {businessPhone}</a>}
          {whatsappHref && <a className="btn-glass" href={whatsappHref} target="_blank" rel="noreferrer" aria-label="Contact us on WhatsApp">WhatsApp</a>}
        </div>
      </section>
    )
  }

  const errorEntries = Object.entries(errors).filter((entry): entry is [string, string] => Boolean(entry[1]))
  // One class for every control on the form. Presentation, focus ring, invalid state and the 44px
  // minimum height are the shared `.form-input` token (Jira 10307) rather than a local string.
  const inputClass = 'form-input mt-2'
  const errorFor = (name: keyof QuoteFormErrors) => errors[name]
  const describedBy = (name: keyof QuoteFormErrors) => errorFor(name) ? `${name}-error` : undefined

  return (
    <form onSubmit={onSubmit} noValidate className="card space-y-8 p-5 sm:p-8">
      {errorEntries.length > 0 && (
        <div ref={errorSummaryRef} tabIndex={-1} role="alert" aria-labelledby="quote-errors-heading" className="rounded-xl border border-danger-border bg-danger-surface p-4 outline-none">
          <h2 id="quote-errors-heading" className="font-semibold text-danger">Please check these details</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-danger">
            {errorEntries.map(([field, message]) => <li key={field}><a className="underline" href={`#${field}`}>{message}</a></li>)}
          </ul>
        </div>
      )}

      <fieldset>
        <legend className="form-legend">What do you need?</legend>
        <label htmlFor="serviceType" className="mt-5 form-label">Service type</label>
        <select id="serviceType" className={inputClass} value={values.serviceType}
          onChange={(event) => update('serviceType', event.target.value)}>
          {SERVICE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {values.serviceType === 'Other' && <Field label="Describe the service" name="serviceTypeOther" value={values.serviceTypeOther} onChange={update} error={errorFor('serviceTypeOther')} inputClass={inputClass} />}
        {productId && <p className="mt-4 rounded-xl bg-surface-sunken p-3 text-sm text-ink-secondary">Product context supplied. The server will verify the product before saving the request.</p>}
        {serviceUsesQuantity(values.serviceType) && <Field label="Quantity" name="quantity" value={values.quantity} onChange={update} error={errorFor('quantity')} inputClass={inputClass} type="number" min="1" max="1000000" required />}
        {values.serviceType === 'Other' && <Field label="Quantity (if known)" name="quantity" value={values.quantity} onChange={update} error={errorFor('quantity')} inputClass={inputClass} type="number" min="1" />}
        {serviceNeedsDimensions(values.serviceType) && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Width" name="width" value={values.width} onChange={update} error={errorFor('width')} inputClass={inputClass} type="number" min="0.0001" step="any" required />
            <Field label="Height" name="height" value={values.height} onChange={update} error={errorFor('height')} inputClass={inputClass} type="number" min="0.0001" step="any" required />
            <div><label htmlFor="dimensionUnit" className="form-label">Unit</label><select id="dimensionUnit" value={values.dimensionUnit} onChange={(event) => update('dimensionUnit', event.target.value)} className={inputClass} aria-invalid={Boolean(errorFor('dimensionUnit'))} aria-describedby={describedBy('dimensionUnit')}><option value="Millimetres">mm</option><option value="Centimetres">cm</option><option value="Metres">m</option></select><ErrorText name="dimensionUnit" error={errorFor('dimensionUnit')} /></div>
          </div>
        )}
        <Field label="Required date (if known)" name="requiredDate" value={values.requiredDate} onChange={update} error={errorFor('requiredDate')} inputClass={inputClass} type="date" />
      </fieldset>

      <fieldset>
        <legend className="form-legend">Pickup or delivery</legend>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(['Pickup', 'Delivery', 'NotSure'] as const).map((choice) => (
            <label key={choice} className="form-choice">
              <input type="radio" name="fulfilment" checked={values.fulfilmentPreference === choice} onChange={() => update('fulfilmentPreference', choice)} />
              {choice === 'NotSure' ? 'Not sure' : choice}
            </label>
          ))}
        </div>
        {values.fulfilmentPreference === 'Delivery' && <Field label="Delivery suburb" name="deliverySuburb" value={values.deliverySuburb} onChange={update} error={errorFor('deliverySuburb')} inputClass={inputClass} required />}
      </fieldset>

      <fieldset>
        <legend className="form-legend">Your details</legend>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Name" name="customerName" value={values.customerName} onChange={update} error={errorFor('customerName')} inputClass={inputClass} autoComplete="name" required />
          <Field label="Email" name="customerEmail" value={values.customerEmail} onChange={update} error={errorFor('customerEmail')} inputClass={inputClass} type="email" autoComplete="email" required />
          <Field label="Phone (optional)" name="customerPhone" value={values.customerPhone} onChange={update} error={errorFor('customerPhone')} inputClass={inputClass} type="tel" autoComplete="tel" />
          <Field label="Organisation (optional)" name="organisationName" value={values.organisationName} onChange={update} error={errorFor('organisationName')} inputClass={inputClass} autoComplete="organization" />
        </div>
        <div className="mt-4"><label htmlFor="notes" className="form-label">Notes</label><textarea id="notes" rows={5} maxLength={2000} value={values.notes} onChange={(event) => update('notes', event.target.value)} className={inputClass} aria-invalid={Boolean(errorFor('notes'))} aria-describedby={describedBy('notes')} /><p className="form-hint text-right">{values.notes.length}/2000</p><ErrorText name="notes" error={errorFor('notes')} /></div>
      </fieldset>

      <fieldset>
        <legend className="form-legend">Artwork (optional)</legend>
        <p className="mt-2 text-sm text-ink-muted">Up to 5 PNG, JPEG, WebP, PDF or AI files. 20 MB each, 60 MB total. Files are staged in private storage. <Link className="underline" href="/help/artwork-requirements">Artwork and file requirements</Link></p>
        <label htmlFor="attachments" className="btn-glass mt-4 min-h-11 cursor-pointer">Choose artwork</label>
        <input id="attachments" type="file" className="sr-only" multiple accept={ACCEPT} onChange={(event) => { void uploadFiles(event.target.files); event.target.value = '' }} aria-invalid={Boolean(errorFor('attachments'))} aria-describedby={describedBy('attachments')} />
        <ErrorText name="attachments" error={errorFor('attachments')} />
        <ul className="mt-4 space-y-2" aria-live="polite">
          {uploads.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-sunken px-4 py-3 text-sm"><span className="min-w-0 break-all">{item.file.name} · {(item.file.size / 1024 / 1024).toFixed(1)} MB</span><span className={item.state === 'failed' ? 'text-danger' : 'text-ink-muted'}>{item.state === 'uploading' ? 'Uploading…' : item.state === 'ready' ? 'Ready' : item.error}</span><span className="flex gap-3">{item.state === 'failed' && <button type="button" className="min-h-11 underline" onClick={() => { void retryUpload(item) }} aria-label={`Retry ${item.file.name}`}>Retry</button>}<button type="button" className="min-h-11 underline" onClick={() => setUploads((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`Remove ${item.file.name}`}>Remove</button></span></li>)}
        </ul>
      </fieldset>

      <div className="absolute left-[-10000px]" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" name="website" value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" /></div>
      <p className="notice">We collect the details and artwork you provide to respond to this request. Artwork is stored privately. This request is not an order, and no payment is taken. A final Privacy Policy is awaiting business and legal approval.</p>
      {submitError && <div role="alert" className="rounded-xl border border-danger-border bg-danger-surface p-4 text-sm text-danger"><p>{submitError}</p><p className="mt-2">Email <a className="underline" href={emailHref}>{contactEmail}</a>{phoneHref && businessPhone ? <> or call <a className="underline" href={phoneHref}>{businessPhone}</a></> : null}.</p></div>}
      <div aria-live="polite"><button type="submit" className="btn-black min-h-11 w-full sm:w-auto" disabled={submitting || uploads.some((item) => item.state === 'uploading')}>{submitting ? 'Submitting…' : uploads.some((item) => item.state === 'uploading') ? 'Waiting for uploads…' : 'Submit quote request'}</button></div>
    </form>
  )
}

function Field({ label, name, value, onChange, error, inputClass, required, ...props }: {
  label: string; name: keyof QuoteFormValues; value: string
  onChange: (name: keyof QuoteFormValues, value: string) => void
  error?: string; inputClass: string; required?: boolean
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'value' | 'onChange'>) {
  return <div className="mt-4"><label htmlFor={name} className="form-label">{label}{required && <span aria-hidden="true"> *</span>}</label><input id={name} name={name} value={value} onChange={(event) => onChange(name, event.target.value)} className={inputClass} required={required} aria-required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined} {...props} /><ErrorText name={name} error={error} /></div>
}

function ErrorText({ name, error }: { name: string; error?: string }) {
  return error ? <p id={`${name}-error`} className="form-error">{error}</p> : null
}
