// @vitest-environment node
// Text-artifact input, verified in a real browser: the three tabs, pasted text
// with its character cap, multi-document upload with real File.arrayBuffer(),
// and a completed text run's Source card. No live LLM calls — the completed
// run is seeded into the analysis store (IndexedDB).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import type { ChildProcess } from 'child_process';
import { findOrStartServer, SCREENSHOT_DIR, ensureScreenshotDir, SERVER_TIMEOUT } from './helpers/server';
import path from 'path';

const TEST_TIMEOUT = 30_000;
let BASE_URL = '';
let browser: Browser;
let serverProcess: ChildProcess | null = null;

const TEXT_SIM_ID = 'seeded-text-sim';
const TEXT_LABEL = 'seed-brief.md';
const TEXT_BODY = 'Feature brief: let a customer share one read-only analysis link with a teammate.';
const STAGES = ['interpretation', 'understanding', 'belief', 'motivation', 'action'] as const;

function buildPersonaResponse(id: string, name: string) {
  return {
    id,
    rawAnalysis: `Raw cognitive stream for ${name}.`,
    overview: `${name} understood the sharing model but asked who can revoke the link.`,
    customerJourney: STAGES.map((stage, i) => ({
      stage,
      description: `Stage ${i + 1}: what this persona experienced.`,
      sentiment: 'neutral' as const,
      outcome: 'succeeded' as const,
    })),
    researchQuestionAnswer: `${name} would forward the brief to their lead.`,
    majorFindings: [
      { observation: 'Revocation was unclear', evidence: `${name} reread the permissions line.`, impact: 'Slows sign-off.' },
    ],
    pointsOfFriction: ['Who can revoke a link?'],
    unansweredQuestions: ['Does the link expire?'],
    personaProfile: {
      name,
      occupation: 'Product manager',
      bigFive: { conscientiousness: 80, neuroticism: 30, openness: 70, extraversion: 50, agreeableness: 60 },
      values: ['Clarity'],
      fears: ['Losing control of shared data'],
      communicationStyle: 'direct',
      decisionStyle: 'data-driven',
    },
  };
}

function buildPersistedState() {
  return JSON.stringify({
    state: {
      analyses: [
        {
          id: TEXT_SIM_ID,
          name: `"Founders" — ${TEXT_LABEL}`,
          url: '',
          inputKind: 'text',
          label: TEXT_LABEL,
          sourceFiles: [TEXT_LABEL],
          text: TEXT_BODY,
          status: 'COMPLETED',
          personaCount: 1,
          personaNames: ['Sarah Chen'],
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          completedResponses: 1,
          totalResponses: 1,
          responses: [buildPersonaResponse('r-1', 'Sarah Chen')],
          synthesis: {
            overview: 'One persona reached the motivation stage.',
            researchQuestionAnswer: 'The brief explains sharing but not revocation.',
            topFindings: [
              {
                observation: 'Revocation is missing',
                evidence: 'The persona asked who can revoke the link.',
                impact: 'Blocks sign-off.',
                confidence: 'some support',
                affectedPersonaCount: 1,
                totalPersonaCount: 1,
              },
            ],
            disagreements: [],
            biggestFrictions: ['The permissions line is vague.'],
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

async function seedKeyval(page: Page, key: string, seed: string) {
  await page.addInitScript(({ key, seed }) => {
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
        tx.objectStore('keyval').put(seed, key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); resolve(); };
      };
      req.onerror = () => resolve();
    });
  }, { key, seed });
}

async function seedAnalysisStore(page: Page) {
  await seedKeyval(page, 'analysis-storage', buildPersistedState());
}

// The form needs a persona batch before it renders its fields.
function seedPersonaBatch() {
  return JSON.stringify({
    state: {
      batches: [
        {
          id: 'batch-seed',
          label: 'Founders',
          source: 'description',
          createdAt: new Date().toISOString(),
          personas: [
            {
              id: 'p-1', name: 'Sarah Chen', age: 34, occupation: 'Founder', educationLevel: 'BA',
              interests: [], goals: ['ship faster'],
              conscientiousness: 70, neuroticism: 40, openness: 60, extraversion: 50, agreeableness: 55,
              values: [], fears: [], communicationStyle: 'direct', decisionStyle: 'data-driven',
              backstory: 'Runs a seed-stage B2B SaaS.',
            },
          ],
        },
      ],
      activeBatchId: 'batch-seed',
    },
  });
}

async function seedPersonaStore(page: Page) {
  await seedKeyval(page, 'persona-storage', seedPersonaBatch());
}

beforeAll(async () => {
  await ensureScreenshotDir();
  const result = await findOrStartServer({ preferredPort: 3213 });
  BASE_URL = result.url;
  serverProcess = result.process;
  browser = await chromium.launch({ headless: true });
}, SERVER_TIMEOUT + 30_000);

afterAll(async () => {
  await browser?.close();
  if (serverProcess) serverProcess.kill('SIGTERM');
});

describe('Artifact text input — E2E', { timeout: TEST_TIMEOUT }, () => {
  it('offers URL, Upload, and Text on the new-analysis form', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await seedPersonaStore(page);
    await page.goto(`${BASE_URL}/dashboard/analyses?new=1`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    for (const tab of ['URL', 'Upload', 'Text']) {
      await expect(page.getByRole('tab', { name: tab }).isVisible()).resolves.toBe(true);
    }
    await page.close();
  });

  it('counts pasted characters, blocks over the cap, and enables the run under it', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await seedPersonaStore(page);
    await page.goto(`${BASE_URL}/dashboard/analyses?new=1`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    await page.getByRole('tab', { name: 'Text' }).click();
    const textarea = page.getByLabel('Artifact Text');
    const runButton = page.getByRole('button', { name: 'Run Analysis' });

    await textarea.fill('Feature brief: share a read-only analysis link.');
    await expect(page.getByText('47 / 80,000 characters').isVisible()).resolves.toBe(true);
    expect(await runButton.isEnabled()).toBe(true);

    await textarea.fill('x'.repeat(80_001));
    await expect(page.getByText('80,001 / 80,000 characters').isVisible()).resolves.toBe(true);
    expect(await page.getByText(/80,000 limit/).isVisible()).toBe(true);
    expect(await runButton.isDisabled()).toBe(true);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'artifact-text-cap-error.png'), fullPage: true });
    await page.close();
  });

  it('lists uploaded documents, removes one, and updates the totals', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await seedPersonaStore(page);
    await page.goto(`${BASE_URL}/dashboard/analyses?new=1`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    await page.getByRole('tab', { name: 'Upload' }).click();
    await page.locator('input[type="file"][multiple]').setInputFiles([
      { name: 'first.txt', mimeType: 'text/plain', buffer: Buffer.from('first brief') },
      { name: 'second.txt', mimeType: 'text/plain', buffer: Buffer.from('second brief') },
    ]);

    await expect(page.getByText('first.txt').isVisible()).resolves.toBe(true);
    await expect(page.getByText('2 of 5 documents · 45 characters').isVisible()).resolves.toBe(true);
    expect(await page.getByRole('button', { name: 'Run Analysis' }).isEnabled()).toBe(true);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'artifact-text-two-documents.png'), fullPage: true });

    await page.getByRole('button', { name: 'Remove second.txt' }).click();
    await expect(page.getByText('second.txt').count()).resolves.toBe(0);
    await expect(page.getByText('1 of 5 documents · 11 characters').isVisible()).resolves.toBe(true);
    await page.close();
  });

  it('rejects a legacy .doc with export instructions in the real browser', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await seedPersonaStore(page);
    await page.goto(`${BASE_URL}/dashboard/analyses?new=1`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    await page.getByRole('tab', { name: 'Upload' }).click();
    await page.locator('input[type="file"][multiple]').setInputFiles([
      { name: 'old-brief.doc', mimeType: 'application/msword', buffer: Buffer.from('legacy') },
    ]);

    await expect(page.getByText(/Export it to PDF or DOCX first/).isVisible()).resolves.toBe(true);
    await page.close();
  });

  it('shows a Source card instead of the screenshot on a text run', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await seedAnalysisStore(page);
    await page.goto(`${BASE_URL}/dashboard/analyses/${TEXT_SIM_ID}`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    await expect(page.getByText('Source', { exact: true }).isVisible()).resolves.toBe(true);
    await expect(page.getByText(TEXT_LABEL).first().isVisible()).resolves.toBe(true);
    await expect(page.getByText('Read the analyzed text').isVisible()).resolves.toBe(true);
    expect(await page.getByText('Waiting for the first capture…').count()).toBe(0);

    await page.getByText('Read the analyzed text').click();
    await expect(page.getByText(TEXT_BODY).isVisible()).resolves.toBe(true);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'artifact-text-source-card.png'), fullPage: true });
    await page.close();
  });

  it('shows the document label on the dashboard card, not a URL', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await seedAnalysisStore(page);
    await page.goto(`${BASE_URL}/dashboard/analyses`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    await expect(page.getByText(TEXT_LABEL).first().isVisible()).resolves.toBe(true);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'artifact-text-dashboard-card.png'), fullPage: true });
    await page.close();
  });
});
