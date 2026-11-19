import { useState, useRef, useEffect, useCallback } from 'react'
import { localDateStr } from '../../../shared/types'

export interface UseDateRolloverOptions {
  onRollover?: () => void
}

export interface UseDateRolloverReturn {
  todayDateStr: string
  todayDateStrRef: React.MutableRefObject<string>
  selectedDayDate: string
  selectedDayDateRef: React.MutableRefObject<string>
  setSelectedDayDate: React.Dispatch<React.SetStateAction<string>>
  dayCutoffHour: number
  dayCutoffHourRef: React.MutableRefObject<number>
  setDayCutoffHour: React.Dispatch<React.SetStateAction<number>>
  hasUserSelectedDateRef: React.MutableRefObject<boolean>
  getTodayStr: () => string
  checkDateRollover: () => boolean
  updateCutoffHour: (hour: number) => void
}

export function useDateRollover({
  onRollover
}: UseDateRolloverOptions = {}): UseDateRolloverReturn {
  const [dayCutoffHour, setDayCutoffHour] = useState<number>(0)
  const dayCutoffHourRef = useRef<number>(dayCutoffHour)
  dayCutoffHourRef.current = dayCutoffHour

  const [todayDateStr, setTodayDateStr] = useState<string>(() =>
    localDateStr(new Date(), dayCutoffHourRef.current)
  )
  const todayDateStrRef = useRef<string>(todayDateStr)
  todayDateStrRef.current = todayDateStr

  const getTodayStr = useCallback((): string => {
    return localDateStr(new Date(), dayCutoffHourRef.current)
  }, [])

  const hasUserSelectedDateRef = useRef<boolean>(false)
  const [selectedDayDate, setSelectedDayDate] = useState<string>(() =>
    localDateStr(new Date(), dayCutoffHourRef.current)
  )
  const selectedDayDateRef = useRef<string>(selectedDayDate)
  useEffect(() => {
    selectedDayDateRef.current = selectedDayDate
  }, [selectedDayDate])

  const onRolloverRef = useRef(onRollover)
  useEffect(() => {
    onRolloverRef.current = onRollover
  }, [onRollover])

  const checkDateRollover = useCallback((): boolean => {
    const currentToday = localDateStr(new Date(), dayCutoffHourRef.current)
    if (currentToday !== todayDateStrRef.current) {
      todayDateStrRef.current = currentToday
      setTodayDateStr(currentToday)
      if (!hasUserSelectedDateRef.current) {
        setSelectedDayDate(currentToday)
      }
      onRolloverRef.current?.()
      return true
    }
    return false
  }, [])

  const updateCutoffHour = useCallback((hour: number): void => {
    setDayCutoffHour(hour)
    dayCutoffHourRef.current = hour
    const today = localDateStr(new Date(), hour)
    todayDateStrRef.current = today
    setTodayDateStr(today)
    if (!hasUserSelectedDateRef.current) {
      setSelectedDayDate(today)
    }
  }, [])

  return {
    todayDateStr,
    todayDateStrRef,
    selectedDayDate,
    selectedDayDateRef,
    setSelectedDayDate,
    dayCutoffHour,
    dayCutoffHourRef,
    setDayCutoffHour,
    hasUserSelectedDateRef,
    getTodayStr,
    checkDateRollover,
    updateCutoffHour
  }
}
