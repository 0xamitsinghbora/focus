import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AddTaskCard } from '../components/AddTaskCard'

describe('AddTaskCard Keyboard Friendliness', () => {
  it('opens Due Date popover when pressing Enter on calendar icon button', () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<AddTaskCard isExpanded={true} onAdd={onAdd} />)

    const dueButton = screen.getByTitle(/Due Date & Time/i)
    expect(dueButton).toBeDefined()

    // Trigger Enter keydown on due date trigger
    fireEvent.keyDown(dueButton, { key: 'Enter', code: 'Enter' })

    // Popover content should be displayed
    expect(screen.getByText('Due Date & Time')).toBeDefined()
    expect(screen.getAllByText('Today').length).toBeGreaterThan(0)
    expect(screen.getByText('Tomorrow')).toBeDefined()
    expect(screen.getByText('Next week')).toBeDefined()
  })

  it('opens Group Tag popover when pressing Enter on tag icon button', () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<AddTaskCard isExpanded={true} onAdd={onAdd} />)

    const groupButton = screen.getByTitle(/Add group tag/i)
    expect(groupButton).toBeDefined()

    // Trigger Enter keydown on group trigger
    fireEvent.keyDown(groupButton, { key: 'Enter', code: 'Enter' })

    // Popover content should be displayed
    expect(screen.getByText('Group Tag & Theme')).toBeDefined()
    expect(screen.getByPlaceholderText(/e\.g\. Design, Backend/i)).toBeDefined()
  })

  it('closes popovers when Escape is pressed', () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<AddTaskCard isExpanded={true} onAdd={onAdd} />)

    const dueButton = screen.getByTitle(/Due Date & Time/i)
    fireEvent.keyDown(dueButton, { key: 'Enter', code: 'Enter' })
    expect(screen.getByText('Due Date & Time')).toBeDefined()

    // Press Escape
    fireEvent.keyDown(dueButton, { key: 'Escape', code: 'Escape' })
    expect(screen.queryByText('Deadline when task must be finished')).toBeNull()
  })

  it('protects against accidental draft loss on dirty form and requires second confirm to discard', () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()
    render(<AddTaskCard isExpanded={true} onAdd={onAdd} onCancel={onCancel} />)

    const titleInput = screen.getByPlaceholderText(/What do you want to accomplish\?/i)
    fireEvent.change(titleInput, { target: { value: 'Crucial uncommitted task draft' } })

    const cancelButton = screen.getByText('Cancel')
    // First cancel click does not discard; shows Discard? warning
    fireEvent.click(cancelButton)
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByText('Discard?')).toBeDefined()
    expect(screen.getByText(/Draft unsaved: Esc again to discard/i)).toBeDefined()

    // Second cancel click confirms and discards
    fireEvent.click(screen.getByText('Discard?'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('immediately cancels clean form without prompting', () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()
    render(<AddTaskCard isExpanded={true} onAdd={onAdd} onCancel={onCancel} />)

    const cancelButton = screen.getByText('Cancel')
    fireEvent.click(cancelButton)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('automatically parses duration and tag shorthands from task title', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<AddTaskCard isExpanded={true} onAdd={onAdd} />)

    const titleInput = screen.getByPlaceholderText(/What do you want to accomplish\?/i)
    const form = titleInput.closest('form')
    expect(form).toBeDefined()

    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'Refactor database models ~45m #backend' } })
      fireEvent.submit(form!)
    })

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Refactor database models',
        targetMinutes: 45,
        groupTag: 'backend'
      })
    )
  })

  it('opens Due Date popover directly when pressing Tab in the note textarea', () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<AddTaskCard isExpanded={true} onAdd={onAdd} />)

    const noteTextarea = screen.getByPlaceholderText('Add note')
    expect(noteTextarea).toBeDefined()

    // Press Tab (without shift) in note textarea
    fireEvent.keyDown(noteTextarea, { key: 'Tab', code: 'Tab' })

    // Popover content should be displayed directly
    expect(screen.getByText('Due Date & Time')).toBeDefined()
    expect(screen.getAllByText('Today').length).toBeGreaterThan(0)
    expect(screen.getByText('Tomorrow')).toBeDefined()
  })

  it('closes Due Date popover and returns focus to note textarea on Shift+Tab from time control', () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<AddTaskCard isExpanded={true} onAdd={onAdd} />)

    const noteTextarea = screen.getByPlaceholderText('Add note')
    fireEvent.keyDown(noteTextarea, { key: 'Tab', code: 'Tab' })
    expect(screen.getByText('Due Date & Time')).toBeDefined()

    const hourControl = screen.getByRole('spinbutton', { name: 'Hour' })
    expect(hourControl).toBeDefined()

    // Press Shift+Tab on hour control
    fireEvent.keyDown(hourControl, { key: 'Tab', code: 'Tab', shiftKey: true })

    // Popover should close
    expect(screen.queryByText('Due Date & Time')).toBeNull()
  })
})
