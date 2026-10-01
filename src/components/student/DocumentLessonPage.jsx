import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpenCheck, CheckCircle2, ExternalLink, FileText, Gamepad2, ListChecks, LoaderCircle, LockKeyhole } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import ProfessionalDocumentViewer from "../ProfessionalDocumentViewer";
import { normalizeLesson, extractYoutubeId } from "../../utils/lessonContent";
import { safeResourceUrl } from "../../utils/originalLessonMaterial";
import { learningHref } from "../../utils/studentProgress";
import { recordDocumentReading, recordLessonQuizAttempt } from "../../services/realtimeProgressService";
import "../../styles/document-lesson-professional.css";

/** The source file is the lesson. No synthesized discussion, examples or AI steps. */
export default function DocumentLessonPage({ lesson, connectedGame, progress }) {
  const { profile } = useAuth();
  const isStudent = profile?.role === "student";
  const record = progress?.lesson?.[lesson.id] || {};
  const questions = useMemo(() => normalizeLesson(lesson).quizQuestions, [lesson]);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [readySource, setReadySource] = useState(null);
  const documentSource = lesson.material?.sha256 || lesson.material?.url || lesson.material?.text || lesson.id;
  const fileReady = readySource === documentSource;
  const lock = useRef(false);
  const hasLinkedGame = Boolean(lesson.gameId || lesson.connectedGameId);
  const resource = safeResourceUrl(lesson.resourceUrl);
  const youtubeId = extractYoutubeId(lesson.youtubeUrl);
  const safeYoutubeId = /^[a-zA-Z0-9_-]{11}$/.test(youtubeId) ? youtubeId : "";
  const readingDone = Boolean(record.readingCompletedAt || record.completed);
  const canFinish = Boolean(readingDone && !record.completed && (questions.length ? Number(record.bestQuizScore || 0) >= 70 : hasLinkedGame && progress?.game?.[lesson.gameId || lesson.connectedGameId]?.completedAt));

  async function markRead() {
    if (!isStudent || lock.current) return;
    lock.current = true; setBusy(true); setNotice(null);
    try {
      const saved = await recordDocumentReading(lesson.id);
      setNotice({ type: "success", text: saved.completed ? `Lesson completed.${saved.xpAwarded ? ` You earned ${saved.xpAwarded} XP.` : ""}` : "Reading saved. Complete the teacher's assessment to finish this lesson." });
    } catch (error) { setNotice({ type: "error", text: error.message || "Progress could not be saved. Please try again." }); }
    finally { lock.current = false; setBusy(false); }
  }
  async function submitQuiz(event) {
    event.preventDefault();
    if (lock.current) return;
    if (isStudent && !readingDone) { setNotice({ type: "error", text: "Read the original lesson and select Mark as read before answering the quiz." }); return; }
    if (questions.some((item) => answers[item.id] === undefined)) { setNotice({ type: "error", text: "Answer every teacher question before submitting." }); return; }
    lock.current = true; setBusy(true); setNotice(null);
    try {
      if (!isStudent) {
        const correct = questions.filter((item) => String(item.answer).trim().toLowerCase() === String(answers[item.id]).trim().toLowerCase()).length;
        setResult({ score: Math.round(correct / questions.length * 100), correct, total: questions.length, saved: false });
      } else {
        const saved = await recordLessonQuizAttempt(lesson.id, answers);
        setResult(saved);
        if (saved.passed) {
          const completed = await recordDocumentReading(lesson.id);
          setNotice({ type: "success", text: `Quiz passed. ${completed.completed ? "Your lesson is complete." : "Your score was saved."}` });
        } else setNotice({ type: "info", text: "Your attempt was saved. Review the original lesson and try again." });
      }
    } catch (error) { setNotice({ type: "error", text: error.message || "Your attempt could not be saved." }); }
    finally { lock.current = false; setBusy(false); }
  }

  return <div className="document-lesson-pro">
    <nav className="dlp-breadcrumb"><Link to={isStudent ? "/student/lessons" : "/teacher/content-studio"}><ArrowLeft size={16}/>{isStudent ? "My lessons" : "Content Studio"}</Link><span>/</span><span>{lesson.subject || "Lesson"}</span><span className="dlp-readonly"><LockKeyhole size={13}/> Read-only lesson</span></nav>
    <header className="dlp-heading"><div className="dlp-label"><BookOpenCheck size={15}/> {isStudent ? "YOUR CLASSROOM" : "STUDENT VIEW PREVIEW"}</div><h1>{lesson.title || "Lesson document"}</h1>{lesson.description && <p>{lesson.description}</p>}<div className="dlp-meta"><span>{lesson.subject}</span><span>{lesson.grade || lesson.gradeLevel}</span>{lesson.section && <span>{lesson.section}</span>}<span className="dlp-original"><FileText size={13}/> Original teacher material</span></div></header>
    {notice && <div className={`dlp-notice dlp-notice--${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>{notice.text}</div>}
    <div className="dlp-layout"><main className="dlp-main"><ProfessionalDocumentViewer material={lesson.material} onReady={() => setReadySource(documentSource)}/>
      {safeYoutubeId && <section className="dlp-card"><div className="dlp-section-label">TEACHER RESOURCE</div><h2>Lesson video</h2><iframe className="dlp-video" title="Teacher-provided lesson video" src={`https://www.youtube-nocookie.com/embed/${safeYoutubeId}`} allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy"/></section>}
      {questions.length > 0 && <section className="dlp-card dlp-quiz" id="teacher-quiz"><div className="dlp-section-label">TEACHER-AUTHORED ASSESSMENT</div><h2>Check your understanding</h2><p>These questions were attached by your teacher. Read the original lesson before answering.</p>{isStudent && !readingDone && <div className="dlp-quiz-lock"><LockKeyhole size={17}/> Select “Mark as read” to unlock the teacher's quiz.</div>}<form onSubmit={submitQuiz}><fieldset disabled={busy || (isStudent && !readingDone)} className="dlp-quiz-fields"><legend className="dlp-sr-only">Teacher questions</legend>{questions.map((item, index) => <fieldset className="dlp-question" key={item.id}><legend>{index + 1}. {item.prompt}</legend>{item.choices.map((choice, choiceIndex) => <label key={`${item.id}-${choiceIndex}`} className={answers[item.id] === choice ? "is-selected" : ""}><input type="radio" name={`document-${item.id}`} checked={answers[item.id] === choice} onChange={() => { setAnswers((current) => ({ ...current, [item.id]: choice })); setResult(null); }}/><span>{choice}</span></label>)}</fieldset>)}<button className="dlp-button dlp-button--primary" type="submit" disabled={busy || (isStudent && !readingDone)}>{busy ? <LoaderCircle className="spin" size={17}/> : <ListChecks size={17}/>} {isStudent ? "Submit answers" : "Check preview answers"}</button></fieldset></form>{result && <div className={`dlp-result ${result.score >= 70 ? "is-pass" : ""}`}><strong>{result.score}%</strong><div><b>{result.score >= 70 ? "Assessment passed" : "Review and try again"}</b><p>{result.correct} of {result.total} correct. {isStudent ? "Your attempt is saved." : "Preview only — no student record changed."}</p></div></div>}</section>}
    </main><aside className="dlp-sidebar"><section className="dlp-card dlp-progress"><span className="dlp-side-icon"><BookOpenCheck size={23}/></span><div className="dlp-section-label">YOUR LEARNING</div><h2>{record.completed ? "Lesson complete" : readingDone ? "Reading complete" : "Read at your own pace"}</h2><p>{record.completed ? "Your progress has been saved." : readingDone && (questions.length || hasLinkedGame) ? "Continue with the teacher's assessment below." : "Read the document above, then save your reading progress."}</p><div className="dlp-progress-line"><span style={{ width: record.completed ? "100%" : readingDone ? "70%" : "0%" }}/></div>{isStudent ? <button type="button" className="dlp-button dlp-button--primary" onClick={() => void markRead()} disabled={busy || record.completed || (!fileReady && !readingDone) || (readingDone && !canFinish)}>{busy ? <LoaderCircle className="spin" size={17}/> : <CheckCircle2 size={17}/>} {record.completed ? "Completed" : busy ? "Saving…" : canFinish ? "Finish lesson" : readingDone ? "Reading saved" : "Mark as read"}</button> : <div className="dlp-preview-note">Teacher preview. Reading and quiz actions do not change student records.</div>}{questions.length > 0 && <a className="dlp-text-link" href="#teacher-quiz">Go to teacher quiz <ArrowRight size={14}/></a>}</section>
      {lesson.competency && <section className="dlp-card dlp-competency"><div className="dlp-section-label">LEARNING COMPETENCY</div><p>{lesson.competency}</p></section>}
      {(connectedGame || hasLinkedGame) && <section className="dlp-card dlp-connected"><Gamepad2 size={25}/><div className="dlp-section-label">CONNECTED ACTIVITY</div><h2>{connectedGame?.title || "Teacher learning game"}</h2><p>{connectedGame ? "Practice the lesson with the game your teacher prepared." : "The connected game is not currently available for your class. Ask your teacher to publish it."}</p>{connectedGame && <Link className="dlp-button dlp-button--quiet" to={learningHref(connectedGame)}>Open game <ArrowRight size={15}/></Link>}</section>}
      {resource && <section className="dlp-card dlp-resource"><div className="dlp-section-label">ADDITIONAL RESOURCE</div><a href={resource} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/> Open teacher resource</a><p>Opens separately. It does not replace the original lesson.</p></section>}
      <div className="dlp-source-note"><LockKeyhole size={15}/><p>This lesson is shown from the teacher's uploaded file. There is no student editor and no automatically rewritten discussion.</p></div>
    </aside></div>
  </div>;
}
