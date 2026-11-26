import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-client'
import { blankWorksheet } from '@/features/reception/worksheet'
import { ReceptionDesk } from './ReceptionDesk'
import { fetchSheet, saveSheet } from './sheets'

vi.mock('./InkPad', () => ({ InkPad: () => null }))
vi.mock('./sheets', async original => ({
  ...await original<typeof import('./sheets')>(),
  fetchQueue: async () => ({ items: [], hasMore: false }), fetchSheet: vi.fn(), saveSheet: vi.fn(),
}))

it('recovers the first save by its original ID and preserves subsequent edits until explicitly saved', async () => {
  vi.mocked(saveSheet).mockRejectedValueOnce(new Error('未收到保存回执'))
    .mockRejectedValueOnce(new ApiError(409, '版本冲突'))
  render(<ReceptionDesk />)
  fireEvent.click(screen.getByRole('button', { name: '新建接待工单' }))
  fireEvent.click(screen.getByRole('button', { name: '手动填写' }))
  const name = screen.getByRole('textbox', { name: '客户姓名' })
  fireEvent.change(name, { target: { value: '第一次保存' } })
  fireEvent.click(screen.getByRole('button', { name: '保存到取货列表' }))
  await screen.findByText('未收到保存回执')
  const [id] = vi.mocked(saveSheet).mock.calls[0]
  const saved = { ...blankWorksheet, id, customer: '第一次保存', version: 'v1', pickupDate: null,
    creationTime: '2026-11-24T03:00:00Z', stage: 'Preparing' as const }
  vi.mocked(fetchSheet).mockRejectedValueOnce(new Error('连接中断')).mockResolvedValue(saved)
  fireEvent.change(name, { target: { value: '后续修改' } })
  fireEvent.click(screen.getByRole('button', { name: '保存到取货列表' }))
  fireEvent.click(await screen.findByRole('button', { name: '找回已保存工单' }))
  await screen.findByText(/连接中断/)
  fireEvent.click(screen.getByRole('button', { name: '找回已保存工单' }))
  const comparison = await screen.findByRole('region', { name: '服务器已保存版本' })
  expect(within(comparison).getByText('第一次保存')).toBeVisible()
  expect(name).toHaveValue('后续修改')
  expect(fetchSheet).toHaveBeenLastCalledWith(id)
  expect(saveSheet).toHaveBeenCalledTimes(2)
  fireEvent.click(within(comparison).getByRole('button', { name: '保留本地修改，继续编辑' }))
  expect(name).toHaveValue('后续修改')
  vi.mocked(saveSheet).mockResolvedValue({ ...saved, customer: '后续修改', version: 'v2' })
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
  await screen.findByText(/已保存$/)
  expect(saveSheet).toHaveBeenLastCalledWith(id, expect.objectContaining({ customer: '后续修改' }), [], 'v1', undefined, undefined)
})
