import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { ApiError } from '@/lib/api-client'
import { adminApiClient } from '@/lib/admin-client'

const acceptedTypes = ['image/png', 'application/pdf', 'image/jpeg', 'image/webp']
const accept = [...acceptedTypes, '.png', '.pdf', '.jpg', '.jpeg', '.webp'].join(',')
type Batch = { files: File[]; id: string }

function validate(files: File[]) {
  if (files.length > 10) return '每次最多可上传 10 份设计稿。'
  if (files.reduce((total, file) => total + file.size, 0) > 8 * 1024 * 1024) return '这批文件合计超过 8 MiB，请分批上传。'
  for (const file of files) {
    if (!file.size) return file.name + ' 是空文件，请重新选择。'
    const genericType = !file.type || file.type === 'application/octet-stream'
    if (!acceptedTypes.includes(file.type) && !(genericType && /\.(png|pdf|jpe?g|webp)$/i.test(file.name)))
      return file.name + ' 格式不受支持，请选择 PNG、PDF、JPEG 或 WebP。'
  }
  return ''
}

export function ArtworkUpload({ path, onChanged, children }: {
  path: string; onChanged: () => void; children?: ReactNode
}) {
  const input = useRef<HTMLInputElement>(null)
  const sending = useRef(false)
  const [batch, setBatch] = useState<Batch>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  async function upload(selected: Batch) {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError('')
    setStatus(`正在上传 ${selected.files.length} 份设计稿…`)
    try {
      const form = new FormData()
      form.append('uploadId', selected.id)
      selected.files.forEach((file, index) => form.append('file' + index, file))
      await adminApiClient.post(path + '/upload', form)
      setBatch(undefined)
      setStatus(`已上传 ${selected.files.length} 份设计稿。`)
      onChanged()
    } catch (e) {
      setStatus('')
      setError(e instanceof ApiError ? e.message : '上传未能确认，请重试。')
      if (e instanceof ApiError && e.status === 409) {
        setBatch(undefined)
        onChanged()
      }
    } finally {
      sending.current = false
      setBusy(false)
    }
  }
  function select(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    if (!files.length || sending.current) return
    const invalid = validate(files)
    if (invalid) {
      setBatch(undefined)
      setStatus('')
      setError(invalid)
      return
    }
    const selected = { files, id: crypto.randomUUID() }
    setBatch(selected)
    void upload(selected)
  }
  return <>
    <div className="rc-actions">
      <input hidden type="file" ref={input} multiple accept={accept} aria-label="选择本地设计稿" onChange={select}/>
      <button type="button" disabled={busy} onClick={() => input.current?.click()}>上传本地设计稿</button>
      {children}
    </div>
    <small>PNG、PDF、JPEG、WebP · 每批最多 10 份，合计 8 MiB</small>
    {status && <p role="status">{status}</p>}
    {error && <p role="alert" className="rc-error">{error}
      {batch && <button type="button" onClick={() => void upload(batch)}>重试上传</button>}</p>}
  </>
}
