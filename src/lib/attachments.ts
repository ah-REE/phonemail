/**
 * Attachments: the limits, and the two small helpers that go with them.
 *
 * ONE place, because three layers have to agree about the numbers: the browser
 * refuses an oversize file before it is uploaded, the send route refuses it again
 * (a client is a convenience, never the guard), and the inbound webhook refuses a
 * message whose attachments would blow the same budget. A limit that lives in
 * three places is a limit that will disagree with itself.
 *
 * This module is deliberately PURE - no Prisma, no Node APIs - so a client
 * component can import it without dragging the database into the browser bundle.
 */

/** Files per message. */
export const MAX_FILES = 3;
/** Bytes per file. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Bytes per message, across all of its files. */
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

export interface AttachmentMeta {
  filename: string;
  contentType: string;
  sizeBytes: number;
}

/** What the SMTP service hands to the inbound webhook: the bytes, base64. */
export interface InboundAttachment extends AttachmentMeta {
  contentBase64: string;
}

/** "1.4 MB", "812 KB", "0 bytes" - for a chip or a card, never for a limit check. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 bytes";
  }
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The one validation rule, used by the browser and by the send route.
 * Returns the reason it was refused, or null when the set is acceptable.
 */
export function validateAttachmentSet(files: { filename: string; sizeBytes: number }[]): string | null {
  if (files.length > MAX_FILES) {
    return `Up to ${MAX_FILES} files per message.`;
  }

  const oversize = files.find((file) => file.sizeBytes > MAX_FILE_BYTES);
  if (oversize) {
    return `${oversize.filename} is ${formatBytes(oversize.sizeBytes)}; the limit is ${formatBytes(MAX_FILE_BYTES)} per file.`;
  }

  const total = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  if (total > MAX_TOTAL_BYTES) {
    return `Those files total ${formatBytes(total)}; the limit is ${formatBytes(MAX_TOTAL_BYTES)} per message.`;
  }

  return null;
}

/** The icon a message card draws for a mime type. */
export function attachmentKind(contentType: string): "image" | "pdf" | "text" | "file" {
  if (contentType.startsWith("image/")) return "image";
  if (contentType === "application/pdf") return "pdf";
  if (contentType.startsWith("text/")) return "text";
  return "file";
}
