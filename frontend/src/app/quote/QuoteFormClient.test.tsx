import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuoteFormClient } from './QuoteFormClient'

const { upload, create } = vi.hoisted(() => ({ upload: vi.fn(), create: vi.fn() }))
vi.mock('@/api/quote-requests', () => ({ quoteRequestsApi: { upload, create } }))

describe('QuoteFormClient', () => {
  beforeEach(() => { vi.clearAllMocks(); create.mockResolvedValue({ id: 'q1', reference: 'QR-ABC234', status: 'New', wasDuplicate: false, message: 'received' }) })

  it('renders the accessible common fields with no price input', () => {
    render(<QuoteFormClient initialService="GarmentPrinting" sourcePath="/quote" />)
    expect(screen.getByLabelText(/Service type/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Quantity/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Email/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/price/i)).not.toBeInTheDocument()
  })

  it('reveals dimension fields for banners and other text for Other', async () => {
    const user = userEvent.setup()
    render(<QuoteFormClient initialService="GarmentPrinting" sourcePath="/quote" />)
    await user.selectOptions(screen.getByLabelText(/Service type/), 'Banners')
    expect(screen.getByLabelText('Width *')).toBeInTheDocument()
    expect(screen.getByLabelText('Height *')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/Service type/), 'Other')
    expect(screen.getByLabelText(/Describe the service/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Quantity \(if known\)/)).toBeInTheDocument()
  })

  it('focuses an error summary and wires field errors', async () => {
    const user = userEvent.setup()
    render(<QuoteFormClient initialService="GarmentPrinting" sourcePath="/quote" />)
    await user.click(screen.getByRole('button', { name: /Submit quote request/ }))
    const alert = screen.getByRole('alert')
    await waitFor(() => expect(alert).toHaveFocus())
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('aria-describedby', 'customerEmail-error')
  })

  it('requires delivery suburb when Delivery is selected', async () => {
    const user = userEvent.setup()
    render(<QuoteFormClient initialService="GarmentPrinting" sourcePath="/quote" />)
    await user.click(screen.getByLabelText('Delivery'))
    expect(screen.getByLabelText('Delivery suburb *')).toBeInTheDocument()
  })

  it('uploads privately, keeps only the opaque token, and supports removal', async () => {
    upload.mockResolvedValue({ attachmentToken: 'opaque-token', fileName: 'art.pdf', contentType: 'application/pdf', sizeBytes: 8 })
    const user = userEvent.setup()
    render(<QuoteFormClient initialService="GarmentPrinting" sourcePath="/quote" />)
    const file = new File(['%PDF-1.7'], 'art.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Choose artwork'), file)
    expect(await screen.findByText('Ready')).toBeInTheDocument()
    expect(upload).toHaveBeenCalledWith(file)
    expect(screen.queryByText(/object key/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove art.pdf' }))
    expect(screen.queryByText(/art.pdf/)).not.toBeInTheDocument()
  })

  it('blocks submit while an upload is in progress', async () => {
    upload.mockReturnValue(new Promise(() => {}))
    render(<QuoteFormClient initialService="GarmentPrinting" sourcePath="/quote" />)
    fireEvent.change(screen.getByLabelText('Choose artwork'), { target: { files: [new File(['x'], 'art.pdf', { type: 'application/pdf' })] } })
    expect(await screen.findByRole('button', { name: 'Waiting for uploads…' })).toBeDisabled()
  })

  it('submits the enquiry-only contract and focuses confirmation', async () => {
    const user = userEvent.setup()
    render(<QuoteFormClient initialService="GarmentPrinting" productId="5d2dd857-b185-4b15-a448-9348a5e8be33" sourcePath="/products/5d2dd857-b185-4b15-a448-9348a5e8be33" />)
    await user.type(screen.getByLabelText(/^Quantity/), '10')
    await user.type(screen.getByLabelText(/^Name/), 'Customer')
    await user.type(screen.getByLabelText(/^Email/), 'customer@example.com')
    await user.click(screen.getByRole('button', { name: /Submit quote request/ }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    const payload = create.mock.calls[0][0]
    expect(payload).toMatchObject({ serviceType: 'GarmentPrinting', quantity: 10, customerEmail: 'customer@example.com', sourcePath: expect.stringMatching(/^\/products\//), attachmentTokens: [] })
    expect(payload.submissionKey).toEqual(expect.any(String))
    expect(payload).not.toHaveProperty('price')
    expect(payload).not.toHaveProperty('orderId')
    const heading = await screen.findByRole('heading', { name: /QR-ABC234/ })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(screen.getByText(/No payment has been taken/)).toBeInTheDocument()
  })

  it('preserves the form and shows an explicit contact fallback after network failure', async () => {
    create.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    render(<QuoteFormClient initialService="GarmentPrinting" sourcePath="/quote" />)
    await user.type(screen.getByLabelText(/^Quantity/), '10')
    await user.type(screen.getByLabelText(/^Name/), 'Customer')
    await user.type(screen.getByLabelText(/^Email/), 'customer@example.com')
    await user.click(screen.getByRole('button', { name: /Submit quote request/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not submit')
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Customer')
    expect(screen.getByRole('link', { name: /qualitycanvasltd@gmail.com/ })).toHaveAttribute('href', 'mailto:qualitycanvasltd@gmail.com')
  })

  it('rejects an attachment over the per-file cap before upload', async () => {
    const user = userEvent.setup()
    render(<QuoteFormClient initialService="GarmentPrinting" sourcePath="/quote" />)
    const file = new File(['x'], 'huge.pdf', { type: 'application/pdf' })
    Object.defineProperty(file, 'size', { value: 20 * 1024 * 1024 + 1 })
    await user.upload(screen.getByLabelText('Choose artwork'), file)
    expect((await screen.findAllByText(/20 MB or smaller/)).length).toBeGreaterThan(0)
    expect(upload).not.toHaveBeenCalled()
  })

  it('rejects more than five attachments before upload', async () => {
    const user = userEvent.setup()
    render(<QuoteFormClient initialService="GarmentPrinting" sourcePath="/quote" />)
    await user.upload(screen.getByLabelText('Choose artwork'), Array.from({ length: 6 }, (_, i) => new File(['x'], `art-${i}.pdf`, { type: 'application/pdf' })))
    expect((await screen.findAllByText(/no more than 5 files/)).length).toBeGreaterThan(0)
    expect(upload).not.toHaveBeenCalled()
  })

  it('shows a per-file failure and keeps submission blocked by validation', async () => {
    upload.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    render(<QuoteFormClient initialService="GarmentPrinting" sourcePath="/quote" />)
    await user.upload(screen.getByLabelText('Choose artwork'), new File(['x'], 'art.pdf', { type: 'application/pdf' }))
    expect(await screen.findByText(/Upload failed/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Submit quote request/ }))
    expect((await screen.findAllByText(/Remove or retry failed uploads/)).length).toBeGreaterThan(0)
    expect(create).not.toHaveBeenCalled()
  })

  it('retries a failed upload without exposing its token', async () => {
    upload.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
      attachmentToken: 'opaque-retry-token', fileName: 'art.pdf', contentType: 'application/pdf', sizeBytes: 8,
    })
    const user = userEvent.setup()
    render(<QuoteFormClient initialService="GarmentPrinting" sourcePath="/quote" />)
    await user.upload(screen.getByLabelText('Choose artwork'), new File(['%PDF-1.7'], 'art.pdf', { type: 'application/pdf' }))
    await user.click(await screen.findByRole('button', { name: 'Retry art.pdf' }))
    expect(await screen.findByText('Ready')).toBeInTheDocument()
    expect(upload).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('opaque-retry-token')).not.toBeInTheDocument()
  })

  it('treats an idempotent duplicate response as successful confirmation', async () => {
    create.mockResolvedValue({ id: 'q1', reference: 'QR-SAME22', status: 'New', wasDuplicate: true, message: 'received' })
    const user = userEvent.setup()
    render(<QuoteFormClient initialService="GarmentPrinting" sourcePath="/quote" />)
    await user.type(screen.getByLabelText(/^Quantity/), '10'); await user.type(screen.getByLabelText(/^Name/), 'Customer'); await user.type(screen.getByLabelText(/^Email/), 'customer@example.com')
    await user.click(screen.getByRole('button', { name: /Submit quote request/ }))
    expect(await screen.findByRole('heading', { name: /QR-SAME22/ })).toBeInTheDocument()
  })

  it('carries the honeypot value so the server can reject bots', async () => {
    const user = userEvent.setup()
    render(<QuoteFormClient initialService="Other" sourcePath="/quote" />)
    await user.type(screen.getByLabelText(/Describe the service/), 'Foil'); await user.type(screen.getByLabelText(/^Name/), 'Bot'); await user.type(screen.getByLabelText(/^Email/), 'bot@example.com')
    fireEvent.change(document.getElementById('website')!, { target: { value: 'https://spam.example' } })
    await user.click(screen.getByRole('button', { name: /Submit quote request/ }))
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ website: 'https://spam.example' })))
  })

  it('states private storage and enquiry-only privacy semantics without a final legal claim', () => {
    render(<QuoteFormClient initialService="GarmentPrinting" sourcePath="/quote" />)
    expect(screen.getByText(/Artwork is stored privately/)).toBeInTheDocument()
    expect(screen.getByText(/not an order/)).toBeInTheDocument()
    expect(screen.getByText(/awaiting business and legal approval/)).toBeInTheDocument()
  })
})
