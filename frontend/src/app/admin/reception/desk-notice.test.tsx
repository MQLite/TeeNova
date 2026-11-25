import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { adminApiClient } from '@/lib/admin-client'
import { PendingNotice } from './PendingNotice'
import { DeleteSheetButton } from './DeleteSheetButton'
import type { SavedSheet } from './sheets'

vi.mock('@/lib/admin-client', () => ({ adminApiClient: { get: vi.fn(), delete: vi.fn() } }))

it('keeps a dismissed batch quiet on return and announces a new arrival even at the same count', async () => {
  sessionStorage.clear()
  vi.mocked(adminApiClient.get).mockResolvedValue({ count: 1, latest: 7 })
  const first = render(<PendingNotice />)
  await screen.findByText('有 1 份待关联设计稿')
  fireEvent.click(screen.getByRole('button', { name: '关闭待关联设计稿提醒' }))
  first.unmount()
  await act(async () => { render(<PendingNotice />) })
  expect(screen.queryByRole('complementary')).toBeNull()
  vi.mocked(adminApiClient.get).mockResolvedValue({ count: 1, latest: 8 })
  fireEvent.focus(window)
  expect(await screen.findByRole('link', { name: '查看设计稿' })).toHaveAttribute('href', '/admin/reception/pending')
  vi.mocked(adminApiClient.get).mockResolvedValue({ count: 0, latest: 0 })
  await act(async () => { fireEvent.focus(window) })
  expect(screen.queryByRole('complementary')).toBeNull()
})

it('cancels without deleting and sends the displayed record and version only after confirmation', async () => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  const sheet: SavedSheet = { id: '12345678-a', version: 'v1', customer: 'Test client', phone: '',
    stage: 'Ready', instructions: '', pickupDate: null, creationTime: '2026-11-25' }
  const done = vi.fn()
  render(<DeleteSheetButton sheet={sheet} dirty={false} disabled={false} onDeleted={done} />)
  fireEvent.click(screen.getByRole('button', { name: '删除工单' }))
  const dialog = within(screen.getByRole('alertdialog'))
  expect(dialog.getByText('Test client')).toBeVisible()
  fireEvent.click(dialog.getByRole('button', { name: '取消' }))
  expect(adminApiClient.delete).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '删除工单' }))
  vi.mocked(adminApiClient.delete).mockResolvedValue(undefined)
  await act(async () => { fireEvent.click(dialog.getByRole('button', { name: '确认删除' })) })
  expect(adminApiClient.delete).toHaveBeenCalledWith('/api/admin/reception-sheets/12345678-a?version=v1')
  expect(done).toHaveBeenCalledOnce()
})
