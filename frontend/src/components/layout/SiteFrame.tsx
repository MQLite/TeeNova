'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

export const receptionPath = '/admin/reception'

export const isReceptionPath = (path: string) => path === receptionPath || path.startsWith(receptionPath + '/')

export function SiteFrame({ header, footer, children }: {
  header: ReactNode
  footer: ReactNode
  children: ReactNode
}) {
  const standalone = isReceptionPath(usePathname())
  return <div className="flex min-h-screen flex-col bg-canvas">
    {!standalone && header}
    {children}
    {!standalone && footer}
  </div>
}
