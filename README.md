Automatic Vertical Jump Height Estimation Using Computer Vision

Bachelor thesis project — camera-based, markerless vertical jump height estimation, targeted at volleyball/basketball athletes rather than generic standing vertical jump tests.

Core idea

No force plate, no jump mat, no physical markers. An athlete records a jump on a phone; the system estimates jump height using computer vision. Two detection methods are implemented and compared against each other and against manually-reviewed ground truth.

Formula (shared by all methods):

h = g * t² / 8

where t = flight time (seconds, from takeoff to landing), g = 9.81 m/s².

The formula itself is trivial — the actual contribution is reliably finding t from video, under real conditions (approach-jump motion, arm swing, varying frame rate, varying camera setup).

Differentiators vs. existing apps (My Jump Lab, VertVision, Jumpo 2)
Existing apps target the standing countermovement jump (CMJ) test — static camera, no run-up.
This thesis targets sport-specific approach jumps (volleyball spike/block, basketball rebound/layup) — run-up before takeoff, arm swing, torso rotation.
Open, cross-platform, web-deployable approach vs. My Jump Lab's closed proprietary iOS-only (Apple Vision) implementation.
Includes a comparative study (classical vs. pose-based detection), not just a single implementation.
Architecture
Phone (record video, iPhone 13+ used for testing)
   → upload to backend
Backend: Python, FastAPI + OpenCV + MediaPipe Pose
   → runs both detection methods on the same decoded frames
   → returns flight time, height, method comparison as JSON
Frontend: Vite + React
   → camera/file input, upload, display results
   → basic athlete progress-tracking (jump history over time, simple DB)

Backend-processing chosen over on-device/browser WASM processing:

consistent performance regardless of phone hardware
one Python codebase shared between the live pipeline and the offline evaluation script (avoids maintaining two divergent implementations of the same logic)
Detection methods being compared
Classical (physics-based) method — background subtraction / frame differencing → track lowest point of silhouette (foot proxy) → event detection via position/velocity threshold → flight-time formula.
Pose-estimation method — MediaPipe Pose Landmarker → track hip (and/or ankle) keypoint Y-coordinate per frame → same event detection logic → flight-time formula.
(Optional/stretch) Fine-tuned ResNet frame classifier (ground/airborne per frame) as a third detection arm, if time allows — not a replacement for the physics formula, just another way to find takeoff/landing frames.
Event detection rules (the actual algorithmic contribution)
Establish baseline ground Y-position from pre-jump frames.
Use vertical velocity (frame-to-frame Y-change), not raw position, to flag takeoff/landing — more robust to jitter/noise.
Use actual per-frame timestamps (cv2.CAP_PROP_POS_MSEC), not assumed constant fps, to handle variable-frame-rate phone video correctly.
Handle detection gaps (occlusion/motion blur) via interpolation or flagging invalid jumps.
Refine iteratively: simple threshold first, validate against synthetic ground truth, then real data, then add smoothing/velocity-based refinement.
Validation plan
Synthetic ground truth first: Blender-rendered or scripted keypoint trajectories with known exact height/timing, to unit-test the event-detection and formula code in isolation before involving real people.
Real ground truth: manual frame-by-frame video review (no confirmed hardware sensor rig — Arduino/sensor sourcing in Mongolia uncertain, so this is the fallback, not a blocker).
Metrics: MAE, RMSE, Pearson's r, Bland-Altman agreement — matches the standard methodology used in the published My Jump / MMPose validation literature.
fps sensitivity study: test same jump at different frame rates (30/60fps) to quantify how sampling resolution affects height error (~2-5cm theoretical uncertainty at 60fps from frame-timing alone).
Known open questions (confirm with advisor)
 Confirm actual approved thesis title/scope — template's English title reads "A system for evaluating fitness exercise performance using pose estimation," broader than what's been discussed.
 Clarify whether the goal is jump height (center-of-mass displacement) or reach/touch height (needs standing-reach calibration) — matters a lot for volleyball/basketball framing.
 Confirm whether program expects a trained/fine-tuned ML component (would justify including the ResNet arm) or whether pretrained-only is sufficient.
se
Stack summary
Frontend: Vite + React
Backend: Python — FastAPI, OpenCV, MediaPipe (pose_landmarker_lite for speed on modest hardware, e.g. MX450 2GB VRAM laptop — CPU inference is fine, no real-time constraint since processing happens after recording)
DB: SQLite (athlete jump history — kept minimal, not a core deliverable)
Ground truth tooling: manual video review; optionally ffprobe to check for variable frame rate in test videos
To-do (rough order)
 Set up Vite + React skeleton + FastAPI backend skeleton
 Get MediaPipe Pose running on backend, extract hip/ankle keypoints from a test video
 Implement event detection v1 (simple position threshold)
 Validate event detection against synthetic/scripted ground-truth trajectory
 Implement classical background-subtraction baseline
 Collect real test jump recordings (volleyball/basketball approach jumps)
 Manual ground-truth review of test recordings
 Run both methods on test set, compute MAE/RMSE/Pearson's r/Bland-Altman
 fps sensitivity experiment (30 vs 60fps)
 Build minimal athlete progress-tracking UI + DB
 Write thesis chapters as each stage completes (don't leave writing for week 13+)
