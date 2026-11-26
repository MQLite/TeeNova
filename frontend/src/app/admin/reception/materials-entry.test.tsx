import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { blankWorksheet } from '@/features/reception/worksheet'
import { ensureMaterialSources, fallbackMaterialLimits, fetchMaterialLimits, recognizeMaterials, type MaterialsResult } from '@/features/reception/materials'
import { ReceptionDesk } from './ReceptionDesk'
import { fetchSheet, saveSheet, type SavedSheet } from './sheets'

vi.mock('./InkPad', () => ({ InkPad: () => null }))
vi.mock('./GmailArtwork', () => ({ GmailArtwork: () => null }))
vi.mock('@/features/reception/useReceptionEstimate', () => ({ useReceptionEstimate: () => ({ text: '', printText: '' }) }))
vi.mock('@/features/reception/materials', async original => ({
  ...await original<typeof import('@/features/reception/materials')>(),
  ensureMaterialSources: vi.fn(), recognizeMaterials: vi.fn(), fetchMaterialLimits: vi.fn(),
}))
vi.mock('./sheets', async original => ({
  ...await original<typeof import('./sheets')>(), fetchQueue: async () => ({ items: [], hasMore: false }),
  fetchSheet: vi.fn(), saveSheet: vi.fn(), fetchSheetPdfs: async () => [],
}))

const source = { importId: 'import', documentIds: ['size'], description: 'M 改为 10' }
const saved: SavedSheet = { ...blankWorksheet, id: 'sheet', customer: 'Mina', version: 'v1', stage: 'Preparing',
  creationTime: '2026-11-26T01:00:00Z', materials: { ...source,
    files: [{ id: 'size', name: '尺码.csv', contentType: 'text/csv', expired: false }] } }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(fetchMaterialLimits).mockResolvedValue(fallbackMaterialLimits)
  vi.mocked(ensureMaterialSources).mockResolvedValue(source)
  vi.mocked(saveSheet).mockResolvedValue(saved)
  vi.mocked(fetchSheet).mockResolvedValue(saved)
})
afterEach(() => vi.unstubAllGlobals())

function startBatch() {
  render(<ReceptionDesk />)
  fireEvent.click(screen.getByRole('button', { name: '新建接待工单' }))
  fireEvent.click(screen.getByRole('button', { name: '从文件生成工作单' }))
  const picker = screen.getByLabelText('选择接待材料文件')
  expect(picker).toHaveAttribute('multiple')
  fireEvent.change(picker, { target: { files: [new File(['Colour,Size,Qty\nBlack,M,8'], '尺码.csv')] } })
  return screen.getByLabelText('补充描述（选填）')
}

it('prevents a superseded file result from overwriting an edited description', async () => {
  let finish!: (result: MaterialsResult) => void
  vi.mocked(recognizeMaterials).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    .mockResolvedValueOnce({ ...blankWorksheet, customer: 'Mina' })
  const description = startBatch()
  const generate = screen.getByRole('button', { name: '生成工作单草稿' })
  fireEvent.click(generate)
  fireEvent.click(generate)
  expect(recognizeMaterials).toHaveBeenCalledTimes(1)
  fireEvent.change(description, { target: { value: source.description } })
  expect(vi.mocked(recognizeMaterials).mock.calls[0][1].aborted).toBe(true)
  await act(async () => finish({ ...blankWorksheet, customer: 'Outdated' }))
  expect(description).toBeVisible()
  fireEvent.click(generate)
  expect(await screen.findByLabelText('客户姓名')).toHaveValue('Mina')
  const jobs = vi.mocked(recognizeMaterials).mock.calls.map(call => call[0])
  expect(jobs[0].key).not.toBe(jobs[1].key)
  expect(jobs[1].description).toBe(source.description)
  fireEvent.click(screen.getByRole('button', { name: '保存到取货列表' }))
  await screen.findByText(/待做好 · 已保存/)
  expect(saveSheet).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ materials: source, replaceMaterials: true }), [], undefined, undefined, undefined)
})

it('keeps a suggestion with conflicting inputs unselected and shows its exact source reference', async () => {
  vi.mocked(recognizeMaterials).mockImplementation(async job => {
    job.uploaded = new Map([[job.items[0].key, saved.materials!.files[0]]])
    return { ...blankWorksheet, pickupDate: '2026-12-01', sourceNotes: [{ kind: 'conflict', field: 'pickupDate',
      message: '日期冲突', previousValue: '12月2日', suggestedValue: '12月1日', references: [
        { documentId: 'size', line: 2, quote: '12月1日' }, { documentId: 'supplement', line: 2, quote: '补记 12月2日' },
      ] }] }
  })
  fireEvent.change(startBatch(), { target: { value: '第一行\n补记 12月2日' } })
  fireEvent.click(screen.getByRole('button', { name: '生成工作单草稿' }))
  expect(await screen.findByText('日期冲突')).toBeVisible()
  expect(screen.getByRole('button', { name: '尺码.csv · 第 2 行' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '补充描述 · 第 2 行' }))
  const supplement = screen.getByRole('dialog', { name: '补充描述' })
  expect(supplement.querySelector('[data-selected=true]')).toHaveTextContent('补记 12月2日')
  fireEvent.click(within(supplement).getByRole('button', { name: '关闭预览' }))
  const date = screen.getByRole('group', { name: '预计可取日期' })
  expect(within(date).getByRole('radio', { name: '保留现值' })).toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: '应用核对结果' }))
  expect(screen.getByLabelText('预计可取日期')).toHaveValue('')
})

it('previews the authenticated PDF original and turns to the next page', async () => {
  const materialPdf = { id: 'scan', name: '双页扫描.pdf', contentType: 'application/pdf', expired: false, pageCount: 2 }
  vi.mocked(fetchSheet).mockResolvedValue({ ...saved, materials: { ...source, documentIds: ['scan'], files: [materialPdf] } })
  const fetchOriginal = vi.fn(async () => new Response('PDF', { headers: { 'Content-Type': materialPdf.contentType } }))
  vi.stubGlobal('fetch', fetchOriginal)
  const revoke = vi.fn()
  vi.stubGlobal('URL', class extends URL { static createObjectURL() { return 'blob:scan' } static revokeObjectURL = revoke })
  render(<ReceptionDesk initialSheet={saved.id} />)
  fireEvent.click(await screen.findByRole('button', { name: '预览 双页扫描.pdf' }))
  const preview = screen.getByRole('dialog', { name: '双页扫描.pdf' })
  expect(await within(preview).findByTitle(materialPdf.name)).toHaveAttribute('src', 'blob:scan#page=1')
  expect(fetchOriginal).toHaveBeenCalledWith('/api/admin/ai-order-imports/import/documents/scan/content', expect.objectContaining({ cache: 'no-store' }))
  fireEvent.click(within(preview).getByRole('button', { name: '下一页' }))
  expect(within(preview).getByTitle(materialPdf.name)).toHaveAttribute('src', 'blob:scan#page=2')
  fireEvent.click(within(preview).getByRole('button', { name: '关闭预览' }))
  expect(revoke).toHaveBeenCalledWith('blob:scan')
})

it('reopens named materials and description, and marks expired sources while preserving the worksheet', async () => {
  vi.mocked(fetchSheet).mockResolvedValue({ ...saved, materials: { ...saved.materials!,
    files: [{ ...saved.materials!.files[0], expired: true }] } })
  render(<ReceptionDesk initialSheet="sheet" />)
  expect(await screen.findByLabelText('客户姓名')).toHaveValue('Mina')
  expect(screen.getByText('尺码.csv')).toBeVisible()
  expect(screen.getByText('原件已到期')).toBeVisible()
  expect(screen.getByText(source.description)).toBeVisible()
  expect(screen.getByRole('button', { name: '打印 / 保存 A4 PDF' })).toBeEnabled()
})

it.each(['correction', 'conflict'] as const)('reviews free-form garment quantity %s with the proposed size rows', async kind => {
  vi.mocked(recognizeMaterials).mockResolvedValue({ ...blankWorksheet, layout: { title: '核对尺码', groups: [{
    heading: '黑色 T 恤', notes: '', presentation: 'rows', rows: [
      { colour: '黑色', size: 'M', quantity: 10 }, { colour: '黑色', size: 'L', quantity: 6 },
    ],
  }] }, sourceNotes: [{ kind, field: '黑色 T 恤 M 码数量', message: '请核对尺码数量',
    previousValue: '8', suggestedValue: '10', references: [{ documentId: 'size', line: 2 }] }] })
  startBatch()
  fireEvent.click(screen.getByRole('button', { name: '生成工作单草稿' }))
  const row = await screen.findByRole('group', { name: /黑色 T 恤.*黑色.*M/ })
  expect(within(row).getByRole('radio', { name: kind === 'correction' ? /采用识别数量.*10/ : /数量留空/ })).toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: '应用核对结果' }))
  expect(screen.getByLabelText('第1行数量')).toHaveValue(kind === 'correction' ? '10' : '')
  expect(screen.getByLabelText('第2行数量')).toHaveValue('6')
})

it.each(['saved', 'first draft'])('offers to clear values withdrawn from the %s without replacing manual garment notes', async previous => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const rows = [{ colour: 'Black', size: 'M', quantity: 8 }, { colour: 'Black', size: 'L', quantity: 6 }]
  const group = { heading: 'Tee', notes: '', presentation: 'rows' as const, rows }
  const first = { ...blankWorksheet, customer: 'Mina', pickupDate: '2026-12-03', totalPrice: 125,
    layout: { title: '工作单', groups: [group] } }
  const revised = { ...blankWorksheet, layout: { title: '工作单', groups: [{ ...group, rows: [{ ...rows[0], quantity: null }, rows[1]] }] } }
  if (previous === 'saved') {
    vi.mocked(fetchSheet).mockResolvedValue({ ...saved, ...first })
    render(<ReceptionDesk initialSheet={saved.id} />)
  } else {
    vi.mocked(recognizeMaterials).mockResolvedValueOnce(first)
    startBatch()
    fireEvent.click(screen.getByRole('button', { name: '生成工作单草稿' }))
  }
  vi.mocked(recognizeMaterials).mockResolvedValueOnce(revised)
  fireEvent.change(await screen.findByLabelText('本组制作要求'), { target: { value: '手工备注' } })
  fireEvent.click(screen.getByRole('button', { name: '编辑接待材料' }))
  fireEvent.change(screen.getByLabelText('补充描述（选填）'), { target: { value: '客户取消 M 码数量和日期' } })
  fireEvent.click(screen.getByRole('button', { name: '生成工作单草稿' }))
  const date = await screen.findByRole('group', { name: '预计可取日期' })
  const customer = screen.getByRole('group', { name: '客户姓名' })
  const total = screen.getByRole('group', { name: '总价（NZD）' })
  const quantity = screen.getByRole('group', { name: /Tee.*Black.*M/ })
  expect(within(total).getByRole('radio', { name: '保留现值' })).toBeChecked()
  expect(within(customer).getByRole('radio', { name: '保留现值' })).toBeChecked()
  expect(within(quantity).getByRole('radio', { name: /保留数量.*8/ })).toBeChecked()
  fireEvent.click(within(quantity).getByRole('radio', { name: '清除数量' }))
  fireEvent.click(within(date).getByRole('radio', { name: '清除现值' }))
  fireEvent.click(screen.getByRole('button', { name: '应用核对结果' }))
  expect(screen.getByLabelText('客户姓名')).toHaveValue('Mina')
  expect(screen.getByLabelText('预计可取日期')).toHaveValue('')
  expect(screen.getByLabelText('本组制作要求')).toHaveValue('手工备注')
  expect(screen.getByLabelText('第1行数量')).toHaveValue('')
  expect(screen.getByLabelText('第2行数量')).toHaveValue('6')
  expect(screen.getByRole('textbox', { name: '总价（NZD）' })).toHaveValue('125.00')
})

it('keeps the selected colour’s other sizes and the same size in another colour', async () => {
  vi.mocked(recognizeMaterials).mockResolvedValue({ ...blankWorksheet, layout: { title: '核对尺码', groups: [{
    heading: 'Tee', notes: '', presentation: 'rows', rows: [
      { colour: 'Black', size: 'M', quantity: 10 }, { colour: 'White', size: 'M', quantity: 9 },
      { colour: 'Black', size: 'L', quantity: 6 },
    ],
  }] }, sourceNotes: [{ kind: 'conflict', field: '黑色 M 码数量', message: '原始表也列出白色 M',
    references: [{ documentId: 'size', line: 2, quote: 'White,M,9' }] }] })
  startBatch()
  fireEvent.click(screen.getByRole('button', { name: '生成工作单草稿' }))
  const row = await screen.findByRole('group', { name: /Tee.*Black.*M/ })
  expect(within(row).getByRole('radio', { name: '数量留空' })).toBeChecked()
  expect(screen.queryByRole('group', { name: /Tee.*White.*M/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '应用核对结果' }))
  expect(screen.getByLabelText('第1行数量')).toHaveValue('')
  expect(screen.getByLabelText('第2行数量')).toHaveValue('9')
  expect(screen.getByLabelText('第3行数量')).toHaveValue('6')
})

it('keeps mixed-customer drafts in whole-field review with no automatically accepted orders', async () => {
  vi.mocked(recognizeMaterials).mockResolvedValue({ ...blankWorksheet, customer: 'Mina', layout: { title: '工作单', groups: [{
    heading: 'Tee', notes: '', presentation: 'rows', rows: [{ colour: 'Black', size: 'M', quantity: 10 }],
  }] }, sourceNotes: [{ kind: 'multipleCustomers', field: 'customer', message: '原件似乎属于两个客户', references: [{ documentId: 'size', line: 2 }] }] })
  startBatch()
  fireEvent.click(screen.getByRole('button', { name: '生成工作单草稿' }))
  const groups = await screen.findByRole('group', { name: '服装分组明细' })
  expect(within(groups).getByRole('radio', { name: '保留现值' })).toBeChecked()
  const customer = screen.getByRole('group', { name: '客户姓名' })
  expect(within(customer).getByRole('radio', { name: '保留现值' })).toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: '应用核对结果' }))
  expect(screen.getByLabelText('客户姓名')).toHaveValue('')
  expect(screen.queryByLabelText('第1行数量')).toBeNull()
})

it('holds both identical duplicate occurrences for separate choices and keeps the unrelated L amount', async () => {
  const blackM = { colour: 'Black', size: 'M', quantity: 8 }
  vi.mocked(recognizeMaterials).mockResolvedValue({ ...blankWorksheet, layout: { title: '工作单', groups: [{
    heading: 'Tee', notes: '', presentation: 'rows', rows: [blackM, { ...blackM }, { colour: 'Black', size: 'L', quantity: 4 }],
  }] }, sourceNotes: [{ kind: 'possibleDuplicate', field: 'Tee Black M quantity', message: '两份材料疑似记录同一行',
    references: [{ documentId: 'size', line: 2, quote: 'Black,M,8' }] }] })
  startBatch()
  fireEvent.click(screen.getByRole('button', { name: '生成工作单草稿' }))
  const first = await screen.findByRole('group', { name: /Tee.*Black.*M.*第 1 笔/ })
  const second = screen.getByRole('group', { name: /Tee.*Black.*M.*第 2 笔/ })
  expect(within(first).getByRole('radio', { name: '数量留空' })).toBeChecked()
  expect(within(second).getByRole('radio', { name: '数量留空' })).toBeChecked()
  fireEvent.click(within(first).getByRole('radio', { name: '采用识别数量 8 件' }))
  fireEvent.click(screen.getByRole('button', { name: '应用核对结果' }))
  expect(screen.getByLabelText('第1行数量')).toHaveValue('8')
  expect(screen.getByLabelText('第2行数量')).toHaveValue('')
  expect(screen.getByLabelText('第3行数量')).toHaveValue('4')
})

it('retains a manually edited group while keeping the previous M amount and adopting only the L correction', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const rows = [{ colour: 'Black', size: 'M', quantity: 8 }, { colour: 'Black', size: 'L', quantity: 4 }]
  const current = { heading: 'Tee', notes: '手工保留', presentation: 'rows' as const, rows }
  vi.mocked(fetchSheet).mockResolvedValue({ ...saved, layout: { title: '工作单', groups: [current] } })
  vi.mocked(recognizeMaterials).mockResolvedValue({ ...blankWorksheet, customer: saved.customer, layout: { title: '工作单', groups: [{
    ...current, heading: ' tee ', notes: '机器建议', rows: [{ ...rows[0], quantity: 10 }, { ...rows[1], quantity: 6 }],
  }] }, sourceNotes: [
    { kind: 'conflict', field: 'Tee Black M quantity', message: 'M 有争议', references: [{ documentId: 'size', line: 2 }] },
    { kind: 'correction', field: 'Tee Black L quantity', message: 'L 更正为 6', references: [{ documentId: 'size', line: 3 }] },
  ] })
  render(<ReceptionDesk initialSheet={saved.id} />)
  fireEvent.click(await screen.findByRole('button', { name: '编辑接待材料' }))
  fireEvent.click(screen.getByRole('button', { name: '生成工作单草稿' }))
  const medium = await screen.findByRole('group', { name: /Tee.*Black.*M/ })
  const large = screen.getByRole('group', { name: /Tee.*Black.*L/ })
  expect(within(medium).getByRole('radio', { name: '保留数量 8 件' })).toBeChecked()
  expect(within(large).getByRole('radio', { name: '保留数量 4 件' })).toBeChecked()
  fireEvent.click(within(large).getByRole('radio', { name: '采用识别数量 6 件' }))
  fireEvent.click(screen.getByRole('button', { name: '应用核对结果' }))
  expect(screen.getByLabelText('第1行数量')).toHaveValue('8')
  expect(screen.getByLabelText('第2行数量')).toHaveValue('6')
  expect(screen.getByLabelText('服装分组')).toHaveValue('Tee')
  expect(screen.getByLabelText('本组制作要求')).toHaveValue('手工保留')
})

it('reviews withdrawals even when replacement files were saved before recognition', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const before = { ...saved, pickupDate: '2026-12-04', totalPrice: 125 }
  const replacement = { importId: 'replacement', documentIds: ['new-size'], description: source.description }
  vi.mocked(fetchSheet).mockResolvedValue(before)
  vi.mocked(ensureMaterialSources).mockResolvedValue(replacement)
  vi.mocked(saveSheet).mockResolvedValue({ ...before, version: 'v2', materials: { ...replacement,
    files: [{ id: 'new-size', name: '更新.csv', contentType: 'text/csv', expired: false }] } })
  vi.mocked(recognizeMaterials).mockResolvedValue({ ...blankWorksheet, customer: before.customer })
  render(<ReceptionDesk initialSheet={saved.id} />)
  fireEvent.click(await screen.findByRole('button', { name: '编辑接待材料' }))
  fireEvent.click(screen.getByRole('button', { name: '移除 尺码.csv' }))
  fireEvent.change(screen.getByLabelText('选择接待材料文件'), { target: { files: [new File(['Colour,Size,Qty\nBlack,M,8'], '更新.csv')] } })
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
  await screen.findByText(/待做好 · 已保存/)
  fireEvent.click(screen.getByRole('button', { name: '生成工作单草稿' }))
  const date = await screen.findByRole('group', { name: '预计可取日期' })
  const total = screen.getByRole('group', { name: '总价（NZD）' })
  expect(within(total).getByRole('radio', { name: '保留现值' })).toBeChecked()
  fireEvent.click(within(date).getByRole('radio', { name: '清除现值' }))
  fireEvent.click(screen.getByRole('button', { name: '应用核对结果' }))
  expect(screen.getByLabelText('预计可取日期')).toHaveValue('')
  expect(screen.getByRole('textbox', { name: '总价（NZD）' })).toHaveValue('125.00')
})
