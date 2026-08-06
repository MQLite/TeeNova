export interface ApprovedTestimonial { id: string; quote: string; attribution: string; approvalReference: string; published: boolean }
/** No customer quote is shipped without traceable approval. */
export const testimonials: readonly ApprovedTestimonial[] = []
export const publishedTestimonials = () => testimonials.filter((item) => item.published && item.quote.trim() && item.attribution.trim() && item.approvalReference.trim())

