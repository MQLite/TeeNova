import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import * as estimate from './estimate'
import { useReceptionEstimate } from './useReceptionEstimate'
import type { GarmentGroup } from './worksheet'

const plain: GarmentGroup = {heading: '白衣', presentation: 'rows', prints: [], notes: '',
  rows: [{colour: 'White', size: 'L', quantity: 1}]}

it('labels excluded print charges on both the screen and printed estimate as the group mix changes', async () => {
  vi.spyOn(estimate, 'loadEstimateCatalogue').mockResolvedValue({areas: [], sizes: [], products: []})
  vi.spyOn(estimate, 'quoteEstimate').mockResolvedValue(45)
  const printed = {...plain, heading: '蓝衣', prints: [{area: 'FRONT_CENTER', size: 'A3'}]}
  const {result, rerender} = renderHook(
    layout => useReceptionEstimate(layout, ''), {initialProps: {title: '工单', groups: [plain]}},
  )
  await waitFor(() => expect(result.current.text).toBe('NZ$45.00（仅计衣价，不含印花费）'))
  expect(result.current.printText).toBe(result.current.text)
  rerender({title: '工单', groups: [plain, printed]})
  await waitFor(() => expect(result.current.text).toBe('NZ$45.00（「白衣」不含印花费）'))
  expect(result.current.printText).toBe(result.current.text)
})

it('keeps catalogue recovery instructions on screen', async () => {
  vi.spyOn(estimate, 'loadEstimateCatalogue').mockRejectedValue(new Error('offline'))
  const layout = {title: '工单', groups: [plain]}
  const {result} = renderHook(() => useReceptionEstimate(layout, ''))
  expect(result.current.printText).toBe('待估价')
  await waitFor(() => expect(result.current.text).toContain('无法读取系统价目，请刷新估价。'))
  expect(result.current.printText).toBe('待核价')
})

it('keeps quote diagnostics on screen and prints the estimate after retry', async () => {
  vi.spyOn(estimate, 'loadEstimateCatalogue').mockResolvedValue({areas: [], sizes: [], products: []})
  const diagnostic = '印花规格待确认。请在「核对工作单」的「蓝衣」组选择「仅计衣价（不含印花费）」。'
  vi.spyOn(estimate, 'quoteEstimate').mockRejectedValueOnce(new Error(diagnostic)).mockResolvedValue(45)
  const layout = {title: '工单', groups: [plain]}
  const {result} = renderHook(() => useReceptionEstimate(layout, ''))
  await waitFor(() => expect(result.current.text).toContain(diagnostic))
  expect(result.current.printText).toBe('待核价')
  act(() => result.current.retry?.())
  await waitFor(() => expect(result.current.printText).toBe('NZ$45.00（仅计衣价，不含印花费）'))
})
