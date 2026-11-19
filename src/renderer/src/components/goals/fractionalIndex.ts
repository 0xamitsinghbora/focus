import { DailyGoal, DEFAULT_SORT_ORDER } from '../../../../shared/types'

/**
 * Minimum step threshold between consecutive sort orders before rebalancing is needed.
 * IEEE 754 float64 has 53 bits of precision (~15-17 decimal digits). Using 1e-6 guarantees
 * that sort orders never underflow or produce duplicate values even for orders approaching
 * MAX_SORT_ORDER (900,000,000) or under rapid consecutive drags, safely triggering integer
 * rebalancing (1000, 2000, 3000...) whenever the gap drops below 1e-6.
 */
export const MIN_SORT_ORDER_GAP = 1e-6
export const MIN_SORT_ORDER = -1_000_000_000
/**
 * Upper bound for normalized sort orders. Must remain strictly below DEFAULT_SORT_ORDER
 * (1,000,000,000) so that unassigned/sentinel items always sort at the end and properly
 * trigger rebalancing into the normalized spacing range.
 */
export const MAX_SORT_ORDER = Math.min(900_000_000, DEFAULT_SORT_ORDER - 100_000_000)

/**
 * Calculates fractional sort order(s) for inserting `count` items at `insertIndex`
 * into `existingGoalsInOrder`.
 *
 * Returns an array of `count` numbers if fractional indexing succeeds,
 * or `null` if rebalancing is required (e.g. neighbor sort orders are missing,
 * non-monotonic, or the gap is below precision threshold).
 */
export function calculateFractionalSortOrders(
  existingGoalsInOrder: DailyGoal[],
  insertIndex: number,
  count: number = 1
): number[] | null {
  if (count <= 0) return []

  const n = existingGoalsInOrder.length
  const clampedIndex = Math.max(0, Math.min(insertIndex, n))

  // Case 1: Empty list
  if (n === 0) {
    return Array.from({ length: count }, (_, i) => (i + 1) * 1000)
  }

  // Case 2: Inserting at the beginning
  if (clampedIndex === 0) {
    const nextGoal = existingGoalsInOrder[0]
    const nextOrder = nextGoal?.sortOrder
    if (
      typeof nextOrder !== 'number' ||
      !Number.isFinite(nextOrder) ||
      nextOrder - count * 1000 < MIN_SORT_ORDER
    ) {
      return null
    }
    const orders: number[] = []
    for (let i = 0; i < count; i++) {
      const order = nextOrder - (count - i) * 1000
      const lastOrder = i === 0 ? -Infinity : orders[i - 1]
      if (order <= lastOrder || order >= nextOrder) {
        return null
      }
      orders.push(order)
    }
    return orders
  }

  // Case 3: Inserting at the end
  if (clampedIndex === n) {
    const prevGoal = existingGoalsInOrder[n - 1]
    const prevOrder = prevGoal?.sortOrder
    if (
      typeof prevOrder !== 'number' ||
      !Number.isFinite(prevOrder) ||
      prevOrder + count * 1000 > MAX_SORT_ORDER
    ) {
      return null
    }
    const orders: number[] = []
    for (let i = 0; i < count; i++) {
      const order = prevOrder + (i + 1) * 1000
      const lastOrder = i === 0 ? prevOrder : orders[i - 1]
      if (order <= lastOrder) {
        return null
      }
      orders.push(order)
    }
    return orders
  }

  // Case 4: Inserting between two items
  const prevGoal = existingGoalsInOrder[clampedIndex - 1]
  const nextGoal = existingGoalsInOrder[clampedIndex]
  const prevOrder = prevGoal?.sortOrder
  const nextOrder = nextGoal?.sortOrder

  if (
    typeof prevOrder !== 'number' ||
    typeof nextOrder !== 'number' ||
    !Number.isFinite(prevOrder) ||
    !Number.isFinite(nextOrder) ||
    prevOrder >= nextOrder
  ) {
    return null
  }

  const gap = nextOrder - prevOrder
  if (gap < MIN_SORT_ORDER_GAP) {
    return null
  }

  const step = gap / (count + 1)
  if (step < MIN_SORT_ORDER_GAP) {
    return null
  }

  const orders: number[] = []
  for (let i = 0; i < count; i++) {
    const order = prevOrder + step * (i + 1)
    const lastOrder = i === 0 ? prevOrder : orders[i - 1]
    // Guard against IEEE 754 precision loss / duplicate assignments
    if (
      order <= lastOrder ||
      order >= nextOrder ||
      Math.abs(order - lastOrder) < MIN_SORT_ORDER_GAP ||
      Math.abs(nextOrder - order) < MIN_SORT_ORDER_GAP
    ) {
      return null
    }
    orders.push(order)
  }

  return orders
}

/**
 * Rebalances sort orders for a column when fractional indexing cannot fit
 * (e.g., neighbor sort orders are uninitialized or too close).
 *
 * For smaller lists (<= 5 items) or fully unnormalized lists, spacing is normalized
 * to increments of 1000 (1000, 2000, 3000, ...).
 *
 * For larger lists, localized window rebalancing is attempted around the insertion point
 * to re-space only the immediately affected neighbors, avoiding cascading full-column updates
 * and sync thrashing across devices.
 *
 * Returns both the complete ordered list and `changedGoals` containing ONLY
 * the items whose `sortOrder` actually changed or were inserted.
 */
function isMonotonicAndSpacious(goals: DailyGoal[], minGap = 50): boolean {
  if (goals.length === 0) return true
  for (let i = 0; i < goals.length; i++) {
    const cur = goals[i].sortOrder
    if (
      typeof cur !== 'number' ||
      !Number.isFinite(cur) ||
      cur < MIN_SORT_ORDER ||
      cur > MAX_SORT_ORDER
    ) {
      return false
    }
    if (i > 0) {
      const prev = goals[i - 1].sortOrder!
      if (cur - prev < minGap) {
        return false
      }
    }
  }
  return true
}

export function rebalanceGoals(
  existingGoalsInOrder: DailyGoal[],
  insertIndex: number,
  insertedGoals: DailyGoal[]
): {
  newGoalsInOrder: DailyGoal[]
  changedGoals: DailyGoal[]
} {
  const clampedIndex = Math.max(0, Math.min(insertIndex, existingGoalsInOrder.length))
  const newGoals = [...existingGoalsInOrder]
  newGoals.splice(clampedIndex, 0, ...insertedGoals)

  const insertedIds = new Set(insertedGoals.map((g) => g.id))
  const n = newGoals.length

  const isExistingSpacious = isMonotonicAndSpacious(existingGoalsInOrder, 50)

  // For small unnormalized lists, perform a clean full normalization to multiples of 1000.
  // If existing goals are already monotonic and spacious, allow localized windowing so unchanged items are not rewritten.
  if (n <= 5 && !isExistingSpacious) {
    const changedGoals: DailyGoal[] = []
    const newGoalsInOrder = newGoals.map((g, idx) => {
      const targetSortOrder = (idx + 1) * 1000
      const isInserted = insertedIds.has(g.id)
      const orderChanged = g.sortOrder !== targetSortOrder

      if (isInserted || orderChanged) {
        const updated: DailyGoal = {
          ...g,
          sortOrder: targetSortOrder
        }
        changedGoals.push(updated)
        return updated
      }

      return g
    })

    return { newGoalsInOrder, changedGoals }
  }

  // For larger lists, attempt localized window rebalancing around insertion point
  let bestWindow: {
    startIdx: number
    endIdx: number
    type: 'between' | 'start' | 'start_negative' | 'end'
    lower?: number
    step: number
  } | null = null

  const insertStart = clampedIndex
  const insertEnd = clampedIndex + insertedGoals.length - 1
  const maxRadius = Math.max(clampedIndex + 1, n - clampedIndex)

  // Pre-calculate monotonic boundaries in O(N) to avoid O(N^2) inner scans
  let firstInvalidBefore = Infinity
  if (
    insertStart > 0 &&
    (typeof newGoals[0].sortOrder !== 'number' || !Number.isFinite(newGoals[0].sortOrder))
  ) {
    firstInvalidBefore = 0
  } else {
    for (let i = 0; i < insertStart - 1; i++) {
      const cur = newGoals[i].sortOrder
      const nxt = newGoals[i + 1].sortOrder
      if (
        typeof cur !== 'number' ||
        typeof nxt !== 'number' ||
        !Number.isFinite(cur) ||
        !Number.isFinite(nxt) ||
        cur >= nxt
      ) {
        firstInvalidBefore = i
        break
      }
    }
  }

  let lastInvalidAfter = -1
  if (
    insertEnd < n - 1 &&
    (typeof newGoals[n - 1].sortOrder !== 'number' || !Number.isFinite(newGoals[n - 1].sortOrder))
  ) {
    lastInvalidAfter = n - 2
  } else {
    for (let i = n - 2; i >= insertEnd + 1; i--) {
      const cur = newGoals[i].sortOrder
      const nxt = newGoals[i + 1].sortOrder
      if (
        typeof cur !== 'number' ||
        typeof nxt !== 'number' ||
        !Number.isFinite(cur) ||
        !Number.isFinite(nxt) ||
        cur >= nxt
      ) {
        lastInvalidAfter = i
        break
      }
    }
  }

  for (let r = 0; r <= maxRadius; r++) {
    const startIdx = Math.max(0, insertStart - r)
    const endIdx = Math.min(n - 1, insertEnd + r)

    // Verify strict monotonicity before startIdx in O(1)
    if (firstInvalidBefore !== Infinity && startIdx > 1 && startIdx - 1 > firstInvalidBefore) {
      continue
    }

    // Verify strict monotonicity after endIdx in O(1)
    if (lastInvalidAfter !== -1 && endIdx < n - 2 && endIdx + 1 <= lastInvalidAfter) {
      continue
    }

    // Check bounds and available gap
    if (startIdx > 0 && endIdx < n - 1) {
      const lower = newGoals[startIdx - 1].sortOrder
      const upper = newGoals[endIdx + 1].sortOrder
      if (
        typeof lower === 'number' &&
        typeof upper === 'number' &&
        Number.isFinite(lower) &&
        Number.isFinite(upper) &&
        lower >= MIN_SORT_ORDER &&
        upper <= MAX_SORT_ORDER &&
        upper > lower
      ) {
        const count = endIdx - startIdx + 1
        const step = (upper - lower) / (count + 1)
        if (step >= 1) {
          bestWindow = { startIdx, endIdx, type: 'between', lower, step }
          break
        }
      }
    } else if (startIdx === 0 && endIdx < n - 1) {
      const upper = newGoals[endIdx + 1].sortOrder
      if (typeof upper === 'number' && Number.isFinite(upper) && upper <= MAX_SORT_ORDER) {
        if (upper > endIdx + 2) {
          const step = upper / (endIdx + 2)
          if (step >= 1) {
            bestWindow = { startIdx, endIdx, type: 'start', step }
            break
          }
        } else if (upper - (endIdx - startIdx + 1) * 1000 >= MIN_SORT_ORDER) {
          bestWindow = { startIdx, endIdx, type: 'start_negative', lower: upper, step: 1000 }
          break
        } else {
          const remaining = upper - MIN_SORT_ORDER
          const step = remaining / (endIdx - startIdx + 2)
          if (step >= MIN_SORT_ORDER_GAP) {
            bestWindow = { startIdx, endIdx, type: 'start_negative', lower: upper, step }
            break
          }
        }
      }
    } else if (startIdx > 0 && endIdx === n - 1) {
      const lower = newGoals[startIdx - 1].sortOrder
      const count = endIdx - startIdx + 1
      if (typeof lower === 'number' && Number.isFinite(lower) && lower >= MIN_SORT_ORDER) {
        if (lower + count * 1000 <= MAX_SORT_ORDER) {
          bestWindow = { startIdx, endIdx, type: 'end', lower, step: 1000 }
          break
        } else {
          const remaining = MAX_SORT_ORDER - lower
          const step = remaining / (count + 1)
          if (step >= MIN_SORT_ORDER_GAP) {
            bestWindow = { startIdx, endIdx, type: 'end', lower, step }
            break
          }
        }
      }
    }
  }

  if (bestWindow) {
    const changedGoals: DailyGoal[] = []
    const newGoalsInOrder = newGoals.map((g, idx) => {
      if (idx >= bestWindow!.startIdx && idx <= bestWindow!.endIdx) {
        let target: number
        if (bestWindow!.type === 'between') {
          target = bestWindow!.lower! + bestWindow!.step * (idx - bestWindow!.startIdx + 1)
        } else if (bestWindow!.type === 'start') {
          target = bestWindow!.step * (idx + 1)
        } else if (bestWindow!.type === 'start_negative') {
          target = bestWindow!.lower! - (bestWindow!.endIdx - idx + 1) * bestWindow!.step
        } else {
          target = bestWindow!.lower! + bestWindow!.step * (idx - bestWindow!.startIdx + 1)
        }
        const isInserted = insertedIds.has(g.id)
        const orderChanged = g.sortOrder !== target

        if (isInserted || orderChanged) {
          const updated: DailyGoal = {
            ...g,
            sortOrder: target
          }
          changedGoals.push(updated)
          return updated
        }
      }
      return g
    })

    // Strict validation: verify that all items in newGoalsInOrder are strictly monotonic and spacious
    let isStrictlySpacious = true
    for (let i = 1; i < newGoalsInOrder.length; i++) {
      const prev = newGoalsInOrder[i - 1].sortOrder
      const cur = newGoalsInOrder[i].sortOrder
      if (
        typeof prev !== 'number' ||
        typeof cur !== 'number' ||
        !Number.isFinite(prev) ||
        !Number.isFinite(cur) ||
        cur - prev < MIN_SORT_ORDER_GAP
      ) {
        isStrictlySpacious = false
        break
      }
    }

    if (isStrictlySpacious) {
      return { newGoalsInOrder, changedGoals }
    }
  }

  // Fallback to full normalization if local windowing could not find sufficient gap
  const changedGoals: DailyGoal[] = []
  const newGoalsInOrder = newGoals.map((g, idx) => {
    const targetSortOrder = (idx + 1) * 1000
    const isInserted = insertedIds.has(g.id)
    const orderChanged = g.sortOrder !== targetSortOrder

    if (isInserted || orderChanged) {
      const updated: DailyGoal = {
        ...g,
        sortOrder: targetSortOrder
      }
      changedGoals.push(updated)
      return updated
    }

    return g
  })

  return { newGoalsInOrder, changedGoals }
}

/**
 * Lexicographical string-based fractional indexing implementation.
 * Provides mathematically infinite insertion density without rebalancing.
 */
const BASE_DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'
const BASE_DIGIT_MAP = new Map(BASE_DIGITS.split('').map((c, i) => [c, i]))
const START_KEY = 'a0'

export function generateKeyBetween(
  a: string | null | undefined,
  b: string | null | undefined
): string {
  if (!a && !b) return START_KEY
  if (!a) {
    const bStr = b!
    for (let i = 0; i < bStr.length; i++) {
      const idx = BASE_DIGIT_MAP.get(bStr[i]) ?? 0
      if (idx > 0) {
        return bStr.slice(0, i) + BASE_DIGITS[Math.floor(idx / 2)]
      }
    }
    return bStr + '0'
  }
  if (!b) {
    const lastChar = a[a.length - 1]
    const idx = BASE_DIGIT_MAP.get(lastChar) ?? 0
    if (idx < BASE_DIGITS.length - 1) {
      return a.slice(0, -1) + BASE_DIGITS[idx + 1]
    }
    return a + '1'
  }

  let prefix = ''
  let i = 0
  while (i < a.length || i < b.length) {
    const charA = a[i] ?? '0'
    const charB = b[i] ?? 'z'
    const digitA = BASE_DIGIT_MAP.get(charA) ?? 0
    const digitB = BASE_DIGIT_MAP.get(charB) ?? BASE_DIGITS.length - 1

    if (digitA === digitB) {
      prefix += charA
      i++
      continue
    }

    if (digitB - digitA > 1) {
      const mid = Math.floor((digitA + digitB) / 2)
      return prefix + BASE_DIGITS[mid]
    }

    prefix += charA
    i++
    while (i < a.length && a[i] === BASE_DIGITS[BASE_DIGITS.length - 1]) {
      prefix += a[i]
      i++
    }
    const nextA = i < a.length ? (BASE_DIGIT_MAP.get(a[i]) ?? 0) : 0
    const mid = Math.floor((nextA + BASE_DIGITS.length) / 2)
    return prefix + BASE_DIGITS[mid]
  }

  return a + '0'
}
