import { describe, it, expect } from 'vitest'
import {
  calculateFractionalSortOrders,
  rebalanceGoals,
  MIN_SORT_ORDER_GAP,
  MIN_SORT_ORDER,
  MAX_SORT_ORDER,
  generateKeyBetween
} from '../fractionalIndex'
import { DailyGoal } from '../../../../../shared/types'

describe('Fractional Indexing Algorithm', () => {
  const createGoal = (id: string, sortOrder?: number): DailyGoal => ({
    id,
    date: '2026-10-29',
    title: `Task ${id}`,
    status: 'planned',
    createdAt: '2026-10-29T10:00:00.000Z',
    sortOrder
  })

  describe('calculateFractionalSortOrders', () => {
    it('returns empty array when count is <= 0', () => {
      const goals = [createGoal('1', 1000)]
      expect(calculateFractionalSortOrders(goals, 0, 0)).toEqual([])
      expect(calculateFractionalSortOrders(goals, 0, -1)).toEqual([])
    })

    it('returns spaced orders for an empty list', () => {
      expect(calculateFractionalSortOrders([], 0, 1)).toEqual([1000])
      expect(calculateFractionalSortOrders([], 0, 3)).toEqual([1000, 2000, 3000])
    })

    it('inserts single item at the beginning (before first item)', () => {
      const goals = [createGoal('1', 1000), createGoal('2', 2000)]
      const result = calculateFractionalSortOrders(goals, 0, 1)
      expect(result).not.toBeNull()
      expect(result![0]).toBe(0)
      expect(result![0]).toBeLessThan(goals[0].sortOrder!)
    })

    it('inserts multiple items at the beginning in strictly increasing order', () => {
      const goals = [createGoal('1', 1000), createGoal('2', 2000)]
      const result = calculateFractionalSortOrders(goals, 0, 2)
      expect(result).not.toBeNull()
      expect(result).toEqual([-1000, 0])
      expect(result![0]).toBeLessThan(result![1])
      expect(result![1]).toBeLessThan(goals[0].sortOrder!)
    })

    it('inserts single item at the end (after last item)', () => {
      const goals = [createGoal('1', 1000), createGoal('2', 2000)]
      const result = calculateFractionalSortOrders(goals, 2, 1)
      expect(result).not.toBeNull()
      expect(result![0]).toBe(3000)
      expect(result![0]).toBeGreaterThan(goals[1].sortOrder!)
    })

    it('inserts multiple items at the end in strictly increasing order', () => {
      const goals = [createGoal('1', 1000), createGoal('2', 2000)]
      const result = calculateFractionalSortOrders(goals, 2, 3)
      expect(result).not.toBeNull()
      expect(result).toEqual([3000, 4000, 5000])
    })

    it('inserts single item between two items with midpoint', () => {
      const goals = [createGoal('1', 1000), createGoal('2', 2000)]
      const result = calculateFractionalSortOrders(goals, 1, 1)
      expect(result).not.toBeNull()
      expect(result![0]).toBe(1500)
      expect(result![0]).toBeGreaterThan(goals[0].sortOrder!)
      expect(result![0]).toBeLessThan(goals[1].sortOrder!)
    })

    it('inserts multiple items between two items spaced evenly', () => {
      const goals = [createGoal('1', 1000), createGoal('2', 2000)]
      const result = calculateFractionalSortOrders(goals, 1, 2)
      expect(result).not.toBeNull()
      expect(result![0]).toBeCloseTo(1333.333, 2)
      expect(result![1]).toBeCloseTo(1666.666, 2)
      expect(result![0]).toBeGreaterThan(goals[0].sortOrder!)
      expect(result![0]).toBeLessThan(result![1])
      expect(result![1]).toBeLessThan(goals[1].sortOrder!)
    })

    it('handles negative sort orders correctly', () => {
      const goals = [createGoal('1', -2000), createGoal('2', -1000)]
      const result = calculateFractionalSortOrders(goals, 1, 1)
      expect(result).not.toBeNull()
      expect(result![0]).toBe(-1500)
      expect(result![0]).toBeGreaterThan(goals[0].sortOrder!)
      expect(result![0]).toBeLessThan(goals[1].sortOrder!)
    })

    it('returns null when neighbor sortOrder is missing (undefined)', () => {
      const goalsWithUndefined = [createGoal('1', undefined), createGoal('2', 2000)]
      expect(calculateFractionalSortOrders(goalsWithUndefined, 0, 1)).toBeNull()
      expect(calculateFractionalSortOrders(goalsWithUndefined, 1, 1)).toBeNull()

      const goalsEndUndefined = [createGoal('1', 1000), createGoal('2', undefined)]
      expect(calculateFractionalSortOrders(goalsEndUndefined, 2, 1)).toBeNull()
    })

    it('returns null when neighbors are non-monotonic (equal or inverted)', () => {
      const equalOrders = [createGoal('1', 1000), createGoal('2', 1000)]
      expect(calculateFractionalSortOrders(equalOrders, 1, 1)).toBeNull()

      const invertedOrders = [createGoal('1', 2000), createGoal('2', 1000)]
      expect(calculateFractionalSortOrders(invertedOrders, 1, 1)).toBeNull()
    })

    it('returns null when gap is smaller than MIN_SORT_ORDER_GAP', () => {
      const prev = 1000
      const next = prev + MIN_SORT_ORDER_GAP * 0.5
      const tinyGapGoals = [createGoal('1', prev), createGoal('2', next)]
      expect(calculateFractionalSortOrders(tinyGapGoals, 1, 1)).toBeNull()
    })

    it('safely detects precision underflow on repeated midpoint drags and triggers rebalance', () => {
      let prev = 1000
      let next = 2000
      let midCount = 0

      // Continuously insert midpoints between prev and next until precision limit
      while (midCount < 60) {
        const goals = [createGoal('1', prev), createGoal('2', next)]
        const res = calculateFractionalSortOrders(goals, 1, 1)
        if (res === null) {
          // Successfully detected precision threshold before producing duplicate floats
          break
        }
        expect(res[0]).toBeGreaterThan(prev)
        expect(res[0]).toBeLessThan(next)
        next = res[0]
        midCount++
      }

      // Must have returned null well before IEEE 754 precision underflows to duplicate orders
      expect(next - prev).toBeLessThanOrEqual(MIN_SORT_ORDER_GAP * 2)

      // And rebalancing the resulting tiny-gap list produces clean integer spacing
      const existing = [createGoal('1', prev), createGoal('2', next)]
      const { newGoalsInOrder } = rebalanceGoals(existing, 1, [createGoal('3')])
      expect(newGoalsInOrder[0].sortOrder).toBe(1000)
      expect(newGoalsInOrder[1].sortOrder).toBe(2000)
      expect(newGoalsInOrder[2].sortOrder).toBe(3000)
    })

    it('prevents precision loss when inserting between large magnitude sort orders', () => {
      const largePrev = 500_000_000
      const largeNext = largePrev + 1e-7 // Gap is smaller than MIN_SORT_ORDER_GAP (1e-6)
      const goals = [createGoal('1', largePrev), createGoal('2', largeNext)]
      expect(calculateFractionalSortOrders(goals, 1, 1)).toBeNull()
    })
  })

  describe('rebalanceGoals', () => {
    it('normalizes all goals to increments of 1000', () => {
      const existing = [createGoal('1', 10), createGoal('2', 20)]
      const inserted = [createGoal('3')]
      const { newGoalsInOrder } = rebalanceGoals(existing, 1, inserted)

      expect(newGoalsInOrder.map((g) => g.id)).toEqual(['1', '3', '2'])
      expect(newGoalsInOrder.map((g) => g.sortOrder)).toEqual([1000, 2000, 3000])
    })

    it('only marks items as changed if sortOrder changed or item was inserted', () => {
      // Goal 1 already has sortOrder 1000. Goal 2 already has sortOrder 2000.
      // We append Goal 3 (which will get 3000).
      const existing = [createGoal('1', 1000), createGoal('2', 2000)]
      const inserted = [createGoal('3')]
      const { changedGoals } = rebalanceGoals(existing, 2, inserted)

      // Goal 1 and Goal 2 were NOT changed, only Goal 3 was inserted!
      expect(changedGoals.map((g) => g.id)).toEqual(['3'])
      expect(changedGoals[0].sortOrder).toBe(3000)
    })

    it('includes goals whose sortOrder shifted during insertion when unnormalized', () => {
      // Goal 1: 10, Goal 2: 20. We insert Goal 3 at index 0.
      // Unnormalized list requires full normalization.
      // Goal 3 gets 1000 (inserted).
      // Goal 1 gets 2000 (changed from 10).
      // Goal 2 gets 3000 (changed from 20).
      const existing = [createGoal('1', 10), createGoal('2', 20)]
      const inserted = [createGoal('3')]
      const { changedGoals } = rebalanceGoals(existing, 0, inserted)

      expect(changedGoals.map((g) => g.id)).toEqual(['3', '1', '2'])
      expect(changedGoals.map((g) => g.sortOrder)).toEqual([1000, 2000, 3000])
    })

    it('does not rewrite existing goals on small lists if existing order is monotonic and spacious', () => {
      const existing = [createGoal('1', 1000), createGoal('2', 2000)]
      const inserted = [createGoal('3')]
      const { newGoalsInOrder, changedGoals } = rebalanceGoals(existing, 0, inserted)

      // Only the inserted goal gets an updated sortOrder (500); existing 1 and 2 remain untouched
      expect(changedGoals.map((g) => g.id)).toEqual(['3'])
      expect(changedGoals[0].sortOrder).toBe(500)
      expect(newGoalsInOrder.map((g) => g.sortOrder)).toEqual([500, 1000, 2000])
    })

    it('bounds calculateFractionalSortOrders with negative floor and upper ceiling', () => {
      const negativeLimit = [createGoal('1', -999_999_500)]
      // Inserting 2 items would exceed -1_000_000_000 floor -> returns null
      expect(calculateFractionalSortOrders(negativeLimit, 0, 2)).toBeNull()

      const positiveLimit = [createGoal('1', 899_999_500)]
      // Inserting 2 items would exceed 900_000_000 ceiling -> returns null
      expect(calculateFractionalSortOrders(positiveLimit, 1, 2)).toBeNull()
    })

    it('performs localized window rebalancing on large lists avoiding full-column cascading updates', () => {
      // 20 items where items 10 and 11 have a tiny gap below precision threshold
      const existing = Array.from({ length: 20 }, (_, i) => createGoal(`g${i}`, (i + 1) * 1000))
      existing[10].sortOrder = 11000
      existing[11].sortOrder = 11000.0000000001
      const inserted = [createGoal('new-task')]

      const { newGoalsInOrder, changedGoals } = rebalanceGoals(existing, 11, inserted)

      expect(newGoalsInOrder.length).toBe(21)
      // Only the local window around index 11 was rebalanced, not the entire list of 20 items!
      expect(changedGoals.length).toBeLessThanOrEqual(5)
      expect(changedGoals.some((g) => g.id === 'new-task')).toBe(true)

      // Untouched items at start and end kept their exact sortOrder
      expect(newGoalsInOrder[0].sortOrder).toBe(1000)
      expect(newGoalsInOrder[1].sortOrder).toBe(2000)
      expect(newGoalsInOrder[19].sortOrder).toBe(19000)
      expect(newGoalsInOrder[20].sortOrder).toBe(20000)

      // All 21 items are strictly monotonic
      for (let i = 1; i < newGoalsInOrder.length; i++) {
        expect(newGoalsInOrder[i].sortOrder!).toBeGreaterThan(newGoalsInOrder[i - 1].sortOrder!)
      }
    })

    it('performs localized window rebalancing at the start when upper bounds are negative', () => {
      // 10 items starting with negative sort orders: -10000, -9000, ... -1000
      const existing = Array.from({ length: 10 }, (_, i) => createGoal(`g${i}`, (i - 10) * 1000))
      const inserted = [createGoal('new-start-task')]

      const { newGoalsInOrder, changedGoals } = rebalanceGoals(existing, 0, inserted)

      expect(newGoalsInOrder.length).toBe(11)
      // Localized window at start was used, avoiding full re-normalization
      expect(changedGoals.length).toBeLessThanOrEqual(5)
      expect(changedGoals.some((g) => g.id === 'new-start-task')).toBe(true)

      // Strict monotonicity preserved
      for (let i = 1; i < newGoalsInOrder.length; i++) {
        expect(newGoalsInOrder[i].sortOrder!).toBeGreaterThan(newGoalsInOrder[i - 1].sortOrder!)
      }
    })

    it('safely rebalances when end item approaches MAX_SORT_ORDER without exceeding bounds', () => {
      const existing = [
        createGoal('g1', 1000),
        createGoal('g2', 2000),
        createGoal('g3', 3000),
        createGoal('g4', 4000),
        createGoal('g5', 5000),
        createGoal('g6', MAX_SORT_ORDER)
      ]
      const inserted = [createGoal('new-end-task')]

      const { newGoalsInOrder } = rebalanceGoals(existing, existing.length, inserted)

      expect(newGoalsInOrder.length).toBe(7)
      for (const g of newGoalsInOrder) {
        expect(g.sortOrder).toBeLessThanOrEqual(MAX_SORT_ORDER)
        expect(g.sortOrder).toBeGreaterThanOrEqual(MIN_SORT_ORDER)
      }
      for (let i = 1; i < newGoalsInOrder.length; i++) {
        expect(newGoalsInOrder[i].sortOrder!).toBeGreaterThan(newGoalsInOrder[i - 1].sortOrder!)
      }
    })

    it('efficiently rebalances a large 100-item list with linear boundary check', () => {
      const existing = Array.from({ length: 100 }, (_, i) =>
        createGoal(`item-${i}`, (i + 1) * 1000)
      )
      const inserted = [createGoal('mid-insert')]

      const { newGoalsInOrder, changedGoals } = rebalanceGoals(existing, 50, inserted)

      expect(newGoalsInOrder).toHaveLength(101)
      expect(changedGoals.length).toBeLessThanOrEqual(5)
      for (let i = 1; i < newGoalsInOrder.length; i++) {
        expect(newGoalsInOrder[i].sortOrder!).toBeGreaterThan(newGoalsInOrder[i - 1].sortOrder!)
      }
    })

    it('subsumes invalid sort order boundaries when non-monotonic items exist', () => {
      // List with non-monotonic items around insertion point
      const existing = [
        createGoal('g0', 1000),
        createGoal('g1', 3000), // out of order: 3000 >= 2000
        createGoal('g2', 2000),
        createGoal('g3', 4000),
        createGoal('g4', 5000)
      ]
      const inserted = [createGoal('mid')]
      const { newGoalsInOrder } = rebalanceGoals(existing, 2, inserted)

      expect(newGoalsInOrder).toHaveLength(6)
      for (let i = 1; i < newGoalsInOrder.length; i++) {
        expect(newGoalsInOrder[i].sortOrder!).toBeGreaterThan(newGoalsInOrder[i - 1].sortOrder!)
      }
    })

    it('fractionally inserts at the end when prevOrder + 1000 exceeds MAX_SORT_ORDER without full column rebalance', () => {
      const nearMax = MAX_SORT_ORDER - 100
      const existing = [createGoal('g1', 1000), createGoal('g2', 2000), createGoal('g3', nearMax)]

      // calculateFractionalSortOrders returns null when standard step exceeds MAX_SORT_ORDER
      const result = calculateFractionalSortOrders(existing, 3, 1)
      expect(result).toBeNull()

      // rebalanceGoals should preserve prior tasks without resetting g1 to 1000 and g2 to 2000
      const inserted = [createGoal('g4')]
      const { newGoalsInOrder, changedGoals } = rebalanceGoals(existing, 3, inserted)

      expect(newGoalsInOrder).toHaveLength(4)
      expect(changedGoals).toHaveLength(1) // ONLY g4 changed!
      expect(changedGoals[0].id).toBe('g4')
      expect(newGoalsInOrder[0].sortOrder).toBe(1000)
      expect(newGoalsInOrder[1].sortOrder).toBe(2000)
      expect(newGoalsInOrder[2].sortOrder).toBe(nearMax)
      expect(newGoalsInOrder[3].sortOrder!).toBeGreaterThan(nearMax)
    })

    it('fractionally inserts at the beginning in rebalanceGoals when nextOrder - 1000 is below MIN_SORT_ORDER without full column rebalance', () => {
      const nearMin = MIN_SORT_ORDER + 100
      const existing = [createGoal('g1', nearMin), createGoal('g2', 2000), createGoal('g3', 3000)]

      const result = calculateFractionalSortOrders(existing, 0, 1)
      expect(result).toBeNull()

      const inserted = [createGoal('g0')]
      const { newGoalsInOrder, changedGoals } = rebalanceGoals(existing, 0, inserted)
      expect(newGoalsInOrder).toHaveLength(4)
      expect(changedGoals).toHaveLength(1) // ONLY g0 changed!
      expect(newGoalsInOrder[0].sortOrder!).toBeLessThan(nearMin)
      expect(newGoalsInOrder[0].sortOrder!).toBeGreaterThanOrEqual(MIN_SORT_ORDER)
    })
  })

  describe('Lexicographical String Fractional Indexing', () => {
    it('generates start key when both bounds are empty', () => {
      expect(generateKeyBetween(null, null)).toBe('a0')
    })

    it('generates key smaller than b when a is empty', () => {
      const key = generateKeyBetween(null, 'a0')
      expect(key < 'a0').toBe(true)
    })

    it('generates key greater than a when b is empty', () => {
      const key = generateKeyBetween('a0', null)
      expect(key > 'a0').toBe(true)
    })

    it('generates key strictly between a and b', () => {
      const key = generateKeyBetween('a0', 'a2')
      expect(key > 'a0').toBe(true)
      expect(key < 'a2').toBe(true)
      expect(key).toBe('a1')
    })

    it('generates key between adjacent digits by extending fractional precision', () => {
      const key = generateKeyBetween('a0', 'a1')
      expect(key > 'a0').toBe(true)
      expect(key < 'a1').toBe(true)
    })
  })
})
