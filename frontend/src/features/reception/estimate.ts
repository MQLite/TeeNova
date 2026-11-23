import { catalogApi } from '@/api/catalog'
import { printConfigApi } from '@/api/print-config'
import { pricingApi } from '@/api/pricing'
import type { PriceCalculationRequest, Product, PrintArea, PrintSize } from '@/types'
import type { GarmentGroup } from './worksheet'

export const garments = {
  tee: 'Gildan Cotton Tee', hoodie: 'Gildan Hoodie',
  kidsTee: 'Gildan Cotton Tee for kids', kidsHoodie: 'Gildan Hoodie for Kids',
} as const
type Kind = NonNullable<GarmentGroup['pricingKind']>
export interface EstimateCatalogue { products: Product[]; areas: PrintArea[]; sizes: PrintSize[] }

export function garmentKind(group: GarmentGroup): Kind {
  if (/\bbanners?\b|横幅|横额|旗帜/i.test(group.heading)) return 'unlinked'
  if (group.pricingKind) return group.pricingKind
  const heading = group.heading + ' ' + group.notes
  if (/banner|横幅|横额|旗帜|自带|bring your own|badge/i.test(heading)) return 'unlinked'
  const hoodie = /Ⓗ|[Hh]\u20DD|hoodie|连帽/i.test(heading)
  const kids = /童|kids?|youth/i.test(heading)
  return hoodie ? (kids ? 'kidsHoodie' : 'hoodie') : (kids ? 'kidsTee' : 'tee')
}

export async function loadEstimateCatalogue(signal: AbortSignal): Promise<EstimateCatalogue> {
  const [areas, sizes] = await Promise.all([printConfigApi.getAreas({signal}), printConfigApi.getSizes({signal})])
  const products: Product[] = []
  let offset = 0
  for (;;) {
    const page = await catalogApi.getProducts({search:'Gildan', isActive:true, skipCount:offset, maxResultCount:100}, {signal})
    const names: readonly string[] = Object.values(garments)
    const matches = page.items.filter(p => p.kind === 'Garment' && p.pricingModel === 'GarmentPrint' &&
      names.some(name => name.toLowerCase() === p.name.trim().toLowerCase()))
    products.push(...await Promise.all(matches.map(p => catalogApi.getProduct(p.id, {signal}))))
    offset += page.items.length
    if (!page.items.length || offset >= page.totalCount) break
  }
  return {products, areas, sizes}
}

const norm = (s: string) => s.trim().toLowerCase()
const colours: Record<string,string> = { 白:'white', 白色:'white', 黑:'black', 黑色:'black', 藏青:'navy blue', 海军蓝:'navy blue' }

export function estimateLines(groups: GarmentGroup[], catalogue: EstimateCatalogue) {
  const lines: {scope: string; request: PriceCalculationRequest}[] = []
  const totals = new Map<string, number>()
  for (const group of groups) {
    const kind = garmentKind(group)
    if (kind === 'unlinked') continue
    const name = garments[kind]
    const matches = catalogue.products.filter(p => p.isActive && norm(p.name) === norm(name))
    if (matches.length !== 1) throw new Error(`请检查商品目录中的 ${name}。`)
    const product = matches[0]
    if (group.prints == null) throw new Error(`请在「${group.heading}」核对印花，或选择仅计衣价。`)
    const prints = (group.prints ?? []).map(spec => {
      const area = catalogue.areas.find(a => a.code === spec.area)
      const size = catalogue.sizes.find(s => s.code === spec.size)
      if (!area || !size) throw new Error(`请补选「${group.heading}」的印花位置和大小。`)
      return {printAreaId:area.id, printSizeId:size.id}
    })
    const scope = product.printPricingGroupId ?? product.id
    for (const row of group.rows) {
      if (row.quantity === null) throw new Error(`请补全「${group.heading}」的数量。`)
      if (!row.quantity) continue
      const colour = colours[row.colour.trim()] ?? norm(row.colour)
      const variants = product.variants.filter(v => v.isAvailable && norm(v.size) === norm(row.size) &&
        (!colour || norm(v.color) === colour))
      if (!variants.length || variants.some(v => v.priceAdjustment !== variants[0].priceAdjustment)) {
        throw new Error(`请核对 ${name} 的尺码和颜色（${row.size || '未填尺码'} / ${row.colour || '未填颜色'}）。`)
      }
      totals.set(scope,(totals.get(scope) ?? 0) + row.quantity)
      lines.push({scope,request:{productId:product.id, variantId:variants[0].id, quantity:row.quantity, prints}})
    }
  }
  return lines.map(({scope,request}) => ({...request, tierQuantity:totals.get(scope)!}))
}

export async function quoteEstimate(groups: GarmentGroup[], catalogue: EstimateCatalogue, signal: AbortSignal) {
  const lines = estimateLines(groups,catalogue)
  let cents = 0
  for (let offset = 0; offset < lines.length; offset += 50) {
    const items = lines.slice(offset,offset + 50).map((request,i) => ({request, correlationKey:String(offset+i)}))
    const {results} = await pricingApi.calculateBatch(items,signal)
    const prices = new Map(results.map(r => [r.correlationKey,r.quote]))
    for (const item of items) {
      const quote = prices.get(item.correlationKey)
      if (!quote || quote.currency !== 'NZD' || !Number.isFinite(quote.lineTotal)) {
        throw new Error('系统未能为全部服装报价，请核对尺码和印花选项。')
      }
      cents += Math.round(quote.lineTotal * 100)
    }
  }
  return cents / 100
}
