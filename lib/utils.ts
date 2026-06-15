export function toInternalEmail(username: string): string {
  return `${username.toLowerCase().replace(/\s+/g, '_')}@exam.internal`
}

export function fromInternalEmail(email: string): string {
  return email.replace('@exam.internal', '')
}

export function formatSeconds(seconds: number): string {
  const abs = Math.abs(seconds)
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const s = abs % 60
  const sign = seconds < 0 ? '-' : ''
  if (h > 0) return `${sign}${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return `${h}h ${rm}m`
}

export function clsx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function generateTestLink(testId: string, baseUrl?: string): string {
  const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}/test/${testId}`
}
