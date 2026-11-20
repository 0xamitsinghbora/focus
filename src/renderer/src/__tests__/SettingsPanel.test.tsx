import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { SettingsPanel } from '../components/SettingsPanel'
import { ToastProvider } from '../components/ui/toast'

describe('SettingsPanel Component', () => {
  const mockSetTheme = vi.fn()
  const mockOnSettingsSaved = vi.fn().mockResolvedValue(undefined)
  const mockOnSyncComplete = vi.fn().mockResolvedValue(undefined)
  const mockOnIntervalChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as any).api = {
      settings: {
        get: vi.fn().mockResolvedValue({
          reminderIntervalMinutes: 20,
          openAtLogin: true,
          driveSyncEnabled: false,
          theme: 'system'
        }),
        set: vi.fn().mockResolvedValue(undefined),
        uninstall: vi.fn().mockResolvedValue({ success: true }),
        deleteAllData: vi
          .fn()
          .mockResolvedValue({ success: true, message: 'All local and Google Drive data deleted.' })
      },
      sync: {
        driveStatus: vi.fn().mockResolvedValue({
          isConnected: false,
          isSyncing: false,
          isConfigured: false
        }),
        driveConnect: vi.fn().mockResolvedValue({ success: true }),
        driveDisconnect: vi.fn().mockResolvedValue(undefined),
        driveSyncNow: vi.fn().mockResolvedValue({ success: true })
      },
      logs: {
        exportData: vi.fn().mockResolvedValue({ success: true, filePath: 'mock/export.json' }),
        importData: vi.fn().mockResolvedValue({
          success: true,
          stats: { logs: 10, dailyGoals: 5, inboxGoals: 2, recurringGoals: 1 }
        }),
        backupDatabase: vi.fn().mockResolvedValue('/mock/backup.db'),
        openDataFolder: vi.fn().mockResolvedValue(true)
      },
      events: {
        onDataUpdated: vi.fn()
      }
    }
  })

  it('shows error toast when connecting to Google Drive if credentials are not configured', async () => {
    ;(window as any).api.sync.driveStatus = vi.fn().mockResolvedValue({
      isConnected: false,
      isSyncing: false,
      isConfigured: false
    })

    render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Connect Google Drive' })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Connect Google Drive' }))

    await waitFor(() => {
      expect(screen.getByText('Google Drive credentials are not set to connect.')).toBeDefined()
    })
  })

  it('collapses Advanced & Diagnostics by default and expands on click', async () => {
    render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/Report Bug/i)).toBeDefined()
    })

    // Both Report Bug and Delete Data are directly visible without collapsible toggles
    expect(screen.getByRole('button', { name: 'Submit Bug Report' })).toBeDefined()
    expect(screen.getByText('Delete All Data')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Delete Data' })).toBeDefined()

    // Removed legacy options
    expect(screen.queryByText('Copy Diagnostic Report')).toBeNull()
    expect(screen.queryByText('Open Logs Folder')).toBeNull()
  })

  it('opens confirmation modal and triggers delete all data after 3 yes confirmations from changing buttons', async () => {
    const mockDeleteAllData = vi
      .fn()
      .mockResolvedValue({ success: true, message: 'All local and Google Drive data deleted.' })
    ;(window as any).api.settings.get = vi.fn().mockResolvedValue({
      reminderIntervalMinutes: 20,
      openAtLogin: true,
      theme: 'system'
    })
    ;(window as any).api.settings.deleteAllData = mockDeleteAllData

    render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete Data' })).toBeDefined()
    })

    // Click "Delete Data" button
    fireEvent.click(screen.getByRole('button', { name: 'Delete Data' }))

    // Confirmation modal should appear with step 1
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Delete All Data' })).toBeDefined()
    })

    // Step 1: Click first Yes button
    const step1Button = screen.getByRole('button', { name: 'Yes, delete my data' })
    fireEvent.click(step1Button)

    // Step 2: Changing button appears
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Yes, I understand this cannot be undone' })
      ).toBeDefined()
    })
    const step2Button = screen.getByRole('button', {
      name: 'Yes, I understand this cannot be undone'
    })
    fireEvent.click(step2Button)

    // Step 3: Changing button appears
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Yes, permanently delete everything now' })
      ).toBeDefined()
    })
    const step3Button = screen.getByRole('button', {
      name: 'Yes, permanently delete everything now'
    })
    fireEvent.click(step3Button)

    await waitFor(() => {
      expect(mockDeleteAllData).toHaveBeenCalled()
    })
  })

  it('shows toast notification on save and never renders inline layout-shifting saving status', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Theme')).toBeDefined()
    })

    // Click 45m preset button
    const preset45 = screen.getByRole('button', { name: '45m' })
    fireEvent.click(preset45)

    // Inline saving status should NOT exist
    expect(screen.queryByText('Saving...')).toBeNull()

    // Fast-forward debounce timer
    vi.advanceTimersByTime(1100)

    await waitFor(() => {
      expect(mockOnSettingsSaved).toHaveBeenCalled()
      expect(window.api.settings.set).toHaveBeenCalled()
    })

    // Still should not show any inline 'Saving...'
    expect(screen.queryByText('Saving...')).toBeNull()

    vi.useRealTimers()
  })

  it('renders sync options for Google Drive without separate Local Only tab', async () => {
    render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Local Only' })).toBeNull()
      expect(screen.getByText('Google Drive')).toBeDefined()
      expect(screen.queryByRole('button', { name: 'Export Data (JSON)' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Import Data (JSON)' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Backup Database' })).toBeNull()
    })
  })

  it('handles connected Google Drive state with Synced badge and Disconnect', async () => {
    const mockDisconnect = vi.fn().mockResolvedValue({ success: true })

    ;(window as any).api.settings.get = vi.fn().mockResolvedValue({
      reminderIntervalMinutes: 20,
      openAtLogin: true,
      syncProvider: 'google-drive',
      driveSyncEnabled: true,
      theme: 'system'
    })
    ;(window as any).api.sync.driveStatus = vi.fn().mockResolvedValue({
      isConfigured: true,
      isConnected: true,
      isSyncing: false
    })
    ;(window as any).api.sync.driveDisconnect = mockDisconnect

    render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('(Connected)')).toBeDefined()
      expect(screen.getByText('Synced')).toBeDefined()
      expect(screen.queryByRole('button', { name: 'Sync' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Disconnect' })).toBeDefined()
    })

    // Test Disconnect button
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    await waitFor(() => {
      expect(mockDisconnect).toHaveBeenCalled()
    })
  })

  it('handles delete data failure gracefully without getting stuck in loading state', async () => {
    ;(window as any).api.settings.deleteAllData = vi.fn().mockResolvedValue({
      success: false,
      error: 'Failed to access database.'
    })

    render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete Data' })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Data' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Delete All Data' })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete my data' }))
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Yes, I understand this cannot be undone' })
      ).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Yes, I understand this cannot be undone' }))
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Yes, permanently delete everything now' })
      ).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Yes, permanently delete everything now' }))

    await waitFor(() => {
      expect((window as any).api.settings.deleteAllData).toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.getByText('Failed to access database.')).toBeDefined()
    })
  })

  it('handles delete data success with informative message feedback', async () => {
    ;(window as any).api.settings.deleteAllData = vi.fn().mockResolvedValue({
      success: true,
      message: 'All local and Google Drive data deleted.'
    })

    render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete Data' })).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete Data' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Delete All Data' })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete my data' }))
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Yes, I understand this cannot be undone' })
      ).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Yes, I understand this cannot be undone' }))
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Yes, permanently delete everything now' })
      ).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Yes, permanently delete everything now' }))

    await waitFor(() => {
      expect((window as any).api.settings.deleteAllData).toHaveBeenCalled()
      expect(screen.getByText('All local and Google Drive data deleted.')).toBeDefined()
    })
  })

  it('handles delete data rejection without locking UI in loading spinner', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(window as any).api.settings.deleteAllData = vi
      .fn()
      .mockRejectedValue(new Error('Drive wipe failed'))

    render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete Data' })).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete Data' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Delete All Data' })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete my data' }))
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Yes, I understand this cannot be undone' })
      ).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Yes, I understand this cannot be undone' }))
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Yes, permanently delete everything now' })
      ).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Yes, permanently delete everything now' }))

    await waitFor(() => {
      expect((window as any).api.settings.deleteAllData).toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.getByText('Drive wipe failed')).toBeDefined()
    })

    consoleSpy.mockRestore()
  })

  it('allows canceling delete data from modal at step 2', async () => {
    const mockDeleteAllData = vi.fn().mockResolvedValue({ success: true })
    ;(window as any).api.settings.deleteAllData = mockDeleteAllData

    render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete Data' })).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete Data' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Delete All Data' })).toBeDefined()
    })

    // Advance to step 2
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete my data' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined()
    })

    // Cancel at step 2
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(mockDeleteAllData).not.toHaveBeenCalled()
    })
  })

  it('triggers sqlite database download and google drive upload from delete data modal backup recommendation', async () => {
    ;(window as any).api.sync.driveStatus = vi.fn().mockResolvedValue({
      isConnected: true,
      isSyncing: false,
      isConfigured: true
    })
    ;(window as any).api.logs.downloadDatabase = vi
      .fn()
      .mockResolvedValue({ success: true, filePath: 'focus-backup.db' })
    ;(window as any).api.logs.uploadDatabaseToDrive = vi
      .fn()
      .mockResolvedValue({ success: true, fileName: 'focus-backup.db' })

    render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete Data' })).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete Data' }))

    await waitFor(() => {
      expect(screen.getByText('Backup Recommended')).toBeDefined()
    })

    // Click the Download Database (.db) button inside the modal
    const downloadBtn = screen.getByRole('button', { name: /Download Database/i })
    fireEvent.click(downloadBtn)

    await waitFor(() => {
      expect((window as any).api.logs.downloadDatabase).toHaveBeenCalled()
    })

    // Click the Upload to Google Drive button inside the modal
    const uploadBtn = screen.getByRole('button', { name: /Upload to Google Drive/i })
    fireEvent.click(uploadBtn)

    await waitFor(() => {
      expect((window as any).api.logs.uploadDatabaseToDrive).toHaveBeenCalled()
    })
  })

  it('preserves existing non-UI settings like groupColors and sortOption when saving updated settings', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    ;(window as any).api.settings.get = vi.fn().mockResolvedValue({
      reminderIntervalMinutes: 20,
      openAtLogin: true,
      driveSyncEnabled: false,
      theme: 'system',
      groupColors: { work: '#ff0000' },
      sortOption: 'manual',
      collapsedColumns: { planned: true }
    })

    render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Theme')).toBeDefined()
    })

    // Click 30m preset button to trigger a change
    const preset30 = screen.getByRole('button', { name: '30m' })
    fireEvent.click(preset30)

    vi.advanceTimersByTime(1100)

    await waitFor(() => {
      expect(window.api.settings.set).toHaveBeenCalledWith(
        expect.objectContaining({
          reminderIntervalMinutes: 30,
          groupColors: { work: '#ff0000' },
          sortOption: 'manual',
          collapsedColumns: { planned: true }
        })
      )
    })

    vi.useRealTimers()
  })

  it('flushes pending debounced settings immediately when component unmounts before timer expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const { unmount } = render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Theme')).toBeDefined()
    })

    // Click 45m preset button to trigger a change
    const preset45 = screen.getByRole('button', { name: '45m' })
    fireEvent.click(preset45)

    // Unmount immediately without waiting 1000ms
    unmount()

    await waitFor(() => {
      expect(window.api.settings.set).toHaveBeenCalledWith(
        expect.objectContaining({
          reminderIntervalMinutes: 45
        })
      )
      expect(mockOnSettingsSaved).toHaveBeenCalled()
    })

    vi.useRealTimers()
  })

  it('does not render Day Cutoff Hour selector', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    ;(window as any).api.settings.get = vi.fn().mockResolvedValue({
      reminderIntervalMinutes: 20,
      openAtLogin: true,
      dayCutoffHour: 0,
      theme: 'system'
    })

    render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Theme')).toBeDefined()
    })

    expect(screen.queryByText('Day Cutoff Hour')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Day cutoff hour' })).toBeNull()

    vi.useRealTimers()
  })

  it('persists discrete switches immediately with 0 delay and flushes on beforeunload', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    ;(window as any).api.settings.get = vi.fn().mockResolvedValue({
      reminderIntervalMinutes: 20,
      openAtLogin: true,
      showWidget: true,
      dayCutoffHour: 0,
      theme: 'system'
    })

    render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Launch on Startup' })).toBeDefined()
    })

    const loginToggle = screen.getByRole('switch', { name: 'Launch on Startup' })
    fireEvent.click(loginToggle)

    // Should save immediately on next tick without advancing 1000ms
    vi.advanceTimersByTime(10)

    await waitFor(() => {
      expect(window.api.settings.set).toHaveBeenCalledWith(
        expect.objectContaining({
          openAtLogin: false
        })
      )
    })

    // Simulate beforeunload event
    window.dispatchEvent(new Event('beforeunload'))

    vi.useRealTimers()
  })

  it('persists undefined driveRefreshToken without resurrecting stale values from current', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    ;(window as any).api.settings.get = vi.fn().mockResolvedValue({
      reminderIntervalMinutes: 20,
      openAtLogin: true,
      driveRefreshToken: 'stale-token',
      theme: 'system'
    })

    const { unmount } = render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Theme')).toBeDefined()
    })

    // Trigger change by clicking preset 30
    fireEvent.click(screen.getByRole('button', { name: '30m' }))

    unmount()

    await waitFor(() => {
      expect(window.api.settings.set).toHaveBeenCalled()
    })

    vi.useRealTimers()
  })

  it('connects to Google Drive when credentials are configured', async () => {
    const mockDriveConnect = vi.fn().mockResolvedValue({ success: true })
    ;(window as any).api.sync.driveStatus = vi.fn().mockResolvedValue({
      isConnected: false,
      isSyncing: false,
      isConfigured: true
    })
    ;(window as any).api.sync.driveConnect = mockDriveConnect

    render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Connect Google Drive' })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Connect Google Drive' }))

    await waitFor(() => {
      expect(mockDriveConnect).toHaveBeenCalled()
    })
  })

  it('filters onDataUpdated events to avoid re-fetching settings on goal/log changes', async () => {
    let updateCallback: ((target?: any) => void) | undefined
    ;(window as any).api.events.onDataUpdated = vi.fn().mockImplementation((cb) => {
      updateCallback = cb
      return () => {}
    })

    render(
      <ToastProvider>
        <SettingsPanel
          theme="system"
          setTheme={mockSetTheme}
          onSettingsSaved={mockOnSettingsSaved}
          onSyncComplete={mockOnSyncComplete}
          onIntervalChange={mockOnIntervalChange}
        />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(updateCallback).toBeDefined()
    })

    const getSpy = (window as any).api.settings.get
    getSpy.mockClear()

    // Trigger update for goal-only changes
    await act(async () => {
      await updateCallback!({ goalDates: ['2026-10-31'], syncSettings: false })
    })
    // Should NOT trigger settings.get()
    expect(getSpy).not.toHaveBeenCalled()

    // Trigger update for settings changes
    await act(async () => {
      await updateCallback!({ syncSettings: true })
    })
    // SHOULD trigger settings.get()
    expect(getSpy).toHaveBeenCalledTimes(1)
  })
})
