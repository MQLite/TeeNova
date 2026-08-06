import { PortfolioListClient } from './PortfolioListClient'
import { getAdminRole } from '@/lib/auth'
export default function AdminPortfolioPage(){ return <PortfolioListClient enabled={process.env.NEXT_PUBLIC_PORTFOLIO_ENABLED==='true'} readOnly={getAdminRole()!=='Admin'} /> }
