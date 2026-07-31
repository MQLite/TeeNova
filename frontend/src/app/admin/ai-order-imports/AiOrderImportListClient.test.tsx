import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiOrderImportListClient } from './AiOrderImportListClient'

const dependencies = vi.hoisted(() => ({
  createAiOrderImport: vi.fn(),
  listAiOrderImports: vi.fn(),
  getAiOrderOperationsStatus: vi.fn(),
  push: vi.fn(),
}))

vi.mock('@/api/ai-order-imports', () => ({
  createAiOrderImport: dependencies.createAiOrderImport,
  listAiOrderImports: dependencies.listAiOrderImports,
  getAiOrderOperationsStatus: dependencies.getAiOrderOperationsStatus,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: dependencies.push }),
}))

describe('AiOrderImportListClient', () => {
  beforeEach(() => {
    dependencies.listAiOrderImports.mockResolvedValue([])
    dependencies.getAiOrderOperationsStatus.mockResolvedValue({
      features: { intakeEnabled: true },
    })
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('10000000-0000-4000-8000-000000000001')
  })

  it('reuses the same create idempotency request after a lost response', async () => {
    dependencies.createAiOrderImport
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce({ id: 'import-1' })
    const user = userEvent.setup()
    render(<AiOrderImportListClient />)

    const start = await screen.findByRole('button', { name: 'Scan Handwritten Order' })
    await user.click(start)
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
    await user.click(start)

    expect(dependencies.createAiOrderImport).toHaveBeenCalledTimes(2)
    expect(dependencies.createAiOrderImport.mock.calls[0]).toEqual(
      dependencies.createAiOrderImport.mock.calls[1],
    )
    expect(dependencies.push).toHaveBeenCalledWith('/admin/ai-order-imports/import-1')
  })
})
