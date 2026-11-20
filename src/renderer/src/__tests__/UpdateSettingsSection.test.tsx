import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UpdateSettingsSection } from '../components/settings/UpdateSettingsSection'
import { UpdateState } from '../../../shared/types'

const mockToast = {
  show: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
}

vi.mock('../lib/useToast', () => ({
  useToast: () => mockToast
}))

describe('UpdateSettingsSection Component', () => {
  let mockState: UpdateState
  let statusChangeCallback: ((s: UpdateState) => void) | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    statusChangeCallback = null

    mockState = {
      status: 'idle',
      currentVersion: '1.0.0',
      availableUpdate: null,
      progress: null,
      error: null,
      lastCheckedAt: null
    }

    // @ts-ignore mock window.api for test
    window.api = {
      updater: {
        getState: vi.fn().mockResolvedValue(mockState),
        checkForUpdates: vi.fn().mockImplementation(async () => {
          mockState = {
            ...mockState,
            status: 'available',
            availableUpdate: {
              version: '1.1.0',
              releaseName: 'Focus 1.1.0 Released',
              releaseNotes: 'Awesome new features',
              publishedAt: '2026-11-20T10:00:00Z',
              htmlUrl: 'https://github.com/healthOS/focus/releases/tag/v1.1.0',
              isPrerelease: false,
              assetName: 'Focus-Setup-1.1.0.exe',
              assetSize: 52428800,
              downloadUrl: 'https://example.com/Focus-Setup-1.1.0.exe'
            }
          }
          statusChangeCallback?.(mockState)
          return mockState
        }),
        downloadUpdate: vi.fn().mockResolvedValue(true),
        cancelDownload: vi.fn().mockResolvedValue(true),
        installUpdate: vi.fn().mockResolvedValue(true),
        cleanCache: vi.fn().mockResolvedValue({
          success: true,
          freedBytes: 104857600,
          cleanedFiles: ['Focus-Setup-0.9.0.exe']
        }),
        onStatusChange: vi.fn((cb) => {
          statusChangeCallback = cb
          return () => {}
        }),
        onDownloadProgress: vi.fn(() => () => {})
      }
    }
  })

  it('renders software updates header and current version', async () => {
    render(
      <UpdateSettingsSection
        autoCheckUpdates={true}
        setAutoCheckUpdates={vi.fn()}
        autoDownloadUpdates={false}
        setAutoDownloadUpdates={vi.fn()}
      />
    )

    expect(screen.getByText('Software Updates')).toBeDefined()
    expect(screen.getByText('v1.0.0')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Check for Updates' })).toBeDefined()
  })

  it('triggers update check and displays available update card', async () => {
    render(
      <UpdateSettingsSection
        autoCheckUpdates={true}
        setAutoCheckUpdates={vi.fn()}
        autoDownloadUpdates={false}
        setAutoDownloadUpdates={vi.fn()}
      />
    )

    const checkBtn = screen.getByRole('button', { name: 'Check for Updates' })
    fireEvent.click(checkBtn)

    await waitFor(() => {
      expect(window.api.updater.checkForUpdates).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.getByText('New Update')).toBeDefined()
      expect(screen.getByText('v1.1.0')).toBeDefined()
      expect(screen.getByRole('button', { name: 'Download Update' })).toBeDefined()
      expect(screen.getByRole('button', { name: 'View on GitHub' })).toBeDefined()
    })
  })

  it('triggers download when Download Update button is clicked', async () => {
    render(
      <UpdateSettingsSection
        autoCheckUpdates={true}
        setAutoCheckUpdates={vi.fn()}
        autoDownloadUpdates={false}
        setAutoDownloadUpdates={vi.fn()}
      />
    )

    // First check
    fireEvent.click(screen.getByRole('button', { name: 'Check for Updates' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Download Update' })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Download Update' }))
    expect(window.api.updater.downloadUpdate).toHaveBeenCalled()
  })

  it('renders clean cache button and triggers cache cleanup', async () => {
    render(
      <UpdateSettingsSection
        autoCheckUpdates={true}
        setAutoCheckUpdates={vi.fn()}
        autoDownloadUpdates={false}
        setAutoDownloadUpdates={vi.fn()}
      />
    )

    const cleanBtn = screen.getByRole('button', { name: 'Clean Cache' })
    expect(cleanBtn).toBeDefined()
    fireEvent.click(cleanBtn)

    await waitFor(() => {
      expect(window.api.updater.cleanCache).toHaveBeenCalledTimes(1)
      expect(mockToast.success).toHaveBeenCalledWith(
        expect.stringContaining('Reclaimed'),
        'Cache Cleaned'
      )
    })
  })

  it('toggles auto update preferences', () => {
    const setAutoCheck = vi.fn()
    const setAutoDownload = vi.fn()

    render(
      <UpdateSettingsSection
        autoCheckUpdates={true}
        setAutoCheckUpdates={setAutoCheck}
        autoDownloadUpdates={false}
        setAutoDownloadUpdates={setAutoDownload}
      />
    )

    const autoCheckSwitch = screen.getByRole('switch', {
      name: 'Automatically check for updates'
    })
    const autoDownloadSwitch = screen.getByRole('switch', {
      name: 'Automatically download updates'
    })

    fireEvent.click(autoCheckSwitch)
    expect(setAutoCheck).toHaveBeenCalledWith(false)

    fireEvent.click(autoDownloadSwitch)
    expect(setAutoDownload).toHaveBeenCalledWith(true)
  })
})
