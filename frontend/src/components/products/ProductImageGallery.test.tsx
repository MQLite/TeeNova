import { render, screen } from '@testing-library/react'
import { forwardRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ProductImageGallery } from './ProductImageGallery'

vi.mock('next/image', () => ({
  default: forwardRef<HTMLImageElement, Record<string, unknown>>(
    function MockImage({ fill: _fill, priority: _priority, ...props }, ref) {
      // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
      return <img ref={ref} {...props} />
    },
  ),
}))

describe('ProductImageGallery', () => {
  const images = [
    { id: 'front', url: '/uploads/products/front.png', isPrimary: true, sortOrder: 0, color: 'Navy' },
    { id: 'back', url: '/uploads/products/back.png', isPrimary: false, sortOrder: 1, color: 'Navy' },
  ]

  it('gives every interactive thumbnail a distinct accessible name', () => {
    render(
      <ProductImageGallery
        productName="Cotton Tee"
        activeImage={images[0]}
        images={images}
        onSelectImage={() => undefined}
        selectedColor="Navy"
      />,
    )

    expect(screen.getByRole('button', { name: 'Cotton Tee image 1 of 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Cotton Tee image 2 of 2' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})
