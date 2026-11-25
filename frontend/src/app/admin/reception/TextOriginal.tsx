import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { sourceContentUrl } from '@/api/ai-order-imports'
import { MAX_RECEPTION_TEXT_LENGTH, type CaptureRequest, type PhotoSource } from '@/features/reception/recognize'

function useStoredText(source?: PhotoSource | null) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ source: PhotoSource; attempt: number; text?: string }>()
  useEffect(() => {
    if (!source) {
      setResult(undefined)
      return
    }
    const controller = new AbortController()
    async function load(reference: PhotoSource) {
      try {
        const url = sourceContentUrl(reference.importId, reference.documentId)
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error()
        const text = await response.text()
        if (!controller.signal.aborted) setResult({ source: reference, attempt, text })
      } catch {
        if (!controller.signal.aborted) setResult({ source: reference, attempt })
      }
    }
    void load(source)
    return () => controller.abort()
  }, [source, attempt])
  const current = result && result.source === source && result.attempt === attempt ? result : undefined
  return {
    text: current?.text, loading: !!source && !current, failed: !!current && current.text === undefined,
    retry: () => setAttempt(n => n + 1),
  }
}

export function useTextOriginal() {
  const [source, setSource] = useState<PhotoSource | null>()
  const [draft, setDraft] = useState<string>()
  const job = useRef<CaptureRequest>()
  const stored = useStoredText(draft === undefined ? source : undefined)
  const text = draft ?? stored.text ?? ''
  const oversized = text.length > MAX_RECEPTION_TEXT_LENGTH
  const valid = !oversized && !!text.trim()
  const openSource = useCallback((reference?: PhotoSource | null) => {
    job.current = undefined
    setDraft(undefined)
    // Every reopen checks current retention even when it points to the same document.
    setSource(reference && { ...reference })
  }, [])
  function edit(value: string) {
    job.current = undefined
    setDraft(value)
  }
  function capture() {
    return job.current ??= { key: crypto.randomUUID(), text, source: draft === undefined ? source ?? undefined : undefined }
  }
  return {
    ...stored, text, source, oversized, valid, edited: draft !== undefined,
    hasOriginal: !!source || !!draft, openSource, edit, capture,
  }
}

type TextView = ReturnType<typeof useStoredText>

function TextLoadStatus({ value }: { value: TextView }) {
  if (value.loading) return <p role="status">正在读取文字原稿…</p>
  if (value.failed) return <div><p role="status">文字原稿暂时无法读取。</p>
    <button type="button" onClick={value.retry}>重新读取原文</button></div>
  return null
}

export function TextEditor({ value, disabled, onChange }: {
  value: ReturnType<typeof useTextOriginal>; disabled: boolean; onChange: (text: string) => void
}) {
  if (value.loading || value.failed) return <>
    <TextLoadStatus value={value}/>
    {value.failed && <button disabled={disabled} onClick={() => onChange('')}>粘贴替换原文</button>}
  </>
  return <div className="rc-text-editor">
    <label>客户需求原文<textarea rows={9} value={value.text} disabled={disabled}
      aria-invalid={value.oversized} aria-describedby="rc-text-limit"
      placeholder="粘贴聊天记录、邮件或尺码表" onChange={e => onChange(e.target.value)}/></label>
    <p id="rc-text-limit" className={value.oversized ? 'rc-error' : undefined}>
      {value.oversized && '原文超过上限，请缩短后再提交。'}{value.text.length} / {MAX_RECEPTION_TEXT_LENGTH}
    </p>
  </div>
}

export function OriginalText({ value }: { value: TextView }) {
  const id = useId()
  const [expanded, setExpanded] = useState(false)
  return <section className="rc-paper rc-text-original" aria-label="文字原稿">
    <h2 className="rc-paperhead">文字原稿</h2>
    <button aria-controls={id} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      {expanded ? '收起文字原稿' : '展开文字原稿'}</button>
    <div id={id} className={expanded ? undefined : 'rc-text-folded'}>
      {value.loading || value.failed ? <TextLoadStatus value={value}/> : <pre tabIndex={0}>{value.text}</pre>}
    </div>
  </section>
}
