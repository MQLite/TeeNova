import { JsonLd } from '@/components/seo/JsonLd'
import { publicContentHref } from '@/lib/public-content/registry'
import type { PublicContentDocument, PublicContentSection } from '@/lib/public-content/types'
import { buildBreadcrumbList } from '@/lib/seo/structured-data/breadcrumb'
import { buildFaqPage } from '@/lib/seo/structured-data/faq'

/**
 * Structured data for a help or policy document (Jira 10308 Phases 10–11).
 *
 * Shared by `/help/[slug]` and `/policies/[slug]` so both routes describe themselves the same way.
 *
 * ## FAQ eligibility
 *
 * `FAQPage` is emitted for one document — the FAQ — and only from the sections the page actually
 * rendered. In this content model each question is its own section carrying its own `status`, and
 * the publication gate has already dropped the Draft ones by the time these sections arrive here.
 * So the markup is, by construction, the subset of questions a visitor can read, in the same words.
 * Questions whose answer is a business decision (delivery, collection, price amounts) are Draft and
 * appear in neither.
 *
 * Only paragraph blocks contribute answer text: the other block kinds (tables, notices, definition
 * lists) are structural, and flattening a size table into a sentence would produce an answer that
 * does not match what is on the page. A question whose visible answer is entirely non-paragraph
 * content is skipped rather than approximated.
 *
 * Emitting this markup does not entitle the page to an FAQ rich result — Google shows that
 * treatment to a narrow set of sites, and may show nothing. Nothing here promises otherwise.
 */

const FAQ_SLUG = 'faq'

/** Visible paragraph text of a section, joined as the answer. Empty when there is none. */
function paragraphText(section: PublicContentSection): string {
  return section.blocks
    .map((block) => (block.kind === 'paragraph' ? block.text.trim() : ''))
    .filter((text) => text.length > 0)
    .join('\n\n')
}

export function ContentStructuredData({
  document,
  sections,
  isDraftPreview,
}: {
  document: PublicContentDocument
  sections: PublicContentSection[]
  isDraftPreview: boolean
}) {
  // A draft preview is `noindex` and shows unapproved wording; it describes itself to nobody.
  if (isDraftPreview) return null

  const path = publicContentHref(document)
  const groupLabel = document.group === 'help' ? 'Help' : 'Policies'

  const faqEntries =
    document.group === 'help' && document.slug === FAQ_SLUG
      ? sections
          .map((section) => ({ question: section.heading, answer: paragraphText(section) }))
          .filter((entry) => entry.answer.length > 0)
      : []

  return (
    <JsonLd
      graph={[
        // Mirrors `ContentBreadcrumb`: Home / Help|Policies / title. The middle crumb is plain text
        // on the page — there is no group index route — and is unlinked here for the same reason.
        buildBreadcrumbList(path, [
          { name: 'Home', path: '/' },
          { name: groupLabel },
          { name: document.title },
        ]),
        buildFaqPage(path, faqEntries, { indexable: true }),
      ]}
    />
  )
}
