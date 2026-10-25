/**
 * What the artifact form accepts and the caps every caller enforces. This is
 * the single source for accepted formats, size limits and the text-cap
 * message so the form, the intake adapter and the VPS route cannot drift.
 *
 * Nothing here touches the filesystem or React: the UI renders the labels, the
 * extractor adapts files, and the server re-validates the text variant.
 */
import type { ArtifactInput } from "./ArtifactInput";

/** Characters of extracted or pasted text one run may carry. */
export const MAX_TEXT_CHARS = 80_000;

export const MAX_DOCUMENTS = 5;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Label used when the artifact is pasted rather than uploaded. */
export const PASTED_TEXT_LABEL = "Pasted text";

/** Label used for a screenshot run; persisted alongside the record. */
export const SCREENSHOT_LABEL = "Screenshot";

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const ACCEPTED_IMAGE_HINT = "PNG, JPG, or WEBP — under 10 MB";

export type DocumentKind = "pdf" | "docx" | "pptx" | "txt" | "md" | "csv" | "json" | "rtf";

const EXTENSION_TO_KIND: Record<string, DocumentKind> = {
  pdf: "pdf",
  docx: "docx",
  pptx: "pptx",
  txt: "txt",
  md: "md",
  markdown: "md",
  csv: "csv",
  json: "json",
  rtf: "rtf",
};

/** Formats we refuse with export instructions instead of a generic error. */
const LEGACY_OFFICE_EXTENSIONS: Record<string, true> = { doc: true, ppt: true };

/** Derived from the one format map above, so the picker cannot drift from the parser. */
export const ACCEPTED_DOCUMENT_EXTENSIONS = Object.keys(EXTENSION_TO_KIND).map((extension) => `.${extension}`);

/** One line the form shows under the document picker, derived from the same map. */
export const ACCEPTED_DOCUMENT_HINT = ACCEPTED_DOCUMENT_EXTENSIONS
  .map((extension) => extension.slice(1).toUpperCase())
  .join(", ");

export function documentKindOf(filename: string): DocumentKind | null {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TO_KIND[extension] ?? null;
}

/** The separator placed between concatenated documents, named by its file. */
export function documentSeparator(filename: string): string {
  return `\n\n=== ${filename} ===\n\n`;
}

export function formatCharacterCount(count: number): string {
  return count.toLocaleString("en-US");
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

/**
 * The message for an over-cap text, or null when it is within the cap. Names
 * the overage so the user knows how much to cut.
 */
export function validateTextLength(textLength: number): string | null {
  if (textLength <= MAX_TEXT_CHARS) return null;
  const over = textLength - MAX_TEXT_CHARS;
  return `Text is ${formatCharacterCount(textLength)} characters — ${formatCharacterCount(over)} over the ${formatCharacterCount(MAX_TEXT_CHARS)} limit. Trim ${formatCharacterCount(over)} characters.`;
}

/**
 * Server-side re-validation of a text artifact. Returns a user-facing message
 * or null.
 */
export function validateTextArtifact(input: Extract<ArtifactInput, { type: "text" }>): string | null {
  if (typeof input.text !== "string" || input.text.trim().length === 0) {
    return "Pasted text is empty. Paste the document text or upload a file.";
  }
  return validateTextLength(input.text.length);
}

/**
 * Validation for a document selection, in the order the user can act on it:
 * count, then per-file format and size, then duplicates. Returns a message or
 * null.
 */
export function validateDocumentSelection(files: Array<{ name: string; size: number }>): string | null {
  if (files.length === 0) {
    return "Choose at least one document.";
  }
  if (files.length > MAX_DOCUMENTS) {
    return `You can add up to ${MAX_DOCUMENTS} documents per run.`;
  }
  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (LEGACY_OFFICE_EXTENSIONS[extension]) {
      return `"${file.name}" is a legacy Office format. Export it to PDF or DOCX first.`;
    }
    if (!documentKindOf(file.name)) {
      return `"${file.name}" is not a supported format. Use ${ACCEPTED_DOCUMENT_HINT}.`;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      return `"${file.name}" is ${megabytes(file.size)}. Each document must be under 20 MB.`;
    }
  }
  const names = files.map((f) => f.name.toLowerCase());
  const duplicate = names.find((name, i) => names.indexOf(name) !== i);
  if (duplicate) {
    const original = files[names.indexOf(duplicate)].name;
    return `"${original}" is already in this run.`;
  }
  return null;
}

/** The message for an oversized or unsupported image, or null. */
export function validateImageFile(file: { name: string; size: number; type: string }): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Only PNG, JPG, and WEBP images are accepted.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Image must be under 10 MB.";
  }
  return null;
}

/** How extractors report a user-correctable failure with its display message. */
export class ArtifactTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactTextError";
  }
}

export function emptyExtractionMessage(filename: string): string {
  return `No extractable text in "${filename}" — upload the page as a screenshot instead.`;
}
