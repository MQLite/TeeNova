import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

export const metadata: Metadata = {
  title: { template: '%s | Admin - Otahuhu Printing', default: 'Admin - Otahuhu Printing' },
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#f7f7f5]">
      <AdminSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-black/[0.08] bg-white/92 px-6 backdrop-blur-sm lg:px-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
              Internal Workspace
            </p>
            <p className="mt-0.5 text-sm text-black/58" style={{ letterSpacing: '-0.14px' }}>
              <span className="text-black" style={{ fontWeight: 520 }}>Otahuhu Printing</span>
              <span className="mx-2 text-black/20">/</span>
              Admin operations
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-black/[0.08] bg-black/[0.02] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
              Staff
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-[10px] font-medium text-white shadow-sm">
              OP
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
