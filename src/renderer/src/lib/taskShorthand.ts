/**
 * Parses natural language inline shorthand syntax from task titles:
 * - Duration: ~25m, ~45, ~1.5h, ~30min
 * - Tag: #backend, #deepwork, #admin
 * - Due date & time: @today, @tomorrow, @fri, @fri 4pm, @5pm, due:today, due:2026-11-05
 */

interface ParsedTaskShorthand {
  cleanTitle: string
  parsedMinutes?: number
  parsedTag?: string
  parsedDueDate?: string // YYYY-MM-DD
  parsedDueTime?: string // HH:mm
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6
}

function parseTimeStr(timeStr: string): string | undefined {
  const match = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (!match) return undefined

  let hours = parseInt(match[1], 10)
  const minutes = match[2] ? parseInt(match[2], 10) : 0
  const ampm = match[3]?.toLowerCase()

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined

  if (ampm === 'pm' && hours < 12) hours += 12
  if (ampm === 'am' && hours === 12) hours = 0

  return `${pad2(hours)}:${pad2(minutes)}`
}

export function parseTaskShorthand(rawTitle: string, now = new Date()): ParsedTaskShorthand {
  let title = rawTitle
  let parsedMinutes: number | undefined
  let parsedTag: string | undefined
  let parsedDueDate: string | undefined
  let parsedDueTime: string | undefined

  // 1. Match duration: ~45m, ~1.5h, ~30min, ~25
  const durationMatch = title.match(
    /(?:^|\s)~(?:(\d+(?:\.\d+)?)\s*(h|hr|hrs|m|min|mins)?)(?=\s|$)/i
  )
  if (durationMatch) {
    const val = parseFloat(durationMatch[1])
    const unit = (durationMatch[2] || 'm').toLowerCase()
    if (!isNaN(val) && val > 0) {
      parsedMinutes = unit.startsWith('h') ? Math.round(val * 60) : Math.round(val)
      title = title.replace(durationMatch[0], ' ')
    }
  }

  // 2. Match group tag: #backend, #deepwork
  const tagMatch = title.match(/(?:^|\s)#([a-zA-Z0-9_-]+)(?=\s|$)/)
  if (tagMatch) {
    parsedTag = tagMatch[1]
    title = title.replace(tagMatch[0], ' ')
  }

  // 3. Match explicit ISO date: due:2026-11-05
  const isoDateMatch = title.match(/(?:^|\s)due:(\d{4}-\d{2}-\d{2})(?=\s|$)/i)
  if (isoDateMatch) {
    parsedDueDate = isoDateMatch[1]
    title = title.replace(isoDateMatch[0], ' ')
  }

  // 4. Match natural due dates: (@|due:)(today|tomorrow|mon|tue|wed|thu|fri|sat|sun|monday|...)( \d{1,2}(?::\d{2})?(?:am|pm)?)?
  const naturalDateMatch = title.match(
    /(?:^|\s)(?:@|due:)(today|tomorrow|sun|sunday|mon|monday|tue|tuesday|wed|wednesday|thu|thursday|fri|friday|sat|saturday)(?:\s+(\d{1,2}(?::\d{2})?(?:am|pm)?))?(?=\s|$)/i
  )
  if (naturalDateMatch) {
    const dayWord = naturalDateMatch[1].toLowerCase()
    const optionalTime = naturalDateMatch[2]

    if (dayWord === 'today') {
      parsedDueDate = formatDate(now)
    } else if (dayWord === 'tomorrow') {
      const tmrw = new Date(now)
      tmrw.setDate(tmrw.getDate() + 1)
      parsedDueDate = formatDate(tmrw)
    } else if (WEEKDAYS[dayWord] !== undefined) {
      const targetDay = WEEKDAYS[dayWord]
      const currentDay = now.getDay()
      let diff = (targetDay - currentDay + 7) % 7
      if (diff === 0) diff = 7
      const targetDate = new Date(now)
      targetDate.setDate(targetDate.getDate() + diff)
      parsedDueDate = formatDate(targetDate)
    }

    if (optionalTime) {
      const parsed = parseTimeStr(optionalTime)
      if (parsed) parsedDueTime = parsed
    }

    title = title.replace(naturalDateMatch[0], ' ')
  }

  // 5. Match standalone time if due date wasn't combined: @5pm, @17:00, due:3pm
  if (!parsedDueTime) {
    const standaloneTimeMatch = title.match(
      /(?:^|\s)(?:@|due:)(\d{1,2}(?::\d{2})?(?:am|pm)?)(?=\s|$)/i
    )
    if (standaloneTimeMatch) {
      const parsed = parseTimeStr(standaloneTimeMatch[1])
      if (parsed) {
        parsedDueTime = parsed
        title = title.replace(standaloneTimeMatch[0], ' ')
      }
    }
  }

  return {
    cleanTitle: title.replace(/\s+/g, ' ').trim(),
    parsedMinutes,
    parsedTag,
    parsedDueDate,
    parsedDueTime
  }
}
