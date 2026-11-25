import { redirect } from 'next/navigation'
import { getAdminRole } from '@/lib/auth'
import { PendingGmailArtwork } from '../PendingGmailArtwork'
import '../reception.css'

export const metadata = { title: { absolute: '待关联设计稿 · 接待工作台' } }

export default async function PendingPage() {
  if (await getAdminRole() !== 'Admin') redirect('/admin')
  return <div className="reception-desk" lang="zh-CN">
    <header className="rc-mast"><strong>OtahuhuPrintingShop</strong><span>接待工作台</span></header>
    <nav aria-label="接待导航"><a href="/admin/reception">返回工单总览</a></nav>
    <div className="rc-body"><PendingGmailArtwork /></div>
  </div>
}
