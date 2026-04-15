interface VariantBadgeProps {
  size: string
  color: string
}

export function VariantBadge({ size, color }: VariantBadgeProps) {
  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white px-3 py-2 shadow-sm">
      <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Variant</p>
      <div className="mt-1 flex items-center gap-2 text-sm text-black" style={{ letterSpacing: '-0.14px' }}>
        <span className="inline-flex items-center rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px]" style={{ fontWeight: 540 }}>
          {size}
        </span>
        <span className="text-black/30">•</span>
        <span style={{ fontWeight: 480 }}>{color}</span>
      </div>
    </div>
  )
}
