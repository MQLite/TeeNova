import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { blankWorksheet } from '@/features/reception/worksheet'
import { ApiError } from '@/lib/api-client'
import { recognizeCapture } from '@/features/reception/recognize'
import { useReceptionEstimate } from '@/features/reception/useReceptionEstimate'
import { ReceptionDesk } from './ReceptionDesk'
import { fetchSheet, fetchSheetPdfs, generateSheetPdf, saveSheet, type SavedSheet } from './sheets'

vi.mock('./InkPad', () => ({ InkPad: () => null }))
vi.mock('./GmailArtwork', () => ({ GmailArtwork: () => null }))
vi.mock('@/features/reception/recognize', async original => ({
  ...await original<typeof import('@/features/reception/recognize')>(), recognizeCapture: vi.fn(),
}))
vi.mock('@/features/reception/useReceptionEstimate', () => ({ useReceptionEstimate: vi.fn() }))
vi.mock('./sheets', async original => ({
  ...await original<typeof import('./sheets')>(), fetchQueue: async () => ({ items: [], hasMore: false }),
  fetchSheet: vi.fn(), saveSheet: vi.fn(), fetchSheetPdfs: vi.fn(), generateSheetPdf: vi.fn(),
}))

const saved: SavedSheet = { ...blankWorksheet, id: 'sheet', customer: 'Mina', version: 'v1',
  creationTime: '2026-11-26T00:00:00Z', stage: 'Preparing' }
const pdf = { id: 'pdf', version: 'v1', pages: 2, createdAt: saved.creationTime, isCurrent: true }
const printButton = () => screen.getByRole('button', { name: '打印 / 保存 A4 PDF' })

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(useReceptionEstimate).mockReturnValue({ text: '', printText: '', catalogue: undefined, retry: undefined })
  vi.mocked(fetchSheet).mockResolvedValue(saved)
  vi.mocked(fetchSheetPdfs).mockResolvedValue([])
  vi.mocked(generateSheetPdf).mockResolvedValue(pdf)
  vi.mocked(saveSheet).mockResolvedValue(saved)
})

it.each([false, true])('keeps the frozen quote during live pricing only while pricing inputs are unchanged (%s)', async changePrice => {
  const quoted: SavedSheet = { ...saved, printEstimate: 'NZ$42.00', layout: { title: '工作单', groups: [{ heading: '短袖',
    presentation: 'rows', notes: '', prints: [], rows: [{ colour: 'Black', size: 'M', quantity: 2 }] }] } }
  vi.mocked(fetchSheet).mockResolvedValue(quoted)
  vi.mocked(useReceptionEstimate).mockReturnValue({ text: '正在估价…', printText: '待估价', catalogue: undefined, retry: undefined })
  render(<ReceptionDesk initialSheet={quoted.id} />)
  fireEvent.change(await screen.findByLabelText('客户姓名'), { target: { value: 'Updated customer' } })
  if (changePrice) fireEvent.change(screen.getByLabelText('第1行数量'), { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
  await waitFor(() => expect(saveSheet).toHaveBeenCalledWith(quoted.id, expect.objectContaining({
    printEstimate: changePrice ? '待估价' : quoted.printEstimate,
  }), [], quoted.version, undefined, undefined))
})

function createDraft() {
  render(<ReceptionDesk />)
  fireEvent.click(screen.getByRole('button', { name: '新建接待工单' }))
  fireEvent.click(screen.getByRole('button', { name: '手动填写' }))
  const customer = screen.getByLabelText('客户姓名')
  fireEvent.change(customer, { target: { value: 'Mina' } })
  return customer
}

it('saves the draft once before requesting a PDF for the confirmed version and exposes its private file', async () => {
  let acknowledge!: (value: SavedSheet) => void
  vi.mocked(saveSheet).mockReturnValueOnce(new Promise(resolve => { acknowledge = resolve }))
  createDraft()
  expect(screen.getByText('有未保存修改')).toBeVisible()
  fireEvent.click(printButton())
  fireEvent.click(printButton())
  expect(screen.getByText('保存中')).toBeVisible()
  expect(saveSheet).toHaveBeenCalledTimes(1)
  expect(generateSheetPdf).not.toHaveBeenCalled()
  await act(async () => acknowledge(saved))
  const preview = await screen.findByRole('dialog', { name: '工作单 PDF 预览' })
  expect(generateSheetPdf).toHaveBeenCalledTimes(1)
  expect(generateSheetPdf).toHaveBeenCalledWith('sheet', 'v1')
  const originalUrl = '/api/proxy/api/admin/reception-sheets/sheet/pdfs/pdf'
  expect(within(preview).getByRole('img', { name: '工作单 PDF 第 1 页' })).toHaveAttribute('src', originalUrl + '/pages/1')
  fireEvent.click(within(preview).getByRole('button', { name: '下一页' }))
  const secondPage = within(preview).getByRole('img', { name: '工作单 PDF 第 2 页' })
  expect(secondPage).toHaveAttribute('src', originalUrl + '/pages/2')
  fireEvent.error(secondPage)
  expect(within(preview).getByRole('alert')).toHaveTextContent('预览读取失败')
  fireEvent.click(within(preview).getByRole('button', { name: '重试预览' }))
  expect(within(preview).getByRole('img', { name: '工作单 PDF 第 2 页' })).toBeVisible()
  expect(within(preview).getByRole('link', { name: '打开 PDF 打印' })).toHaveAttribute('href', originalUrl)
  expect(within(preview).getByRole('link', { name: '下载 PDF' })).toHaveAttribute('href', '/api/proxy/api/admin/reception-sheets/sheet/pdfs/pdf?download=true')
})

it.each([new ApiError(409, '版本冲突'), new Error('未收到保存回执')])('keeps the draft and prevents generation when saving fails with $message', async failure => {
  vi.mocked(saveSheet).mockRejectedValueOnce(failure)
  const customer = createDraft()
  fireEvent.click(printButton())
  expect(await screen.findByRole('alert')).toHaveTextContent(failure.message)
  expect(screen.getByText('保存失败')).toBeVisible()
  expect(customer).toHaveValue('Mina')
  expect(generateSheetPdf).not.toHaveBeenCalled()
})

it('keeps later edits dirty and does not start generation for the earlier save snapshot', async () => {
  let acknowledge!: (value: SavedSheet) => void
  vi.mocked(saveSheet).mockReturnValueOnce(new Promise(resolve => { acknowledge = resolve }))
  const customer = createDraft()
  fireEvent.click(printButton())
  expect(customer).toBeEnabled()
  fireEvent.change(customer, { target: { value: 'Later edit' } })
  await act(async () => acknowledge(saved))
  expect(generateSheetPdf).not.toHaveBeenCalled()
  expect(screen.getByText(/有未保存修改$/)).toBeVisible()
  expect(customer).toHaveValue('Later edit')
  expect(screen.getByRole('button', { name: '保存修改' })).toBeEnabled()
})

it('can retry PDF generation separately after the worksheet is saved', async () => {
  vi.mocked(generateSheetPdf).mockRejectedValueOnce(new Error('暂不可用'))
  createDraft()
  fireEvent.click(printButton())
  expect(await screen.findByRole('alert')).toHaveTextContent('工单已保存，PDF 生成失败')
  fireEvent.click(screen.getByRole('button', { name: '重试生成 PDF' }))
  expect(await screen.findByRole('dialog', { name: '工作单 PDF 预览' })).toBeVisible()
  expect(saveSheet).toHaveBeenCalledTimes(1)
  expect(generateSheetPdf).toHaveBeenCalledTimes(2)
})

it('reopens stored files and identifies earlier versions while a newer draft is edited', async () => {
  vi.mocked(fetchSheetPdfs).mockResolvedValue([pdf])
  let finish!: (value: typeof pdf) => void
  vi.mocked(generateSheetPdf).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  render(<ReceptionDesk initialSheet={saved.id} />)
  const customer = await screen.findByLabelText('客户姓名')
  fireEvent.click(screen.getByText(/^工作单 PDF(?:（\d+）)?$/))
  const history = screen.getByRole('region', { name: '工作单 PDF' })
  expect(await within(history).findByText(/当前版本.*2 页/)).toBeVisible()
  fireEvent.click(printButton())
  fireEvent.change(customer, { target: { value: 'Later edit' } })
  await act(async () => finish(pdf))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(within(history).getByText(/旧版.*2 页/)).toBeVisible()
  expect(saveSheet).not.toHaveBeenCalled()
  fireEvent.click(within(history).getByRole('button', { name: '预览 PDF' }))
  expect(await screen.findByRole('dialog', { name: '工作单 PDF 预览' })).toBeVisible()
})

it('keeps a PDF superseded by another operator in history and offers the latest worksheet', async () => {
  vi.mocked(generateSheetPdf).mockResolvedValueOnce({ ...pdf, isCurrent: false })
  render(<ReceptionDesk initialSheet={saved.id} />)
  await screen.findByLabelText('客户姓名')
  fireEvent.click(printButton())
  const reload = await screen.findByRole('button', { name: '重新载入工单' })
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByText(/^工作单 PDF（1）$/))
  const history = screen.getByRole('region', { name: '工作单 PDF' })
  expect(within(history).getByText(/旧版.*2 页/)).toBeVisible()
  fireEvent.click(within(history).getByRole('button', { name: '预览 PDF' }))
  const preview = await screen.findByRole('dialog')
  expect(within(preview).getByText(/旧版.*2 页/)).toBeVisible()
  expect(within(preview).getByRole('img', { name: '工作单 PDF 第 1 页' })).toHaveAttribute('src', '/api/proxy/api/admin/reception-sheets/sheet/pdfs/pdf/pages/1')
  fireEvent.click(within(preview).getByRole('button', { name: '关闭预览' }))
  vi.mocked(fetchSheet).mockResolvedValueOnce({ ...saved, customer: 'Updated by another operator', version: 'v2' })
  fireEvent.click(reload)
  await waitFor(() => expect(screen.getByLabelText('客户姓名')).toHaveValue('Updated by another operator'))
})

it('uses refreshed archive status when a locally generated PDF later becomes old', async () => {
  render(<ReceptionDesk initialSheet={saved.id} />)
  await screen.findByLabelText('客户姓名')
  fireEvent.click(printButton())
  const preview = await screen.findByRole('dialog')
  fireEvent.click(within(preview).getByRole('button', { name: '关闭预览' }))
  fireEvent.click(screen.getByRole('button', { name: '工单总览' }))
  vi.mocked(fetchSheetPdfs).mockResolvedValueOnce([{ ...pdf, isCurrent: false }])
  fireEvent.click(screen.getByRole('button', { name: '核对工作单' }))
  fireEvent.click(screen.getByText(/^工作单 PDF（1）$/))
  const history = screen.getByRole('region', { name: '工作单 PDF' })
  expect(await within(history).findByText(/旧版.*2 页/)).toBeVisible()
})

it('shows live recognition progress and lets the operator keep the original and enter the worksheet manually', async () => {
  let report!: (message: string) => void
  vi.mocked(recognizeCapture).mockImplementation((_capture, _signal, onProgress) => {
    report = onProgress
    return new Promise(() => {})
  })
  render(<ReceptionDesk />)
  fireEvent.click(screen.getByRole('button', { name: '新建接待工单' }))
  fireEvent.click(screen.getByRole('button', { name: '粘贴文字' }))
  fireEvent.change(screen.getByLabelText('客户需求原文'), { target: { value: '黑色短袖三件' } })
  fireEvent.click(screen.getByRole('button', { name: '整理成工作单' }))
  const overlay = screen.getByRole('region', { name: '整理工作单进度' })
  expect(within(overlay).getByRole('status')).toHaveTextContent('准备文字原稿')
  act(() => report('正在上传原稿…'))
  expect(within(overlay).getByRole('status')).toHaveTextContent('正在上传原稿')
  act(() => report('正在识别…'))
  expect(within(overlay).getByRole('status')).toHaveTextContent('正在识别')
  fireEvent.click(within(overlay).getByRole('button', { name: '转为手动填写' }))
  await waitFor(() => expect(screen.queryByRole('region', { name: '整理工作单进度' })).toBeNull())
  expect(screen.getByText('黑色短袖三件')).toBeVisible()
})
