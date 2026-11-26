import { useCallback, useEffect, useRef, useState } from 'react'
import { fallbackMaterialLimits, fetchMaterialLimits, materialValidation, newMaterialItems, restoreMaterialItems,
  type MaterialItem, type MaterialStatus, type MaterialsJob, type SavedMaterials } from '@/features/reception/materials'

export function useReceptionMaterials() {
  const [active, setActive] = useState(false)
  const [items, setItems] = useState<MaterialItem[]>([])
  const [description, setDescription] = useState('')
  const [saved, setSaved] = useState<SavedMaterials | null>()
  const [limits, setLimits] = useState(fallbackMaterialLimits)
  const [edited, setEdited] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, MaterialStatus>>({})
  const [selectionErrors, setSelectionErrors] = useState<string[]>([])
  const batch = useRef<MaterialsJob>()

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    fetchMaterialLimits(controller.signal).then(value => {
      if (!controller.signal.aborted && value.maxFiles > 0) setLimits(value)
    }).catch(() => {})
    return () => controller.abort()
  }, [active])

  const openSource = useCallback((source?: SavedMaterials | null) => {
    batch.current = undefined
    setSaved(source)
    setActive(!!source)
    setItems(restoreMaterialItems(source))
    setDescription(source?.description ?? '')
    setEdited(false)
    setStatuses({})
    setSelectionErrors([])
  }, [])

  function changed() {
    batch.current = undefined
    setStatuses({})
    setEdited(true)
  }

  function add(files: File[], method: MaterialItem['method']) {
    const result = newMaterialItems(files, items, limits, description, method)
    setSelectionErrors(result.errors)
    if (!result.items.length) return false
    changed()
    setItems([...items, ...result.items])
    return true
  }

  function remove(key: string) {
    changed()
    setSelectionErrors([])
    setItems(items.filter(item => item.key !== key))
  }

  function setNote(value: string) {
    changed()
    setDescription(value)
  }

  function getJob() {
    return batch.current ??= { key: crypto.randomUUID(), items, description, source: edited ? undefined : saved ?? undefined }
  }

  function report(job: MaterialsJob, signal?: AbortSignal) {
    return (key: string, status: MaterialStatus) => {
      if (batch.current === job && !signal?.aborted) setStatuses(current => ({ ...current, [key]: status }))
    }
  }

  function acknowledge(source?: SavedMaterials | null) {
    setSaved(source)
    setEdited(false)
  }

  function documentId(item: MaterialItem) {
    return batch.current?.uploaded?.get(item.key)?.id ?? item.saved?.id
  }

  return { active, setActive, items, description, limits, edited, statuses, selectionErrors, add, remove, setNote,
    validation: materialValidation(items, description, limits), openSource, getJob, report, acknowledge, documentId }
}
