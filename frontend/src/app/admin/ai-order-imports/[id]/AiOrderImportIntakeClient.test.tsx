import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiOrderImportIntakeClient } from './AiOrderImportIntakeClient'

const api = vi.hoisted(() => ({
  getAiOrderImport: vi.fn(),
  getAiOrderRecognitionOptions: vi.fn(),
  getAiOrderOperationsStatus: vi.fn(),
  removeAiOrderSource: vi.fn(),
  reorderAiOrderSources: vi.fn(),
  setAiOrderSourceRotation: vi.fn(),
  uploadAiOrderSource: vi.fn(),
  startAiOrderRecognition: vi.fn(),
}))

vi.mock('@/api/ai-order-imports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/ai-order-imports')>()
  return { ...actual, ...api }
})

describe('AiOrderImportIntakeClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getAiOrderRecognitionOptions.mockResolvedValue({
      recognitionEnabled: true,
      providers: [{
        id: 'gemini',
        displayName: 'Google Gemini',
        models: [{
          id: 'gemini-2.5-flash-lite',
          displayName: 'Gemini 2.5 Flash-Lite',
          supportsImages: true,
          supportsPdf: true,
        }],
      }, {
        id: 'openai',
        displayName: 'OpenAI',
        models: [{
          id: 'gpt-5.4-nano',
          displayName: 'GPT-5.4 Nano',
          supportsImages: true,
          supportsPdf: true,
        }],
      }],
    })
    api.getAiOrderOperationsStatus.mockResolvedValue({
      features: {
        enabled: true,
        intakeEnabled: true,
        recognitionEnabled: true,
        reviewEnabled: true,
        confirmationEnabled: false,
        materializationEnabled: false,
      },
    })
    api.startAiOrderRecognition.mockResolvedValue({
      attemptId: 'attempt-1',
      attemptNumber: 1,
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite',
      outcome: 'Processing',
      submittedAt: '2026-07-30T00:02:00Z',
    })
    api.getAiOrderImport.mockResolvedValue({
      id: 'import-1',
      status: 'Uploaded',
      currentRevision: 0,
      creationTime: '2026-07-30T00:00:00Z',
      sourceDocumentCount: 1,
      canModifyDocuments: true,
      canContinueToRecognition: true,
      sourceDocuments: [{
        id: 'document-1',
        sequence: 1,
        captureMethod: 'Camera',
        originalFileName: 'order-front.jpg',
        contentType: 'image/jpeg',
        byteSize: 2048,
        imageWidth: 1600,
        imageHeight: 1200,
        rotationDegrees: 90,
        uploadedAt: '2026-07-30T00:01:00Z',
        warnings: [{
          code: 'IMAGE_EXTREMELY_DARK',
          message: 'This image appears extremely dark.',
        }],
      }],
    })
  })

  it('offers camera, normal files, and only server-approved recognition options', async () => {
    render(<AiOrderImportIntakeClient importId="import-1" />)

    const camera = await screen.findByLabelText('Take a photo of an order page')
    expect(camera).toHaveAttribute('type', 'file')
    expect(camera).toHaveAttribute('capture', 'environment')
    expect(camera).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')

    const normalSelection = screen.getByLabelText('Select order images or PDFs')
    expect(normalSelection).toHaveAttribute('multiple')
    expect(normalSelection).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/webp,application/pdf',
    )

    expect(screen.getByText('This image appears extremely dark.')).toBeVisible()
    expect(screen.getByAltText('')).toHaveAttribute(
      'src',
      '/api/admin/ai-order-imports/import-1/documents/document-1/content',
    )
    expect(screen.getByRole('combobox', { name: 'Recognition provider' })).toHaveValue('gemini')
    expect(screen.getByRole('combobox', { name: 'Recognition model' }))
      .toHaveValue('gemini-2.5-flash-lite')
    expect(screen.getByRole('button', { name: 'Start AI recognition' })).toBeEnabled()
    expect(screen.getByText(/choose an approved recognition provider/)).toBeVisible()
  })

  it('submits exactly the selected provider and model without automatic fallback', async () => {
    const user = userEvent.setup()
    render(<AiOrderImportIntakeClient importId="import-1" />)

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Recognition provider' }),
      'openai',
    )
    expect(screen.getByRole('combobox', { name: 'Recognition model' })).toHaveValue('gpt-5.4-nano')
    await user.click(screen.getByRole('button', { name: 'Start AI recognition' }))

    expect(api.startAiOrderRecognition).toHaveBeenCalledTimes(1)
    expect(api.startAiOrderRecognition).toHaveBeenCalledWith(
      'import-1',
      'openai',
      'gpt-5.4-nano',
      expect.stringMatching(/^recognition-/),
      false,
    )
  })

  it('restores durable processing state after a page refresh without resubmitting', async () => {
    api.getAiOrderImport.mockResolvedValueOnce({
      id: 'import-1',
      status: 'Processing',
      currentRevision: 0,
      creationTime: '2026-07-30T00:00:00Z',
      sourceDocumentCount: 1,
      canModifyDocuments: false,
      canContinueToRecognition: false,
      recognition: {
        attemptId: 'attempt-1',
        attemptNumber: 1,
        provider: 'gemini',
        model: 'gemini-2.5-flash-lite',
        outcome: 'Processing',
        submittedAt: '2026-07-30T00:02:00Z',
      },
      sourceDocuments: [],
    })
    render(<AiOrderImportIntakeClient importId="import-1" />)

    expect(await screen.findByText(/continues safely if you leave or refresh/)).toBeVisible()
    expect(screen.getByText(/Attempt 1: gemini \/ gemini-2.5-flash-lite/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Recognition processing…' })).toBeDisabled()
    expect(api.startAiOrderRecognition).not.toHaveBeenCalled()
  })

  it('shows a deliberate retry choice after failure', async () => {
    api.getAiOrderImport.mockResolvedValueOnce({
      id: 'import-1',
      status: 'Failed',
      currentRevision: 0,
      creationTime: '2026-07-30T00:00:00Z',
      sourceDocumentCount: 1,
      canModifyDocuments: false,
      canContinueToRecognition: false,
      recognition: {
        attemptId: 'attempt-1',
        attemptNumber: 1,
        provider: 'gemini',
        model: 'gemini-2.5-flash-lite',
        outcome: 'RetryableFailure',
        submittedAt: '2026-07-30T00:02:00Z',
        completedAt: '2026-07-30T00:03:00Z',
        safeErrorCode: 'RecognitionProviderRateLimited',
        isRetryable: true,
      },
      sourceDocuments: [],
    })
    render(<AiOrderImportIntakeClient importId="import-1" />)

    expect(await screen.findByRole('button', { name: 'Retry recognition' })).toBeEnabled()
    expect(screen.getByRole('combobox', { name: 'Recognition provider' })).toBeVisible()
    expect(api.startAiOrderRecognition).not.toHaveBeenCalled()
  })

  it('exposes preview, rotation, ordering, replacement, and removal controls', async () => {
    render(<AiOrderImportIntakeClient importId="import-1" />)

    await screen.findByText('order-front.jpg')
    expect(screen.getAllByRole('button', { name: 'Preview' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Rotate' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Down' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Replace' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled()
  })
})
