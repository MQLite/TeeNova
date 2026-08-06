export interface ApprovedServiceAssurance { id: string; title: string; detail: string; evidenceReference: string; published: boolean }
/** Operational assurances require owner approval and supporting evidence. */
export const serviceAssurances: readonly ApprovedServiceAssurance[] = []
export const publishedServiceAssurances = () => serviceAssurances.filter((item) => item.published && item.evidenceReference.trim())

