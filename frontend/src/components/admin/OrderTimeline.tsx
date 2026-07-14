'use client'

import { OrderStatusBadge } from '@/components/admin/OrderStatusBadge'
import { formatNzDateTime } from '@/lib/datetime'
import type { OrderTimelineEntry, OrderStatus } from '@/types'

function formatTime(iso: string): string {
  return formatNzDateTime(iso, {
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
  if (eventType === 'PaymentReceived') {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33" />
        </svg>
      </span>
    )
  }
  if (eventType === 'PriceAdjusted') {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v12M21 16.5 16.5 21m0 0L12 16.5m4.5 4.5v-12" />
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
