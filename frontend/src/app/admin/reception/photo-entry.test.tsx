import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { blankWorksheet } from '@/features/reception/worksheet'
import { recognizeCapture } from '@/features/reception/recognize'
import { ReceptionDesk } from './ReceptionDesk'
import { fetchSheet, saveSheet } from './sheets'

vi.mock('./InkPad', () => ({ InkPad: ({ onChange }: Pick<Parameters<typeof import('./InkPad').InkPad>[0], 'onChange'>) =>
  <canvas aria-label="手写接单纸" onClick={event => onChange(event.currentTarget, true, [{ erase: false, points: [{ x: 1, y: 2 }] }])}/> }))
vi.mock('@/features/reception/photo', () => ({ prepareReceptionPhoto: async (file: File) => file }))
vi.mock('@/features/reception/recognize', async original => ({
  ...await original<typeof import('@/features/reception/recognize')>(),
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

const savedPhotoSheet = { ...blankWorksheet, id: 'saved', creationTime: '2026-11-24T01:00:00Z',
  stage: 'Preparing' as const, version: 'v1', sourcePhoto: { importId: 'i', documentId: 'd' },
  customer: '店内姓名', phone: '021234', pickupDate: '2026-12-02', deposit: 10 }

function beginText() {
  render(<ReceptionDesk />)
  fireEvent.click(screen.getByRole('button', { name: '新建接待工单' }))
  fireEvent.click(screen.getByRole('button', { name: '粘贴文字' }))
  return screen.getByRole('textbox', { name: '客户需求原文' })
}

it('retains oversized paste and measures the boundary in UTF-16 code units', () => {
  const input = beginText()
  const submit = screen.getByRole('button', { name: '整理成工作单' })
  fireEvent.change(input, { target: { value: ' \n\t ' } })
  expect(submit).toBeDisabled()
  expect(screen.getByText('请填写文字原稿后保存。')).toBeVisible()
  const limit = '🧵'.repeat(10_000)
  fireEvent.change(input, { target: { value: limit } })
  expect(submit).toBeEnabled()
  fireEvent.change(input, { target: { value: limit + 'a' } })
  expect(input).toHaveValue(limit + 'a')
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(submit).toBeDisabled()
  expect(screen.getByRole('button', { name: '保存工单' })).toBeDisabled()
  expect(recognizeCapture).not.toHaveBeenCalled()
})

it('retries the unchanged text, ignores a superseded result, and saves the current original separately', async () => {
  const first = '黑T\tM\t8 件\n左胸印标'
  const revised = first + '\n更正：M 改为 10 件。订金 NZ$50'
  let finish!: (value: typeof blankWorksheet) => void
  vi.mocked(recognizeCapture).mockRejectedValueOnce(new Error('识别超时'))
    .mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    .mockResolvedValueOnce({ ...blankWorksheet, deposit: 50 })
  const input = beginText()
  fireEvent.change(input, { target: { value: first } })
  const submit = screen.getByRole('button', { name: '整理成工作单' })
  fireEvent.click(submit)
  expect(await screen.findByRole('alert')).toHaveTextContent('识别超时')
  expect(input).toHaveValue(first)
  fireEvent.click(submit)
  expect(vi.mocked(recognizeCapture).mock.calls[1][0]).toBe(vi.mocked(recognizeCapture).mock.calls[0][0])
  expect(input).toBeEnabled()
  fireEvent.change(input, { target: { value: revised } })
  await act(async () => finish({ ...blankWorksheet, customer: '旧版本' }))
  expect(input).toBeVisible()
  fireEvent.click(submit)
  await screen.findByRole('heading', { name: '核对工作单' })
  expect(screen.getByLabelText('客户姓名')).toHaveValue('')
  expect(screen.getByRole('textbox', { name: '订金（NZD）' })).toHaveValue('50.00')
  expect(document.querySelector('pre')?.textContent).toBe(revised)
  const calls = vi.mocked(recognizeCapture).mock.calls
  expect(calls[2][0].key).not.toBe(calls[0][0].key)
  expect(calls[2][0]).toMatchObject({ text: revised })
  vi.mocked(saveSheet).mockResolvedValue(savedPhotoSheet)
  fireEvent.click(screen.getByRole('button', { name: '保存到取货列表' }))
  await screen.findByText(/待做好 · 已保存/)
  expect(saveSheet).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ deposit: 50 }), [], undefined,
    undefined, { importId: 'i', documentId: 'd' })
})

it('preserves both stored references when text cannot load and retries its private content URL', async () => {
  const sourceText = { importId: 'text-import', documentId: 'text-document' }
  const saved = { ...savedPhotoSheet, sourceText }
  vi.mocked(fetchSheet).mockResolvedValue(saved)
  vi.mocked(saveSheet).mockResolvedValue({ ...saved, version: 'v2' })
  let tries = 0
  const url = '/api/admin/ai-order-imports/text-import/documents/text-document/content'
  const original = '邮件订单\n颜色\t尺码\t数量\n蓝\tXL\t3'
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    if (input === url) return ++tries === 1 ? new Response(null, { status: 410 }) : new Response(original)
    return Response.json({ items: [] })
  }))
  render(<ReceptionDesk initialSheet="saved" />)
  const retry = await screen.findByRole('button', { name: '重新读取原文' })
  fireEvent.change(screen.getByLabelText('客户姓名'), { target: { value: '更新姓名' } })
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
  await screen.findByText(/待做好 · 已保存/)
  expect(saveSheet).toHaveBeenLastCalledWith('saved', expect.objectContaining({ customer: '更新姓名' }), [], 'v1',
    saved.sourcePhoto, sourceText)
  fireEvent.click(retry)
  await waitFor(() => expect(document.querySelector('pre')?.textContent).toBe(original))
  expect(screen.getByRole('img', { name: '当前工作单的接待原稿照片' })).toBeVisible()
  expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled()
})

it('replaces the phone from the latest pasted text without a field review', async () => {
  const input = beginText()
  const text = '订单邮件\n短袖\t黑\tM\t10\n连帽衫\t蓝\tS\t4\n电话改为 021111'
  fireEvent.change(input, { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: '手动填写' }))
  fireEvent.change(screen.getByLabelText('联系电话'), { target: { value: '021000' } })
  fireEvent.click(screen.getByRole('button', { name: '编辑原文' }))
  vi.mocked(recognizeCapture).mockResolvedValueOnce({ ...blankWorksheet, phone: '021111' })
  fireEvent.click(screen.getByRole('button', { name: '重新识别并覆盖工单' }))
  expect(await screen.findByLabelText('联系电话')).toHaveValue('021111')
  expect(document.querySelector('pre')?.textContent).toBe(text)
  expect(screen.queryByRole('button', {name: '应用核对结果'})).toBeNull()
})

it('saves revised text to the same order and keeps that version if another recognition fails', async () => {
  const saved = { ...savedPhotoSheet, sourceText: { importId: 'text-import', documentId: 'text-document' } }
  const latest = { ...blankWorksheet, customer: '李女士', instructions: '黑色 M 码两件' }
  vi.mocked(fetchSheet).mockResolvedValue(saved)
  vi.mocked(saveSheet).mockResolvedValue({ ...saved, ...latest, version: 'v2' })
  vi.mocked(recognizeCapture).mockResolvedValueOnce(latest).mockRejectedValueOnce(new Error('识别超时'))
  vi.stubGlobal('fetch', vi.fn(async () => new Response('原订单：黑色 M 码一件')))
  render(<ReceptionDesk initialSheet="saved" />)
  fireEvent.click(await screen.findByRole('button', { name: '编辑原文' }))
  const input = await screen.findByLabelText('客户需求原文')
  fireEvent.change(input, { target: { value: '李女士：更正为黑色 M 码两件' } })
  fireEvent.click(screen.getByRole('button', { name: '重新识别并覆盖工单' }))
  await waitFor(() => expect(saveSheet).toHaveBeenCalledWith(saved.id, expect.objectContaining({ ...latest, payments: [] }),
    [], saved.version, saved.sourcePhoto, { importId: 'i', documentId: 'd' }))
  fireEvent.click(screen.getByRole('button', { name: '编辑原文' }))
  fireEvent.click(screen.getByRole('button', { name: '重新识别并覆盖工单' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('识别超时')
  fireEvent.click(screen.getByRole('button', { name: '核对工作单' }))
  expect(screen.getByLabelText('客户姓名')).toHaveValue(latest.customer)
  expect(saveSheet).toHaveBeenCalledTimes(1)
})

it('lets staff clear a previously recognized pickup date after the customer withdraws it', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(recognizeCapture)
    .mockResolvedValueOnce({ ...blankWorksheet, pickupDate: '2026-11-28' })
    .mockResolvedValueOnce({ ...blankWorksheet, instructions: '周末取，日期再定' })
  const input = beginText()
  fireEvent.change(input, { target: { value: '11月28日取。' } })
  fireEvent.click(screen.getByRole('button', { name: '整理成工作单' }))
  expect(await screen.findByLabelText('预计可取日期')).toHaveValue('2026-11-28')
  fireEvent.click(screen.getByRole('button', { name: '编辑原文' }))
  fireEvent.change(screen.getByLabelText('客户需求原文'), { target: { value: '更正：周末取，日期再定。' } })
  fireEvent.click(screen.getByRole('button', { name: '重新识别并覆盖工单' }))
  expect(await screen.findByLabelText('预计可取日期')).toHaveValue('')
  expect(screen.getByLabelText('制作说明')).toHaveValue('周末取，日期再定')
})

it('rechecks retention when reopening the same worksheet after previously viewing its original', async () => {
  const saved = { ...savedPhotoSheet, sourceText: { importId: 'i', documentId: 'text' } }
  vi.mocked(fetchSheet).mockResolvedValue(saved)
  let expired = false
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    if (input.endsWith('/text/content')) return expired ? new Response(null, { status: 410 }) : new Response('original')
    return Response.json({ items: [] })
  }))
  render(<ReceptionDesk initialSheet="saved" />)
  await waitFor(() => expect(document.querySelector('pre')?.textContent).toBe('original'))
  expired = true
  fireEvent.click(screen.getByRole('button', { name: '工单总览' }))
  fireEvent.click(screen.getByRole('button', { name: '打开已存工单' }))
  expect(await screen.findByRole('button', { name: '重新读取原文' })).toBeEnabled()
  expect(document.querySelector('pre')).toBeNull()
})

it('lets staff replace an expired original explicitly, or discard the replacement before saving', async () => {
  const saved = { ...savedPhotoSheet, sourceText: { importId: 'expired', documentId: 't' } }
  vi.mocked(fetchSheet).mockResolvedValue(saved)
  vi.mocked(saveSheet).mockResolvedValue(saved)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 410 })))
  render(<ReceptionDesk initialSheet="saved" />)
  fireEvent.click(await screen.findByRole('button', { name: '编辑原文' }))
  fireEvent.click(await screen.findByRole('button', { name: '粘贴替换原文' }))
  const input = screen.getByRole('textbox', { name: '客户需求原文' })
  expect(input).toHaveValue('')
  expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled()
  fireEvent.change(input, { target: { value: 'a'.repeat(20_001) } })
  fireEvent.click(screen.getByRole('button', { name: '恢复已保存的原文' }))
  fireEvent.click(await screen.findByRole('button', { name: '粘贴替换原文' }))
  fireEvent.change(screen.getByRole('textbox', { name: '客户需求原文' }), { target: { value: '客户再次发送的原文' } })
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
  await waitFor(() => expect(saveSheet).toHaveBeenCalled())
  expect(vi.mocked(saveSheet).mock.lastCall?.slice(-2)).toEqual([saved.sourcePhoto, { importId: 'i', documentId: 'd' }])
})

it('ignores recognition from the prior draft when navigation opens a different worksheet', async () => {
  const { rerender } = render(<ReceptionDesk/>)
  fireEvent.click(screen.getByRole('button', { name: '新建接待工单' }))
  fireEvent.click(screen.getByRole('button', { name: '粘贴文字' }))
  fireEvent.change(screen.getByRole('textbox', { name: '客户需求原文' }), { target: { value: '旧工单' } })
  let finish!: (value: typeof blankWorksheet) => void
  vi.mocked(recognizeCapture).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  fireEvent.click(screen.getByRole('button', { name: '整理成工作单' }))
  vi.mocked(fetchSheet).mockResolvedValue(savedPhotoSheet)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  rerender(<ReceptionDesk initialSheet="saved"/>)
  const customer = await screen.findByRole('textbox', { name: '客户姓名' })
  expect(customer).toHaveValue(savedPhotoSheet.customer)
  await act(async () => finish({ ...blankWorksheet, customer: '旧工单' }))
  expect(customer).toHaveValue(savedPhotoSheet.customer)
  expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled()
})

it('overwrites the saved photo order using its existing version and source', async () => {
  vi.mocked(fetchSheet).mockResolvedValue(savedPhotoSheet)
  vi.mocked(saveSheet).mockResolvedValue({...savedPhotoSheet, version: 'v2'})
  const next = {...blankWorksheet, customer: '原稿姓名', instructions: '周三取件', totalPrice: 100, deposit: 0}
  vi.mocked(recognizeCapture).mockResolvedValue(next)
  render(<ReceptionDesk initialSheet="saved"/>)
  fireEvent.click(await screen.findByRole('button', {name: '更换原稿'}))
  fireEvent.click(screen.getByRole('button', {name: '重新识别并覆盖工单'}))
  expect(await screen.findByDisplayValue('原稿姓名')).toBeVisible()
  expect(screen.getByLabelText('联系电话')).toHaveValue('')
  await waitFor(() => expect(saveSheet).toHaveBeenCalledWith('saved', expect.objectContaining({...next, payments: []}),
    [], 'v1', savedPhotoSheet.sourcePhoto, undefined))
})

it('reviews replacement payment marks, edits the amount and saves once per payment', async () => {
  const saved = { ...savedPhotoSheet, payments: [{ amount: 20, method: 'Cash' as const }] }
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(fetchSheet).mockResolvedValue(saved)
  vi.mocked(recognizeCapture).mockResolvedValue({ ...blankWorksheet,
    payments: [{ amount: 20, method: 'EFTPOS' }, { amount: 15, method: 'Transfer' }] })
  vi.mocked(saveSheet).mockResolvedValue({ ...saved, version: 'v2' })
  render(<ReceptionDesk initialSheet="saved"/>)
  expect(await screen.findByRole('combobox', { name: /第 1 笔付款方式/ })).toHaveValue('Cash')
  fireEvent.click(screen.getByRole('button', { name: '更换原稿' }))
  fireEvent.click(screen.getByRole('button', { name: '重新识别并覆盖工单' }))
  await screen.findByRole('textbox', {name: '第 2 笔实付金额（NZD）'})
  await waitFor(() => expect(screen.getByRole('button', {name: '保存修改'})).toBeDisabled())
  fireEvent.change(screen.getByRole('textbox', { name: '第 2 笔实付金额（NZD）' }), { target: { value: '15.25' } })
  fireEvent.click(screen.getByRole('button', { name: '添加已付款项' }))
  expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '移除第 3 笔付款' }))
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
  await waitFor(() => expect(saveSheet).toHaveBeenCalledWith('saved', expect.objectContaining({
    payments: [{ amount: 20, method: 'EFTPOS' }, { amount: 15.25, method: 'Transfer' }],
  }), [], 'v2', saved.sourcePhoto, undefined))
})

it('re-recognizes the current handwriting and saves its replacement on the same order without field review', async () => {
  const handwriting = 'data:image/png;base64,AA=='
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(handwriting)
  let ink = 'ink'
  const snapshot = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob([ink])))
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const original = {...savedPhotoSheet, sourcePhoto: undefined, handwriting: [{erase: false, points: [{x: 4, y: 8}]}],
    layout: {title: '旧清单', groups: []}, payments: [{amount: 12, method: 'Cash' as const}]}
  vi.mocked(fetchSheet).mockResolvedValue(original)
  const latest = {...blankWorksheet, customer: '原稿新姓名', instructions: '改用蓝色', totalPrice: 0,
    layout: {title: '新版清单', groups: []}}
  vi.mocked(recognizeCapture).mockReset()
    .mockResolvedValueOnce({...blankWorksheet, customer: '第一次识别'})
    .mockRejectedValueOnce(new Error('识别超时'))
    .mockResolvedValueOnce(latest)
  const save = vi.mocked(saveSheet).mockReset().mockImplementation(async (id, sheet, strokes, version) => {
    const stored = {...original, id, customer: sheet.customer, phone: sheet.phone, pickupDate: sheet.pickupDate,
      instructions: sheet.instructions, layout: sheet.layout, deposit: sheet.deposit, totalPrice: sheet.totalPrice,
      payments: sheet.payments, handwriting: strokes, version: version === 'v1' ? 'v2' : 'v3'}
    vi.mocked(fetchSheet).mockResolvedValue(stored)
    return stored
  })
  render(<ReceptionDesk />)
  fireEvent.click(screen.getByRole('button', { name: '打开已存工单' }))
  fireEvent.click(await screen.findByRole('button', { name: '编辑手稿' }))
  fireEvent.click(screen.getByLabelText('手写接单纸'))
  const recognize = () => fireEvent.click(screen.getByRole('button', { name: /整理成工作单|重新识别并覆盖工单/ }))
  recognize()
  expect(await screen.findByDisplayValue('第一次识别')).toBeVisible()
  expect(screen.queryByRole('button', {name: '应用核对结果'})).toBeNull()
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: '编辑手稿' }))
  recognize()
  expect(await screen.findByRole('alert')).toHaveTextContent('识别超时')
  expect(save).toHaveBeenCalledTimes(1)
  expect(snapshot).toHaveBeenCalledTimes(2)
  const calls = vi.mocked(recognizeCapture).mock.calls
  expect(calls[1][0].key).not.toBe(calls[0][0].key)
  fireEvent.click(screen.getByRole('button', {name: '核对工作单'}))
  expect(screen.getByLabelText('客户姓名')).toHaveValue('第一次识别')
  fireEvent.click(screen.getByRole('button', {name: '编辑手稿'}))
  ink = 'corrected ink'
  fireEvent.click(screen.getByLabelText('手写接单纸'))
  recognize()
  expect(await screen.findByDisplayValue(latest.customer)).toBeVisible()
  expect(confirm).not.toHaveBeenCalled()
  expect(snapshot).toHaveBeenCalledTimes(3)
  expect(calls[2][0].key).not.toBe(calls[1][0].key)
  expect(calls[2][0].file?.size).toBe(new Blob([ink]).size)
  await waitFor(() => expect(save).toHaveBeenLastCalledWith(original.id,
    expect.objectContaining({...latest, payments: []}), [{erase: false, points: [{x: 1, y: 2}]}], 'v2', undefined, undefined))
  expect(save).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', {name: '工单总览'}))
  fireEvent.click(screen.getByRole('button', {name: '打开已存工单'}))
  expect(await screen.findByDisplayValue(latest.customer)).toBeVisible()
  expect(screen.getByLabelText('联系电话')).toHaveValue('')
  expect(screen.getByLabelText('工作单标题')).toHaveValue('新版清单')
  expect(screen.queryByLabelText('第 1 笔实付金额（NZD）')).toBeNull()
})

it('keeps a new handwritten order as a draft until its first save', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AA==')
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['ink'])))
  vi.mocked(recognizeCapture).mockResolvedValueOnce({...blankWorksheet, customer: '新客户'})
  const save = vi.mocked(saveSheet).mockClear()
  render(<ReceptionDesk/>)
  fireEvent.click(screen.getByRole('button', {name: '新建接待工单'}))
  fireEvent.click(screen.getByLabelText('手写接单纸'))
  fireEvent.click(screen.getByRole('button', {name: '整理成工作单'}))
  expect(await screen.findByDisplayValue('新客户')).toBeVisible()
  expect(screen.getByRole('button', {name: '保存到取货列表'})).toBeEnabled()
  expect(save).not.toHaveBeenCalled()
})

it('retries the stored photo in both views without replacing its source or dirtying the sheet', async () => {
  vi.mocked(fetchSheet).mockResolvedValue(savedPhotoSheet)
  render(<ReceptionDesk />)
  fireEvent.click(screen.getByRole('button', { name: '打开已存工单' }))
  const original = '/api/admin/ai-order-imports/i/documents/d/content'
  for (const tab of ['核对工作单', '接单录入']) {
    await screen.findByRole('img')
    fireEvent.click(screen.getByRole('button', { name: tab }))
    fireEvent.error(screen.getByRole('img'))
    fireEvent.click(screen.getByRole('button', { name: '重试加载' }))
    expect(new URL((screen.getByRole('img') as HTMLImageElement).src).pathname).toBe(original)
    expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled()
  }
})

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
  expect(saveSheet).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({customer:'C'}), [], undefined, saved.sourcePhoto, undefined)
  fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: '工单总览' }))
  fireEvent.click(screen.getByRole('button', { name: '打开已存工单' }))
  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', '/api/admin/ai-order-imports/i/documents/d/content'))
})

it('explains blocked actions on both tabs when editing a saved photo worksheet', async () => {
  const group = { heading: '短袖', presentation: 'rows' as const, notes: '', rows: [] }
  vi.mocked(fetchSheet).mockResolvedValue({ ...blankWorksheet, id: 'saved', pickupDate: null,
    creationTime: new Date().toISOString(), stage: 'Preparing', version: 'v1',
    sourcePhoto: { importId: 'i', documentId: 'd' },
    layout: { title: '门店订单', groups: [group, { ...group, heading: '童装' }] } })
  render(<ReceptionDesk />)
  fireEvent.click(screen.getByRole('button', { name: '打开已存工单' }))
  const title = await screen.findByRole('textbox', { name: '工作单标题' })
  const groups = screen.getAllByRole('textbox', { name: '服装分组' })
  fireEvent.change(title, { target: { value: ' ' } })
  fireEvent.change(groups[1], { target: { value: '' } })
  expect(title).toHaveAttribute('aria-invalid', 'true')
  expect(groups[1]).toHaveAttribute('aria-invalid', 'true')
  expect(groups[0]).toBeValid()
  expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled()
  expect(screen.getByRole('button', { name: /打印/ })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent(/工作单标题.*第 2 个服装分组/)
  fireEvent.click(screen.getByRole('button', { name: '接单录入' }))
  expect(screen.getByRole('status')).toHaveTextContent(/核对工作单.*第 2 个服装分组/)
  fireEvent.click(screen.getByRole('button', { name: '核对工作单' }))
  fireEvent.change(screen.getByRole('textbox', { name: '工作单标题' }), { target: { value: '新标题' } })
  fireEvent.change(screen.getAllByRole('textbox', { name: '服装分组' })[1], { target: { value: '童装' } })
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByRole('button', { name: '保存修改' })).toBeEnabled()
  expect(screen.getByRole('button', { name: /打印/ })).toBeEnabled()
})
