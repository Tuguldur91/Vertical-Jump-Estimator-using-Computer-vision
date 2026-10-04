type DetectorControlProps = {
  isDetecting: boolean
  isLoading: boolean
  error: string | null
  onStart: () => void
  onStop: () => void
  onSwitchCamera: () => void
}

/**
 * 
 * @param {boolean} props - isDetection
 * @param {boolean} props - isLoading
 * @param {string | null} props - error
 * @param {function} props - onStart
 * @param {function} props - onStop
 * @param {function} props - onSwitchCamera
 * @returns {JSX.Element} DetectorControl component
 */

/**
 * Scanner control buttons component
 * Provides start/stop and camera switch controls
 */

const DetectorControl = ({
  isDetecting,
  isLoading,
  error,
  onStart,
  onStop,
  onSwitchCamera,
}: DetectorControlProps) => (
  <div
    className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-14"
    aria-live="polite"
  >
    {error && (
      <p role="alert" className="max-w-lg text-center text-sm text-red-300">
        {error}
      </p>
    )}
    <button
      type="button"
      onClick={isDetecting ? onStop : onStart}
      disabled={isLoading}
      className="min-w-40 rounded-full bg-white px-7 py-3 font-semibold text-black shadow-lg shadow-black/30 transition hover:bg-white/85 disabled:cursor-wait disabled:opacity-60"
    >
      {isLoading ? 'Starting camera...' : isDetecting ? 'Stop camera' : 'Start camera'}
    </button>

    <button
      type="button"
      onClick={onSwitchCamera}
      disabled={isLoading || !isDetecting}
      className="rounded-full border border-white/20 bg-black/40 px-4 py-2 text-sm text-white backdrop-blur hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-60"
    >
      Switch camera
    </button>
  </div>
)

export default DetectorControl
