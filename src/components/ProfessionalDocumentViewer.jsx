import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, FileText, LoaderCircle, LockKeyhole, RefreshCw, ZoomIn } from "lucide-react";
import { formatMaterialSize, loadOriginalMaterial, materialExtension, safeResourceUrl } from "../utils/originalLessonMaterial";
import "../styles/original-document-reader.css";

// The uploaded document never becomes srcDoc. The host is a fixed, scriptless,
// same-origin frame; document CSS cannot style the application around it.
const FRAME_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; font-src data: blob:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>html{background:#edf0f4}body{margin:0}#pages{min-height:100vh}div.original-docx-wrapper{padding:24px!important;background:transparent!important}section.original-docx{margin-bottom:20px!important;box-shadow:0 2px 12px #15243a12!important}a{cursor:pointer}@media print{html{background:white}div.original-docx-wrapper{padding:0!important}section.original-docx{box-shadow:none!important}}</style></head><body><div id="document-styles"></div><div id="pages"></div></body></html>`;

function DocxCanvas({ blob, name, zoom, onReady, onError }) {
  const frameRef = useRef(null);
  const [frameLoad, setFrameLoad] = useState(0);
  const [renderVersion, setRenderVersion] = useState(0);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };

  useEffect(() => {
    if (!blob || !frameLoad) return undefined;
    const doc = frameRef.current?.contentDocument;
    if (!doc?.getElementById("pages")) return undefined;
    let cancelled = false;
    const body = doc.createElement("div");
    const styles = doc.createElement("div");
    (async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        await renderAsync(blob, body, styles, {
          className: "original-docx", inWrapper: true, ignoreWidth: false,
          ignoreHeight: false, ignoreFonts: false, breakPages: true,
          ignoreLastRenderedPageBreak: false, renderHeaders: true,
          renderFooters: true, renderFootnotes: true, renderEndnotes: true,
          renderComments: false, renderChanges: false, renderAltChunks: false,
          useBase64URL: true, experimental: false,
        });
        if (cancelled) return;
        // Defense in depth. The sandbox also disables scripts, forms and top
        // navigation. Embedded HTML (altChunk) rendering is disabled above.
        body.querySelectorAll("script,iframe,object,embed,form,base,meta,link").forEach((el) => el.remove());
        body.querySelectorAll("*").forEach((el) => {
          Array.from(el.attributes).forEach(({ name: attr }) => {
            if (/^on/i.test(attr) || ["contenteditable", "srcdoc", "autofocus"].includes(attr.toLowerCase())) el.removeAttribute(attr);
          });
          if (el.hasAttribute("href")) {
            const href = el.getAttribute("href");
            if (!href.startsWith("#") && !safeResourceUrl(href)) el.removeAttribute("href");
          }
          if (el.hasAttribute("src") && !/^(data:|blob:)/i.test(el.getAttribute("src"))) el.removeAttribute("src");
        });
        doc.getElementById("document-styles").replaceChildren(styles);
        doc.getElementById("pages").replaceChildren(body);
        const pages = body.querySelectorAll("section.original-docx");
        if (!pages.length) throw new Error("No readable pages were rendered. Open the original file or ask for a PDF copy.");
        setRenderVersion((value) => value + 1);
        callbacks.current.onReady?.(pages.length);
      } catch (error) { if (!cancelled) callbacks.current.onError?.(error); }
    })();
    function openLink(event) {
      const anchor = event.target?.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (href.startsWith("#")) return;
      event.preventDefault();
      const safe = safeResourceUrl(href);
      if (safe) window.open(safe, "_blank", "noopener,noreferrer");
    }
    doc.addEventListener("click", openLink);
    return () => { cancelled = true; doc.removeEventListener("click", openLink); };
  }, [blob, frameLoad]);

  useEffect(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    function fit() {
      const wrapper = doc?.querySelector(".original-docx-wrapper");
      const pages = Array.from(doc?.querySelectorAll("section.original-docx") || []);
      if (!wrapper || !pages.length) return;
      const width = Math.max(...pages.map((page) => page.offsetWidth));
      const scale = zoom === "fit" ? Math.min(1, Math.max(0.2, (frame.clientWidth - 48) / Math.max(width, 1))) : Number(zoom) / 100;
      wrapper.style.zoom = String(scale);
    }
    fit();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    if (frame) observer?.observe(frame);
    window.addEventListener("resize", fit);
    return () => { observer?.disconnect(); window.removeEventListener("resize", fit); };
  }, [zoom, renderVersion, frameLoad]);
  return <iframe ref={frameRef} className="odr-frame" sandbox="allow-same-origin" referrerPolicy="no-referrer" title={`${name} — read-only Word document`} srcDoc={FRAME_HTML} onLoad={() => setFrameLoad((value) => value + 1)} />;
}

export default function ProfessionalDocumentViewer({ material, onReady, compact = false }) {
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState("fit");
  const [retry, setRetry] = useState(0);
  const callbacks = useRef(onReady); callbacks.current = onReady;
  const name = material?.name || "Lesson document";
  const extension = materialExtension(material);
  const legacyTextOnly = !material?.url && typeof material?.text === "string";

  useEffect(() => {
    let active = true; let objectUrl = "";
    const controller = new AbortController();
    setLoading(true); setError(""); setBlob(null); setUrl(""); setText(""); setPages(0); setZoom("fit");
    if (legacyTextOnly) {
      setText(material.text); setLoading(false); callbacks.current?.();
      return () => { active = false; };
    }
    if (!material?.url) { setError("The original file was not saved. Ask your teacher to upload it again."); setLoading(false); return undefined; }
    (async () => {
      try {
        const original = await loadOriginalMaterial(material, controller.signal);
        if (!active) return;
        objectUrl = URL.createObjectURL(original);
        setBlob(original); setUrl(objectUrl);
        if (["txt", "md", "markdown", "csv", "json"].includes(extension)) {
          const bytes = new Uint8Array(await original.arrayBuffer());
          const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
          const content = new TextDecoder(encoding).decode(bytes);
          if (active) setText(content);
        }
        const supported = ["docx", "pdf", "txt", "md", "markdown", "csv", "json", "png", "jpg", "jpeg", "gif", "webp"].includes(extension);
        if (!supported) throw new Error(extension === "doc"
          ? "This older Word .doc file cannot be previewed in the browser. Download the original to read it, or ask your teacher to re-upload a DOCX or PDF copy."
          : "This file type has no inline preview. Download the original file, or ask your teacher for a DOCX or PDF copy.");
        if (active && extension !== "docx") { setLoading(false); callbacks.current?.(); }
      } catch (err) { if (active && err.name !== "AbortError") { setError(err.message || "The original file could not be loaded."); setLoading(false); } }
    })();
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [material?.url, material?.text, material?.name, material?.size, material?.sha256, extension, legacyTextOnly, retry]);

  function loaded(count) { setPages(count || 0); setLoading(false); callbacks.current?.(); }
  function failed(err) { setError(err.message || "This Word document could not be previewed. Download the original to open it in Word."); setLoading(false); }
  const originalHref = url || safeResourceUrl(material?.url);
  return <section className={`odr ${compact ? "odr--compact" : ""}`} aria-label="Original lesson document" aria-busy={loading}>
    <header className="odr-header"><span className="odr-file-icon"><FileText size={22}/></span><div className="odr-file-info"><h3>{name}</h3><p>{extension?.toUpperCase() || "DOCUMENT"}{material?.size ? ` · ${formatMaterialSize(material.size)}` : ""}{pages ? ` · ${pages} rendered ${pages === 1 ? "page" : "pages"}` : ""}</p></div><span className="odr-readonly"><LockKeyhole size={13}/> Read only</span></header>
    <div className="odr-toolbar"><span>{legacyTextOnly ? "Previously saved text" : "Original teacher upload"}</span><div>
      {extension === "docx" && <label className="odr-zoom"><ZoomIn size={15}/><span className="odr-sr-only">Document zoom</span><select value={zoom} onChange={(event) => setZoom(event.target.value)}><option value="fit">Fit width</option><option value="75">75%</option><option value="100">100%</option><option value="125">125%</option><option value="150">150%</option></select></label>}
      {originalHref && <a href={originalHref} download={name} target="_blank" rel="noopener noreferrer"><Download size={15}/><span>Download original</span></a>}
      {originalHref && extension === "pdf" && <a href={originalHref} target="_blank" rel="noopener noreferrer" aria-label="Open original PDF in a new tab"><ExternalLink size={15}/></a>}
    </div></div>
    {legacyTextOnly && <p className="odr-notice">Only extracted text was saved for this older lesson. Your teacher needs to re-upload the original file to restore its document layout.</p>}
    {loading && <div className="odr-loading" role="status"><LoaderCircle className="spin" size={25}/><strong>Opening your lesson</strong><span>Preparing the original document, without rewriting it.</span></div>}
    {error && <div className="odr-error" role="alert"><FileText size={30}/><h4>Document preview unavailable</h4><p>{error}</p><div><button type="button" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={15}/> Try again</button>{originalHref && <a href={originalHref} download={name} target="_blank" rel="noopener noreferrer"><Download size={15}/> Open original file</a>}</div></div>}
    {blob && extension === "docx" && !error && <div style={{ display: loading ? "none" : undefined }}><DocxCanvas key={retry} blob={blob} name={name} zoom={zoom} onReady={loaded} onError={failed}/></div>}
    {url && extension === "pdf" && !error && <><iframe className="odr-frame" title={`${name} — original PDF`} src={`${url}#view=FitH`} /><p className="odr-notice">PDF not showing on this device? Use the open-in-new-tab button above.</p></>}
    {url && ["png", "jpg", "jpeg", "gif", "webp"].includes(extension) && !error && <img className="odr-image" src={url} alt={name}/>}
    {(legacyTextOnly || ["txt", "md", "markdown", "csv", "json"].includes(extension)) && !error && !loading && <pre className="odr-text">{text}</pre>}
    {extension === "docx" && !error && <footer className="odr-footer">The original file is preserved. Browser pagination, fonts, equations, or complex Word layouts may differ from Microsoft Word. For fixed page layout, your teacher can upload a PDF.</footer>}
  </section>;
}
