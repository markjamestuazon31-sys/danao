function escapePdfText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function generateCertificate({ studentName, title, date = new Date() }) {
  const lines = [
    { text: "Certificate of Achievement", size: 30, y: 470 },
    { text: "Jidanao Elementary School", size: 17, y: 430 },
    { text: "This certificate is proudly presented to", size: 14, y: 375 },
    { text: studentName || "Student", size: 25, y: 325 },
    { text: `for completing ${title || "a learning milestone"}.`, size: 14, y: 275 },
    { text: date.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }), size: 13, y: 220 },
  ];
  const content = lines.map(({ text, size, y }) => `BT /F1 ${size} Tf 0 0 0 rg 421 ${y} Td (${escapePdfText(text)}) Tj ET`).join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj",
    `4 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj",
  ];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  for (const obj of objects) { offsets.push(pdf.length); pdf += `${obj}\n`; }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `Jidanao-Certificate-${(studentName || "Student").replace(/\s+/g, "-")}.pdf`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function periodNumber(value) {
  const match = String(value || "").match(/[1-4]/);
  return match ? Number(match[0]) : 1;
}

function subjectRowsForHtml(subjects, scoreMap, rowAverages) {
  return subjects.map((subject) => {
    const score1 = scoreMap[`${subject}|1`];
    const score2 = scoreMap[`${subject}|2`];
    const score3 = scoreMap[`${subject}|3`];
    const score4 = scoreMap[`${subject}|4`];
    const finalScore = rowAverages[subject];
    return `
      <tr>
        <td class="left">${escapeHtml(subject)}</td>
        <td>${Number.isFinite(score1) ? escapeHtml(score1) : "-"}</td>
        <td>${Number.isFinite(score2) ? escapeHtml(score2) : "-"}</td>
        <td>${Number.isFinite(score3) ? escapeHtml(score3) : "-"}</td>
        <td>${Number.isFinite(score4) ? escapeHtml(score4) : "-"}</td>
        <td class="final-cell">${Number.isFinite(finalScore) ? escapeHtml(finalScore) : "-"}</td>
      </tr>
    `;
  }).join("");
}

function performanceRemark(generalAverage) {
  if (generalAverage >= 90) return "Outstanding";
  if (generalAverage >= 85) return "Very Satisfactory";
  if (generalAverage >= 80) return "Satisfactory";
  if (generalAverage >= 75) return "Fairly Satisfactory";
  return "Did Not Meet Expectations";
}

function openPrintWindow(title, html) {
  const printWindow = window.open("", "_blank", "width=1024,height=900");
  if (!printWindow) throw new Error("Allow pop-ups to generate the report card.");
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${html}</head></html>`);
  printWindow.document.close();
}

export function generateReportCard({ student, grades, schoolYear, schoolName = "Jidanao Elementary School" }) {
  const selected = (grades || []).filter((grade) => !schoolYear || grade.schoolYear === schoolYear);
  if (!selected.length) throw new Error("No released grades are available for the selected school year.");

  const subjects = [...new Set(selected.map((grade) => grade.subject))].sort();
  const scoreMap = Object.fromEntries(selected.map((grade) => [`${grade.subject}|${periodNumber(grade.period)}`, Number(grade.score)]));
  const rowAverages = Object.fromEntries(subjects.map((subject) => {
    const scores = [1, 2, 3, 4].map((period) => scoreMap[`${subject}|${period}`]).filter(Number.isFinite);
    return [subject, scores.length ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10 : null];
  }));
  const allScores = selected.map((grade) => Number(grade.score)).filter(Number.isFinite);
  const generalAverage = allScores.length ? Math.round((allScores.reduce((sum, value) => sum + value, 0) / allScores.length) * 10) / 10 : 0;
  const finalRemark = performanceRemark(generalAverage);
  const generatedAt = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const learnerName = student?.name || "Student";
  const gradeSection = `${student?.gradeLevel || student?.grade || ""} · ${student?.section || ""}`.trim();
  const logoCandidates = ["/jidanao-seal.png", "/school-logo.jpg"];
  const title = `Report Card - ${learnerName}`;

  const rows = subjectRowsForHtml(subjects, scoreMap, rowAverages);

  const html = `
    <style>
      @page { size: A4 portrait; margin: 0.55in; }
      :root {
        --blue-900: #0f2d5a;
        --blue-700: #1e4d8f;
        --blue-100: #eaf2ff;
        --gold-500: #e9ba2b;
        --ink: #1a2232;
        --muted: #5b677a;
        --line: #b8c6dd;
        --line-strong: #7f94b8;
        --surface: #ffffff;
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #eef2f8; color: var(--ink); font-family: Arial, Helvetica, sans-serif; }
      body { padding: 18px; }
      .report-card {
        width: 100%;
        max-width: 8.27in;
        min-height: 11.69in;
        margin: 0 auto;
        background: var(--surface);
        box-shadow: 0 18px 48px rgba(15, 45, 90, 0.16);
        border: 1px solid #dde5f2;
      }
      .report-shell { padding: 28px 34px 32px; }
      .report-header {
        display: grid;
        grid-template-columns: 84px 1fr;
        gap: 18px;
        align-items: center;
        padding-bottom: 18px;
        border-bottom: 4px solid var(--blue-700);
      }
      .seal-wrap {
        width: 78px;
        height: 78px;
        border-radius: 50%;
        border: 3px solid var(--gold-500);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: #fff;
      }
      .seal-wrap img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .seal-fallback {
        font-weight: 700;
        color: var(--blue-700);
        font-size: 17px;
        letter-spacing: 1px;
      }
      .report-kicker {
        margin: 0 0 6px;
        color: var(--blue-700);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 1.6px;
        text-transform: uppercase;
      }
      .report-school {
        margin: 0;
        font-size: 26px;
        line-height: 1.1;
        color: #0d1f3a;
        font-weight: 800;
        text-transform: uppercase;
      }
      .report-title {
        margin: 6px 0 2px;
        font-size: 18px;
        color: var(--blue-700);
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .report-subtitle {
        margin: 2px 0 0;
        color: var(--muted);
        font-size: 12px;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin: 18px 0 22px;
      }
      .meta-card {
        border: 1px solid #d6e0ef;
        border-radius: 12px;
        padding: 12px 14px;
        background: linear-gradient(180deg, #fafcff 0%, #f4f8ff 100%);
      }
      .meta-label {
        display: block;
        color: var(--muted);
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 4px;
      }
      .meta-value {
        display: block;
        color: #122648;
        font-size: 17px;
        font-weight: 700;
      }
      .meta-subvalue {
        display: block;
        margin-top: 3px;
        color: var(--muted);
        font-size: 12px;
      }
      .section-title {
        margin: 8px 0 10px;
        color: var(--blue-900);
        font-size: 14px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      .grades-table {
        margin-top: 6px;
        border: 1px solid var(--line-strong);
      }
      .grades-table th {
        background: var(--blue-700);
        color: #fff;
        font-size: 12px;
        padding: 11px 10px;
        border: 1px solid var(--line-strong);
        text-align: center;
      }
      .grades-table td {
        border: 1px solid var(--line);
        padding: 10px 10px;
        font-size: 12px;
        text-align: center;
      }
      .grades-table td.left { text-align: left; font-weight: 700; color: #20304c; }
      .grades-table tbody tr:nth-child(even) td { background: #f8fbff; }
      .grades-table .final-cell { font-weight: 800; color: var(--blue-900); }
      .grades-table .average-row td {
        background: #edf4ff;
        font-weight: 800;
      }
      .remarks-box {
        margin-top: 20px;
        border: 1px solid #d6e0ef;
        border-left: 5px solid var(--gold-500);
        border-radius: 12px;
        background: #fcfdff;
        padding: 14px 16px;
      }
      .remarks-box p { margin: 0 0 7px; font-size: 13px; line-height: 1.55; }
      .remarks-box p:last-child { margin-bottom: 0; }
      .remarks-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-top: 10px;
      }
      .signature-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 36px;
        margin-top: 34px;
      }
      .signature-box {
        padding-top: 28px;
        border-top: 1px solid #5f708c;
        text-align: center;
        font-size: 12px;
        color: #324155;
      }
      .signature-box strong { display: block; color: #152847; margin-bottom: 4px; }
      .report-footer {
        margin-top: 26px;
        padding-top: 12px;
        border-top: 1px solid #d7dfeb;
        color: #6a7689;
        font-size: 11px;
        display: flex;
        justify-content: space-between;
        gap: 18px;
        flex-wrap: wrap;
      }
      .print-tools {
        max-width: 8.27in;
        margin: 0 auto 12px;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .print-tools button {
        border: 0;
        background: var(--blue-700);
        color: #fff;
        font-weight: 700;
        border-radius: 10px;
        padding: 10px 16px;
        cursor: pointer;
      }
      .print-tools button.secondary {
        background: #e8eef8;
        color: var(--blue-900);
      }
      @media print {
        body { padding: 0; background: #fff; }
        .print-tools { display: none !important; }
        .report-card { box-shadow: none; border: 0; max-width: none; }
      }
    </style>
    <body>
      <div class="print-tools">
        <button class="secondary" type="button" onclick="window.close()">Close</button>
        <button type="button" onclick="window.print()">Print / Save as PDF</button>
      </div>
      <main class="report-card">
        <div class="report-shell">
          <header class="report-header">
            <div class="seal-wrap">
              <img src="${logoCandidates[0]}" alt="School logo" onerror="this.onerror=null;this.src='${logoCandidates[1]}';this.nextElementSibling.style.display='flex';" />
              <div class="seal-fallback" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;">JES</div>
            </div>
            <div>
              <p class="report-kicker">Republic of the Philippines</p>
              <h1 class="report-school">${escapeHtml(schoolName)}</h1>
              <h2 class="report-title">Learner Academic Report Card</h2>
              <p class="report-subtitle">Official released academic results for school documentation, parent review, and learner monitoring.</p>
            </div>
          </header>

          <section class="meta-grid">
            <article class="meta-card">
              <span class="meta-label">Learner</span>
              <span class="meta-value">${escapeHtml(learnerName)}</span>
              <span class="meta-subvalue">${escapeHtml(gradeSection)}</span>
            </article>
            <article class="meta-card">
              <span class="meta-label">School Year</span>
              <span class="meta-value">${escapeHtml(schoolYear || selected[0]?.schoolYear || "Current")}</span>
              <span class="meta-subvalue">Generated ${escapeHtml(generatedAt)}</span>
            </article>
          </section>

          <section>
            <h3 class="section-title">Academic Performance Summary</h3>
            <table class="grades-table">
              <thead>
                <tr>
                  <th style="width:42%">Learning Area</th>
                  <th>1st</th>
                  <th>2nd</th>
                  <th>3rd</th>
                  <th>4th</th>
                  <th>Final</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
                <tr class="average-row">
                  <td class="left">GENERAL AVERAGE</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td class="final-cell">${escapeHtml(generalAverage)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section class="remarks-box">
            <h3 class="section-title" style="margin-top:0">Academic Remarks</h3>
            <div class="remarks-grid">
              <div>
                <p><strong>General Performance:</strong> ${escapeHtml(finalRemark)}</p>
                <p><strong>Released Subjects:</strong> ${escapeHtml(subjects.join(", "))}</p>
              </div>
              <div>
                <p><strong>School Use:</strong> This report reflects teacher-released grades currently stored in the Jidanao LearnSpace system.</p>
                <p><strong>Confidentiality:</strong> Handle this learner record only for authorized school and parent purposes.</p>
              </div>
            </div>
          </section>

          <section class="signature-grid">
            <div class="signature-box">
              <strong>Class Adviser / Teacher</strong>
              Signature over printed name
            </div>
            <div class="signature-box">
              <strong>Parent / Guardian</strong>
              Signature over printed name
            </div>
          </section>

          <footer class="report-footer">
            <span>Official electronic school report card</span>
            <span>${escapeHtml(schoolName)} · ${escapeHtml(schoolYear || selected[0]?.schoolYear || "Current")}</span>
          </footer>
        </div>
      </main>
      <script>
        window.addEventListener('load', function () {
          setTimeout(function () { window.print(); }, 350);
        });
      <\/script>
    </body>
  `;

  openPrintWindow(title, html);
}
