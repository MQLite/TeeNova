import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PrintSizeSelector } from './PrintSizeSelector'

/**
 * Jira 10303 — the upload guidance on product surfaces must match the upload endpoint.
 *
 * Before this task the garment print-size selector advertised "PNG, JPG, SVG, WebP, AI, PDF | max
 * 10 MB". The endpoint rejects SVG outright and allows 20 MB, so the label was wrong on two counts.
 */

const AREA = { id: 'area-1', name: 'Front', description: null, isActive: true, sortOrder: 0 }

const renderSelector = () =>
  render(
    <PrintSizeSelector
      selectedAreas={[AREA as never]}
      allowedSizesByArea={{ 'area-1': [] }}
      allowedSizesLoadingByArea={{}}
      allowedSizesErrorByArea={{}}
      printSizeByArea={{}}
      onChange={() => {}}
      onUploadFile={() => {}}
    />,
  )

describe('garment artwork upload guidance', () => {
  it('advertises the accepted formats without SVG', () => {
    renderSelector()
    const guidance = screen.getByText(/PNG, JPG, WebP, AI, PDF/)
    expect(guidance).toBeInTheDocument()
    expect(guidance.textContent).not.toMatch(/SVG/)
  })

  it('states the 20 MB limit the endpoint enforces', () => {
    renderSelector()
    expect(screen.getByText(/max 20 MB/)).toBeInTheDocument()
    expect(screen.queryByText(/max 10 MB/)).toBeNull()
  })

  it('links to the published artwork requirements page', () => {
    renderSelector()
    expect(screen.getByRole('link', { name: 'Artwork requirements' })).toHaveAttribute(
      'href',
      '/help/artwork-requirements',
    )
  })
})

describe('other product upload surfaces', () => {
  const productSource = (file: string) =>
    readFileSync(join(process.cwd(), 'src', 'components', 'products', file), 'utf8')

  it.each(['BadgeProductDetail.tsx', 'BannerProductDetail.tsx', 'FixedSizeBannerProductDetail.tsx'])(
    '%s states the accepted formats and limit accurately',
    (file) => {
      const source = productSource(file)
      expect(source).toContain('PNG, JPG, WebP, AI or PDF · max 20 MB')
      expect(source).not.toContain('PNG, JPG, or PDF')
    },
  )

  it('no longer carries the unverified badge delivery-speed claim', () => {
    expect(productSource('BadgeProductDetail.tsx')).not.toContain('Fast ship')
  })
})
