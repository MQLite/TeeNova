import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

export const metadata: Metadata = {
  title: { template: '%s | Admin — Otahuhu Printing', default: 'Admin — Otahuhu Printing' },
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <AdminSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="font-semibold text-gray-600">Otahuhu Printing Shop</span>
            <span>·</span>
            <span>Internal Admin</span>
          </div>
          {/* Staff avatar placeholder */}
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-gray-400">Staff</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
              OP
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
