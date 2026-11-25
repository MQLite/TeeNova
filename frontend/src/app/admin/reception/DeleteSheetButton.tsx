'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { deleteSheet, type SavedSheet } from './sheets'
import { adminApiClient } from '@/lib/admin-client'
import './desk-notice.css'

export function DeleteSheetButton({ sheet, dirty, disabled, onDeleted }: {
  sheet: SavedSheet; dirty: boolean; disabled: boolean; onDeleted: () => void
}) {
  return <ConfirmDelete label="删除工单" heading="确认删除这张工单？" disabled={disabled} onDeleted={onDeleted}
    detail="删除后，已关联的设计稿将自动退回「待关联设计稿」，可以重新关联。"
    remove={() => deleteSheet(sheet.id, sheet.version)}>
    <p><strong>{sheet.customer || '未填写姓名'}</strong> · #{sheet.id.slice(0, 8)}</p>
    {dirty && <p>当前未保存的修改会丢失。</p>}
  </ConfirmDelete>
}

export function DeleteArtworkButton({ name, path, onDeleted, disabled }: {
  name: string; path: string; onDeleted: () => void; disabled?: boolean
}) {
  return <ConfirmDelete label="删除设计稿" heading="确认删除这份设计稿？" disabled={disabled}
    detail="这份设计稿将从网站移除。Gmail 原邮件和附件会保留。"
    remove={() => adminApiClient.delete<void>(path)} onDeleted={onDeleted}>
    <p><strong>{name}</strong></p>
  </ConfirmDelete>
}

function ConfirmDelete({ label, heading, disabled, onDeleted, detail, remove, children }: {
  label: string; heading: string; disabled?: boolean; onDeleted: () => void; detail: string;
  remove: () => Promise<void>; children: ReactNode
}) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const pending = useRef(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function confirmDelete() {
    if (pending.current) return
    pending.current = true
    setSaving(true)
    setError('')
    try {
      await remove()
      dialog.current?.close()
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败，请稍后重试。')
    } finally { pending.current = false; setSaving(false) }
  }
  return <>
    <button type="button" className="rc-delete" disabled={disabled} onClick={() => {
      setError('')
      dialog.current?.showModal()
    }}>{label}</button>
    <dialog ref={dialog} role="alertdialog" aria-labelledby={id} aria-describedby={id + '-detail'}
      className="rc-delete-dialog" onCancel={e => { if (pending.current) e.preventDefault() }}>
      <h2 id={id}>{heading}</h2>
      {children}
      <p id={id + '-detail'}>{detail}</p>
      {error && <p role="alert" className="rc-error">{error}</p>}
      <div className="rc-actions rc-end">
        <button type="button" autoFocus disabled={saving} onClick={() => dialog.current?.close()}>取消</button>
        <button type="button" className="rc-delete-confirm" disabled={saving} onClick={() => void confirmDelete()}>
          {saving ? '正在删除…' : '确认删除'}</button>
      </div>
    </dialog>
  </>
}
