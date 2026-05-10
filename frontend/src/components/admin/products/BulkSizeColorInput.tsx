'use client'

interface Props {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
}

const LABEL = 'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.54px] text-black/55'

export function BulkSizeColorInput({ label, placeholder, value, onChange, error, disabled }: Props) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        disabled={disabled}
        className={[
          'w-full resize-y rounded-2xl border bg-white px-4 py-3 text-sm text-black',
          'placeholder:text-black/30',
          'focus:border-black/30 focus:outline-none focus:ring-2 focus:ring-black/[0.06]',
          'disabled:opacity-50',
          error ? 'border-red-300' : 'border-black/[0.10]',
        ].join(' ')}
      />
      {error && (
        <p className="mt-1 text-xs text-red-600" style={{ letterSpacing: '-0.14px' }}>
          {error}
        </p>
      )}
    </div>
  )
}
