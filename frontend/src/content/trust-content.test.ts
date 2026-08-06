import { describe,expect,it } from 'vitest'
import { brandMedia,publishedBrandMedia } from './brand-media'
import { testimonials,publishedTestimonials } from './testimonials'
import { customerLogos,publishedCustomerLogos } from './customer-logos'
import { serviceAssurances,publishedServiceAssurances } from './service-assurances'

describe('approval-controlled trust content',()=>{
 it('ships every registry empty by default',()=>{expect(brandMedia).toEqual([]);expect(testimonials).toEqual([]);expect(customerLogos).toEqual([]);expect(serviceAssurances).toEqual([])})
 it('renders no published content from empty registries',()=>{expect(publishedBrandMedia()).toEqual([]);expect(publishedTestimonials()).toEqual([]);expect(publishedCustomerLogos()).toEqual([]);expect(publishedServiceAssurances()).toEqual([])})
})

