import { get, ref, set, update } from "firebase/database";
import { database } from "../firebase/firebaseConfig";
import { classFields } from "../data/schoolClasses";

function makeCode(){
  return `JID-${Math.random().toString(36).slice(2,6).toUpperCase()}-${Date.now().toString().slice(-4)}`;
}

export async function createTeacherInvite({teacherId, teacherName, gradeLevel, section, schoolYear="2026-2027"}){
  const classInfo = classFields(gradeLevel, section);
  const code = makeCode();
  const classKey = classInfo.classKey;
  await set(ref(database, `classInvites/${code}`), {
    code, teacherId, teacherName: teacherName || "Teacher",
    gradeLevel, section, schoolYear, classKey,
    ...classInfo,
    active:true, createdAt:Date.now()
  });
  return code;
}

export async function joinClassByInvite(studentUid, code){
  const key = String(code || "").trim().toUpperCase();
  const snap = await get(ref(database, `classInvites/${key}`));
  if(!snap.exists()) throw new Error("Invalid teacher invite code.");
  const invite = snap.val();
  if(!invite.active) throw new Error("This invite code is disabled.");

  await update(ref(database),{
    [`users/${studentUid}/teacherId`]: invite.teacherId,
    [`users/${studentUid}/classKey`]: invite.classKey,
    [`users/${studentUid}/gradeLevel`]: invite.gradeLevel,
    [`users/${studentUid}/section`]: invite.section,
    [`users/${studentUid}/joinedByInvite`]: key,
    [`classRosters/${invite.classKey}/${studentUid}`]: true,
    [`teacherStudents/${invite.teacherId}/${studentUid}`]: true,
  });
  return invite;
}
