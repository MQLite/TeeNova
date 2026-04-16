'use client'

import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export function NotificationPanel({
  canRecord,
  loading,
  onRecord,
}: {
  canRecord: boolean
  loading: boolean
  onRecord: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">Customer Notification</h2>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-3">
          <p className="text-sm text-sky-900" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
            Placeholder only
          </p>
          <p className="mt-1 text-xs text-sky-700" style={{ letterSpacing: '-0.14px' }}>
            No actual message is sent. This action only records the notification step in the order timeline.
          </p>
        </div>
        <Button
          size="sm"
          variant="white"
          disabled={!canRecord}
          loading={loading}
          onClick={onRecord}
        >
          Record Customer Notification (Placeholder)
        </Button>
        {!canRecord && (
          <p className="text-xs text-black/45" style={{ letterSpacing: '-0.14px' }}>
            Available once the order reaches Ready status.
          </p>
        )}
      </CardBody>
    </Card>
  )
}
