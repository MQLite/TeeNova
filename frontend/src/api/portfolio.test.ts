import { afterEach,describe,expect,it,vi } from 'vitest'
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules()})
describe('portfolio feature flag',()=>{
 it('defaults disabled',async()=>{vi.stubEnv('NEXT_PUBLIC_PORTFOLIO_ENABLED','');const x=await import('./portfolio');expect(x.portfolioEnabled).toBe(false)})
 it('requires exact true',async()=>{vi.stubEnv('NEXT_PUBLIC_PORTFOLIO_ENABLED','true');const x=await import('./portfolio');expect(x.portfolioEnabled).toBe(true)})
})

