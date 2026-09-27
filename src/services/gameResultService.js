import { push, ref, set } from "firebase/database";
import { auth, database } from "../firebase/firebaseConfig";

export async function saveLearnerActivityResult(result) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Teacher login required.");
  const key = push(ref(database, "activityResults")).key;
  await set(ref(database, `activityResults/${key}`), {
    ...result,
    teacherUid: uid,
    createdAt: Date.now(),
  });
  return key;
}
