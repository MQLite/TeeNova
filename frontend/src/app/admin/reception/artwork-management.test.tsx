import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { GmailArtwork } from './GmailArtwork'
import { PendingGmailArtwork } from './PendingGmailArtwork'

const pending = '/api/proxy/api/gmail-reception/pending'
const sheet = '/api/proxy/api/gmail-reception/sheets/sheet-a/attachments'
const artwork = { id: 'file-a', name: 'logo.webp', mime: 'image/webp', source: 'upload',
  sender: '本地上传', subject: '', received: '2026-11-26T01:00:00Z', newCustomer: null }
const webp = new File(['RIFFxxxxWEBP'], 'logo.webp', { type: 'image/webp' })
const pdf = new File(['%PDF-'], 'front.pdf', { type: 'application/pdf' })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

afterEach(() => vi.unstubAllGlobals())

it.each([['pending', pending], ['linked', sheet]])('retries a %s upload with its original batch and refreshes the artwork in place', async (where, endpoint) => {
  const uploads: FormData[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url === endpoint) return json(uploads.length === 2 ? [artwork] : [])
    expect(url).toBe(endpoint + '/upload')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).has('content-type')).toBe(false)
    uploads.push(init.body as FormData)
    if (uploads.length === 1) throw new TypeError('Network error')
    return json({ count: 2, added: 2 })
  }))
  await act(async () => { render(where === 'pending' ? <PendingGmailArtwork /> : <GmailArtwork sheetId="sheet-a" />) })
  fireEvent.change(screen.getByLabelText('选择本地设计稿'), { target: { files: [webp, pdf] } })
  fireEvent.click(await screen.findByRole('button', { name: '重试上传' }))
  expect(await screen.findByRole('button', { name: '预览 logo.webp' })).toBeVisible()
  expect(screen.getByText(/本地上传/)).toBeVisible()
  expect(uploads).toHaveLength(2)
  expect(uploads[0].get('uploadId')).toMatch(/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i)
  expect(uploads[1].get('uploadId')).toBe(uploads[0].get('uploadId'))
  for (const form of uploads) {
    expect(form.get('file0')).toBe(webp)
    expect(form.get('file1')).toBe(pdf)
  }
})

it('rejects excessive file count, combined size, empty files and unsupported types before upload', async () => {
  const fetch = vi.fn(async () => json([]))
  vi.stubGlobal('fetch', fetch)
  await act(async () => { render(<GmailArtwork sheetId="sheet-a" />) })
  const picker = screen.getByLabelText('选择本地设计稿')
  for (const [files, expected] of [
    [Array(11).fill(pdf), /10/],
    [[Object.defineProperty(new File(['large'], 'large.png', { type: 'image/png' }), 'size', { value: 48 * 1024 * 1024 }), pdf], /48 MiB/],
    [[new File([], 'empty.pdf', { type: 'application/pdf' })], /空/],
    [[new File(['hello'], 'hello.txt', { type: 'text/plain' })], /PNG/],
  ] as [File[], RegExp][]) {
    fireEvent.change(picker, { target: { files } })
    expect(screen.getByRole('alert')).toHaveTextContent(expected)
  }
  expect(fetch).toHaveBeenCalledTimes(1)
})

it.each([['pending', pending], ['linked', sheet]])('reports automatic compression for a large %s batch', async (where, endpoint) => {
  const large = Object.defineProperty(new File(['art'], 'poster.png', { type: 'image/png' }), 'size', { value: 12 * 1024 * 1024 })
  let finish!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url === endpoint) return json([])
    expect(url).toBe(endpoint + '/upload')
    expect((init.body as FormData).get('file0')).toBe(large)
    return new Promise<Response>(resolve => { finish = resolve })
  }))
  await act(async () => { render(where === 'pending' ? <PendingGmailArtwork /> : <GmailArtwork sheetId="sheet-a" />) })
  fireEvent.change(screen.getByLabelText('选择本地设计稿'), { target: { files: [large] } })
  expect(screen.getByRole('status')).toHaveTextContent('自动压缩')
  await act(async () => { finish(json({ originalBytes: large.size, storedBytes: 6 * 1024 * 1024, compressedFiles: ['poster.png'] })) })
  expect(screen.getByRole('status')).toHaveTextContent('已压缩 poster.png，本批从 12.0 MiB 减至 6.0 MiB')
})

it('keeps the work order usable when its attachment list cannot be read', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({})).mockResolvedValueOnce(json([artwork])))
  render(<GmailArtwork sheetId="sheet-a" />)
  fireEvent.click(await screen.findByRole('button', { name: '重试读取' }))
  expect(await screen.findByRole('button', { name: '预览 logo.webp' })).toBeVisible()
})

it('removes a stale pending card when opening a new order conflicts with another operator', async () => {
  const open = vi.fn()
  let claimed = false
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === pending) return json(claimed ? [] : [artwork])
    expect(url).toBe(pending + '/file-a/create')
    claimed = true
    return json({ message: '这份稿已被处理，请刷新列表。' }, 409)
  }))
  render(<PendingGmailArtwork onOpen={open}/>)
  fireEvent.click(await screen.findByRole('button', { name: '用此稿开新单' }))
  fireEvent.change(screen.getByLabelText('新工单客户姓名'), { target: { value: 'Pat' } })
  fireEvent.click(screen.getByRole('button', { name: '创建工单并关联' }))
  expect(await screen.findByText('暂无待关联设计稿。')).toBeVisible()
  expect(screen.getByText('这份稿已被处理，请刷新列表。')).toBeVisible()
  expect(open).not.toHaveBeenCalled()
})

it.each([200, 409])('refreshes the saved order and the pending picker after link response %s', async status => {
  let attempted = false
  const reserved = { ...artwork, id: 'reserved', name: 'reserved.webp', newCustomer: 'Pat' }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url === sheet) return json(attempted && status === 200 ? [artwork] : [])
    if (url === pending) return json(attempted ? [] : [artwork, reserved])
    expect(url).toBe(pending + '/file-a/link/sheet-a')
    expect(init.method).toBe('POST')
    attempted = true
    return json(status === 200 ? { sheetId: 'sheet-a' } : { message: '另一位同事已关联此稿。' }, status)
  }))
  render(<GmailArtwork sheetId="sheet-a" />)
  fireEvent.click(screen.getByRole('button', { name: '从待关联设计稿中选择' }))
  const chooser = within(await screen.findByRole('region', { name: '选择待关联设计稿' }))
  expect(await chooser.findByRole('button', { name: '预览 logo.webp' })).toBeVisible()
  expect(chooser.queryByRole('button', { name: '预览 reserved.webp' })).toBeNull()
  fireEvent.click(chooser.getByRole('button', { name: /关联到本工单/ }))
  expect(await chooser.findByText('暂无可关联的设计稿。')).toBeVisible()
  if (status === 200) {
    expect(screen.getByAltText('logo.webp 缩略图')).toHaveAttribute('src', sheet + '/file-a')
  } else {
    expect(screen.getByRole('alert')).toHaveTextContent('另一位同事已关联此稿。')
    expect(screen.queryByAltText('logo.webp 缩略图')).toBeNull()
  }
})
