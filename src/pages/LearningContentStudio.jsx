import {
  BookOpenCheck, CheckCircle2, Copy, Eye, FileText, Gamepad2, LibraryBig,
  Rocket, Save, Sparkles, Trash2, Upload, WandSparkles, Edit3,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolStructure } from "../context/SchoolStructureContext";
import { subjectsForGrade } from "../data/curriculum";
import { assignedClassOptions, classKeyFor } from "../data/schoolClasses";
import { deleteTeacherContent, getTeacherGames, getTeacherLessons, saveGame, saveLesson, updateTeacherContent } from "../services/dataService";
import { extractDocumentText } from "../utils/documentTextExtractor";

const QUESTION_OPTIONS = [5, 10, 15, 20, 30, 50, 100];

// Files up to this size are embedded directly (as a data URL) into the lesson
// record so students see the actual file the teacher uploaded. Larger files
// still get their text extracted into the editor, but the teacher should use
// the external resource link field instead so the original file can open.
const MAX_MATERIAL_EMBED_BYTES = 3 * 1024 * 1024;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read this file in the browser."));
    reader.readAsDataURL(file);
  });
}

const GAME_FORMATS = [
  { id: "auto", label: "Recommend a game", description: "Select the best activity for the subject." },
  { id: "multiple-choice", label: "Knowledge Challenge", description: "Question and four answer choices." },
  { id: "word-match", label: "Word Match", description: "Match a term with its correct meaning." },
  { id: "sentence-builder", label: "Sentence Builder", description: "Choose the best word or sentence part." },
  { id: "classification", label: "Classification", description: "Place an example in the correct group." },
  { id: "sequence", label: "Process Sequence", description: "Identify the correct next step or order." },
  { id: "scenario", label: "Situation Challenge", description: "Choose the best action for a real situation." },
  { id: "true-false", label: "True or False", description: "Fast concept checking with explanations." },
];

const FORMAT_BY_SUBJECT = {
  English: "sentence-builder", Filipino: "word-match", Science: "classification",
  Makabansa: "scenario", "Araling Panlipunan": "sequence", GMRC: "scenario",
  EPP: "sequence", "EPP/TLE": "sequence", MAPEH: "classification",
};

function emptyQuestion(index, format = "multiple-choice") {
  const truth = format === "true-false";
  return {
    id: `item-${Date.now()}-${index}`,
    prompt: "",
    choices: truth ? ["True", "False"] : ["", "", "", ""],
    answerIndex: 0,
    explanation: "",
    hint: "",
    points: 10,
    imageUrl: "",
  };
}

function tenQuestions(format, count = 10) {
  return Array.from({ length: count }, (_, index) => emptyQuestion(index, format));
}

function validateQuestions(questions, minimum = 1) {
  if (questions.length < minimum) throw new Error(`A published game needs at least ${minimum} activities.`);
  questions.forEach((question, index) => {
    if (!question.prompt.trim()) throw new Error(`Complete the instruction for activity ${index + 1}.`);
    const choices = question.choices.map((choice) => choice.trim()).filter(Boolean);
    if (choices.length < 2) throw new Error(`Activity ${index + 1} needs at least two answer choices.`);
    if (!String(question.choices[question.answerIndex] || "").trim()) throw new Error(`Select a correct answer for activity ${index + 1}.`);
  });
}

export default function LearningContentStudio() {
  const { user, profile } = useAuth();
  const { structure } = useSchoolStructure();
  const classes = useMemo(() => assignedClassOptions(profile, { includeAllSections: false, structure }), [profile, structure]);
  const [targetKey, setTargetKey] = useState("");
  const target = classes.find((item) => item.key === targetKey) || classes[0] || null;
  const subjects = useMemo(() => subjectsForGrade(target?.grade), [target?.grade]);
  const [subject, setSubject] = useState("");
  const [output, setOutput] = useState("lesson-and-game");
  const [format, setFormat] = useState("auto");
  const [title, setTitle] = useState("");
  const [competency, setCompetency] = useState("");
  const [description, setDescription] = useState("");
  const [lessonContent, setLessonContent] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [material, setMaterial] = useState(null);
  const [instructions, setInstructions] = useState("");
  const [questions, setQuestions] = useState(() => tenQuestions("multiple-choice", 10));
  const [questionLimit, setQuestionLimit] = useState(10);
  const [status, setStatus] = useState("draft");
  // Teacher controls how many questions students receive and whether order is randomized.

  const [publishAt, setPublishAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [editingRecord, setEditingRecord] = useState(null);
  const [tab, setTab] = useState("create");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [records, setRecords] = useState([]);
  const [deletingId, setDeletingId] = useState("");
  const fileRef = useRef(null);

  useEffect(() => { if (!targetKey && classes[0]) setTargetKey(classes[0].key); }, [classes, targetKey]);
  useEffect(() => { if (subjects.length && !subjects.includes(subject)) setSubject(subjects[0]); }, [subject, subjects]);

  async function loadRecords() {
    if (!user?.uid) return;
    const [lessons, games] = await Promise.all([getTeacherLessons(user.uid), getTeacherGames(user.uid)]);
    setRecords([...lessons, ...games].sort((a, b) => Number(b.updatedAt || b.createdAt) - Number(a.updatedAt || a.createdAt)));
  }
  useEffect(() => { void loadRecords(); }, [user?.uid]);

  const resolvedFormat = format === "auto" ? FORMAT_BY_SUBJECT[subject] || "multiple-choice" : format;
  const isMathematics = subject === "Mathematics";
  const readyItems = questions.filter((question) => question.prompt.trim() && question.choices.filter((choice) => choice.trim()).length >= 2).length;

  function changeSubject(nextSubject) {
    setSubject(nextSubject);
    if (nextSubject === "Mathematics") setOutput("lesson-only");
    if (format === "auto") setQuestions(tenQuestions(FORMAT_BY_SUBJECT[nextSubject] || "multiple-choice", questionLimit));
  }

  function changeFormat(next) {
    setFormat(next);
    const resolved = next === "auto" ? FORMAT_BY_SUBJECT[subject] || "multiple-choice" : next;
    setQuestions(tenQuestions(resolved, questionLimit));
  }

  function changeQuestionLimit(value) {
    const count = Number(value);
    setQuestionLimit(count);

    setQuestions((current) => {
      if (current.length === count) return current;
      if (current.length < count) {
        return [
          ...current,
          ...tenQuestions(resolvedFormat, count - current.length),
        ];
      }
      return current.slice(0, count);
    });
  }

  function updateQuestion(index, changes) {
    setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, ...changes } : question));
  }

  function updateChoice(questionIndex, choiceIndex, value) {
    setQuestions((current) => current.map((question, index) => index !== questionIndex ? question : {
      ...question, choices: question.choices.map((choice, indexValue) => indexValue === choiceIndex ? value : choice),
    }));
  }

  async function importDocument(file) {
    if (!file) return;
    setBusy(true); setMessage("");
    try {
      const result = await extractDocumentText(file);
      setLessonContent(result.text);

      if (file.size <= MAX_MATERIAL_EMBED_BYTES) {
        const url = await readFileAsDataUrl(file);
        setMaterial({ name: file.name, contentType: file.type || result.contentType, size: file.size, url, importedAt: Date.now() });
        setMessageType("success");
        setMessage(`${result.name} was imported into the lesson text below. Review the formatting, then edit anything before publishing.`);
      } else {
        setMaterial(null);
        setMessageType("success");
        setMessage(`${result.name} text was imported, but the file itself is larger than 3 MB, so it cannot be previewed online. Add an external resource link below so students can open the original file.`);
      }
    } catch (error) { setMessageType("error"); setMessage(error.message || "Unable to read this document."); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  function removeMaterial() {
    setMaterial(null);
    setMessageType("success");
    setMessage("Attached file removed. The lesson text already imported into the editor is unaffected.");
  }

  function resetForm() {
    setTitle(""); setCompetency(""); setDescription(""); setLessonContent(""); setInstructions("");
    setYoutubeUrl(""); setResourceUrl(""); setMaterial(null);
    setQuestions(tenQuestions(resolvedFormat, questionLimit)); setStatus("draft"); setPublishAt(""); setExpiresAt(""); setEditingRecord(null); setPreview(false);
  }

  async function saveContent() {
    setBusy(true); setMessage("");
    try {
      if (!target) throw new Error("Select an administrator-assigned class.");
      if (!title.trim() || !competency.trim() || !description.trim()) throw new Error("Complete the title, competency, and description.");
      const saveLessonOutput = output !== "game-only";
      const saveGameOutput = output !== "lesson-only";
      if (saveLessonOutput && !lessonContent.trim()) throw new Error("Add the lesson discussion before saving.");
      if (saveGameOutput) validateQuestions(questions, questionLimit);
      const common = { title: title.trim(), description: description.trim(), competency: competency.trim(), subject, grade: target.grade, section: target.section, status, publishAt: publishAt ? new Date(publishAt).getTime() : null, expiresAt: expiresAt ? new Date(expiresAt).getTime() : null, teacherReviewed: true };
      const saved = [];

      // Built once so the standalone game and the lesson's own mastery quiz
      // always ask the exact same questions — this is the shared source of
      // truth that links "creating a lesson" and "creating a quiz" together.
      const sharedQuestions = saveGameOutput
        ? questions.map((question, index) => ({ ...question, id: `teacher-item-${index + 1}`, answer: question.choices[question.answerIndex], skill: competency.trim() }))
        : null;

      let savedGame = null;
      if (saveGameOutput) {
        const gamePayload = {
          ...common, title: output === "lesson-and-game" ? `${title.trim()} Challenge` : title.trim(),
          gameFormat: resolvedFormat, mechanic: GAME_FORMATS.find((item) => item.id === resolvedFormat)?.label || "Knowledge Challenge",
          learningGoal: competency.trim(), instructions: instructions.trim(), estimatedMinutes: 10, coverEmoji: "🎮",
          questions: sharedQuestions,
          questionLimit,
          randomizeQuestions: true,
        };
        savedGame = editingRecord?.type === "game"
          ? await updateTeacherContent("game", editingRecord.id, gamePayload)
          : await saveGame(user.uid, gamePayload);
        saved.push("game");
      }

      if (saveLessonOutput) {
        // Preserve an existing link/quiz when only re-saving the lesson half
        // of a previously published "lesson + game" pair.
        const previousLesson = editingRecord?.type === "lesson" ? editingRecord : null;
        const linkedGameId = savedGame?.id || previousLesson?.gameId || previousLesson?.connectedGameId || null;
        const lessonPayload = {
            ...common,
            content: lessonContent.trim(),
            youtubeUrl: youtubeUrl.trim(),
            resourceUrl: resourceUrl.trim(),
            material: material || null,
            requiresReadingBeforeQuiz: true,
            activities: instructions.trim() ? [instructions.trim()] : [],
            estimatedMinutes: 25,
            gameId: linkedGameId,
            connectedGameId: linkedGameId,
            quiz: sharedQuestions || previousLesson?.quiz || null,
          };
        if (editingRecord?.type === "lesson") await updateTeacherContent("lesson", editingRecord.id, lessonPayload);
        else await saveLesson(user.uid, lessonPayload);
        saved.push("lesson");
      }
      const savedLabel = [saveLessonOutput && "lesson", saveGameOutput && "game"].filter(Boolean).join(" and ");
      setMessageType("success");
      setMessage(`${savedLabel} ${status === "published" ? `published to ${target.label} and the public catalog` : "saved as a private draft"}.`);
      await loadRecords(); resetForm(); setTab("library");
    } catch (error) { setMessageType("error"); setMessage(error.message || "Unable to save learning content."); }
    finally { setBusy(false); }
  }

  function editRecord(record) {
    setEditingRecord(record);
    // Restore the class this content actually belongs to. Without this the
    // class picker keeps whatever was last selected (or defaults to the
    // first assigned class), so saving an edit would silently reassign the
    // lesson/game to the wrong grade/section and lock students out of it.
    setTargetKey(classKeyFor(record.grade, record.section));
    setTitle(record.title || "");
    setSubject(record.subject || "");
    setCompetency(record.competency || "");
    setDescription(record.description || "");
    setLessonContent(record.content || "");
    setYoutubeUrl(record.youtubeUrl || "");
    setResourceUrl(record.resourceUrl || "");
    setMaterial(record.material || null);
    setStatus(record.status || "draft");
    setPublishAt(record.publishAt ? new Date(record.publishAt).toISOString().slice(0,16) : "");
    setExpiresAt(record.expiresAt ? new Date(record.expiresAt).toISOString().slice(0,16) : "");
    setOutput(record.type === "game" ? "game-only" : "lesson-only");
    if (record.type === "game" && Array.isArray(record.questions) && record.questions.length) {
      setInstructions(record.instructions || "");
      setFormat(record.gameFormat || "auto");
      setQuestionLimit(record.questionLimit || record.questions.length);
      setQuestions(record.questions.map((question, index) => ({
        id: question.id || `item-${Date.now()}-${index}`,
        prompt: question.prompt || "",
        choices: Array.isArray(question.choices) && question.choices.length ? question.choices : ["", "", "", ""],
        answerIndex: Number.isInteger(question.answerIndex) ? question.answerIndex : 0,
        explanation: question.explanation || "",
        hint: question.hint || "",
        points: question.points || 10,
        imageUrl: question.imageUrl || "",
      })));
    }
    setTab("create");
  }

  function duplicateRecord(record) {
    setTitle(`${record.title} Copy`); setSubject(record.subject); setCompetency(record.competency || ""); setDescription(record.description || "");
    setLessonContent(record.content || ""); setYoutubeUrl(record.youtubeUrl || ""); setResourceUrl(record.resourceUrl || ""); setMaterial(record.material || null);
    setOutput(record.type === "game" ? "game-only" : "lesson-only"); setStatus("draft"); setTab("create");
    // Preselect the original class as a sensible default (teacher can still change it).
    setTargetKey(classKeyFor(record.grade, record.section));
  }

  async function deleteRecord(record) {
    const publishedWarning = record.status === "published"
      ? " It will also disappear from the public home and assigned students immediately."
      : "";
    const confirmed = window.confirm(`Delete “${record.title || "Untitled content"}”?${publishedWarning} This action cannot be undone.`);
    if (!confirmed) return;

    const recordKey = `${record.type}-${record.id}`;
    setDeletingId(recordKey); setMessage("");
    try {
      await deleteTeacherContent(user.uid, record.type, record.id);
      setRecords((current) => current.filter((item) => `${item.type}-${item.id}` !== recordKey));
      setMessageType("success");
      setMessage(`${record.type === "game" ? "Game" : "Lesson"} deleted. It is no longer available on the home catalog or student pages.`);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to delete this learning content.");
    } finally {
      setDeletingId("");
    }
  }

  return <div className="learning-content-studio">
    <header className="content-studio-hero"><div><span>LEARNING CONTENT STUDIO</span><h1>Create lessons and games your class will love</h1><p>Build teacher-authored lessons for every subject, including Mathematics, and publish only to your assigned Grade + Section.</p></div><aside><WandSparkles size={28}/><div><strong>One connected workflow</strong><span>Lesson → game → student class</span></div></aside></header>
    {!classes.length && <div className="alert error">The administrator must assign at least one Grade + Section to your account.</div>}
    {message && <div className={`alert ${messageType}`}>{message}</div>}
    <nav className="content-studio-tabs"><button className={tab === "create" ? "is-active" : ""} onClick={() => setTab("create")}><Sparkles size={17}/> Create content</button><button className={tab === "library" ? "is-active" : ""} onClick={() => setTab("library")}><LibraryBig size={17}/> My content <span>{records.length}</span></button></nav>

    {tab === "library" ? <section className="content-studio-library panel"><div className="content-studio-section-title"><LibraryBig/><div><h2>Teacher content library</h2><p>Review all lesson and game drafts and publications.</p></div></div>{records.length ? <div className="content-record-grid">{records.map((record) => { const recordKey = `${record.type}-${record.id}`; const isDeleting = deletingId === recordKey; return <article key={recordKey}><span className={`content-record-type is-${record.type}`}>{record.type === "game" ? <Gamepad2/> : <BookOpenCheck/>}{record.type}</span><h3>{record.title}</h3><p>{record.subject} · {record.grade} · {record.section}</p><div><small className={`is-${record.status}`}>{record.status}</small><span className="content-record-actions"><button onClick={() => editRecord(record)} disabled={Boolean(deletingId)}><Edit3 size={14}/> Edit</button><button onClick={() => duplicateRecord(record)} disabled={Boolean(deletingId)}><Copy size={14}/> Duplicate</button><button className="is-delete" onClick={() => void deleteRecord(record)} disabled={Boolean(deletingId)}><Trash2 size={14}/>{isDeleting ? "Deleting…" : "Delete"}</button></span></div></article>; })}</div> : <div className="content-studio-empty"><FileText/><strong>No teacher content yet</strong><p>Create your first lesson or learning game.</p></div>}</section> : <>
      <section className="content-class-picker panel"><div><strong>1. Choose the student class</strong><small>The selected class receives the published content.</small></div><div>{classes.map((item) => <button className={target?.key === item.key ? "is-active" : ""} key={item.key} onClick={() => setTargetKey(item.key)}><strong>{item.section}</strong><small>{item.grade}</small></button>)}</div></section>
      <div className="content-studio-layout"><main className="panel content-studio-builder">
        <div className="content-studio-section-title"><BookOpenCheck/><div><h2>2. Learning design</h2><p>Set the subject, competency, and output.</p></div></div>
        <div className="content-studio-form-grid"><label>Subject<select value={subject} onChange={(event) => changeSubject(event.target.value)}>{subjects.map((item) => <option key={item}>{item}</option>)}</select></label><label>Create<select value={output} onChange={(event) => setOutput(event.target.value)}>{isMathematics ? <option value="lesson-only">Mathematics lesson</option> : <><option value="lesson-and-game">Lesson + game</option><option value="lesson-only">Lesson only</option><option value="game-only">Game only</option></>}</select></label>{isMathematics && <div className="content-math-lesson-note span-2"><strong>Mathematics lesson mode</strong><span>Add the complete discussion, worked examples, guided practice, and solution steps here. Use Camera Math for the hand-controlled Math game.</span></div>}<label className="span-2">Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={isMathematics ? "Example: Multiplying 2-digit numbers" : "Clear learner-friendly title"}/></label><label className="span-2">Learning competency<textarea rows={2} value={competency} onChange={(event) => setCompetency(event.target.value)} placeholder="What should students understand or perform?"/></label><label className="span-2">Description<textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Short summary shown on the student card"/></label></div>
        {output !== "game-only" && <section className="content-lesson-editor"><div className="content-editor-heading"><div><FileText/><span><strong>{isMathematics ? "Mathematics lesson discussion" : "Lesson discussion"}</strong><small>{isMathematics ? "Include worked examples and step-by-step solutions" : "Teacher-authored material shown to students"}</small></span></div><label><Upload size={15}/> Import DOCX/PDF<input ref={fileRef} type="file" accept=".docx,.pdf,.txt,.md" onChange={(event) => void importDocument(event.target.files?.[0])}/></label></div>{material && <div className="content-material-chip"><FileText size={16}/><div><strong>{material.name}</strong><small>{material.size ? `${Math.max(1, Math.round(material.size / 1024))} KB · ` : ""}imported into the lesson text below - review and edit it before publishing</small></div><button type="button" onClick={removeMaterial}><Trash2 size={14}/></button></div>}<textarea rows={12} value={lessonContent} onChange={(event) => setLessonContent(event.target.value)} placeholder={isMathematics ? "Write or import the Math discussion, formulas, worked examples, solution steps, and guided practice…" : "Write or import the complete lesson discussion, examples, and guided practice…"}/><label className="lesson-video-input"><strong>YouTube Lesson Video (Optional)</strong><input type="url" value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=example"/></label><label className="lesson-video-input"><strong>External resource link (Optional)</strong><input type="url" value={resourceUrl} onChange={(event) => setResourceUrl(event.target.value)} placeholder="https://drive.google.com/... (use for large PDFs or slide decks)"/></label></section>}
      {output !== "lesson-only" && <section className="content-game-editor"><div className="content-studio-section-title"><Gamepad2/><div><h2>3. Choose the game</h2><p>Math is excluded; Camera Math remains in its dedicated publisher.</p></div><strong>{readyItems}/{questionLimit} ready</strong></div><div className="game-format-grid">{GAME_FORMATS.map((item) => <button className={format === item.id ? "is-active" : ""} key={item.id} onClick={() => changeFormat(item.id)}><strong>{item.label}</strong><small>{item.description}</small></button>)}</div><label className="content-game-instructions">Student instructions<textarea rows={2} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Short directions shown before the game starts"/></label><label className="question-limit-control">
  <strong>Number of Quiz/Game Questions</strong>
  <select
    value={questionLimit}
    onChange={(event) => changeQuestionLimit(event.target.value)}
  >
    {QUESTION_OPTIONS.map((count) => (
      <option key={count} value={count}>
        {count} Questions
      </option>
    ))}
  </select>
</label>
<div className="content-question-list">{questions.map((question, index) => <article key={question.id}><header><span>{index + 1}</span><div><strong>Activity {index + 1}</strong><small>{GAME_FORMATS.find((item) => item.id === resolvedFormat)?.label}</small></div><em>{question.points} points</em></header><label>Question or instruction<textarea rows={2} value={question.prompt} onChange={(event) => updateQuestion(index, { prompt: event.target.value })}/></label><div className="content-choice-grid">{question.choices.map((choice, choiceIndex) => <label className={question.answerIndex === choiceIndex ? "is-answer" : ""} key={choiceIndex}><input type="radio" name={`answer-${index}`} checked={question.answerIndex === choiceIndex} onChange={() => updateQuestion(index, { answerIndex: choiceIndex })}/><input value={choice} onChange={(event) => updateChoice(index, choiceIndex, event.target.value)} placeholder={`Choice ${String.fromCharCode(65 + choiceIndex)}`}/></label>)}</div><div className="content-question-details"><label>Explanation<input value={question.explanation} onChange={(event) => updateQuestion(index, { explanation: event.target.value })} placeholder="Why is this correct?"/></label><label>Hint<input value={question.hint} onChange={(event) => updateQuestion(index, { hint: event.target.value })} placeholder="Optional learner hint"/></label></div></article>)}</div></section>}
      </main><aside className="content-studio-publish panel"><div className="content-studio-section-title"><Rocket/><div><h2>Review and publish</h2><p>Nothing reaches students without approval.</p></div></div><div className="content-publish-summary"><span><strong>{target?.label || "No class"}</strong><small>Target class</small></span><span><strong>{subject || "No subject"}</strong><small>Subject</small></span><span><strong>{output.replaceAll("-", " ")}</strong><small>Output</small></span>{output !== "lesson-only" && <span><strong>{readyItems}/10</strong><small>Game activities</small></span>}</div><label>Publish schedule<input type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} /></label><label>Expiration date<input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label><label>Save as<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="draft">Private draft</option><option value="published">Publish now</option><option value="scheduled">Schedule publication</option></select></label><button className="content-preview-button" onClick={() => setPreview(true)}><Eye size={17}/> Preview student card</button><button className="content-save-button" onClick={() => void saveContent()} disabled={busy || !classes.length}><Save size={17}/>{busy ? "Saving…" : status === "published" ? "Approve and publish" : "Save private draft"}</button><p><CheckCircle2 size={14}/> Published content appears publicly as safe metadata, but the activity opens only for the matching signed-in class.</p></aside></div>
    </>}
    {preview && <div className="content-preview-modal" role="dialog" aria-modal="true"><button className="content-preview-backdrop" onClick={() => setPreview(false)} aria-label="Close preview"/><article><button className="content-preview-close" onClick={() => setPreview(false)}>×</button><span>{subject} · {target?.label}</span><div className="content-preview-icon">{output === "lesson-only" ? <BookOpenCheck/> : <Gamepad2/>}</div><h2>{title || "Untitled learning activity"}</h2><p>{description || "Your student-facing description will appear here."}</p><div><small>{output.replaceAll("-", " ")}</small><small>{output !== "lesson-only" ? "10 activities" : "Interactive lesson"}</small></div><button><Rocket size={16}/> Start learning</button></article></div>}
  </div>;
}
