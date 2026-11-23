import { describe, expect, it, vi } from 'vitest'
import { pricingApi } from '@/api/pricing'
import { productFixture } from '@/test/product-fixtures'
import type { PriceCalculationResponse } from '@/types'
import { estimateLines, garmentKind, quoteEstimate, type EstimateCatalogue } from './estimate'
import type { GarmentGroup } from './worksheet'

const tee = productFixture({name:'Gildan Cotton Tee',printPricingGroupId:'shared'})
const hoodie = {...tee,id:'hoodie',name:'Gildan Hoodie'}
const catalogue: EstimateCatalogue = {products:[tee,hoodie],areas:[],sizes:[]}
const group = (heading: string, quantity = 8): GarmentGroup => ({
  heading, presentation:'rows',notes:'',prints:[],rows:[{size:'M',colour:'Black',quantity}],
})

describe('reception estimates', () => {
  it.each([
    [tee.name, 'tee', 'A3'], [hoodie.name, 'hoodie', 'A3'],
    ['Gildan Cotton Tee for kids', 'kidsTee', 'A4'], ['Gildan Hoodie for Kids', 'kidsHoodie', 'A4'],
  ] as const)('quotes missing front/back sizes for %s', (name, pricingKind, expected) => {
    const option = (code: string) => ({id: 'id-' + code, code, name: code, basePrice: 0, isActive: true, sortOrder: 0})
    const config = {products:[{...tee, name}], areas:['FRONT_CENTER','BACK_CENTER'].map(option), sizes:['A3','A4','A5'].map(option)}
    const g = {...group('B&F'), pricingKind, prints:[{area:'FRONT_CENTER',size:''},{area:'BACK_CENTER',size:''}]}
    const sizes = () => estimateLines([g], config)[0].prints.map(p => p.printSizeId)
    expect(sizes()).toEqual(['id-' + expected, 'id-' + expected])
    expect(g.prints.map(p => p.size)).toEqual(['',''])
    g.prints[0].size = 'A5'
    expect(sizes()).toEqual(['id-A5', 'id-' + expected])
  })
  it('maps unmarked garments and circled H, leaving banners unlinked', () => {
    expect(garmentKind(group('White B&F'))).toBe('tee')
    expect(garmentKind(group('Ⓗ'))).toBe('hoodie')
    expect(garmentKind(group('H\u20dd'))).toBe('hoodie')
    expect(garmentKind(group('H'))).toBe('tee')
    expect(garmentKind(group('PVC Banner'))).toBe('unlinked')
    const lines = estimateLines([group('白色'),group('Ⓗ',10),group('PVC Banner',15)],catalogue)
    expect(lines.map(l => [l.productId,l.tierQuantity,l.quantity])).toEqual([[tee.id,18,8],[hoodie.id,18,10]])
  })
  it('requires a priceable variant, known quantity and complete print specification', () => {
    expect(() => estimateLines([{...group('Tee'),prints:[{area:'FRONT_CENTER',size:''}]}],catalogue)).toThrow('印花')
    expect(() => estimateLines([{...group('Tee'),rows:[{size:'M',colour:'Black',quantity:null}]}],catalogue)).toThrow('数量')
    expect(() => estimateLines([group('Tee')],{...catalogue,products:[]})).toThrow('商品目录')
    expect(() => estimateLines([{...group('Tee'),prints:null}],catalogue)).toThrow('核对印花')
  })
  it('uses the pricing API line totals and refuses a partial quote', async () => {
    const api = vi.spyOn(pricingApi,'calculateBatch')
    const groups = [group('Tee'),group('Ⓗ')]
    const quote = {currency:'NZD',lineTotal:10.12} as PriceCalculationResponse
    const signal = new AbortController().signal
    try {
      api.mockResolvedValueOnce({results:[{correlationKey:'1',quote},{correlationKey:'0',quote}]})
      expect(await quoteEstimate(groups,catalogue,signal)).toBe(20.24)
      api.mockResolvedValueOnce({results:[{correlationKey:'0',quote}]})
      await expect(quoteEstimate(groups,catalogue,signal)).rejects.toThrow('全部服装')
    } finally { api.mockRestore() }
  })
})
