import { useEffect, useRef, useState } from 'react'
import { usePoseDetection } from '../../hooks/usePoseDetection'
import { isPhone } from '../../utils/poseHelper'
import DetectorControl from './DetectorControl'
import StatusIndicator from './StatusIndicator'

/**
 * Main component for pose detection, handles camera input and pose detection
 * 
 * 
 */

const PoseDetector = () => {
  const viewRef = useRef<HTMLElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const isMobile = isPhone()
  const {
    detectionState: { isDetecting, isLoading, landmarksDetected, error },
    fps,
    videoRef,
    canvasRef,
    handleStartDetection,
    handleSwitchCamera,
    handleStopDetection,
  } = usePoseDetection()

  useEffect(() => {
    const updateFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === viewRef.current)
    }

    document.addEventListener('fullscreenchange', updateFullscreenState)
    return () => document.removeEventListener('fullscreenchange', updateFullscreenState)
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await viewRef.current?.requestFullscreen()
      }
    } catch (fullscreenError) {
      console.error('Could not change fullscreen mode:', fullscreenError)
    }
  }

  return (
    <main
      ref={viewRef}
      className="relative flex h-dvh min-h-[480px] w-full flex-col overflow-hidden bg-black text-white"
    >
      <header className="absolute inset-x-0 top-0 z-10 flex items-start justify-between bg-gradient-to-b from-black/75 to-transparent px-5 pb-12 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <div>
          <h1 className="text-lg font-semibold tracking-wide sm:text-xl">Pose detection</h1>
          <p className="mt-1 text-sm text-white/65">
            {isMobile
              ? 'Position yourself in view of the camera'
              : 'Start your camera to detect your pose'}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <StatusIndicator
            isDetecting={isDetecting}
            isLoading={isLoading}
            landmarksDetected={landmarksDetected}
            error={error}
            fps={fps}
          />
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-full border border-white/20 bg-black/40 px-4 py-2 text-sm text-white backdrop-blur hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? 'Exit full screen' : 'Full screen'}
          </button>
        </div>
      </header>

      <section
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black"
        aria-label="Camera preview"
      >
        <video
          ref={videoRef}
          className={`h-full w-full ${isMobile ? 'object-cover' : 'object-contain'}`}
          autoPlay
          muted
          playsInline
          aria-label="Live camera feed"
        />
        <canvas
          ref={canvasRef}
          className={`pointer-events-none absolute inset-0 h-full w-full ${isMobile ? 'object-cover' : 'object-contain'}`}
          aria-label="Pose landmarks"
        />
        {!isDetecting && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/50">
            Camera is off
          </div>
        )}
      </section>
      <DetectorControl
        isDetecting={isDetecting}
        isLoading={isLoading}
        error={error}
        onStart={handleStartDetection}
        onStop={handleStopDetection}
        onSwitchCamera={handleSwitchCamera}
      />
    </main>
  )
}

export default PoseDetector
