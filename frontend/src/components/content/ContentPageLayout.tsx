import Link from 'next/link'
import { ContentBlockView } from './ContentBlocks'
import { publicContentHref } from '@/lib/public-content/registry'
import type { PublicContentDocument, PublicContentSection } from '@/lib/public-content/types'

/**
 * Shared page furniture for policy and help documents (Jira 10303).
 *
 * Everything here is a server component. There is no client JavaScript on a policy page: the table
 * of contents is plain in-page anchors, so it works with JavaScript disabled and is reachable by
 * keyboard without any custom handling. The page renders exactly one `<h1>`, section headings are
 * `<h2>`, and the measure is capped so long policy text stays readable.
 */

const GROUP_LABEL: Record<PublicContentDocument['group'], string> = {
  help: 'Help',
  policies: 'Policies',
}

function formatReviewDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`)
  return new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed)
}

export function ContentBreadcrumb({ document }: { document: PublicContentDocument }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <li>
          <Link href="/" className="underline underline-offset-2 hover:text-ink">
            Home
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>{GROUP_LABEL[document.group]}</li>
        <li aria-hidden="true">/</li>
        <li>
          <span aria-current="page" className="text-ink-secondary">
            {document.title}
          </span>
        </li>
      </ol>
    </nav>
  )
}

export function DraftContentBanner({ document }: { document: PublicContentDocument }) {
  return (
    <div
      role="note"
      aria-label="Draft content preview"
      className="mt-6 rounded-xl border-2 border-dashed border-ink bg-surface-sunken p-4"
    >
      <p className="eyebrow text-ink-secondary">
        Draft — not published
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        This page is unapproved content shown only outside production. In production it returns a
        404 and is absent from site navigation.
      </p>
      {document.draftReason && (
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{document.draftReason}</p>
      )}
    </div>
  )
}

export function ContentLastReviewed({ document }: { document: PublicContentDocument }) {
  if (!document.lastReviewedAt) return null
  return (
    <p className="mt-4 text-sm text-ink-muted">
      Last reviewed{' '}
      <time dateTime={document.lastReviewedAt}>{formatReviewDate(document.lastReviewedAt)}</time>
      {document.effectiveFrom && (
        <>
          {' · effective from '}
          <time dateTime={document.effectiveFrom}>{formatReviewDate(document.effectiveFrom)}</time>
        </>
      )}
    </p>
  )
}

export function ContentTableOfContents({ sections }: { sections: PublicContentSection[] }) {
  if (sections.length < 2) return null
  return (
    <nav aria-labelledby="on-this-page" className="mt-10 rounded-xl border border-line p-5">
      <h2 id="on-this-page" className="eyebrow text-ink-muted">
        On this page
      </h2>
      <ul className="mt-3 space-y-2">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="text-sm text-ink-secondary underline underline-offset-2 hover:text-ink"
            >
              {section.heading}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function ContentSectionView({ section }: { section: PublicContentSection }) {
  return (
    // tabIndex -1 makes the section focusable when reached from the table of contents, so keyboard
    // focus follows the anchor instead of staying at the top of the page.
    <section id={section.id} tabIndex={-1} className="mt-12 scroll-mt-24">
      <h2 className="display-section text-2xl sm:text-3xl">{section.heading}</h2>
      {section.blocks.map((block, index) => (
        <ContentBlockView key={`${section.id}-${index}`} block={block} />
      ))}
    </section>
  )
}

export function RelatedContentLinks({ documents }: { documents: PublicContentDocument[] }) {
  if (documents.length === 0) return null
  return (
    <nav aria-labelledby="related-content" className="mt-16 border-t border-line pt-8">
      <h2 id="related-content" className="eyebrow text-ink-muted">
        Related
      </h2>
      <ul className="mt-3 space-y-2">
        {documents.map((document) => (
          <li key={`${document.group}/${document.slug}`}>
            <Link
              href={publicContentHref(document)}
              className="text-base text-ink-secondary underline underline-offset-2 hover:text-ink"
            >
              {document.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function ContentPageLayout({
  document,
  sections,
  isDraftPreview,
  related,
}: {
  document: PublicContentDocument
  sections: PublicContentSection[]
  isDraftPreview: boolean
  related: PublicContentDocument[]
}) {
  return (
    // No `<main>` here: the root layout owns the single `main` landmark (Jira 10307).
    <div className="section-container py-10 sm:py-14">
      {/* `content-measure` keeps the reading column near 70 characters at the base font size. */}
      <div className="content-measure">
        <ContentBreadcrumb document={document} />
        <p className="mt-6 eyebrow">{document.classification}</p>
        <h1 className="display-page mt-3">{document.title}</h1>
        <p className="mt-4 text-base leading-relaxed text-ink-secondary">
          {document.description}
        </p>
        {isDraftPreview && <DraftContentBanner document={document} />}
        <ContentLastReviewed document={document} />
        <ContentTableOfContents sections={sections} />
        {sections.map((section) => (
          <ContentSectionView key={section.id} section={section} />
        ))}
        <RelatedContentLinks documents={related} />
      </div>
    </div>
  )
}
