/**
 * `FAQPage` (Jira 10308 Phase 11).
 *
 * Emitted only for questions and answers a visitor can read on the same page, in the same words.
 * The builder takes the already-gated, already-rendered entries — the ones the publication gate let
 * through — so a Draft answer cannot reach the graph even if a future caller forgets to filter,
 * and no answer exists in the markup that is missing from the page.
 *
 * Answers are plain text. The public content model has no HTML strings, so nothing is stripped,
 * sanitized or re-parsed here; whatever the page renders is what is serialized.
 *
 * A note on expectations: emitting valid `FAQPage` markup does not entitle a page to an FAQ rich
 * result. Google restricts that treatment to a narrow set of sites and may show nothing at all.
 * Nothing in this repository should be read as promising the rich result.
 */

import { faqId } from './ids'
import { optionalText, type FaqPageNode, type QuestionNode } from './types'

export interface FaqEntryInput {
  question: string
  answer: string
}

/**
 * Build the node from visible published entries, or `null` when there is nothing to describe.
 *
 * `indexable` is passed explicitly: structured data on a `noindex` page is wasted at best and
 * contradictory at worst, so a draft preview or a feature-disabled route emits nothing.
 */
export function buildFaqPage(
  path: string,
  entries: readonly FaqEntryInput[],
  options: { indexable: boolean },
): FaqPageNode | null {
  if (!options.indexable) return null
  const id = faqId(path)
  if (!id) return null

  const mainEntity: QuestionNode[] = []
  for (const entry of entries) {
    const name = optionalText(entry.question)
    const text = optionalText(entry.answer)
    // A question with no answer is not an FAQ entry; skip it rather than emit an empty Answer.
    if (!name || !text) continue
    mainEntity.push({
      '@type': 'Question',
      name,
      acceptedAnswer: { '@type': 'Answer', text },
    })
  }

  if (mainEntity.length === 0) return null
  return { '@type': 'FAQPage', '@id': id, mainEntity }
}
