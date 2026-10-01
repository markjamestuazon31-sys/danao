import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';

export async function addLearner({teacherUid,name,grade,section}){
 return addDoc(collection(db,'classroomStudents'),{
  teacherUid,name,grade,section,
  type:'shared-device',
  createdAt:serverTimestamp()
 });
}

export async function getClassroomStudents(teacherUid){
 const q=query(collection(db,'classroomStudents'),where('teacherUid','==',teacherUid));
 const snap=await getDocs(q);
 return snap.docs.map(d=>({id:d.id,...d.data()}));
}
