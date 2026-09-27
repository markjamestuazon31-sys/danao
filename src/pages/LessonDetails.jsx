import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Bot,
  Check,
  CheckCircle2,
  ExternalLink,
  Gamepad2,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  MessageCircleQuestion,
  PlayCircle,
  Sparkles,
  Target,
  Trophy,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "./LessonDetailsReadable.css";
import "../styles/LessonDetailsProfessional.css";
import { Link, useParams } from "react-router-dom";
import LearningAccessState from "../components/student/LearningAccessState";
import ProfessionalDocumentViewer from "../components/ProfessionalDocumentViewer";
import VoiceSettings from "../components/student/VoiceSettings";
import { useAuth } from "../context/AuthContext";
import { getGradeExperience, subjectTone } from "../data/gradeExperience";
import { normalizeLesson, isStandaloneLine } from "../utils/lessonContent";
import { learningHref } from "../utils/studentProgress";
import { useLearningPreferences } from "../context/LearningPreferencesContext";
import { askLearningAssistant } from "../services/aiService";
import {
  normalizeProgress,
  subscribeUserProgress,
} from "../services/dataService";
import { getAuthorizedLearningContent } from "../services/learningContentService";
import {
  completeLessonActivity,
  recordLessonQuizAttempt,
  saveLessonCheckpoint,
} from "../services/realtimeProgressService";

const STEPS = [
  { id: "overview", label: "Overview", icon: BookOpenCheck, percent: 10 },
  { id: "learn", label: "Learn", icon: PlayCircle, percent: 30 },
  { id: "examples", label: "Examples", icon: Lightbulb, percent: 50 },
  { id: "practice", label: "Practice", icon: Target, percent: 70 },
  { id: "quiz", label: "Quiz", icon: ListChecks, percent: 90 },
  { id: "challenge", label: "Challenge", icon: Trophy, percent: 99 },
];

function VisualScene({ lesson }) {
  const tone = subjectTone(lesson.subject);
  return (
    <div className={`lesson-visual-scene lesson-visual-scene--${tone}`} aria-label={`${lesson.subject} animated learning visual`}>
      <div className="lesson-visual-scene__orbit lesson-visual-scene__orbit--one" />
      <div className="lesson-visual-scene__orbit lesson-visual-scene__orbit--two" />
      <span className="lesson-visual-scene__symbol"><Sparkles size={44} /></span>
      <strong>{lesson.subject || "Learning"}</strong>
      <small>{lesson.grade}</small>
    </div>
  );
}

export default function LessonDetails() {
  const { id } = useParams();
  const { user, profile } = useAuth();
  const { speak, stopSpeaking, playSound } = useLearningPreferences();
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [progress, setProgress] = useState(() => normalizeProgress({}));
  const [activeStep, setActiveStep] = useState(0);
  const [practiceAnswers, setPracticeAnswers] = useState({});
  const [practiceFeedback, setPracticeFeedback] = useState({});
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);
  const [quizSaving, setQuizSaving] = useState(false);
  const [challengeText, setChallengeText] = useState("");
  const [message, setMessage] = useState("");
  const [question, setQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [connectedGame, setConnectedGame] = useState(null);
  const [saving, setSaving] = useState(false);

  const isStudent = profile?.role === "student";
  const normalizedLesson = useMemo(() => (lesson ? normalizeLesson(lesson) : null), [lesson]);
  const experience = getGradeExperience(lesson?.grade || profile?.gradeLevel);
  const lessonProgress = progress.lesson?.[id] || {};
  const practiceQuestions = normalizedLesson?.practiceQuestions || [];
  // The connected game (when the teacher created one for this lesson) is the
  // live source of truth for the quiz. Fall back to the lesson's own quiz
  // only when there is no connected game, or the game has no questions yet.
  const quizQuestions = useMemo(() => (
    (connectedGame?.questions?.length ? connectedGame.questions : null)
    || normalizedLesson?.quizQuestions
    || normalizedLesson?.quiz
    || normalizedLesson?.questions
    || []
  ), [connectedGame, normalizedLesson]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    setLesson(null);

    getAuthorizedLearningContent({ type: "lesson", contentId: id, profile })
      .then((authorizedLesson) => {
        if (!active) return;
        setLesson(authorizedLesson);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Unable to load protected lesson:", error);
        setLoadError(error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      stopSpeaking();
    };
  }, [id, profile, stopSpeaking]);

  useEffect(() => {
    if (!isStudent || !user?.uid) return undefined;
    return subscribeUserProgress(user.uid, (value) => {
      setProgress(value);
      const storedStep = value.lesson?.[id]?.currentStep;
      const index = STEPS.findIndex((step) => step.id === storedStep);
      if (index >= 0) setActiveStep(index);
    }, () => {});
  }, [id, isStudent, user?.uid]);

  useEffect(() => {
    const explicitId = normalizedLesson?.gameId || normalizedLesson?.connectedGameId;
    if (!explicitId) { setConnectedGame(null); return undefined; }
    let active = true;
    // Load the teacher's actual, live game record (not the thin catalog
    // metadata) so the lesson always links to and quizzes from the real,
    // up-to-date questions the teacher created for this lesson's game -
    // even if the game was edited after the lesson was first saved.
    getAuthorizedLearningContent({ type: "game", contentId: explicitId, profile })
      .then((game) => { if (active) setConnectedGame(game); })
      .catch(() => { if (active) setConnectedGame(null); });
    return () => { active = false; };
  }, [normalizedLesson?.gameId, normalizedLesson?.connectedGameId, profile]);

  async function goToStep(index) {
    const safeIndex = Math.max(0, Math.min(STEPS.length - 1, index));
    setActiveStep(safeIndex);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (isStudent && user?.uid && normalizedLesson) {
      try {
        await saveLessonCheckpoint(normalizedLesson.id, STEPS[safeIndex].id);
      } catch (error) {
        console.warn("Unable to save lesson checkpoint:", error);
      }
    }
  }

  function readCurrentSection() {
    if (!normalizedLesson) return;
    const step = STEPS[activeStep].id;
    let text = `${normalizedLesson.title}. `;
    if (step === "overview") text += `${normalizedLesson.description || ""}. Learning objectives: ${normalizedLesson.objectives.join(". ")}`;
    if (step === "learn") text += normalizedLesson.discussion.join(". ");
    if (step === "examples") text += normalizedLesson.examples.join(". ");
    if (step === "practice") text += practiceQuestions.map((item) => item.prompt).join(". ");
    if (step === "quiz") text += `Quiz time. ${quizQuestions.map((item) => item.prompt).join(". ")}`;
    if (step === "challenge") text += "Explain the most important idea you learned and how you can use it.";
    if (!speak(text)) setMessage("Speech narration is not supported by this browser.");
  }

  function checkPractice(questionItem) {
    const selected = practiceAnswers[questionItem.id];
    if (!selected) return;
    const correct = String(selected) === String(questionItem.answer);
    setPracticeFeedback((current) => ({ ...current, [questionItem.id]: correct ? "correct" : "wrong" }));
    playSound(correct ? "correct" : "wrong");
    speak(correct ? `Excellent! ${questionItem.explanation}` : "Try again. Read the question and compare each choice.");
  }

  function lessonReadyForQuiz() {
    const record = progress.lesson?.[id] || {};
    return Number(record.percent || 0) >= 70;
  }

  async function submitQuiz(event) {
    event.preventDefault();

    if (!lessonReadyForQuiz()) {
      setMessage("Please finish reading the lesson before taking the quiz.");
      return;
    }
    if (!quizQuestions.length) {
      setMessage("No teacher quiz was found for this lesson. Please ask the teacher to attach the quiz before publishing.");
      return;
    }

    const answered = quizQuestions.filter((item) => quizAnswers[item.id] !== undefined && quizAnswers[item.id] !== "").length;
    if (answered < quizQuestions.length) {
      setMessage(`Answer every quiz question before submitting (${answered}/${quizQuestions.length}).`);
      return;
    }

    if (!isStudent) {
      const correct = quizQuestions.filter(
        (item) => String(quizAnswers[item.id]) === String(item.answer),
      ).length;
      const score = Math.round((correct / quizQuestions.length) * 100);
      const feedback = quizQuestions.map((item) => ({
        id: item.id,
        correct: String(quizAnswers[item.id]) === String(item.answer),
        explanation: item.explanation,
      }));
      setQuizResult({ score, correct, total: quizQuestions.length, saved: false, feedback });
      setMessage(score >= 70 ? "Preview result: quiz passed." : "Preview result: review and try again.");
      playSound(score >= 70 ? "level" : "wrong");
      return;
    }

    if (!user?.uid || !normalizedLesson) return;

    setQuizSaving(true);
    setQuizResult(null);
    setMessage("Checking and saving your answers…");
    try {
      const verified = await recordLessonQuizAttempt(normalizedLesson.id, quizAnswers);
      setQuizResult({
        score: verified.score,
        correct: verified.correct,
        total: verified.total,
        attemptId: verified.attemptId,
        saved: true,
        feedback: verified.feedback || [],
      });
      setMessage(
        verified.passed
          ? "Great work! Your quiz attempt passed and was saved."
          : "Your quiz attempt was saved. Review the lesson and try again.",
      );
      playSound(verified.passed ? "level" : "wrong");
      speak(
        verified.passed
          ? `Great work! Your score is ${verified.score} percent.`
          : `Your score is ${verified.score} percent. Review the lesson and try again.`,
      );
    } catch (error) {
      console.warn("Unable to verify quiz attempt:", error);
      setMessage(error.message || "Your quiz could not be verified. Check your connection and try again.");
    } finally {
      setQuizSaving(false);
    }
  }

  async function completeLesson() {
    if (!isStudent || !user?.uid) {
      setMessage("Teacher and administrator preview mode does not save student progress.");
      return;
    }
    if (!quizResult || quizResult.score < 70 || !quizResult.saved) {
      setMessage("Submit and pass the secure mastery quiz with at least 70% before finishing the lesson.");
      setActiveStep(4);
      return;
    }
    if (challengeText.trim().length < 12) {
      setMessage("Write a short learning reflection before completing the lesson.");
      return;
    }
    setSaving(true);
    try {
      const completion = await completeLessonActivity(
        normalizedLesson.id,
        challengeText.trim(),
      );
      setMessage(`Lesson complete! ${completion.xpAwarded} XP was added to your profile.`);
      playSound("achievement");
      speak(`Congratulations! You completed ${normalizedLesson.title} and earned ${completion.xpAwarded} experience points.`);
    } catch (error) {
      setMessage(error.message || "Unable to verify and save lesson completion.");
    } finally {
      setSaving(false);
    }
  }

  async function askAssistant(event) {
    event.preventDefault();
    setAssistantLoading(true);
    setAssistantAnswer("");
    try {
      const result = await askLearningAssistant({ lesson: normalizedLesson, question });
      const assistantResult = /** @type {{ answer?: string, data?: { answer?: string } }} */ (result || {});
      setAssistantAnswer(assistantResult.answer || assistantResult.data?.answer || "The assistant did not return an answer.");
    } catch {
      setAssistantAnswer("Review the teacher-approved discussion or ask your teacher for help with this question.");
    } finally {
      setAssistantLoading(false);
    }
  }

  if (loading && !lesson) {
    return <div className="student-state-card lesson-page-state"><LoaderCircle className="spin" size={30} /><div><strong>Opening interactive lesson…</strong><p>Preparing learning materials and saved progress.</p></div></div>;
  }
  if (!lesson || loadError) {
    return (
      <LearningAccessState
        type="lesson"
        error={loadError}
        grade={profile?.gradeLevel}
        role={profile?.role}
      />
    );
  }

  const currentStep = STEPS[activeStep];

  return (
    <div className={`student-lesson student-theme--${experience.theme}`}>
      <header className="lesson-header-v2">
        <div className="lesson-header-v2__top">
          <Link to={isStudent ? "/student/lessons" : "/library"}><ArrowLeft size={17} /> Back to lessons</Link>
          <VoiceSettings compact />
        </div>
        <div className="lesson-header-v2__main">
          <div className="lesson-header-v2__copy">
            <span>{normalizedLesson.subject} • {normalizedLesson.grade}</span>
            <h1>{normalizedLesson.title}</h1>
            <p>{normalizedLesson.description || "Teacher-approved interactive learning module."}</p>
            <div className="lesson-header-v2__meta"><span><Sparkles size={15} /> +{experience.lessonXp} XP</span>{connectedGame && <span><Target size={15} /> {connectedGame.questionLimit || connectedGame.questions?.length || "a scored"} game {connectedGame.questionLimit === 1 ? "question" : "questions"}</span>}<span><BookOpenCheck size={15} /> {experience.difficulty}</span></div>
          </div>
          <VisualScene lesson={normalizedLesson} />
        </div>
        <div className="lesson-overall-progress"><div><span>Lesson progress</span><strong>{lessonProgress.completed ? 100 : Math.max(Number(lessonProgress.percent || 0), currentStep.percent)}%</strong></div><div><span style={{ width: `${lessonProgress.completed ? 100 : Math.max(Number(lessonProgress.percent || 0), currentStep.percent)}%` }} /></div></div>
      </header>

      {message && <div className="lesson-message" role="status">{message}</div>}

      <nav className="lesson-stepper" aria-label="Lesson steps">
        {STEPS.map((step, index) => {
          const StepIcon = step.icon;
          return (
            <button type="button" key={step.id} className={`${index === activeStep ? "is-active" : ""} ${index < activeStep || lessonProgress.completed ? "is-complete" : ""}`} onClick={() => goToStep(index)}>
              <span>{index < activeStep || lessonProgress.completed ? <Check size={16} /> : <StepIcon size={16} />}</span>
              <small>{step.label}</small>
            </button>
          );
        })}
      </nav>

      <main className="lesson-workspace">
        <section className="lesson-content-panel">
          <div className="lesson-section-toolbar">
            <div><span>STEP {activeStep + 1} OF {STEPS.length}</span><h2>{currentStep.label}</h2></div>
            <button type="button" onClick={readCurrentSection}><Volume2 size={17} /> Read this section</button>
          </div>

          {currentStep.id === "overview" && (
            <div className="lesson-overview-grid">
              <article className="lesson-info-card"><span><Target size={21} /></span><div><h3>Learning objectives</h3><ul>{normalizedLesson.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul></div></article>
              <article className="lesson-info-card"><span><Sparkles size={21} /></span><div><h3>Your learning path</h3><p>Read the discussion, explore examples, practice with feedback, pass the quiz, and complete the final challenge.</p></div></article>
              {normalizedLesson.resourceUrl && <article className="lesson-resource-card"><ExternalLink size={21} /><div><h3>Approved external resource</h3><p>This link was provided by the teacher and opens in a separate tab.</p><a href={normalizedLesson.resourceUrl} target="_blank" rel="noreferrer noopener">Open resource <ArrowRight size={15} /></a></div></article>}
            </div>
          )}

          {currentStep.id === "learn" && (
            <div className="lesson-reading-flow">
              {normalizedLesson.visualUrl && <img src={normalizedLesson.visualUrl} alt={normalizedLesson.visualAlt || `${normalizedLesson.title} learning visual`} />}
              {normalizedLesson.material?.url || normalizedLesson.material?.text ? (
                <ProfessionalDocumentViewer material={normalizedLesson.material} />
              ) : normalizedLesson.resourceUrl ? (
                <article className="lesson-document-download">
                  <a
                    className="document-open-button"
                    href={normalizedLesson.resourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <ExternalLink size={18} /> Open lesson file
                  </a>
                </article>
              ) : null}

              {!normalizedLesson.material?.url && !normalizedLesson.material?.text && (
                <article className="lesson-discussion">
                  {normalizedLesson.discussion.map((paragraph, index) => (
                    <p
                      key={`${paragraph}-${index}`}
                      className={isStandaloneLine(paragraph) ? "lesson-discussion__label" : undefined}
                    >
                      {paragraph}
                    </p>
                  ))}
                </article>
              )}
              
{normalizedLesson.youtubeId && (
  <section className="lesson-video-card">
    <h3>🎥 Teacher Video Explanation</h3>
    <iframe
      width="100%"
      height="400"
      src={`https://www.youtube.com/embed/${normalizedLesson.youtubeId}`}
      title="Teacher lesson video"
      allowFullScreen
    />
  </section>
)}

              {(connectedGame || quizQuestions.length > 0) && (
                <aside className="lesson-continue-cta">
                  <div>
                    <span>FINISHED READING?</span>
                    <h3>{connectedGame ? "Put it into practice" : "Take the mastery quiz"}</h3>
                    <p>
                      {connectedGame
                        ? `Head over to "${connectedGame.title}" to practice what you just read.`
                        : "Answer the teacher's quiz questions to show what you learned."}
                    </p>
                  </div>
                  {connectedGame ? (
                    <Link className="lesson-continue-cta__button" to={learningHref(connectedGame)}>
                      <Gamepad2 size={18} /> Play the quiz game <ArrowRight size={16} />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="lesson-continue-cta__button"
                      onClick={() => goToStep(STEPS.findIndex((step) => step.id === "quiz"))}
                    >
                      <ListChecks size={18} /> Go to quiz <ArrowRight size={16} />
                    </button>
                  )}
                </aside>
              )}
            </div>
          )}

          {currentStep.id === "examples" && (
            <div className="lesson-example-list">
              {normalizedLesson.examples.map((example, index) => <article key={`${example}-${index}`}><div><Lightbulb size={22} /><p>{example}</p></div></article>)}
              {normalizedLesson.activities.length > 0 && <article className="lesson-activity-callout"><Sparkles size={24} /><div><h3>Teacher activity</h3>{normalizedLesson.activities.slice(0, 3).map((activity, index) => <p key={index}>{typeof activity === "string" ? activity : activity.description || activity.instructions || activity.title}</p>)}</div></article>}
            </div>
          )}

          {currentStep.id === "practice" && (
            <div className="lesson-practice">
              <div className="lesson-practice__intro">
                <Target size={24} />
                <div>
                  <span>GUIDED PRACTICE</span>
                  <h3>Try it with instant feedback</h3>
                  <p>These practice questions are separate from your mastery quiz, so you can learn without seeing the assessment answers first.</p>
                </div>
              </div>
              <div className="lesson-question-list">
              {practiceQuestions.map((item, index) => (
                <article className={`lesson-question-card ${practiceFeedback[item.id] ? `is-${practiceFeedback[item.id]}` : ""}`} key={item.id}>
                  <div className="lesson-question-card__number">{index + 1}</div>
                  <div><h3>{item.prompt}</h3><div className="lesson-choice-grid">{item.choices.map((choice) => <button type="button" className={practiceAnswers[item.id] === choice ? "is-selected" : ""} onClick={() => setPracticeAnswers((current) => ({ ...current, [item.id]: choice }))} key={choice}>{choice}</button>)}</div><button type="button" className="lesson-check-button" disabled={!practiceAnswers[item.id]} onClick={() => checkPractice(item)}>Check answer</button>{practiceFeedback[item.id] && <p className="lesson-question-feedback">{practiceFeedback[item.id] === "correct" ? <CheckCircle2 size={18} /> : <X size={18} />}{practiceFeedback[item.id] === "correct" ? item.explanation : "Not yet. Try another choice and use the lesson examples."}</p>}</div>
                </article>
              ))}
              </div>
            </div>
          )}

          {currentStep.id === "quiz" && quizQuestions.length === 0 && connectedGame && (
            <div className="lesson-quiz-redirect">
              <ListChecks size={28} />
              <h3>This lesson's quiz is the "{connectedGame.title}" game</h3>
              <p>Your teacher built this lesson's mastery check as a scored game. Play it to complete this step and earn your score.</p>
              <Link className="lesson-continue-cta__button" to={learningHref(connectedGame)}>
                <Gamepad2 size={18} /> Play {connectedGame.title} <ArrowRight size={16} />
              </Link>
            </div>
          )}

          {currentStep.id === "quiz" && quizQuestions.length === 0 && !connectedGame && (
            <div className="lesson-quiz-empty">
              <ListChecks size={28} />
              <h3>No quiz has been attached yet</h3>
              <p>Ask your teacher to attach a quiz or a connected game to this lesson before it is marked ready for mastery checking.</p>
            </div>
          )}

          {currentStep.id === "quiz" && quizQuestions.length > 0 && (
            <form className="lesson-quiz" onSubmit={submitQuiz}>
              <div className="lesson-quiz__intro"><ListChecks size={24} /><div><h3>{normalizedLesson?.title || "Learning Challenge"}</h3><p>Answer every question. A score of 70% shows strong mastery.</p></div></div>
              {quizQuestions.map((item, index) => (
                <fieldset key={item.id}><legend>{index + 1}. {item.prompt}</legend>{item.choices.map((choice) => <label key={choice}><input type="radio" name={item.id} checked={quizAnswers[item.id] === choice} onChange={() => { setQuizAnswers((current) => ({ ...current, [item.id]: choice })); setQuizResult(null); }} /><span>{choice}</span></label>)}{quizResult && (() => {
                  const verifiedFeedback = quizResult.feedback?.find((entry) => entry.id === item.id);
                  const isCorrect = verifiedFeedback?.correct ?? (String(quizAnswers[item.id]) === String(item.answer));
                  const explanation = verifiedFeedback?.explanation || item.explanation || (isCorrect ? "Correct." : "Review this item and try again.");
                  return <p className={isCorrect ? "is-correct" : "is-wrong"}>{isCorrect ? <CheckCircle2 size={17} /> : <X size={17} />}{explanation}</p>;
                })()}</fieldset>
              ))}
              <button className="lesson-primary-action" type="submit" disabled={quizSaving}><ListChecks size={18} /> {quizSaving ? "Saving attempt…" : quizResult ? "Check quiz again" : "Submit quiz"}</button>
              {quizResult && (
                <div className={`lesson-quiz-result ${quizResult.score >= 70 ? "is-pass" : "is-review"}`}>
                  <strong>{quizResult.score}%</strong>
                  <div>
                    <h3>{quizResult.score >= 70 ? "Quiz passed!" : "Review and try again"}</h3>
                    <p>{quizResult.correct} of {quizResult.total} answers are correct.</p>
                    <small>
                      {!isStudent
                        ? "Preview mode — this attempt is not saved."
                        : quizSaving
                          ? "Saving this attempt…"
                          : quizResult.saved
                            ? "Saved to your Realtime Database learning history."
                            : "This result must be saved before lesson completion."}
                    </small>
                  </div>
                </div>
              )}
            </form>
          )}

          {currentStep.id === "challenge" && (
            <div className="lesson-final-challenge">
              <div className="lesson-final-challenge__hero"><Trophy size={44} /><div><span>FINAL LEARNING CHALLENGE</span><h3>Explain what you learned</h3><p>Write two or more sentences about the lesson’s most important idea and how you can apply it.</p></div></div>
              <label><span>Your reflection</span><textarea rows={6} value={challengeText} onChange={(event) => setChallengeText(event.target.value)} placeholder="I learned that… I can use this when…" /><small>{challengeText.trim().length} characters</small></label>
              {connectedGame && <Link className="lesson-connected-game" to={learningHref(connectedGame)}><span><Gamepad2 size={24} /></span><div><small>CONNECTED GAME</small><strong>{connectedGame.title}</strong><p>Practice this subject through a scored challenge.</p></div><ArrowRight size={20} /></Link>}
              <button type="button" className="lesson-complete-button" disabled={saving || lessonProgress.completed} onClick={completeLesson}>{lessonProgress.completed ? <><CheckCircle2 size={20} /> Lesson completed</> : saving ? <><LoaderCircle className="spin" size={20} /> Saving progress…</> : <><Trophy size={20} /> Complete lesson and earn {experience.lessonXp} XP</>}</button>
            </div>
          )}

          <div className="lesson-navigation-actions">
            <button type="button" disabled={activeStep === 0} onClick={() => goToStep(activeStep - 1)}><ArrowLeft size={17} /> Previous</button>
            {activeStep < STEPS.length - 1 && <button type="button" className="is-next" onClick={() => goToStep(activeStep + 1)}>Next step <ArrowRight size={17} /></button>}
          </div>
        </section>

        <aside className="lesson-side-panel">
          <section className="lesson-assistant-card">
            <div><span><Bot size={22} /></span><div><small>LESSON HELPER</small><h3>Find an explanation</h3></div></div>
            <p>This private helper searches only the teacher-approved lesson already open on your device.</p>
            <form onSubmit={askAssistant}><textarea required rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What would you like explained?" /><button disabled={assistantLoading}>{assistantLoading ? <LoaderCircle className="spin" size={17} /> : <MessageCircleQuestion size={17} />} Ask assistant</button></form>
            {assistantAnswer && <div className="lesson-assistant-answer">{assistantAnswer}</div>}
          </section>
          <section className="lesson-side-progress"><h3>Your progress</h3><div><span style={{ width: `${lessonProgress.completed ? 100 : Math.max(Number(lessonProgress.percent || 0), currentStep.percent)}%` }} /></div><p>{lessonProgress.completed ? "Completed" : `${Math.max(Number(lessonProgress.percent || 0), currentStep.percent)}% through this lesson`}</p>{lessonProgress.bestQuizScore > 0 && <p><strong>Best quiz:</strong> {lessonProgress.bestQuizScore}%</p>}</section>
        </aside>
      </main>
    </div>
  );
}