import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { redirectToLogin } from '@/lib/admin-client'
import {
  AdminLogsClientError,
  listAdminLogs,
  type AdminLogListResult,
} from '@/api/admin-logs'
import LogsPageClient from './LogsPageClient'
import { ServerLogsPageContent } from './ServerLogsPageContent'

const replace = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/system/logs',
  useRouter: () => ({ replace }),
}))

vi.mock('@/lib/auth', () => ({
  getAdminRole: vi.fn(),
  redirectToExpiredLogin: vi.fn(),
}))

vi.mock('@/lib/admin-client', () => ({
  redirectToLogin: vi.fn(),
}))

vi.mock('@/api/admin-logs', async () => {
  const actual = await vi.importActual<typeof import('@/api/admin-logs')>('@/api/admin-logs')
  return { ...actual, listAdminLogs: vi.fn() }
})

const listMock = vi.mocked(listAdminLogs)
const redirectMock = vi.mocked(redirectToLogin)

const populatedResult: AdminLogListResult = {
  items: [
    {
      id: 'opaque-one+value',
      fileName: 'api.log',
      sourceKey: 'api',
      sourceName: 'API Logs',
      sizeBytes: 15000,
      lastModifiedUtc: '2026-07-20T02:00:00Z',
      downloadable: true,
      downloadBlockReason: null,
    },
    {
      id: 'opaque-two',
      fileName: 'worker.log',
      sourceKey: 'worker',
      sourceName: 'Worker Logs',
      sizeBytes: 200,
      lastModifiedUtc: '2026-07-19T02:00:00Z',
      downloadable: true,
      downloadBlockReason: null,
    },
  ],
  sources: [
    { key: 'api', displayName: 'API Logs', available: true },
    { key: 'worker', displayName: 'Worker Logs', available: false },
  ],
  warnings: [{ sourceKey: 'worker', code: 'safe-warning', message: 'do not render raw warning' }],
  page: 1,
  pageSize: 25,
  totalCount: 50,
  isTruncated: true,
}

beforeEach(() => {
  listMock.mockReset()
  redirectMock.mockReset()
  replace.mockReset()
})

describe('navigation and role-aware page boundary', () => {
  it('shows System Logs only to Admin', () => {
    const { rerender } = render(<AdminSidebar role="Viewer" />)
    expect(screen.queryByRole('link', { name: 'Logs' })).not.toBeInTheDocument()

    rerender(<AdminSidebar role="Admin" />)
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Logs' })).toHaveAttribute('href', '/admin/system/logs')
  })

  it('renders a Viewer forbidden state without starting a listing request', () => {
    render(<ServerLogsPageContent role="Viewer" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Admin role')
    expect(listMock).not.toHaveBeenCalled()
  })
})

describe('Server Logs client page', () => {
  it('shows a loading skeleton and then the safe empty state', async () => {
    let resolveRequest!: (value: AdminLogListResult) => void
    listMock.mockReturnValue(new Promise(resolve => { resolveRequest = resolve }))
    render(<LogsPageClient />)

    expect(screen.getByLabelText('Log filters')).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()

    resolveRequest({ ...populatedResult, items: [], sources: [], warnings: [], totalCount: 0, isTruncated: false })
    expect(await screen.findByText('No log files are available.')).toBeInTheDocument()
  })

  it('renders metadata, source status, truncation, and never renders extra path or content fields', async () => {
    const unsafeExtra = {
      ...populatedResult,
      physicalPath: '/private/server/logs',
      content: 'secret log body',
    }
    listMock.mockResolvedValue(unsafeExtra)

    render(<LogsPageClient />)

    expect(await screen.findByText('api.log')).toBeInTheDocument()
    expect(screen.getByText('14.6 KB')).toBeInTheDocument()
    expect(screen.getByText('Worker Logs is temporarily unavailable.')).toBeInTheDocument()
    expect(screen.getByText(/log list was limited by the server/i)).toBeInTheDocument()
    expect(screen.getByText(/files in the inspected set/i)).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('/private/server/logs')
    expect(document.body).not.toHaveTextContent('secret log body')
    expect(document.body).not.toHaveTextContent('do not render raw warning')
  })

  it('sends source, debounced search, allowlisted sorting, pagination, and refresh to the backend', async () => {
    listMock.mockResolvedValue(populatedResult)
    const user = userEvent.setup()
    render(<LogsPageClient />)
    await screen.findByText('api.log')

    await user.selectOptions(screen.getByLabelText('Source'), 'api')
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: 'api', page: 1 }), undefined, expect.any(AbortSignal),
    ))

    await user.type(screen.getByLabelText('Filename search'), ' worker & api ')
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'worker & api', page: 1 }), undefined, expect.any(AbortSignal),
    ), { timeout: 1200 })

    await user.selectOptions(screen.getByLabelText('Sort field'), 'sizeBytes')
    await user.selectOptions(screen.getByLabelText('Sort direction'), 'asc')
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ sortBy: 'sizeBytes', sortDirection: 'asc', page: 1 }),
      undefined,
      expect.any(AbortSignal),
    ))

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }), undefined, expect.any(AbortSignal),
    ))

    const callsBeforeRefresh = listMock.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(callsBeforeRefresh))
  })

  it('uses native navigation and only marks the clicked row as starting', async () => {
    listMock.mockResolvedValue(populatedResult)
    const clicked: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.getAttribute('href') ?? '')
    })
    const user = userEvent.setup()
    render(<LogsPageClient />)
    await screen.findByText('api.log')

    const buttons = screen.getAllByRole('button', { name: /^Download / })
    await user.click(buttons[0])

    expect(clicked).toEqual(['/api/download/admin-logs/opaque-one%2Bvalue'])
    expect(buttons[0]).toHaveTextContent('Starting…')
    expect(buttons[1]).toHaveTextContent('Download')
  })

  it.each([
    ['forbidden', 'Admin role'],
    ['feature-disabled', 'currently disabled'],
    ['source-unavailable', 'temporarily unavailable'],
    ['failed', 'could not be loaded'],
  ] as const)('renders a safe %s listing error', async (kind, message) => {
    listMock.mockRejectedValue(new AdminLogsClientError(kind, kind === 'forbidden' ? 403 : 503))
    render(<LogsPageClient />)
    expect(await screen.findByText(new RegExp(message, 'i'))).toBeInTheDocument()
  })

  it('uses the existing login flow for a listing 401', async () => {
    listMock.mockRejectedValue(new AdminLogsClientError('session-expired', 401))
    render(<LogsPageClient />)
    await waitFor(() => expect(redirectMock).toHaveBeenCalledWith('session-expired'))
  })

  it.each([
    ['file-unavailable', 'no longer available'],
    ['file-expired', 'expired'],
    ['file-changed', 'changed after'],
    ['file-too-large', 'exceeds the server'],
    ['feature-disabled', 'currently disabled'],
    ['source-unavailable', 'temporarily unavailable'],
    ['forbidden', 'Admin role'],
    ['download-failed', 'could not be started'],
  ])('renders and clears the fixed %s download feedback', async (code, message) => {
    listMock.mockResolvedValue(populatedResult)
    render(<LogsPageClient initialDownloadError={code} />)
    expect(await screen.findByText(new RegExp(message, 'i'))).toBeInTheDocument()
    expect(replace).toHaveBeenCalledWith('/admin/system/logs', { scroll: false })
  })

  it('redirects a safe session-expired download code to login', async () => {
    listMock.mockResolvedValue(populatedResult)
    render(<LogsPageClient initialDownloadError="session-expired" />)
    await waitFor(() => expect(redirectMock).toHaveBeenCalledWith('session-expired'))
  })
})
