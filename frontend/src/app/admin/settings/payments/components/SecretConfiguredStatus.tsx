// Masked, non-secret status pill for a configurable secret (Jira 9908.1).
//
// Renders ONLY a configured/not-configured state plus an optional non-secret last-4 fragment.
// It never accepts, stores, or renders a full secret value or ciphertext — the API only ever
// returns a boolean + last-4, and this component mirrors that contract exactly.

export function SecretConfiguredStatus({
  configured,
  last4,
  prefix,
}: {
  configured: boolean
  last4?: string | null
  // Optional non-secret display prefix (e.g. "pk_test_") for publishable-key-style rows.
  prefix?: string
}) {
  if (!configured) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Not configured
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      Configured{last4 ? ` · ${prefix ?? ''}••••${last4}` : ''}
    </span>
  )
}
