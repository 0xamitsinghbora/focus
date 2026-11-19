import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeleteDataSection } from '../components/settings/DeleteDataSection'

describe('DeleteDataSection Component', () => {
  it('renders Delete All Data section with title, description, and Delete Data button', () => {
    const mockOpenModal = vi.fn()
    render(<DeleteDataSection onOpenDeleteDataModal={mockOpenModal} />)

    expect(screen.getByText('Delete All Data')).toBeDefined()
    expect(
      screen.getByText(
        /permanently delete all your local activity history, goals, and Google Drive sync data/i
      )
    ).toBeDefined()

    const deleteBtn = screen.getByRole('button', { name: 'Delete Data' })
    expect(deleteBtn).toBeDefined()

    fireEvent.click(deleteBtn)
    expect(mockOpenModal).toHaveBeenCalledTimes(1)
  })
})
