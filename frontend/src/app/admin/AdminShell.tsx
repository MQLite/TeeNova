'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

interface Props {
  children: ReactNode
  username?: string
}

export function AdminShell({ children, username }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  if (pathname === '/admin/login') {
    return <>{children}</>
  }

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Cookie clearing failed — still redirect; middleware will block access on next load
    } finally {
      router.replace('/admin/login')
    }
  }

  const initial = username ? username[0].toUpperCase() : 'OP'

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
            {username && (
              <span className="hidden text-xs text-black/55 sm:inline" style={{ letterSpacing: '-0.14px' }}>
                {username}
              </span>
            )}
            <span className="rounded-full border border-black/[0.08] bg-black/[0.02] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.54px] text-black/55">
              Staff
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-[10px] font-medium text-white shadow-sm">
              {initial}
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-[50px] border border-black/[0.12] bg-white px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.54px] text-black/55 transition-colors hover:border-black/25 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loggingOut ? 'Signing out…' : 'Logout'}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
