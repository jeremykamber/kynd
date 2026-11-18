import type { ArtifactIntake } from "@/domain/entities/ArtifactIntake";
import type { ArtifactInput } from "@/domain/entities/ArtifactInput";
import {
  PASTED_TEXT_LABEL,
  validateTextArtifact,
} from "@/domain/entities/ArtifactIntakeLimits";
import type { BrowserServicePort } from "@/domain/ports/BrowserServicePort";
import type { LlmServicePort } from "@/domain/ports/LlmServicePort";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";

export type IntakeProgress = "NAVIGATING" | "CAPTURING" | "PROCESSING" | "COMPLETE";

export type IntakeProgressCallback = (progress: IntakeProgress) => void;

/**
 * Front door of the artifact pipeline: normalizes a URL, an uploaded
 * screenshot, or already-extracted document text into an ArtifactIntake the
 * rest of the run consumes. Talks to the BrowserServicePort (Playwright) for
 * URL capture and to LlmServicePort for the page summary, which it kicks off
 * without blocking capture. Text intake touches neither, so it completes the
 * progress flow immediately. Reports coarse progress to the caller and
 * optionally traces through AnalysisLogger — counts and lengths, never the
 * artifact's content.
 */
export class ArtifactIntakeAdapter {
  /**
   * The browser arrives through a factory, not an instance: a text run never
   * opens one, so it must not pay to construct (or configure) Playwright.
   */
  constructor(
    private readonly browserServiceFactory: () => BrowserServicePort,
    private readonly llmService: LlmServicePort,
  ) {}

  /**
   * Summarization is NOT on the critical path: the persona pipeline needs
   * only the screenshot (VisionAnalysisAdapter deliberately ignores summary/
   * pageHtml), and the summary's sole consumer is the nice-to-have title.
   * Summarizing inline added a serial 5-70s LLM round-trip to every URL run
   * before the first monologue could start. Capture returns immediately;
   * the summary rides along as a promise the title task awaits.
   */
  async intake(
    input: ArtifactInput,
    onProgress?: IntakeProgressCallback,
    runId?: string,
  ): Promise<ArtifactIntake> {
    const log = runId ? AnalysisLogger.forRun(runId) : null;

    log?.info("ArtifactIntakeAdapter", "Starting intake", {
      inputType: input.type,
      ...(input.type === "text"
        ? { textLength: input.text.length, fileCount: input.files?.length ?? 0 }
        : {}),
    });

    if (input.type === "text") {
      // Re-validated here even though the form checks first: a hand-crafted
      // call must not start a run with an empty or oversized document.
      const textProblem = validateTextArtifact(input);
      if (textProblem) {
        throw new Error(textProblem);
      }
      onProgress?.("COMPLETE");
      return {
        text: input.text,
        label: input.label?.trim() || PASTED_TEXT_LABEL,
      };
    }

    if (input.type === "url") {
      const { screenshotBase64, pageHtml, url } = await this.captureUrl(input.url, onProgress, runId);
      const summaryPromise = pageHtml
        ? this.llmService.summarizeHtml(pageHtml, runId)
        : Promise.resolve("");
      onProgress?.("COMPLETE");
      return { screenshotBase64, pageHtml, url, summaryPromise };
    }

    if (!input.imageBase64) {
      throw new Error("Cannot intake: screenshot data is missing");
    }

    onProgress?.("COMPLETE");

    // The client sends a full data URL (data:image/png;base64,...) from
    // FileReader.readAsDataURL.  Downstream adapters (VisionAnalysisAdapter,
    // LlmServiceImpl) wrap raw base64 with their own data-URL prefix, so we
    // must strip the prefix here to avoid double-wrapping.
    const rawBase64 = stripDataUrlPrefix(input.imageBase64);

    return {
      screenshotBase64: rawBase64,
      url: input.url,
    };
  }

  private async captureUrl(
    url: string,
    onProgress?: IntakeProgressCallback,
    runId?: string,
  ): Promise<{ screenshotBase64: string; pageHtml?: string; url: string }> {
    const log = runId ? AnalysisLogger.forRun(runId) : null;
    const browser = this.browserServiceFactory();

    onProgress?.("NAVIGATING");

    try {
      await browser.navigateTo(url, (status) => {
        log?.trace("ArtifactIntakeAdapter", "Navigation status", { status });
      });

      onProgress?.("CAPTURING");

      const [screenshotBase64, cleanedHtml] = await Promise.all([
        browser.captureViewport(),
        browser.getCleanedHtml(),
      ]);

      if (!cleanedHtml) {
        return { screenshotBase64, url };
      }

      onProgress?.("PROCESSING");

      log?.info("ArtifactIntakeAdapter", "HTML captured for background summarization", {
        htmlLength: cleanedHtml.length,
      });

      return {
        screenshotBase64,
        pageHtml: cleanedHtml,
        url,
      };
    } finally {
      try {
        await browser.close();
      } catch (closeErr) {
        log?.warn("ArtifactIntakeAdapter", "Error closing browser", {
          error: String(closeErr),
        });
      }
    }
  }
}

function stripDataUrlPrefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return dataUrl;
  return dataUrl.slice(commaIndex + 1);
}
