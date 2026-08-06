import { PortfolioEditor } from '../PortfolioEditor'
import { getAdminRole } from '@/lib/auth'
export default function PortfolioItemPage({params}:{params:{id:string}}){return <PortfolioEditor id={params.id} readOnly={getAdminRole()!=='Admin'}/>} 
