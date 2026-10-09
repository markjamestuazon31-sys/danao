import { get, onValue, push, ref, remove, set } from "firebase/database";
import { database } from "../firebase/firebaseConfig";
import { normalizeAssignedClasses } from "../data/schoolClasses";

function entries(value) {
  return value && typeof value === "object" ? Object.entries(value) : [];
}

function download(filename, value, type = "application/json") {
  const blob = new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatReportDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function reportTable(headers, rows, emptyMessage) {
  const heading = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${headers.length}" class="empty">${escapeHtml(emptyMessage)}</td></tr>`;
  return `<table><thead><tr>${heading}</tr></thead><tbody>${body}</tbody></table>`;
}

export async function getAdminOperations() {
  const paths = ["users", "lessons", "games", "quizBank", "attendance", "gradeDrafts", "grades", "certificates", "publishedSchoolStructure", "announcements", "adminAudit"];
  const snapshots = await Promise.all(paths.map((path) => get(ref(database, path))));
  const data = Object.fromEntries(paths.map((path, index) => [path, snapshots[index].exists() ? snapshots[index].val() : {}]));
  const users = entries(data.users).map(([uid, profile]) => ({ uid, ...profile }));
  const teachers = users.filter((user) => user.role === "teacher" && user.status !== "disabled");
  const students = users.filter((user) => user.role === "student" && user.status !== "disabled");
  const lessons = entries(data.lessons).map(([id, item]) => ({ id, type: "lesson", ...item }));
  const games = entries(data.games).map(([id, item]) => ({ id, type: "game", ...item }));
  const quizzes = entries(data.quizBank).map(([id, item]) => ({ id, ...item }));
  const attendanceDays = entries(data.attendance).flatMap(([classKey, classDays]) => entries(classDays).map(([date, records]) => ({ classKey, date, count: entries(records).length })));
  const today = new Date().toISOString().slice(0, 10);
  const publishedClasses = entries(data.publishedSchoolStructure?.grades).flatMap(([gradeKey, grade]) => entries(grade?.sections).map(([sectionKey, section]) => ({ classKey: `${gradeKey}__${sectionKey}`, grade: grade.name, section: section.name })));

  const tasks = [
    ...teachers.filter((teacher) => !Object.keys(normalizeAssignedClasses(teacher.assignedClasses, teacher, data.publishedSchoolStructure)).length).map((teacher) => ({ kind: "teacher", severity: "high", title: `${teacher.name || teacher.email} has no assigned class`, detail: "Assign at least one Grade and Section.", route: "/admin/teachers" })),
    ...students.filter((student) => !student.gradeLevel || !student.section || !student.classKey).map((student) => ({ kind: "student", severity: "high", title: `${student.name || student.email} has incomplete class placement`, detail: "Complete the learner's Grade and Section.", route: "/admin/students" })),
    ...publishedClasses.filter((item) => !attendanceDays.some((day) => day.classKey === item.classKey && day.date === today)).map((item) => ({ kind: "attendance", severity: "medium", title: `Attendance not recorded today: ${item.grade} · ${item.section}`, detail: "The class adviser has not submitted today's register.", route: "/admin/operations" })),
    ...[...lessons, ...games].filter((item) => item.status === "draft").slice(0, 8).map((item) => ({ kind: "content", severity: "low", title: `Draft waiting: ${item.title || "Untitled content"}`, detail: `${item.type} · ${item.grade || "Grade not set"}`, route: "/admin/content" })),
    ...quizzes.filter((item) => item.status === "draft").slice(0, 8).map((item) => ({ kind: "quiz", severity: "low", title: `Quiz draft: ${item.title || "Untitled quiz"}`, detail: `${item.grade || "Grade not set"} · ${item.section || "Section not set"}`, route: "/admin/content" })),
  ];

  return {
    ...data,
    users,
    teachers,
    students,
    content: [...lessons, ...games],
    quizzes,
    attendanceDays,
    publishedClasses,
    tasks,
    announcements: entries(data.announcements).map(([id, item]) => ({ id, ...item })).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)),
    audit: entries(data.adminAudit).map(([id, item]) => ({ id, ...item })).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)),
  };
}

export async function publishAnnouncement(admin, form) {
  if (!admin?.uid) throw new Error("Sign in again before publishing an announcement.");
  const title = String(form.title || "").trim();
  const message = String(form.message || "").trim();
  if (!title || !message) throw new Error("Complete the announcement title and message.");
  const announcementRef = push(ref(database, "announcements"));
  const now = Date.now();
  const record = {
    id: announcementRef.key,
    title: title.slice(0, 120),
    message: message.slice(0, 2000),
    audience: form.audience || "all",
    grade: form.grade || "",
    section: form.section || "",
    priority: form.priority || "normal",
    expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).getTime() : 0,
    status: "published",
    createdBy: admin.uid,
    createdByName: admin.name || admin.email || "Administrator",
    createdAt: now,
    updatedAt: now,
  };
  const auditRef = push(ref(database, "adminAudit"));
  await Promise.all([
    set(announcementRef, record),
    set(auditRef, { id: auditRef.key, action: "announcement.published", targetId: record.id, summary: `Published announcement: ${record.title}`, administratorUid: admin.uid, administratorName: record.createdByName, createdAt: now }),
  ]);
  return record;
}

export async function deleteAnnouncement(admin, announcement) {
  if (!admin?.uid || !announcement?.id) throw new Error("Unable to identify this announcement.");
  const auditRef = push(ref(database, "adminAudit"));
  const now = Date.now();
  await Promise.all([
    remove(ref(database, `announcements/${announcement.id}`)),
    set(auditRef, { id: auditRef.key, action: "announcement.deleted", targetId: announcement.id, summary: `Deleted announcement: ${announcement.title || "Untitled"}`, administratorUid: admin.uid, administratorName: admin.name || admin.email || "Administrator", createdAt: now }),
  ]);
}

function normalizeGradeLabel(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function announcementIsActive(item, now = Date.now()) {
  if (!item || item.status === "deleted") return false;
  const expiresAt = Number(item.expiresAt || 0);
  if (expiresAt > 0 && expiresAt <= now) return false;
  return true;
}

/** Whether this announcement should be shown to the given user profile/role. */
export function announcementVisibleToUser(item, { role, profile } = {}) {
  if (!announcementIsActive(item)) return false;
  const audience = String(item.audience || "all").toLowerCase();
  const userRole = String(role || profile?.role || "").toLowerCase();

  if (audience === "all") return true;
  if (audience === "teachers") return userRole === "teacher" || userRole === "admin";
  if (audience === "students") return userRole === "student";
  if (audience === "class") {
    if (userRole !== "student") return false;
    const grade = normalizeGradeLabel(profile?.gradeLevel || profile?.grade || "");
    const section = normalizeGradeLabel(profile?.section || "");
    const targetGrade = normalizeGradeLabel(item.grade);
    const targetSection = normalizeGradeLabel(item.section);
    if (!targetGrade) return false;
    const gradeMatch = grade.includes(targetGrade.replace(/^grade\s*/, "")) || targetGrade.includes(grade.replace(/^grade\s*/, "")) || grade === targetGrade;
    if (!gradeMatch) return false;
    if (!targetSection) return true;
    return section.includes(targetSection.replace(/^section\s*/, "")) || targetSection.includes(section.replace(/^section\s*/, "")) || section === targetSection;
  }
  return true;
}

/**
 * Live subscription to announcements visible to the current user.
 * Returns an unsubscribe function.
 */
export function subscribeVisibleAnnouncements({ role, profile }, onData, onError) {
  const announcementsRef = ref(database, "announcements");
  return onValue(
    announcementsRef,
    (snapshot) => {
      const now = Date.now();
      const list = [];
      if (snapshot.exists()) {
        snapshot.forEach((child) => {
          const item = { id: child.key, ...child.val() };
          if (announcementVisibleToUser(item, { role, profile })) {
            list.push(item);
          }
        });
      }
      list.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
      onData(list);
    },
    (error) => {
      if (typeof onError === "function") onError(error);
    },
  );
}

/** One-shot fetch of announcements visible to the current user. */
export async function getVisibleAnnouncements({ role, profile } = {}) {
  const snapshot = await get(ref(database, "announcements"));
  if (!snapshot.exists()) return [];
  const list = [];
  snapshot.forEach((child) => {
    const item = { id: child.key, ...child.val() };
    if (announcementVisibleToUser(item, { role, profile })) list.push(item);
  });
  return list.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}


export function exportAdminWordReport(data) {
  if (!data) return;

  const generatedAt = new Date();
  const dateKey = generatedAt.toISOString().slice(0, 10);
  const todayAttendance = (data.attendanceDays || []).filter((record) => record.date === dateKey);
  const students = (data.users || []).filter((item) => item.role === "student");
  const teachers = (data.users || []).filter((item) => item.role === "teacher");
  const content = [
    ...(data.content || []),
    ...(data.quizzes || []).map((item) => ({ ...item, type: "quiz" })),
  ];
  const publishedContent = content.filter((item) => item.status === "published");

  const taskRows = (data.tasks || []).map((task) => [
    task.kind || "Record",
    task.title || "Untitled task",
    task.detail || "—",
    task.severity || "normal",
  ]);
  const attendanceRows = (data.publishedClasses || []).map((classItem) => {
    const record = todayAttendance.find((item) => item.classKey === classItem.classKey);
    return [
      classItem.grade || "—",
      classItem.section || "—",
      record ? "Submitted" : "Not submitted",
      record ? record.count : "—",
    ];
  });
  const teacherRows = teachers.map((teacher) => [
    teacher.name || "—",
    teacher.email || "—",
    teacher.status || "active",
    teacher.gradeLevel || teacher.grade || "Multiple / not set",
    teacher.section || "See assigned classes",
  ]);
  const studentRows = students.map((student) => [
    student.name || "—",
    student.email || "—",
    student.gradeLevel || student.grade || "—",
    student.section || "—",
    student.status || "active",
  ]);
  const contentRows = content.map((item) => [
    item.type || "content",
    item.title || "Untitled content",
    item.grade || item.gradeLevel || "—",
    item.section || "All assigned sections",
    item.status || "draft",
  ]);
  const announcementRows = (data.announcements || []).map((item) => [
    item.title || "Untitled announcement",
    item.audience || "all",
    item.priority || "normal",
    item.createdByName || "Administrator",
    formatReportDate(item.createdAt),
  ]);
  const auditRows = (data.audit || []).slice(0, 100).map((item) => [
    item.summary || item.action || "Administrator action",
    item.administratorName || "Administrator",
    formatReportDate(item.createdAt),
  ]);

  const documentHtml = `<!DOCTYPE html>
  <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Jidanao School Operations Report</title>
      <style>
        @page { size: A4 landscape; margin: 0.55in; }
        body { margin: 0; color: #10264d; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.45; }
        .header { padding: 22px 26px; color: #fff; background: #074fb7; border-bottom: 6px solid #f4c430; }
        .header .school { margin: 0 0 5px; color: #ffe274; font-size: 9pt; font-weight: bold; letter-spacing: 1.6px; }
        .header h1 { margin: 0; color: #fff; font-size: 25pt; }
        .header p { margin: 6px 0 0; color: #eaf2ff; }
        .meta { margin: 16px 0 12px; padding: 10px 13px; border: 1px solid #cedcf0; background: #f3f7fd; }
        .summary { width: 100%; margin: 0 0 20px; border-collapse: separate; border-spacing: 7px; }
        .summary td { width: 16.66%; padding: 12px; border: 1px solid #d8e3f2; background: #f8fbff; text-align: center; }
        .summary strong { display: block; color: #0753bd; font-size: 19pt; }
        .summary span { color: #5f728e; font-size: 8.5pt; }
        h2 { margin: 23px 0 8px; padding: 7px 10px; color: #fff; background: #0b5fd2; font-size: 14pt; page-break-after: avoid; }
        h3 { margin: 16px 0 7px; color: #123b79; font-size: 11.5pt; page-break-after: avoid; }
        table { width: 100%; margin-bottom: 14px; border-collapse: collapse; page-break-inside: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        th { padding: 7px 8px; border: 1px solid #b9cae2; color: #fff; background: #174f9e; font-size: 8.5pt; text-align: left; }
        td { padding: 6px 8px; border: 1px solid #d6e0ed; color: #20395e; font-size: 8.5pt; vertical-align: top; }
        tbody tr:nth-child(even) td { background: #f5f8fc; }
        .empty { padding: 14px; color: #6f8198; text-align: center; }
        .note { margin-top: 20px; padding: 10px 12px; border-left: 4px solid #f4c430; color: #526984; background: #fff9df; }
        .footer { margin-top: 24px; padding-top: 9px; border-top: 1px solid #cad7e8; color: #6d7f96; font-size: 8pt; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <p class="school">JIDANAO ELEMENTARY SCHOOL</p>
        <h1>School Operations Report</h1>
        <p>Administrator-generated LMS monitoring and records summary</p>
      </div>
      <div class="meta"><strong>Generated:</strong> ${escapeHtml(formatReportDate(generatedAt))} &nbsp; | &nbsp; <strong>Reporting date:</strong> ${escapeHtml(dateKey)}</div>
      <table class="summary"><tr>
        <td><strong>${students.length}</strong><span>Students</span></td>
        <td><strong>${teachers.length}</strong><span>Teachers</span></td>
        <td><strong>${data.publishedClasses?.length || 0}</strong><span>Published classes</span></td>
        <td><strong>${publishedContent.length}</strong><span>Published content</span></td>
        <td><strong>${data.tasks?.length || 0}</strong><span>Items needing attention</span></td>
        <td><strong>${todayAttendance.length}</strong><span>Attendance submitted today</span></td>
      </tr></table>

      <h2>1. Action Center</h2>
      ${reportTable(["Type", "Task", "Details", "Priority"], taskRows, "No administrator tasks require attention.")}

      <h2>2. Attendance Overview</h2>
      ${reportTable(["Grade", "Section", "Today's status", "Learner records"], attendanceRows, "No published classes are available.")}

      <h2>3. Teacher Directory</h2>
      ${reportTable(["Teacher", "Email", "Status", "Grade", "Section / assignment"], teacherRows, "No teacher accounts were found.")}

      <h2>4. Student Directory</h2>
      ${reportTable(["Student", "Email", "Grade", "Section", "Status"], studentRows, "No student accounts were found.")}

      <h2>5. Learning Content Inventory</h2>
      ${reportTable(["Type", "Title", "Grade", "Section", "Status"], contentRows, "No learning content was found.")}

      <h2>6. Announcements</h2>
      ${reportTable(["Title", "Audience", "Priority", "Published by", "Published date"], announcementRows, "No announcements were found.")}

      <h2>7. Recent Administrator Actions</h2>
      ${reportTable(["Action", "Administrator", "Date"], auditRows, "No administrator actions were recorded.")}

      <div class="note"><strong>Privacy note:</strong> This report excludes passwords, private credentials, webcam frames, and biometric data.</div>
      <div class="footer">Generated by Jidanao Learning Hub · School Operations</div>
    </body>
  </html>`;

  download(
    `jidanao-school-operations-report-${dateKey}.doc`,
    `\ufeff${documentHtml}`,
    "application/msword;charset=utf-8",
  );
}
