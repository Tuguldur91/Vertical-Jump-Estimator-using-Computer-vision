import { memo } from 'react'

type StatusIndicatorProps = {
  isDetecting: boolean
  isLoading: boolean
  landmarksDetected: boolean
  error: string | null
  fps?: number
}

const StatusIndicator = ({
  isDetecting,
  isLoading,
  landmarksDetected,
  error,
  fps,
}: StatusIndicatorProps) => {
  const getStatus = () => {
    if (error) return { label: 'Camera error', color: 'bg-red-400', pulse: false }
    if (isLoading) return { label: 'Starting camera', color: 'bg-amber-300', pulse: true }
    if (!isDetecting) return { label: 'Camera off', color: 'bg-white/40', pulse: false }
    if (landmarksDetected) return { label: 'Pose detected', color: 'bg-emerald-400', pulse: true }
    return { label: 'Searching for pose', color: 'bg-amber-300', pulse: true }
  }

  const status = getStatus()

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 py-2 text-xs text-white backdrop-blur sm:text-sm"
      role="status"
      aria-live="polite"
    >
      <span
        className={`h-2 w-2 rounded-full ${status.color}${status.pulse ? ' animate-pulse' : ''}`}
        aria-hidden="true"
      />
      {status.label}
      {fps !== undefined ? (
        <span className="ml-2 text-xs text-white/65">
          {fps.toFixed(1)} FPS
        </span>
      ) : <span className="ml-2 text-xs text-white/65">-- FPS</span>}
    </div>
  )
}

export default memo(StatusIndicator)
