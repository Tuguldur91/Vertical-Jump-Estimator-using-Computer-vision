
/**
 * Mediapipe pose landmarker lite model URL
 */

export const POSE_LANDMARKER_LITE =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";


/**
 * MediaPipe WASM files CDN URL
 * @constant {string}
 */
export const WASM_CDN_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";


/**
 * Canvas 2D context options optimized for frequent reading
 * Note: desynchronized disabled for Android compatibility
 * @constant {Object}
 */
export const CANVAS_CONTEXT_OPTIONS = {
  willReadFrequently: true,
  alpha: true,
};