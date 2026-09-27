import { get, ref } from 'firebase/database';
import { database } from '../firebase/firebaseConfig';

export async function getLessonQuiz(lessonId){
  if(!lessonId) return [];

  const snap = await get(ref(database, `quizzes/${lessonId}`));

  if(!snap.exists()) return [];

  return snap.val().questions || [];
}
