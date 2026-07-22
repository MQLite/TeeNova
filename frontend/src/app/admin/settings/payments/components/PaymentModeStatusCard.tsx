// Per-mode masked status card for the Payment Settings overview (Jira 9908.1).
//
// Summarises one mode (Test or Live) from masked overview DTO data only — configured / enabled /
// unlocked (Live) / active / ready — plus secret-configured status with last-4. It deliberately keeps
// "configured", "enabled", and "active" visually distinct so an operator can never read "Live
// configured" as "Live active": only `isActive` (derived from the authoritative server-config active
// mode) drives the Active pill. Presentational only — no fetching, no mutation, no secret inputs.

import Link from 'next/link'
import type { PaymentProviderMode, PaymentProviderSetting } from '@/types'
import { PaymentEnvironmentBadge } from './PaymentEnvironmentBadge'
import { SecretConfiguredStatus } from './SecretConfiguredStatus'

function Pill({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'neutral'; children: React.ReactNode }) {
  const cfg = {
    green:   { box: 'bg-green-50 text-green-700',  dot: 'bg-green-500' },
    amber:   { box: 'bg-amber-50 text-amber-700',  dot: 'bg-amber-500' },
    red:     { box: 'bg-red-100 text-red-700',     dot: 'bg-red-500' },
    neutral: { box: 'bg-black/[0.05] text-black/50', dot: 'bg-black/30' },
  }[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.box}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {children}
    </span>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-black/70">{label}</span>
      {children}
    </div>
  )
}

export function PaymentModeStatusCard({
  mode,
  setting,
  isActive,
  href,
  unlocked,
}: {
  mode: PaymentProviderMode
  setting: PaymentProviderSetting
  isActive: boolean
  href: string
  // Only meaningful for Live: whether server-side Live-mode configuration is unlocked.
  unlocked?: boolean
}) {
  const isLive = mode === 'Live'

  return (
    <div className={`rounded-xl border bg-white p-5 ${isLive && isActive ? 'border-red-200' : 'border-black/[0.08]'}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <PaymentEnvironmentBadge mode={mode} />
        {isActive
          ? <Pill tone={isLive ? 'red' : 'green'}>Active runtime mode</Pill>
          : <Pill tone="neutral">Inactive</Pill>}
      </div>

      <div className="space-y-2.5">
        {isLive && (
          <Row label="Configuration unlock">
            {unlocked
              ? <Pill tone="amber">Unlocked</Pill>
              : <Pill tone="neutral">Locked</Pill>}
          </Row>
        )}
        <Row label="Configured">
          {setting.isConfigured ? <Pill tone="green">Configured</Pill> : <Pill tone="neutral">Not configured</Pill>}
        </Row>
        <Row label="Enabled">
          {setting.isEnabled
            ? <Pill tone={isLive ? 'red' : 'green'}>Enabled</Pill>
            : <Pill tone="neutral">Disabled</Pill>}
        </Row>
        <Row label="Secret key">
          <SecretConfiguredStatus configured={setting.secretKeyConfigured} last4={setting.secretKeyLast4} />
        </Row>
        <Row label="Publishable key">
          {setting.publishableKey
            ? <span className="font-mono text-xs text-black/60">{isLive ? 'pk_live_' : 'pk_test_'}••••{setting.publishableKey.slice(-4)}</span>
            : <span className="text-xs text-black/40">optional · not set</span>}
        </Row>
        <Row label="Webhook signing secret">
          <SecretConfiguredStatus configured={setting.webhookSecretConfigured} last4={setting.webhookSecretLast4} />
        </Row>
        <Row label="Ready for checkout">
          {setting.canCreateCheckoutSession
            ? <Pill tone="green">Ready</Pill>
            : <Pill tone="amber">Not ready</Pill>}
        </Row>
      </div>

      <div className="mt-4 border-t border-black/[0.06] pt-3">
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-black/70 transition-colors hover:text-black"
        >
          Manage {isLive ? 'Live' : 'Test'} Mode
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </Link>
      </div>
    </div>
  )
}
