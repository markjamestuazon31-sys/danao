import { ref, set, get } from "firebase/database";
import { database } from "../firebase/firebaseConfig";

export async function saveGradeSheet(classKey, quarter, studentId, grades) {
  await set(ref(database, `grades/${classKey}/${quarter}/${studentId}`), {
    ...grades,
    updatedAt: Date.now(),
  });
}

export async function loadGradeSheet(classKey, quarter) {
  const snap = await get(ref(database, `grades/${classKey}/${quarter}`));
  return snap.exists() ? snap.val() : {};
}
