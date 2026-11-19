import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TrashArchiveModal } from '../components/goals/TrashArchiveModal'
import { DailyGoal } from '../../../shared/types'

vi.mock('../lib/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn()
  })
}))

describe('TrashArchiveModal Component', () => {
  const mockDeletedGoals: DailyGoal[] = [
    {
      id: 'deleted-1',
      title: 'Old meeting notes',
      date: '2026-10-25',
      status: 'planned',
      groupTag: 'Meetings',
      groupColor: 'blue',
      deletedAt: '2026-10-28T10:00:00.000Z',
      createdAt: '2026-10-25T09:00:00.000Z'
    },
    {
      id: 'deleted-2',
      title: 'Refactor database schema',
      note: 'PostgreSQL migration steps',
      date: '2026-10-26',
      status: 'in_progress',
      deletedAt: '2026-10-28T11:30:00.000Z',
      createdAt: '2026-10-26T09:00:00.000Z'
    }
  ]

  let mockGetDeleted: ReturnType<typeof vi.fn>
  let mockRestore: ReturnType<typeof vi.fn>
  let mockEmptyTrash: ReturnType<typeof vi.fn>
  let mockHardDelete: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDeleted = vi.fn().mockResolvedValue(mockDeletedGoals)
    mockRestore = vi.fn().mockImplementation(async (id: string) => {
      const g = mockDeletedGoals.find((goal) => goal.id === id)
      return g ? { ...g, deletedAt: undefined } : null
    })
    mockEmptyTrash = vi.fn().mockResolvedValue({ success: true, count: 2 })
    mockHardDelete = vi.fn().mockResolvedValue({ success: true })

    window.api = {
      ...(window.api || {}),
      goals: {
        ...(window.api?.goals || {}),
        getDeleted: mockGetDeleted,
        restore: mockRestore,
        emptyTrash: mockEmptyTrash,
        hardDelete: mockHardDelete
      }
    } as unknown as typeof window.api
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <TrashArchiveModal isOpen={false} onClose={vi.fn()} onGoalRestored={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('loads and displays deleted tasks when opened', async () => {
    render(<TrashArchiveModal isOpen={true} onClose={vi.fn()} onGoalRestored={vi.fn()} />)

    await waitFor(() => {
      expect(mockGetDeleted).toHaveBeenCalled()
      expect(screen.getByText('Old meeting notes')).toBeDefined()
      expect(screen.getByText('Refactor database schema')).toBeDefined()
      expect(screen.getByText('Meetings')).toBeDefined()
    })
  })

  it('filters deleted tasks when typing in search input', async () => {
    render(<TrashArchiveModal isOpen={true} onClose={vi.fn()} onGoalRestored={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Old meeting notes')).toBeDefined()
    })

    const searchInput = screen.getByPlaceholderText(/Search deleted tasks/i)
    fireEvent.change(searchInput, { target: { value: 'schema' } })

    expect(screen.queryByText('Old meeting notes')).toBeNull()
    expect(screen.getByText('Refactor database schema')).toBeDefined()

    // Test searching by note content
    fireEvent.change(searchInput, { target: { value: 'postgresql' } })
    expect(screen.queryByText('Old meeting notes')).toBeNull()
    expect(screen.getByText('Refactor database schema')).toBeDefined()
  })

  it('restores a deleted task when clicking Restore', async () => {
    const onGoalRestored = vi.fn()
    render(<TrashArchiveModal isOpen={true} onClose={vi.fn()} onGoalRestored={onGoalRestored} />)

    await waitFor(() => {
      expect(screen.getByText('Old meeting notes')).toBeDefined()
    })

    const restoreButtons = screen.getAllByRole('button', { name: /Restore/i })
    fireEvent.click(restoreButtons[0])

    await waitFor(() => {
      expect(mockRestore).toHaveBeenCalledWith('deleted-1')
      expect(onGoalRestored).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'deleted-1',
          title: 'Old meeting notes'
        })
      )
    })
  })

  it('closes when pressing Escape', async () => {
    const onClose = vi.fn()
    render(<TrashArchiveModal isOpen={true} onClose={onClose} onGoalRestored={vi.fn()} />)

    await waitFor(() => {
      expect(mockGetDeleted).toHaveBeenCalled()
    })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('prompts confirmation and empties trash when clicking Empty Trash', async () => {
    render(<TrashArchiveModal isOpen={true} onClose={vi.fn()} onGoalRestored={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Old meeting notes')).toBeDefined()
    })

    const emptyTrashBtn = screen.getByRole('button', { name: /Empty Trash/i })
    fireEvent.click(emptyTrashBtn)

    // Confirmation dialog appears
    expect(
      screen.getByText(/Are you sure you want to permanently delete all 2 tasks/i)
    ).toBeDefined()

    // Confirm button inside dialog
    const confirmBtn = screen.getAllByRole('button', { name: /Empty Trash/i })[1]
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mockEmptyTrash).toHaveBeenCalled()
      expect(screen.getByText('Trash is empty')).toBeDefined()
    })
  })

  it('prompts confirmation and permanently deletes single task', async () => {
    render(<TrashArchiveModal isOpen={true} onClose={vi.fn()} onGoalRestored={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Old meeting notes')).toBeDefined()
    })

    const deleteBtn = screen.getByRole('button', {
      name: /Permanently delete "Old meeting notes"/i
    })
    fireEvent.click(deleteBtn)

    // Confirmation dialog appears
    expect(screen.getByText(/Permanently delete “Old meeting notes”/i)).toBeDefined()

    const confirmBtn = screen.getByRole('button', { name: /Delete Permanently/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mockHardDelete).toHaveBeenCalledWith('deleted-1')
      expect(screen.queryByText('Old meeting notes')).toBeNull()
      expect(screen.getByText('Refactor database schema')).toBeDefined()
    })
  })

  it('supports pagination with load more and shows accurate count for unloaded tasks', async () => {
    mockGetDeleted.mockImplementation(async (_limit?: number, offset?: number) => {
      if (!offset || offset === 0) {
        return {
          goals: [mockDeletedGoals[0]],
          totalCount: 5
        }
      }
      return {
        goals: [mockDeletedGoals[1]],
        totalCount: 5
      }
    })

    render(<TrashArchiveModal isOpen={true} onClose={vi.fn()} onGoalRestored={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Old meeting notes')).toBeDefined()
      expect(screen.getByText('1 of 5')).toBeDefined()
      expect(screen.getByText(/Load More Tasks \(4 remaining\)/i)).toBeDefined()
    })

    // Click Empty Trash to verify dialog mentions unloaded tasks
    const emptyTrashBtn = screen.getByRole('button', { name: /Empty Trash/i })
    fireEvent.click(emptyTrashBtn)

    expect(
      screen.getByText(
        /Are you sure you want to permanently delete all 5 tasks in the trash \(including 4 unloaded tasks\)\?/i
      )
    ).toBeDefined()

    // Close confirmation dialog
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))

    // Click load more
    const loadMoreBtn = screen.getByRole('button', { name: /Load More Tasks/i })
    fireEvent.click(loadMoreBtn)

    await waitFor(() => {
      expect(mockGetDeleted).toHaveBeenCalledWith(50, 1)
      expect(screen.getByText('Refactor database schema')).toBeDefined()
      expect(screen.getByText('2 of 5')).toBeDefined()
    })
  })
})
