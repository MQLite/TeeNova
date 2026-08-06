import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HomePage from './page'

describe('homepage responsive hero (Jira 10305)', () => {
  it('uses reduced base and small-screen spacing', () => {
    const { container } = render(<HomePage />)
    const hero = container.querySelector('section.hero-gradient')
    expect(hero).toHaveClass('py-8', 'sm:py-24')
    expect(hero?.querySelector('.mt-10')).toBeNull()
  })

  it('preserves the original desktop hero spacing at large widths', () => {
    const { container } = render(<HomePage />)
    const hero = container.querySelector('section.hero-gradient')
    expect(hero).toHaveClass('lg:py-36')
    expect(hero).toHaveTextContent('Custom Printing')
    expect(hero).toHaveTextContent('Browse Products')
  })
})
