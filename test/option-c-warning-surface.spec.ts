// @vitest-environment node
// The S1 warning surface: a persisted report whose validator rejected fields
// after its one repair must show a banner, mark the same fields inline, and
// keep the rest of the code-owned report visible.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import type { ChildProcess } from 'child_process';
import path from 'path';
import { findOrStartServer, SCREENSHOT_DIR, ensureScreenshotDir, SERVER_TIMEOUT } from './helpers/server';

const TEST_TIMEOUT = 30_000;
const SIM_ID = 'seeded-warned-run';
const SIM_NAME = 'Pricing page — warned run';

let BASE_URL = '';
let browser: Browser;
let serverProcess: ChildProcess | null = null;

function buildResponse(id: string, name: string) {
  return {
    id,
    personaId: id,
    screenshotBase64: '',
    rawAnalysis: `${name} said the price was hidden.`,
    overview: `${name} could not find the price.`,
    customerJourney: ['interpretation', 'understanding', 'belief', 'motivation', 'action'].map((stage) => ({
      stage,
      description: `${stage} happened.`,
      sentiment: 'neutral',
      outcome: 'succeeded',
    })),
    researchQuestionAnswer: `${name} would not act without a price.`,
    majorFindings: [],
    pointsOfFriction: [],
    unansweredQuestions: [],
    personaProfile: {
      name,
      occupation: 'Engineer',
      bigFive: { conscientiousness: 50, neuroticism: 50, openness: 50, extraversion: 50, agreeableness: 50 },
      values: [],
      fears: [],
      communicationStyle: 'direct',
      decisionStyle: 'data-driven',
    },
    claims: [
      {
        id: `${id}:0`,
        personaId: id,
        topic: 'Price opacity',
        observation: 'The price is hidden.',
        stance: 'opposes',
        quote: `${name} said the price was hidden.`,
      },
    ],
  };
}

function buildWarnedState() {
  return JSON.stringify({
    state: {
      analyses: [
        {
          id: SIM_ID,
          name: SIM_NAME,
          url: 'https://example.com/pricing',
          status: 'COMPLETED',
          personaCount: 2,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          completedResponses: 2,
          totalResponses: 2,
          responses: [buildResponse('r-1', 'Sarah Chen'), buildResponse('r-2', 'Marcus Lee')],
          synthesis: {
            overview: 'All 99 personas stopped.',
            researchQuestionAnswer: 'The price is hidden from every persona.',
            topFindings: [
              {
                observation: 'All personas stalled on the hidden price.',
                evidence: 'Sarah Chen said the price was hidden.',
                impact: 'They stop before acting.',
                confidence: 'strongly supported',
                affectedPersonaCount: 2,
                totalPersonaCount: 2,
                groupId: 'g1',
                citations: [{ personaId: 'r-1', personaName: 'Sarah Chen', quote: 'Sarah Chen said the price was hidden.' }],
              },
            ],
            disagreements: [
              {
                topic: 'Price opacity',
                split: [
                  { view: 'Supports', personaCount: 0 },
                  { view: 'Opposes', personaCount: 2 },
                  { view: 'No clear view', personaCount: 0 },
                ],
                significance: 'High',
                groupId: 'g1',
              },
            ],
            biggestFrictions: ['The price is hidden.'],
            completedCount: 2,
            failedCount: 0,
            totalPersonaCount: 2,
            validationWarnings: [
              'overview: states the number 99, which the ledger and facts do not contain.',
              'finding:g1:observation: says "all" for a group that 2 of 2 personas hold.',
              'friction:0: makes a recommendation instead of reporting what the cohort did.',
            ],
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
  }, buildWarnedState());
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

describe('S1 warning surface', { timeout: TEST_TIMEOUT }, () => {
  it('shows the banner, the inline marks, and the persisted warnings at 1440', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await seedAnalysisStore(page);
    await page.goto(`${BASE_URL}/dashboard/analyses/${SIM_ID}`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    const alert = page.locator('[data-validation-banner="true"]');
    await alert.waitFor({ state: 'visible', timeout: 10_000 });
    const alertText = (await alert.textContent()) ?? '';
    expect(alertText).toContain('3 unverified fields');
    expect(alertText).toContain('states the number 99');
    expect(alertText).toContain('friction:0');

    const marks = page.locator('[data-validation-warning="true"]');
    await marks.first().waitFor({ state: 'visible', timeout: 10_000 });
    expect(await marks.count()).toBeGreaterThanOrEqual(2);
    expect(await page.getByText('Unverified field — see the report warning').first().isVisible()).toBe(true);

    // The code-owned report is still present; the warning does not blank it.
    expect(await page.getByText('2 of 2 personas completed').first().isVisible()).toBe(true);
    expect(await page.getByText('Top findings').first().isVisible()).toBe(true);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'option-c-warning-1440.png'),
      fullPage: true,
    });
    await page.close();
  });

  it('keeps the banner and inline marks readable at 390', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await seedAnalysisStore(page);
    await page.goto(`${BASE_URL}/dashboard/analyses/${SIM_ID}`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    const alert = page.locator('[data-validation-banner="true"]');
    await alert.waitFor({ state: 'visible', timeout: 10_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    const marks = page.locator('[data-validation-warning="true"]');
    await marks.first().waitFor({ state: 'visible', timeout: 10_000 });
    expect(await marks.count()).toBeGreaterThanOrEqual(1);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'option-c-warning-390.png'),
      fullPage: true,
    });
    await page.close();
  });
});
