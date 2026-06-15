'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatSeconds } from '@/lib/utils'
import { EndingMode } from '@/lib/types'

interface TimerProps {
  durationSeconds: number
  endingMode: EndingMode
  onTimeUp?: () => void
  onTick?: (remaining: number) => void
}

export default function Timer({ durationSeconds, endingMode, onTimeUp, onTick }: TimerProps) {
  const [remaining, setRemaining] = useState(durationSeconds)
  const [fired, setFired] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1
        onTick?.(next)
        if (next === 0 && !fired) {
          setFired(true)
          if (endingMode === 'immediate') {
            onTimeUp?.()
          }
        }
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [endingMode, fired, onTimeUp, onTick])

  if (durationSeconds === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="font-mono text-gray-600 text-sm font-medium">No time limit</span>
      </div>
    )
  }

  const isOvertime = remaining < 0
  const isWarning = remaining > 0 && remaining <= 300
  const isCritical = remaining > 0 && remaining <= 60

  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono font-bold text-lg
      ${isOvertime ? 'bg-purple-100 text-purple-700 animate-pulse' :
        isCritical ? 'bg-red-100 text-red-700 animate-pulse' :
        isWarning ? 'bg-yellow-100 text-yellow-700' :
        'bg-blue-50 text-blue-700'}`}>
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {isOvertime && <span className="text-xs font-normal mr-1">+{formatSeconds(Math.abs(remaining))}</span>}
      {!isOvertime && <span>{formatSeconds(remaining)}</span>}
      {isOvertime && <span className="text-xs font-normal">(overtime)</span>}
    </div>
  )
}
