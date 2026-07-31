import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-client'
import type {
  AiOrderImport,
  AiOrderReview,
  AiOrderReviewField,
} from '@/api/ai-order-imports'
import { AiOrderReviewWorkspace, isConfirmationControlDisabled } from './AiOrderReviewWorkspace'

const api = vi.hoisted(() => ({
  getAiOrderImport: vi.fn(),
  getAiOrderReview: vi.fn(),
  saveAiOrderReview: vi.fn(),
  searchAiOrderCatalogue: vi.fn(),
  sourceContentUrl: vi.fn(
    (importId: string, documentId: string) =>
      `/api/admin/ai-order-imports/${importId}/documents/${documentId}/content`,
  ),
}))

vi.mock('@/api/ai-order-imports', async (loadOriginal) => {
  const original = await loadOriginal<typeof import('@/api/ai-order-imports')>()
  return { ...original, ...api }
})

function field<T>(value: T | null, sourceText?: string): AiOrderReviewField<T> {
  return {
    sourceValue: value,
    normalizedValue: value,
    staffValue: value,
    decision: value == null ? 'Unresolved' : 'Accepted',
    sourceText,
    confidence: value == null ? null : 0.98,
    sourceRefs: value == null
      ? []
      : [{ sourceDocumentId: 'source-1', page: 1, region: [0.1, 0.2, 0.3, 0.1] }],
    cleared: false,
    unresolved: value == null,
  }
}

function reviewFixture(): AiOrderReview {
  return {
    importId: 'import-1',
    status: 'NeedsReview',
    currentRevision: 2,
    baseRevision: 2,
    reviewVersion: 'ai-order-staff-review-v1',
    hasStaffRevision: false,
    validationRevision: 2,
    validationRevisionId: 'validation-1',
    validationVersion: 'ai-order-validation-v1',
    sourceAiRevision: 1,
    canonicalSha256: 'a'.repeat(64),
    catalogueValidationStatus: 'Current',
    catalogueValidatedAt: '2026-07-31T00:00:00Z',
    requiresRevalidation: false,
    issueCount: 2,
    blockingIssueCount: 1,
    warningCount: 1,
    customer: {
      name: field('Aroha', 'Aroha'),
      phone: field<string>(null),
      email: field<string>(null),
      organisation: field<string>(null),
      addressOrFulfilmentNotes: field<string>(null),
    },
    productGroups: [{
      groupId: 'group-1',
      writtenProductName: field('Classic tee', 'tee'),
      productSelection: {
        mode: 'Unresolved',
        selectedCatalogueProduct: null,
        adHocProduct: {
          adHocProductId: 'adhoc-1',
          displayName: 'Classic tee',
          inventoryBehavior: 'NotTracked',
          confirmed: false,
          acknowledgedOrderOnly: false,
        },
        productCandidates: [{
          productId: 'product-1',
          productName: 'Classic Tee',
          productKind: 'Garment',
          pricingModel: 'GarmentPrint',
          score: 0.94,
          active: true,
          reasons: ['Exact product name'],
        }],
      },
      colour: field({ kind: 'Named', label: 'Black' }),
      supplySource: field('Shop'),
      artworkIdentity: field<string>(null),
      artworkDescription: field<string>(null),
      productionNotes: field<string>(null),
      printing: [],
      sizeQuantityRows: [{
        rowId: 'row-1',
        size: field({ kind: 'Catalogue', label: 'M' }),
        quantity: field(2),
        confirmedProductVariantId: null,
        compatibleVariants: [],
        variantCandidatesByProduct: [{
          productId: 'product-1',
          variants: [{
            productVariantId: 'variant-1',
            sku: 'TEE-BLK-M',
            colour: 'Black',
            size: 'M',
            available: true,
          }],
        }],
      }],
    }],
    financials: {
      orderTotal: { ...field('100.00', '$100'), currency: 'NZD' },
      depositPaid: { ...field('0.00', '$0'), currency: 'NZD' },
      balanceDue: { currency: 'NZD', amount: '100.00' },
      derivationStatus: 'Complete',
    },
    issues: [{
      issueId: 'issue-product',
      code: 'PRODUCT_UNRESOLVED',
      category: 'MissingRequired',
      severity: 'Blocking',
      paths: ['/productGroups/0/productSelection'],
      message: 'Select a catalogue product or confirm an ad-hoc product.',
      sourceRefs: [{ sourceDocumentId: 'source-1', page: 1 }],
      resolution: { status: 'Open' },
    }, {
      issueId: 'issue-contact',
      code: 'CUSTOMER_CONTACT_MISSING',
      category: 'NeedsConfirmation',
      severity: 'Warning',
      paths: ['/customer'],
      message: 'Customer phone and email are both missing.',
      resolution: { status: 'Open' },
    }],
    issueResolutions: [],
    confirmationReadiness: {
      readyToConfirm: false,
      blockingIssueCount: 1,
      catalogueSelectionsCurrent: true,
      message: 'Complete 1 required item before confirmation.',
      confirmationOwnedBy: 'Jira 10207',
      confirmOrderEnabled: false,
    },
  }
}

function intakeFixture(): AiOrderImport {
  return {
    id: 'import-1',
    status: 'NeedsReview',
    currentRevision: 2,
    creationTime: '2026-07-31T00:00:00Z',
    sourceDocumentCount: 1,
    canModifyDocuments: false,
    canContinueToRecognition: false,
    sourceDocuments: [{
      id: 'source-1',
      sequence: 1,
      captureMethod: 'Camera',
      originalFileName: 'order.jpg',
      contentType: 'image/jpeg',
      byteSize: 1234,
      imageWidth: 1200,
      imageHeight: 1600,
      rotationDegrees: 0,
      uploadedAt: '2026-07-31T00:00:00Z',
      warnings: [],
    }],
  }
}

describe('AI Order Review workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getAiOrderReview.mockResolvedValue(reviewFixture())
    api.getAiOrderImport.mockResolvedValue(intakeFixture())
    api.saveAiOrderReview.mockImplementation(async () => ({
      ...reviewFixture(),
      status: 'Draft',
      currentRevision: 3,
    }))
  })

  it('renders source, structured order, issues, candidates, rows and disabled confirmation', async () => {
    const { container } = render(<AiOrderReviewWorkspace importId="import-1" />)

    expect(await screen.findByRole('heading', { name: 'AI Order Review' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Source documents' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Product groups' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Issues' })).toBeInTheDocument()
    expect(screen.getByText('Classic Tee')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Variant' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Confirm Order' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Source' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Order' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Issues/ })).toBeInTheDocument()
    expect(container.querySelector('.overflow-x-auto table')).not.toBeNull()
    expect(container.textContent).not.toContain('raw provider')
    expect(container.textContent).not.toContain('Order created')
    expect(api.sourceContentUrl).toHaveBeenCalledWith('import-1', 'source-1')
  })

  it('highlights a normalized image evidence region when staff opens a source reference', async () => {
    const user = userEvent.setup()
    render(<AiOrderReviewWorkspace importId="import-1" />)
    await screen.findByDisplayValue('Aroha')

    await user.click(screen.getAllByRole('button', { name: 'View source' })[0])

    const region = screen.getByLabelText('Referenced source region')
    expect(region).toHaveStyle({
      left: '10%',
      top: '20%',
      width: '30%',
      height: '10%',
    })
    expect(screen.getByText(/Referenced region highlighted/)).toBeInTheDocument()
  })

  it('selects a candidate explicitly and exposes only compatible variant options', async () => {
    const user = userEvent.setup()
    render(<AiOrderReviewWorkspace importId="import-1" />)
    await screen.findByText('Classic Tee')

    await user.click(screen.getByRole('button', { name: 'Select' }))

    expect(screen.getByText('Garment · GarmentPrint')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'TEE-BLK-M · Black · M' })).toBeInTheDocument()
  })

  it('exposes explicit ad-hoc acknowledgement and confirmation control', async () => {
    const user = userEvent.setup()
    render(<AiOrderReviewWorkspace importId="import-1" />)
    await screen.findByText('Classic Tee')

    await user.click(screen.getByRole('button', { name: 'Use Ad-hoc Product' }))

    expect(screen.getByText(/saved only with this order/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use as Ad-hoc Product' })).toBeDisabled()
    expect(screen.getByText(/No Product, ProductVariant, or SKU is created/i)).toBeInTheDocument()
  })

  it('saves the complete editable document with expected revision and no confirmation fields', async () => {
    const user = userEvent.setup()
    render(<AiOrderReviewWorkspace importId="import-1" />)
    await screen.findByDisplayValue('Aroha')
    await user.clear(screen.getByLabelText('Customer name'))
    await user.type(screen.getByLabelText('Customer name'), 'Aroha R')
    await user.click(screen.getByRole('button', { name: 'Save Draft' }))

    await waitFor(() => expect(api.saveAiOrderReview).toHaveBeenCalledTimes(1))
    const body = api.saveAiOrderReview.mock.calls[0][1]
    expect(body.expectedRevision).toBe(2)
    expect(body.reviewVersion).toBe('ai-order-staff-review-v1')
    expect(body.customer.name.staffValue).toBe('Aroha R')
    expect(body.financials).not.toHaveProperty('balanceDue')
    expect(body).not.toHaveProperty('actorAdminId')
    expect(body).not.toHaveProperty('formalOrderId')
    expect(await screen.findByText(/Draft saved/)).toBeInTheDocument()
  })

  it('preserves local edits and offers reload on a 409 concurrency conflict', async () => {
    const user = userEvent.setup()
    api.saveAiOrderReview.mockRejectedValueOnce(
      new ApiError(409, 'Revision conflict'),
    )
    render(<AiOrderReviewWorkspace importId="import-1" />)
    const name = await screen.findByLabelText('Customer name')
    await user.clear(name)
    await user.type(name, 'Unsaved Local Name')
    await user.click(screen.getByRole('button', { name: 'Save Draft' }))

    expect(await screen.findByText(/changed in another tab/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Unsaved Local Name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload latest' })).toBeInTheDocument()
  })

  it('offers guided issue navigation without permitting a blocking permanent skip', async () => {
    const user = userEvent.setup()
    render(<AiOrderReviewWorkspace importId="import-1" />)
    await screen.findByRole('heading', { name: 'Issues' })

    await user.click(screen.getByRole('button', { name: 'Guided mode' }))

    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open field' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Full form' })).toBeInTheDocument()
  })

  it('accepts a warning only with a written reason', async () => {
    const user = userEvent.setup()
    render(<AiOrderReviewWorkspace importId="import-1" />)
    await screen.findByRole('heading', { name: 'Issues' })
    await user.click(screen.getByRole('button', { name: 'Warning' }))
    const panel = screen.getByRole('complementary', { name: 'Review issues' })
    const accept = within(panel).getByRole('button', { name: 'Accept Warning' })
    expect(accept).toBeDisabled()

    await user.type(
      within(panel).getByLabelText('Reason to accept CUSTOMER_CONTACT_MISSING'),
      'Contact is optional for this Draft',
    )
    expect(accept).toBeEnabled()
  })

  it('keeps confirmation disabled even when readiness preview is true', () => {
    expect(isConfirmationControlDisabled({
      readyToConfirm: true,
      blockingIssueCount: 0,
      catalogueSelectionsCurrent: true,
      message: 'Ready',
      confirmationOwnedBy: 'Jira 10207',
      confirmOrderEnabled: false,
    })).toBe(true)
  })
})
