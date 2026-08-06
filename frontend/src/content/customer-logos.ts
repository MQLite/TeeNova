export interface ApprovedCustomerLogo { id: string; name: string; src: string; alt: string; approvalReference: string; published: boolean }
/** Empty by default; a business relationship never implies logo-use permission. */
export const customerLogos: readonly ApprovedCustomerLogo[] = []
export const publishedCustomerLogos = () => customerLogos.filter((item) => item.published && item.alt.trim() && item.approvalReference.trim())

