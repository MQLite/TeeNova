import { ContentNotice } from '@/components/content/ContentBlocks'
import type {
  ApprovedServiceFact,
  ServiceFacts,
  ServiceMinimumQuantityValue,
  ServicePriceValue,
  ServiceSpecificationEntry,
} from '@/lib/service-content/types'

/**
 * Renderers for the approval-controlled commercial facts (Jira 10306).
 *
 * Every renderer here is reached only with facts that already passed `renderableFacts`. The rule
 * these components add is the presentational half of the same promise: an absent fact renders
 * **nothing** — no heading, no empty table row, no "contact us for pricing" filler. A customer
 * reading the page sees a shorter page, not a page full of gaps.
 */

/**
 * `NZ$`, never a bare `$`. `formatMoneyNZD` in `lib/pricing.ts` is deliberately not reused: it
 * emits a bare `$` for the commerce surfaces, and changing it would touch a pricing path.
 */
export function formatServicePriceNzd(amount: number): string {
  return `NZ$${amount.toFixed(2)}`
}

export function servicePriceText(value: ServicePriceValue): string | null {
  switch (value.kind) {
    case 'quote-only':
      return null
    case 'from':
      return `From ${formatServicePriceNzd(value.amount)}${value.unit ? ` ${value.unit}` : ''}`
    case 'per-unit':
      return `${formatServicePriceNzd(value.amount)} ${value.unit}`
    case 'range':
      return `${formatServicePriceNzd(value.minAmount)} – ${formatServicePriceNzd(value.maxAmount)}${
        value.unit ? ` ${value.unit}` : ''
      }`
  }
}

const MINIMUM_SCOPE_LABEL: Record<ServiceMinimumQuantityValue['scope'], string> = {
  product: 'for this product',
  'pricing-tier': 'for this pricing band',
  'service-wide': 'for this service',
}

function FactList({
  id,
  heading,
  fact,
}: {
  id: string
  heading: string
  fact: ApprovedServiceFact<string[]>
}) {
  return (
    <section id={id} tabIndex={-1} className="mt-10 scroll-mt-24">
      <h2 className="display-sub">
        {heading}
      </h2>
      {fact.note && (
        <p className="mt-3 text-base leading-relaxed text-ink-secondary">
          {fact.note}
        </p>
      )}
      <ul className="mt-4 list-disc space-y-2 pl-5">
        {fact.value.map((entry) => (
          <li key={entry} className="text-base leading-relaxed text-ink-secondary">
            {entry}
          </li>
        ))}
      </ul>
    </section>
  )
}

function SpecificationTable({
  id,
  heading,
  caption,
  entries,
}: {
  id: string
  heading: string
  caption: string
  entries: ServiceSpecificationEntry[]
}) {
  return (
    <section id={id} tabIndex={-1} className="mt-10 scroll-mt-24">
      <h2 className="display-sub">
        {heading}
      </h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[24rem] border-collapse text-left text-sm">
          <caption className="mb-3 text-left text-sm text-ink-muted">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-line-strong px-3 py-2 text-ink font-semibold">
                Detail
              </th>
              <th scope="col" className="border-b border-line-strong px-3 py-2 text-ink font-semibold">
                What we have confirmed
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.label}>
                <th scope="row" className="border-b border-line px-3 py-2 align-top text-ink-secondary font-medium">
                  {entry.label}
                </th>
                <td className="border-b border-line px-3 py-2 align-top text-ink-secondary">{entry.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Anchors for the in-page navigation, matching the sections this component actually renders. */
export function serviceFactAnchors(facts: ServiceFacts): { id: string; heading: string }[] {
  const anchors: { id: string; heading: string }[] = []
  if (facts.sizes) anchors.push({ id: 'sizes', heading: 'Sizes' })
  if (facts.materials) anchors.push({ id: 'materials', heading: 'Materials' })
  if (facts.finishes) anchors.push({ id: 'finishes', heading: 'Finishing' })
  if (facts.artworkSpecification) anchors.push({ id: 'artwork-specification', heading: 'Artwork specification' })
  if (facts.garmentSpecification) anchors.push({ id: 'garment-specification', heading: 'Garment specification' })
  if (facts.price || facts.minimumQuantity || facts.turnaround || facts.stockExpectation) {
    anchors.push({ id: 'price-and-quantities', heading: 'Price and quantities' })
  }
  return anchors
}

export function ServiceFactSections({ facts }: { facts: ServiceFacts }) {
  const priceText = facts.price ? servicePriceText(facts.price.value) : null
  const showCommercial =
    Boolean(priceText) || Boolean(facts.minimumQuantity) || Boolean(facts.turnaround) || Boolean(facts.stockExpectation)

  return (
    <>
      {facts.sizes && <FactList id="sizes" heading="Sizes" fact={facts.sizes} />}
      {facts.materials && <FactList id="materials" heading="Materials" fact={facts.materials} />}
      {facts.finishes && <FactList id="finishes" heading="Finishing" fact={facts.finishes} />}
      {facts.artworkSpecification && (
        <FactList id="artwork-specification" heading="Artwork specification" fact={facts.artworkSpecification} />
      )}
      {facts.garmentSpecification && (
        <SpecificationTable
          id="garment-specification"
          heading="Garment specification"
          caption={facts.garmentSpecification.note ?? 'Confirmed details for this garment.'}
          entries={facts.garmentSpecification.value}
        />
      )}

      {showCommercial && (
        <section id="price-and-quantities" tabIndex={-1} className="mt-10 scroll-mt-24">
          <h2 className="display-sub">
            Price and quantities
          </h2>
          <dl className="mt-4 space-y-3">
            {priceText && (
              <div>
                <dt className="text-base text-ink font-semibold">
                  Price
                </dt>
                <dd className="text-base leading-relaxed text-ink-secondary">
                  {priceText}
                  {facts.price?.note ? ` — ${facts.price.note}` : ''}
                </dd>
              </div>
            )}
            {facts.minimumQuantity && (
              <div>
                <dt className="text-base text-ink font-semibold">
                  Smallest quantity
                </dt>
                <dd className="text-base leading-relaxed text-ink-secondary">
                  {`${facts.minimumQuantity.value.value} ${facts.minimumQuantity.value.unit} ${
                    MINIMUM_SCOPE_LABEL[facts.minimumQuantity.value.scope]
                  }`}
                  {facts.minimumQuantity.note ? ` — ${facts.minimumQuantity.note}` : ''}
                </dd>
              </div>
            )}
            {facts.turnaround && (
              <div>
                <dt className="text-base text-ink font-semibold">
                  Timing
                </dt>
                <dd className="text-base leading-relaxed text-ink-secondary">{facts.turnaround.value}</dd>
              </div>
            )}
            {facts.stockExpectation && (
              <div>
                <dt className="text-base text-ink font-semibold">
                  Availability
                </dt>
                <dd className="text-base leading-relaxed text-ink-secondary">{facts.stockExpectation.value}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {facts.serviceAssurance && (
        <div className="mt-10">
          <ContentNotice tone="info" title="What we commit to">
            {facts.serviceAssurance.value}
          </ContentNotice>
        </div>
      )}
    </>
  )
}
