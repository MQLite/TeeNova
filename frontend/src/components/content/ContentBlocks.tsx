import type { ContentBlock } from '@/lib/public-content/types'

/**
 * Renderers for the typed content blocks (Jira 10303).
 *
 * These are server components with no client JavaScript: policy and help pages are static text.
 * Content is always rendered as React children — `dangerouslySetInnerHTML` is never used, so a
 * content module cannot inject markup.
 */

function ContentTable({ block }: { block: Extract<ContentBlock, { kind: 'table' }> }) {
  return (
    // Wide tables scroll inside their own container so the page body never scrolls sideways.
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <caption className="mb-3 text-left text-sm text-ink-muted">{block.caption}</caption>
        <thead>
          <tr>
            {block.columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="border-b border-line-strong px-3 py-2 text-sm font-semibold text-ink"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.join('|')}>
              {row.map((cell, index) => (
                <td
                  key={`${row.join('|')}-${index}`}
                  className="border-b border-line px-3 py-2 align-top text-ink-secondary"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ContentNotice({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'caution'
  title?: string
  children: React.ReactNode
}) {
  // Tone is carried by the border, the heading text and the wording itself — never by colour alone.
  const toneClass =
    tone === 'caution'
      ? 'border-warning-border bg-warning-surface'
      : 'border-line-strong bg-surface-sunken'
  return (
    <aside className={`mt-5 rounded-xl border-l-4 p-4 ${toneClass}`}>
      {title && (
        <p className="text-sm text-ink font-semibold">
          {tone === 'caution' ? `Important: ${title}` : title}
        </p>
      )}
      <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{children}</p>
    </aside>
  )
}

export function ContentBlockView({ block }: { block: ContentBlock }) {
  switch (block.kind) {
    case 'paragraph':
      return (
        <p className="mt-4 text-base leading-relaxed text-ink-secondary">
          {block.text}
        </p>
      )
    case 'list': {
      const items = block.items.map((item) => (
        <li key={item} className="text-base leading-relaxed text-ink-secondary">
          {item}
        </li>
      ))
      return block.ordered ? (
        <ol className="mt-4 list-decimal space-y-2 pl-5">{items}</ol>
      ) : (
        <ul className="mt-4 list-disc space-y-2 pl-5">{items}</ul>
      )
    }
    case 'definitions':
      return (
        <dl className="mt-4 space-y-3">
          {block.items.map((item) => (
            <div key={item.term}>
              <dt className="text-base text-ink font-semibold">
                {item.term}
              </dt>
              <dd className="text-base leading-relaxed text-ink-secondary">{item.description}</dd>
            </div>
          ))}
        </dl>
      )
    case 'table':
      return <ContentTable block={block} />
    case 'notice':
      return (
        <ContentNotice tone={block.tone} title={block.title}>
          {block.text}
        </ContentNotice>
      )
  }
}
