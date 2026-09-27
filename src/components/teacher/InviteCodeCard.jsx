import { useState } from "react";
import { createTeacherInvite } from "../../services/classInviteService";

export default function InviteCodeCard({teacherId, teacherName, gradeLevel, section}) {
  const [code,setCode]=useState("");
  const [busy,setBusy]=useState(false);

  async function create(){
    setBusy(true);
    try {
      setCode(await createTeacherInvite({teacherId, teacherName, gradeLevel, section}));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h3>Student Invite Code</h3>
      <button disabled={busy} onClick={create}>
        {busy ? "Creating..." : "Generate Code"}
      </button>
      {code && <strong>{code}</strong>}
    </div>
  );
}
