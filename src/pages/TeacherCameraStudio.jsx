import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  FileUp,
  Focus,
  Gamepad2,
  Layers3,
  LoaderCircle,
  PanelLeftOpen,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolStructure } from "../context/SchoolStructureContext";
import { assignedClassOptions } from "../data/schoolClasses";
import {
  CAMERA_LEVELS,
  CAMERA_LEVEL_FOCUS,
  CAMERA_TRACKS,
  cameraItemIsComplete,
  createEmptyCameraItems,
  deleteTeacherCameraProgram,
  getTeacherCameraPrograms,
  importCameraItemsFromText,
  saveTeacherCameraProgram,
  validateCameraItems,
} from "../services/cameraContentService";
import { extractDocumentText } from "../utils/documentTextExtractor";
import { getLearningWeek } from "../utils/gameEngine";

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(Number(value) || value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function newForm(classOption) {
  return {
    grade: classOption?.grade || "",
    section: classOption?.section || "",
    track: "math",
    level: 1,
    title: "",
    competency: "",
    instructions: "",
    expiresAt: "",
    questions: createEmptyCameraItems("math"),
  };
}

const TRACK_ICONS = Object.freeze({
  math: Gamepad2,
  english: BookOpenCheck,
  sort: Layers3,
  sentence: ClipboardCheck,
  spelling: Sparkles,
  picture: Camera,
  truefalse: Target,
});

export default function TeacherCameraStudio() {
  const { profile } = useAuth();
  const { structure } = useSchoolStructure();
  const classes = useMemo(() => assignedClassOptions(profile, { includeAllSections: false, structure }), [profile, structure]);
  const week = useMemo(() => getLearningWeek(), []);
  const [form, setForm] = useState(() => newForm(classes[0]));
  const [programs, setPrograms] = useState([]);
  const [expandedItem, setExpandedItem] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [openSetupStep, setOpenSetupStep] = useState(null);
  const [focusMode, setFocusMode] = useState(() => window.localStorage.getItem("jidanao-camera-creator-focus") === "true");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const fileRef = useRef(null);

  const loadPrograms = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      setPrograms(await getTeacherCameraPrograms(profile));
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Camera content could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { void loadPrograms(); }, [loadPrograms]);

  useEffect(() => {
    window.localStorage.setItem("jidanao-camera-creator-focus", String(focusMode));
    document.body.classList.toggle("teacher-camera-focus-mode", focusMode);
    return () => document.body.classList.remove("teacher-camera-focus-mode");
  }, [focusMode]);

  useEffect(() => {
    if (!classes.length || form.grade) return;
    setForm(newForm(classes[0]));
  }, [classes, form.grade]);

  const selectedProgram = useMemo(() => programs.find((program) =>
    program.classKey === classes.find((item) => item.grade === form.grade && item.section === form.section)?.key
      && program.track === form.track
      && Number(program.level) === Number(form.level),
  ), [classes, form.grade, form.level, form.section, form.track, programs]);

  useEffect(() => {
    if (selectedProgram) {
      setForm((current) => ({
        ...current,
        title: selectedProgram.title || "",
        competency: selectedProgram.competency || "",
        instructions: selectedProgram.instructions || "",
        expiresAt: toLocalDateTime(selectedProgram.expiresAt),
        questions: selectedProgram.questions,
      }));
    } else {
      setForm((current) => ({
        ...current,
        title: "",
        competency: "",
        instructions: "",
        expiresAt: "",
        questions: createEmptyCameraItems(current.track),
      }));
    }
    setExpandedItem(0);
  }, [form.grade, form.level, form.section, form.track, selectedProgram]);

  const validation = useMemo(() => validateCameraItems(form.questions, form.track), [form.questions, form.track]);
  const completedItems = useMemo(() => form.questions.filter((item) => cameraItemIsComplete(item, form.track)).length, [form.questions, form.track]);
  const scopedPrograms = useMemo(() => programs.filter((program) =>
    program.grade === form.grade && program.section === form.section && program.track === form.track,
  ), [form.grade, form.section, form.track, programs]);

  function selectClass(value) {
    const selected = classes.find((item) => item.key === value);
    if (!selected) return;
    setForm((current) => ({ ...current, grade: selected.grade, section: selected.section }));
  }

  function selectTrack(track) {
    if (!CAMERA_TRACKS[track]) return;
    setForm((current) => ({
      ...current,
      track,
      title: "",
      competency: "",
      instructions: "",
      expiresAt: "",
      questions: createEmptyCameraItems(track),
    }));
  }

  function updateItem(index, field, value, choiceIndex = -1) {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        if (field === "choice") {
          return { ...item, choices: item.choices.map((choice, indexValue) => indexValue === choiceIndex ? value : choice) };
        }
        return { ...item, [field]: value };
      }),
    }));
  }

  async function importDocument(file) {
    if (!file) return;
    setImporting(true);
    setMessage("");
    try {
      const material = await extractDocumentText(file);
      const questions = importCameraItemsFromText(material.text, form.track);
      setForm((current) => ({ ...current, questions }));
      setExpandedItem(0);
      setMessageType("success");
      setMessage(`${material.name} filled all 10 ${CAMERA_TRACKS[form.track].label} activities. Review every item before publishing.`);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "The document could not be converted into camera activities.");
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setImporting(false);
    }
  }

  async function save(status) {
    setBusy(true);
    setMessage("");
    try {
      const saved = await saveTeacherCameraProgram(profile, { ...form, status });
      setPrograms((current) => [saved, ...current.filter((item) => !(
        item.classKey === saved.classKey && item.track === saved.track && item.level === saved.level
      ))]);
      setMessageType("success");
      setMessage(status === "published"
        ? `${saved.title} is now live for ${saved.grade} · ${saved.section}. Students receive these exact 10 activities in Level ${saved.level}.`
        : `${saved.title} was saved as a private draft.`);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Camera content could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function removeLevel() {
    if (!selectedProgram) return;
    const label = `${CAMERA_TRACKS[form.track]?.label || "Camera"} · Level ${form.level}`;
    const confirmed = window.confirm(
      `Delete ${label} for ${form.grade} · ${form.section}?\n\nThis removes the draft and any published version. Students will no longer see this level.`
    );
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      const classKeyValue = classes.find((item) => item.grade === form.grade && item.section === form.section)?.key;
      await deleteTeacherCameraProgram(profile, {
        classKey: classKeyValue || selectedProgram.classKey,
        track: form.track,
        level: form.level,
      });
      setPrograms((current) => current.filter((item) => !(
        item.classKey === (classKeyValue || selectedProgram.classKey)
        && item.track === form.track
        && Number(item.level) === Number(form.level)
      )));
      setForm((current) => ({
        ...current,
        title: "",
        competency: "",
        instructions: "",
        expiresAt: "",
        questions: createEmptyCameraItems(current.track),
      }));
      setMessageType("success");
      setMessage(`${label} was deleted.`);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Camera level could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  const classKey = classes.find((item) => item.grade === form.grade && item.section === form.section)?.key || "";
  const activeItemIndex = Math.max(0, Math.min(expandedItem, form.questions.length - 1));
  const activeItem = form.questions[activeItemIndex];
  const activeItemComplete = cameraItemIsComplete(activeItem, form.track);
  const trackMeta = CAMERA_TRACKS[form.track];
  const liveLevelCount = scopedPrograms.filter((item) => item.status === "published").length;

  function toggleSetupStep(step) {
    setOpenSetupStep((current) => current === step ? null : step);
  }

  function scrollToEditor(targetId) {
    setOpenSetupStep(null);
    window.requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className={`teacher-camera-page ${focusMode ? "is-focus-mode" : ""}`}>
      <header className="teacher-camera-hero">
        <div>
          <span><Camera size={16} /> CAMERA LEARNING PUBLISHER</span>
          <h1>Create one camera-learning level at a time</h1>
          <p>Follow the five steps below. Choose the class, activity, and level first—then prepare and review exactly 10 student activities before publishing.</p>
          <div className="teacher-camera-hero__badges"><b><Target size={15} /> 10 levels</b><b><Gamepad2 size={15} /> 10 items per level</b><b><ShieldCheck size={15} /> Assigned classes only</b></div>
        </div>
        <aside>
          <CalendarDays size={25} />
          <div>
            <small>CURRENT WORKSPACE</small>
            <strong>{form.grade && form.section ? `${form.grade} · ${form.section}` : "Choose a class"}</strong>
            <span>{trackMeta.label} · Level {form.level}<br />{form.track === "math" ? `Math mission: ${week.label}` : trackMeta.shortDescription}</span>
          </div>
        </aside>
      </header>

      {!classes.length && <div className="alert error">No Grade + Section is assigned to your account. Ask the administrator to assign a class first.</div>}
      {message && <div className={`alert ${messageType}`} role="status">{message}</div>}

      <section className={`teacher-camera-steps ${openSetupStep ? "has-open-step" : ""}`} aria-label="Camera content creation steps">
        <nav className="teacher-camera-steps__bar" aria-label="Camera content workflow">
          <button type="button" className={`${classKey ? "is-complete" : "is-current"} ${openSetupStep === 1 ? "is-open" : ""}`} onClick={() => toggleSetupStep(1)} aria-expanded={openSetupStep === 1} aria-controls="teacher-camera-step-panel">
            <span>1</span><div><strong>Choose class</strong><small>{form.grade && form.section ? `${form.grade} · ${form.section}` : "Grade and Section"}</small></div><ChevronDown size={17} />
          </button>
          <button type="button" className={`${form.track ? "is-complete" : ""} ${openSetupStep === 2 ? "is-open" : ""}`} onClick={() => toggleSetupStep(2)} aria-expanded={openSetupStep === 2} aria-controls="teacher-camera-step-panel">
            <span>2</span><div><strong>Choose activity</strong><small>{CAMERA_TRACKS[form.track].label}</small></div><ChevronDown size={17} />
          </button>
          <button type="button" className={`${form.level ? "is-complete" : ""} ${openSetupStep === 3 ? "is-open" : ""}`} onClick={() => toggleSetupStep(3)} aria-expanded={openSetupStep === 3} aria-controls="teacher-camera-step-panel">
            <span>3</span><div><strong>Choose level</strong><small>Level {form.level} · {liveLevelCount}/10 live</small></div><ChevronDown size={17} />
          </button>
          <button type="button" className={completedItems === 10 ? "is-complete" : "is-current"} onClick={() => scrollToEditor("teacher-camera-content-editor")}>
            <span>4</span><div><strong>Prepare content</strong><small>{completedItems}/10 ready</small></div>
          </button>
          <button type="button" className={validation.valid ? "is-current is-complete" : ""} onClick={() => scrollToEditor("teacher-camera-review-publish")}>
            <span>5</span><div><strong>Review & publish</strong><small>{validation.valid ? "Ready to send" : "Send to class"}</small></div>
          </button>
        </nav>

        {openSetupStep && (
          <div id="teacher-camera-step-panel" className={`teacher-camera-step-drawer is-step-${openSetupStep}`}>
            <header>
              <div className="teacher-camera-step-title"><b>{openSetupStep}</b><div><strong>{openSetupStep === 1 ? "Choose the student class" : openSetupStep === 2 ? "Choose the learning activity" : "Choose the learning level"}</strong><small>{openSetupStep === 1 ? "Only the selected Grade and Section receives this level." : openSetupStep === 2 ? "Select the exact camera activity students will play." : "Select one level to create or update."}</small></div></div>
              <div className="teacher-camera-step-drawer__actions">
                <button type="button" className="teacher-camera-refresh" onClick={() => void loadPrograms()} disabled={loading} title="Refresh saved camera levels"><RefreshCw size={17} className={loading ? "spin" : ""} /></button>
                <button type="button" className="teacher-camera-step-close" onClick={() => setOpenSetupStep(null)} aria-label="Close setup options"><X size={18} /></button>
              </div>
            </header>

            {openSetupStep === 1 && (
              <div className="teacher-camera-drawer-class">
                <label className="teacher-camera-class-select"><span>Assigned Grade and Section</span><select value={classKey} onChange={(event) => selectClass(event.target.value)} disabled={!classes.length}>{classes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
                <button type="button" className="primary-button" onClick={() => setOpenSetupStep(2)} disabled={!classKey}>Continue to activity <ArrowRight size={17} /></button>
              </div>
            )}

            {openSetupStep === 2 && (
              <div className="teacher-camera-track-tabs teacher-camera-track-tabs--drawer" role="group" aria-label="Camera learning track">
                {Object.values(CAMERA_TRACKS).map((track) => {
                  const TrackIcon = TRACK_ICONS[track.id] || Camera;
                  return <button type="button" key={track.id} className={form.track === track.id ? "is-active" : ""} onClick={() => selectTrack(track.id)}><TrackIcon size={20} /><span><strong>{track.label}</strong><small>{track.shortDescription}</small></span>{form.track === track.id && <CheckCircle2 size={17} />}</button>;
                })}
                <button type="button" className="teacher-camera-drawer-next" onClick={() => setOpenSetupStep(3)}>Continue to level <ArrowRight size={17} /></button>
              </div>
            )}

            {openSetupStep === 3 && (
              <div className="teacher-camera-drawer-levels">
                <div className="teacher-camera-level-summary"><span>{CAMERA_TRACKS[form.track].label} levels</span><b>{liveLevelCount}/10 published</b></div>
                <div className="teacher-camera-level-grid">
                  {CAMERA_LEVELS.map((level) => {
                    const program = scopedPrograms.find((item) => item.level === level);
                    const expired = program?.status === "published" && program?.expiresAt && Number(program.expiresAt) <= Date.now();
                    const statusLabel = !program
                      ? "Not created"
                      : program.status === "published"
                        ? (expired ? "Expired" : program.expiresAt ? "Published · timed" : "Published")
                        : "Draft";
                    return <button type="button" key={level} className={`${form.level === level ? "is-active" : ""} ${program?.status === "published" && !expired ? "is-published" : program ? "is-draft" : ""}`} onClick={() => { setForm((current) => ({ ...current, level })); setOpenSetupStep(null); }}><span>{level}</span><div><strong>Level {level}</strong><small>{statusLabel}</small></div>{program?.status === "published" && !expired && <CheckCircle2 size={16} />}</button>;
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="teacher-camera-layout">
        <main id="teacher-camera-content-editor" className="teacher-camera-builder panel">
          <div className="teacher-camera-builder__head">
            <div><span>{focusMode ? "FOCUS MODE · GAME LEVEL EDITOR" : "STEP 4 · PREPARE CONTENT"}</span><h2>{selectedProgram ? "Review or update this level" : "Create this learning level"}</h2><p>{form.grade} · {form.section} · {CAMERA_TRACKS[form.track].label} · Level {form.level}</p></div>
            <div className="teacher-camera-builder__tools">
              <button type="button" className={`teacher-camera-focus-toggle ${focusMode ? "is-active" : ""}`} onClick={() => setFocusMode((current) => !current)} aria-pressed={focusMode}>
                {focusMode ? <PanelLeftOpen size={18} /> : <Focus size={18} />}
                <span>{focusMode ? "Show setup options" : "Focus on creating"}</span>
              </button>
              <div className={`teacher-camera-readiness ${validation.valid ? "is-ready" : ""}`}><strong>{completedItems}/10</strong><span>items ready</span></div>
            </div>
          </div>

          <div className="teacher-camera-level-focus"><Sparkles size={19} /><div><span>RECOMMENDED LEVEL {form.level} PROGRESSION</span><strong>{CAMERA_LEVEL_FOCUS[form.track][form.level - 1]}</strong><small>Use new learning content at every level. Jidanao blocks repeated teacher content within the same track.</small></div></div>

          <section className="teacher-camera-form-section">
            <div className="teacher-camera-section-heading"><span><Layers3 size={20} /></span><div><small>PART A</small><h3>Describe the learning level</h3><p>Give students a clear title, learning goal, and short instructions.</p></div></div>
            <div className="teacher-camera-meta-form">
              <label>Level title<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder={`${CAMERA_TRACKS[form.track].label} · Level ${form.level}`} /></label>
              <label>Learning competency<textarea rows={3} value={form.competency} onChange={(event) => setForm((current) => ({ ...current, competency: event.target.value }))} placeholder="What must students understand or perform?" /></label>
              <label>Student instructions<textarea rows={3} value={form.instructions} onChange={(event) => setForm((current) => ({ ...current, instructions: event.target.value }))} placeholder="Short, clear directions shown before the level starts." /></label>
            </div>
          </section>

          <section className="teacher-camera-form-section">
            <div className="teacher-camera-section-heading"><span><ClipboardCheck size={20} /></span><div><small>PART B</small><h3>Prepare the 10 activities</h3><p>Import a document to fill the editor, or enter each activity manually.</p></div></div>
            <label className="teacher-camera-import">
              <input ref={fileRef} type="file" accept=".docx,.pdf,.txt,.md,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={(event) => void importDocument(event.target.files?.[0])} />
              {importing ? <LoaderCircle size={23} className="spin" /> : <FileUp size={23} />}
              <span><strong>{importing ? "Reading document…" : "Import DOCX or PDF to fill all 10 activities"}</strong><small>{trackMeta.kind === "reading" ? trackMeta.importHint : `Use: ${trackMeta.importHint}`}</small></span>
              <b>{importing ? "Please wait" : "Choose document"}</b>
            </label>

            <div className="teacher-camera-item-progress">
              <div><strong>Activity progress</strong><span>Select a number to edit that activity.</span></div>
              <nav aria-label="Select an activity">
                {form.questions.map((item, index) => {
                  const complete = cameraItemIsComplete(item, form.track);
                  return <button type="button" key={`activity-nav-${index + 1}`} className={`${activeItemIndex === index ? "is-active" : ""} ${complete ? "is-complete" : ""}`} onClick={() => setExpandedItem(index)} aria-label={`Edit activity ${index + 1}${complete ? ", ready" : ""}`}>{complete ? <CheckCircle2 size={17} /> : index + 1}</button>;
                })}
              </nav>
            </div>

            <article className={`teacher-camera-active-item ${activeItemComplete ? "is-complete" : ""}`}>
              <header>
                <span>{activeItemComplete ? <CheckCircle2 size={20} /> : activeItemIndex + 1}</span>
                <div><small>ACTIVITY {activeItemIndex + 1} OF 10</small><h3>{trackMeta.kind === "reading" ? "Reading passage and coaching" : `${trackMeta.label} content`}</h3><p>{activeItemComplete ? "This activity is complete and ready for review." : "Complete every required field before moving to publishing."}</p></div>
              </header>
              {trackMeta.kind === "reading" ? (
                <div className="teacher-camera-item__form">
                  <label className="span-2">Passage or sentence<textarea rows={4} value={activeItem.readingText} onChange={(event) => updateItem(activeItemIndex, "readingText", event.target.value)} placeholder="Enter the exact English text the student must read aloud." /></label>
                  <label>Reading skill<input value={activeItem.skill} onChange={(event) => updateItem(activeItemIndex, "skill", event.target.value)} placeholder="Fluency, phrasing, vocabulary…" /></label>
                  <label>Pass accuracy<select value={activeItem.passAccuracy} onChange={(event) => updateItem(activeItemIndex, "passAccuracy", Number(event.target.value))}><option value="60">60% · guided</option><option value="65">65% · developing</option><option value="70">70% · standard</option><option value="75">75% · confident</option><option value="80">80% · mastery</option><option value="85">85% · advanced</option></select></label>
                  <label className="span-2">Coaching tip<textarea rows={2} value={activeItem.coachingTip} onChange={(event) => updateItem(activeItemIndex, "coachingTip", event.target.value)} placeholder="Example: Pause at commas and emphasize the key idea." /></label>
                </div>
              ) : (
                <div className="teacher-camera-item__form">
                  <label className="span-2">{trackMeta.questionLabel}<textarea rows={3} value={activeItem.prompt} onChange={(event) => updateItem(activeItemIndex, "prompt", event.target.value)} placeholder={trackMeta.questionPlaceholder} /></label>
                  <label>{trackMeta.answerLabel}{trackMeta.kind === "boolean"
                    ? <select value={activeItem.answer} onChange={(event) => updateItem(activeItemIndex, "answer", event.target.value)}><option value="">Choose answer</option><option value="True">True</option><option value="False">False</option></select>
                    : <input value={activeItem.answer} onChange={(event) => updateItem(activeItemIndex, "answer", event.target.value)} placeholder={trackMeta.answerPlaceholder} />}</label>
                  <label>Skill<input value={activeItem.skill} onChange={(event) => updateItem(activeItemIndex, "skill", event.target.value)} placeholder={trackMeta.kind === "sequence" ? "Word order, grammar, spelling…" : "Name the learning skill"} /></label>
                  <div className={`teacher-camera-choices span-2 ${trackMeta.kind === "sequence" ? "is-sequence" : ""}`}>
                    <div className="teacher-camera-choices__guide"><strong>{trackMeta.kind === "sequence" ? "Enter blocks in the correct order" : `${trackMeta.choiceLabel}s`}</strong><span>{trackMeta.kind === "sequence" ? "The game will shuffle these blocks for the learner." : "The learner will pinch and drag one of these choices."}</span></div>
                    {activeItem.choices.map((choice, choiceIndex) => <label key={choiceIndex}><span>{trackMeta.kind === "sequence" ? choiceIndex + 1 : String.fromCharCode(65 + choiceIndex)}</span><input value={choice} disabled={trackMeta.kind === "boolean"} onChange={(event) => updateItem(activeItemIndex, "choice", event.target.value, choiceIndex)} placeholder={`${trackMeta.choiceLabel} ${choiceIndex + 1}`} /></label>)}
                  </div>
                  <label className="span-2">{trackMeta.explanationLabel}<textarea rows={3} value={activeItem.explanation} onChange={(event) => updateItem(activeItemIndex, "explanation", event.target.value)} placeholder={trackMeta.explanationPlaceholder} /></label>
                </div>
              )}
              <footer>
                <button type="button" className="ghost-button" onClick={() => setExpandedItem((current) => Math.max(0, current - 1))} disabled={activeItemIndex === 0}><ArrowLeft size={17} /> Previous</button>
                <span>{activeItemComplete ? <><CheckCircle2 size={16} /> Activity complete</> : <><CircleHelp size={16} /> Still needs information</>}</span>
                <button type="button" className="primary-button" onClick={() => setExpandedItem((current) => Math.min(9, current + 1))} disabled={activeItemIndex === 9}>Next activity <ArrowRight size={17} /></button>
              </footer>
            </article>
          </section>

          <section id="teacher-camera-review-publish" className={`teacher-camera-review ${validation.valid ? "is-ready" : ""}`}>
            <div className="teacher-camera-review__head"><span><ShieldCheck size={22} /></span><div><small>STEP 5</small><h3>Review and publish</h3><p>Nothing reaches students until you press Publish. You can also set an optional expiration and delete existing levels.</p></div><b>{validation.valid ? "Ready to publish" : `${completedItems}/10 activities ready`}</b></div>
            {!validation.valid && <div className="teacher-camera-validation"><Target size={18} /><div><strong>{validation.errors.length} publishing check{validation.errors.length === 1 ? "" : "s"} remaining</strong><span>{validation.errors.slice(0, 3).join(" ")}</span></div></div>}
            <div className="teacher-camera-review__summary">
              <div><span>Destination</span><strong>{form.grade} · {form.section}</strong></div>
              <div><span>Activity</span><strong>{CAMERA_TRACKS[form.track].label}</strong></div>
              <div><span>Level</span><strong>Level {form.level}</strong></div>
              <div><span>Ready items</span><strong>{completedItems} of 10</strong></div>
              <div><span>Status</span><strong>{selectedProgram?.status === "published" ? "Published (editing)" : selectedProgram ? "Draft (editing)" : "New level"}</strong></div>
            </div>

            <label className="teacher-camera-field" style={{ display: "block", margin: "1rem 0" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600 }}>
                <CalendarDays size={16} /> Expiration <small style={{ fontWeight: 400, opacity: 0.75 }}>(optional — same as lessons)</small>
              </span>
              <input
                type="datetime-local"
                value={form.expiresAt || ""}
                onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))}
                disabled={busy}
                style={{ width: "100%", marginTop: "0.4rem", padding: "0.55rem 0.75rem", borderRadius: "10px", border: "1px solid #cbd5e1" }}
              />
              <small style={{ display: "block", marginTop: "0.35rem", opacity: 0.8 }}>
                {form.expiresAt
                  ? `Students can play until ${new Date(form.expiresAt).toLocaleString()}. After that the level is hidden automatically.`
                  : "Leave empty for no expiration. Students can play this level until you delete it or set an end time."}
              </small>
            </label>

            <div className="teacher-camera-actions" style={{ flexWrap: "wrap", gap: "0.6rem" }}>
              <button type="button" className="secondary-button" onClick={() => void save("draft")} disabled={busy || !classes.length}>
                <Save size={18} /> {busy ? "Saving…" : selectedProgram ? "Save changes as draft" : "Save private draft"}
              </button>
              <button type="button" className="success-button" onClick={() => void save("published")} disabled={busy || !validation.valid || !classes.length}>
                <Send size={18} /> {busy ? "Publishing…" : selectedProgram?.status === "published" ? `Update published Level ${form.level}` : `Publish Level ${form.level} to ${form.section}`}
              </button>
              {selectedProgram && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void removeLevel()}
                  disabled={busy}
                  style={{ color: "#b91c1c", borderColor: "#fecaca" }}
                >
                  <Trash2 size={18} /> Delete this level
                </button>
              )}
            </div>
            <p className="teacher-camera-publish-note">
              <ShieldCheck size={14} /> Only students in {form.grade} · {form.section} can open this level.
              {selectedProgram ? " You are editing an existing level — save or publish to update it, or delete to remove it." : " Republishing replaces the previous content for this class, activity, and level."}
            </p>
          </section>
        </main>
      </div>

      <section className="teacher-camera-flow">
        <div><Sparkles size={21} /><strong>You prepare</strong><span>Review all 10 activities</span></div><i />
        <div><Send size={21} /><strong>You publish</strong><span>Only to the selected class</span></div><i />
        <div><Camera size={21} /><strong>Students play</strong><span>Your approved content</span></div><i />
        <div><CheckCircle2 size={21} /><strong>Results save</strong><span>Level and weekly progress</span></div>
      </section>
    </div>
  );
}
