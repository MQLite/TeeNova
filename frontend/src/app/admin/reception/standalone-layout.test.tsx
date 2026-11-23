import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { AdminShell } from '../AdminShell'
import { SiteFrame } from '@/components/layout/SiteFrame'

const route = vi.hoisted(() => ({ pathname: '/admin' }))
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ replace: vi.fn() }),
}))

function Page() {
  return <SiteFrame header={<header>Store header</header>} footer={<footer>Store footer</footer>}>
    <AdminShell role="Admin"><h1>Page content</h1></AdminShell>
  </SiteFrame>
}

it('removes both sets of navigation on reception and restores them on return', () => {
  const { rerender } = render(<Page />)
  const entry = screen.getAllByRole('link', { name: '接待工作台' })[0]
  expect(entry).toHaveAttribute('href', '/admin/reception')
  route.pathname = entry.getAttribute('href')!
  rerender(<Page />)
  expect(screen.getByRole('heading', { name: 'Page content' })).toBeVisible()
  expect(screen.queryByRole('complementary')).toBeNull()
  expect(screen.queryByRole('banner')).toBeNull()
  expect(screen.queryByRole('contentinfo')).toBeNull()

  route.pathname = '/admin'
  rerender(<Page />)
  expect(screen.getByRole('complementary')).toBeVisible()
  expect(screen.getByText('Store header')).toBeVisible()
  expect(screen.getByText('Store footer')).toBeVisible()
})
