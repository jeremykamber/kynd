/**
 * Document → plain text for artifact analysis. Runs in the browser (the form
 * extracts before dispatch, so no file bytes cross the server-action limit)
 * and under Node for the verification harness. Nothing here touches React or
 * DOM globals; heavy parsers are loaded only when their format is chosen.
 *
 * Multi-file input is concatenated in selection order with a named separator,
 * and the character cap is enforced here — reject, never truncate.
 */
import {
  ACCEPTED_DOCUMENT_HINT,
  ArtifactTextError,
  documentKindOf,
  documentSeparator,
  emptyExtractionMessage,
  validateDocumentSelection,
  validateTextLength,
} from "@/domain/entities/ArtifactIntakeLimits";
import type { DocumentKind } from "@/domain/entities/ArtifactIntakeLimits";

/** The subset of `File` this module needs, so Node callers can pass a Blob. */
export interface ExtractableFile {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ExtractedArtifactText {
  text: string;
  label: string;
  files: Array<{ name: string; size: number }>;
}

export async function extractArtifactText(files: ExtractableFile[]): Promise<ExtractedArtifactText> {
  const selectionProblem = validateDocumentSelection(files);
  if (selectionProblem) throw new ArtifactTextError(selectionProblem);

  const sections: string[] = [];
  let totalChars = 0;

  for (const file of files) {
    const kind = documentKindOf(file.name);
    if (!kind) throw new ArtifactTextError(`"${file.name}" is not a supported format. Use ${ACCEPTED_DOCUMENT_HINT}.`);

    const buffer = await file.arrayBuffer();
    const text = (await extractOne(kind, buffer)).trim();
    if (!text) throw new ArtifactTextError(emptyExtractionMessage(file.name));

    // Fail as soon as the accumulated text crosses the cap: a 20 MB file of
    // text is far past it, and there is no point parsing the rest.
    totalChars += text.length + (sections.length > 0 ? documentSeparator(file.name).length : 0);
    const lengthProblem = validateTextLength(totalChars);
    if (lengthProblem) throw new ArtifactTextError(lengthProblem);

    sections.push(sections.length === 0 ? text : documentSeparator(file.name) + text);
  }

  const text = sections.join("");
  return {
    text,
    label: files.map((f) => f.name).join(", "),
    files: files.map((f) => ({ name: f.name, size: f.size })),
  };
}

/* Parsers load on demand: a run that never touches a document must not pay
 * for pdfjs or mammoth, and each format's parser is a literal specifier no
 * runtime registry chooses. */
async function extractOne(kind: DocumentKind, buffer: ArrayBuffer): Promise<string> {
  switch (kind) {
    case "txt":
    case "md":
    case "csv":
    case "json":
      return new TextDecoder().decode(buffer);
    case "rtf":
      return stripRtf(new TextDecoder().decode(buffer));
    case "docx": {
      const mammoth = await import("mammoth");
      // mammoth ships two builds: the Node entry reads a Buffer, the browser
      // entry reads an ArrayBuffer. Pick by environment, as pdfjs does.
      const result = await mammoth.extractRawText(
        typeof window === "undefined" && typeof Buffer !== "undefined"
          ? { buffer: Buffer.from(buffer) }
          : { arrayBuffer: buffer },
      );
      return result.value;
    }
    case "pptx":
      return extractPptx(buffer);
    case "pdf":
      return extractPdf(buffer);
  }
}

/**
 * RTF control-word strip: drop destinations/groups we never want (font tables,
 * stylesheets, embedded pictures), translate paragraph/line breaks, unescape
 * hex and unicode escapes, then remove the remaining markup. Good enough for
 * briefs and copy; not a layout renderer.
 */
export function stripRtf(rtf: string): string {
  const withoutBinary = rtf.replace(/\{\\(?:\*)?\\?(?:fonttbl|colortbl|stylesheet|info|pict)\b[\s\S]*?\}/g, " ");
  const withBreaks = withoutBinary
    .replace(/\\par[d]?\b/g, "\n")
    .replace(/\\line\b/g, "\n")
    .replace(/\\tab\b/g, "\t")
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u(-?\d+)\??/g, (_, code: string) => String.fromCharCode(Number(code) < 0 ? Number(code) + 65536 : Number(code)))
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  return withBreaks.trim();
}

/** Slide text in slide order; one line per text run, one blank line per slide. */
async function extractPptx(buffer: ArrayBuffer): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const archive = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(archive.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => {
      const slideNumber = (path: string) => Number(path.match(/(\d+)\.xml$/)?.[1] ?? 0);
      return slideNumber(a) - slideNumber(b);
    });

  const slides: string[] = [];
  for (const path of slidePaths) {
    const xml = await archive.file(path)!.async("string");
    const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]));
    const slideText = runs.join("\n").trim();
    if (slideText) slides.push(slideText);
  }
  return slides.join("\n\n");
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Page text via pdfjs. A PDF with no text layer (a scan, or an exported image)
 * yields nothing, which the caller reports as "upload the page as a screenshot".
 */
async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // In the browser the parser needs a worker; Next resolves this URL at build
  // time and serves the worker as an asset. Under Node pdfjs runs inline.
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  try {
    // Await inside the try: a corrupt or encrypted PDF rejects the load, and
    // pdfjs only tears down the worker/transport through destroy() — without
    // this the failed attempt leaks a worker holding the document.
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: string[] = [];
      for (const item of content.items) {
        if ("str" in item && item.str.trim()) lines.push(item.str);
      }
      pages.push(lines.join(" "));
    }
    return pages.join("\n\n");
  } finally {
    // Tears down the worker/transport; the proxy has no destroy of its own.
    await loadingTask.destroy();
  }
}
