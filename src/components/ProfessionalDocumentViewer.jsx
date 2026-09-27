import { Download, ExternalLink, FileText } from "lucide-react";

function lower(value = "") {
  return String(value).toLowerCase();
}

function isDocx(name = "") {
  return lower(name).endsWith(".docx");
}

function isPdf(name = "", contentType = "") {
  return lower(name).endsWith(".pdf") || lower(contentType) === "application/pdf";
}

function isImage(name = "", contentType = "") {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(name) || lower(contentType).startsWith("image/");
}

function formatSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Renders the actual file a teacher attached to a lesson (not just a plain
 * text dump). Falls back to nicely formatted extracted text when only text
 * is available (e.g. the original file was too large to store inline).
 */
export default function ProfessionalDocumentViewer({ material }) {
  if (!material || (!material.url && !material.text)) return null;

  const name = material.name || "Teacher document";
  const contentType = material.contentType || "";
  const sizeLabel = formatSize(material.size);
  const docx = isDocx(name);
  const pdf = isPdf(name, contentType);
  const image = isImage(name, contentType);

  return (
    <section className="professional-document-card">
      <div className="professional-document-card__header">
        <span className="professional-document-card__icon">
          <FileText size={20} />
        </span>
        <div>
          <h3>{name}</h3>
          <small>
            Original file provided by your teacher{sizeLabel ? ` · ${sizeLabel}` : ""}
          </small>
        </div>
      </div>

      {material.url && docx && (
        <div className="professional-document-card__docx">
          <p>Word documents open best in Microsoft Word or Google Docs.</p>
          <a className="document-open-button" href={material.url} download={name}>
            <Download size={16} /> Download original DOCX
          </a>
        </div>
      )}

      {material.url && pdf && (
        <iframe className="professional-document-frame" title={name} src={material.url} />
      )}

      {material.url && image && (
        <img className="professional-document-image" src={material.url} alt={name} />
      )}

      {material.url && !docx && !pdf && !image && (
        <a
          className="document-open-button"
          href={material.url}
          target="_blank"
          rel="noreferrer noopener"
        >
          <ExternalLink size={16} /> Open original file
        </a>
      )}

      {!material.url && material.text && (
        <div className="professional-document-text">
          {material.text
            .split(/\n{2,}/)
            .filter(Boolean)
            .map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
        </div>
      )}
    </section>
  );
}
