'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

interface Props {
  children: ReactNode
  username?: string
  role?: string
}

export function AdminShell({ children, username, role }: Props) {
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
      <AdminSidebar role={role} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-black/[0.08] bg-white/92 px-3 backdrop-blur-sm sm:px-5 lg:px-8">
          <div className="hidden min-w-0 sm:block">
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
            {role === 'Admin' && (
              <Link
                href="/admin/ai-order-imports"
                className="rounded-full border border-black/[0.12] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.54px] text-black/60 md:hidden"
              >
                AI intake
              </Link>
            )}
            {username && (
              <span className="hidden text-xs text-black/55 sm:inline" style={{ letterSpacing: '-0.14px' }}>
                {username}
              </span>
            )}
            <span className={[
              'hidden rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.54px] sm:inline',
              role === 'Viewer'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-black/[0.08] bg-black/[0.02] text-black/55',
            ].join(' ')}>
              {role ?? 'Staff'}
            </span>
            <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-black text-[10px] font-medium text-white shadow-sm sm:flex">
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

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
