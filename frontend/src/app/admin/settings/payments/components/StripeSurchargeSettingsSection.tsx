import {
  SURCHARGE_DISCLOSURE_MAX_LENGTH,
  type StripeSurchargeFormErrors,
  type StripeSurchargeFormValue,
} from './stripe-surcharge-form'

export interface StripeSurchargeSettingsSectionProps {
  mode: 'Test' | 'Live'
  value: StripeSurchargeFormValue
  onChange: (next: StripeSurchargeFormValue) => void
  disabled?: boolean
  errors?: StripeSurchargeFormErrors
}

const inputCls = 'w-full rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-sm text-black focus:border-black/30 focus:outline-none disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-black/40'
const labelCls = 'mb-1.5 block text-sm text-black/70'

export function StripeSurchargeSettingsSection({
  mode,
  value,
  onChange,
  disabled = false,
  errors = {},
}: StripeSurchargeSettingsSectionProps) {
  const set = <K extends keyof StripeSurchargeFormValue>(key: K, next: StripeSurchargeFormValue[K]) =>
    onChange({ ...value, [key]: next })

  return (
    <section aria-labelledby={`${mode.toLowerCase()}-surcharge-heading`}>
      <p id={`${mode.toLowerCase()}-surcharge-heading`} className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.54px] text-black/40">
        Card Surcharge
      </p>
      <div className={`space-y-4 rounded-xl border p-5 ${value.enabled ? 'border-black/[0.12] bg-white' : 'border-black/[0.08] bg-black/[0.02]'}`}>
        <div>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={value.enabled}
              disabled={disabled}
              onChange={(event) => set('enabled', event.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="block text-sm font-medium text-black/80">Enable card processing surcharge</span>
              <span className="mt-1 block text-xs leading-5 text-black/50">
                When enabled, future Stripe card payments in this mode will include the configured surcharge.
                Existing payment sessions are not changed.
              </span>
            </span>
          </label>
        </div>

        <p className={`rounded-lg px-3 py-2 text-xs ${mode === 'Live' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
          {mode === 'Live'
            ? 'This affects future Stripe Live card payments after Live mode is active.'
            : 'Use Stripe Test mode to verify the customer disclosure, Checkout line items, webhook settlement and receipt before enabling this in Live.'}
        </p>

        {!value.enabled && (
          <p className="text-xs text-black/50">These prepared values are inactive and take effect only when the surcharge is enabled.</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${mode}-surcharge-percentage`} className={labelCls}>Percentage rate</label>
            <div className="relative">
              <input
                id={`${mode}-surcharge-percentage`}
                type="text"
                inputMode="decimal"
                value={value.percentage}
                disabled={disabled}
                onChange={(event) => set('percentage', event.target.value)}
                aria-invalid={Boolean(errors.percentage)}
                aria-describedby={`${mode}-surcharge-percentage-hint${errors.percentage ? ` ${mode}-surcharge-percentage-error` : ''}`}
                className={`${inputCls} pr-8`}
              />
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-black/45">%</span>
            </div>
            <p id={`${mode}-surcharge-percentage-hint`} className="mt-1 text-xs text-black/40">0.00 to 99.99, with up to two decimal places.</p>
            {errors.percentage && <p id={`${mode}-surcharge-percentage-error`} className="mt-1 text-xs text-red-600">{errors.percentage}</p>}
          </div>

          <div>
            <label htmlFor={`${mode}-surcharge-fixed`} className={labelCls}>Fixed fee</label>
            <div className="relative">
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-black/45">NZ$</span>
              <input
                id={`${mode}-surcharge-fixed`}
                type="text"
                inputMode="decimal"
                value={value.fixedAmount}
                disabled={disabled}
                onChange={(event) => set('fixedAmount', event.target.value)}
                aria-invalid={Boolean(errors.fixedAmount)}
                aria-describedby={`${mode}-surcharge-fixed-hint${errors.fixedAmount ? ` ${mode}-surcharge-fixed-error` : ''}`}
                className={`${inputCls} pl-12`}
              />
            </div>
            <p id={`${mode}-surcharge-fixed-hint`} className="mt-1 text-xs text-black/40">A non-negative NZD amount with up to two decimal places.</p>
            {errors.fixedAmount && <p id={`${mode}-surcharge-fixed-error`} className="mt-1 text-xs text-red-600">{errors.fixedAmount}</p>}
          </div>
        </div>

        <div>
          <label htmlFor={`${mode}-surcharge-disclosure`} className={labelCls}>Customer disclosure</label>
          <textarea
            id={`${mode}-surcharge-disclosure`}
            rows={4}
            value={value.disclosureText}
            disabled={disabled}
            maxLength={SURCHARGE_DISCLOSURE_MAX_LENGTH}
            onChange={(event) => set('disclosureText', event.target.value)}
            aria-invalid={Boolean(errors.disclosureText)}
            aria-describedby={`${mode}-surcharge-disclosure-hint ${mode}-surcharge-disclosure-count${errors.disclosureText ? ` ${mode}-surcharge-disclosure-error` : ''}`}
            className={`${inputCls} resize-y`}
          />
          <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-black/40">
            <p id={`${mode}-surcharge-disclosure-hint`}>This plain-text message appears to customers before they continue to Stripe.</p>
            <p id={`${mode}-surcharge-disclosure-count`} aria-live="polite">{value.disclosureText.length} / {SURCHARGE_DISCLOSURE_MAX_LENGTH} characters</p>
          </div>
          {errors.disclosureText && <p id={`${mode}-surcharge-disclosure-error`} className="mt-1 text-xs text-red-600">{errors.disclosureText}</p>}
        </div>

        <div aria-labelledby={`${mode}-surcharge-version-label`}>
          <p id={`${mode}-surcharge-version-label`} className={labelCls}>Calculation version</p>
          <output className="block rounded-lg border border-black/[0.08] bg-black/[0.03] px-3 py-2 font-mono text-sm text-black/60">
            {value.calculationVersion || 'Unavailable'}
          </output>
          {errors.calculationVersion && <p className="mt-1 text-xs text-red-600">{errors.calculationVersion}</p>}
        </div>
      </div>
    </section>
  )
}
