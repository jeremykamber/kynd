// @vitest-environment node
// The source artifact is part of the report, not only the input form: a text
// run must show what was analyzed and the PDF must carry that source with it.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import type { ChildProcess } from 'child_process';
import path from 'path';
import { stat } from 'fs/promises';
import { findOrStartServer, SCREENSHOT_DIR, ensureScreenshotDir, SERVER_TIMEOUT } from './helpers/server';

const TEST_TIMEOUT = 45_000;
const SIM_ID = 'seeded-text-source';
const SIM_NAME = 'Feature brief — text run';
const SOURCE_TEXT = 'The product costs $49 per seat. It includes SSO and audit logs.';

let BASE_URL = '';
let browser: Browser;
let serverProcess: ChildProcess | null = null;

function buildState() {
  return JSON.stringify({
    state: {
      analyses: [
        {
          id: SIM_ID,
          name: SIM_NAME,
          url: 'Feature brief',
          inputKind: 'text',
          label: 'Feature brief',
          status: 'COMPLETED',
          personaCount: 1,
          completedResponses: 1,
          totalResponses: 1,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          text: SOURCE_TEXT,
          sourceFiles: ['feature-brief.txt'],
          artifactProfile: {
            contentKind: 'feature_brief',
            facts: [
              { kind: 'product', label: 'Product', value: 'Acme', source: 'text' },
              { kind: 'price', label: 'Price', value: '$49 per seat', source: 'text', amount: 49, currency: 'USD' },
            ],
            openQuestions: ['setup fee'],
            stageAnchorKind: 'quote',
            confidence: 'high',
            degraded: [],
          },
          responses: [
            {
              id: 'r-1',
              personaId: 'r-1',
              screenshotBase64: '',
              rawAnalysis: 'I read the price and the security features.',
              overview: 'The price is clear.',
              customerJourney: ['interpretation', 'understanding', 'belief', 'motivation', 'action'].map((stage) => ({
                stage,
                description: `${stage} happened.`,
                sentiment: 'neutral',
                outcome: 'succeeded',
              })),
              researchQuestionAnswer: 'I would adopt it.',
              majorFindings: [],
              pointsOfFriction: [],
              unansweredQuestions: [],
              personaProfile: {
                name: 'Sarah Chen',
                occupation: 'Engineer',
                bigFive: { conscientiousness: 50, neuroticism: 50, openness: 50, extraversion: 50, agreeableness: 50 },
                values: [],
                fears: [],
                communicationStyle: 'direct',
                decisionStyle: 'data-driven',
              },
            },
          ],
          synthesis: {
            overview: 'The price and security features were understood.',
            researchQuestionAnswer: 'One persona would adopt the product.',
            topFindings: [
              {
                observation: 'The price is clear.',
                evidence: 'Sarah Chen found the price.',
                impact: 'She would adopt it.',
                confidence: 'strongly supported',
                affectedPersonaCount: 1,
                totalPersonaCount: 1,
              },
            ],
            disagreements: [],
            biggestFrictions: [],
            completedCount: 1,
            failedCount: 0,
            totalPersonaCount: 1,
          },
        },
      ],
      dismissedAnalysisIds: [],
    },
    version: 3,
  });
}

async function seedAnalysisStore(page: Page) {
  await page.addInitScript((seed) => {
    return new Promise<void>((resolve) => {
      const req = indexedDB.open('keyval-store');
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('keyval')) {
          req.result.createObjectStore('keyval');
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('keyval', 'readwrite');
        tx.objectStore('keyval').put(seed, 'analysis-storage');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); resolve(); };
      };
      req.onerror = () => resolve();
    });
  }, buildState());
}

beforeAll(async () => {
  await ensureScreenshotDir();
  const result = await findOrStartServer({ preferredPort: 3214 });
  BASE_URL = result.url;
  serverProcess = result.process;
  browser = await chromium.launch({ headless: true });
}, SERVER_TIMEOUT + 30_000);

afterAll(async () => {
  await browser?.close();
  if (serverProcess) serverProcess.kill('SIGTERM');
});

describe('text source in the report', { timeout: TEST_TIMEOUT }, () => {
  it('shows the analyzed text and downloads a PDF that carries it', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await seedAnalysisStore(page);
    await page.goto(`${BASE_URL}/dashboard/analyses/${SIM_ID}`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    await page.getByText('Read the analyzed text').waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByText('feature-brief.txt').waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByText('Artifact profile').waitFor({ state: 'visible', timeout: 10_000 });
    expect(await page.getByText('$49 per seat').first().isVisible()).toBe(true);

    await page.getByText('Read the analyzed text').click();
    await page.getByText(SOURCE_TEXT).waitFor({ state: 'visible', timeout: 10_000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: /Download PDF Report/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const { size } = await stat(filePath!);
    expect(size).toBeGreaterThan(1_000);
    await download.saveAs(path.join(SCREENSHOT_DIR, 'option-c-source.pdf'));

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'option-c-source-1440.png'),
      fullPage: true,
    });
    await page.close();
  });
});
