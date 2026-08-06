/**
 * Product-title rename **proposals** (Jira 10306) — recorded, not applied.
 *
 * Renaming a catalogue product is technically low-risk and has been confirmed as such:
 *   • `Product` has no `Slug` column, and public product URLs are `/products/{guid}` — a rename
 *     changes no URL and breaks no bookmark.
 *   • Cart items store `productName` as a snapshot taken when the item was added.
 *   • Order items store `ProductName` as a snapshot column, so historical orders keep the name they
 *     were placed under.
 *
 * It is nevertheless a **business-content decision**, and the products in question are Admin-created
 * database rows rather than seed data, so this module exists to carry the proposal and nothing else.
 * It is deliberately not imported by any page, component or route: a test asserts that, so a
 * proposal can never be mistaken for an applied name or leak into public content.
 *
 * No product was renamed. No seed data was changed. No database was touched.
 */

export interface ProductTitleProposal {
  /** The name as it appears in the live catalogue today. */
  currentName: string
  suggestedName: string
  /**
   * Live catalogue GUID. Unknown here on purpose: these rows are Admin-created and no database was
   * read for this task. An operator applying a rename reads the id from the Admin product list.
   */
  productId: 'unknown — Admin-created row, not seed data'
  productKind: 'Garment' | 'Badge' | 'Banner' | 'Other' | 'unknown'
  activeStatus: 'unknown — requires catalogue access'
  impact: string
  approvalState: 'not approved — proposal only'
}

export const productTitleProposals: readonly ProductTitleProposal[] = [
  {
    currentName: 'Badge',
    suggestedName: 'Custom Round Button Badges',
    productId: 'unknown — Admin-created row, not seed data',
    productKind: 'Badge',
    activeStatus: 'unknown — requires catalogue access',
    impact:
      'Display-only. Changes the title on /products, the product detail page and newly added cart items. No URL changes, no existing order or cart snapshot changes, no pricing or option scoping changes.',
    approvalState: 'not approved — proposal only',
  },
  {
    currentName: 'Bring your own',
    suggestedName: 'Bring Your Own Garment Printing',
    productId: 'unknown — Admin-created row, not seed data',
    productKind: 'unknown',
    activeStatus: 'unknown — requires catalogue access',
    impact:
      'Display-only, same as above. Note this product is distinct from the /services/bring-your-own-garment page, which is content and does not depend on the product existing.',
    approvalState: 'not approved — proposal only',
  },
]

/**
 * Seed-controlled product names, for contrast. These are defined in
 * `backend/src/TeeNova.Application/DataSeeding/TeeNovaDataSeedContributor.cs` and are already
 * complete titles, so no rename is proposed for them.
 */
export const seedControlledProductNames: readonly string[] = [
  'Classic Cotton Tee',
  'Premium Unisex T-Shirt',
  'Oversized Street Tee',
]
