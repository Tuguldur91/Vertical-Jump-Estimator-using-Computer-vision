import { useEffect, useMemo, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { JumpEstimator, centimetersFromReference } from "./jumpEstimator";
import type { JumpEstimate, JumpPhase } from "./jumpEstimator";

const modelUrl =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const wasmUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

const phaseLabels: Record<JumpPhase, string> = {
  calibrating: "Calibrating",
  ready: "Ready",
  takeoff: "Takeoff",
  flight: "Flight",
  landed: "Landed",
};

const phaseOrder: JumpPhase[] = [
  "calibrating",
  "ready",
  "takeoff",
  "flight",
  "landed",
];

function formatCentimeters(value: number | null) {
  return value === null ? "-" : `${value.toFixed(1)} cm`;
}

function formatSeconds(value: number | null) {
  return value === null ? "-" : `${value.toFixed(3)} s`;
}

function formatMilliseconds(value: number | null, origin: number | null) {
  if (value === null || origin === null) {
    return "-";
  }

  return `${(value - origin).toFixed(0)} ms`;
}

function SignalChart({ estimate }: { estimate: JumpEstimate }) {
  const points = useMemo(() => {
    const frames = estimate.frames;

    if (frames.length < 2) {
      return "";
    }

    const values = frames.map((frame) => frame.centerY);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(0.001, max - min);

    return frames
      .map((frame, index) => {
        const x = (index / (frames.length - 1)) * 100;
        const y = ((frame.centerY - min) / span) * 68 + 10;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [estimate.frames]);

  return (
    <svg
      className="h-28 w-full overflow-visible"
      viewBox="0 0 100 88"
      preserveAspectRatio="none"
      aria-label="Tracked center of mass signal"
    >
      <rect width="100" height="88" rx="2" fill="#f8fafc" />
      <line x1="0" x2="100" y1="78" y2="78" stroke="#d1d5db" strokeWidth="0.5" />
      <line x1="0" x2="100" y1="44" y2="44" stroke="#e5e7eb" strokeWidth="0.5" />
      {estimate.baselineY !== null && (
        <line
          x1="0"
          x2="100"
          y1="62"
          y2="62"
          stroke="#2563eb"
          strokeWidth="0.7"
          strokeDasharray="3 3"
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke="#0f766e"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const estimatorRef = useRef(new JumpEstimator());
  const [estimate, setEstimate] = useState<JumpEstimate>(
    estimatorRef.current.current(),
  );
  const [cameraStatus, setCameraStatus] = useState("Starting camera");
  const [referenceHeightCm, setReferenceHeightCm] = useState(100);
  const [referenceHeightPixels, setReferenceHeightPixels] = useState(260);
  const [lastFrameRate, setLastFrameRate] = useState(0);

  const calibratedCentimeters = centimetersFromReference(
    estimate.displacementPixels,
    referenceHeightCm,
    referenceHeightPixels,
  );
  const flightCentimeters =
    estimate.heightMeters === null ? null : estimate.heightMeters * 100;
  const takeoffOrigin = estimate.takeoffMs;
  const currentPhaseIndex = phaseOrder.indexOf(estimate.phase);

  useEffect(() => {
    let poseLandmarker: PoseLandmarker | null = null;
    let drawingUtils: DrawingUtils | null = null;
    let animationId = 0;
    let stream: MediaStream | null = null;
    let lastFrameTime = performance.now();
    let isActive = true;

    async function createPoseLandmarker() {
      const vision = await FilesetResolver.forVisionTasks(wasmUrl);

      try {
        return await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelUrl,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      } catch {
        return PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelUrl,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      }
    }

    async function start() {
      try {
        poseLandmarker = await createPoseLandmarker();
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 60 },
            facingMode: "user",
          },
          audio: false,
        });

        if (!isActive) {
          stream.getTracks().forEach((track) => track.stop());
          poseLandmarker.close();
          return;
        }

        const video = videoRef.current;

        if (!video) {
          return;
        }

        video.srcObject = stream;
        await video.play();
        setCameraStatus("Live");
        detect();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to initialize camera";
        setCameraStatus(message);
      }
    }

    function drawMeasurementOverlay(ctx: CanvasRenderingContext2D, next: JumpEstimate) {
      const canvas = ctx.canvas;

      if (next.baselineY !== null) {
        const baseline = next.baselineY * canvas.height;
        ctx.strokeStyle = "rgba(37, 99, 235, 0.9)";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(0, baseline);
        ctx.lineTo(canvas.width, baseline);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (next.apexY !== null) {
        const apex = next.apexY * canvas.height;
        ctx.strokeStyle = "rgba(15, 118, 110, 0.95)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, apex);
        ctx.lineTo(canvas.width, apex);
        ctx.stroke();
      }
    }

    function detect() {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || !poseLandmarker || video.readyState < 2) {
        animationId = requestAnimationFrame(detect);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const now = performance.now();
      const results = poseLandmarker.detectForVideo(video, now);
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        animationId = requestAnimationFrame(detect);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawingUtils ??= new DrawingUtils(ctx);

      for (const landmarks of results.landmarks) {
        drawingUtils.drawConnectors(
          landmarks,
          PoseLandmarker.POSE_CONNECTIONS,
          { color: "#0f766e", lineWidth: 4 },
        );
        drawingUtils.drawLandmarks(landmarks, {
          color: "#f8fafc",
          fillColor: "#0f766e",
          radius: 4,
        });
      }

      const nextEstimate = estimatorRef.current.addFrame(
        results.landmarks[0],
        now,
        canvas.height,
      );

      drawMeasurementOverlay(ctx, nextEstimate);
      setEstimate({ ...nextEstimate, frames: [...nextEstimate.frames] });

      const elapsed = now - lastFrameTime;
      if (elapsed > 0) {
        setLastFrameRate(Math.round(1000 / elapsed));
      }
      lastFrameTime = now;
      animationId = requestAnimationFrame(detect);
    }

    start();

    return () => {
      isActive = false;
      cancelAnimationFrame(animationId);
      stream?.getTracks().forEach((track) => track.stop());
      poseLandmarker?.close();
    };
  }, []);

  function resetSession() {
    estimatorRef.current.reset();
    setEstimate(estimatorRef.current.current());
  }

  return (
    <main className="min-h-screen bg-[#f4f5f1] text-[#172018]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-4 md:px-6 lg:py-5">
        <header className="flex flex-col gap-4 border-b border-[#d9ddd4] pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#536157]">
              Automatic Vertical Jump Height Estimation
            </p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight md:text-4xl">
              Pose-Based Measurement Instrument
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md border border-[#d9ddd4] bg-white px-3 py-2 font-medium shadow-sm">
              {cameraStatus}
            </span>
            <span className="rounded-md border border-[#d9ddd4] bg-white px-3 py-2 font-medium shadow-sm">
              {lastFrameRate} fps
            </span>
            <button
              type="button"
              onClick={resetSession}
              className="rounded-md bg-[#172018] px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-[#2f4034] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2"
            >
              Recalibrate
            </button>
          </div>
        </header>

        <section className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="relative aspect-video overflow-hidden rounded-lg bg-[#111814] shadow-sm ring-1 ring-[#cfd6cc]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full scale-x-[-1]"
              />
              <div className="absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
                <div className="rounded-md bg-white/92 px-3 py-2 text-sm font-semibold text-[#172018] shadow-sm backdrop-blur">
                  {phaseLabels[estimate.phase]}
                </div>
                <div className="rounded-md bg-[#172018]/82 px-3 py-2 text-right text-sm font-semibold text-white shadow-sm backdrop-blur">
                  {formatCentimeters(flightCentimeters)}
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {phaseOrder.map((phase, index) => (
                <div
                  key={phase}
                  className={`min-h-20 rounded-md border px-3 py-3 transition ${
                    index <= currentPhaseIndex
                      ? "border-[#0f766e] bg-white shadow-sm"
                      : "border-[#d9ddd4] bg-[#eceee8]"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase text-[#536157]">
                    Step {index + 1}
                  </p>
                  <p className="mt-1 font-semibold">{phaseLabels[phase]}</p>
                </div>
              ))}
            </div>
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <section className="rounded-lg border border-[#d9ddd4] bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Height Estimate</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-md border border-[#d9ddd4] bg-[#f8fafc] p-3">
                  <p className="text-xs font-semibold uppercase text-[#536157]">
                    Flight Time
                  </p>
                  <p className="mt-1 text-3xl font-semibold tracking-normal">
                    {formatCentimeters(flightCentimeters)}
                  </p>
                </div>
                <div className="rounded-md border border-[#d9ddd4] bg-[#f8fafc] p-3">
                  <p className="text-xs font-semibold uppercase text-[#536157]">
                    Calibrated
                  </p>
                  <p className="mt-1 text-3xl font-semibold tracking-normal">
                    {formatCentimeters(calibratedCentimeters)}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="font-semibold text-[#536157]">Flight duration</dt>
                  <dd>{formatSeconds(estimate.flightTimeSec)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-[#536157]">Confidence</dt>
                  <dd>{Math.round(estimate.confidence * 100)}%</dd>
                </div>
                <div>
                  <dt className="font-semibold text-[#536157]">Apex</dt>
                  <dd>{formatMilliseconds(estimate.apexMs, takeoffOrigin)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-[#536157]">Landing</dt>
                  <dd>{formatMilliseconds(estimate.landingMs, takeoffOrigin)}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-lg border border-[#d9ddd4] bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Reference Calibration</h2>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm font-medium text-[#536157]">
                  Object height
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={referenceHeightCm}
                      onChange={(event) =>
                        setReferenceHeightCm(Number(event.target.value))
                      }
                      className="w-full rounded-md border border-[#c7cbc1] px-3 py-2 text-[#172018] outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/15"
                    />
                    <span className="font-semibold text-[#172018]">cm</span>
                  </div>
                </label>
                <label className="grid gap-1 text-sm font-medium text-[#536157]">
                  Object image height
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={referenceHeightPixels}
                      onChange={(event) =>
                        setReferenceHeightPixels(Number(event.target.value))
                      }
                      className="w-full rounded-md border border-[#c7cbc1] px-3 py-2 text-[#172018] outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/15"
                    />
                    <span className="font-semibold text-[#172018]">px</span>
                  </div>
                </label>
              </div>
            </section>

            <section className="rounded-lg border border-[#d9ddd4] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Vertical Signal</h2>
                <span className="text-sm font-semibold text-[#536157]">
                  {estimate.frames.length} frames
                </span>
              </div>
              <div className="mt-3 overflow-hidden rounded-md border border-[#d9ddd4] bg-[#f8fafc] px-2 py-3">
                <SignalChart estimate={estimate} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="font-semibold text-[#536157]">Image displacement</p>
                  <p>
                    {estimate.displacementPixels === null
                      ? "-"
                      : `${estimate.displacementPixels.toFixed(1)} px`}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-[#536157]">Baseline</p>
                  <p>
                    {estimate.baselineY === null
                      ? "-"
                      : estimate.baselineY.toFixed(3)}
                  </p>
                </div>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
