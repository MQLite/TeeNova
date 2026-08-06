import { PortfolioEditor } from '../PortfolioEditor'
import { getAdminRole } from '@/lib/auth'
export default function NewPortfolioItemPage(){return <PortfolioEditor readOnly={getAdminRole()!=='Admin'}/>} 
