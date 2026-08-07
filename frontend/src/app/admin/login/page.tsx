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

export default async function LoginPage(
  props: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>
  }
) {
  const searchParams = await props.searchParams;
  const sessionExpired = searchParams?.reason === 'session-expired'

  // Mirror of the middleware rule — this page is reachable on a cache hit or a direct
  // navigation, so it must not re-open the loop the middleware closes. A session the
  // backend rejected arrives here with reason=session-expired while still carrying its
  // cookie; redirecting on mere presence would bounce it back into the 401 that sent it
  // here, forever. Show the form instead and let the operator sign in again.
  const token = (await cookies()).get('admin_token')
  if (token?.value && !sessionExpired) {
    redirect('/admin')
  }

  const raw = typeof searchParams?.returnUrl === 'string' ? searchParams.returnUrl : undefined
  const returnUrl = sanitiseReturnUrl(raw)

  return <LoginForm returnUrl={returnUrl} sessionExpired={sessionExpired} />
}
