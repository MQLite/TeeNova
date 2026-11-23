'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

export const receptionPath = '/admin/reception'

export function SiteFrame({ header, footer, children }: {
  header: ReactNode
  footer: ReactNode
  children: ReactNode
}) {
  const standalone = usePathname() === receptionPath
  return <div className="flex min-h-screen flex-col bg-canvas">
    {!standalone && header}
    {children}
    {!standalone && footer}
  </div>
}
