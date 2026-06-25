import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function LegacyProductPrintOptionsPage({ params }: PageProps) {
  const { id } = await params
  redirect(`/admin/print-config/products/${id}/print-options`)
}
