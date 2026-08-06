/**
 * Structural product-page skeleton (Jira 10304).
 *
 * Replaces the former full-height, spinner-only screen. The blocks mirror the real layout — the
 * square image frame, the title/price card and the configuration cards — so the page does not jump
 * when content arrives (CLS is designed out rather than measured after).
 *
 * **Why this is not `loading.tsx`.** A `loading.tsx` in this segment puts a Suspense boundary
 * *above* the page, so Next.js flushes the response — including its `200 OK` status line — before
 * the product fetch has resolved. A genuinely missing product would then be served as a soft 404,
 * which is exactly the misleading behaviour this task removes and which Jira 10308 depends on being
 * correct. Instead `page.tsx` resolves the product first (deciding 404 vs. 200 before any byte is
 * sent) and uses this component as an explicit `<Suspense>` fallback around the part that still has
 * to wait: the global print configuration.
 *
 * Accessibility: every placeholder is decorative and hidden from assistive technology; a single
 * polite status message carries the actual "loading" information.
 */
export function ProductDetailSkeleton() {
  return (
    <div className="bg-canvas">
      <p role="status" aria-live="polite" className="sr-only">
        Loading product details
      </p>

      {/* One shimmer on the group, not on twenty individual blocks. The global
          `prefers-reduced-motion` override in `globals.css` zeroes it. */}
      <div aria-hidden="true" className="animate-pulse">
        <div className="section-container py-10">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Image column: colour chips, square frame, thumbnail row */}
            <div className="lg:self-start">
              <div className="mb-3 flex flex-wrap gap-2">
                <div className="h-7 w-20 rounded-full skeleton" />
                <div className="h-7 w-16 rounded-full skeleton" />
                <div className="h-7 w-24 rounded-full skeleton" />
              </div>
              <div className="card mx-auto aspect-square w-full max-w-[440px] skeleton" />
              <div className="mt-3 grid grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="aspect-square rounded-2xl skeleton" />
                ))}
              </div>
            </div>

            {/* Title + price card, then the tier card */}
            <div className="flex flex-col gap-5">
              <div className="card p-6">
                <div className="h-5 w-24 rounded-full skeleton" />
                <div className="mt-3 h-7 w-3/4 rounded skeleton" />
                <div className="mt-5 h-3 w-32 rounded skeleton" />
                <div className="mt-2 h-11 w-48 rounded skeleton" />
                <div className="mt-3 h-3 w-40 rounded skeleton" />
              </div>
              <div className="card p-6">
                <div className="h-4 w-40 rounded skeleton" />
                <div className="mt-4 space-y-2">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="h-3 w-full rounded skeleton" />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Configuration cards: print areas, print sizes, quantity matrix */}
          <div className="mt-8 flex flex-col gap-5">
            {[0, 1].map((index) => (
              <div key={index} className="card p-6">
                <div className="h-4 w-36 rounded skeleton" />
                <div className="mt-4 flex flex-wrap gap-2">
                  {[0, 1, 2, 3].map((chip) => (
                    <div key={chip} className="h-9 w-28 rounded-2xl skeleton" />
                  ))}
                </div>
              </div>
            ))}
            <div className="card p-6">
              <div className="h-4 w-44 rounded skeleton" />
              <div className="mt-4 space-y-2">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="h-9 w-full rounded skeleton" />
                ))}
              </div>
            </div>
            <div className="card p-6">
              <div className="h-11 w-full rounded-full skeleton" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
