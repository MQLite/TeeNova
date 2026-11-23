import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { blankWorksheet } from '@/features/reception/worksheet'
import { recognizeCapture } from '@/features/reception/recognize'
import { ReceptionDesk } from './ReceptionDesk'
import { fetchSheet, saveSheet } from './sheets'

vi.mock('./InkPad', () => ({ InkPad: () => <div>手写接单纸</div> }))
vi.mock('@/features/reception/photo', () => ({ prepareReceptionPhoto: async (file: File) => file }))
vi.mock('@/features/reception/recognize', () => ({
  recognizeCapture: vi.fn(),
  ensureCaptureSource: async () => ({ importId: 'i', documentId: 'd' }),
}))
vi.mock('@/features/reception/useReceptionEstimate', () => ({
  useReceptionEstimate: () => ({ text: '', printText: '' }),
}))
vi.mock('./sheets', async importOriginal => ({
  ...await importOriginal<typeof import('./sheets')>(),
  fetchQueue: async () => ({ items: [], hasMore: false }), saveSheet: vi.fn(), fetchSheet: vi.fn(),
}))
vi.mock('./ReceptionQueue', () => ({
  ReceptionQueue: ({ active, onOpen, onNew }: { active: boolean; onOpen: (id: string) => void; onNew: () => void }) =>
    active && <><button onClick={onNew}>新建接待工单</button><button onClick={() => onOpen('saved')}>打开已存工单</button></>,
}))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('recognizes the replacement photo, saves its reference, and shows the stored original on reopen', async () => {
  const saved = { ...blankWorksheet, id: 'saved', creationTime: new Date().toISOString(), pickupDate: null,
    customer: 'C', stage: 'Preparing' as const, version: 'v1', sourcePhoto: { importId: 'i', documentId: 'd' } }
  vi.mocked(saveSheet).mockResolvedValue(saved)
  vi.mocked(fetchSheet).mockResolvedValue(saved)
  vi.mocked(recognizeCapture).mockResolvedValue({ ...blankWorksheet, customer: 'C' })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL(file: File) { return 'blob:' + file.name }
    static revokeObjectURL() {}
  })
  render(<ReceptionDesk />)
  expect(screen.getByText('OtahuhuPrintingShop')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '新建接待工单' }))
  const camera = screen.getByLabelText('拍摄接待原稿')
  expect(camera).toHaveAttribute('capture', 'environment')
  fireEvent.change(camera, { target: { files: [new File(['a'], 'first.jpg')] } })
  await screen.findByRole('button', { name: '重新拍照' })
  const replacement = new File(['b'], 'second.jpg')
  fireEvent.change(screen.getByLabelText('选择接待原稿照片'), { target: { files: [replacement] } })
  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:second.jpg'))
  expect(recognizeCapture).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '整理成工作单' }))
  await screen.findByRole('heading', { name: '核对工作单' })
  expect(recognizeCapture).toHaveBeenCalledWith(expect.objectContaining({ file: replacement, method: 'Upload' }), expect.anything(), expect.any(Function))
  fireEvent.click(screen.getByRole('button', { name: '保存到取货列表' }))
  await screen.findByText(/待做好 · 已保存/)
  expect(saveSheet).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({customer:'C'}), [], undefined, saved.sourcePhoto)
  fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: '工单总览' }))
  fireEvent.click(screen.getByRole('button', { name: '打开已存工单' }))
  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', '/api/admin/ai-order-imports/i/documents/d/content'))
})
