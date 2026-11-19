import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TodayMetricsRow } from '../components/TodayMetricsRow'

vi.mock('../lib/audioEngine', () => ({
  useAudioEngine: () => ({
    playing: false,
    volume: 0.5,
    noiseType: 'waves',
    spatialAudio: true,
    play: vi.fn(),
    toggle: vi.fn(),
    setNoiseType: vi.fn()
  })
}))

describe('TodayMetricsRow', () => {
  it('renders SoundPlayerCard instead of standalone focus time card', () => {
    render(
      <TodayMetricsRow
        productiveToday={0}
        todayDoneGoalsCount={0}
        todayGoalsCount={0}
        todayTasksHint="No tasks planned yet"
        logsCount={0}
        todaySessionsHint="No sessions logged today"
        currentStreak={0}
        streakHint="No active streak"
        dailyFocusTargetMinutes={0}
      />
    )

    // First card should be SoundPlayerCard with sound preset and play controls, not "Focus Time"
    expect(screen.getByText('Ocean Waves')).toBeDefined()
    expect(screen.getByRole('button', { name: /play soundscape/i })).toBeDefined()
    expect(screen.queryByText('Focus Time')).toBeNull()
  })

  it('renders Focus Sessions card with session count in primary value and focus time in secondary area', () => {
    render(
      <TodayMetricsRow
        productiveToday={75}
        todayDoneGoalsCount={2}
        todayGoalsCount={4}
        todayTasksHint="2 tasks remaining"
        logsCount={3}
        todaySessionsHint="1h 15m focus time · Avg ~25m"
        currentStreak={5}
        streakHint="All-time best streak"
        dailyFocusTargetMinutes={0}
      />
    )

    expect(screen.getByText('Focus Sessions')).toBeDefined()
    expect(screen.getByText('3 sessions')).toBeDefined()
    expect(screen.getByText('1h 15m focus time · Avg ~25m')).toBeDefined()
  })

  it('renders Focus Sessions as 0 sessions with No focus time logged in secondary area when no sessions are logged', () => {
    render(
      <TodayMetricsRow
        productiveToday={0}
        todayDoneGoalsCount={0}
        todayGoalsCount={0}
        todayTasksHint="No tasks planned yet"
        logsCount={0}
        todaySessionsHint="No focus time logged"
        currentStreak={0}
        streakHint="No active streak"
        dailyFocusTargetMinutes={0}
      />
    )

    expect(screen.getByText('Focus Sessions')).toBeDefined()
    expect(screen.getByText('0 sessions')).toBeDefined()
    expect(screen.getByText('No focus time logged')).toBeDefined()
  })

  it('renders single session with correct singular suffix and time in secondary area', () => {
    render(
      <TodayMetricsRow
        productiveToday={25}
        todayDoneGoalsCount={1}
        todayGoalsCount={1}
        todayTasksHint="All today's tasks completed! 🎉"
        logsCount={1}
        todaySessionsHint="25m focus time"
        currentStreak={1}
        streakHint="All-time best streak"
        dailyFocusTargetMinutes={0}
      />
    )

    expect(screen.getByText('1 session')).toBeDefined()
    expect(screen.getByText('25m focus time')).toBeDefined()
  })

  it('renders Focus Sessions card along with DailyTargetCard when daily target is set', () => {
    render(
      <TodayMetricsRow
        productiveToday={60}
        todayDoneGoalsCount={2}
        todayGoalsCount={3}
        todayTasksHint="1 task remaining"
        logsCount={2}
        todaySessionsHint="1h 00m focus time"
        currentStreak={3}
        streakHint="All-time best streak"
        dailyFocusTargetMinutes={120}
      />
    )

    // Both Daily Focus Target and Focus Sessions cards must be rendered
    expect(screen.getByText('Daily Focus Target')).toBeDefined()
    expect(screen.getByText('Focus Sessions')).toBeDefined()
    expect(screen.getByText('2 sessions')).toBeDefined()
    expect(screen.getByText('Tasks Completed')).toBeDefined()
    expect(screen.getByText('Current Streak')).toBeDefined()
  })
})
