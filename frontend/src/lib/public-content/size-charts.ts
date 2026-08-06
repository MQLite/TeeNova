/**
 * Per-garment size charts (Jira 10303).
 *
 * The registry is deliberately empty. The product catalogue records size labels only — there is no
 * measurement anywhere in the data model — so no chart can be derived, and no chest, body or length
 * figure is invented here.
 *
 * The shape exists so that Jira 10306 can bind an owner-approved, measured chart to the specific
 * garments it applies to. A chart is only usable once it carries an approval reference; charts
 * without one are ignored by `publishedSizeCharts`.
 */

export interface GarmentSizeChartRow {
  /** The size label as it appears on the product variant, for example "M". */
  sizeLabel: string
  /** Measurement values in the same order as `measurements`, already formatted with the unit. */
  values: string[]
}

export interface GarmentSizeChart {
  id: string
  /** Human name of the garment or brand range the chart applies to. */
  garment: string
  /** Product ids this chart applies to. Empty means "not yet bound to a product". */
  productIds: readonly string[]
  /** Measurement point names, for example "Chest (flat)" or "Body length". */
  measurements: readonly string[]
  unit: 'cm' | 'in'
  /** How the measurements were taken, supplied by the approver. */
  measurementMethod: string
  /** Manufacturing tolerance wording, supplied by the approver. */
  tolerance: string
  fitNote?: string
  audience: 'adult' | 'youth'
  approvalReference: string
  approvedAt: string
  effectiveFrom?: string
  rows: readonly GarmentSizeChartRow[]
}

/** No approved measurements exist. Do not add a chart without a real approval record. */
export const approvedSizeCharts: readonly GarmentSizeChart[] = []

export const publishedSizeCharts = (): readonly GarmentSizeChart[] =>
  approvedSizeCharts.filter((chart) => chart.approvalReference.trim() && chart.rows.length > 0)

export const sizeChartsForProduct = (productId: string): readonly GarmentSizeChart[] =>
  publishedSizeCharts().filter((chart) => chart.productIds.includes(productId))
