import { render,screen } from '@testing-library/react'
import { describe,expect,it } from 'vitest'
import HomePage from './page'

describe('homepage portfolio and trust defaults',()=>{
 it('omits the Recent Work section when the feature is disabled',()=>{render(<HomePage/>);expect(screen.queryByRole('heading',{name:'Recent Work'})).not.toBeInTheDocument()})
 it('does not publish unverified trust claims',()=>{render(<HomePage/>);expect(screen.queryByText('Fast turnaround')).not.toBeInTheDocument();expect(screen.queryByText('NZ Wide')).not.toBeInTheDocument();expect(screen.queryByText('Artwork help available')).not.toBeInTheDocument();expect(screen.queryByText('In-house')).not.toBeInTheDocument()})
})
