import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

const GRAVITY = 9.81;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

export type JumpPhase = "calibrating" | "ready" | "takeoff" | "flight" | "landed";

export type TrackedFrame = {
  timeMs: number;
  hipY: number;
  centerY: number;
  footY: number;
  velocityY: number;
  visibility: number;
};

export type JumpEstimate = {
  phase: JumpPhase;
  baselineY: number | null;
  takeoffMs: number | null;
  apexMs: number | null;
  landingMs: number | null;
  apexY: number | null;
  flightTimeSec: number | null;
  heightMeters: number | null;
  displacementPixels: number | null;
  confidence: number;
  frames: TrackedFrame[];
};

export type JumpEstimatorConfig = {
  calibrationFrameCount: number;
  smoothingAlpha: number;
  takeoffVelocityThreshold: number;
  takeoffDisplacementThreshold: number;
  landingDisplacementThreshold: number;
  minFlightMs: number;
  maxHistoryFrames: number;
};

const defaultConfig: JumpEstimatorConfig = {
  calibrationFrameCount: 45,
  smoothingAlpha: 0.28,
  takeoffVelocityThreshold: -0.32,
  takeoffDisplacementThreshold: 0.018,
  landingDisplacementThreshold: 0.035,
  minFlightMs: 180,
  maxHistoryFrames: 180,
};

const emptyEstimate = (): JumpEstimate => ({
  phase: "calibrating",
  baselineY: null,
  takeoffMs: null,
  apexMs: null,
  landingMs: null,
  apexY: null,
  flightTimeSec: null,
  heightMeters: null,
  displacementPixels: null,
  confidence: 0,
  frames: [],
});

function averageLandmark(
  landmarks: NormalizedLandmark[],
  first: number,
  second: number,
) {
  const a = landmarks[first];
  const b = landmarks[second];

  if (!a || !b) {
    return null;
  }

  return {
    y: (a.y + b.y) / 2,
    visibility: ((a.visibility ?? 0) + (b.visibility ?? 0)) / 2,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export class JumpEstimator {
  private readonly config: JumpEstimatorConfig;
  private estimate: JumpEstimate = emptyEstimate();
  private calibrationSamples: number[] = [];
  private smoothedCenterY: number | null = null;
  private previousFrame: TrackedFrame | null = null;

  constructor(config: Partial<JumpEstimatorConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  reset() {
    this.estimate = emptyEstimate();
    this.calibrationSamples = [];
    this.smoothedCenterY = null;
    this.previousFrame = null;
  }

  current() {
    return this.estimate;
  }

  addFrame(
    landmarks: NormalizedLandmark[] | undefined,
    timeMs: number,
    videoHeight: number,
  ) {
    if (!landmarks?.length) {
      this.estimate = {
        ...this.estimate,
        confidence: Math.max(0, this.estimate.confidence - 0.03),
      };
      return this.estimate;
    }

    const hips = averageLandmark(landmarks, LEFT_HIP, RIGHT_HIP);
    const shoulders = averageLandmark(landmarks, LEFT_SHOULDER, RIGHT_SHOULDER);
    const ankles = averageLandmark(landmarks, LEFT_ANKLE, RIGHT_ANKLE);

    if (!hips || !shoulders || !ankles) {
      return this.estimate;
    }

    const centerY = hips.y * 0.72 + shoulders.y * 0.28;
    this.smoothedCenterY =
      this.smoothedCenterY === null
        ? centerY
        : this.smoothedCenterY +
          this.config.smoothingAlpha * (centerY - this.smoothedCenterY);

    const deltaTimeSec = this.previousFrame
      ? Math.max(0.001, (timeMs - this.previousFrame.timeMs) / 1000)
      : 1 / 30;
    const velocityY = this.previousFrame
      ? (this.smoothedCenterY - this.previousFrame.centerY) / deltaTimeSec
      : 0;
    const visibility = (hips.visibility + shoulders.visibility + ankles.visibility) / 3;

    const frame: TrackedFrame = {
      timeMs,
      hipY: hips.y,
      centerY: this.smoothedCenterY,
      footY: ankles.y,
      velocityY,
      visibility,
    };

    const frames = [...this.estimate.frames, frame].slice(
      -this.config.maxHistoryFrames,
    );

    this.previousFrame = frame;

    if (this.estimate.phase === "calibrating") {
      this.calibrationSamples.push(frame.centerY);

      if (this.calibrationSamples.length >= this.config.calibrationFrameCount) {
        const baselineY =
          this.calibrationSamples.reduce((sum, value) => sum + value, 0) /
          this.calibrationSamples.length;

        this.estimate = {
          ...this.estimate,
          phase: "ready",
          baselineY,
          confidence: clamp(visibility, 0, 1),
          frames,
        };

        return this.estimate;
      }

      this.estimate = {
        ...this.estimate,
        confidence: clamp(
          this.calibrationSamples.length / this.config.calibrationFrameCount,
          0,
          1,
        ),
        frames,
      };

      return this.estimate;
    }

    const baselineY = this.estimate.baselineY;

    if (baselineY === null) {
      this.estimate = { ...this.estimate, frames };
      return this.estimate;
    }

    const upwardDisplacement = baselineY - frame.centerY;
    const hasTakeoffVelocity =
      frame.velocityY < this.config.takeoffVelocityThreshold;
    const hasTakeoffDisplacement =
      upwardDisplacement > this.config.takeoffDisplacementThreshold;

    if (
      this.estimate.phase === "ready" &&
      hasTakeoffVelocity &&
      hasTakeoffDisplacement &&
      visibility > 0.58
    ) {
      this.estimate = {
        ...this.estimate,
        phase: "takeoff",
        takeoffMs: timeMs,
        apexMs: timeMs,
        apexY: frame.centerY,
        confidence: clamp(visibility, 0, 1),
        frames,
      };

      return this.estimate;
    }

    if (this.estimate.phase === "takeoff" || this.estimate.phase === "flight") {
      const currentApexY = this.estimate.apexY ?? frame.centerY;
      const isHigher = frame.centerY < currentApexY;
      const nextApexY = isHigher ? frame.centerY : currentApexY;
      const nextApexMs = isHigher ? timeMs : this.estimate.apexMs;
      const flightElapsedMs = timeMs - (this.estimate.takeoffMs ?? timeMs);
      const hasReturnedToBaseline =
        Math.abs(frame.centerY - baselineY) < this.config.landingDisplacementThreshold;
      const hasLanded =
        flightElapsedMs > this.config.minFlightMs &&
        hasReturnedToBaseline &&
        frame.velocityY >= -0.04;

      if (hasLanded) {
        const flightTimeSec = flightElapsedMs / 1000;
        const heightMeters = (GRAVITY * flightTimeSec * flightTimeSec) / 8;

        this.estimate = {
          ...this.estimate,
          phase: "landed",
          apexY: nextApexY,
          apexMs: nextApexMs,
          landingMs: timeMs,
          flightTimeSec,
          heightMeters,
          displacementPixels: (baselineY - nextApexY) * videoHeight,
          confidence: clamp(visibility * 0.85 + 0.15, 0, 1),
          frames,
        };

        return this.estimate;
      }

      this.estimate = {
        ...this.estimate,
        phase: "flight",
        apexY: nextApexY,
        apexMs: nextApexMs,
        displacementPixels: (baselineY - nextApexY) * videoHeight,
        confidence: clamp(visibility, 0, 1),
        frames,
      };

      return this.estimate;
    }

    this.estimate = {
      ...this.estimate,
      confidence: clamp(visibility, 0, 1),
      frames,
    };

    return this.estimate;
  }
}

export function centimetersFromReference(
  displacementPixels: number | null,
  referenceHeightCm: number,
  referenceHeightPixels: number,
) {
  if (
    displacementPixels === null ||
    referenceHeightCm <= 0 ||
    referenceHeightPixels <= 0
  ) {
    return null;
  }

  return (displacementPixels / referenceHeightPixels) * referenceHeightCm;
}
