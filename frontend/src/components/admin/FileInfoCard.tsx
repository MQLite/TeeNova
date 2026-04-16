'use client'

import type { ReactNode } from 'react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DownloadDesignButton } from '@/components/orders/DownloadDesignButton'
import { FilenameDisplay } from '@/components/admin/FilenameDisplay'
import type { OrderItem, OrderItemPositionAsset } from '@/types'

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 border-t border-black/[0.06] py-3 first:border-t-0 first:pt-0 last:pb-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">{label}</span>
      <div className="min-w-0 text-sm text-black/60">{value}</div>
    </div>
  )
}

function AssetInfoRow({ item, asset }: { item: OrderItem; asset: OrderItemPositionAsset }) {
  return (
    <div className="rounded-lg border border-black/[0.08] bg-black/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-black" style={{ fontWeight: 480, letterSpacing: '-0.14px' }}>
            {item.productName}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/40">
            {asset.position.replace(/([A-Z])/g, ' $1').trim()}
          </p>
        </div>
        {asset.uploadedAssetUrl && (
          <DownloadDesignButton
            url={asset.uploadedAssetUrl}
            fileName={asset.originalFileName ?? asset.fileName ?? undefined}
            compact
          />
        )}
      </div>

      <div className="mt-3">
        <MetaRow label="Stored name" value={<FilenameDisplay fileName={asset.fileName} />} />
        <MetaRow label="Original name" value={<FilenameDisplay fileName={asset.originalFileName} />} />
      </div>
    </div>
  )
}

export function FileInfoCard({ items }: { items: OrderItem[] }) {
  const assets = items.flatMap((item) =>
    item.positionAssets
      .filter((asset) => asset.uploadedAssetUrl)
      .map((asset) => ({ item, asset })),
  )

  return (
    <Card>
      <CardHeader>
        <h2 className="font-mono text-[11px] uppercase tracking-[0.54px] text-black/55">File Info</h2>
      </CardHeader>
      <CardBody className="space-y-3">
        {assets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-black/[0.10] bg-black/[0.02] px-4 py-4 text-sm text-black/45">
            No uploaded design files are linked to this order yet.
          </div>
        ) : (
          assets.map(({ item, asset }) => (
            <AssetInfoRow key={asset.id} item={item} asset={asset} />
          ))
        )}
      </CardBody>
    </Card>
  )
}
