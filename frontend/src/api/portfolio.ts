import { apiClient } from '@/lib/api-client'
import { adminApiClient } from '@/lib/admin-client'
import { PORTFOLIO_CACHE_TAG } from '@/lib/portfolio-cache'

export type PortfolioStatus = 'Draft' | 'Published' | 'Archived'
export type PortfolioPermissionSource = 'BusinessOwned' | 'CustomerPermission' | 'Licensed'
export interface PortfolioImage { id:string; altText:string; permissionSource:PortfolioPermissionSource; permissionReference?:string; originalFileName?:string; width:number; height:number; isPrimary:boolean; sortOrder:number; url:string }
export interface PortfolioItem { id:string; title:string; slug:string; serviceType:string; shortCaption:string; longDescription?:string; status:PortfolioStatus; sortOrder:number; isFeatured:boolean; publishedAt?:string; concurrencyStamp?:string; images:PortfolioImage[] }
export interface PortfolioPage { totalCount:number; items:PortfolioItem[] }
export interface PortfolioDraft { title:string; slug:string; serviceType:string; shortCaption:string; longDescription?:string; sortOrder:number; isFeatured:boolean }

export const portfolioEnabled = process.env.NEXT_PUBLIC_PORTFOLIO_ENABLED === 'true'
const publicPortfolioCache = { revalidate: 300, tags: [PORTFOLIO_CACHE_TAG] }
export const portfolioApi = {
  list(maxResultCount=24): Promise<PortfolioPage> { return apiClient.get('/api/portfolio/items',{skipCount:0,maxResultCount},publicPortfolioCache) },
  /**
   * One page of published items (Jira 10308). Identical filtering to `list`; the only addition is
   * `skipCount`, which the sitemap needs to enumerate every published item rather than the first
   * screenful. Read-only and anonymous, so it inherits the backend's Published-only rule.
   */
  listPage(skipCount:number,maxResultCount:number): Promise<PortfolioPage> { return apiClient.get('/api/portfolio/items',{skipCount,maxResultCount},publicPortfolioCache) },
  /**
   * Published items for one service classification (Jira 10306). The backend already filters the
   * anonymous list by `Status == Published` and by `serviceType`; callers filter again client-side
   * so a service page can never show another service's work even if the query were ignored.
   */
  listByService(serviceType:string,maxResultCount=3): Promise<PortfolioPage> { return apiClient.get('/api/portfolio/items',{skipCount:0,maxResultCount,serviceType},publicPortfolioCache) },
  get(slug:string): Promise<PortfolioItem> { return apiClient.get(`/api/portfolio/items/${encodeURIComponent(slug)}`,undefined,publicPortfolioCache) },
}
export const adminPortfolioApi = {
  list(params?:{search?:string;status?:PortfolioStatus;serviceType?:string}):Promise<PortfolioPage>{ return adminApiClient.get('/api/portfolio/admin/items',{skipCount:0,maxResultCount:100,search:params?.search,status:params?.status,serviceType:params?.serviceType}) },
  get(id:string):Promise<PortfolioItem>{ return adminApiClient.get(`/api/portfolio/admin/items/${id}`) },
  create(input:PortfolioDraft):Promise<PortfolioItem>{ return adminApiClient.post('/api/portfolio/admin/items',input) },
  update(id:string,input:PortfolioDraft & {concurrencyStamp:string}):Promise<PortfolioItem>{ return adminApiClient.put(`/api/portfolio/admin/items/${id}`,input) },
  upload(id:string,file:File):Promise<PortfolioImage>{ return adminApiClient.uploadFile(`/api/portfolio/admin/items/${id}/images`,file) },
  updateImage(id:string,imageId:string,input:Pick<PortfolioImage,'altText'|'permissionSource'|'permissionReference'|'sortOrder'|'isPrimary'>):Promise<PortfolioImage>{ return adminApiClient.put(`/api/portfolio/admin/items/${id}/images/${imageId}`,input) },
  deleteImage(id:string,imageId:string):Promise<void>{ return adminApiClient.delete(`/api/portfolio/admin/items/${id}/images/${imageId}`) },
  publish(id:string):Promise<PortfolioItem>{ return adminApiClient.post(`/api/portfolio/admin/items/${id}/publish`) },
  unpublish(id:string):Promise<PortfolioItem>{ return adminApiClient.post(`/api/portfolio/admin/items/${id}/unpublish`) },
  archive(id:string):Promise<PortfolioItem>{ return adminApiClient.post(`/api/portfolio/admin/items/${id}/archive`) },
  delete(id:string):Promise<void>{ return adminApiClient.delete(`/api/portfolio/admin/items/${id}`) },
}
