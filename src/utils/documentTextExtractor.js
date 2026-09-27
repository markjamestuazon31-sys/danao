const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_EXTRACTED_CHARACTERS = 120000;

function extensionOf(file) {
  return String(file?.name || "").split(".").pop()?.toLowerCase() || "";
}

function cleanExtractedText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, MAX_EXTRACTED_CHARACTERS);
}

function decodeEntities(value) {
  const element = document.createElement("textarea");
  element.innerHTML = value;
  return element.value;
}

async function decompress(bytes, format) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot decompress DOCX/PDF files. Use the latest Chrome or Edge browser.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function findEndOfCentralDirectory(view) {
  const minimum = Math.max(0, view.byteLength - 65557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

async function extractDocx(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) throw new Error("The DOCX file is damaged or is not a valid Word document.");
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");
  let documentEntry = null;

  for (let index = 0; index < entryCount && offset + 46 <= view.byteLength; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(new Uint8Array(arrayBuffer, offset + 46, fileNameLength));
    if (name === "word/document.xml") {
      documentEntry = { method, compressedSize, localHeaderOffset };
      break;
    }
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  if (!documentEntry) throw new Error("The DOCX file does not contain readable document text.");
  const localOffset = documentEntry.localHeaderOffset;
  if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("The DOCX document structure is invalid.");
  const fileNameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const dataOffset = localOffset + 30 + fileNameLength + extraLength;
  const compressed = new Uint8Array(arrayBuffer, dataOffset, documentEntry.compressedSize);
  const xmlBytes = documentEntry.method === 0
    ? compressed
    : documentEntry.method === 8
      ? await decompress(compressed, "deflate-raw")
      : null;
  if (!xmlBytes) throw new Error("This DOCX compression format is not supported.");
  const xml = decoder.decode(xmlBytes);
  const text = decodeEntities(
    xml
      .replace(/<w:tab\b[^>]*\/>/gi, "\t")
      // A <w:br/>/<w:cr/> is a manual line break WITHIN a paragraph (common
      // in justified/wrapped or converted-from-PDF text, where Word records
      // one break per visual line). It is not a new paragraph, so it must
      // reflow as a space - treating it as "\n" (as before) shreds a single
      // paragraph into one line per word once each line is its own block.
      .replace(/<w:(?:br|cr)\b[^>]*\/>/gi, " ")
      .replace(/<\/w:p>/gi, "\n")
      .replace(/<\/w:tr>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  );
  return cleanExtractedText(text);
}

function decodePdfLiteral(value) {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== "\\") {
      result += character;
      continue;
    }
    const next = value[++index];
    const mapped = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" }[next];
    if (mapped !== undefined) result += mapped;
    else if (/[0-7]/.test(next || "")) {
      let octal = next;
      while (octal.length < 3 && /[0-7]/.test(value[index + 1] || "")) octal += value[++index];
      result += String.fromCharCode(Number.parseInt(octal, 8));
    } else if (next !== "\n" && next !== "\r") result += next || "";
  }
  return result;
}

function pdfTextOperators(source) {
  if (!/\bBT\b[\s\S]*\bET\b/.test(source)) return [];
  const results = [];
  const literalPattern = /\(((?:\\.|[^\\)])*)\)/g;
  let match;
  while ((match = literalPattern.exec(source))) {
    const nearby = source.slice(match.index + match[0].length, match.index + match[0].length + 24);
    const arrayStart = source.lastIndexOf("[", match.index);
    const arrayEnd = source.indexOf("]", match.index);
    const isText = /^\s*Tj\b/.test(nearby) || (arrayStart >= 0 && arrayEnd >= 0 && /\]\s*TJ\b/.test(source.slice(arrayEnd, arrayEnd + 12)));
    if (isText) results.push(decodePdfLiteral(match[1]));
  }
  return results;
}

async function extractPdf(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const latin = new TextDecoder("latin1");
  const source = latin.decode(bytes);
  if (!source.startsWith("%PDF-")) throw new Error("The selected file is not a valid PDF document.");
  const extracted = [...pdfTextOperators(source)];
  const streamPattern = /stream\r?\n/g;
  let match;
  while ((match = streamPattern.exec(source))) {
    const end = source.indexOf("endstream", match.index + match[0].length);
    if (end < 0) break;
    const dictionary = source.slice(Math.max(0, match.index - 500), match.index);
    const start = match.index + match[0].length;
    let streamBytes = bytes.slice(start, end);
    try {
      if (/\/FlateDecode/.test(dictionary)) streamBytes = await decompress(streamBytes, "deflate");
      extracted.push(...pdfTextOperators(latin.decode(streamBytes)));
    } catch {
      // Some PDF streams are images or use filters unrelated to lesson text.
    }
    streamPattern.lastIndex = end + 9;
  }
  const text = cleanExtractedText(extracted.join(" "));
  if (text.length < 40) {
    throw new Error("No selectable text was found in this PDF. Scanned/image-only PDFs need OCR before import.");
  }
  return text;
}

export async function extractDocumentText(file) {
  if (!file) throw new Error("Choose a lesson-plan file first.");
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("Lesson-plan files must be 8 MB or smaller.");
  const extension = extensionOf(file);
  let text = "";
  if (["txt", "md", "markdown", "csv", "json"].includes(extension) || file.type.startsWith("text/")) {
    text = cleanExtractedText(await file.text());
  } else if (extension === "docx") {
    text = await extractDocx(await file.arrayBuffer());
  } else if (extension === "pdf") {
    text = await extractPdf(await file.arrayBuffer());
  } else if (extension === "doc") {
    throw new Error("Legacy .doc files are not supported. Open the file in Word and save it as .docx first.");
  } else {
    throw new Error("Use a DOCX, PDF, TXT, Markdown, CSV, or JSON lesson-plan file.");
  }
  if (text.length < 40) throw new Error("The document does not contain enough readable lesson text.");
  return {
    name: file.name,
    contentType: file.type || `application/${extension}`,
    size: file.size,
    text,
    extractedAt: Date.now(),
    extractionMode: "browser-local",
  };
}
