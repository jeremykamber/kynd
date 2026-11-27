// @vitest-environment node
// The S1 persona card: claims the support gate or the verbatim check rejected
// stay on the card in a collapsed "Not counted" section. They never set a
// count, a finding, or a split.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import type { ChildProcess } from 'child_process';
import path from 'path';
import { findOrStartServer, SCREENSHOT_DIR, ensureScreenshotDir, SERVER_TIMEOUT } from './helpers/server';

const TEST_TIMEOUT = 30_000;
const SIM_ID = 'seeded-not-counted-run';
const SIM_NAME = 'Pricing page — not counted';

let BASE_URL = '';
let browser: Browser;
let serverProcess: ChildProcess | null = null;

function buildResponse() {
  const name = 'Sarah Chen';
  return {
    id: 'r-1',
    personaId: 'p-1',
    screenshotBase64: '',
    rawAnalysis: `${name} said the price was hidden. ${name} also said the page was fast.`,
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
  };
}

function buildState() {
  return JSON.stringify({
    state: {
      analyses: [
        {
          id: SIM_ID,
          name: SIM_NAME,
          url: 'https://example.com/pricing',
          status: 'COMPLETED',
          personaCount: 1,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          completedResponses: 1,
          totalResponses: 1,
          responses: [buildResponse()],
          synthesis: {
            overview: 'One persona could not find the price.',
            researchQuestionAnswer: 'Price is hidden.',
            topFindings: [],
            disagreements: [],
            biggestFrictions: [],
            completedCount: 1,
            failedCount: 0,
            totalPersonaCount: 1,
            verdicts: { adopt: 0, trial: 0, reject: 1, undecided: 0 },
            claimGroups: [],
            degraded: [],
            missingClaimPersonaIds: [],
            validationWarnings: [],
            rejectedClaims: [
              {
                claim: {
                  id: 'p-1:1',
                  personaId: 'p-1',
                  topic: 'Price opacity',
                  observation: 'The price is hidden.',
                  stance: 'opposes',
                  quote: 'the price was hidden',
                },
                level: 'partial',
                reason: 'The quote is a fragment, not a full supporting sentence.',
              },
              {
                claim: {
                  id: 'p-1:2',
                  personaId: 'p-1',
                  topic: 'Speed',
                  observation: 'The page is fast.',
                  stance: 'supports',
                  quote: 'the page was fast',
                },
                level: 'unsupported',
                reason: 'The transcript does not connect speed to a decision.',
              },
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
        if (!req.result.objectStoreNames.contains('keyval')) req.result.createObjectStore('keyval');
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
  const result = await findOrStartServer({ preferredPort: 3220 });
  BASE_URL = result.url;
  serverProcess = result.process;
  browser = await chromium.launch({ headless: true });
}, SERVER_TIMEOUT + 30_000);

afterAll(async () => {
  await browser?.close();
  if (serverProcess) serverProcess.kill('SIGTERM');
});

describe('S1 Not counted section', { timeout: TEST_TIMEOUT }, () => {
  it('keeps rejected claims collapsed on the persona card', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await seedAnalysisStore(page);
    await page.goto(`${BASE_URL}/dashboard/analyses/${SIM_ID}`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    await page.locator('button:has-text("Sarah Chen")').first().click();
    const summary = page.getByText('Not counted (2)').first();
    await summary.waitFor({ state: 'visible', timeout: 10_000 });

    const details = summary.locator('xpath=ancestor::details[1]');
    expect(await details.evaluate((el: HTMLDetailsElement) => el.open)).toBe(false);
    await summary.click();
    expect(await details.evaluate((el: HTMLDetailsElement) => el.open)).toBe(true);
    expect(await page.getByText('The quote is a fragment, not a full supporting sentence.').isVisible()).toBe(true);
    expect(await page.getByText('unsupported').first().isVisible()).toBe(true);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'option-c-not-counted-1440.png'),
      fullPage: true,
    });
    await page.close();
  });

  it('keeps the section readable at 390', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await seedAnalysisStore(page);
    await page.goto(`${BASE_URL}/dashboard/analyses/${SIM_ID}`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    await page.locator('button:has-text("Sarah Chen")').first().click();
    const summary = page.getByText('Not counted (2)').first();
    await summary.waitFor({ state: 'visible', timeout: 10_000 });
    await summary.click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'option-c-not-counted-390.png'),
      fullPage: true,
    });
    await page.close();
  });
});
