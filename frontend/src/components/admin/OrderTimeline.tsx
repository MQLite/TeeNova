'use client'

import { OrderStatusBadge } from '@/components/admin/OrderStatusBadge'
import type { OrderTimelineEntry, OrderStatus } from '@/types'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-NZ', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function EntryIcon({ eventType }: { eventType: OrderTimelineEntry['eventType'] }) {
  if (eventType === 'ApprovedForPrinting') {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-600">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  if (eventType === 'CustomerNotificationRecorded') {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-sky-600">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25H4.5A2.25 2.25 0 012.25 17.25V6.75M21.75 6.75A2.25 2.25 0 0019.5 4.5H4.5A2.25 2.25 0 002.25 6.75m19.5 0l-8.69 5.215a2.25 2.25 0 01-2.12 0L2.25 6.75" />
        </svg>
      </span>
    )
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/[0.06] text-black/40">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <circle cx="5" cy="5" r="2.5" fill="currentColor" />
      </svg>
    </span>
  )
}

export function OrderTimeline({ entries }: { entries: OrderTimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="text-sm text-black/40" style={{ letterSpacing: '-0.14px' }}>
        No activity recorded.
      </div>
    )
  }

  return (
    <ol className="space-y-0">
      {entries.map((entry, idx) => (
        <li key={entry.id} className="flex gap-3">
          {/* Spine */}
          <div className="flex flex-col items-center">
            <EntryIcon eventType={entry.eventType} />
            {idx < entries.length - 1 && (
              <div className="mt-1 w-px flex-1 bg-black/[0.08]" style={{ minHeight: 20 }} />
            )}
          </div>

          {/* Content */}
          <div className="pb-4 pt-0.5 min-w-0">
            <p className="text-sm text-black" style={{ fontWeight: 440, letterSpacing: '-0.14px' }}>
              {entry.description}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-black/40 tracking-[0.02em]">
                {formatTime(entry.creationTime)}
              </span>
              {entry.status && (
                <OrderStatusBadge status={entry.status as OrderStatus} size="sm" />
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
