'use client'

import { useEffect, useRef, useState } from 'react'
import { formatSeconds } from '@/lib/utils'
import { EndingMode } from '@/lib/types'

interface TimerProps {
  endTime: number       // absolute unix ms when the exam expires
  endingMode: EndingMode
  onTimeUp?: () => void
}

export default function Timer({ endTime, endingMode, onTimeUp }: TimerProps) {
  const [remaining, setRemaining] = useState(() => Math.round((endTime - Date.now()) / 1000))
  const firedRef = useRef(false)
  const onTimeUpRef = useRef(onTimeUp)
  const endingModeRef = useRef(endingMode)

  // Keep latest callbacks in refs so the interval never needs to restart
  useEffect(() => { onTimeUpRef.current = onTimeUp }, [onTimeUp])
  useEffect(() => { endingModeRef.current = endingMode }, [endingMode])

  useEffect(() => {
    firedRef.current = false
    const interval = setInterval(() => {
      const rem = Math.round((endTime - Date.now()) / 1000)
      setRemaining(rem)
      if (rem <= 0 && !firedRef.current) {
        firedRef.current = true
        if (endingModeRef.current === 'immediate') {
          onTimeUpRef.current?.()
        }
      }
    }, 500)
    return () => clearInterval(interval)
  }, [endTime]) // only restart if the end-time itself changes (e.g. on resume)

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
      {isOvertime ? (
        <>
          <span className="text-xs font-normal mr-1">+{formatSeconds(Math.abs(remaining))}</span>
          <span className="text-xs font-normal">(overtime)</span>
        </>
      ) : (
        <span>{formatSeconds(remaining)}</span>
      )}
    </div>
  )
}
