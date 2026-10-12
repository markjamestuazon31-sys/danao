import {
  Camera,
  CameraOff,
  Grab,
  Hand,
  Move,
  PackageCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useHandTracking from "../../hooks/useHandTracking";
import { useLearningPreferences } from "../../context/LearningPreferencesContext";

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const TILE_POSITIONS = [
  { x: 0.15, y: 0.24 },
  { x: 0.38, y: 0.40 },
  { x: 0.62, y: 0.24 },
  { x: 0.85, y: 0.40 },
];
const DROP_AREA = { left: 0.31, right: 0.69, top: 0.68, bottom: 0.91 };

function inside(point, area) {
  return Boolean(point
    && point.x >= area.left
    && point.x <= area.right
    && point.y >= area.top
    && point.y <= area.bottom);
}

function positionsForCount(count) {
  if (count === 2) return [{ x: 0.28, y: 0.34 }, { x: 0.72, y: 0.34 }];
  if (count === 3) return [{ x: 0.19, y: 0.32 }, { x: 0.5, y: 0.23 }, { x: 0.81, y: 0.32 }];
  return TILE_POSITIONS.slice(0, Math.min(4, count));
}

function tileAtCursor(cursor, positions) {
  if (!cursor) return -1;
  return positions.findIndex((position) => (
    Math.abs(cursor.x - position.x) <= 0.105
    && Math.abs(cursor.y - position.y) <= 0.14
  ));
}

function answerLengthClass(choice) {
  const length = String(choice ?? "").trim().length;
  if (length > 28) return "is-extra-long-answer";
  if (length > 16) return "is-long-answer";
  if (length > 8) return "is-medium-answer";
  return "is-short-answer";
}

export default function CameraMathStage({
  choices,
  choiceImages = [],
  questionKey,
  onDrop,
  disabled = false,
  autoStart = true,
  itemNoun = "answer",
  dropTitle = "ANSWER BOX",
  dropInstruction = "Pinch, drag, and release the correct answer",
  stageLabel = "Camera pinch, drag, and drop answer board",
}) {
  const { playSound } = useLearningPreferences();
  const {
    videoRef,
    active,
    loading,
    status,
    error,
    cursor,
    landmarks,
    pinching,
    start,
    stop,
  } = useHandTracking();
  const visibleChoices = useMemo(() => (choices || []).slice(0, 4), [choices]);
  const visibleImages = useMemo(() => (choiceImages || []).slice(0, 4), [choiceImages]);
  const visiblePositions = useMemo(() => positionsForCount(visibleChoices.length), [visibleChoices.length]);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const [grabbedIndex, setGrabbedIndex] = useState(-1);
  const [message, setMessage] = useState("Starting the camera automatically…");
  const [submitted, setSubmitted] = useState(false);
  const previousPinchRef = useRef(false);
  const grabbedIndexRef = useRef(-1);
  const submittedRef = useRef(false);
  const autoAttemptedRef = useRef(false);
  const dropRef = useRef(onDrop);

  useEffect(() => { dropRef.current = onDrop; }, [onDrop]);

  const setGrabbed = useCallback((index) => {
    grabbedIndexRef.current = index;
    setGrabbedIndex(index);
  }, []);

  useEffect(() => {
    submittedRef.current = false;
    previousPinchRef.current = false;
    setSubmitted(false);
    setHoveredIndex(-1);
    setGrabbed(-1);
    setMessage(active
      ? `Move to a ${itemNoun}, pinch to grab it, then release it in the answer box.`
      : "Starting the camera automatically…");
  }, [active, itemNoun, questionKey, setGrabbed]);

  useEffect(() => {
    if (!autoStart || autoAttemptedRef.current) return;
    autoAttemptedRef.current = true;
    start()
      .then(() => setMessage(`Camera ready. Pinch a ${itemNoun} to pick it up.`))
      .catch((startError) => setMessage(startError?.message || "Camera access could not start."));
  }, [autoStart, itemNoun, start]);

  const submitChoice = useCallback((index, source) => {
    if (disabled || submittedRef.current || index < 0 || index >= visibleChoices.length) return;
    const value = visibleChoices[index];
    submittedRef.current = true;
    setSubmitted(true);
    setGrabbed(-1);
    setMessage(`${value} dropped in the answer box. Checking…`);
    playSound("drop");
    dropRef.current?.(value, { input: source, interaction: "pinch-drop" });
  }, [disabled, playSound, setGrabbed, visibleChoices]);

  useEffect(() => {
    if (!active || disabled || submittedRef.current) return;

    const wasPinching = previousPinchRef.current;
    previousPinchRef.current = pinching;
    const overTile = tileAtCursor(cursor, visiblePositions);
    const currentGrabbed = grabbedIndexRef.current;

    if (currentGrabbed < 0) setHoveredIndex(overTile);

    if (pinching && !wasPinching && currentGrabbed < 0 && overTile >= 0) {
      setGrabbed(overTile);
      setHoveredIndex(-1);
      playSound("grab");
      setMessage(`${visibleChoices[overTile]} grabbed. Keep pinching and move it into the answer box.`);
      return;
    }

    if (!pinching && wasPinching && currentGrabbed >= 0) {
      if (inside(cursor, DROP_AREA)) {
        submitChoice(currentGrabbed, "camera-drag");
      } else {
        setGrabbed(-1);
        setMessage(`Almost! Release the ${itemNoun} inside the large answer box.`);
      }
      return;
    }

    if (currentGrabbed >= 0 && pinching) {
      setMessage(inside(cursor, DROP_AREA)
        ? `Great! Open your fingers to drop the ${itemNoun}.`
        : `Keep pinching and move the ${itemNoun} into the answer box.`);
    } else if (overTile >= 0) {
      setMessage(`Pinch your thumb and index finger on ${visibleChoices[overTile]}.`);
    } else if (cursor) {
      setMessage(`Move your fingertip onto a floating ${itemNoun}.`);
    }
  }, [active, cursor, disabled, itemNoun, pinching, playSound, setGrabbed, submitChoice, visibleChoices, visiblePositions]);

  function selectByTap(index) {
    if (disabled || submittedRef.current) return;
    setGrabbed(index);
    playSound("grab");
    setMessage(`${visibleChoices[index]} selected. Tap the answer box to drop it.`);
  }

  async function retryCamera() {
    setMessage("");
    try {
      if (active) {
        stop();
        setMessage("Camera paused. Tap Retry camera when you are ready.");
      } else {
        await start();
        setMessage(`Camera ready. Pinch a ${itemNoun} to pick it up.`);
      }
    } catch (startError) {
      setMessage(startError?.message || "Camera access could not start.");
    }
  }

  const overDrop = grabbedIndex >= 0 && inside(cursor, DROP_AREA);

  return (
    <section className="camera-math-stage camera-drag-stage" aria-label={stageLabel}>
      <div className="camera-math-stage__toolbar">
        <div>
          <span className={active ? "is-live" : ""}><i /> {active ? "Camera ready" : loading ? "Starting camera" : "Camera paused"}</span>
          <p aria-live="polite">{message || error || status}</p>
        </div>
        <button type="button" onClick={retryCamera} disabled={loading}>
          {active ? <CameraOff size={18} /> : <Camera size={18} />}
          {loading ? "Starting…" : active ? "Pause camera" : "Retry camera"}
        </button>
      </div>

      <div className="camera-drag-instructions" aria-label="How to answer">
        <span><b>1</b><Grab size={18} /> Pinch a {itemNoun}</span>
        <span><b>2</b><Move size={18} /> Drag it to the box</span>
        <span><b>3</b><PackageCheck size={18} /> Open hand to drop</span>
      </div>

      <div className="camera-math-stage__viewport">
        <video ref={videoRef} muted playsInline aria-label="Live local camera preview" />
        {!active && (
          <div className="camera-math-stage__camera-off">
            <Hand size={54} />
            <strong>{loading ? "Preparing your hand controller…" : "Camera needs permission"}</strong>
            <p>{loading ? "The game starts automatically when hand tracking is ready." : `Allow camera access in the browser, then press Retry camera. You can also tap a ${itemNoun} and the answer box.`}</p>
          </div>
        )}

        {active && landmarks.length === 0 && (
          <div className="camera-easy-hand-guide"><Hand size={27} /><span>Raise one hand where the camera can see it</span></div>
        )}

        {active && landmarks.length > 0 && (
          <svg className="camera-math-stage__hand" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {HAND_CONNECTIONS.map(([from, to]) => (
              <line key={`${from}-${to}`} x1={landmarks[from].x * 100} y1={landmarks[from].y * 100} x2={landmarks[to].x * 100} y2={landmarks[to].y * 100} />
            ))}
            {landmarks.map((point, index) => (
              <circle key={index} cx={point.x * 100} cy={point.y * 100} r={index === 8 ? 1.45 : 0.62} />
            ))}
          </svg>
        )}

        <div className="camera-floating-answers" aria-label={`Floating ${itemNoun} choices`}>
          {visibleChoices.map((choice, index) => {
            const position = visiblePositions[index];
            const dragging = grabbedIndex === index;
            const left = dragging && cursor ? cursor.x : position.x;
            const top = dragging && cursor ? cursor.y : position.y;
            const imageUrl = visibleImages[index];
            return (
              <button
                type="button"
                key={`${choice}-${index}`}
                className={`camera-floating-answer tone-${index + 1} ${answerLengthClass(choice)} ${imageUrl ? "has-picture" : ""} ${hoveredIndex === index ? "is-hovered" : ""} ${dragging ? "is-grabbed" : ""}`}
                style={{ left: `${left * 100}%`, top: `${top * 100}%` }}
                onClick={() => selectByTap(index)}
                disabled={disabled || submitted}
                aria-pressed={dragging}
                aria-label={`Answer ${String.fromCharCode(65 + index)}: ${choice}. Pinch to drag or tap to select.`}
                title={`Answer ${String.fromCharCode(65 + index)}: ${choice}`}
              >
                <small>{String.fromCharCode(65 + index)}</small>
                {imageUrl ? <img className="camera-floating-answer__image" src={imageUrl} alt="" draggable={false} /> : null}
                <strong>{choice}</strong>
                <Grab size={16} />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className={`camera-answer-dropzone ${overDrop ? "is-ready" : ""} ${grabbedIndex >= 0 ? "has-answer" : ""}`}
          onClick={() => submitChoice(grabbedIndex, "tap-drop")}
          disabled={disabled || submitted || grabbedIndex < 0}
          aria-label={grabbedIndex >= 0 ? `Drop ${visibleChoices[grabbedIndex]} in the answer box` : "Answer drop box"}
        >
          <PackageCheck size={28} />
          <strong>{overDrop ? "OPEN YOUR HAND TO DROP" : grabbedIndex >= 0 ? `BRING THE ${itemNoun.toUpperCase()} HERE` : dropTitle}</strong>
          <span>{grabbedIndex >= 0 ? `${visibleChoices[grabbedIndex]} is ready to drop` : dropInstruction}</span>
        </button>

        {cursor && (
          <span className={`camera-math-cursor ${pinching ? "is-pinching" : ""} ${overDrop ? "is-over-drop" : ""}`} style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }} aria-hidden="true">
            {pinching ? <Grab size={20} /> : <Hand size={20} />}
          </span>
        )}

        {active && cursor && <div className="camera-easy-tracking-badge"><Sparkles size={15} /> {pinching ? "Pinch detected" : "Hand found"}</div>}
      </div>

      <div className="camera-math-stage__privacy">
        <ShieldCheck size={16} />
        <span>Camera frames and hand landmarks stay on this device. Jidanao never uploads or saves webcam video, screenshots, faces, or biometric templates.</span>
      </div>
    </section>
  );
}
