import { PortfolioListClient } from './PortfolioListClient'
import { getAdminRole } from '@/lib/auth'

export default async function AdminPortfolioPage() {
  return (
    <PortfolioListClient
      enabled={process.env.NEXT_PUBLIC_PORTFOLIO_ENABLED === 'true'}
      readOnly={(await getAdminRole()) !== 'Admin'}
    />
  )
}
