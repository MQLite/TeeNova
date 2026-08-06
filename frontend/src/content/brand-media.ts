export interface ApprovedBrandMedia { id: string; src: string; alt: string; approvalReference: string; published: boolean }
/** Intentionally empty until real assets and documented approval are supplied. */
export const brandMedia: readonly ApprovedBrandMedia[] = []
export const publishedBrandMedia = () => brandMedia.filter((item) => item.published && item.alt.trim() && item.approvalReference.trim())

