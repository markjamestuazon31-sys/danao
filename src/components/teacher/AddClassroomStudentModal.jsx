import { useState } from 'react';
import { addLearner } from '../../services/classroomStudentService';

export default function AddClassroomStudentModal({teacherUid,onClose,onSaved}){
 const [form,setForm]=useState({name:'',grade:'',section:''});
 const [saving,setSaving]=useState(false);
 async function save(){
  if(!form.name.trim()) return;
  setSaving(true);
  await addLearner({...form,teacherUid});
  setSaving(false);
  onSaved?.();
  onClose();
 }
 return <div className="modal-overlay"><div className="modal-card">
  <h2>Add Classroom Student</h2>
  <p>No cellphone, email, or password required.</p>
  <input placeholder="Student name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
  <input placeholder="Grade level" value={form.grade} onChange={e=>setForm({...form,grade:e.target.value})}/>
  <input placeholder="Section" value={form.section} onChange={e=>setForm({...form,section:e.target.value})}/>
  <div><button onClick={onClose}>Cancel</button><button onClick={save} disabled={saving}>{saving?'Saving...':'Create Learner'}</button></div>
 </div></div>
}
