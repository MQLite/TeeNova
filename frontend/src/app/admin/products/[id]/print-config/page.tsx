import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function LegacyProductPrintConfigPage({ params }: PageProps) {
  const { id } = await params
  redirect(`/admin/print-config/products/${id}`)
}
