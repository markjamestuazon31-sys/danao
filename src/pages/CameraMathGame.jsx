import {
  ArrowLeft,
  Award,
  BookOpenCheck,
  Calculator,
  Camera,
  CheckCircle2,
  Gamepad2,
  GraduationCap,
  Hand,
  LoaderCircle,
  Lock,
  Mic,
  Music2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Volume2,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import CameraMathStage from "../components/student/CameraMathStage";
import CameraReadingStage from "../components/student/CameraReadingStage";
import VoiceSettings from "../components/student/VoiceSettings";
import { useAuth } from "../context/AuthContext";
import { useLearningPreferences } from "../context/LearningPreferencesContext";
import { getGradeExperience, normalizeGradeLevel, systemCatalogForGrade } from "../data/gradeExperience";
import { normalizeProgress, subscribeUserProgress } from "../services/dataService";
import { recordSystemGameResult } from "../services/realtimeProgressService";
import {
  cameraProgramQuestions,
  getPublishedCameraProgramsForStudent,
} from "../services/cameraContentService";
import { calculateStars, getLearningWeek } from "../utils/gameEngine";

const ITEMS_PER_LEVEL = 10;
const TOTAL_LEVELS = 10;
const PASS_COUNT = 7;

function normalizeActivity(value) {
  if (value === "english") return value;
  return "math";
}

function activityDetails(activity) {
  if (activity === "english") {
    return {
      title: "English Camera Reading",
      shortTitle: "English Reading",
      subject: "English",
      reading: true,
      language: "english",
      route: "english",
      description: "Read grade-level English passages aloud and build pronunciation, fluency, confidence, vocabulary, and expression.",
    };
  }
  return {
    title: "Weekly Camera Math Mission",
    shortTitle: "Camera Math",
    subject: "Mathematics",
    reading: false,
    language: "english",
    route: "math",
    description: "Grab a floating number with a simple pinch, move it into the answer box, and open your hand to drop it. Every week brings a new 10-item mission.",
  };
}

function gradeScope(grade, activity) {
  if (activity === "english") {
    const scopes = {
      "Grade 3": "short sentences, familiar words, phrasing, and expression",
      "Grade 4": "longer sentences, punctuation, vocabulary, and smooth reading",
      "Grade 5": "academic vocabulary, complex sentences, and expressive fluency",
      "Grade 6": "critical-reading language, formal tone, accuracy, and confident delivery",
    };
    return scopes[grade] || scopes["Grade 3"];
  }
  const scopes = {
    "Grade 3": "addition, subtraction, multiplication, and guided word problems",
    "Grade 4": "multi-digit operations, multiplication, division, and multi-step problems",
    "Grade 5": "decimals, fractions, computation, money, and problem solving",
    "Grade 6": "decimals, percent, ratios, money, and multi-step reasoning",
  };
  return scopes[grade] || scopes["Grade 3"];
}

function ScoreStars({ count }) {
  return (
    <span className="camera-math-stars" aria-label={`${count} of 3 stars`}>
      {[1, 2, 3].map((star) => <Star key={star} size={24} fill={star <= count ? "currentColor" : "none"} />)}
    </span>
  );
}

export default function CameraMathGame({ initialActivity = "math" }) {
  const { user, profile } = useAuth();
  const { speak, stopSpeaking, playSound, beginMusic, musicEnabled, soundEnabled } = useLearningPreferences();
  const grade = normalizeGradeLevel(profile?.gradeLevel) || "Grade 3";
  const experience = getGradeExperience(grade);
  const normalizedInitialActivity = normalizeActivity(initialActivity);
  const [activity, setActivity] = useState(normalizedInitialActivity);
  const [phase, setPhase] = useState("intro");
  const [mode, setMode] = useState(normalizedInitialActivity === "math" ? "camera-drag" : "camera-reading");
  const [level, setLevel] = useState(1);
  const [progress, setProgress] = useState(() => normalizeProgress({}));
  const [teacherPrograms, setTeacherPrograms] = useState([]);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [programsError, setProgramsError] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [stageKey, setStageKey] = useState(0);
  const lockedRef = useRef(false);
  const finishedRef = useRef(false);
  const nextTimerRef = useRef(null);
  const stopMusicRef = useRef(() => {});
  const learningWeek = useMemo(() => getLearningWeek(), []);

  const details = activityDetails(activity);
  const game = useMemo(() => {
    const catalog = systemCatalogForGrade(grade);
    if (activity === "english") return catalog.find((item) => item.id.startsWith("camera-reading-english-"));
    return catalog.find((item) => item.id.startsWith("camera-math-"));
  }, [activity, grade]);
  const gameProgress = progress.game?.[game?.id] || {};
  const weeklyMission = gameProgress.weeklyMissions?.[learningWeek.key] || null;
  const maxUnlockedLevel = Math.max(1, Math.min(TOTAL_LEVELS, Number(gameProgress.maxUnlockedLevel || 1)));
  const certificateEligible = Boolean(gameProgress.certificateEligible);
  const currentProgram = useMemo(() => teacherPrograms.find((program) =>
    program.track === activity && Number(program.level) === Number(level),
  ) || null, [activity, level, teacherPrograms]);
  const currentProgramAvailable = Boolean(currentProgram
    && (activity !== "math" || currentProgram.weekKey === learningWeek.key));
  const questions = useMemo(
    () => currentProgramAvailable ? cameraProgramQuestions(currentProgram) : [],
    [currentProgram, currentProgramAvailable],
  );
  const question = questions[questionIndex];

  useEffect(() => {
    if (!user?.uid) return undefined;
    return subscribeUserProgress(user.uid, setProgress, (error) => {
      console.warn("Unable to load camera-learning level progress:", error);
    });
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.uid || !profile?.classKey) {
      setTeacherPrograms([]);
      setProgramsLoading(false);
      return undefined;
    }
    setProgramsLoading(true);
    setProgramsError("");
    getPublishedCameraProgramsForStudent(profile)
      .then((programs) => { if (!cancelled) setTeacherPrograms(programs); })
      .catch((error) => {
        if (cancelled) return;
        setTeacherPrograms([]);
        setProgramsError(error.message || "Teacher camera content could not be loaded.");
      })
      .finally(() => { if (!cancelled) setProgramsLoading(false); });
    return () => { cancelled = true; };
  }, [profile, user?.uid]);

  useEffect(() => {
    setActivity(normalizedInitialActivity);
    setMode(normalizedInitialActivity === "math" ? "camera-drag" : "camera-reading");
    setLevel(1);
    setPhase("intro");
  }, [normalizedInitialActivity]);

  const finishGame = useCallback(async (finalScore, finalCorrect) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    lockedRef.current = true;
    stopMusicRef.current?.();
    stopSpeaking();
    const stars = calculateStars(finalScore, questions.length * 150);
    const passed = finalCorrect >= PASS_COUNT;
    const previewXp = passed ? experience.gameXp + stars * 15 + Math.min(50, level * 5) : 0;
    setResult({ score: finalScore, correct: finalCorrect, total: questions.length, stars, xp: previewXp, passed, level, nextLevel: level });
    setPhase("complete");
    setSaving(true);
    setSaveMessage(passed ? `Saving Level ${level} completion…` : `Saving your Level ${level} practice result…`);
    playSound(passed ? stars >= 2 ? "achievement" : "level" : "wrong");
    try {
      const saved = await recordSystemGameResult(game, {
        score: finalScore,
        correctAnswers: finalCorrect,
        totalQuestions: questions.length,
        cameraWin: mode.startsWith("camera") && finalCorrect > 0,
        difficulty: Math.min(3, Math.ceil(level / 4)),
        level,
        mode,
        ...(activity === "math" ? { weekKey: learningWeek.key } : {}),
      });
      setResult({
        score: saved.score,
        correct: saved.correct,
        total: saved.total,
        stars: saved.stars,
        xp: saved.xpAwarded,
        passed: saved.passed,
        level: saved.level,
        nextLevel: saved.nextLevel,
        maxUnlockedLevel: saved.maxUnlockedLevel,
        certificateEligible: saved.certificateEligible,
        weeklyMissionCompleted: saved.weeklyMissionCompleted,
      });
      if (activity === "math" && saved.weeklyMissionCompleted) {
        const nextStep = saved.passed
          ? saved.certificateEligible
            ? "Your Level 10 certificate is also ready."
            : `Level ${saved.nextLevel} is unlocked.`
          : `Practice Level ${level} again to reach ${PASS_COUNT} correct answers.`;
        setSaveMessage(`Weekly mission saved. ${nextStep}`);
        speak(`Great work! You finished your math mission this week. A new math mission will be ready next week. ${nextStep}`);
      } else if (!saved.passed) {
        setSaveMessage(`Result saved. Score at least ${PASS_COUNT}/${ITEMS_PER_LEVEL} to unlock Level ${Math.min(TOTAL_LEVELS, level + 1)}.`);
        speak(`Level ${level} practice complete. You answered ${saved.correct} out of ${saved.total}. Try again and reach seven correct answers to unlock the next level.`);
      } else if (saved.certificateEligible) {
        setSaveMessage("Level 10 passed! Your Jidanao certificate is now unlocked.");
        speak("Congratulations! Level ten is complete and your Jidanao certificate is ready.");
      } else {
        setSaveMessage(saved.xpAwarded > 0
          ? `Level ${level} passed! Level ${saved.nextLevel} is unlocked and you earned ${saved.xpAwarded} XP.`
          : `Level ${level} passed! Level ${saved.nextLevel} remains unlocked.`);
        speak(`Level ${level} passed. Level ${saved.nextLevel} is now unlocked.`);
      }
    } catch (error) {
      console.error("Camera learning result save failed:", error);
      setSaveMessage(error.message || "The level finished, but the result could not be saved.");
    } finally {
      setSaving(false);
    }
  }, [activity, experience.gameXp, game, learningWeek.key, level, mode, playSound, questions.length, speak, stopSpeaking]);

  const moveToNextStage = useCallback((nextScore, nextCorrect, delay = 1150) => {
    nextTimerRef.current = window.setTimeout(() => {
      if (questionIndex >= questions.length - 1) {
        finishGame(nextScore, nextCorrect);
      } else {
        setQuestionIndex((value) => value + 1);
        setStageKey((value) => value + 1);
        lockedRef.current = false;
        setFeedback(null);
        lockedRef.current = false;
      }
    }, delay);
  }, [finishGame, questionIndex, questions.length]);

  const submitAnswer = useCallback((selectedValue, metadata = {}) => {
    if (phase !== "playing" || !question || lockedRef.current) return;
    lockedRef.current = true;
    const correct = metadata.forceCorrect || String(selectedValue).trim().toLowerCase() === String(question.answer).trim().toLowerCase();
    if (correct) {
      const nextStreak = streak + 1;
      const accuracyBonus = metadata.accuracy ? Math.round(metadata.accuracy / 10) : 0;
      const points = 100 + Math.min(50, nextStreak * 5) + Math.min(50, level * 5) + accuracyBonus;
      const nextScore = score + points;
      const nextCorrect = correctCount + 1;
      setScore(nextScore);
      setCorrectCount(nextCorrect);
      setStreak(nextStreak);
      setFeedback({
        type: "correct",
        title: details.reading ? "Reading recognized!" : "Correct!",
        text: details.reading && metadata.accuracy
          ? `${metadata.accuracy}% speech match. ${question.explanation}`
          : question.explanation,
        points,
      });
      playSound(nextStreak > 0 && nextStreak % 3 === 0 ? "streak" : "correct");
      speak(details.reading
        ? "Great reading. Moving to the next passage."
        : `Correct. ${question.explanation}`);
      moveToNextStage(nextScore, nextCorrect);
      return;
    }

    setStreak(0);
    setFeedback({
      type: "wrong",
      title: "Keep practicing",
      text: details.reading
        ? "This practice was recorded. Continue to the next passage."
        : "That answer is not correct. Review the explanation and continue to the next item.",
    });
    playSound("wrong");
    speak(details.reading ? "Continue to the next reading passage." : `The correct answer is ${question.answer}. ${question.explanation}`);
    moveToNextStage(score, correctCount, 1250);
  }, [correctCount, details.reading, level, moveToNextStage, phase, playSound, question, score, speak, streak]);

  const skipReadingStage = useCallback(() => {
    if (phase !== "playing" || lockedRef.current) return;
    lockedRef.current = true;
    setStreak(0);
    setFeedback({
      type: "wrong",
      title: "Saved for more practice",
      text: "No points were removed. Continue to the next passage.",
    });
    moveToNextStage(score, correctCount, 1100);
  }, [correctCount, moveToNextStage, phase, score]);

  function chooseActivity(nextActivity) {
    const normalized = normalizeActivity(nextActivity);
    const nextGame = systemCatalogForGrade(grade).find((item) => item.certificateTrack === normalized);
    const unlocked = Math.max(1, Math.min(TOTAL_LEVELS, Number(progress.game?.[nextGame?.id]?.maxUnlockedLevel || 1)));
    setActivity(normalized);
    setMode(normalized === "math" ? "camera-drag" : "camera-reading");
    const availableLevels = teacherPrograms
      .filter((program) => program.track === normalized && (normalized !== "math" || program.weekKey === learningWeek.key))
      .map((program) => Number(program.level))
      .filter((programLevel) => programLevel <= unlocked)
      .sort((left, right) => right - left);
    setLevel(availableLevels[0] || 1);
    setFeedback(null);
    playSound("button");
  }

  function startGame(requestedLevel = level) {
    const availableLevel = Math.max(maxUnlockedLevel, Number(result?.maxUnlockedLevel || 1));
    const targetLevel = Math.max(1, Math.min(availableLevel, Number(requestedLevel) || 1));
    const targetProgram = teacherPrograms.find((program) => program.track === activity && Number(program.level) === targetLevel);
    const programIsAvailable = Boolean(targetProgram && (activity !== "math" || targetProgram.weekKey === learningWeek.key));
    const targetQuestions = programIsAvailable ? cameraProgramQuestions(targetProgram) : [];
    if (targetQuestions.length !== ITEMS_PER_LEVEL) {
      setProgramsError(activity === "math"
        ? `Your teacher has not published this week’s 10-item Math Level ${targetLevel} mission for ${grade} · ${profile?.section || "your section"}.`
        : `Your teacher has not published the 10-item English Reading Level ${targetLevel} for ${grade} · ${profile?.section || "your section"}.`);
      setPhase("intro");
      return;
    }
    if (nextTimerRef.current) window.clearTimeout(nextTimerRef.current);
    finishedRef.current = false;
    lockedRef.current = false;
    setLevel(targetLevel);
    setQuestionIndex(0);
    setScore(0);
    setCorrectCount(0);
    setStreak(0);
    setFeedback(null);
    setResult(null);
    setSaveMessage("");
    setStageKey((value) => value + 1);
    setPhase("playing");
    playSound("start");
    stopMusicRef.current?.();
    stopMusicRef.current = beginMusic(activity === "english" ? "reading" : "math");
    const first = targetQuestions[0];
    window.setTimeout(() => speak(details.reading
      ? `${details.shortTitle}, level ${targetLevel}, item one. ${first.explanation}`
      : `Math level ${targetLevel}, item one. ${first.prompt}`), 350);
  }

  function returnToIntro() {
    if (nextTimerRef.current) window.clearTimeout(nextTimerRef.current);
    stopMusicRef.current?.();
    stopSpeaking();
    lockedRef.current = false;
    finishedRef.current = false;
    setFeedback(null);
    setPhase("intro");
  }

  useEffect(() => () => {
    if (nextTimerRef.current) window.clearTimeout(nextTimerRef.current);
    stopMusicRef.current?.();
    stopSpeaking();
  }, [stopSpeaking]);

  if (phase === "intro") {
    return (
      <div className={`camera-math-page ${details.reading ? "is-reading" : ""} is-${activity}`}>
        <Link className="student-back-link" to="/student/games"><ArrowLeft size={17} /> Back to learning games</Link>
        <section className="camera-math-intro">
          <div className="camera-math-intro__copy">
            <span className="camera-math-kicker">{details.reading ? <Mic size={16} /> : <Hand size={16} />} JIDANAO CAMERA LEARNING LAB</span>
            <h1>{details.title}</h1>
            <p>{details.description}</p>
            <div className="camera-math-grade-scope">
              <span>{grade}</span>
              <div><strong>{experience.title} · Teacher-managed 10-level path</strong><small>{currentProgramAvailable ? `${currentProgram.teacherName || "Your teacher"} assigned: ${currentProgram.competency || currentProgram.title}.` : `Focused on ${gradeScope(grade, activity)}.`}</small></div>
            </div>
            <div className="camera-math-path-summary">
              <span><strong>10</strong> levels</span><span><strong>10</strong> items each</span><span><strong>70%</strong> to pass</span><span><GraduationCap size={20} /><strong>Certificate</strong> at Level 10</span>
            </div>
            {activity === "math" && (
              <div className={`camera-weekly-mission ${weeklyMission?.completed ? "is-complete" : ""}`}>
                <div>{weeklyMission?.completed ? <CheckCircle2 size={25} /> : <Sparkles size={25} />}</div>
                <span>
                  <strong>{weeklyMission?.completed ? "This week’s math mission is finished" : "This week’s math mission"}</strong>
                  <small>{learningWeek.label} · {weeklyMission?.completed ? `${weeklyMission.correct}/${weeklyMission.total} correct saved` : `Level ${level} · ${ITEMS_PER_LEVEL} new items`}</small>
                </span>
              </div>
            )}
            <div className={`camera-teacher-content-status ${currentProgramAvailable ? "is-ready" : "is-waiting"}`}>
              {currentProgramAvailable ? <CheckCircle2 size={21} /> : programsLoading ? <LoaderCircle size={21} className="spin" /> : <BookOpenCheck size={21} />}
              <div><strong>{currentProgramAvailable ? `Level ${level} is ready from your teacher` : programsLoading ? "Checking your teacher’s content…" : `Level ${level} is waiting for teacher content`}</strong><span>{currentProgramAvailable ? `${currentProgram.title} · exactly ${currentProgram.questions.length} reviewed activities` : programsError || `Only content published to ${grade} · ${profile?.section || "your section"} appears here.`}</span></div>
            </div>
            <div className="camera-math-privacy-note"><ShieldCheck size={20} /><p><strong>Private by design.</strong> Camera video is processed only on this device and is never uploaded or saved by Jidanao. Reading audio is not stored in Firebase.</p></div>
          </div>

          <div className="camera-math-intro__setup">
            <div>
              <span className="camera-learning-section-label">CHOOSE A CAMERA GAME</span>
              <h2>Two grade-specific learning paths</h2>
            </div>
            <div className="camera-learning-activity-grid">
              <button type="button" className={activity === "math" ? "is-selected" : ""} onClick={() => chooseActivity("math")}>
                <Calculator size={24} /><span><strong>Camera Math</strong><small>10 items per level.</small></span>{activity === "math" && <CheckCircle2 size={18} />}
              </button>
              <button type="button" className={activity === "english" ? "is-selected" : ""} onClick={() => chooseActivity("english")}>
                <BookOpenCheck size={24} /><span><strong>English Reading</strong><small>Read aloud in English.</small></span>{activity === "english" && <CheckCircle2 size={18} />}
              </button>
            </div>

            <div className="camera-level-selector">
              <div><span className="camera-learning-section-label">SELECT LEVEL</span><strong>{certificateEligible ? "Certificate earned" : `Level ${maxUnlockedLevel} of ${TOTAL_LEVELS} unlocked`}</strong></div>
              <div className="camera-level-grid">
                {Array.from({ length: TOTAL_LEVELS }, (_, index) => index + 1).map((itemLevel) => {
                  const unlocked = itemLevel <= maxUnlockedLevel;
                  const assignedProgram = teacherPrograms.find((program) => program.track === activity && Number(program.level) === itemLevel);
                  const assigned = Boolean(assignedProgram && (activity !== "math" || assignedProgram.weekKey === learningWeek.key));
                  const completed = Boolean(gameProgress.levels?.[`level-${itemLevel}`]?.passed);
                  return (
                    <button type="button" key={itemLevel} disabled={!unlocked || !assigned} className={`${level === itemLevel ? "is-selected" : ""} ${completed ? "is-completed" : ""} ${assigned ? "has-teacher-content" : "is-awaiting-content"}`} onClick={() => setLevel(itemLevel)} title={!assigned ? "Waiting for teacher-published content" : `Open Level ${itemLevel}`}>
                      {!unlocked || !assigned ? <Lock size={14} /> : completed ? <CheckCircle2 size={15} /> : null}<span>{itemLevel}</span>
                    </button>
                  );
                })}
              </div>
              <p>Pass at least {PASS_COUNT} of {ITEMS_PER_LEVEL} teacher-approved activities to unlock the next level. A locked level may also be waiting for your teacher to publish it.</p>
            </div>

            {activity === "math" ? (
              <fieldset className="camera-learning-control-modes">
                <legend>How to answer</legend>
                <button type="button" className={mode === "camera-drag" ? "is-selected" : ""} onClick={() => setMode("camera-drag")}><Camera size={20} /><span><strong>Hand Drag</strong><small>Camera starts automatically. Pinch, drag, and release.</small></span></button>
                <button type="button" className={mode === "classic" ? "is-selected" : ""} onClick={() => setMode("classic")}><Gamepad2 size={20} /><span><strong>Tap Mode</strong><small>No camera. Tap or use the keyboard.</small></span></button>
              </fieldset>
            ) : (
              <div className="camera-reading-mode-note"><Camera size={20} /><div><strong>Camera + voice practice</strong><p>The camera starts automatically. The microphone starts only when the student presses the reading button.</p></div></div>
            )}

            {certificateEligible && <Link className="camera-certificate-ready" to={`/student/camera-certificate/${details.route}`}><GraduationCap size={21} /><span><strong>Your Level 10 certificate is ready</strong><small>Open, print, or save it as PDF.</small></span></Link>}
            <div className="student-game-audio-ready is-camera-audio"><Music2 size={21} /><div><strong>{details.reading ? "Reading soundtrack" : "Math mission soundtrack"} ready</strong><span>{musicEnabled ? "Music on" : "Music muted"} · {soundEnabled ? "Game effects on" : "Game effects muted"}. Audio begins after Start Level.</span></div></div>
            <button type="button" className="camera-math-start" onClick={() => startGame(level)} disabled={!currentProgramAvailable || programsLoading}><Zap size={19} /> {programsLoading ? "Loading teacher content…" : currentProgramAvailable ? `Start Level ${level} · ${ITEMS_PER_LEVEL} items` : "Waiting for teacher to publish this level"}</button>
            <p className="camera-math-requirement">Camera mode works best in a well-lit area using Chrome or Edge over HTTPS or localhost. Required browser permission may appear on the first play.</p>
          </div>
        </section>
      </div>
    );
  }

  if (phase === "complete") {
    return (
      <div className={`camera-math-page ${details.reading ? "is-reading" : ""} is-${activity}`}>
        <section className={`camera-math-complete ${result?.passed ? "is-passed" : "is-practice"}`}>
          <div className="camera-math-complete__icon">{result?.certificateEligible ? <GraduationCap size={52} /> : <Trophy size={50} />}</div>
          <span>{grade} · {details.shortTitle.toUpperCase()} · LEVEL {result?.level || level}</span>
          <h1>{activity === "math" && result?.weeklyMissionCompleted ? "Weekly math mission complete!" : result?.certificateEligible ? "Certificate unlocked!" : result?.passed ? "Level passed!" : "Keep practicing this level"}</h1>
          <ScoreStars count={result?.stars || 0} />
          <div className="camera-math-result-grid">
            <div><strong>{result?.score || 0}</strong><span>points</span></div>
            <div><strong>{result?.correct || 0}/{result?.total || ITEMS_PER_LEVEL}</strong><span>{details.reading ? "recognized" : "correct"}</span></div>
            <div><strong>+{result?.xp || 0}</strong><span>XP</span></div>
          </div>
          <div className={`camera-level-pass-message ${result?.passed ? "is-pass" : "is-retry"}`}>
            {result?.passed ? <CheckCircle2 size={20} /> : <RotateCcw size={20} />}
            <span>{result?.passed ? `Passed with ${result.correct}/${ITEMS_PER_LEVEL}.` : `${result?.correct || 0}/${ITEMS_PER_LEVEL}. You need ${PASS_COUNT} correct answers to pass.`}</span>
          </div>
          <p className={saveMessage.includes("could not") ? "is-error" : ""}>{saving && <LoaderCircle size={16} className="spin" />} {saveMessage}</p>
          <div className="camera-math-complete__actions">
            {result?.certificateEligible ? (
              <Link className="primary-button" to={`/student/camera-certificate/${details.route}`}><GraduationCap size={18} /> Open certificate</Link>
            ) : result?.passed && level < TOTAL_LEVELS ? (
              <button type="button" className="primary-button" onClick={() => startGame(result?.nextLevel || level + 1)}><Zap size={18} /> Start Level {result?.nextLevel || level + 1}</button>
            ) : (
              <button type="button" className="primary-button" onClick={() => startGame(level)}><RotateCcw size={18} /> Try Level {level} again</button>
            )}
            <button type="button" className="secondary-button" onClick={returnToIntro}>Choose level</button>
            <Link className="secondary-button" to="/student/games"><Gamepad2 size={18} /> More games</Link>
            <Link className="secondary-button" to="/student/progress"><Award size={18} /> View progress</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`camera-math-page camera-math-page--playing ${details.reading ? "is-reading" : ""} is-${activity}`}>
      <header className="camera-math-gamebar">
        <button type="button" onClick={returnToIntro}><ArrowLeft size={18} /> Exit game</button>
        <div className="camera-math-progress" aria-label={`Item ${questionIndex + 1} of ${questions.length}`}>
          <span style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} />
        </div>
        <strong>Level {level} · Item {questionIndex + 1}/{questions.length}</strong>
        <VoiceSettings compact />
      </header>

      <section className="camera-math-question-card">
        <div className="camera-math-question-card__meta"><span>{question?.skill}</span><b>{grade} · {profile?.section}</b><em>{activity === "math" ? "TEACHER WEEKLY MISSION" : `TEACHER LEVEL ${level}`}</em></div>
        <div className="camera-math-question-card__main">
          <button type="button" onClick={() => speak(details.reading ? question?.readingText : `${question?.prompt}. Choose from ${question?.choices.join(", ")}.`)} aria-label="Read question aloud"><Volume2 size={20} /></button>
          <div><small>{details.reading ? "READ CLEARLY" : "SOLVE THE CHALLENGE"}</small><h1>{details.reading ? details.shortTitle : question?.prompt}</h1></div>
        </div>
        <div className="camera-math-live-stats">
          <span><Sparkles size={16} /> {score} points</span>
          <span><Zap size={16} /> {streak} streak</span>
          <span><CheckCircle2 size={16} /> {correctCount}/{ITEMS_PER_LEVEL}</span>
        </div>
      </section>

      {feedback && (
        <div className={`camera-math-feedback is-${feedback.type}`} role="status">
          {feedback.type === "correct" ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
          <div><strong>{feedback.title}{feedback.points ? ` +${feedback.points} points` : ""}</strong><span>{feedback.text}</span></div>
        </div>
      )}

      {details.reading ? (
        <CameraReadingStage
          question={question}
          onCorrect={submitAnswer}
          onSkip={skipReadingStage}
          onModel={() => speak(question?.readingText)}
          beforeListen={stopSpeaking}
          language={details.language}
          disabled={Boolean(feedback)}
          autoStart
        />
      ) : mode === "camera-drag" ? (
        <CameraMathStage
          choices={question?.choices || []}
          questionKey={`${question?.id}-${stageKey}`}
          onDrop={submitAnswer}
          disabled={Boolean(feedback)}
          autoStart
        />
      ) : (
        <section className="camera-math-classic" aria-label="Classic answer choices">
          <div><Gamepad2 size={26} /><h2>Choose the correct answer</h2><p>Use Tab and Enter, or tap a number. There is no timer.</p></div>
          <div className="camera-math-classic__choices">
            {(question?.choices || []).map((choice, index) => (
              <button type="button" key={`${choice}-${index}`} onClick={() => submitAnswer(choice, { input: "tap" })} disabled={Boolean(feedback)}>
                <span>{String.fromCharCode(65 + index)}</span><strong>{choice}</strong>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
