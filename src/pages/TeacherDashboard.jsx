import {
  BookOpenCheck,
  Bot,
  Camera,
  CalendarCheck2,
  CheckCircle2,
  FilePlus2,
  Gamepad2,
  GraduationCap,
  Layers3,
  ListChecks,
  MonitorPlay,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSchoolStructure } from "../context/SchoolStructureContext";
import { subjectsForGrade } from "../data/curriculum";
import { assignedClassOptions } from "../data/schoolClasses";
import { getTeacherLessons, saveLesson } from "../services/dataService";
import { getTeacherStudentDirectory } from "../services/directoryService";
import { getTeacherCameraPrograms } from "../services/cameraContentService";

const EMPTY_FORM = { title: "", grade: "", section: "", subject: "Mathematics", description: "", content: "", competency: "", status: "draft" };

export default function TeacherDashboard() {
  const { user, profile } = useAuth();
  const { structure } = useSchoolStructure();
  const classOptions = useMemo(() => assignedClassOptions(profile, { structure }), [profile, structure]);
  const concreteClasses = useMemo(() => assignedClassOptions(profile, { includeAllSections: false, structure }), [profile, structure]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [metrics, setMetrics] = useState({ students: 0, lessons: 0, published: 0, cameraLevels: 0 });
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [busy, setBusy] = useState(false);
  const subjectOptions = useMemo(() => subjectsForGrade(form.grade), [form.grade]);

  useEffect(() => {
    if (!classOptions.length || form.grade) return;
    setForm((current) => ({ ...current, grade: classOptions[0].grade, section: classOptions[0].section }));
  }, [classOptions, form.grade]);

  useEffect(() => {
    if (!subjectOptions.length || subjectOptions.includes(form.subject)) return;
    setForm((current) => ({ ...current, subject: subjectOptions[0] }));
  }, [form.subject, subjectOptions]);

  useEffect(() => {
    if (!user?.uid) return;
    Promise.all([getTeacherStudentDirectory({ includeSharedDevice: true }), getTeacherLessons(user.uid), getTeacherCameraPrograms(profile)])
      .then(([students, lessons, cameraPrograms]) => setMetrics({ students: students.length, lessons: lessons.length, published: lessons.filter((item) => item.status === "published").length, cameraLevels: cameraPrograms.filter((item) => item.status === "published").length }))
      .catch((error) => console.warn("Unable to load teacher dashboard totals:", error));
  }, [profile, user?.uid]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await saveLesson(user.uid, form);
      setMetrics((current) => ({ ...current, lessons: current.lessons + 1 }));
      setForm((current) => ({ ...EMPTY_FORM, grade: current.grade, section: current.section, subject: current.subject }));
      setMessageType("success");
      setMessage(form.status === "published"
        ? `Lesson published on the home catalog and delivered to ${form.grade} · ${form.section}.`
        : `Lesson saved as a private draft for ${form.grade} · ${form.section}.`);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to save the lesson draft.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="teacher-dashboard-page">
      <header className="teacher-dashboard-hero">
          <div><span>TEACHER COMMAND CENTER</span><h1>Welcome back, {profile?.name || "Teacher"}</h1><p>Manage assigned classes, create lessons and learning games, publish Camera Math, and monitor student progress from one professional workspace.</p><div><Link to="/teacher/content-studio" className="teacher-dashboard-primary"><Sparkles size={18} /> Upload lesson or create game</Link><Link to="/teacher/game-zone" className="teacher-dashboard-secondary"><MonitorPlay size={18} /> Open Game Zone</Link><Link to="/teacher/camera-content" className="teacher-dashboard-secondary"><Camera size={18} /> Camera Math</Link><Link to="/teacher/students" className="teacher-dashboard-secondary"><Users size={18} /> View my learners</Link></div></div>
        <aside><span><Bot size={24} /></span><div><small>SMART CONTENT WORKFLOW</small><strong>Lesson plan → lesson + game</strong><p>Original lesson files are displayed read-only to students. Games are created separately when needed.</p></div></aside>
      </header>

      {concreteClasses.length > 0 && <section className="teacher-class-switcher" aria-label="Assigned class selector"><div><GraduationCap size={19} /><span><strong>Working class</strong><small>Select the section you want to manage</small></span></div><div>{concreteClasses.map((item) => { const active = item.grade === form.grade && item.section === form.section; return <button type="button" className={active ? "is-active" : ""} aria-pressed={active} key={item.key} onClick={() => setForm((current) => ({ ...current, grade: item.grade, section: item.section }))}><span>{item.section}</span><small>{item.grade}</small></button>; })}</div><Link to="/teacher/attendance">Open attendance</Link></section>}

      <section className="teacher-dashboard-metrics">
        <article><span><Users size={20} /></span><div><strong>{metrics.students}</strong><small>Assigned learners</small></div></article>
        <article><span><Layers3 size={20} /></span><div><strong>{concreteClasses.length}</strong><small>Assigned classes</small></div></article>
        <article><span><BookOpenCheck size={20} /></span><div><strong>{metrics.lessons}</strong><small>Lesson records</small></div></article>
        <article><span><CheckCircle2 size={20} /></span><div><strong>{metrics.published}</strong><small>Published lessons</small></div></article>
        <article><span><Camera size={20} /></span><div><strong>{metrics.cameraLevels}</strong><small>Live camera levels</small></div></article>
      </section>

      {!classOptions.length && <div className="alert error">No class assignment is available. Ask the administrator to assign your grade and section.</div>}
      {message && <div className={`alert ${messageType}`} role="status">{message}</div>}

      <div className="teacher-dashboard-grid">
        <section className="panel teacher-quick-create">
          <div className="teacher-studio-section-heading"><span><FilePlus2 size={20} /></span><div><h2>Quick lesson publisher</h2><p>Create a curriculum-aligned lesson for one assigned class.</p></div></div>
          <p style={{ marginBottom: 16 }}><Link to="/teacher/content-studio">Upload a DOCX or PDF unchanged in Content Studio →</Link></p>
          <form className="teacher-studio-form" onSubmit={submit}>
            <label className="span-2">Lesson title<input required value={form.title} onChange={(event) => updateField("title", event.target.value)} placeholder="Clear, learner-friendly lesson title" /></label>
            <label>Assigned class<select value={`${form.grade}|${form.section}`} onChange={(event) => { const selected = classOptions.find((item) => `${item.grade}|${item.section}` === event.target.value); if (selected) setForm((current) => ({ ...current, grade: selected.grade, section: selected.section })); }} disabled={!classOptions.length}>{classOptions.map((item) => <option key={item.key} value={`${item.grade}|${item.section}`}>{item.label}</option>)}</select></label>
            <label>Subject<select value={form.subject} onChange={(event) => updateField("subject", event.target.value)}>{subjectOptions.map((subject) => <option key={subject}>{subject}</option>)}</select></label>
            <label className="span-2">Learning competency<input required value={form.competency} onChange={(event) => updateField("competency", event.target.value)} placeholder="The specific MATATAG skill learners will develop" /></label>
            <label className="span-2">Description<textarea required rows={3} value={form.description} onChange={(event) => updateField("description", event.target.value)} placeholder="What will learners understand and practice?" /></label>
            <label className="span-2">Lesson content<textarea required rows={9} value={form.content} onChange={(event) => updateField("content", event.target.value)} placeholder="Add the lesson discussion, examples, and directions." /></label>
            <label>Publishing<select value={form.status} onChange={(event) => updateField("status", event.target.value)}><option value="draft">Private draft</option><option value="published">Publish to home and class</option></select></label>
            <button className="primary-button" disabled={busy || !classOptions.length}><FilePlus2 size={18} />{busy ? "Saving…" : form.status === "published" ? "Publish lesson" : "Save lesson draft"}</button>
          </form>
        </section>

        <aside className="teacher-dashboard-side">
          <section className="panel teacher-assignment-card"><div className="teacher-studio-section-heading"><span><GraduationCap size={20} /></span><div><h2>My assigned classes</h2><p>Controlled by the administrator.</p></div></div><div>{concreteClasses.map((item) => <span key={item.key}>{item.label}</span>)}</div>{!concreteClasses.length && <p>No class has been assigned.</p>}</section>
          <section className="teacher-ai-cta"><span><Gamepad2 size={28} /></span><div><small>LEARNING CONTENT STUDIO</small><h2>Build a lesson and interactive game together</h2><p>Upload the original DOCX or PDF, optionally add a game, and publish to your assigned class.</p><Link to="/teacher/content-studio">Open Content Studio</Link></div></section>
          <section className="teacher-camera-dashboard-cta"><span><Camera size={28} /></span><div><small>CAMERA CONTENT PUBLISHER</small><h2>Control every Camera Math and English level</h2><p>Write the exact 10 activities, select Grade + Section, review answers, and publish directly to assigned students.</p><Link to="/teacher/camera-content">Open Camera Publisher</Link></div></section>
          <section className="teacher-quiz-dashboard-cta"><span><ListChecks size={28} /></span><div><small>GOOGLE FORMS-STYLE QUIZZES</small><h2>Create and publish class assessments</h2><p>Add question types, answer keys, points, due dates, and automatic scoring for one assigned Grade + Section.</p><Link to="/teacher/quizzes/new">Create a quiz</Link></div></section>
          <section className="teacher-attendance-dashboard-cta"><span><CalendarCheck2 size={28} /></span><div><small>DAILY CLASS REGISTER</small><h2>Record learner attendance</h2><p>Track present, absent, late, and excused learners with monthly monitoring and a professional Word report.</p><Link to="/teacher/attendance">Open Attendance Tracker</Link></div></section>
        </aside>
      </div>
    </div>
  );
}
