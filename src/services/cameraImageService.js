/**
 * Classroom picture compression for Realtime Database only.
 * Images are resized + JPEG-compressed, then stored as base64 data URLs
 * on the camera program record in RTDB (no Firebase Storage).
 */

const MAX_EDGE = 320;
const JPEG_QUALITY = 0.62;
const MAX_DATA_URL_CHARS = 90_000; // keeps each option practical for RTDB

/**
 * Resize + compress an image File/Blob to a JPEG data URL for RTDB.
 */
export async function compressImageFile(file, { maxEdge = MAX_EDGE, quality = JPEG_QUALITY } = {}) {
  if (!file) throw new Error("Choose an image file first.");
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("Only image files are supported (JPG, PNG, WebP, GIF).");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Image is too large. Use a file under 8 MB.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    let edge = maxEdge;
    let q = quality;
    let dataUrl = "";

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not prepare the image canvas.");
      ctx.drawImage(bitmap, 0, 0, width, height);
      dataUrl = canvas.toDataURL("image/jpeg", q);

      if (dataUrl.length <= MAX_DATA_URL_CHARS) {
        return dataUrl;
      }
      // Tighten for the next attempt.
      q = Math.max(0.35, q - 0.08);
      edge = Math.max(120, Math.round(edge * 0.78));
    }

    throw new Error(
      "This picture is still too large after compression. Use a simpler image (icons, symbols, or clear photos work best).",
    );
  } finally {
    bitmap.close?.();
  }
}

/**
 * Compress a classroom picture and return a base64 data URL for Realtime Database.
 * Kept as uploadCameraChoiceImage so TeacherCameraStudio does not need changes.
 */
export async function uploadCameraChoiceImage(file, _meta = {}) {
  const dataUrl = await compressImageFile(file);
  return {
    url: dataUrl,
    path: null,
    bytes: Math.round((dataUrl.length * 3) / 4),
    source: "rtdb-base64",
  };
}
