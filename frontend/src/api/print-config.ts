import { apiClient, type ApiClient } from '@/lib/api-client'
import type {
  PrintArea,
  PrintSize,
  PrintAreaSizeOption,
  CreateUpdatePrintAreaInput,
  CreateUpdatePrintSizeInput,
  SetPrintAreaSizeOptionInput,
} from '@/types'

export function makePrintConfigApi(client: ApiClient) {
  return {
    // ── Storefront (active-only, unchanged) ──────────────────────────────────────

    getAreas(): Promise<PrintArea[]> {
      return client.get('/api/print-config/areas', { isActive: true })
    },

    getSizes(): Promise<PrintSize[]> {
      return client.get('/api/print-config/sizes', { isActive: true })
    },

    // ── Admin — PrintArea ─────────────────────────────────────────────────────────

    getAdminAreas(isActive?: boolean): Promise<PrintArea[]> {
      return client.get('/api/print-config/areas', { isActive })
    },

    getArea(id: string): Promise<PrintArea> {
      return client.get(`/api/print-config/areas/${id}`)
    },

    createArea(input: CreateUpdatePrintAreaInput): Promise<PrintArea> {
      return client.post('/api/print-config/areas', input)
    },

    updateArea(id: string, input: CreateUpdatePrintAreaInput): Promise<PrintArea> {
      return client.put(`/api/print-config/areas/${id}`, input)
    },

    deleteArea(id: string): Promise<void> {
      return client.delete(`/api/print-config/areas/${id}`)
    },

    // ── Admin — PrintSize ─────────────────────────────────────────────────────────

    getAdminSizes(isActive?: boolean): Promise<PrintSize[]> {
      return client.get('/api/print-config/sizes', { isActive })
    },

    getSize(id: string): Promise<PrintSize> {
      return client.get(`/api/print-config/sizes/${id}`)
    },

    createSize(input: CreateUpdatePrintSizeInput): Promise<PrintSize> {
      return client.post('/api/print-config/sizes', input)
    },

    updateSize(id: string, input: CreateUpdatePrintSizeInput): Promise<PrintSize> {
      return client.put(`/api/print-config/sizes/${id}`, input)
    },

    deleteSize(id: string): Promise<void> {
      return client.delete(`/api/print-config/sizes/${id}`)
    },

    // ── PrintAreaSizeOption ───────────────────────────────────────────────────────

    getAreaSizes(areaId: string, includeInactive?: boolean): Promise<PrintAreaSizeOption[]> {
      return client.get(`/api/print-config/areas/${areaId}/sizes`, { includeInactive })
    },

    setAreaSizes(areaId: string, options: SetPrintAreaSizeOptionInput[]): Promise<PrintAreaSizeOption[]> {
      return client.put(`/api/print-config/areas/${areaId}/sizes`, options)
    },
  }
}

export const printConfigApi = makePrintConfigApi(apiClient)
