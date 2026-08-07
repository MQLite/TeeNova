/**
 * Shared cache tag for public portfolio reads.
 *
 * Portfolio moderation is a privacy boundary: publish, unpublish, image changes and deletion must
 * invalidate every public surface immediately, while ordinary anonymous reads may still use ISR.
 */
export const PORTFOLIO_CACHE_TAG = 'portfolio'
