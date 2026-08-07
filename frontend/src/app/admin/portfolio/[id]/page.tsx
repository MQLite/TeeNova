import { PortfolioEditor } from '../PortfolioEditor'
import { getAdminRole } from '@/lib/auth'
export default async function PortfolioItemPage(props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  return <PortfolioEditor id={params.id} readOnly={(await getAdminRole()) !== 'Admin'} />
}
