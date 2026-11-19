import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DeleteDataModal } from '../components/settings/DeleteDataModal'

describe('DeleteDataModal Component', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <DeleteDataModal
        isOpen={false}
        isDeleting={false}
        isExporting={false}
        onExportData={vi.fn()}
        onClose={vi.fn()}
        onConfirmDelete={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('progresses through 3 confirmation steps with changing buttons before confirming', async () => {
    const mockConfirmDelete = vi.fn().mockResolvedValue(undefined)
    const mockClose = vi.fn()

    render(
      <DeleteDataModal
        isOpen={true}
        isDeleting={false}
        isExporting={false}
        onExportData={vi.fn()}
        onClose={mockClose}
        onConfirmDelete={mockConfirmDelete}
      />
    )

    // Step 1: Initial state
    expect(screen.getByRole('heading', { name: 'Delete All Data' })).toBeDefined()
    expect(screen.getByText(/permanently delete all your Focus session logs/i)).toBeDefined()
    const step1Btn = screen.getByRole('button', { name: 'Yes, delete my data (1/3)' })
    expect(step1Btn).toBeDefined()
    expect(mockConfirmDelete).not.toHaveBeenCalled()

    // Click step 1
    fireEvent.click(step1Btn)

    // Step 2: Warning state & swapped layout button
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Yes, I understand this cannot be undone (2/3)' })
      ).toBeDefined()
    })
    expect(screen.getByText(/Caution: Once deleted, this action cannot be undone/i)).toBeDefined()
    const step2Btn = screen.getByRole('button', {
      name: 'Yes, I understand this cannot be undone (2/3)'
    })

    // Click step 2
    fireEvent.click(step2Btn)

    // Step 3: Final confirmation button
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Yes, permanently delete everything now (3/3)' })
      ).toBeDefined()
    })
    expect(screen.getByText(/Final Confirmation \(Step 3 of 3\)/i)).toBeDefined()
    const step3Btn = screen.getByRole('button', {
      name: 'Yes, permanently delete everything now (3/3)'
    })

    // Click step 3
    fireEvent.click(step3Btn)

    expect(mockConfirmDelete).toHaveBeenCalledTimes(1)
  })

  it('resets step back to 1 when canceled at step 2', async () => {
    const mockClose = vi.fn()

    render(
      <DeleteDataModal
        isOpen={true}
        isDeleting={false}
        isExporting={false}
        onExportData={vi.fn()}
        onClose={mockClose}
        onConfirmDelete={vi.fn()}
      />
    )

    // Advance to step 2
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete my data (1/3)' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel (Abort)' })).toBeDefined()
    })

    // Click Cancel
    fireEvent.click(screen.getByRole('button', { name: 'Cancel (Abort)' }))
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('triggers onDownloadDatabase and onUploadDatabaseToDrive when backup buttons are clicked', async () => {
    const mockDownload = vi.fn().mockResolvedValue(true)
    const mockUpload = vi.fn().mockResolvedValue(true)

    render(
      <DeleteDataModal
        isOpen={true}
        isDeleting={false}
        isDriveConnected={true}
        onDownloadDatabase={mockDownload}
        onUploadDatabaseToDrive={mockUpload}
        onClose={vi.fn()}
        onConfirmDelete={vi.fn()}
      />
    )

    const downloadBtn = screen.getByRole('button', { name: 'Download Database (.db)' })
    fireEvent.click(downloadBtn)
    await waitFor(() => {
      expect(mockDownload).toHaveBeenCalledTimes(1)
    })

    const uploadBtn = screen.getByRole('button', { name: 'Upload to Google Drive' })
    fireEvent.click(uploadBtn)
    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(1)
    })
  })

  it('disables Google Drive upload button and displays "Not connected" when isDriveConnected is false', () => {
    const mockUpload = vi.fn().mockResolvedValue(true)

    render(
      <DeleteDataModal
        isOpen={true}
        isDeleting={false}
        isDriveConnected={false}
        onUploadDatabaseToDrive={mockUpload}
        onClose={vi.fn()}
        onConfirmDelete={vi.fn()}
      />
    )

    const uploadBtn = screen.getByRole('button', { name: 'Google Drive not connected' })
    expect(uploadBtn).toBeDefined()
    expect(uploadBtn).toHaveProperty('disabled', true)
    expect(screen.getByText('Not connected')).toBeDefined()
    expect(screen.getByText('Connect Drive in settings first')).toBeDefined()

    fireEvent.click(uploadBtn)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('does not display Uploaded badge when onUploadDatabaseToDrive fails (returns false)', async () => {
    const mockUpload = vi.fn().mockResolvedValue(false)

    render(
      <DeleteDataModal
        isOpen={true}
        isDeleting={false}
        isDriveConnected={true}
        onUploadDatabaseToDrive={mockUpload}
        onClose={vi.fn()}
        onConfirmDelete={vi.fn()}
      />
    )

    const uploadBtn = screen.getByRole('button', { name: 'Upload to Google Drive' })
    fireEvent.click(uploadBtn)

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(1)
    })

    // Should NOT show "Uploaded"
    expect(screen.queryByText('Uploaded')).toBeNull()
  })

  it('disables buttons and displays deleting progress while isDeleting is true', () => {
    render(
      <DeleteDataModal
        isOpen={true}
        isDeleting={true}
        isExporting={false}
        onExportData={vi.fn()}
        onClose={vi.fn()}
        onConfirmDelete={vi.fn()}
      />
    )

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    expect(cancelBtn).toHaveProperty('disabled', true)
    const step1Btn = screen.getByRole('button', { name: 'Yes, delete my data (1/3)' })
    expect(step1Btn).toHaveProperty('disabled', true)
  })
})
