import {
  ArrowRight,
  Check,
  CheckCircle2,
  CirclePlus,
  Expand,
  FileQuestion,
  FolderOpen,
  Gamepad2,
  GraduationCap,
  LoaderCircle,
  MonitorPlay,
  RefreshCw,
  Search,
  Target,
  Trophy,
  UserRound,
  Users,
  Volume2,
  VolumeX,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ProfileAvatar from "../components/ProfileAvatar";
import CameraMathStage from "../components/student/CameraMathStage";
import CameraReadingStage from "../components/student/CameraReadingStage";
import CameraSequenceStage from "../components/student/CameraSequenceStage";
import { useAuth } from "../context/AuthContext";
import { useLearningPreferences } from "../context/LearningPreferencesContext";
import { useSchoolStructure } from "../context/SchoolStructureContext";
import { assignedClassOptions } from "../data/schoolClasses";
import {
  completeClassroomSession,
  createSharedDeviceLearner,
  evaluateClassroomAnswer,
  getClassroomActivities,
  getClassroomSessionRecords,
  saveClassroomProgress,
  startClassroomSession,
} from "../services/classroomSessionService";
import { getTeacherStudentDirectory } from "../services/directoryService";
import { CAMERA_TRACKS } from "../services/cameraContentService";
import "../styles/teacher-game-zone.css";

const CATEGORIES = [
  { id: "game", label: "Published Games", icon: Gamepad2, matches: (activity) => activity.type === "game" },
  { id: "quiz", label: "Quiz Challenges", icon: FileQuestion, matches: (activity) => activity.type === "quiz" },
  { id: "camera", label: "Camera Activities", icon: MonitorPlay, matches: (activity) => activity.type.startsWith("camera-") },
];

function formatDateTime(value) {
  if (!value) return "Not completed";
  return new Date(value).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function activityTone(activity) {
  const type = activity?.type || activity?.contentType || "game";
  if (type === "quiz") return "quiz";
  if (type.startsWith("camera-")) return "camera";
  return "game";
}

function responseValues(record) {
  return Object.values(record?.responses || {}).sort((left, right) => Number(left.itemNumber || 0) - Number(right.itemNumber || 0));
}

function TvAnswerFeedback({ feedback, busy, finalQuestion, onNext }) {
  if (!feedback) return null;
  return (
    <div className={`game-zone-tv-feedback ${feedback.correct ? "is-correct" : "is-wrong"}`} role="status">
      {feedback.correct ? <CheckCircle2 size={34} /> : <XCircle size={34} />}
      <div>
        <strong>{feedback.correct ? "Correct! Excellent work." : "Good try—let’s learn from it."}</strong>
        {!feedback.correct && feedback.correctAnswer && <span>Correct answer: {feedback.correctAnswer}</span>}
      </div>
      <button type="button" onClick={onNext} disabled={busy}>{finalQuestion ? "Finish and save" : "Next question"} <ArrowRight size={20} /></button>
    </div>
  );
}

export default function TeacherGameZone() {
  const { user, profile } = useAuth();
  const { structure } = useSchoolStructure();
  const {
    soundEnabled,
    soundVolume,
    musicEnabled,
    updatePreferences,
    playSound,
    beginMusic,
    speak,
    stopSpeaking,
  } = useLearningPreferences();
  const classes = useMemo(
    () => assignedClassOptions(profile, { includeAllSections: false, structure }),
    [profile, structure],
  );
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const [learners, setLearners] = useState([]);
  const [activities, setActivities] = useState([]);
  const [records, setRecords] = useState([]);
  const [category, setCategory] = useState("game");
  const [selectedActivityKey, setSelectedActivityKey] = useState("");
  const [selectedLearnerId, setSelectedLearnerId] = useState("");
  const [pageView, setPageView] = useState("zone");
  const [phase, setPhase] = useState("setup");
  const [activeSession, setActiveSession] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [responses, setResponses] = useState({});
  const [draftAnswer, setDraftAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [result, setResult] = useState(null);
  const [recordDetail, setRecordDetail] = useState(null);
  const [learnerSearch, setLearnerSearch] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [showAddLearner, setShowAddLearner] = useState(false);
  const [newLearnerName, setNewLearnerName] = useState("");
  const [newLearnerNumber, setNewLearnerNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tvMode, setTvMode] = useState(Boolean(document.fullscreenElement));

  const selectedClass = useMemo(
    () => classes.find((item) => item.key === selectedClassKey) || classes[0] || null,
    [classes, selectedClassKey],
  );
  const classLearners = useMemo(
    () => learners.filter((learner) => learner.classKey === selectedClass?.key && learner.status === "active"),
    [learners, selectedClass?.key],
  );
  const selectedLearner = useMemo(
    () => classLearners.find((learner) => learner.uid === selectedLearnerId) || null,
    [classLearners, selectedLearnerId],
  );
  const selectedActivity = useMemo(
    () => activities.find((activity) => activity.key === selectedActivityKey) || null,
    [activities, selectedActivityKey],
  );
  // Resolve the camera track from the published activity so the exact game the teacher
  // published (truefalse, math, sort, …) is the one that plays — never a default/fallback.
  const resolvedCameraTrack = (() => {
    const fromField = selectedActivity?.cameraTrack;
    if (fromField && CAMERA_TRACKS[fromField]) return fromField;
    const type = String(selectedActivity?.type || "");
    if (type.startsWith("camera-")) {
      const fromType = type.slice("camera-".length);
      if (CAMERA_TRACKS[fromType]) return fromType;
    }
    return null;
  })();
  const selectedCameraMeta = resolvedCameraTrack ? CAMERA_TRACKS[resolvedCameraTrack] : null;
  const categoryMeta = CATEGORIES.find((item) => item.id === category) || CATEGORIES[0];
  const categoryActivities = useMemo(
    () => activities.filter(categoryMeta.matches),
    [activities, categoryMeta],
  );
  const currentQuestion = selectedActivity?.questions?.[questionIndex] || null;
  const recordQuery = recordSearch.trim().toLowerCase();
  const learnerQuery = learnerSearch.trim().toLowerCase();
  const filteredRecords = useMemo(() => records.filter((record) => !recordQuery || [
    record.learnerName,
    record.contentTitle,
    record.subject,
    record.grade,
    record.section,
  ].filter(Boolean).some((value) => String(value).toLowerCase().includes(recordQuery))), [recordQuery, records]);

  useEffect(() => {
    if (!selectedClassKey && classes[0]) setSelectedClassKey(classes[0].key);
  }, [classes, selectedClassKey]);

  useEffect(() => {
    function syncFullscreen() {
      setTvMode(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const loadDirectory = useCallback(async () => {
    const directory = await getTeacherStudentDirectory({ includeSharedDevice: true });
    setLearners(directory);
    return directory;
  }, []);

  const loadClassroom = useCallback(async () => {
    if (!user?.uid || !selectedClass) return;
    setLoading(true);
    setError("");
    try {
      const [nextActivities, nextRecords] = await Promise.all([
        getClassroomActivities({ teacherId: user.uid, teacherProfile: profile, targetClass: selectedClass }),
        getClassroomSessionRecords({ teacherId: user.uid, targetClass: selectedClass }),
      ]);
      setActivities(nextActivities);
      setRecords(nextRecords);
    } catch (loadError) {
      setError(loadError.message || "Unable to load the Teacher Game Zone.");
    } finally {
      setLoading(false);
    }
  }, [profile, selectedClass, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    loadDirectory().catch((loadError) => setError(loadError.message || "Unable to load the section roster."));
  }, [loadDirectory, user?.uid]);

  useEffect(() => {
    if (!selectedClass) return;
    setSelectedLearnerId("");
    setSelectedActivityKey("");
    setPhase("setup");
    void loadClassroom();
  }, [loadClassroom, selectedClass]);

  useEffect(() => {
    if (selectedActivityKey && categoryActivities.some((activity) => activity.key === selectedActivityKey)) return;
    setSelectedActivityKey(categoryActivities[0]?.key || "");
  }, [categoryActivities, selectedActivityKey]);

  useEffect(() => {
    if (phase !== "play") return undefined;
    playSound("start");
    const stopMusic = beginMusic(selectedCameraMeta?.musicTheme || (selectedActivity?.type === "quiz" ? "reading" : "arcade"));
    return () => {
      stopMusic?.();
      stopSpeaking();
    };
  }, [beginMusic, phase, playSound, selectedActivity?.type, selectedCameraMeta?.musicTheme, stopSpeaking]);

  async function refresh() {
    setMessage("");
    await Promise.all([loadDirectory(), loadClassroom()]);
  }

  async function addLearner(event) {
    event.preventDefault();
    if (!selectedClass) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const learner = await createSharedDeviceLearner({
        teacherId: user.uid,
        targetClass: selectedClass,
        name: newLearnerName,
        learnerNumber: newLearnerNumber,
      });
      await loadDirectory();
      setSelectedLearnerId(learner.uid);
      setNewLearnerName("");
      setNewLearnerNumber("");
      setShowAddLearner(false);
      setMessage(`${learner.name} was added to ${selectedClass.label}. The administrator can now see this shared-device learner.`);
    } catch (createError) {
      setError(createError.message || "Unable to add this learner.");
    } finally {
      setBusy(false);
    }
  }

  async function enterTvMode() {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (!document.documentElement.requestFullscreen) {
        setTvMode(true);
      }
    } catch {
      setTvMode(true);
    }
  }

  async function exitTvMode() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    } finally {
      setTvMode(false);
    }
  }

  async function startGame() {
    if (!selectedLearner) {
      setError("Choose the learner who will play before starting the TV game.");
      return;
    }
    if (!selectedActivity) {
      setError("Choose a published game or activity.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    updatePreferences({ soundEnabled: true, soundVolume: 0.65, musicEnabled: true, musicVolume: 0.12 });
    void enterTvMode();
    try {
      const session = await startClassroomSession({ teacherId: user.uid, learner: selectedLearner, activity: selectedActivity });
      setActiveSession(session);
      setQuestionIndex(0);
      setResponses({});
      setDraftAnswer(selectedActivity.questions[0]?.type === "multiple" ? [] : "");
      setFeedback(null);
      setResult(null);
      setPhase("play");
    } catch (startError) {
      setError(startError.message || "The TV game could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function recordAnswer(answer = draftAnswer, metadata = {}) {
    if (!currentQuestion || !activeSession || feedback || busy) return;
    if ((currentQuestion.type === "choice" && answer === "")
      || (currentQuestion.type === "multiple" && !answer.length)
      || (currentQuestion.type === "text" && !String(answer).trim())) {
      setError("Choose or enter an answer before checking it.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const evaluation = metadata?.forceCorrect
        ? {
            correct: true,
            answerText: String(metadata?.transcript || answer || "Camera reading passed"),
            correctAnswer: currentQuestion.correctAnswer || currentQuestion.readingText || String(answer || ""),
          }
        : evaluateClassroomAnswer(currentQuestion, answer);
      const response = {
        questionId: currentQuestion.id,
        itemNumber: questionIndex + 1,
        prompt: currentQuestion.readingText || currentQuestion.prompt,
        answer: evaluation.answerText,
        correctAnswer: evaluation.correctAnswer,
        correct: evaluation.correct,
        answerMethod: metadata?.interaction || metadata?.input || "teacher-tv",
        answeredAt: Date.now(),
      };
      const nextResponses = { ...responses, [currentQuestion.id]: response };
      await saveClassroomProgress(activeSession, nextResponses);
      setResponses(nextResponses);
      setFeedback({ correct: evaluation.correct, correctAnswer: evaluation.correctAnswer });
      playSound(evaluation.correct
        ? (Object.values(nextResponses).filter((item) => item.correct).length >= 3 ? "streak" : "correct")
        : "wrong");
    } catch (saveError) {
      setError(saveError.message || "This answer could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  async function nextQuestion() {
    if (!feedback) return;
    if (questionIndex < selectedActivity.questions.length - 1) {
      const nextIndex = questionIndex + 1;
      setQuestionIndex(nextIndex);
      setDraftAnswer(selectedActivity.questions[nextIndex]?.type === "multiple" ? [] : "");
      setFeedback(null);
      setError("");
      return;
    }
    setBusy(true);
    try {
      const summary = await completeClassroomSession(activeSession, responses);
      setResult(summary);
      setPhase("result");
      playSound("achievement");
      await loadClassroom();
    } catch (completeError) {
      setError(completeError.message || "The completed game record could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function resetRound() {
    setPhase("setup");
    setActiveSession(null);
    setResponses({});
    setFeedback(null);
    setResult(null);
    setQuestionIndex(0);
    setPageView("zone");
  }

  function toggleMultipleAnswer(index) {
    setDraftAnswer((current) => {
      const next = Array.isArray(current) ? [...current] : [];
      return next.includes(index) ? next.filter((value) => value !== index) : [...next, index];
    });
  }

  function toggleClassroomSound() {
    const loudAndReady = soundEnabled && musicEnabled && soundVolume >= 0.6;
    updatePreferences(loudAndReady
      ? { soundEnabled: false, musicEnabled: false }
      : { soundEnabled: true, soundVolume: 0.65, musicEnabled: true, musicVolume: 0.12 });
  }

  const completedCount = records.filter((record) => record.status === "completed").length;
  const averageAccuracy = completedCount
    ? Math.round(records.filter((record) => record.status === "completed").reduce((sum, record) => sum + Number(record.accuracyPercent || 0), 0) / completedCount)
    : 0;
  const cameraChoiceActive = Boolean(selectedCameraMeta && ["choice", "boolean"].includes(selectedCameraMeta.kind) && currentQuestion?.type === "choice");
  const cameraSequenceActive = Boolean(selectedCameraMeta?.kind === "sequence" && currentQuestion?.type === "text");
  const cameraReadingActive = Boolean(selectedCameraMeta?.kind === "reading" && currentQuestion?.type === "manual");
  const cameraStageActive = cameraChoiceActive || cameraSequenceActive || cameraReadingActive;
  const classroomSoundReady = soundEnabled && musicEnabled && soundVolume >= 0.6;

  return (
    <div className={`teacher-game-zone ${tvMode ? "is-tv-mode" : ""} ${phase === "play" ? "is-playing" : ""}`}>
      {phase !== "play" && <header className="game-zone-hero">
        <div><span>SHARED-DEVICE TEACHING</span><h1>Teacher Game Zone</h1><p>Every game you publish appears here automatically. Connect your laptop to a TV, choose a learner, and turn your lesson into a recorded classroom challenge.</p></div>
        <aside><MonitorPlay size={38} /><div><small>TV-READY LEARNING</small><strong>{activities.length} published activities</strong><span>{classLearners.length} learners in {selectedClass?.section || "this class"}</span></div></aside>
      </header>}

      {phase !== "play" && <nav className="game-zone-view-tabs" aria-label="Game Zone views">
        <button type="button" className={pageView === "zone" ? "is-active" : ""} onClick={() => setPageView("zone")}><Gamepad2 size={18} /> Game Zone</button>
        <button type="button" className={pageView === "records" ? "is-active" : ""} onClick={() => setPageView("records")}><FolderOpen size={18} /> Student Play Records <span>{records.length}</span></button>
        <button type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={17} /> Refresh</button>
      </nav>}

      {error && <div className="alert error" role="alert">{error}</div>}
      {message && <div className="alert success" role="status">{message}</div>}
      {!classes.length && <div className="alert error">The administrator must assign at least one Grade and Section to this teacher account.</div>}

      {phase === "play" && currentQuestion ? (
        <section className={`game-zone-tv-stage ${cameraStageActive ? "is-camera-math-session is-camera-session" : ""}`}>
          <header>
            <div><span>{selectedActivity.label} · {selectedActivity.subject}</span><h1>{selectedActivity.title}</h1></div>
            <div className="game-zone-tv-player"><ProfileAvatar uid={selectedLearner.uid} name={selectedLearner.name} size={54} decorative /><span><small>NOW PLAYING</small><strong>{selectedLearner.name}</strong></span></div>
            <div className="game-zone-tv-controls">
              <button type="button" className={classroomSoundReady ? "is-sound-on" : ""} onClick={toggleClassroomSound}>{classroomSoundReady ? <Volume2 size={20} /> : <VolumeX size={20} />} {classroomSoundReady ? "Sound loud" : "Turn on sound"}</button>
              <button type="button" onClick={() => void (tvMode ? exitTvMode() : enterTvMode())}>{tvMode ? <X size={20} /> : <Expand size={20} />} {tvMode ? "Exit TV" : "TV mode"}</button>
            </div>
          </header>
          <div className="game-zone-tv-progress"><span style={{ width: `${((questionIndex + 1) / selectedActivity.questions.length) * 100}%` }} /><strong>Question {questionIndex + 1} of {selectedActivity.questions.length}</strong></div>
          <main>
            <div className="game-zone-tv-question">
              <span>{cameraStageActive ? selectedCameraMeta.playInstruction || "Use the camera to answer" : currentQuestion.type === "manual" ? currentQuestion.manualLabel : "Choose the best answer"}</span>
              {!cameraReadingActive && <h2>{currentQuestion.readingText || currentQuestion.prompt}</h2>}
              {currentQuestion.description && <p>{currentQuestion.description}</p>}
            </div>

            {cameraStageActive && <TvAnswerFeedback feedback={feedback} busy={busy} finalQuestion={questionIndex === selectedActivity.questions.length - 1} onNext={() => void nextQuestion()} />}
            {cameraChoiceActive && <div className="game-zone-camera-math-board">
              <div className="game-zone-camera-math-note"><MonitorPlay size={20} /><div><strong>Live {selectedCameraMeta.label}</strong><span>{selectedCameraMeta.playInstruction} Camera video stays on this device.</span></div></div>
              <CameraMathStage
                choices={currentQuestion.choices || []}
                questionKey={`${activeSession.id}-${currentQuestion.id}-${questionIndex}`}
                onDrop={(answer, metadata) => {
                  const answerIndex = currentQuestion.choices.findIndex((choice) => String(choice) === String(answer));
                  void recordAnswer(answerIndex, metadata);
                }}
                disabled={Boolean(feedback) || busy}
                autoStart
                itemNoun={selectedCameraMeta.itemNoun}
                dropTitle={selectedCameraMeta.dropTitle}
                dropInstruction={selectedCameraMeta.dropInstruction}
                stageLabel={`${selectedCameraMeta.label} live camera board`}
              />
            </div>}
            {cameraSequenceActive && <div className="game-zone-camera-math-board"><div className="game-zone-camera-math-note"><MonitorPlay size={20} /><div><strong>Live {selectedCameraMeta.label}</strong><span>{selectedCameraMeta.playInstruction} Camera video stays on this device.</span></div></div><CameraSequenceStage choices={currentQuestion.choices || []} questionKey={`${activeSession.id}-${currentQuestion.id}-${questionIndex}`} separator={selectedCameraMeta.sequenceSeparator} itemNoun={selectedCameraMeta.itemNoun} onComplete={(answer, metadata) => void recordAnswer(answer, metadata)} disabled={Boolean(feedback) || busy} autoStart /></div>}
            {cameraReadingActive && <div className="game-zone-camera-math-board"><div className="game-zone-camera-math-note"><MonitorPlay size={20} /><div><strong>Live Camera Reading</strong><span>Read aloud naturally. Voice is checked in the browser and camera video stays on this device.</span></div></div><CameraReadingStage question={{ ...currentQuestion, answer: currentQuestion.correctAnswer || currentQuestion.readingText }} language="english" onCorrect={(answer, metadata) => void recordAnswer(answer, { ...metadata, forceCorrect: true })} onSkip={() => void recordAnswer("teacher-wrong", { input: "camera-reading", interaction: "reading-needs-practice" })} onModel={() => speak(currentQuestion.readingText)} beforeListen={stopSpeaking} disabled={Boolean(feedback) || busy} autoStart /></div>}
            {currentQuestion.type === "choice" && !cameraChoiceActive && <div className="game-zone-tv-choices">{currentQuestion.choices.map((choice, index) => <button type="button" className={draftAnswer !== "" && Number(draftAnswer) === index ? "is-selected" : ""} disabled={Boolean(feedback)} onClick={() => setDraftAnswer(index)} key={`${choice}-${index}`}><span>{String.fromCharCode(65 + index)}</span><strong>{choice}</strong></button>)}</div>}
            {currentQuestion.type === "multiple" && <div className="game-zone-tv-choices is-multiple">{currentQuestion.choices.map((choice, index) => <button type="button" className={Array.isArray(draftAnswer) && draftAnswer.includes(index) ? "is-selected" : ""} disabled={Boolean(feedback)} onClick={() => toggleMultipleAnswer(index)} key={`${choice}-${index}`}><span>{Array.isArray(draftAnswer) && draftAnswer.includes(index) ? <Check size={22} /> : String.fromCharCode(65 + index)}</span><strong>{choice}</strong></button>)}</div>}
            {currentQuestion.type === "text" && !cameraSequenceActive && <label className="game-zone-tv-text-answer"><span>Student answer</span><input autoFocus value={draftAnswer} disabled={Boolean(feedback)} onChange={(event) => setDraftAnswer(event.target.value)} placeholder="Type the learner’s answer" /></label>}
            {currentQuestion.type === "manual" && !cameraReadingActive && !feedback && <div className="game-zone-manual-check"><button type="button" className="is-correct" disabled={busy} onClick={() => void recordAnswer("teacher-correct")}><CheckCircle2 size={30} /> Correct / Read well</button><button type="button" className="is-wrong" disabled={busy} onClick={() => void recordAnswer("teacher-wrong")}><XCircle size={30} /> Needs more practice</button></div>}

            {!cameraStageActive && (feedback
              ? <TvAnswerFeedback feedback={feedback} busy={busy} finalQuestion={questionIndex === selectedActivity.questions.length - 1} onNext={() => void nextQuestion()} />
              : currentQuestion.type !== "manual" && <button type="button" className="game-zone-check-answer" onClick={() => void recordAnswer()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={21} /> : <Target size={21} />} Check and record answer</button>)}
          </main>
          <footer><span><CheckCircle2 size={18} /> {Object.values(responses).filter((item) => item.correct).length} correct</span><span><XCircle size={18} /> {Object.values(responses).filter((item) => !item.correct).length} wrong</span><span><FolderOpen size={18} /> Answers save to {selectedLearner.name}’s record</span></footer>
        </section>
      ) : phase === "result" ? (
        <section className="game-zone-result">
          <div className="game-zone-result-trophy"><Trophy size={64} /></div>
          <span>SESSION SAVED</span><h1>Great classroom play, {selectedLearner?.name}!</h1><p>The complete answer record is now stored in Student Play Records.</p>
          <div><article><strong>{result?.correctCount || 0}</strong><span>Correct</span></article><article><strong>{result?.wrongCount || 0}</strong><span>Wrong</span></article><article><strong>{result?.accuracyPercent || 0}%</strong><span>Accuracy</span></article></div>
          <footer><button type="button" onClick={resetRound}><Gamepad2 size={18} /> Play another game</button><button type="button" onClick={() => { setPhase("setup"); setPageView("records"); void exitTvMode(); }}><FolderOpen size={18} /> View saved record</button></footer>
        </section>
      ) : pageView === "records" ? (
        <section className="game-zone-records">
          <div className="game-zone-record-metrics"><article><FolderOpen /><div><strong>{completedCount}</strong><span>Completed sessions</span></div></article><article><Target /><div><strong>{averageAccuracy}%</strong><span>Average accuracy</span></div></article><article><Users /><div><strong>{new Set(records.map((record) => record.learnerId)).size}</strong><span>Learners recorded</span></div></article></div>
          <div className="panel game-zone-record-panel">
            <header><div><FolderOpen size={22} /><span><h2>Student play record folders</h2><p>Correct and wrong answers from TV Game Zone sessions</p></span></div><label><Search size={17} /><input value={recordSearch} onChange={(event) => setRecordSearch(event.target.value)} placeholder="Search learner or game…" /></label></header>
            {loading ? <div className="game-zone-empty"><LoaderCircle className="spin" /> Loading play records…</div> : filteredRecords.length ? <div className="game-zone-record-grid">{filteredRecords.map((record) => <button type="button" onClick={() => setRecordDetail(record)} key={record.id}><span className={`is-${activityTone(record)}`}><FolderOpen size={22} /></span><div><strong>{record.learnerName}</strong><small>{record.contentTitle}</small><em>{record.grade} · {record.section} · {formatDateTime(record.completedAt || record.startedAt)}</em></div><b>{record.accuracyPercent || 0}%</b></button>)}</div> : <div className="game-zone-empty"><FolderOpen /> No Game Zone sessions have been recorded for this section.</div>}
          </div>
        </section>
      ) : (
        <>
          <section className="game-zone-launch-guide" aria-label="Teacher Game Zone launch steps">
            <header><div><MonitorPlay size={24} /><span><strong>Classroom launch checklist</strong><small>Complete these four choices, then start the activity on your TV.</small></span></div><button type="button" className={classroomSoundReady ? "is-ready" : ""} onClick={toggleClassroomSound}>{classroomSoundReady ? <Volume2 size={19} /> : <VolumeX size={19} />}<span><strong>{classroomSoundReady ? "Classroom sound is loud" : "Turn on classroom sound"}</strong><small>{classroomSoundReady ? "Music and answer effects are ready" : "Recommended before starting"}</small></span></button></header>
            <div>
              <article className={selectedClass ? "is-complete" : "is-current"}><b>1</b><span><strong>Class</strong><small>{selectedClass?.label || "Choose Grade and Section"}</small></span><CheckCircle2 size={18} /></article>
              <article className={selectedActivity ? "is-complete" : "is-current"}><b>2</b><span><strong>Activity</strong><small>{selectedActivity?.title || "Choose your published game"}</small></span><CheckCircle2 size={18} /></article>
              <article className={selectedLearner ? "is-complete" : "is-current"}><b>3</b><span><strong>Learner</strong><small>{selectedLearner?.name || "Choose who will play"}</small></span><CheckCircle2 size={18} /></article>
              <article className={selectedClass && selectedActivity && selectedLearner && classroomSoundReady ? "is-complete" : "is-current"}><b>4</b><span><strong>TV ready</strong><small>{classroomSoundReady ? "Sound, record, and TV controls ready" : "Check sound before starting"}</small></span><MonitorPlay size={18} /></article>
            </div>
          </section>

          <section className="game-zone-class-strip"><div><GraduationCap size={20} /><span><strong>1. Choose the class shown on the TV</strong><small>Only your administrator-assigned sections are available</small></span></div><div>{classes.map((item) => <button type="button" className={selectedClass?.key === item.key ? "is-active" : ""} key={item.key} onClick={() => setSelectedClassKey(item.key)}><strong>{item.section}</strong><small>{item.grade}</small></button>)}</div></section>

          <div className="game-zone-setup-grid">
            <section className="panel game-zone-catalog">
              <header><div><Gamepad2 size={23} /><span><h2>2. Choose a published activity</h2><p>Newly published games appear here automatically</p></span></div><Link to="/teacher/content-studio"><CirclePlus size={17} /> Publish a game</Link></header>
              <nav>{CATEGORIES.map((item) => { const Icon = item.icon; const count = activities.filter(item.matches).length; return <button type="button" className={category === item.id ? "is-active" : ""} onClick={() => setCategory(item.id)} key={item.id}><Icon size={17} /> {item.label}<span>{count}</span></button>; })}</nav>
              {loading ? <div className="game-zone-empty"><LoaderCircle className="spin" /> Loading your published activities…</div> : categoryActivities.length ? <div className="game-zone-activity-grid">{categoryActivities.map((activity) => <button type="button" className={`is-${activityTone(activity)} ${selectedActivity?.key === activity.key ? "is-selected" : ""}`} onClick={() => setSelectedActivityKey(activity.key)} key={activity.key}><span>{activity.type === "quiz" ? <FileQuestion /> : activity.type.startsWith("camera-") ? <MonitorPlay /> : <Gamepad2 />}</span><div><small>{activity.label} · {activity.subject}</small><strong>{activity.title}</strong><em>{activity.questions.length} playable items</em></div>{selectedActivity?.key === activity.key && <CheckCircle2 className="game-zone-selected-check" />}</button>)}</div> : <div className="game-zone-empty"><Gamepad2 /><strong>No published {categoryMeta.label.toLowerCase()} for {selectedClass?.label}.</strong><p>Publish one from your teacher content workspace and it will appear here automatically.</p><Link to={category === "quiz" ? "/teacher/quizzes/new" : category === "camera" ? "/teacher/camera-content" : "/teacher/content-studio"}>Create activity</Link></div>}
            </section>

            <aside className="panel game-zone-player-picker">
              <header><div><UserRound size={22} /><span><h2>3. Choose who will play</h2><p>Select a learner before starting</p></span></div><button type="button" onClick={() => setShowAddLearner((current) => !current)}><CirclePlus size={17} /> Add learner</button></header>
              {showAddLearner && <form onSubmit={addLearner} className="game-zone-add-learner"><strong>Add a shared-device learner</strong><p>Use this for a pupil without a personal LMS account. The administrator will see the record.</p><label>Complete name<input autoFocus value={newLearnerName} onChange={(event) => setNewLearnerName(event.target.value)} placeholder="Example: Juan Dela Cruz" maxLength={120} /></label><label>Learner number (optional)<input value={newLearnerNumber} onChange={(event) => setNewLearnerNumber(event.target.value)} placeholder="School learner number" maxLength={40} /></label><div><button type="button" onClick={() => setShowAddLearner(false)}>Cancel</button><button type="submit" disabled={busy}>{busy ? "Adding…" : "Add to section"}</button></div></form>}
              <label className="game-zone-learner-search"><Search size={16} /><input value={learnerSearch} onChange={(event) => setLearnerSearch(event.target.value)} placeholder="Search learner…" /></label>
              <div className="game-zone-learner-list">{classLearners.filter((learner) => !learnerQuery || [learner.name, learner.email, learner.learnerNumber].filter(Boolean).some((value) => String(value).toLowerCase().includes(learnerQuery))).map((learner) => <button type="button" className={selectedLearner?.uid === learner.uid ? "is-selected" : ""} onClick={() => setSelectedLearnerId(learner.uid)} key={learner.uid}><ProfileAvatar uid={learner.uid} name={learner.name} photoDataUrl={learner.photoDataUrl} size={42} decorative /><span><strong>{learner.name}</strong><small>{learner.source === "shared-device" ? "Shared-device learner" : learner.email || "Registered learner"}</small></span>{selectedLearner?.uid === learner.uid && <Check size={19} />}</button>)}</div>
              {!classLearners.length && <div className="game-zone-empty is-small"><Users /> No learners are listed in this section yet.</div>}
              <div className="game-zone-start-summary"><span><small>ACTIVITY</small><strong>{selectedActivity?.title || "Choose a game"}</strong></span><span><small>PLAYER</small><strong>{selectedLearner?.name || "Choose a learner"}</strong></span><span><small>SOUND</small><strong className={classroomSoundReady ? "is-ready" : ""}>{classroomSoundReady ? "Loud and ready" : "Will turn on at start"}</strong></span></div>
              <button type="button" className="game-zone-start-button" onClick={() => void startGame()} disabled={busy || !selectedActivity || !selectedLearner}><MonitorPlay size={21} /> {busy ? "Preparing TV Game…" : "Start TV Game"} <ArrowRight size={20} /></button>
              <p className="game-zone-save-note"><FolderOpen size={15} /> Every answer will be saved to the selected learner’s Game Zone folder.</p>
            </aside>
          </div>
        </>
      )}

      {recordDetail && <div className="game-zone-record-modal" role="dialog" aria-modal="true" aria-label="Student play record">
        <button type="button" className="game-zone-record-backdrop" onClick={() => setRecordDetail(null)} aria-label="Close record" />
        <article><header><div><FolderOpen size={24} /><span><small>STUDENT PLAY RECORD</small><h2>{recordDetail.learnerName}</h2><p>{recordDetail.contentTitle} · {formatDateTime(recordDetail.completedAt || recordDetail.startedAt)}</p></span></div><button type="button" onClick={() => setRecordDetail(null)} aria-label="Close"><X /></button></header><div className="game-zone-record-summary"><span><strong>{recordDetail.correctCount || 0}</strong><small>Correct</small></span><span><strong>{recordDetail.wrongCount || 0}</strong><small>Wrong</small></span><span><strong>{recordDetail.accuracyPercent || 0}%</strong><small>Accuracy</small></span></div><div className="game-zone-response-list">{responseValues(recordDetail).map((response) => <section className={response.correct ? "is-correct" : "is-wrong"} key={response.questionId}><span>{response.correct ? <CheckCircle2 /> : <XCircle />}</span><div><small>Item {response.itemNumber}</small><strong>{response.prompt}</strong><p>Student answer: {response.answer || "No answer"}</p>{!response.correct && <p>Correct answer: {response.correctAnswer || "Teacher observation"}</p>}</div></section>)}</div></article>
      </div>}
    </div>
  );
}
