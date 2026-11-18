/**
 * The artifact as captured for analysis. A URL or screenshot run carries the
 * screenshot the persona "sees"; a text run carries already-extracted document
 * text instead, and no screenshot at all. The page HTML and its summary are
 * optional supporting material for the title call.
 */
export interface ArtifactIntake {
  /** Absent for text runs — the persona reads `text` instead. */
  screenshotBase64?: string;
  /** Already-extracted text of an uploaded or pasted artifact. */
  text?: string;
  /** Display label for a text run: joined document names, or "Pasted text". */
  label?: string;
  pageHtml?: string;
  url?: string;
  /**
   * Summary of the page HTML, resolved off the critical path. The persona
   * pipeline never reads it; the only consumer (simulation title) awaits it
   * concurrently with persona analysis. Never started when there is no HTML.
   */
  summaryPromise?: Promise<string>;
}

/**
 * How prompts describe the artifact to a persona: a website they are visiting,
 * or a document they have been handed. The name is the site brand or the
 * document label; what kind of document it is stays inferred by the persona
 * from the text and the research question.
 */
export interface ArtifactFraming {
  kind: "site" | "document";
  name?: string;
}
