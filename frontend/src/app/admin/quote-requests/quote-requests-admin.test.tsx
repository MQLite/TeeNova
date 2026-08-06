import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuoteRequestListClient } from './QuoteRequestListClient'
import { QuoteRequestDetailClient } from './[id]/QuoteRequestDetailClient'

const { list, get, markReviewed, cancel, markSpam, resend } = vi.hoisted(() => ({
  list: vi.fn(), get: vi.fn(), markReviewed: vi.fn(), cancel: vi.fn(), markSpam: vi.fn(), resend: vi.fn(),
}))
vi.mock('@/api/quote-requests', () => ({ adminQuoteRequestsApi: {
  list, get, markReviewed, cancel, markSpam, resend,
  attachmentDownloadUrl: (id: string, attachmentId: string) => `/api/admin/quote-requests/${id}/attachments/${attachmentId}`,
} }))
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'quote-1' }) }))

const summary = {
  id: 'quote-1', reference: 'QR-ABC234', serviceType: 'Banners', customerName: 'Customer',
  customerEmail: 'customer@example.com', status: 'New', internalNotificationStatus: 'Failed',
  customerAcknowledgementStatus: 'Sent', quantity: 5, requiredDate: '2026-08-20T00:00:00Z',
  attachmentCount: 1, creationTime: '2026-08-05T00:00:00Z',
}
const detail = {
  ...summary, serviceTypeOther: null, productId: null, productNameSnapshot: null, quantity: 5,
  width: 1000, height: 500, dimensionUnit: 'Millimetres', requiredDate: '2026-08-20T00:00:00Z',
  fulfilmentPreference: 'Pickup', deliverySuburb: null, customerPhone: null, organisationName: null,
  notes: 'Please quote', sourcePath: '/quote', attachments: [{ id: 'attachment-1', fileName: 'art.pdf', contentType: 'application/pdf', sizeBytes: 1024, sha256: 'a'.repeat(64), scanStatus: 'NotScanned' }],
}

describe('quote request Admin', () => {
  beforeEach(() => { vi.clearAllMocks(); list.mockResolvedValue({ items: [summary], totalCount: 1 }); get.mockResolvedValue(detail); markReviewed.mockResolvedValue({ ...detail, status: 'Reviewed' }); resend.mockResolvedValue({ ...detail, internalNotificationStatus: 'Sent' }) })

  it('lists references, service, customer and notification states', async () => {
    render(<QuoteRequestListClient role="Admin" />)
    expect(await screen.findByText('QR-ABC234')).toBeInTheDocument()
    expect(screen.getByText(/Customer · customer@example.com/)).toBeInTheDocument()
    expect(screen.getByText(/Internal: Failed/)).toBeInTheDocument()
  })
  it('shows a read-only notice to Viewer', async () => {
    render(<QuoteRequestListClient role="Viewer" />)
    expect(await screen.findByText(/Viewer access is read-only/)).toBeInTheDocument()
  })
  it('lets Viewer read metadata but not mutate or download private bytes', async () => {
    render(<QuoteRequestDetailClient role="Viewer" />)
    expect(await screen.findByText('art.pdf')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Download' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).not.toBeInTheDocument()
    expect(screen.getByText(/Not malware-scanned/)).toBeInTheDocument()
  })
  it('exposes Admin-only status and attachment actions', async () => {
    render(<QuoteRequestDetailClient role="Admin" />)
    expect(await screen.findByRole('button', { name: 'Mark reviewed' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark spam' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('href', '/api/admin/quote-requests/quote-1/attachments/attachment-1')
  })
  it('resends only an explicitly failed channel', async () => {
    const user = userEvent.setup()
    render(<QuoteRequestDetailClient role="Admin" />)
    const button = await screen.findByRole('button', { name: 'Resend internal' })
    expect(screen.queryByRole('button', { name: 'Resend customer' })).not.toBeInTheDocument()
    await user.click(button)
    await waitFor(() => expect(resend).toHaveBeenCalledWith('quote-1', 'internal'))
  })
  it('marks a New request reviewed without any convert-to-order operation', async () => {
    const user = userEvent.setup()
    render(<QuoteRequestDetailClient role="Admin" />)
    await user.click(await screen.findByRole('button', { name: 'Mark reviewed' }))
    await waitFor(() => expect(markReviewed).toHaveBeenCalledWith('quote-1'))
    expect(screen.queryByText(/convert to order/i)).not.toBeInTheDocument()
  })
})
