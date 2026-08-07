import { PortfolioEditor } from '../PortfolioEditor'
import { getAdminRole } from '@/lib/auth'

export default async function NewPortfolioItemPage() {
  return <PortfolioEditor readOnly={(await getAdminRole()) !== 'Admin'} />
}
