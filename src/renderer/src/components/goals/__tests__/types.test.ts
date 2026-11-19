import { describe, it, expect } from 'vitest'
import { partitionColumnGroups } from '../types'
import { DailyGoal } from '../../../../../shared/types'

describe('partitionColumnGroups', () => {
  it('groups tasks case-insensitively into a single swimlane instead of splitting into duplicates', () => {
    const goals: DailyGoal[] = [
      {
        id: '1',
        title: 'Task A',
        status: 'planned',
        date: '2026-10-29',
        groupTag: 'Design',
        createdAt: '2026-10-29T10:00:00Z'
      },
      {
        id: '2',
        title: 'Task B',
        status: 'planned',
        date: '2026-10-29',
        groupTag: 'design',
        createdAt: '2026-10-29T10:05:00Z'
      },
      {
        id: '3',
        title: 'Task C',
        status: 'planned',
        date: '2026-10-29',
        groupTag: 'DESIGN',
        createdAt: '2026-10-29T10:10:00Z'
      }
    ]

    const groups = partitionColumnGroups(goals)

    expect(groups).toHaveLength(1)
    expect(groups[0].tag).toBe('Design')
    expect(groups[0].isUntagged).toBe(false)
    expect(groups[0].goals).toHaveLength(3)
    expect(groups[0].goals.map((g) => g.id)).toEqual(['1', '2', '3'])
  })

  it('promotes capitalized tag casing even when lowercase variant is encountered first', () => {
    const goals: DailyGoal[] = [
      {
        id: '1',
        title: 'Task A',
        status: 'planned',
        date: '2026-10-29',
        groupTag: 'frontend',
        createdAt: '2026-10-29T10:00:00Z'
      },
      {
        id: '2',
        title: 'Task B',
        status: 'planned',
        date: '2026-10-29',
        groupTag: 'Frontend',
        createdAt: '2026-10-29T10:05:00Z'
      }
    ]

    const groups = partitionColumnGroups(goals)

    expect(groups).toHaveLength(1)
    expect(groups[0].tag).toBe('Frontend')
    expect(groups[0].goals).toHaveLength(2)
  })

  it('partitions multiple distinct groups and untagged tasks accurately', () => {
    const goals: DailyGoal[] = [
      {
        id: '1',
        title: 'Backend 1',
        status: 'planned',
        date: '2026-10-29',
        groupTag: 'Backend',
        createdAt: '2026-10-29T10:00:00Z'
      },
      {
        id: '2',
        title: 'Design 1',
        status: 'planned',
        date: '2026-10-29',
        groupTag: 'Design',
        createdAt: '2026-10-29T10:01:00Z'
      },
      {
        id: '3',
        title: 'Backend 2',
        status: 'planned',
        date: '2026-10-29',
        groupTag: 'backend',
        createdAt: '2026-10-29T10:02:00Z'
      },
      {
        id: '4',
        title: 'Untagged 1',
        status: 'planned',
        date: '2026-10-29',
        groupTag: undefined,
        createdAt: '2026-10-29T10:03:00Z'
      },
      {
        id: '5',
        title: 'Untagged 2',
        status: 'planned',
        date: '2026-10-29',
        groupTag: '   ',
        createdAt: '2026-10-29T10:04:00Z'
      },
      {
        id: '6',
        title: 'Untagged 3',
        status: 'planned',
        date: '2026-10-29',
        groupTag: 'Untagged',
        createdAt: '2026-10-29T10:05:00Z'
      }
    ]

    const groups = partitionColumnGroups(goals)

    expect(groups).toHaveLength(3)

    expect(groups[0].tag).toBe('Backend')
    expect(groups[0].isUntagged).toBe(false)
    expect(groups[0].goals.map((g) => g.id)).toEqual(['1', '3'])

    expect(groups[1].tag).toBe('Design')
    expect(groups[1].isUntagged).toBe(false)
    expect(groups[1].goals.map((g) => g.id)).toEqual(['2'])

    expect(groups[2].tag).toBe('Untagged')
    expect(groups[2].isUntagged).toBe(true)
    expect(groups[2].goals.map((g) => g.id)).toEqual(['4', '5', '6'])
  })

  it('inherits groupColor from any goal in the group if the first goal has none', () => {
    const goals: DailyGoal[] = [
      {
        id: '1',
        title: 'Task A',
        status: 'planned',
        date: '2026-10-29',
        groupTag: 'Design',
        groupColor: undefined,
        createdAt: '2026-10-29T10:00:00Z'
      },
      {
        id: '2',
        title: 'Task B',
        status: 'planned',
        date: '2026-10-29',
        groupTag: 'design',
        groupColor: 'indigo',
        createdAt: '2026-10-29T10:05:00Z'
      }
    ]

    const groups = partitionColumnGroups(goals)

    expect(groups).toHaveLength(1)
    expect(groups[0].colorTheme.id).toBe('indigo')
  })
})
