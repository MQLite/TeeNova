import { PortfolioGrid } from '@/components/portfolio/PortfolioGrid'
import { portfolioApi, portfolioEnabled } from '@/api/portfolio'
import { QuoteLink } from '@/components/QuoteLink'
import { Section } from '@/components/ui/Layout'
import { EmptyState } from '@/components/ui/Notice'
import { PageHero } from '@/components/ui/PageHero'

/**
 * Public portfolio index (Jira 10302, restyled in 10307).
 *
 * Published-only filtering is unchanged and lives in the API layer. No approved
 * media exists yet, so the page's real appearance today is the empty state —
 * which is why it is a designed state rather than a bare sentence. "Feature
 * switched off" and "nothing published yet" are distinguished: the first is not
 * something a visitor can act on, the second invites a quote.
 */
export default async function PortfolioPage() {
  const hero = (
    <PageHero
      variant="plain"
      title="Recent work"
      lead="Printed jobs we have permission to show. Every image here is a real job with the customer's approval."
    />
  )

  if (!portfolioEnabled) {
    return (
      <>
        {hero}
        <Section>
          <EmptyState
            variant="disabled"
            icon="info"
            as="h2"
            title="Portfolio work is not currently published"
            body="We are not showing past jobs on the site at the moment. Get in touch and we can talk through what you need."
          />
        </Section>
      </>
    )
  }

  const result = await portfolioApi.list().catch(() => ({ totalCount: 0, items: [] }))

  return (
    <>
      {hero}
      {result.items.length === 0 ? (
        <Section>
          <EmptyState
            variant="empty"
            icon="artwork"
            as="h2"
            title="No work is published yet"
            body="We only show jobs we have the customer's permission to publish, so this page fills up as those approvals come in."
            actions={
              <QuoteLink source="/portfolio" className="btn-black">
                Request a quote
              </QuoteLink>
            }
          />
        </Section>
      ) : (
        <PortfolioGrid items={result.items} />
      )}
    </>
  )
}
