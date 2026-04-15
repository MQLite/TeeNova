'use client'

import { useState } from 'react'
import clsx from 'clsx'

interface EditPlaceholderButtonProps {
  label?: string
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md'
}

export function EditPlaceholderButton({
  label = 'Edit Product',
  variant = 'secondary',
  size = 'md',
}: EditPlaceholderButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx(
          'inline-flex items-center gap-2 rounded-full transition-colors',
          size === 'sm'
            ? 'px-3 py-1.5 text-[11px]'
            : 'px-4 py-2 text-sm',
          variant === 'primary'
            ? 'bg-black text-white hover:opacity-85'
            : 'border border-black/[0.10] bg-white text-black/70 hover:bg-black/[0.03] hover:text-black',
        )}
        style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/45">Product Editing</p>
                <h3 className="mt-1 text-xl text-black" style={{ fontWeight: 540, letterSpacing: '-0.26px' }}>
                  Coming in a future phase
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 text-black/35 transition-colors hover:bg-black/[0.04] hover:text-black/70"
                aria-label="Close"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-dashed border-black/[0.10] bg-black/[0.02] px-4 py-4">
              <p className="text-sm text-black/70" style={{ letterSpacing: '-0.14px' }}>
                Editing functionality will be implemented in a future phase.
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
                Demo-ready view only
              </p>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center rounded-full border border-black/[0.10] px-4 py-2 text-sm text-black/70 transition-colors hover:bg-black/[0.03] hover:text-black"
                style={{ letterSpacing: '-0.14px', fontWeight: 480 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
