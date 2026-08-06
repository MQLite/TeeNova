import { render,screen } from '@testing-library/react'
import { describe,expect,it } from 'vitest'
import { PortfolioGrid } from './PortfolioGrid'
import type { PortfolioItem } from '@/api/portfolio'

const item:PortfolioItem={id:'1',title:'Approved work',slug:'approved-work',serviceType:'GarmentPrinting',shortCaption:'Printed garments.',status:'Published',sortOrder:0,isFeatured:true,images:[{id:'i',altText:'Navy printed shirt',permissionSource:'BusinessOwned',width:800,height:600,isPrimary:true,sortOrder:0,url:'/api/portfolio/items/approved-work/images/i'}]}
describe('PortfolioGrid',()=>{
 it('renders nothing for zero published items',()=>{const {container}=render(<PortfolioGrid items={[]}/>);expect(container).toBeEmptyDOMElement()})
 it('uses supplied title, caption, stable link and meaningful alt text',()=>{render(<PortfolioGrid items={[item]} heading="Recent Work"/>);expect(screen.getByRole('heading',{name:'Approved work'})).toBeInTheDocument();expect(screen.getByRole('img',{name:'Navy printed shirt'})).toHaveAttribute('sizes','(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw');expect(screen.getByRole('link',{name:/Approved work/})).toHaveAttribute('href','/portfolio/approved-work')})
 it('does not render an item without an image',()=>{render(<PortfolioGrid items={[{...item,images:[]}]}/>);expect(screen.queryByText('Approved work')).not.toBeInTheDocument()})
})
