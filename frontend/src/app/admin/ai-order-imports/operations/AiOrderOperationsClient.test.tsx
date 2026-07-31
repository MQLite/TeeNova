import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AiOrderOperationsClient } from './AiOrderOperationsClient'
import { getAiOrderOperationsStatus } from '@/api/ai-order-imports'

vi.mock('@/api/ai-order-imports', () => ({
  getAiOrderOperationsStatus: vi.fn(),
}))

const mockedStatus = vi.mocked(getAiOrderOperationsStatus)

describe('AiOrderOperationsClient', () => {
  it('renders safe server feature, provider, storage, and environment state', async () => {
    mockedStatus.mockResolvedValue({
      environment: 'Staging',
      generatedAt: '2026-07-31T04:00:00Z',
      overallStatus: 'Blocked',
      features: {
        enabled: false,
        intakeEnabled: false,
        recognitionEnabled: false,
        reviewEnabled: false,
        confirmationEnabled: false,
        materializationEnabled: false,
      },
      migrations: {
        expectedMigrationIds: ['20260731042341_AddAiOrderOperationsHardening'],
        appliedExpectedMigrationIds: [],
        runtimeSchemaCurrent: false,
        status: 'Blocked',
      },
      privateStorageStatus: 'Ready',
      privateStorageAvailableBytes: 2_147_483_648,
      providers: [{
        provider: 'openai',
        displayName: 'OpenAI',
        status: 'Missing Key',
        privacyApprovalStatus: 'NotReviewed',
        approvedEnvironment: '',
        enabledModels: [],
        maximumMonthlyCostUsd: 100,
        maximumDailyCalls: 250,
        lastSanitizedSmokeTestSucceeded: false,
      }],
      queuedRecognitionJobs: 0,
      activeRecognitionLeases: 0,
      expiredOrStuckLeases: 0,
      retryableFailures: 0,
      deletionBacklog: 0,
      failedDeletionCount: 0,
      activeRetentionHolds: 0,
      sourceAccessesLast24Hours: 0,
      deniedSourceAccessesLast24Hours: 0,
      currentMonthProviderCalls: 0,
      currentMonthEstimatedCostUsd: 0,
      currentMonthActualCostUsd: 0,
      maximumMonthlyTotalCostUsd: 100,
      warnings: ['OpenAI: Missing Key.'],
      blockers: ['Required AI Order migrations are not applied.'],
    })

    render(<AiOrderOperationsClient />)

    await waitFor(() => expect(screen.getByText('Environment: Staging')).toBeInTheDocument())
    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByText('Missing Key')).toBeInTheDocument()
    expect(screen.getAllByText('Disabled')).toHaveLength(6)
    expect(screen.queryByText(/api[_ -]?key/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/App_Data|wwwroot/i)).not.toBeInTheDocument()
  })
})
