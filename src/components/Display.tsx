import { useState, useEffect } from 'react'
import { usePoseDetection } from '../hooks/usePoseDetection'

/**
 * main component for camera display and pose detection
 */

const Display = () => {
  const [error, setError] = useState<string | null>(null)
  
  const { videoRef, canvasRef, detectionState } = usePoseDetection()

 // camera input and canvas for pose detection

	return (
		
	)
}

export default Display
