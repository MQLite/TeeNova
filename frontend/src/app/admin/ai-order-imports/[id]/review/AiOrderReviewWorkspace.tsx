'use client'

import Link from 'next/link'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  getAiOrderImport,
  getAiOrderReview,
  saveAiOrderReview,
  searchAiOrderCatalogue,
  sourceContentUrl,
  type AiOrderCatalogueSearchItem,
  type AiOrderCompatibleVariant,
  type AiOrderConfirmationReadiness,
  type AiOrderControlledValue,
  type AiOrderImport,
  type AiOrderReview,
  type AiOrderReviewDecision,
  type AiOrderReviewField,
  type AiOrderReviewIssue,
  type AiOrderReviewOperationInput,
  type AiOrderReviewProductGroup,
  type AiOrderReviewProductGroupInput,
  type AiOrderReviewSaveInput,
  type AiOrderSourceDocument,
  type AiOrderSourceReference,
} from '@/api/ai-order-imports'
import { ApiError } from '@/lib/api-client'

type WorkspaceTab = 'Source' | 'Order' | 'Issues'
type IssueFilter = 'Blocking' | 'Warning' | 'Resolved' | 'All'

interface Props {
  importId: string
}

interface DraftState {
  customer: AiOrderReview['customer']
  productGroups: AiOrderReviewProductGroup[]
  financials: AiOrderReview['financials']
  issueResolutions: AiOrderReview['issueResolutions']
  operations: AiOrderReviewOperationInput[]
}

const inputClass =
  'mt-1 block w-full rounded-xl border border-black/[0.14] bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-black focus:ring-2 focus:ring-black/10'
const smallButton =
  'rounded-full border border-black/[0.14] bg-white px-3 py-1.5 text-xs text-black hover:border-black/30 disabled:cursor-not-allowed disabled:opacity-40'

export function AiOrderReviewWorkspace({ importId }: Props) {
  const [review, setReview] = useState<AiOrderReview>()
  const [intake, setIntake] = useState<AiOrderImport>()
  const [draft, setDraft] = useState<DraftState>()
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('Order')
  const [selectedSourceId, setSelectedSourceId] = useState<string>()
  const [selectedSourcePage, setSelectedSourcePage] = useState(1)
  const [selectedSourceReference, setSelectedSourceReference] =
    useState<AiOrderSourceReference>()
  const [zoom, setZoom] = useState(1)
  const [displayRotation, setDisplayRotation] = useState(0)
  const [issueFilter, setIssueFilter] = useState<IssueFilter>('Blocking')
  const [guided, setGuided] = useState(false)
  const [guidedIndex, setGuidedIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()
  const [conflict, setConflict] = useState(false)
  const [catalogueQuery, setCatalogueQuery] = useState('')
  const [catalogueResults, setCatalogueResults] = useState<AiOrderCatalogueSearchItem[]>([])
  const [catalogueGroupId, setCatalogueGroupId] = useState<string>()
  const [catalogueSearching, setCatalogueSearching] = useState(false)
  const [catalogueCache, setCatalogueCache] = useState<Record<string, AiOrderCatalogueSearchItem>>({})
  const mainRef = useRef<HTMLDivElement>(null)

  async function load() {
    const [nextReview, nextIntake] = await Promise.all([
      getAiOrderReview(importId),
      getAiOrderImport(importId),
    ])
    setReview(nextReview)
    setIntake(nextIntake)
    setDraft(toDraft(nextReview))
    setSelectedSourceId((current) => current ?? nextIntake.sourceDocuments[0]?.id)
    setDirty(false)
    setConflict(false)
    setError(undefined)
  }

  useEffect(() => {
    load().catch((reason: Error) => setError(reason.message))
    // importId fixes the workspace identity for this mounted page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importId])

  useEffect(() => {
    function warnBeforeLeave(event: BeforeUnloadEvent) {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeave)
    return () => window.removeEventListener('beforeunload', warnBeforeLeave)
  }, [dirty])

  const selectedSource = intake?.sourceDocuments.find((source) => source.id === selectedSourceId)
  const allIssues = review?.issues ?? []
  const filteredIssues = allIssues.filter((issue) => {
    if (issueFilter === 'All') return true
    if (issueFilter === 'Resolved') return issue.resolution.status !== 'Open'
    return issue.resolution.status === 'Open' && issue.severity === issueFilter
  })
  const actionableIssues = allIssues.filter(
    (issue) => issue.resolution.status === 'Open',
  )
  const guidedIssue = actionableIssues[Math.min(guidedIndex, Math.max(0, actionableIssues.length - 1))]

  function mutate(change: (next: DraftState) => void) {
    setDraft((current) => {
      if (!current) return current
      const next = structuredClone(current)
      change(next)
      return next
    })
    setDirty(true)
    setNotice(undefined)
    setConflict(false)
  }

  function updateCustomer(
    key: keyof AiOrderReview['customer'],
    value: string,
  ) {
    mutate((next) => {
      next.customer[key] = updateTextField(next.customer[key], value)
    })
  }

  function updateGroup(groupId: string, change: (group: AiOrderReviewProductGroup) => void) {
    mutate((next) => {
      const group = next.productGroups.find((item) => item.groupId === groupId)
      if (group) change(group)
    })
  }

  function addGroup() {
    const group = newGroup()
    mutate((next) => {
      next.productGroups.push(group)
      next.operations.push({
        action: 'GroupAdded',
        path: `/productGroups/${group.groupId}`,
        sourceIds: [],
        resultIds: [group.groupId],
      })
    })
  }

  function removeGroup(groupId: string) {
    if (!window.confirm('Remove this product group from the Draft?')) return
    mutate((next) => {
      next.productGroups = next.productGroups.filter((group) => group.groupId !== groupId)
      next.operations.push({
        action: 'GroupRemoved',
        path: `/productGroups/${groupId}`,
        sourceIds: [groupId],
        resultIds: [],
        reason: 'Removed during staff review',
      })
    })
  }

  function duplicateGroup(groupId: string) {
    mutate((next) => {
      const index = next.productGroups.findIndex((group) => group.groupId === groupId)
      if (index < 0) return
      const copy = structuredClone(next.productGroups[index])
      const newId = crypto.randomUUID()
      copy.groupId = newId
      copy.sizeQuantityRows.forEach((row) => {
        row.rowId = crypto.randomUUID()
      })
      copy.printing.forEach((print) => {
        print.printId = crypto.randomUUID()
      })
      next.productGroups.splice(index + 1, 0, copy)
      next.operations.push({
        action: 'GroupDuplicated',
        path: `/productGroups/${newId}`,
        sourceIds: [groupId],
        resultIds: [newId],
        reason: 'Duplicated during staff review',
      })
    })
  }

  function moveGroup(groupId: string, direction: -1 | 1) {
    mutate((next) => {
      const index = next.productGroups.findIndex((group) => group.groupId === groupId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= next.productGroups.length) return
      ;[next.productGroups[index], next.productGroups[target]] = [
        next.productGroups[target],
        next.productGroups[index],
      ]
      next.operations.push({
        action: 'GroupReordered',
        path: '/productGroups',
        sourceIds: [groupId],
        resultIds: [groupId],
      })
    })
  }

  function splitGroup(groupId: string, selectedRowId?: string) {
    mutate((next) => {
      const index = next.productGroups.findIndex((group) => group.groupId === groupId)
      if (index < 0 || next.productGroups[index].sizeQuantityRows.length < 2) return
      const source = next.productGroups[index]
      const rowIndex = selectedRowId
        ? source.sizeQuantityRows.findIndex((row) => row.rowId === selectedRowId)
        : source.sizeQuantityRows.length - 1
      if (rowIndex < 0) return
      const [movedRow] = source.sizeQuantityRows.splice(rowIndex, 1)
      const split = structuredClone(source)
      split.groupId = crypto.randomUUID()
      split.sizeQuantityRows = [movedRow]
      next.productGroups.splice(index + 1, 0, split)
      next.operations.push({
        action: 'GroupSplit',
        path: `/productGroups/${groupId}`,
        sourceIds: [groupId, movedRow.rowId],
        resultIds: [groupId, split.groupId],
        reason: 'Selected size row split into a separate production group',
      })
    })
  }

  function mergeWithPrevious(groupId: string) {
    mutate((next) => {
      const index = next.productGroups.findIndex((group) => group.groupId === groupId)
      if (index <= 0) return
      const previous = next.productGroups[index - 1]
      const current = next.productGroups[index]
      if (groupCompatibilityKey(previous) !== groupCompatibilityKey(current)) {
        setError('Groups can merge only when product, colour, supply, artwork, print configuration, notes, and pricing distinction match.')
        return
      }
      previous.sizeQuantityRows.push(...current.sizeQuantityRows)
      next.productGroups.splice(index, 1)
      next.operations.push({
        action: 'GroupMerged',
        path: `/productGroups/${previous.groupId}`,
        sourceIds: [previous.groupId, current.groupId],
        resultIds: [previous.groupId],
        reason: 'Compatible groups explicitly merged by staff',
      })
    })
  }

  function addRow(groupId: string) {
    mutate((next) => {
      const group = next.productGroups.find((item) => item.groupId === groupId)
      if (!group) return
      const rowId = crypto.randomUUID()
      group.sizeQuantityRows.push({
        rowId,
        size: emptyField<AiOrderControlledValue>(),
        quantity: emptyField<number>(),
        confirmedProductVariantId: null,
        compatibleVariants: [],
      })
      next.operations.push({
        action: 'RowAdded',
        path: `/productGroups/${groupId}/sizeQuantityRows/${rowId}`,
        sourceIds: [],
        resultIds: [rowId],
      })
    })
  }

  function removeRow(groupId: string, rowId: string) {
    mutate((next) => {
      const group = next.productGroups.find((item) => item.groupId === groupId)
      if (!group) return
      group.sizeQuantityRows = group.sizeQuantityRows.filter((row) => row.rowId !== rowId)
      next.operations.push({
        action: 'RowRemoved',
        path: `/productGroups/${groupId}/sizeQuantityRows/${rowId}`,
        sourceIds: [rowId],
        resultIds: [],
        reason: 'Removed during staff review',
      })
    })
  }

  function mergeDuplicateRows(groupId: string) {
    mutate((next) => {
      const group = next.productGroups.find((item) => item.groupId === groupId)
      if (!group) return
      const bySize = new Map<string, typeof group.sizeQuantityRows>()
      for (const row of group.sizeQuantityRows) {
        const key = row.size.staffValue?.label.trim().toUpperCase() ?? row.rowId
        bySize.set(key, [...(bySize.get(key) ?? []), row])
      }
      const merged = []
      for (const rows of bySize.values()) {
        const first = rows[0]
        if (rows.length > 1) {
          first.quantity = updateNumberField(
            first.quantity,
            rows.reduce((sum, row) => sum + (row.quantity.staffValue ?? 0), 0),
          )
          next.operations.push({
            action: 'RowMerged',
            path: `/productGroups/${groupId}/sizeQuantityRows/${first.rowId}`,
            sourceIds: rows.map((row) => row.rowId),
            resultIds: [first.rowId],
            reason: 'Duplicate sizes explicitly combined; quantities summed',
          })
        }
        merged.push(first)
      }
      group.sizeQuantityRows = merged
    })
  }

  function selectCatalogueProduct(
    groupId: string,
    product: {
      productId: string
      productName: string
      productKind: string
      pricingModel: string
      active: boolean
      variants?: AiOrderCompatibleVariant[]
    },
  ) {
    updateGroup(groupId, (group) => {
      group.productSelection = {
        ...group.productSelection,
        mode: 'Catalogue',
        selectedCatalogueProduct: {
          productId: product.productId,
          productName: product.productName,
          productKind: product.productKind,
          pricingModel: product.pricingModel,
          active: product.active,
        },
        adHocProduct: null,
        reason: group.productSelection.productCandidates.length > 1
          ? group.productSelection.reason ?? ''
          : group.productSelection.reason,
      }
      for (const row of group.sizeQuantityRows) {
        const candidates =
          product.variants ??
          row.variantCandidatesByProduct?.find(
            (candidate) => candidate.productId === product.productId,
          )?.variants ??
          []
        row.compatibleVariants = candidates.filter(
          (variant) =>
            variant.available &&
            equalText(variant.colour, group.colour.staffValue?.label) &&
            equalText(variant.size, row.size.staffValue?.label),
        )
        row.confirmedProductVariantId =
          row.compatibleVariants.length === 1
            ? row.compatibleVariants[0].productVariantId
            : null
      }
    })
    setCatalogueGroupId(undefined)
    setCatalogueQuery('')
    setCatalogueResults([])
  }

  function chooseAdHoc(groupId: string) {
    updateGroup(groupId, (group) => {
      group.productSelection = {
        ...group.productSelection,
        mode: 'AdHoc',
        selectedCatalogueProduct: null,
        adHocProduct: {
          ...group.productSelection.adHocProduct,
          displayName:
            group.productSelection.adHocProduct?.displayName ??
            group.writtenProductName.staffValue ??
            '',
          inventoryBehavior: 'NotTracked',
          confirmed: false,
          acknowledgedOrderOnly: false,
        },
      }
      group.sizeQuantityRows.forEach((row) => {
        row.confirmedProductVariantId = null
        row.compatibleVariants = []
      })
    })
  }

  async function runCatalogueSearch() {
    if (!catalogueGroupId || catalogueQuery.trim().length < 2) return
    setCatalogueSearching(true)
    setError(undefined)
    try {
      const items = await searchAiOrderCatalogue(importId, catalogueQuery)
      setCatalogueResults(items)
      setCatalogueCache((current) => ({
        ...current,
        ...Object.fromEntries(items.map((item) => [item.productId, item])),
      }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Catalogue search failed.')
    } finally {
      setCatalogueSearching(false)
    }
  }

  function navigateIssue(issue: AiOrderReviewIssue) {
    setGuided(false)
    setActiveTab('Order')
    const path = issue.paths[0]
    window.setTimeout(() => {
      let candidate = path
      let element: HTMLElement | null | undefined
      while (candidate && !element) {
        const selector = `[data-review-path="${cssEscape(candidate)}"]`
        element = mainRef.current?.querySelector<HTMLElement>(selector)
        candidate = candidate.slice(0, candidate.lastIndexOf('/'))
      }
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element?.focus({ preventScroll: true })
    }, 50)
  }

  function viewSource(refs?: AiOrderSourceReference[]) {
    const reference = refs?.[0]
    if (!reference) return
    setSelectedSourceId(reference.sourceDocumentId)
    setSelectedSourcePage(reference.page ?? 1)
    setSelectedSourceReference(reference)
    setActiveTab('Source')
    setZoom(1)
    setDisplayRotation(0)
  }

  async function saveDraft() {
    if (!review || !draft) return
    setSaving(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const saved = await saveAiOrderReview(importId, toSaveInput(review, draft))
      setReview(saved)
      setDraft(toDraft(saved))
      setDirty(false)
      setConflict(false)
      setNotice(
        `Draft saved. ${saved.blockingIssueCount} required item${saved.blockingIssueCount === 1 ? '' : 's'} still need attention.`,
      )
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setConflict(true)
        setError('This Draft changed in another tab. Your unsaved local changes are preserved here; reload latest before saving again.')
      } else {
        setError(reason instanceof Error ? reason.message : 'Draft could not be saved.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (!review || !draft || !intake) {
    return (
      <div className="admin-page">
        {error ? <ErrorBanner message={error} /> : <p className="text-sm text-black/50">Loading review workspace…</p>}
      </div>
    )
  }

  return (
    <div ref={mainRef} className="admin-page pb-28">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={`/admin/ai-order-imports/${importId}`}
            className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45 hover:text-black"
          >
            ← AI order intake
          </Link>
          <h1 className="mt-2 text-2xl text-black" style={{ fontWeight: 560, letterSpacing: '-0.96px' }}>
            AI Order Review
          </h1>
          <p className="mt-1 text-sm text-black/55">
            Compare private source evidence, correct the structured order, and save an incomplete Draft.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill label={review.status} />
          <StatusPill label={`Revision ${review.currentRevision}`} />
          <StatusPill
            label={review.confirmationReadiness.readyToConfirm ? 'Ready: Yes' : 'Ready: No'}
            tone={review.confirmationReadiness.readyToConfirm ? 'good' : 'attention'}
          />
        </div>
      </header>

      {error && <ErrorBanner message={error} />}
      {notice && (
        <div role="status" className="mb-4 rounded-2xl border border-black/[0.10] bg-black px-4 py-3 text-sm text-white">
          {notice}
        </div>
      )}
      {conflict && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-amber-950">
            Unsaved local changes remain in this tab for copying. Reloading will replace them with the latest server revision.
          </p>
          <button type="button" className={smallButton} onClick={() => void load()}>
            Reload latest
          </button>
        </div>
      )}

      <nav aria-label="Review workspace sections" className="mb-4 grid grid-cols-3 gap-2 xl:hidden">
        {(['Source', 'Order', 'Issues'] as WorkspaceTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            aria-current={activeTab === tab ? 'page' : undefined}
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-3 py-2 text-sm ${
              activeTab === tab ? 'bg-black text-white' : 'border border-black/[0.14] bg-white text-black'
            }`}
          >
            {tab}
            {tab === 'Issues' && ` (${review.blockingIssueCount})`}
          </button>
        ))}
      </nav>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(250px,0.8fr)_minmax(500px,1.65fr)_minmax(280px,0.9fr)]">
        <section
          aria-label="Source documents"
          className={`${activeTab === 'Source' ? 'block' : 'hidden'} min-w-0 xl:block`}
        >
          <SourcePanel
            importId={importId}
            documents={intake.sourceDocuments}
            selected={selectedSource}
            zoom={zoom}
            displayRotation={displayRotation}
            selectedPage={selectedSourcePage}
            focusReference={selectedSourceReference}
            onSelect={(document) => {
              setSelectedSourceId(document.id)
              setSelectedSourcePage(1)
              setSelectedSourceReference(undefined)
              setZoom(1)
              setDisplayRotation(0)
            }}
            onZoom={setZoom}
            onRotate={() => setDisplayRotation((current) => (current + 90) % 360)}
          />
        </section>

        <main
          aria-label="Structured order"
          className={`${activeTab === 'Order' ? 'block' : 'hidden'} min-w-0 space-y-4 xl:block`}
        >
          {guided ? (
            <GuidedPanel
              issue={guidedIssue}
              index={guidedIndex}
              count={actionableIssues.length}
              onPrevious={() => setGuidedIndex((current) => Math.max(0, current - 1))}
              onNext={() => setGuidedIndex((current) => Math.min(actionableIssues.length - 1, current + 1))}
              onClose={() => setGuided(false)}
              onNavigate={navigateIssue}
              onViewSource={viewSource}
            />
          ) : (
            <>
              <CustomerSection customer={draft.customer} onChange={updateCustomer} onViewSource={viewSource} />
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base text-black" style={{ fontWeight: 540 }}>Product groups</h2>
                    <p className="text-xs text-black/45">Size and quantity remain child rows; group quantity is derived.</p>
                  </div>
                  <button type="button" className={smallButton} onClick={addGroup}>Add group</button>
                </div>
                {draft.productGroups.map((group, index) => (
                  <ProductGroupCard
                    key={group.groupId}
                    group={group}
                    index={index}
                    groupCount={draft.productGroups.length}
                    catalogueCache={catalogueCache}
                    requiresQuantityReason={review.issues.some((issue) =>
                      issue.resolution.status === 'Open' &&
                      ['QUANTITY_SUM_MISMATCH', 'QUANTITY_MULTIPLE_VALUES', 'DUPLICATE_SIZE_ROW_UNCERTAIN'].includes(issue.code) &&
                      issue.paths.some((path) => path.startsWith(`/productGroups/${index}/`)))}
                    onUpdate={(change) => updateGroup(group.groupId, change)}
                    onRemove={() => removeGroup(group.groupId)}
                    onDuplicate={() => duplicateGroup(group.groupId)}
                    onMove={moveGroup}
                    onSplit={() => splitGroup(group.groupId)}
                    onSplitRow={(rowId) => splitGroup(group.groupId, rowId)}
                    onMergePrevious={() => mergeWithPrevious(group.groupId)}
                    onAddRow={() => addRow(group.groupId)}
                    onRemoveRow={(rowId) => removeRow(group.groupId, rowId)}
                    onMergeDuplicateRows={() => mergeDuplicateRows(group.groupId)}
                    onSelectProduct={(product) => selectCatalogueProduct(group.groupId, product)}
                    onUseAdHoc={() => chooseAdHoc(group.groupId)}
                    onOpenSearch={() => {
                      setCatalogueGroupId(group.groupId)
                      setCatalogueQuery('')
                      setCatalogueResults([])
                    }}
                    onViewSource={viewSource}
                  />
                ))}
              </div>
              <FinancialSection
                financials={draft.financials}
                requiresOrderReason={review.issues.some((issue) =>
                  issue.resolution.status === 'Open' &&
                  ['ORDER_TOTAL_MULTIPLE_VALUES', 'FINANCIAL_BALANCE_MISMATCH'].includes(issue.code))}
                requiresDepositReason={review.issues.some((issue) =>
                  issue.resolution.status === 'Open' &&
                  issue.code === 'DEPOSIT_MULTIPLE_VALUES')}
                onChange={(key, value) => mutate((next) => {
                  next.financials[key] = updateTextField(next.financials[key], value) as typeof next.financials[typeof key]
                })}
                onSetZero={() => mutate((next) => {
                  next.financials.depositPaid = updateTextField(next.financials.depositPaid, '0.00')
                })}
                onReason={(key, value) => mutate((next) => {
                  next.financials[key].reason = value
                })}
                onAccept={(key) => mutate((next) => {
                  next.financials[key].decision = 'Accepted'
                  next.financials[key].unresolved = false
                })}
                onViewSource={viewSource}
              />
            </>
          )}
        </main>

        <aside
          aria-label="Review issues"
          className={`${activeTab === 'Issues' ? 'block' : 'hidden'} min-w-0 xl:block`}
        >
          <IssuePanel
            issues={filteredIssues}
            blockingCount={review.blockingIssueCount}
            warningCount={review.warningCount}
            filter={issueFilter}
            onFilter={setIssueFilter}
            onNavigate={navigateIssue}
            onViewSource={viewSource}
            onAcceptWarning={(issueId, reason) => mutate((next) => {
              next.issueResolutions = [
                ...next.issueResolutions.filter((item) => item.issueId !== issueId),
                { issueId, decision: 'AcceptWarning', reason },
              ]
            })}
            onGuided={() => {
              setGuided(true)
              setGuidedIndex(0)
              setActiveTab('Order')
            }}
          />
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.10] bg-white/95 px-3 py-3 backdrop-blur md:pl-[244px]">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite" className="min-w-0">
            <p className="text-sm text-black" style={{ fontWeight: 520 }}>
              Ready to confirm: {review.confirmationReadiness.readyToConfirm ? 'Yes' : 'No'}
            </p>
            <p className="truncate text-xs text-black/50">{review.confirmationReadiness.message}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled
              title="Formal confirmation is owned by Jira 10207"
              className="rounded-full border border-black/[0.14] px-4 py-2 text-sm text-black/40"
            >
              Confirm Order
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveDraft()}
              className="rounded-full bg-black px-5 py-2 text-sm text-white disabled:opacity-40"
            >
              {saving ? 'Saving…' : dirty ? 'Save Draft' : 'Save Draft'}
            </button>
          </div>
        </div>
      </div>

      {catalogueGroupId && (
        <CatalogueSearchDialog
          query={catalogueQuery}
          results={catalogueResults}
          searching={catalogueSearching}
          onQuery={setCatalogueQuery}
          onSearch={() => void runCatalogueSearch()}
          onSelect={(product) => selectCatalogueProduct(catalogueGroupId, {
            productId: product.productId,
            productName: product.productName,
            productKind: product.productKind,
            pricingModel: product.pricingModel,
            active: product.isActive,
            variants: product.variants.map((variant) => ({
              ...variant,
              available: variant.isAvailable,
            })),
          })}
          onClose={() => setCatalogueGroupId(undefined)}
        />
      )}
    </div>
  )
}

function SourcePanel({
  importId,
  documents,
  selected,
  zoom,
  displayRotation,
  selectedPage,
  focusReference,
  onSelect,
  onZoom,
  onRotate,
}: {
  importId: string
  documents: AiOrderSourceDocument[]
  selected?: AiOrderSourceDocument
  zoom: number
  displayRotation: number
  selectedPage: number
  focusReference?: AiOrderSourceReference
  onSelect: (document: AiOrderSourceDocument) => void
  onZoom: (value: number) => void
  onRotate: () => void
}) {
  const index = selected ? documents.findIndex((document) => document.id === selected.id) : -1
  const sourceReference = focusReference
  let focusedRegion: [number, number, number, number] | undefined
  if (
    sourceReference &&
    sourceReference.sourceDocumentId === selected?.id &&
    validRegion(sourceReference.region)
  ) {
    focusedRegion = sourceReference.region
  }
  return (
    <div className="card sticky top-4 overflow-hidden">
      <div className="border-b border-black/[0.08] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm text-black" style={{ fontWeight: 540 }}>Source documents</h2>
          <span className="font-mono text-[10px] text-black/45">{documents.length}</span>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Source thumbnails">
          {documents.map((document) => (
            <button
              key={document.id}
              type="button"
              aria-label={`Open source ${document.sequence}`}
              aria-current={selected?.id === document.id}
              onClick={() => onSelect(document)}
              className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${
                selected?.id === document.id ? 'border-black' : 'border-black/[0.10]'
              }`}
            >
              {document.contentType.startsWith('image/') ? (
                // Private bytes are requested only through the authorized bridge.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sourceContentUrl(importId, document.id)} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="font-mono text-[9px] uppercase text-black/50">PDF {document.sequence}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-b border-black/[0.08] px-3 py-2">
        <div className="flex gap-1">
          <button type="button" className={smallButton} disabled={index <= 0} onClick={() => onSelect(documents[index - 1])}>Previous</button>
          <button type="button" className={smallButton} disabled={index < 0 || index >= documents.length - 1} onClick={() => onSelect(documents[index + 1])}>Next</button>
        </div>
        <div className="flex gap-1">
          <button type="button" className={smallButton} onClick={() => onZoom(Math.max(0.5, zoom - 0.25))} aria-label="Zoom out">−</button>
          <button type="button" className={smallButton} onClick={() => onZoom(Math.min(3, zoom + 0.25))} aria-label="Zoom in">+</button>
          <button type="button" className={smallButton} onClick={onRotate}>Rotate</button>
        </div>
      </div>
      <div className="h-[52vh] min-h-[360px] overflow-auto bg-black/[0.03]">
        {!selected ? (
          <p className="p-4 text-sm text-black/45">No source document is available.</p>
        ) : selected.contentType === 'application/pdf' ? (
          <iframe
            src={`${sourceContentUrl(importId, selected.id)}#page=${selectedPage}`}
            title={`Source ${selected.sequence} PDF`}
            className="h-full w-full"
          />
        ) : (
          <div className="flex min-h-full min-w-full items-center justify-center p-3">
            <div
              className="relative shrink-0 origin-center"
              style={{
                width: `${zoom * 100}%`,
                transform: `rotate(${selected.rotationDegrees + displayRotation}deg)`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sourceContentUrl(importId, selected.id)}
                alt={`Source ${selected.sequence}`}
                className="block h-auto w-full object-contain"
              />
              {focusedRegion && (
                  <span
                    aria-label="Referenced source region"
                    className="pointer-events-none absolute border-2 border-amber-500 bg-amber-300/20 shadow-[0_0_0_2px_rgba(255,255,255,0.85)]"
                    style={{
                      left: `${focusedRegion[0] * 100}%`,
                      top: `${focusedRegion[1] * 100}%`,
                      width: `${focusedRegion[2] * 100}%`,
                      height: `${focusedRegion[3] * 100}%`,
                    }}
                  />
                )}
            </div>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-xs text-black/55">
          {selected?.originalFileName ?? 'Private source'}
        </p>
        <p className="mt-1 text-[11px] text-black/40">
          {selected?.contentType === 'application/pdf' && `Requested page ${selectedPage} · `}
          {selected?.contentType !== 'application/pdf' && focusedRegion &&
            'Referenced region highlighted · '}
          Display rotation and zoom do not alter the original evidence.
        </p>
      </div>
    </div>
  )
}

function validRegion(
  region: number[] | undefined,
): region is [number, number, number, number] {
  return (
    region?.length === 4 &&
    region.every((value) => Number.isFinite(value) && value >= 0 && value <= 1) &&
    region[0] + region[2] <= 1 &&
    region[1] + region[3] <= 1
  )
}

function CustomerSection({
  customer,
  onChange,
  onViewSource,
}: {
  customer: AiOrderReview['customer']
  onChange: (key: keyof AiOrderReview['customer'], value: string) => void
  onViewSource: (refs?: AiOrderSourceReference[]) => void
}) {
  const fields: Array<[keyof typeof customer, string]> = [
    ['name', 'Customer name'],
    ['phone', 'Phone'],
    ['email', 'Email'],
    ['organisation', 'Company / organisation'],
    ['addressOrFulfilmentNotes', 'Address / fulfilment notes'],
  ]
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="text-base text-black" style={{ fontWeight: 540 }}>Customer</h2>
      <p className="mt-1 text-xs text-black/45">Optional in Jira 10206; no customer record is created or matched.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {fields.map(([key, label]) => (
          <FieldShell
            key={key}
            label={label}
            field={customer[key]}
            path={`/customer/${key}`}
            onViewSource={onViewSource}
          >
            <input
              value={customer[key].staffValue ?? ''}
              onChange={(event) => onChange(key, event.target.value)}
              className={inputClass}
              aria-label={label}
            />
          </FieldShell>
        ))}
      </div>
    </section>
  )
}

function ProductGroupCard({
  group,
  index,
  groupCount,
  requiresQuantityReason,
  onUpdate,
  onRemove,
  onDuplicate,
  onMove,
  onSplit,
  onSplitRow,
  onMergePrevious,
  onAddRow,
  onRemoveRow,
  onMergeDuplicateRows,
  onSelectProduct,
  onUseAdHoc,
  onOpenSearch,
  onViewSource,
}: {
  group: AiOrderReviewProductGroup
  index: number
  groupCount: number
  requiresQuantityReason: boolean
  catalogueCache: Record<string, AiOrderCatalogueSearchItem>
  onUpdate: (change: (group: AiOrderReviewProductGroup) => void) => void
  onRemove: () => void
  onDuplicate: () => void
  onMove: (groupId: string, direction: -1 | 1) => void
  onSplit: () => void
  onSplitRow: (rowId: string) => void
  onMergePrevious: () => void
  onAddRow: () => void
  onRemoveRow: (rowId: string) => void
  onMergeDuplicateRows: () => void
  onSelectProduct: (product: {
    productId: string
    productName: string
    productKind: string
    pricingModel: string
    active: boolean
  }) => void
  onUseAdHoc: () => void
  onOpenSearch: () => void
  onViewSource: (refs?: AiOrderSourceReference[]) => void
}) {
  const quantityTotal = group.sizeQuantityRows.reduce(
    (sum, row) => sum + (row.quantity.staffValue ?? 0),
    0,
  )
  const duplicateSizes = hasDuplicateSizes(group)
  return (
    <article className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-black/[0.08] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Product group {index + 1}</p>
          <p className="mt-1 text-sm text-black">{group.productSelection.selectedCatalogueProduct?.productName ?? group.productSelection.adHocProduct?.displayName ?? group.writtenProductName.staffValue ?? 'Unresolved product'}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={smallButton} disabled={index === 0} onClick={() => onMove(group.groupId, -1)}>Up</button>
          <button type="button" className={smallButton} disabled={index === groupCount - 1} onClick={() => onMove(group.groupId, 1)}>Down</button>
          <button type="button" className={smallButton} onClick={onDuplicate}>Duplicate</button>
          <button type="button" className={smallButton} disabled={group.sizeQuantityRows.length < 2} onClick={onSplit}>Split last row</button>
          <button type="button" className={smallButton} disabled={index === 0} onClick={onMergePrevious}>Merge previous</button>
          <button type="button" className={`${smallButton} border-red-200 text-red-700`} onClick={onRemove}>Remove</button>
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        <FieldShell
          label="Written / display product name"
          field={group.writtenProductName}
          path={`/productGroups/${index}/writtenProductName`}
          onViewSource={onViewSource}
        >
          <input
            value={group.writtenProductName.staffValue ?? ''}
            onChange={(event) => onUpdate((next) => {
              next.writtenProductName = updateTextField(next.writtenProductName, event.target.value)
            })}
            className={inputClass}
          />
        </FieldShell>

        <div
          tabIndex={-1}
          data-review-path={`/productGroups/${index}/productSelection`}
          className="rounded-2xl border border-black/[0.10] bg-black/[0.02] p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm text-black" style={{ fontWeight: 520 }}>Product selection</p>
              <p className="text-xs text-black/45">Candidates are advisory and never auto-selected.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={smallButton} onClick={onOpenSearch}>Search catalogue</button>
              <button type="button" className={smallButton} onClick={onUseAdHoc}>Use Ad-hoc Product</button>
            </div>
          </div>
          {group.productSelection.selectedCatalogueProduct && (
            <div className="mt-3 rounded-xl border border-black/[0.10] bg-white p-3 text-sm">
              <span className="font-medium">{group.productSelection.selectedCatalogueProduct.productName}</span>
              <span className="ml-2 text-xs text-black/45">{group.productSelection.selectedCatalogueProduct.productKind} · {group.productSelection.selectedCatalogueProduct.pricingModel}</span>
            </div>
          )}
          {group.productSelection.productCandidates.length > 0 && (
            <div className="mt-3 grid gap-2">
              {group.productSelection.productCandidates.map((candidate) => (
                <div key={candidate.productId} className="rounded-xl border border-black/[0.10] bg-white p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm text-black">{candidate.productName}</p>
                      <p className="mt-1 text-[11px] text-black/45">
                        {candidate.productKind} · {candidate.pricingModel} · score {candidate.score.toFixed(2)}
                      </p>
                      <p className="mt-1 text-xs text-black/55">{candidate.reasons.join(' · ')}</p>
                      {!candidate.active && <p className="mt-1 text-xs text-red-700">Inactive — selection is blocked.</p>}
                    </div>
                    <button
                      type="button"
                      disabled={!candidate.active}
                      className={smallButton}
                      onClick={() => onSelectProduct(candidate)}
                    >
                      Select
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {group.productSelection.productCandidates.length > 1 && (
            <label className="mt-3 block text-xs text-black/55">
              Reason for choosing between ambiguous candidates
              <input
                value={group.productSelection.reason ?? ''}
                onChange={(event) => onUpdate((next) => {
                  next.productSelection.reason = event.target.value
                })}
                className={inputClass}
              />
            </label>
          )}
        </div>

        {group.productSelection.mode === 'AdHoc' && (
          <AdHocEditor group={group} index={index} onUpdate={onUpdate} />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldShell
            label="Garment colour"
            field={group.colour}
            path={`/productGroups/${index}/colour`}
            onViewSource={onViewSource}
          >
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                value={group.colour.staffValue?.label ?? ''}
                onChange={(event) => onUpdate((next) => {
                  next.colour = updateControlledField(next.colour, {
                    kind: next.productSelection.mode === 'AdHoc' ? 'Named' : 'Named',
                    label: event.target.value,
                  })
                })}
                className={inputClass}
              />
              <button
                type="button"
                className={`${smallButton} mt-1`}
                onClick={() => onUpdate((next) => {
                  next.colour = updateControlledField(next.colour, {
                    kind: 'NotApplicable',
                    label: 'Not Applicable',
                  })
                })}
              >
                N/A
              </button>
            </div>
            {group.colour.unresolved &&
              group.colour.staffValue?.kind !== 'NotApplicable' &&
              group.productSelection.mode !== 'AdHoc' && (
                <button type="button" className={`${smallButton} mt-2`} onClick={() => onUpdate((next) => {
                  next.colour.decision = 'Accepted'
                  next.colour.unresolved = false
                })}>Accept extracted colour</button>
              )}
            {group.colour.staffValue &&
              (group.colour.staffValue.kind === 'NotApplicable' ||
                group.productSelection.mode === 'AdHoc') && (
                <ReasonInput
                  value={group.colour.reason}
                  onChange={(value) => onUpdate((next) => {
                    next.colour.reason = value
                    next.colour.decision = 'Confirmed'
                    next.colour.unresolved = false
                  })}
                  label="Reason / confirmation for custom colour"
                />
              )}
          </FieldShell>
          <FieldShell
            label="Supply source"
            field={group.supplySource}
            path={`/productGroups/${index}/supplySource`}
            onViewSource={onViewSource}
          >
            <select
              value={group.supplySource.staffValue ?? 'Unknown'}
              onChange={(event) => onUpdate((next) => {
                next.supplySource = updateTextField(next.supplySource, event.target.value)
              })}
              className={inputClass}
            >
              <option value="Unknown">Unknown</option>
              <option value="Shop">Shop supplied</option>
              <option value="Customer">Customer supplied</option>
            </select>
          </FieldShell>
          <FieldShell label="Artwork / design identity" field={group.artworkIdentity} path={`/productGroups/${index}/artworkIdentity`} onViewSource={onViewSource}>
            <input value={group.artworkIdentity.staffValue ?? ''} onChange={(event) => onUpdate((next) => { next.artworkIdentity = updateTextField(next.artworkIdentity, event.target.value) })} className={inputClass} />
          </FieldShell>
          <FieldShell label="Artwork description" field={group.artworkDescription} path={`/productGroups/${index}/artworkDescription`} onViewSource={onViewSource}>
            <input value={group.artworkDescription.staffValue ?? ''} onChange={(event) => onUpdate((next) => { next.artworkDescription = updateTextField(next.artworkDescription, event.target.value) })} className={inputClass} />
          </FieldShell>
          <FieldShell label="Production notes" field={group.productionNotes} path={`/productGroups/${index}/productionNotes`} onViewSource={onViewSource}>
            <textarea value={group.productionNotes.staffValue ?? ''} onChange={(event) => onUpdate((next) => { next.productionNotes = updateTextField(next.productionNotes, event.target.value) })} className={inputClass} rows={2} />
          </FieldShell>
        </div>

        <PrintEditor group={group} onUpdate={onUpdate} />

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm text-black" style={{ fontWeight: 520 }}>Size and quantity</h3>
              <p className="text-xs text-black/45">Group total: {quantityTotal}</p>
            </div>
            <div className="flex gap-2">
              {duplicateSizes && <button type="button" className={smallButton} onClick={onMergeDuplicateRows}>Merge duplicate sizes</button>}
              <button type="button" className={smallButton} onClick={onAddRow}>Add size row</button>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-black/[0.10]">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-black/[0.03] text-xs text-black/55">
                <tr>
                  <th className="px-3 py-2 font-normal">Size</th>
                  <th className="px-3 py-2 font-normal">Variant</th>
                  <th className="px-3 py-2 font-normal">Quantity</th>
                  <th className="px-3 py-2 font-normal">Status</th>
                  <th className="px-3 py-2 font-normal">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.08]">
                {group.sizeQuantityRows.map((row, rowIndex) => (
                  <tr key={row.rowId} data-review-path={`/productGroups/${index}/sizeQuantityRows/${rowIndex}`} tabIndex={-1}>
                    <td className="px-3 py-2 align-top">
                      <div className="flex gap-1">
                        <input
                          aria-label={`Size row ${rowIndex + 1}`}
                          value={row.size.staffValue?.label ?? ''}
                          onChange={(event) => onUpdate((next) => {
                            const target = next.sizeQuantityRows.find((item) => item.rowId === row.rowId)!
                            const kind =
                              event.target.value === 'One Size'
                                ? 'OneSize'
                                : next.productSelection.mode === 'AdHoc' ? 'Custom' : 'Catalogue'
                            target.size = updateControlledField(target.size, {
                              kind,
                              label: event.target.value,
                            })
                            if (kind === 'Custom') target.confirmedProductVariantId = null
                          })}
                          className="w-24 rounded-lg border border-black/[0.14] px-2 py-1.5"
                        />
                        <button
                          type="button"
                          className={smallButton}
                          onClick={() => onUpdate((next) => {
                            const target = next.sizeQuantityRows.find((item) => item.rowId === row.rowId)!
                            target.size = updateControlledField(target.size, { kind: 'OneSize', label: 'One Size' })
                          })}
                        >
                          One Size
                        </button>
                      </div>
                      {row.size.staffValue?.kind === 'Custom' && (
                        <input
                          aria-label={`Custom size reason ${rowIndex + 1}`}
                          placeholder="Custom size reason"
                          value={row.size.reason ?? ''}
                          onChange={(event) => onUpdate((next) => {
                            const target = next.sizeQuantityRows.find((item) => item.rowId === row.rowId)!
                            target.size.reason = event.target.value
                            target.size.decision = 'Confirmed'
                            target.size.unresolved = false
                          })}
                          className="mt-1 w-40 rounded-lg border border-black/[0.14] px-2 py-1 text-xs"
                        />
                      )}
                      {row.size.unresolved && row.size.staffValue?.kind !== 'Custom' && (
                        <button type="button" className={`${smallButton} mt-1`} onClick={() => onUpdate((next) => {
                          const target = next.sizeQuantityRows.find((item) => item.rowId === row.rowId)!
                          target.size.decision = 'Accepted'
                          target.size.unresolved = false
                        })}>Accept size</button>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {group.productSelection.mode === 'Catalogue' ? (
                        <select
                          aria-label={`Variant row ${rowIndex + 1}`}
                          value={row.confirmedProductVariantId ?? ''}
                          onChange={(event) => onUpdate((next) => {
                            next.sizeQuantityRows.find((item) => item.rowId === row.rowId)!.confirmedProductVariantId = event.target.value || null
                          })}
                          className="w-44 rounded-lg border border-black/[0.14] bg-white px-2 py-1.5"
                        >
                          <option value="">Select variant</option>
                          {row.compatibleVariants.map((variant) => (
                            <option key={variant.productVariantId} value={variant.productVariantId}>
                              {variant.sku} · {variant.colour} · {variant.size}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-black/45">Not applicable</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        aria-label={`Quantity row ${rowIndex + 1}`}
                        type="number"
                        min={1}
                        max={1000}
                        step={1}
                        value={row.quantity.staffValue ?? ''}
                        onChange={(event) => onUpdate((next) => {
                          const value = event.target.value === '' ? null : Number(event.target.value)
                          next.sizeQuantityRows.find((item) => item.rowId === row.rowId)!.quantity =
                            updateNumberField(row.quantity, value)
                        })}
                        className="w-24 rounded-lg border border-black/[0.14] px-2 py-1.5"
                      />
                      {requiresQuantityReason && (
                        <input
                          aria-label={`Quantity conflict reason row ${rowIndex + 1}`}
                          placeholder="Resolution reason"
                          value={row.quantity.reason ?? ''}
                          onChange={(event) => onUpdate((next) => {
                            next.sizeQuantityRows.find((item) => item.rowId === row.rowId)!.quantity.reason = event.target.value
                          })}
                          className="mt-1 w-36 rounded-lg border border-black/[0.14] px-2 py-1 text-xs"
                        />
                      )}
                      {row.quantity.unresolved && row.quantity.staffValue != null && (
                        <button type="button" className={`${smallButton} mt-1`} onClick={() => onUpdate((next) => {
                          const target = next.sizeQuantityRows.find((item) => item.rowId === row.rowId)!
                          target.quantity.decision = 'Accepted'
                          target.quantity.unresolved = false
                        })}>Accept quantity</button>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <FieldStatus field={row.quantity} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex gap-1">
                        <button type="button" disabled={group.sizeQuantityRows.length < 2} className={smallButton} onClick={() => onSplitRow(row.rowId)}>Split group</button>
                        <button type="button" className={`${smallButton} text-red-700`} onClick={() => onRemoveRow(row.rowId)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </article>
  )
}

function AdHocEditor({
  group,
  index,
  onUpdate,
}: {
  group: AiOrderReviewProductGroup
  index: number
  onUpdate: (change: (group: AiOrderReviewProductGroup) => void) => void
}) {
  const adHoc = group.productSelection.adHocProduct ?? {
    inventoryBehavior: 'NotTracked' as const,
    confirmed: false,
    acknowledgedOrderOnly: false,
  }
  return (
    <div data-review-path={`/productGroups/${index}/productSelection/adHocProduct`} tabIndex={-1} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-amber-950" style={{ fontWeight: 540 }}>Ad-hoc Product</p>
          <p className="mt-1 text-xs text-amber-900/70">Inventory behavior is fixed to NotTracked. No Product, ProductVariant, or SKU is created.</p>
        </div>
        <StatusPill label={adHoc.confirmed ? 'Confirmed' : 'Needs confirmation'} tone={adHoc.confirmed ? 'good' : 'attention'} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {([
          ['displayName', 'Display name'],
          ['brand', 'Brand'],
          ['supplierName', 'Supplier'],
          ['supplierCode', 'Supplier code'],
          ['supplySource', 'Supply source'],
        ] as const).map(([key, label]) => (
          <label key={key} className="text-xs text-black/55">
            {label}
            <input
              value={adHoc[key] ?? ''}
              onChange={(event) => onUpdate((next) => {
                next.productSelection.adHocProduct = {
                  ...(next.productSelection.adHocProduct ?? adHoc),
                  [key]: event.target.value,
                }
              })}
              className={inputClass}
            />
          </label>
        ))}
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm text-black">
        <input
          type="checkbox"
          checked={adHoc.acknowledgedOrderOnly}
          onChange={(event) => onUpdate((next) => {
            next.productSelection.adHocProduct = {
              ...(next.productSelection.adHocProduct ?? adHoc),
              acknowledgedOrderOnly: event.target.checked,
            }
          })}
          className="mt-0.5"
        />
        <span>This product will be saved only with this order and will not be added to the catalogue.</span>
      </label>
      <label className="mt-3 block text-xs text-black/55">
        Confirmation reason
        <input
          value={adHoc.reason ?? ''}
          onChange={(event) => onUpdate((next) => {
            next.productSelection.adHocProduct = {
              ...(next.productSelection.adHocProduct ?? adHoc),
              reason: event.target.value,
            }
          })}
          className={inputClass}
        />
      </label>
      <button
        type="button"
        disabled={!adHoc.displayName?.trim() || !adHoc.acknowledgedOrderOnly || !adHoc.reason?.trim()}
        onClick={() => onUpdate((next) => {
          next.productSelection.adHocProduct = {
            ...(next.productSelection.adHocProduct ?? adHoc),
            confirmed: true,
            inventoryBehavior: 'NotTracked',
          }
        })}
        className="mt-3 rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
      >
        Use as Ad-hoc Product
      </button>
    </div>
  )
}

function PrintEditor({
  group,
  onUpdate,
}: {
  group: AiOrderReviewProductGroup
  onUpdate: (change: (group: AiOrderReviewProductGroup) => void) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm text-black" style={{ fontWeight: 520 }}>Print configuration</h3>
        <button type="button" className={smallButton} onClick={() => onUpdate((next) => {
          next.printing.push({
            printId: crypto.randomUUID(),
            position: emptyField<string>(),
            printSize: emptyField<string>(),
            notes: emptyField<string>(),
          })
        })}>Add print</button>
      </div>
      {group.printing.length > 0 && (
        <div className="mt-3 space-y-2">
          {group.printing.map((print) => (
            <div key={print.printId} className="grid gap-2 rounded-xl bg-black/[0.03] p-3 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
              <input aria-label="Print position" placeholder="Position" value={print.position.staffValue ?? ''} onChange={(event) => onUpdate((next) => { const target = next.printing.find((item) => item.printId === print.printId)!; target.position = updateTextField(target.position, event.target.value) })} className="rounded-lg border border-black/[0.14] px-2 py-1.5 text-sm" />
              <input aria-label="Print size" placeholder="Print size" value={print.printSize.staffValue ?? ''} onChange={(event) => onUpdate((next) => { const target = next.printing.find((item) => item.printId === print.printId)!; target.printSize = updateTextField(target.printSize, event.target.value) })} className="rounded-lg border border-black/[0.14] px-2 py-1.5 text-sm" />
              <input aria-label="Print notes" placeholder="Notes" value={print.notes.staffValue ?? ''} onChange={(event) => onUpdate((next) => { const target = next.printing.find((item) => item.printId === print.printId)!; target.notes = updateTextField(target.notes, event.target.value) })} className="rounded-lg border border-black/[0.14] px-2 py-1.5 text-sm" />
              <button type="button" className={`${smallButton} text-red-700`} onClick={() => onUpdate((next) => { next.printing = next.printing.filter((item) => item.printId !== print.printId) })}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FinancialSection({
  financials,
  requiresOrderReason,
  requiresDepositReason,
  onChange,
  onSetZero,
  onReason,
  onAccept,
  onViewSource,
}: {
  financials: AiOrderReview['financials']
  requiresOrderReason: boolean
  requiresDepositReason: boolean
  onChange: (key: 'orderTotal' | 'depositPaid', value: string) => void
  onSetZero: () => void
  onReason: (key: 'orderTotal' | 'depositPaid', value: string) => void
  onAccept: (key: 'orderTotal' | 'depositPaid') => void
  onViewSource: (refs?: AiOrderSourceReference[]) => void
}) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="text-base text-black" style={{ fontWeight: 540 }}>Financials</h2>
      <p className="mt-1 text-xs text-black/45">Exact NZD cents. Balance Due is always server-derived; no payment is recorded.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <FieldShell label="Order Total" field={financials.orderTotal} path="/financials/orderTotal" onViewSource={onViewSource}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-3 text-sm text-black/45">$</span>
            <input inputMode="decimal" value={financials.orderTotal.staffValue ?? ''} onChange={(event) => onChange('orderTotal', event.target.value)} className={`${inputClass} pl-7`} />
          </div>
          {financials.orderTotal.unresolved && financials.orderTotal.staffValue != null && (
            <button type="button" className={`${smallButton} mt-2`} onClick={() => onAccept('orderTotal')}>Accept Order Total</button>
          )}
          {(requiresOrderReason || financials.orderTotal.decision === 'Corrected' || financials.orderTotal.cleared) && (
            <ReasonInput value={financials.orderTotal.reason} onChange={(value) => onReason('orderTotal', value)} label="Conflict / correction reason" />
          )}
        </FieldShell>
        <FieldShell label="Deposit Paid" field={financials.depositPaid} path="/financials/depositPaid" onViewSource={onViewSource}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-3 text-sm text-black/45">$</span>
            <input inputMode="decimal" value={financials.depositPaid.staffValue ?? ''} onChange={(event) => onChange('depositPaid', event.target.value)} className={`${inputClass} pl-7`} />
          </div>
          <button type="button" className={`${smallButton} mt-2`} onClick={onSetZero}>No deposit paid — set $0.00</button>
          {financials.depositPaid.unresolved && financials.depositPaid.staffValue != null && (
            <button type="button" className={`${smallButton} mt-2`} onClick={() => onAccept('depositPaid')}>Accept Deposit Paid</button>
          )}
          {(requiresDepositReason || financials.depositPaid.decision === 'Corrected' || financials.depositPaid.cleared) && (
            <ReasonInput value={financials.depositPaid.reason} onChange={(value) => onReason('depositPaid', value)} label="Conflict / correction reason" />
          )}
        </FieldShell>
      </div>
      <div className="mt-4 rounded-xl bg-black/[0.03] p-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">Balance Due</p>
        <p className="mt-1 text-lg text-black">
          {financials.balanceDue ? `$${financials.balanceDue.amount}` : 'Unavailable until both values are valid'}
        </p>
        <p className="mt-1 text-xs text-black/45">Server derivation status: {financials.derivationStatus}</p>
      </div>
    </section>
  )
}

function IssuePanel({
  issues,
  blockingCount,
  warningCount,
  filter,
  onFilter,
  onNavigate,
  onViewSource,
  onAcceptWarning,
  onGuided,
}: {
  issues: AiOrderReviewIssue[]
  blockingCount: number
  warningCount: number
  filter: IssueFilter
  onFilter: (filter: IssueFilter) => void
  onNavigate: (issue: AiOrderReviewIssue) => void
  onViewSource: (refs?: AiOrderSourceReference[]) => void
  onAcceptWarning: (issueId: string, reason: string) => void
  onGuided: () => void
}) {
  const [warningReasons, setWarningReasons] = useState<Record<string, string>>({})
  return (
    <div className="card sticky top-4 overflow-hidden">
      <div className="border-b border-black/[0.08] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm text-black" style={{ fontWeight: 540 }}>Issues</h2>
          <button type="button" className={smallButton} disabled={blockingCount + warningCount === 0} onClick={onGuided}>Guided mode</button>
        </div>
        <p className="mt-2 text-xs text-black/55" aria-live="polite">
          {blockingCount} blocking · {warningCount} warnings
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(['Blocking', 'Warning', 'Resolved', 'All'] as IssueFilter[]).map((option) => (
            <button key={option} type="button" aria-pressed={filter === option} onClick={() => onFilter(option)} className={`${smallButton} ${filter === option ? 'border-black bg-black text-white' : ''}`}>{option}</button>
          ))}
        </div>
      </div>
      <div className="max-h-[68vh] space-y-2 overflow-y-auto p-3">
        {issues.length === 0 ? (
          <p className="p-3 text-sm text-black/45">No issues in this filter.</p>
        ) : issues.map((issue) => (
          <article key={issue.issueId} className="rounded-xl border border-black/[0.10] p-3">
            <div className="flex items-start justify-between gap-2">
              <StatusPill label={`${issue.severity}: ${issue.category}`} tone={issue.severity === 'Blocking' ? 'bad' : issue.resolution.status === 'Open' ? 'attention' : 'good'} />
              <span className="font-mono text-[9px] text-black/35">{issue.code}</span>
            </div>
            <p className="mt-2 text-sm text-black">{issue.message}</p>
            <p className="mt-1 text-[11px] text-black/45">Status: {issue.resolution.status}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={smallButton} onClick={() => onNavigate(issue)}>Go to field</button>
              {(issue.sourceRefs?.length ?? 0) > 0 && <button type="button" className={smallButton} onClick={() => onViewSource(issue.sourceRefs)}>View source</button>}
            </div>
            {issue.severity === 'Warning' && issue.resolution.status === 'Open' && (
              <div className="mt-3">
                <input
                  aria-label={`Reason to accept ${issue.code}`}
                  placeholder="Reason to accept warning"
                  value={warningReasons[issue.issueId] ?? ''}
                  onChange={(event) => setWarningReasons((current) => ({ ...current, [issue.issueId]: event.target.value }))}
                  className="w-full rounded-lg border border-black/[0.14] px-2 py-1.5 text-xs"
                />
                <button type="button" disabled={!warningReasons[issue.issueId]?.trim()} className={`${smallButton} mt-2`} onClick={() => onAcceptWarning(issue.issueId, warningReasons[issue.issueId])}>Accept Warning</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}

function GuidedPanel({
  issue,
  index,
  count,
  onPrevious,
  onNext,
  onClose,
  onNavigate,
  onViewSource,
}: {
  issue?: AiOrderReviewIssue
  index: number
  count: number
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
  onNavigate: (issue: AiOrderReviewIssue) => void
  onViewSource: (refs?: AiOrderSourceReference[]) => void
}) {
  return (
    <section className="card p-5 sm:p-7">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.54px] text-black/45">
          {count === 0 ? 'Complete' : `Question ${index + 1} of ${count}`}
        </p>
        <button type="button" className={smallButton} onClick={onClose}>Full form</button>
      </div>
      {issue ? (
        <>
          <StatusPill label={`${issue.severity}: ${issue.category}`} tone={issue.severity === 'Blocking' ? 'bad' : 'attention'} />
          <h2 className="mt-4 text-xl text-black" style={{ fontWeight: 540 }}>{issue.message}</h2>
          <p className="mt-2 text-sm text-black/50">Open the relevant control in the full form, make the correction, then Save Draft to rerun validation.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="rounded-full bg-black px-4 py-2 text-sm text-white" onClick={() => onNavigate(issue)}>Open field</button>
            {(issue.sourceRefs?.length ?? 0) > 0 && <button type="button" className={smallButton} onClick={() => onViewSource(issue.sourceRefs)}>View source</button>}
          </div>
          <div className="mt-8 flex justify-between">
            <button type="button" className={smallButton} disabled={index === 0} onClick={onPrevious}>Previous</button>
            <button type="button" className={smallButton} disabled={issue.severity === 'Blocking' && index === count - 1} onClick={onNext}>Next issue</button>
          </div>
        </>
      ) : (
        <div className="py-16 text-center">
          <p className="text-lg text-black">No open issues.</p>
          <p className="mt-1 text-sm text-black/45">Return to the full form to review the complete Draft.</p>
        </div>
      )}
    </section>
  )
}

function CatalogueSearchDialog({
  query,
  results,
  searching,
  onQuery,
  onSearch,
  onSelect,
  onClose,
}: {
  query: string
  results: AiOrderCatalogueSearchItem[]
  searching: boolean
  onQuery: (value: string) => void
  onSearch: () => void
  onSelect: (item: AiOrderCatalogueSearchItem) => void
  onClose: () => void
}) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Search catalogue" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-base text-black" style={{ fontWeight: 540 }}>Search catalogue</h2>
            <p className="text-xs text-black/45">Exact product name, variant SKU, or bounded name search.</p>
          </div>
          <button type="button" className={smallButton} onClick={onClose}>Close</button>
        </div>
        <form className="flex gap-2 border-b p-4" onSubmit={(event) => { event.preventDefault(); onSearch() }}>
          <input autoFocus value={query} onChange={(event) => onQuery(event.target.value)} className={`${inputClass} mt-0`} placeholder="Product name or variant SKU" />
          <button type="submit" disabled={searching || query.trim().length < 2} className="rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-40">{searching ? 'Searching…' : 'Search'}</button>
        </form>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
          {results.map((item) => (
            <article key={item.productId} className="rounded-xl border border-black/[0.10] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-black">{item.productName}</p>
                  <p className="mt-1 text-xs text-black/45">{item.productKind} · {item.pricingModel} · {item.matchKind}</p>
                  <p className="mt-1 text-xs text-black/55">
                    {item.variants.filter((variant) => variant.isAvailable).length} available variants
                  </p>
                  {!item.isActive && <p className="mt-1 text-xs text-red-700">Inactive product — cannot be selected.</p>}
                </div>
                <button type="button" className={smallButton} disabled={!item.isActive} onClick={() => onSelect(item)}>Select</button>
              </div>
            </article>
          ))}
          {results.length === 0 && !searching && <p className="py-8 text-center text-sm text-black/45">Search results are bounded and read-only.</p>}
        </div>
      </div>
    </div>
  )
}

function FieldShell<T>({
  label,
  field,
  path,
  onViewSource,
  children,
}: {
  label: string
  field: AiOrderReviewField<T>
  path: string
  onViewSource: (refs?: AiOrderSourceReference[]) => void
  children: ReactNode
}) {
  return (
    <div data-review-path={path} tabIndex={-1} className="min-w-0 rounded-xl outline-none focus:ring-2 focus:ring-black/20">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs text-black/55">{label}</label>
        <FieldStatus field={field} />
      </div>
      {children}
      <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
        <p className="truncate text-[11px] text-black/40">
          Source: {field.sourceText ?? displayValue(field.sourceValue) ?? 'No source evidence'}
        </p>
        {field.sourceRefs.length > 0 && (
          <button type="button" className="shrink-0 text-[11px] underline" onClick={() => onViewSource(field.sourceRefs)}>View source</button>
        )}
      </div>
    </div>
  )
}

function FieldStatus({ field }: { field: AiOrderReviewField<unknown> }) {
  const state = field.staffValue == null
    ? 'Missing'
    : field.unresolved
      ? 'Needs confirmation'
      : field.decision === 'Corrected'
        ? 'Corrected'
        : 'Valid'
  const tone = state === 'Valid'
    ? 'bg-emerald-50 text-emerald-800'
    : state === 'Corrected'
      ? 'bg-blue-50 text-blue-800'
      : state === 'Needs confirmation'
        ? 'bg-amber-50 text-amber-800'
        : 'bg-red-50 text-red-800'
  return <span className={`rounded-full px-2 py-0.5 text-[10px] ${tone}`}>{state}</span>
}

function StatusPill({
  label,
  tone = 'neutral',
}: {
  label: string
  tone?: 'neutral' | 'good' | 'attention' | 'bad'
}) {
  const style = {
    neutral: 'border-black/[0.10] bg-white text-black/55',
    good: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    attention: 'border-amber-200 bg-amber-50 text-amber-800',
    bad: 'border-red-200 bg-red-50 text-red-800',
  }[tone]
  return <span className={`w-fit rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.4px] ${style}`}>{label}</span>
}

function ErrorBanner({ message }: { message: string }) {
  return <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>
}

function ReasonInput({
  value,
  onChange,
  label,
  readOnly = false,
}: {
  value?: string | null
  onChange: (value: string) => void
  label: string
  readOnly?: boolean
}) {
  return (
    <label className="mt-2 block text-[11px] text-black/50">
      {label}
      <input readOnly={readOnly} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded-lg border border-black/[0.14] px-2 py-1.5 text-xs" />
    </label>
  )
}

function toDraft(review: AiOrderReview): DraftState {
  return {
    customer: structuredClone(review.customer),
    productGroups: structuredClone(review.productGroups),
    financials: structuredClone(review.financials),
    issueResolutions: structuredClone(review.issueResolutions),
    operations: [],
  }
}

function toSaveInput(review: AiOrderReview, draft: DraftState): AiOrderReviewSaveInput {
  return {
    expectedRevision: review.currentRevision,
    reviewVersion: 'ai-order-staff-review-v1',
    customer: {
      name: textInput(draft.customer.name),
      phone: textInput(draft.customer.phone),
      email: textInput(draft.customer.email),
      organisation: textInput(draft.customer.organisation),
      addressOrFulfilmentNotes: textInput(draft.customer.addressOrFulfilmentNotes),
    },
    productGroups: draft.productGroups.map(groupInput),
    financials: {
      orderTotal: textInput(draft.financials.orderTotal),
      depositPaid: textInput(draft.financials.depositPaid),
    },
    issueResolutions: draft.issueResolutions,
    operations: draft.operations,
  }
}

function groupInput(group: AiOrderReviewProductGroup): AiOrderReviewProductGroupInput {
  return {
    groupId: group.groupId,
    writtenProductName: textInput(group.writtenProductName),
    productSelection: {
      mode: group.productSelection.mode,
      catalogueProductId: group.productSelection.selectedCatalogueProduct?.productId,
      reason: group.productSelection.reason,
      adHocProduct: group.productSelection.adHocProduct
        ? {
            displayName: group.productSelection.adHocProduct.displayName,
            brand: group.productSelection.adHocProduct.brand,
            supplierName: group.productSelection.adHocProduct.supplierName,
            supplierCode: group.productSelection.adHocProduct.supplierCode,
            supplySource: group.productSelection.adHocProduct.supplySource,
            confirmed: group.productSelection.adHocProduct.confirmed,
            acknowledgedOrderOnly: group.productSelection.adHocProduct.acknowledgedOrderOnly,
            reason: group.productSelection.adHocProduct.reason,
          }
        : null,
    },
    colour: controlledInput(group.colour),
    supplySource: textInput(group.supplySource),
    artworkIdentity: textInput(group.artworkIdentity),
    artworkDescription: textInput(group.artworkDescription),
    productionNotes: textInput(group.productionNotes),
    printing: group.printing.map((print) => ({
      printId: print.printId,
      position: textInput(print.position),
      printSize: textInput(print.printSize),
      notes: textInput(print.notes),
    })),
    sizeQuantityRows: group.sizeQuantityRows.map((row) => ({
      rowId: row.rowId,
      size: controlledInput(row.size),
      quantity: row.quantity.staffValue,
      quantityDecision: row.quantity.decision,
      quantityReason: row.quantity.reason,
      confirmedProductVariantId: row.confirmedProductVariantId,
    })),
  }
}

function textInput(field: AiOrderReviewField<string>) {
  return {
    staffValue: field.staffValue,
    decision: field.decision,
    reason: field.reason,
  }
}

function controlledInput(field: AiOrderReviewField<AiOrderControlledValue>) {
  return {
    kind: field.staffValue?.kind,
    label: field.staffValue?.label,
    decision: field.decision,
    reason: field.reason,
  }
}

function updateTextField<T extends AiOrderReviewField<string>>(field: T, value: string): T {
  const normalized = value.trim() === '' ? null : value
  return {
    ...field,
    staffValue: normalized,
    decision: decisionFor(field, normalized),
    cleared: normalized == null && field.normalizedValue != null,
    unresolved: normalized == null,
  }
}

function updateNumberField(field: AiOrderReviewField<number>, value: number | null): AiOrderReviewField<number> {
  return {
    ...field,
    staffValue: value,
    decision: decisionFor(field, value),
    cleared: value == null && field.normalizedValue != null,
    unresolved: value == null,
  }
}

function updateControlledField(
  field: AiOrderReviewField<AiOrderControlledValue>,
  value: AiOrderControlledValue,
): AiOrderReviewField<AiOrderControlledValue> {
  const needsConfirmation = value.kind === 'Custom' || value.kind === 'NotApplicable'
  return {
    ...field,
    staffValue: value.label.trim() ? value : null,
    decision: needsConfirmation ? 'Unresolved' : decisionFor(field, value),
    cleared: !value.label.trim() && field.normalizedValue != null,
    unresolved: !value.label.trim() || needsConfirmation,
  }
}

function decisionFor<T>(field: AiOrderReviewField<T>, value: T | null): AiOrderReviewDecision {
  if (value == null) return field.normalizedValue == null ? 'Unresolved' : 'Cleared'
  return JSON.stringify(value) === JSON.stringify(field.normalizedValue) ? 'Accepted' : 'Corrected'
}

function emptyField<T>(): AiOrderReviewField<T> {
  return {
    sourceValue: null,
    normalizedValue: null,
    staffValue: null,
    decision: 'Unresolved',
    sourceRefs: [],
    cleared: false,
    unresolved: true,
  }
}

function newGroup(): AiOrderReviewProductGroup {
  return {
    groupId: crypto.randomUUID(),
    writtenProductName: emptyField<string>(),
    productSelection: {
      mode: 'Unresolved',
      selectedCatalogueProduct: null,
      adHocProduct: null,
      productCandidates: [],
    },
    colour: emptyField<AiOrderControlledValue>(),
    supplySource: {
      ...emptyField<string>(),
      staffValue: 'Unknown',
      decision: 'Accepted',
      unresolved: false,
    },
    artworkIdentity: emptyField<string>(),
    artworkDescription: emptyField<string>(),
    productionNotes: emptyField<string>(),
    printing: [],
    sizeQuantityRows: [{
      rowId: crypto.randomUUID(),
      size: emptyField<AiOrderControlledValue>(),
      quantity: emptyField<number>(),
      confirmedProductVariantId: null,
      compatibleVariants: [],
    }],
    sourceEvidence: [],
  }
}

function groupCompatibilityKey(group: AiOrderReviewProductGroup): string {
  return JSON.stringify({
    product: group.productSelection.selectedCatalogueProduct?.productId ??
      group.productSelection.adHocProduct?.adHocProductId ??
      group.productSelection.adHocProduct?.displayName ??
      null,
    colour: group.colour.staffValue,
    supply: group.supplySource.staffValue,
    artwork: group.artworkIdentity.staffValue,
    description: group.artworkDescription.staffValue,
    notes: group.productionNotes.staffValue,
    printing: group.printing.map((print) => ({
      position: print.position.staffValue,
      size: print.printSize.staffValue,
      notes: print.notes.staffValue,
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  })
}

function hasDuplicateSizes(group: AiOrderReviewProductGroup): boolean {
  const sizes = group.sizeQuantityRows
    .map((row) => row.size.staffValue?.label.trim().toUpperCase())
    .filter(Boolean)
  return new Set(sizes).size !== sizes.length
}

function displayValue(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object' && 'label' in value) return String((value as { label: unknown }).label)
  return null
}

function equalText(left?: string | null, right?: string | null): boolean {
  return left?.trim().toUpperCase() === right?.trim().toUpperCase()
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function isConfirmationControlDisabled(
  readiness: AiOrderConfirmationReadiness,
): boolean {
  return !readiness.readyToConfirm || readiness.confirmOrderEnabled === false
}
