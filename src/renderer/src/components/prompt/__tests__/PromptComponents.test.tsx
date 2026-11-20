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

  it('triggers onQuickDone when Done button on task is clicked', () => {
    const onSelectOption = vi.fn()
    const onQuickDone = vi.fn()
    const onSnooze = vi.fn()
    const itemRefs = { current: [] }

    render(
      <PromptTaskSelector
        goals={[mockGoal]}
        safeSelectedIndex={0}
        itemRefs={itemRefs}
        status="idle"
        onSelectOption={onSelectOption}
        onQuickDone={onQuickDone}
        onSnooze={onSnooze}
      />
    )

    const doneBtn = screen.getByRole('button', { name: /done/i })
    expect(doneBtn).toBeDefined()
    fireEvent.click(doneBtn)
    expect(onQuickDone).toHaveBeenCalledWith(0)
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

  it('renders ◉ 90s Dot Reset button and handles click', () => {
    const onStartDotReset = vi.fn()
    const itemRefs = { current: [] }

    render(
      <PromptTaskSelector
        goals={[mockGoal]}
        safeSelectedIndex={0}
        itemRefs={itemRefs}
        status="idle"
        onSelectOption={vi.fn()}
        onSnooze={vi.fn()}
        onStartDotReset={onStartDotReset}
      />
    )

    const dotResetBtn = screen.getByRole('button', { name: /dot reset/i })
    expect(dotResetBtn).toBeDefined()
    fireEvent.click(dotResetBtn)
    expect(onStartDotReset).toHaveBeenCalled()
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

  it('renders mark task completed checkbox for goal option and handles change', () => {
    const detailInputRef = React.createRef<HTMLInputElement>()
    const setMarkCompleted = vi.fn()

    render(
      <PromptDetailInput
        currentOption={currentGoalOption}
        note=""
        setNote={vi.fn()}
        validationError={null}
        setValidationError={vi.fn()}
        status="idle"
        detailInputRef={detailInputRef}
        markCompleted={false}
        setMarkCompleted={setMarkCompleted}
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        onKeyDown={vi.fn()}
      />
    )

    const checkbox = screen.getByRole('checkbox', { name: /mark task as completed/i })
    expect(checkbox).toBeDefined()
    expect((checkbox as HTMLInputElement).checked).toBe(false)
    fireEvent.click(checkbox)
    expect(setMarkCompleted).toHaveBeenCalledWith(true)
  })

  it('renders add as task to planner checkbox for other option and handles change', () => {
    const detailInputRef = React.createRef<HTMLInputElement>()
    const setAddToPlanner = vi.fn()

    render(
      <PromptDetailInput
        currentOption={{ type: 'other', id: 'other', title: 'Something Else' }}
        note=""
        setNote={vi.fn()}
        validationError={null}
        setValidationError={vi.fn()}
        status="idle"
        detailInputRef={detailInputRef}
        addToPlanner={false}
        setAddToPlanner={setAddToPlanner}
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        onKeyDown={vi.fn()}
      />
    )

    const checkbox = screen.getByRole('checkbox', { name: /add as task to planner/i })
    expect(checkbox).toBeDefined()
    expect((checkbox as HTMLInputElement).checked).toBe(false)
    fireEvent.click(checkbox)
    expect(setAddToPlanner).toHaveBeenCalledWith(true)
  })

  it('renders audio mode pill selector and allows toggling soundtrack', () => {
    const setAudioMode = vi.fn()
    render(
      <PromptDetailInput
        currentOption={currentGoalOption}
        note=""
        setNote={vi.fn()}
        validationError={null}
        setValidationError={vi.fn()}
        status="idle"
        detailInputRef={React.createRef()}
        audioMode="silence"
        setAudioMode={setAudioMode}
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        onKeyDown={vi.fn()}
      />
    )

    expect(screen.getByText('Soundtrack')).toBeDefined()
    expect(screen.getByRole('radio', { name: /Silence/i })).toBeDefined()
    expect(screen.getByRole('radio', { name: /Focus Sound/i })).toBeDefined()
    expect(screen.getByRole('radio', { name: /Music/i })).toBeDefined()

    fireEvent.click(screen.getByRole('radio', { name: /Music/i }))
    expect(setAudioMode).toHaveBeenCalledWith('music')
  })

  it('renders gentle nudge alert when focusQuality <= 2 while playing Music on a Deep Focus goal', () => {
    render(
      <PromptDetailInput
        currentOption={{
          ...currentGoalOption,
          goal: { ...currentGoalOption.goal!, goalType: 'deep' }
        }}
        note=""
        setNote={vi.fn()}
        focusQuality={2}
        audioMode="music"
        validationError={null}
        setValidationError={vi.fn()}
        status="idle"
        detailInputRef={React.createRef()}
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        onKeyDown={vi.fn()}
      />
    )

    expect(
      screen.getByText(
        /Feeling scattered\? Try pausing lyrics and switching to Rain or Silence for the next 20 minutes\./i
      )
    ).toBeDefined()
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
