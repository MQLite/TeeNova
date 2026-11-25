import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { adminApiClient } from '@/lib/admin-client'
import { GmailArtwork } from './GmailArtwork'
import { PendingGmailArtwork } from './PendingGmailArtwork'

vi.mock('@/lib/admin-client', () => ({ adminApiClient: { get: vi.fn() } }))
const file = { id: 'file-a', name: 'front.pdf', mime: 'application/pdf' }

it('opens the pending collection immediately and shows the actual attachment thumbnail', async () => {
  vi.mocked(adminApiClient.get).mockResolvedValue([{ ...file, sender: 'desk@example.test', subject: 'Artwork', received: '2026-11-25T00:00:00Z' }])
  render(<PendingGmailArtwork onOpen={() => {}} />)
  const image = await screen.findByAltText('front.pdf 缩略图')
  expect(image.getAttribute('src')).toContain('/pending/file-a/thumbnail')
  expect(screen.getByRole('button', { name: '关联已有工单' })).toBeVisible()
})

it('opens the linked artwork preview and keeps the original PDF accessible', async () => {
  vi.mocked(adminApiClient.get).mockResolvedValue([file])
  render(<GmailArtwork sheetId="sheet-a" />)
  fireEvent.click(await screen.findByRole('button', { name: '预览 front.pdf' }))
  const preview = within(screen.getByRole('dialog'))
  expect(preview.getByAltText('front.pdf 预览图').getAttribute('src')).toContain('/sheets/sheet-a/attachments/file-a/preview')
  expect(preview.getByRole('link', { name: '打开原文件' })).toHaveAttribute('href', '/api/proxy/api/gmail-reception/sheets/sheet-a/attachments/file-a')
  fireEvent.click(preview.getByRole('button', { name: '关闭预览' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
