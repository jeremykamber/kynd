// Real-browser drive for the completed analysis report.
// Launches the app, seeds a completed analysis in IndexedDB, drives the report
// page, and saves a full-page screenshot plus a video under .ai/threads.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { findOrStartServer } from '../test/helpers/server';
import type { StageJourney } from '@/domain/entities/StageJourney';

const ANALYSIS_ID = 'verify-app-run';
const ANALYSIS_NAME = 'Pricing page - example.com';
const STAGES = ['interpretation', 'understanding', 'belief', 'motivation', 'action'] as const;
const OUT_DIR = path.resolve(process.cwd(), '.ai', 'threads', 'verify-app');
const VIDEO_DIR = path.join(OUT_DIR, 'video');
const SHOT_TOP = path.join(OUT_DIR, 'after-top.png');
const SHOT_JOURNEY = path.join(OUT_DIR, 'after-journey.png');
const VIDEO = path.join(OUT_DIR, 'after-desktop.webm');

function stage(
  name: StageJourney['stage'],
  description: string,
  outcome: StageJourney['outcome'],
  sentiment: StageJourney['sentiment'] = 'neutral',
): StageJourney {
  return { stage: name, description, sentiment, outcome };
}

function fullJourney(): StageJourney[] {
  return STAGES.map((name, index) =>
    stage(name, `Stage ${index + 1} (${name}): what this persona experienced.`, 'succeeded'),
  );
}

function sparseJourney(): StageJourney[] {
  return [
    stage('interpretation', 'The page names a clear problem.', 'succeeded'),
    stage('understanding', 'Could not find SSO pricing.', 'blocked', 'negative'),
  ];
}

function response(id: string, name: string, occupation: string, journey: StageJourney[]) {
  return {
    id,
    screenshotBase64: 'data:image/png;base64,AAAA',
    rawAnalysis: `Raw cognitive stream for ${name}.`,
    overview: `${name} found the page clear but hesitated on price transparency.`,
    customerJourney: journey,
    researchQuestionAnswer: `${name} would continue but wants pricing upfront.`,
    majorFindings: [
      {
        observation: 'Pricing was unclear',
        evidence: `${name} paused at the pricing section.`,
        impact: 'Reduced trust in the offer.',
      },
    ],
    pointsOfFriction: ['Pricing is unclear'],
    unansweredQuestions: ['What does it cost per seat?'],
    personaProfile: {
      name,
      occupation,
      bigFive: {
        conscientiousness: 80,
        neuroticism: 30,
        openness: 70,
        extraversion: 50,
        agreeableness: 60,
      },
      values: ['Transparency', 'Efficiency'],
      fears: ['Hidden costs'],
      communicationStyle: 'direct',
      decisionStyle: 'data-driven',
    },
  };
}

function persistedState() {
  return JSON.stringify({
    state: {
      analyses: [
        {
          id: ANALYSIS_ID,
          name: ANALYSIS_NAME,
          url: 'https://example.com/pricing',
          status: 'COMPLETED',
          personaCount: 2,
          personaNames: ['Sarah Chen', 'Marcus Lee'],
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          completedResponses: 2,
          totalResponses: 2,
          responses: [
            response('r-1', 'Sarah Chen', 'Senior Engineer', fullJourney()),
            response('r-2', 'Marcus Lee', 'Product Manager', sparseJourney()),
          ],
          synthesis: {
            overview: 'The page persuades, but pricing opacity holds personas back from action.',
            researchQuestionAnswer: 'The page persuades, but pricing opacity holds personas back from action.',
            topFindings: [
              {
                observation: 'Pricing opacity blocks action',
                evidence: 'Both personas asked about cost before deciding.',
                impact: 'Users stop short of conversion.',
                confidence: 'strongly supported',
                affectedPersonaCount: 2,
                totalPersonaCount: 2,
              },
            ],
            disagreements: [
              {
                topic: 'Would they return?',
                split: [
                  { view: 'Yes', personaCount: 1 },
                  { view: 'Only if prices are listed', personaCount: 1 },
                ],
                significance: 'Medium',
              },
            ],
            biggestFrictions: ['Pricing is hidden behind a demo request.'],
            completedCount: 2,
            failedCount: 0,
            totalPersonaCount: 2,
          },
        },
      ],
      dismissedAnalysisIds: [],
    },
    version: 3,
  });
}

async function seed(page: Page) {
  await page.addInitScript((seedValue) => {
    const { promise, resolve } = Promise.withResolvers<void>();
    const req = indexedDB.open('keyval-store');
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('keyval')) {
        req.result.createObjectStore('keyval');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('keyval', 'readwrite');
      tx.objectStore('keyval').put(seedValue, 'analysis-storage');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    };
    req.onerror = () => resolve();
    return promise;
  }, persistedState());
}

async function main() {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });

  const server = await findOrStartServer({ preferredPort: 3214 });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 900 } },
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => {
    if (!err.message.includes('Hydration failed')) pageErrors.push(err.message);
  });

  try {
    await seed(page);
    await page.goto(`${server.url}/dashboard/analyses/${ANALYSIS_ID}`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });

    await page.getByText('2 of 2 personas completed').waitFor({ state: 'visible' });
    assert.equal(await page.getByText('The answer', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Ask the whole audience', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Individual persona reports', { exact: true }).count(), 1);
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: SHOT_TOP });

    await page.getByText('Top findings').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.getByText('Individual persona reports').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    await page.locator('button:has-text("Marcus Lee")').first().click();
    await page.getByText('Blocked at understanding', { exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.getByText('Not reached', { exact: true }).count(), 3);
    await page.getByText('Could not find SSO pricing.', { exact: true }).waitFor({ state: 'visible' });
    await page.waitForTimeout(1400);
    await page.getByText('Not reached', { exact: true }).last().scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join('; ')}`);
    await page.getByText('Blocked at understanding', { exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: SHOT_JOURNEY });
    console.log(`PASS report page: ${ANALYSIS_NAME}`);
    console.log(`PASS sparse journey: Blocked at understanding, 3 Not reached rows`);
    console.log(`SHOT ${SHOT_TOP}`);
    console.log(`SHOT ${SHOT_JOURNEY}`);
  } finally {
    const video = page.video();
    await context.close();
    const recorded = await video?.path();
    if (recorded) fs.copyFileSync(recorded, VIDEO);
    await browser.close();
    if (server.process) server.process.kill('SIGTERM');
    console.log(`VIDEO ${VIDEO}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
