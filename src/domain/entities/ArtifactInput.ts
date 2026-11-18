/**
 * What the user hands the analysis pipeline. Bytes never cross this boundary
 * for documents: the browser extracts text first, so the input carries plain
 * text. The URL and screenshot variants are captured server-side as before.
 */
export type ArtifactInput =
  | { type: "url"; url: string }
  | { type: "screenshot"; imageBase64: string; url?: string }
  | {
      type: "text";
      text: string;
      /** Display label: joined document names, or "Pasted text". */
      label?: string;
      /** Names of the uploaded documents, in selection order. */
      files?: string[];
    };

/** The three artifact kinds, as persisted on an analysis record. */
export type ArtifactInputKind = ArtifactInput["type"];
