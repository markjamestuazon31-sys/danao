import {
  ArrowRight, BookOpenCheck, CalendarDays, Check, CheckCircle2, Copy, Edit3,
  Eye, FileText, Gamepad2, LibraryBig, LoaderCircle, LockKeyhole, Plus,
  Rocket, Save, Search, Trash2, Upload, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSchoolStructure } from "../context/SchoolStructureContext";
import { subjectsForGrade } from "../data/curriculum";
import { assignedClassOptions, classKeyFor } from "../data/schoolClasses";
import { deleteTeacherContent, getTeacherGames, getTeacherLessons, saveTeacherContentBatch } from "../services/dataService";
import { createOriginalLessonMaterial, formatMaterialSize, ORIGINAL_FILE_ACCEPT, safeResourceUrl } from "../utils/originalLessonMaterial";
import { publicationLabel, toLocalDateTime } from "../utils/contentPublication";
import ProfessionalDocumentViewer from "../components/ProfessionalDocumentViewer";
import "../styles/publisher-professional.css";

const QUESTION_OPTIONS = [1, 5, 10, 15, 20, 30, 50, 100];
const FORMATS = [
  ["multiple-choice", "Knowledge Challenge"], ["word-match", "Word Match"],
  ["sentence-builder", "Sentence Builder"], ["classification", "Classification"],
  ["sequence", "Process Sequence"], ["scenario", "Situation Challenge"], ["true-false", "True or False"],
];
function emptyQuestion(index, format = "multiple-choice") {
  return { id: `item-${Date.now()}-${index}`, prompt: "", choices: format === "true-false" ? ["True", "False"] : ["", "", "", ""], answerIndex: 0, explanation: "", hint: "", points: 10, imageUrl: "" };
}
function questionList(count = 5, format) { return Array.from({ length: count }, (_, index) => emptyQuestion(index, format)); }
function restoredQuestions(record) {
  const source = Array.isArray(record?.questions) ? record.questions : Object.values(record?.questions || {});
  return source.length ? source.map((item, index) => {
    const choices = Array.isArray(item.choices) ? item.choices.map(String) : Object.values(item.choices || {}).map(String);
    const answerIndex = Number.isInteger(item.answerIndex) ? item.answerIndex : Math.max(0, choices.indexOf(String(item.answer || "")));
    return { ...emptyQuestion(index), ...item, prompt: String(item.prompt || ""), choices: choices.length ? choices : ["", "", "", ""], answerIndex };
  }) : questionList();
}
function validateQuestions(questions) {
  if (!questions.length) throw new Error("Add at least one game question.");
  questions.forEach((item, index) => {
    if (!String(item.prompt || "").trim()) throw new Error(`Add the question for activity ${index + 1}.`);
    if (item.choices.some((choice) => !String(choice).trim())) throw new Error(`Complete every choice for activity ${index + 1}.`);
    if (new Set(item.choices.map((choice) => String(choice).trim().toLowerCase())).size !== item.choices.length) throw new Error(`Use different answer choices for activity ${index + 1}.`);
    if (!String(item.choices[item.answerIndex] || "").trim()) throw new Error(`Select the correct answer for activity ${index + 1}.`);
  });
}

export default function LearningContentStudio() {
  const { user, profile } = useAuth();
  const { structure } = useSchoolStructure();
  const classes = useMemo(() => assignedClassOptions(profile, { structure }), [profile, structure]);
  const [targetKey, setTargetKey] = useState("");
  // An invalid saved class must NOT silently fall back to a different class.
  const target = classes.find((item) => item.key === targetKey) || null;
  const subjects = useMemo(() => subjectsForGrade(target?.grade), [target?.grade]);
  const [subject, setSubject] = useState("");
  const [output, setOutput] = useState("lesson-only");
  const [sourceMode, setSourceMode] = useState("document");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [competency, setCompetency] = useState("");
  const [lessonContent, setLessonContent] = useState("");
  const [material, setMaterial] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [format, setFormat] = useState("multiple-choice");
  const [instructions, setInstructions] = useState("");
  const [questions, setQuestions] = useState(() => questionList());
  const [randomizeQuestions, setRandomizeQuestions] = useState(true);
  const [status, setStatus] = useState("published");
  const [publishAt, setPublishAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [editingRecord, setEditingRecord] = useState(null);
  const [linkedGame, setLinkedGame] = useState(null);
  const [records, setRecords] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("create");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState(null);
  const fileRef = useRef(null);
  const saveLock = useRef(false);
  const importGeneration = useRef(0);
  const hasLesson = output !== "game-only";
  const hasGame = output !== "lesson-only";
  const readyItems = questions.filter((item) => item.prompt.trim() && item.choices.every((choice) => String(choice).trim())).length;

  useEffect(() => { if (!targetKey && classes.length) setTargetKey(classes.find((item) => item.sectionKey !== "all-sections")?.key || classes[0].key); }, [classes, targetKey]);
  useEffect(() => { if (subjects.length && !subjects.includes(subject)) setSubject(subjects[0]); }, [subjects, subject]);
  useEffect(() => () => { importGeneration.current += 1; }, []);

  async function loadRecords() {
    if (!user?.uid) return;
    setLibraryLoading(true); setLibraryError("");
    try {
      const [lessons, games] = await Promise.all([getTeacherLessons(user.uid), getTeacherGames(user.uid)]);
      setRecords([...lessons, ...games].sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)));
    } catch (error) { setLibraryError(error.message || "Your library could not be loaded. Please try again."); }
    finally { setLibraryLoading(false); }
  }
  useEffect(() => { void loadRecords(); }, [user?.uid]);

  async function uploadDocument(file) {
    if (!file || busy) return;
    const generation = ++importGeneration.current;
    setBusy(true); setMessage(null);
    try {
      const original = await createOriginalLessonMaterial(file);
      if (generation !== importGeneration.current) return;
      setMaterial(original); setSourceMode("document");
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
      setMessage({ type: "success", text: "Original file attached. Students will read this document, not an extracted or rewritten lesson." });
    } catch (error) { if (generation === importGeneration.current) setMessage({ type: "error", text: error.message || "The file could not be attached. Your previous file has not been changed." }); }
    finally { if (generation === importGeneration.current) { setBusy(false); if (fileRef.current) fileRef.current.value = ""; } }
  }
  function resetForm() {
    setTitle(""); setDescription(""); setCompetency(""); setLessonContent(""); setMaterial(null);
    setYoutubeUrl(""); setResourceUrl(""); setInstructions(""); setQuestions(questionList());
    setFormat("multiple-choice"); setRandomizeQuestions(true); setSourceMode("document"); setOutput("lesson-only");
    setStatus("published"); setPublishAt(""); setExpiresAt(""); setEditingRecord(null); setLinkedGame(null); setPreview(false);
  }
  function newContent() {
    if ((title || material || lessonContent) && !window.confirm("Start a new activity? Unsaved changes in this form will be discarded.")) return;
    resetForm(); setMessage(null); setTab("create");
  }
  function setQuestion(index, changes) { setQuestions((items) => items.map((item, i) => i === index ? { ...item, ...changes } : item)); }
  function changeCount(value) {
    const count = Number(value);
    if (count < questions.length && questions.slice(count).some((item) => item.prompt.trim()) && !window.confirm("Reducing the question count removes the last questions from this form. Continue?")) return;
    setQuestions((items) => items.length < count ? [...items, ...Array.from({ length: count - items.length }, (_, i) => emptyQuestion(items.length + i, format))] : items.slice(0, count));
  }
  function changeFormat(value) {
    if ((value === "true-false") !== (format === "true-false")) {
      if (questions.some((item) => item.prompt.trim()) && !window.confirm("This changes the available answer choices. Questions and explanations are retained. Continue?")) return;
      setQuestions((items) => items.map((item) => ({ ...item, choices: value === "true-false" ? ["True", "False"] : ["", "", "", ""], answerIndex: 0 })));
    }
    setFormat(value);
  }
  function openRecord(record, duplicate = false) {
    const game = record.type === "game" ? record : records.find((item) => item.type === "game" && item.id === (record.gameId || record.connectedGameId));
    setEditingRecord(duplicate ? null : record);
    setLinkedGame(!duplicate && record.type === "lesson" ? game || null : null);
    setTitle(`${record.title || "Untitled"}${duplicate ? " — Copy" : ""}`);
    setDescription(record.description || ""); setCompetency(record.competency || "");
    setTargetKey(classKeyFor(record.grade || record.gradeLevel, record.section)); setSubject(record.subject || "");
    setLessonContent(record.content || ""); setMaterial(record.material || null);
    setSourceMode(record.contentMode === "document" || record.material?.url ? "document" : "written");
    setYoutubeUrl(record.youtubeUrl || ""); setResourceUrl(record.resourceUrl || "");
    setOutput(record.type === "game" ? "game-only" : game ? "lesson-and-game" : "lesson-only");
    setFormat(game?.gameFormat || "multiple-choice"); setInstructions(game?.instructions || "");
    setQuestions(restoredQuestions(game)); setRandomizeQuestions(game?.randomizeQuestions !== false);
    const label = publicationLabel(record);
    setStatus(duplicate || label === "Draft" || label === "Archived" ? "draft" : label === "Scheduled" ? "scheduled" : "published");
    setPublishAt(!duplicate ? toLocalDateTime(record.publishAt) : "");
    setExpiresAt(!duplicate ? toLocalDateTime(record.expiresAt) : "");
    setPreview(false); setTab("create");
    setMessage(record.type === "lesson" && game ? { type: "info", text: duplicate ? "This copy will create a new lesson and game. The original records will not be changed." : "The linked game is loaded. “Lesson + game” saves and publishes both together; choose “Lesson only” to change only the lesson." } : null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function saveContent(saveAs = status) {
    if (saveLock.current || busy) return;
    saveLock.current = true; setBusy(true); setMessage(null);
    try {
      if (!target) throw new Error("Choose a class that is assigned to your account. The previous class may no longer be available.");
      if (!title.trim()) throw new Error("Enter a title. Your uploaded document itself does not need editing.");
      if (hasLesson && sourceMode === "document" && !material?.url) throw new Error("Upload the original lesson file first.");
      if (hasLesson && sourceMode === "written" && !lessonContent.trim()) throw new Error("Write the lesson content or choose Upload document.");
      if (hasGame && saveAs !== "draft") validateQuestions(questions);
      if (hasLesson && resourceUrl.trim() && !safeResourceUrl(resourceUrl)) throw new Error("Use a valid http or https resource link.");
      if (hasLesson && youtubeUrl.trim() && !safeResourceUrl(youtubeUrl)) throw new Error("Use a valid YouTube link.");
      if (saveAs === "scheduled" && (!publishAt || new Date(publishAt).getTime() <= Date.now())) throw new Error("Choose a future publication date and time.");
      const common = { title: title.trim(), description: description.trim(), competency: competency.trim(), subject,
        grade: target.grade, section: target.section, status: saveAs,
        publishAt: saveAs === "scheduled" ? new Date(publishAt).getTime() : null,
        expiresAt: expiresAt ? new Date(expiresAt).getTime() : null, teacherReviewed: true };
      const entries = [];
      if (hasGame) {
        const normalizedQuestions = questions.map((item, index) => ({ ...item, id: `teacher-item-${index + 1}`,
          prompt: item.prompt.trim(), choices: item.choices.map((choice) => String(choice).trim()),
          answer: String(item.choices[item.answerIndex] || "").trim(), skill: competency.trim() || subject }));
        entries.push({ type: "game", id: editingRecord?.type === "game" ? editingRecord.id : linkedGame?.id,
          content: { ...common, title: hasLesson ? `${title.trim()} Challenge` : title.trim(),
            gameFormat: format, mechanic: FORMATS.find(([id]) => id === format)?.[1] || "Knowledge Challenge",
            learningGoal: competency.trim(), instructions: instructions.trim(), estimatedMinutes: 10,
            coverEmoji: "🎮", questions: normalizedQuestions, questionLimit: normalizedQuestions.length, randomizeQuestions } });
      }
      if (hasLesson) {
        const previous = editingRecord?.type === "lesson" ? editingRecord : null;
        entries.push({ type: "lesson", id: previous?.id,
          content: { ...common, contentMode: sourceMode === "document" ? "document" : "written",
            // NEVER extract, rewrite, trim or regenerate the attached document.
            content: sourceMode === "document" ? "" : lessonContent,
            material: sourceMode === "document" ? material : null,
            materialName: sourceMode === "document" ? material?.name : null,
            youtubeUrl: youtubeUrl.trim(), resourceUrl: resourceUrl.trim(), estimatedMinutes: previous?.estimatedMinutes || 25,
            gameId: previous?.gameId || previous?.connectedGameId || null,
            connectedGameId: previous?.connectedGameId || previous?.gameId || null,
            quiz: previous?.quiz || null, requiresReadingBeforeQuiz: true } });
      }
      const saved = await saveTeacherContentBatch(user?.uid, entries);
      const keys = new Set(saved.map((item) => `${item.type}:${item.id}`));
      setRecords((items) => [...saved, ...items.filter((item) => !keys.has(`${item.type}:${item.id}`))]);
      const label = hasLesson && hasGame ? "Lesson and game" : hasLesson ? "Lesson" : "Game";
      setMessage({ type: "success", text: saveAs === "draft" ? `${label} saved as a private draft.` : saveAs === "scheduled" ? `${label} scheduled for ${new Date(publishAt).toLocaleString()} in ${target.label}.` : `${label} published to ${target.label}. Students can open the saved content from their class library.` });
      resetForm(); setTab("library");
    } catch (error) { setMessage({ type: "error", text: error.message || "The content could not be saved. Nothing has been published." }); }
    finally { setBusy(false); saveLock.current = false; }
  }
  async function deleteRecord(record) {
    if (!window.confirm(`Delete “${record.title}”? This removes this item from the student catalog. Connected items are not deleted.`)) return;
    const key = `${record.type}:${record.id}`; setDeletingId(key); setMessage(null);
    try { await deleteTeacherContent(user.uid, record.type, record.id); setRecords((items) => items.filter((item) => `${item.type}:${item.id}` !== key)); setMessage({ type: "success", text: "The selected item was deleted." }); }
    catch (error) { setMessage({ type: "error", text: error.message || "The item could not be deleted." }); }
    finally { setDeletingId(""); }
  }
  const visibleRecords = records.filter((item) => `${item.title} ${item.subject} ${item.grade} ${item.section}`.toLowerCase().includes(search.toLowerCase()));

  return <div className="publisher-pro">
    <header className="pp-heading"><div><span className="pp-eyebrow">TEACHER WORKSPACE</span><h1>Lesson & game publisher</h1><p>Your original materials. A clear learning experience for every class.</p></div><button type="button" className="pp-button pp-button--quiet" onClick={newContent} disabled={busy}><Plus size={17}/> New activity</button></header>
    <nav className="pp-tabs" aria-label="Publisher views"><button type="button" aria-current={tab === "create" ? "page" : undefined} className={tab === "create" ? "is-active" : ""} onClick={() => setTab("create")} disabled={busy}><FileText size={17}/>{editingRecord ? "Manage content" : "Create content"}</button><button type="button" aria-current={tab === "library" ? "page" : undefined} className={tab === "library" ? "is-active" : ""} onClick={() => setTab("library")} disabled={busy}><LibraryBig size={17}/> My library <span>{records.length}</span></button></nav>
    {message && <div className={`pp-alert pp-alert--${message.type}`} role={message.type === "error" ? "alert" : "status"}><CheckCircle2 size={18}/><span>{message.text}</span><button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message"><X size={16}/></button></div>}
    {!classes.length && <div className="pp-alert pp-alert--error" role="alert">An administrator needs to assign a class to your teacher account before you can publish.</div>}

    {tab === "library" ? <section className="pp-card pp-library"><div className="pp-section-heading"><div><span className="pp-eyebrow">YOUR TEACHING MATERIALS</span><h2>Content library</h2><p>Manage original files, learning games, and publication dates.</p></div><label className="pp-search"><Search size={17}/><span className="pp-sr-only">Search your library</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search content or class"/></label></div>
      {libraryError && <div className="pp-alert pp-alert--error">{libraryError}<button type="button" onClick={() => void loadRecords()}>Retry</button></div>}
      {libraryLoading && <p className="pp-loading"><LoaderCircle className="spin" size={18}/> Loading your library…</p>}
      {!libraryLoading && !visibleRecords.length && <div className="pp-empty"><LibraryBig size={32}/><h3>{search ? "No matching content" : "Your class library starts here"}</h3><p>{search ? "Try another title, subject, or class." : "Upload a lesson document and publish it when you are ready."}</p>{!search && <button type="button" className="pp-button pp-button--primary" onClick={newContent}><Plus size={16}/> Create your first lesson</button>}</div>}
      <div className="pp-library-grid">{visibleRecords.map((record) => {
        const label = publicationLabel(record); const key = `${record.type}:${record.id}`;
        return <article className="pp-record" key={key}><div className="pp-record-top"><span className={`pp-record-icon ${record.type === "game" ? "is-game" : ""}`}>{record.type === "game" ? <Gamepad2 size={22}/> : <FileText size={22}/>}</span><span className={`pp-status pp-status--${label.toLowerCase()}`}>{label}</span></div><small className="pp-record-subject">{record.subject} · {record.type === "game" ? "Game" : record.material?.url ? "Original document" : "Written lesson"}</small><h3>{record.title || "Untitled activity"}</h3><p>{record.grade} · {record.section}</p>{record.material?.name && <p className="pp-record-file"><FileText size={13}/>{record.material.name}</p>}{label === "Scheduled" && <p><CalendarDays size={13}/> {new Date(record.publishAt).toLocaleString()}</p>}<div className="pp-record-actions"><button type="button" onClick={() => openRecord(record)} disabled={Boolean(deletingId)}><Edit3 size={14}/> Manage</button><Link to={`/${record.type}/${record.id}`}><Eye size={14}/> View</Link><button type="button" onClick={() => openRecord(record, true)} disabled={Boolean(deletingId)} aria-label={`Duplicate ${record.title}`} title="Duplicate"><Copy size={14}/></button><button type="button" className="pp-delete" onClick={() => void deleteRecord(record)} disabled={Boolean(deletingId)} aria-label={`Delete ${record.title}`} title="Delete">{deletingId === key ? <LoaderCircle className="spin" size={14}/> : <Trash2 size={14}/>}</button></div></article>;
      })}</div></section> : <>
      <div className="pp-workflow" aria-label="Publishing workflow"><a href="#pp-content"><span>1</span> Add your content</a><ArrowRight size={15}/><a href="#pp-class"><span>2</span> Choose the class</a><ArrowRight size={15}/><a href="#pp-publish"><span>3</span> Review & publish</a></div>
      <div className="pp-layout"><main className="pp-main"><section className="pp-card" id="pp-content"><div className="pp-section-heading"><div><span className="pp-eyebrow">01 / CONTENT</span><h2>What are you sharing?</h2><p>Documents stay unchanged. Games are optional and authored separately.</p></div></div><div className="pp-output-picker">{[["lesson-only", "Lesson only", FileText, "Upload a file or write a lesson"], ["lesson-and-game", "Lesson + game", BookOpenCheck, "Publish a connected pair"], ["game-only", "Game only", Gamepad2, "Create a class activity"]].map(([id, label, Icon, help]) => <button type="button" key={id} className={output === id ? "is-active" : ""} aria-pressed={output === id} onClick={() => setOutput(id)} disabled={busy}><Icon size={22}/><strong>{label}</strong><small>{help}</small>{output === id && <Check size={14}/>}</button>)}</div>
        {hasLesson && <><div className="pp-source-switch" role="group" aria-label="Lesson source"><button type="button" className={sourceMode === "document" ? "is-active" : ""} aria-pressed={sourceMode === "document"} onClick={() => setSourceMode("document")} disabled={busy}><Upload size={15}/> Upload document</button><button type="button" className={sourceMode === "written" ? "is-active" : ""} aria-pressed={sourceMode === "written"} onClick={() => setSourceMode("written")} disabled={busy}><Edit3 size={15}/> Write a lesson</button></div>
          <input className="pp-file-input" ref={fileRef} type="file" accept={ORIGINAL_FILE_ACCEPT} onChange={(event) => void uploadDocument(event.target.files?.[0])} aria-label="Upload the original lesson document" disabled={busy}/>
          {sourceMode === "document" ? <>{!material?.url ? <div className={`pp-dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length > 1) { setMessage({ type: "error", text: "Upload one original document per lesson." }); return; } void uploadDocument(event.dataTransfer.files[0]); }}><span className="pp-upload-icon"><Upload size={27}/></span><h3>Bring your lesson into the classroom</h3><p>Drop your file here, or choose it from your device.</p><button type="button" className="pp-button pp-button--primary" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Plus size={16}/>} Choose lesson file</button><small>DOCX, PDF, TXT or Markdown · Up to 6 MB</small><span className="pp-file-promise"><LockKeyhole size={13}/> No text extraction. No automatic rewriting.</span></div> : <><div className="pp-attachment-summary"><CheckCircle2 size={19}/><div><strong>Original document attached</strong><small>{formatMaterialSize(material.size)} · Ready for student reading</small></div><button type="button" onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={14}/> Replace</button><button type="button" className="pp-delete" aria-label="Remove the attached document" onClick={() => { if (window.confirm("Remove this file from the form? It is not removed from the saved lesson until you save.")) setMaterial(null); }} disabled={busy}><Trash2 size={15}/></button></div><ProfessionalDocumentViewer material={material} compact/></>}</> : <label className="pp-field">Lesson content<textarea rows={15} value={lessonContent} onChange={(event) => setLessonContent(event.target.value)} placeholder="Write your own lesson here. This does not edit the uploaded original document." disabled={busy}/><small>To show an uploaded file unchanged, choose Upload document instead.</small></label>}
          <details className="pp-extra"><summary>Additional resources <span>Optional</span></summary><div className="pp-fields"><label className="pp-field">YouTube video<input type="url" value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" disabled={busy}/></label><label className="pp-field">Resource link<input type="url" value={resourceUrl} onChange={(event) => setResourceUrl(event.target.value)} placeholder="https://…" disabled={busy}/></label></div><p>Shown separately from the original lesson. Links do not replace an uploaded file.</p></details>
        </>}
      </section>
      <section className="pp-card" id="pp-class"><div className="pp-section-heading"><div><span className="pp-eyebrow">02 / CLASS & DETAILS</span><h2>Send it to the right students</h2><p>These details describe the student card. They do not change the document.</p></div></div><div className="pp-fields"><label className="pp-field">Assigned class <span className="pp-required">*</span><select value={targetKey} onChange={(event) => setTargetKey(event.target.value)} disabled={busy || !classes.length}>{!target && <option value={targetKey}>Choose an assigned class</option>}{classes.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select></label><label className="pp-field">Subject <span className="pp-required">*</span><select value={subject} onChange={(event) => setSubject(event.target.value)} disabled={busy || !target}>{subjects.map((item) => <option key={item}>{item}</option>)}</select></label><label className="pp-field pp-span-2">Activity title <span className="pp-required">*</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Example: The water cycle" maxLength={220} disabled={busy}/></label><label className="pp-field pp-span-2">Card description <small>Optional</small><textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short note shown in the student's library" maxLength={1500} disabled={busy}/></label><label className="pp-field pp-span-2">Learning competency <small>Optional</small><input value={competency} onChange={(event) => setCompetency(event.target.value)} placeholder="Add your curriculum competency, when needed" maxLength={1000} disabled={busy}/></label></div></section>
      {hasGame && <section className="pp-card pp-game-editor"><div className="pp-section-heading"><div><span className="pp-eyebrow">OPTIONAL / LEARNING GAME</span><h2>Build the class activity</h2><p>Your questions and answer choices are used as written.</p></div><span className="pp-count">{readyItems}/{questions.length} ready</span></div><div className="pp-fields"><label className="pp-field">Game format<select value={format} onChange={(event) => changeFormat(event.target.value)} disabled={busy}>{FORMATS.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label><label className="pp-field">Question count<select value={questions.length} onChange={(event) => changeCount(event.target.value)} disabled={busy}>{[...new Set([...QUESTION_OPTIONS, questions.length])].sort((a, b) => a - b).map((count) => <option key={count} value={count}>{count} {count === 1 ? "question" : "questions"}</option>)}</select></label><label className="pp-field pp-span-2">Instructions<textarea rows={2} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Explain how students should complete the activity" disabled={busy}/></label></div><label className="pp-checkbox"><input type="checkbox" checked={randomizeQuestions} onChange={(event) => setRandomizeQuestions(event.target.checked)} disabled={busy}/> Randomize question order</label><div className="pp-questions">{questions.map((item, index) => <details key={item.id} className="pp-question" open={index === 0 ? true : undefined}><summary><span>{index + 1}</span><strong>{item.prompt || `Question ${index + 1}`}</strong><small>{item.prompt && item.choices.every((choice) => choice.trim()) ? "Ready" : "Draft"}</small></summary><div><label className="pp-field">Question<textarea rows={2} value={item.prompt} onChange={(event) => setQuestion(index, { prompt: event.target.value })} disabled={busy}/></label><div className="pp-choices">{item.choices.map((choice, choiceIndex) => <label key={choiceIndex} className={item.answerIndex === choiceIndex ? "is-correct" : ""}><input type="radio" name={`answer-${index}`} checked={item.answerIndex === choiceIndex} onChange={() => setQuestion(index, { answerIndex: choiceIndex })} aria-label={`Mark choice ${String.fromCharCode(65 + choiceIndex)} correct for question ${index + 1}`} disabled={busy}/><span>{String.fromCharCode(65 + choiceIndex)}</span><input type="text" value={choice} onChange={(event) => setQuestion(index, { choices: item.choices.map((value, i) => i === choiceIndex ? event.target.value : value) })} aria-label={`Question ${index + 1}, choice ${String.fromCharCode(65 + choiceIndex)}`} placeholder="Answer choice" disabled={busy}/></label>)}</div><small className="pp-answer-help">Select the circle next to the correct answer.</small><div className="pp-fields"><label className="pp-field">Explanation<input value={item.explanation || ""} onChange={(event) => setQuestion(index, { explanation: event.target.value })} disabled={busy}/></label><label className="pp-field">Hint <small>Optional</small><input value={item.hint || ""} onChange={(event) => setQuestion(index, { hint: event.target.value })} disabled={busy}/></label></div></div></details>)}</div></section>}
      </main><aside className="pp-publish-column"><section className="pp-card pp-publish" id="pp-publish"><div className="pp-publish-icon"><Rocket size={24}/></div><span className="pp-eyebrow">03 / READY TO SHARE</span><h2>Review & publish</h2><p>Students receive the saved lesson in their class library.</p><dl className="pp-summary"><div><dt>Assigned class</dt><dd>{target?.label || "Choose a class"}</dd></div><div><dt>Subject</dt><dd>{subject || "—"}</dd></div><div><dt>Content</dt><dd>{hasLesson && hasGame ? "Lesson + connected game" : hasLesson ? "Lesson" : "Game"}</dd></div>{hasLesson && <div><dt>Lesson source</dt><dd>{sourceMode === "document" ? material?.name || "No file attached" : "Teacher-written text"}</dd></div>}{hasGame && <div><dt>Questions</dt><dd>{readyItems} of {questions.length} ready</dd></div>}</dl><label className="pp-field">Visibility<select value={status} onChange={(event) => setStatus(event.target.value)} disabled={busy}><option value="published">Publish now</option><option value="draft">Private draft</option><option value="scheduled">Schedule publication</option></select></label>{status === "scheduled" && <label className="pp-field">Publication date and time<input type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} disabled={busy}/><small>Times use your device's local time zone.</small></label>}<label className="pp-field">Expiration <small>Optional</small><input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} disabled={busy}/></label><button type="button" className="pp-button pp-button--primary" onClick={() => void saveContent()} disabled={busy || !target}>{busy ? <LoaderCircle className="spin" size={17}/> : status === "scheduled" ? <CalendarDays size={17}/> : <Rocket size={17}/>} {busy ? "Saving content…" : status === "scheduled" ? "Schedule content" : status === "draft" ? "Save private draft" : hasLesson && hasGame ? "Publish lesson + game" : hasLesson ? "Publish lesson" : "Publish game"}</button>{status !== "draft" && <button type="button" className="pp-button pp-button--quiet" onClick={() => void saveContent("draft")} disabled={busy || !target}><Save size={16}/> Save as draft</button>}<button type="button" className="pp-text-button" onClick={() => setPreview((value) => !value)} aria-expanded={preview}><Eye size={15}/>{preview ? "Hide card preview" : "Preview student card"}</button>{preview && <div className="pp-student-preview"><FileText size={23}/><small>{subject} · {target?.grade}</small><h3>{title || "Your lesson title"}</h3><p>{description || material?.name || "Your published activity will appear here."}</p><span>{hasLesson ? "Open lesson" : "Play game"}<ArrowRight size={14}/></span></div>}<div className="pp-privacy"><LockKeyhole size={15}/><p>The document is saved unchanged. Student access depends on the assigned class and your deployed database rules.</p></div></section><div className="pp-tip"><FileText size={18}/><div><strong>Need an exact page layout?</strong><p>Upload PDF for fixed pages. Word files display in the browser, with the original available to download.</p></div></div></aside></div>
    </>}
  </div>;
}
