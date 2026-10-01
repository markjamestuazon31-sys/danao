import { database } from '../firebase/firebaseConfig';
import { push, ref, set } from 'firebase/database';

export async function saveClassroomPerformance(data){
 const key=push(ref(database,'classroomPerformance')).key;
 await set(ref(database,`classroomPerformance/${key}`),{
  ...data,
  createdAt:Date.now()
 });
 return key;
}
