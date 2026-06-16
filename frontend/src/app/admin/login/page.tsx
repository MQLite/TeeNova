import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Sign In' }

/**
 * Only allow internal /admin paths as redirect targets after login.
 * Blocks external URLs and prevents a redirect loop back to /admin/login.
 */
function sanitiseReturnUrl(raw: string | undefined): string {
  if (
    typeof raw === 'string' &&
    raw.startsWith('/admin') &&
    raw !== '/admin/login'
  ) {
    return raw
  }
  return '/admin'
}

export default function LoginPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const token = cookies().get('admin_token')
  if (token?.value) {
    redirect('/admin')
  }

  const raw = typeof searchParams?.returnUrl === 'string' ? searchParams.returnUrl : undefined
  const returnUrl = sanitiseReturnUrl(raw)

  const sessionExpired = searchParams?.reason === 'session-expired'

  return <LoginForm returnUrl={returnUrl} sessionExpired={sessionExpired} />
}
