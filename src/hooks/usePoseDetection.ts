import { useCallback, useEffect, useRef, useState } from 'react'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

/**
 *  constants and utility functions for pose detection
 * @module pose
 */
import {
  CANVAS_CONTEXT_OPTIONS,
  DETECTION_INTERVAL_MS_DEFAULT,
  DRAWING_STYLES,
  POSE_CONNECTIONS,
  POSE_LANDMARKER_LITE,
  WASM_CDN_URL,
} from '../constants/pose'
import { FACING_MODE } from '../constants/camera'
import { getMediaConstraints, stopAllTracks } from '../utils/poseHelper'

type DetectionState = {
  isDetecting: boolean
  isLoading: boolean
  facingMode: (typeof FACING_MODE)[keyof typeof FACING_MODE]
  error: string | null
  landmarksDetected: boolean
}

/**
 * Initial state for pose detection
 * @constant {Object}
 */
const INITIAL_STATE: DetectionState = {
  isDetecting: false,
  isLoading: false,
  facingMode: FACING_MODE.USER,
  error: null as string | null,
  landmarksDetected: false,
}


/**
 * custom hook for pose detection using Mediapipe PoseLandmarker
 * @function
 * @returns {Object} Pose detection state and control functions
 * used usecallback for memoizing functions and useRef for persistent references to video, canvas, and pose landmarker instances
 * handles starting and stopping detection, drawing landmarks, and single image detection
 */
export const usePoseDetection = () => {
  const [detectionState, setDetectionState] = useState<DetectionState>(INITIAL_STATE)
  const [fps, setFps] = useState<number | undefined>(undefined)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contextRef = useRef<CanvasRenderingContext2D | null>(null)
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameId = useRef<number | null>(null)
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null)
  const detectSessionRef = useRef(0)
  const fpsWindowRef = useRef({ frames: 0, startedAt: 0 })
  const isMountedRef = useRef(false)

  /**
   * Initialize the PoseLandmarker model
   * @returns {Promise<PoseLandmarker>} Initialized PoseLandmarker instance
   * uses GPU delegate for performance and runs in VIDEO mode for real-time detection
   * currently using LITE model for faster inference on mobile devices, it can be changed tho
   */
  const initPoseLandmarker = useCallback(async (): Promise<PoseLandmarker> => {
    if (poseLandmarkerRef.current) return poseLandmarkerRef.current

    const vision = await FilesetResolver.forVisionTasks(WASM_CDN_URL)
    const landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_LANDMARKER_LITE, delegate: 'GPU' },
      runningMode: 'VIDEO',
    })
    poseLandmarkerRef.current = landmarker
    return landmarker
  }, [])


  /**
   * Draw pose landmarks and connections on the canvas
   * @param {NormalizedLandmark[]} landmarks - Array of pose landmarks
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   * uses confidence threshold to filter out low-confidence landmarks and connections
   */
  const drawPose = useCallback(
    (
      landmarks: NormalizedLandmark[],
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number
    ): void => {
      ctx.clearRect(0, 0, width, height)
      const {
        connectionColor,
        connectionWidth,
        landmarkColor,
        landmarkRadius,
        confidenceThreshold,
      } = DRAWING_STYLES

      ctx.strokeStyle = connectionColor
      ctx.lineWidth = connectionWidth
      ctx.lineCap = 'round'
      for (const [startIndex, endIndex] of POSE_CONNECTIONS) {
        const start = landmarks[startIndex]
        const end = landmarks[endIndex]
        if (
          (start?.visibility ?? 0) > confidenceThreshold &&
          (end?.visibility ?? 0) > confidenceThreshold
        ) {
          ctx.beginPath()
          ctx.moveTo(start.x * width, start.y * height)
          ctx.lineTo(end.x * width, end.y * height)
          ctx.stroke()
        }
      }

      ctx.fillStyle = landmarkColor
      for (const landmark of landmarks) {
        if ((landmark.visibility ?? 0) > confidenceThreshold) {
          ctx.beginPath()
          ctx.arc(
            landmark.x * width,
            landmark.y * height,
            landmarkRadius,
            0,
            2 * Math.PI
          )
          ctx.fill()
        }
      }
    },
    []
  )

  /**
   * Detect pose landmarks from the video stream and draw them on the canvas
   * @param {number} session - Current detection session ID
   * uses requestAnimationFrame for smooth rendering and setTimeout for controlled detection intervals
   * handles video readiness and errors gracefully, updating the detection state accordingly
   */
  const detectPose = useCallback(
    (session: number): void => {
      const landmarker = poseLandmarkerRef.current
      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = contextRef.current
      if ( !landmarker || !video || !canvas || !ctx || session !== detectSessionRef.current)
        return

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        animationFrameId.current = requestAnimationFrame(() =>
          detectPose(session)
        )
        return
      }

      try {
        const results = landmarker.detectForVideo(video, performance.now())
        const now = performance.now()
        const fpsWindow = fpsWindowRef.current
        fpsWindow.frames += 1
        if (fpsWindow.startedAt === 0) fpsWindow.startedAt = now
        const elapsed = now - fpsWindow.startedAt
        if (elapsed >= 1000) {
          setFps((fpsWindow.frames * 1000) / elapsed)
          fpsWindow.frames = 0
          fpsWindow.startedAt = now
        }
        const landmarks = results.landmarks?.[0]
        if (landmarks?.length) {
          drawPose(landmarks, ctx, canvas.width, canvas.height)
          setDetectionState((state) =>
            state.landmarksDetected
              ? state
              : { ...state, landmarksDetected: true }
          )
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          setDetectionState((state) =>
            state.landmarksDetected
              ? { ...state, landmarksDetected: false }
              : state
          )
        }
      } catch (error) {
        console.error('Pose detection failed:', error)
        setDetectionState((state) => ({
          ...state,
          error:
            error instanceof Error ? error.message : 'Pose detection failed',
        }))
      }

      if (session === detectSessionRef.current) {
        timeoutId.current = setTimeout(() => {
          animationFrameId.current = requestAnimationFrame(() =>
            detectPose(session)
          )
        }, DETECTION_INTERVAL_MS_DEFAULT)
      }
    },
    [drawPose]
  )

  const handleStopDetection = useCallback((): void => {
    detectSessionRef.current += 1
    fpsWindowRef.current = { frames: 0, startedAt: 0 }
    setFps(undefined)
    if (animationFrameId.current !== null) {
      cancelAnimationFrame(animationFrameId.current)
      animationFrameId.current = null
    }
    if (timeoutId.current !== null) {
      clearTimeout(timeoutId.current)
      timeoutId.current = null
    }
    stopAllTracks(streamRef.current)
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    if (contextRef.current && canvasRef.current) {
      contextRef.current.clearRect(
        0,
        0,
        canvasRef.current.width,
        canvasRef.current.height
      )
    }
    contextRef.current = null
    setDetectionState((state) => ({
      ...state,
      isDetecting: false,
      isLoading: false,
      landmarksDetected: false,
    }))
  }, [])

  /**
   * control for actually using the camera and detecting the pose landmarks
   * @returns {Promise<void>}
   * handles starting the pose detection process, including initializing the model, accessing the camera, and setting up the video and canvas elements
   * updates the detection state to reflect loading and error states, ensuring a responsive user experience
   * uses async/await for handling asynchronous operations and try/catch for error handling
   * throws an error if the camera access fails
   */

  const handleStartDetection = useCallback(async (): Promise<void> => {
    handleStopDetection()
    const session = ++detectSessionRef.current
    setDetectionState((state) => ({ ...state, isLoading: true, error: null }))
    setFps(undefined)

    let stream: MediaStream | null = null
    try {
      if (!window.isSecureContext) {
        throw new Error('Camera access requires HTTPS. Open this page in Safari using an HTTPS URL.')
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is unavailable in this browser. Open the page directly in Safari and try again.')
      }

      const landmarker = await initPoseLandmarker()
      if (session !== detectSessionRef.current) {
        if (!isMountedRef.current) {
          landmarker.close()
          if (poseLandmarkerRef.current === landmarker) {
            poseLandmarkerRef.current = null
          }
        }
        return
      }

      const constraints = await getMediaConstraints(detectionState.facingMode)
      if (session !== detectSessionRef.current) return
      stream = await navigator.mediaDevices.getUserMedia(constraints)
      if (session !== detectSessionRef.current) {
        stopAllTracks(stream)
        return
      }

      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas)
        throw new Error('Video and canvas elements are required')

      streamRef.current = stream
      video.srcObject = stream
      await video.play()
      if (session !== detectSessionRef.current) return

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      contextRef.current = canvas.getContext('2d', CANVAS_CONTEXT_OPTIONS)
      if (!contextRef.current)
        throw new Error('Could not create a 2D canvas context')

      setDetectionState((state) => ({
        ...state,
        isLoading: false,
        isDetecting: true,
      }))
      detectPose(session)
    } catch (error) {
      if (stream) stopAllTracks(stream)
      if (streamRef.current === stream) streamRef.current = null
      if (session !== detectSessionRef.current) return
      setDetectionState((state) => ({
        ...state,
        isLoading: false,
        isDetecting: false,
        error:
          error instanceof Error
            ? error.message
            : 'Could not start pose detection',
      }))
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [
    detectionState.facingMode,
    detectPose,
    handleStopDetection,
    initPoseLandmarker,
  ])

  /**
   * Detect pose landmarks from a single image and draw them on the canvas
   * @param {MediaStream} currentSession - Current media stream session
   * @param {HTMLImageElement} image - Image element to detect pose from
   * @returns {Promise<void>}
   * handles single image pose detection, useful for static images or snapshots
   */
  const singleImageDetection = useCallback(
    async (
      currentSession: MediaStream,
      image: HTMLImageElement
    ): Promise<void> => {
      const landmarker = poseLandmarkerRef.current
      const canvas = canvasRef.current
      const ctx = contextRef.current
      if (!landmarker || !canvas || !ctx || !currentSession || !image) return

      try {
        const results = await landmarker.detect(image)
        const landmarks = results.landmarks?.[0]
        if (landmarks?.length) {
          drawPose(landmarks, ctx, canvas.width, canvas.height)
          setDetectionState((state) => ({ ...state, landmarksDetected: true }))
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          setDetectionState((state) => ({ ...state, landmarksDetected: false }))
        }
      } catch (error) {
        console.error('Image pose detection failed:', error)
        setDetectionState((state) => ({
          ...state,
          error:
            error instanceof Error
              ? error.message
              : 'Image pose detection failed',
        }))
      }
    },
    [drawPose]
  )

  /**
   * Switch between front and back camera for pose detection
   * @returns {Promise<void>}
   * handles switching the camera facing mode, restarting the detection process with the new camera
   */
  const handleSwitchCamera = useCallback(async (): Promise<void> => {
    setDetectionState((state) => ({
      ...state,
      facingMode:
        state.facingMode === FACING_MODE.USER
          ? FACING_MODE.ENVIRONMENT
          : FACING_MODE.USER,
    }))
    await handleStartDetection()
  }, [handleStartDetection])

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      detectSessionRef.current += 1

      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current)
        animationFrameId.current = null
      }
      if (timeoutId.current !== null) {
        clearTimeout(timeoutId.current)
        timeoutId.current = null
      }

      stopAllTracks(streamRef.current)
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      if (contextRef.current && canvasRef.current) {
        contextRef.current.clearRect(
          0,
          0,
          canvasRef.current.width,
          canvasRef.current.height,
        )
      }
      contextRef.current = null

      poseLandmarkerRef.current?.close()
      poseLandmarkerRef.current = null
    }
  }, [])


  return {
    detectionState,
    fps,
    videoRef,
    canvasRef,
    handleSwitchCamera,
    handleStartDetection,
    handleStopDetection,
    singleImageDetection,
  }
}
