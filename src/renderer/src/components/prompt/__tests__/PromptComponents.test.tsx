import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { PromptTaskSelector } from '../PromptTaskSelector'
import { PromptDetailInput } from '../PromptDetailInput'
import { usePromptNavigation } from '../usePromptNavigation'
import { DailyGoal } from '../../../../../shared/types'
import { PromptOption } from '../types'

describe('PromptTaskSelector', () => {
  const mockGoal: DailyGoal = {
    id: 'g-test-1',
    title: 'Test Task Selector',
    status: 'in_progress',
    date: '2026-11-01',
    createdAt: '2026-11-01T10:00:00Z',
    groupTag: 'Backend'
  }

  it('renders goals and handles selection', () => {
    const onSelectOption = vi.fn()
    const onSnooze = vi.fn()
    const itemRefs = { current: [] }

    render(
      <PromptTaskSelector
        goals={[mockGoal]}
        safeSelectedIndex={0}
        itemRefs={itemRefs}
        status="idle"
        onSelectOption={onSelectOption}
        onSnooze={onSnooze}
      />
    )

    expect(screen.getByText('Test Task Selector')).toBeDefined()
    expect(screen.getByText('Backend')).toBeDefined()
    expect(screen.getByText('In Progress')).toBeDefined()

    fireEvent.click(screen.getByText('Test Task Selector'))
    expect(onSelectOption).toHaveBeenCalledWith(0)

    fireEvent.click(screen.getByText('Snooze'))
    expect(onSnooze).toHaveBeenCalled()
  })

  it('does not render Done button on task in selector', () => {
    const onSelectOption = vi.fn()
    const onSnooze = vi.fn()
    const itemRefs = { current: [] }

    render(
      <PromptTaskSelector
        goals={[mockGoal]}
        safeSelectedIndex={0}
        itemRefs={itemRefs}
        status="idle"
        onSelectOption={onSelectOption}
        onSnooze={onSnooze}
      />
    )

    expect(screen.queryByRole('button', { name: /done/i })).toBeNull()
  })

  it('renders Something Else and Break options', () => {
    const onSelectOption = vi.fn()
    const itemRefs = { current: [] }

    render(
      <PromptTaskSelector
        goals={[mockGoal]}
        safeSelectedIndex={0}
        itemRefs={itemRefs}
        status="idle"
        onSelectOption={onSelectOption}
        onSnooze={vi.fn()}
      />
    )

    expect(screen.getByText('Something Else')).toBeDefined()
    expect(screen.getByText('Break')).toBeDefined()
  })

  it('does not render 90s Dot Reset button in selector footer', () => {
    const itemRefs = { current: [] }

    render(
      <PromptTaskSelector
        goals={[mockGoal]}
        safeSelectedIndex={0}
        itemRefs={itemRefs}
        status="idle"
        onSelectOption={vi.fn()}
        onSnooze={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: /dot reset/i })).toBeNull()
  })
})

describe('PromptDetailInput', () => {
  const currentGoalOption: PromptOption = {
    type: 'goal',
    id: 'g-1',
    title: 'Refactor PromptWindow',
    goal: {
      id: 'g-1',
      title: 'Refactor PromptWindow',
      status: 'planned',
      date: '2026-11-01',
      createdAt: ''
    }
  }

  it('renders detail input and submits correctly', () => {
    const setNote = vi.fn()
    const setValidationError = vi.fn()
    const onBack = vi.fn()
    const onSubmit = vi.fn()
    const onKeyDown = vi.fn()
    const detailInputRef = React.createRef<HTMLInputElement>()

    render(
      <PromptDetailInput
        currentOption={currentGoalOption}
        note="Writing tests"
        setNote={setNote}
        validationError={null}
        setValidationError={setValidationError}
        status="idle"
        detailInputRef={detailInputRef}
        onBack={onBack}
        onSubmit={onSubmit}
        onKeyDown={onKeyDown}
      />
    )

    expect(screen.getByText('Refactor PromptWindow')).toBeDefined()
    expect(screen.getByDisplayValue('Writing tests')).toBeDefined()

    fireEvent.click(screen.getByText('Back'))
    expect(onBack).toHaveBeenCalled()

    fireEvent.click(screen.getByText('Submit'))
    expect(onSubmit).toHaveBeenCalled()
  })

  it('does not render mark task completed checkbox for goal option', () => {
    const detailInputRef = React.createRef<HTMLInputElement>()

    render(
      <PromptDetailInput
        currentOption={currentGoalOption}
        note=""
        setNote={vi.fn()}
        validationError={null}
        setValidationError={vi.fn()}
        status="idle"
        detailInputRef={detailInputRef}
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        onKeyDown={vi.fn()}
      />
    )

    expect(screen.queryByRole('checkbox', { name: /mark task as completed/i })).toBeNull()
  })

  it('does not render add as task to planner checkbox for other option', () => {
    const detailInputRef = React.createRef<HTMLInputElement>()

    render(
      <PromptDetailInput
        currentOption={{ type: 'other', id: 'other', title: 'Something Else' }}
        note=""
        setNote={vi.fn()}
        validationError={null}
        setValidationError={vi.fn()}
        status="idle"
        detailInputRef={detailInputRef}
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        onKeyDown={vi.fn()}
      />
    )

    expect(screen.queryByRole('checkbox', { name: /add as task to planner/i })).toBeNull()
  })

  it('does not render soundtrack options in prompt detail', () => {
    render(
      <PromptDetailInput
        currentOption={currentGoalOption}
        note=""
        setNote={vi.fn()}
        validationError={null}
        setValidationError={vi.fn()}
        status="idle"
        detailInputRef={React.createRef()}
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        onKeyDown={vi.fn()}
      />
    )

    expect(screen.queryByText('Soundtrack')).toBeNull()
    expect(screen.queryByRole('radio', { name: /Silence/i })).toBeNull()
    expect(screen.queryByRole('radio', { name: /Music/i })).toBeNull()
  })

  it('does not render focus quality rating or feeling scattered warning in detail step', () => {
    render(
      <PromptDetailInput
        currentOption={{
          ...currentGoalOption,
          goal: { ...currentGoalOption.goal!, goalType: 'deep' }
        }}
        note=""
        setNote={vi.fn()}
        validationError={null}
        setValidationError={vi.fn()}
        status="idle"
        detailInputRef={React.createRef()}
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        onKeyDown={vi.fn()}
      />
    )

    expect(screen.queryByText(/Focus Quality/i)).toBeNull()
    expect(screen.queryByText(/Feeling scattered/i)).toBeNull()
  })
})

describe('usePromptNavigation', () => {
  it('handles navigation keys and shortcuts', () => {
    const setStep = vi.fn()
    const setSelectedIndex = vi.fn()
    const onSelectOption = vi.fn()
    const onSnooze = vi.fn()
    const onSubmit = vi.fn()
    const detailInputRef = { current: null }

    const options: PromptOption[] = [
      {
        type: 'goal',
        id: '1',
        title: 'Goal 1',
        goal: { id: '1', title: 'Goal 1', status: 'planned', date: '2026-11-01', createdAt: '' }
      },
      { type: 'other', id: 'other', title: 'Other' },
      { type: 'break', id: 'break', title: 'Break' }
    ]

    const { result } = renderHook(() =>
      usePromptNavigation({
        step: 'select',
        setStep,
        options,
        goalsCount: 1,
        selectedIndex: 0,
        setSelectedIndex,
        isSaving: false,
        onSelectOption,
        onSnooze,
        onSubmit,
        detailInputRef
      })
    )

    expect(result.current.safeSelectedIndex).toBe(0)

    // Escape in select mode snoozes
    act(() => {
      result.current.handleKeyDown({ key: 'Escape', preventDefault: vi.fn() } as any)
    })
    expect(onSnooze).toHaveBeenCalled()

    // Number key 1 triggers onSelectOption(0)
    act(() => {
      result.current.handleKeyDown({ key: '1', preventDefault: vi.fn() } as any)
    })
    expect(onSelectOption).toHaveBeenCalledWith(0)
  })

  it('debounces keypresses within 500ms of prompt appearance', () => {
    const onSelectOption = vi.fn()
    const onSnooze = vi.fn()
    const detailInputRef = { current: null }
    const promptAppearedAtRef = { current: Date.now() }

    const options: PromptOption[] = [
      {
        type: 'goal',
        id: '1',
        title: 'Goal 1',
        goal: { id: '1', title: 'Goal 1', status: 'planned', date: '2026-11-01', createdAt: '' }
      }
    ]

    const { result } = renderHook(() =>
      usePromptNavigation({
        step: 'select',
        setStep: vi.fn(),
        options,
        goalsCount: 1,
        selectedIndex: 0,
        setSelectedIndex: vi.fn(),
        isSaving: false,
        onSelectOption,
        onSnooze,
        onSubmit: vi.fn(),
        detailInputRef,
        promptAppearedAtRef
      })
    )

    // Keydown within 500ms should be ignored to prevent accidental submission while typing
    act(() => {
      result.current.handleKeyDown({ key: 'Enter', preventDefault: vi.fn() } as any)
    })
    expect(onSelectOption).not.toHaveBeenCalled()

    // After 500ms passes, keydown is processed
    promptAppearedAtRef.current = Date.now() - 600
    act(() => {
      result.current.handleKeyDown({ key: 'Enter', preventDefault: vi.fn() } as any)
    })
    expect(onSelectOption).toHaveBeenCalledWith(0)
  })
})
