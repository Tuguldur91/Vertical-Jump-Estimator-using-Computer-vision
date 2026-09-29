// camera pose decection using mediapipe
import { useEffect, useRef, useState, useCallback } from 'react'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import {
  POSE_LANDMARKER_LITE,
  WASM_CDN_URL,
  CANVAS_CONTEXT_OPTIONS,
} from '../constants/pose'

const INITIAL_STATE = {
  isDetecting: false,
  isLoading: false,
  error: null,
  landmarksDetected: false,
}

export const usePoseDetection = () => {
  const [detectionState, setDetectionState] = useState(INITIAL_STATE)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // refs for detection control
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null)
  const detectSessionRef = useRef< | null>(null)


  const initPoseLandmarker = useCallback(async () => {
    // initializing pose landmarker
    if (poseLandmarkerRef.current) {
      return poseLandmarkerRef.current
    }
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN_URL)
      const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: POSE_LANDMARKER_LITE, delegate: 'GPU' },
        runningMode: 'VIDEO',
      })
      poseLandmarkerRef.current = poseLandmarker
      return poseLandmarker
    } catch (error) {
      console.error('Error initializing pose landmarker:', error)
      throw error
    }
  }, [])

  const handleStartDetection = useCallback(async () => {
    initPoseLandmarker()
    
  }, [])

  const singleImageDetection = useCallback(async ( image: HTMLImageElement) => {
    handleStartDetection()
    poseLandmarkerRef.current?.detectForVideo(image, Date.now(), (result) => {
      return result
    })
  }, [])


  const drawLandmarks = useCallback(( landmarks, ctx, width, height ) => {
    if 
  }, [])

  const handleStopDetection = useCallback(() => {
    poseLandmarkerRef.current?.close()

    
  }, [])
}


