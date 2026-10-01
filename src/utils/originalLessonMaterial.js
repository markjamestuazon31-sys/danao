/** Original bytes, not extracted or AI-generated lesson text. RTDB-only storage. */
export const MAX_ORIGINAL_FILE_BYTES = 6 * 1024 * 1024;
export const ORIGINAL_FILE_ACCEPT = ".docx,.pdf,.txt,.md,.markdown";
const TYPES = Object.freeze({
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf", txt: "text/plain", md: "text/markdown", markdown: "text/markdown",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
});
export function materialExtension(material) {
  const ext = String(material?.name || "").split(".").pop().toLowerCase();
  if (TYPES[ext]) return ext;
  return Object.keys(TYPES).find((key) => TYPES[key] === material?.contentType) || ext;
}
export function formatMaterialSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "";
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
}
export function isOriginalDocumentLesson(lesson) {
  return lesson?.contentMode === "document" || Boolean(lesson?.material?.url || lesson?.material?.text);
}
export function safeResourceUrl(value) {
  try { const url = new URL(String(value || "")); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; }
  catch { return ""; }
}
export function validateDocxArchive(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 22 || view.getUint32(0, true) !== 0x04034b50) throw new Error("This is not an unencrypted DOCX file. Save a new .docx copy in Word and upload it again.");
  let end = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === view.byteLength) { end = i; break; }
  }
  if (end < 0) throw new Error("This Word document is incomplete or damaged.");
  const count = view.getUint16(end + 10, true);
  if (count > 6000 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error("This document package is too complex to preview safely. Upload a PDF copy.");
  let offset = view.getUint32(end + 16, true);
  let unpacked = 0; let documentFound = false; let typesFound = false;
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error("This DOCX archive is damaged.");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const size = view.getUint32(offset + 24, true);
    const len = view.getUint16(offset + 28, true);
    const next = offset + 46 + len + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    if (next > end || (flags & 1) || ![0, 8].includes(method)) throw new Error("Encrypted or unsupported document package. Save an unencrypted DOCX or PDF copy.");
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, len));
    if (name.startsWith("/") || name.split(/[\\/]/).includes("..")) throw new Error("Unsafe document package path.");
    unpacked += size;
    if (unpacked > 80 * 1024 * 1024 || size > 32 * 1024 * 1024) throw new Error("This document expands beyond the safe preview limit. Upload a PDF copy.");
    if (name === "word/document.xml") documentFound = true;
    if (name === "[Content_Types].xml") typesFound = true;
    offset = next;
  }
  if (!documentFound || !typesFound) throw new Error("This file does not contain a valid Word document.");
}
function encodeDataUrl(bytes, type) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return `data:${type};base64,${btoa(binary)}`;
}
export async function createOriginalLessonMaterial(file) {
  if (!file) throw new Error("Choose a lesson file.");
  const extension = materialExtension(file);
  if (extension === "doc") throw new Error("Legacy .doc files cannot be displayed in this reader. Save the document as .docx or PDF in Word, then upload that file.");
  if (!["docx", "pdf", "txt", "md", "markdown"].includes(extension)) throw new Error("Upload a DOCX, PDF, TXT, or Markdown file.");
  if (!file.size) throw new Error("The selected file is empty.");
  if (file.size > MAX_ORIGINAL_FILE_BYTES) throw new Error("The original file must be 6 MB or smaller. No file was imported or converted. Compress images or upload a smaller PDF/DOCX copy.");
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength !== file.size) throw new Error("The file could not be read completely. Please select it again.");
  if (extension === "docx") validateDocxArchive(buffer);
  if (extension === "pdf" && new TextDecoder().decode(buffer.slice(0, 5)) !== "%PDF-") throw new Error("The selected file is not a valid PDF.");
  const bytes = new Uint8Array(buffer);
  const sha256 = globalThis.crypto?.subtle ? [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map((b) => b.toString(16).padStart(2, "0")).join("") : null;
  return { name: file.name, contentType: TYPES[extension], extension, size: bytes.length,
    url: encodeDataUrl(bytes, TYPES[extension]), sha256, importedAt: Date.now(),
    storage: "realtime-inline", mode: "original", version: 1 };
}
export async function loadOriginalMaterial(material, signal) {
  const extension = materialExtension(material);
  const type = TYPES[extension] || material.contentType || "application/octet-stream";
  let buffer;
  if (String(material.url || "").startsWith("data:")) {
    const value = material.url;
    const comma = value.indexOf(",");
    if (comma < 0 || !value.slice(0, comma).endsWith(";base64")) throw new Error("Unsupported stored file encoding. Ask your teacher to upload the original again.");
    if (value.length > 12 * 1024 * 1024) throw new Error("The stored document is too large for this reader.");
    const binary = atob(value.slice(comma + 1));
    buffer = Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
  } else {
    const url = safeResourceUrl(material.url);
    if (!url) throw new Error("The original file is missing or its address is invalid.");
    const response = await fetch(url, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error(`The original file could not be opened (${response.status}).`);
    const max = 12 * 1024 * 1024;
    if (Number(response.headers.get("content-length") || 0) > max) throw new Error("This external file is too large for the built-in reader. Open the original file instead.");
    if (response.body?.getReader) {
      const reader = response.body.getReader(); const chunks = []; let size = 0;
      try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
        if (size > max) { await reader.cancel(); throw new Error("This external file is too large for the built-in reader."); } chunks.push(value); }
      } finally { reader.releaseLock(); }
      const result = new Uint8Array(size); let offset = 0;
      chunks.forEach((chunk) => { result.set(chunk, offset); offset += chunk.byteLength; }); buffer = result.buffer;
    } else { buffer = await response.arrayBuffer(); if (buffer.byteLength > max) throw new Error("This external file is too large for the built-in reader."); }
  }
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (material.size && Number(material.size) !== buffer.byteLength) throw new Error("The stored file is incomplete. Ask your teacher to upload the original again.");
  if (material.sha256 && globalThis.crypto?.subtle) {
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (digest !== material.sha256) throw new Error("This file does not match the teacher's original upload. Ask your teacher to upload it again.");
  }
  if (extension === "docx") validateDocxArchive(buffer);
  return new Blob([buffer], { type });
}
