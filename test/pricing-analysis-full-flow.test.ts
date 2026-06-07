// @vitest-environment node

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

const PORTS_TO_TRY = [3000, 3001, 3100, 3207];
const SCREENSHOT_DIR = path.resolve(process.cwd(), '.sisyphus', 'evidence');
const SERVER_TIMEOUT = 120_000;
const TEST_TIMEOUT = 120_000;

let BASE_URL = '';

async function findOrStartServer(): Promise<{
  url: string;
  process: ChildProcess | null;
}> {
  for (const port of PORTS_TO_TRY) {
    const url = `http://localhost:${port}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        return { url, process: null };
      }
    } catch {
      // port not in use
    }
  }

  const port = PORTS_TO_TRY[PORTS_TO_TRY.length - 1];
  const url = `http://localhost:${port}`;
  const server = spawn('bun', ['run', 'next', 'dev', '-p', String(port)], {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  const serverOut: string[] = [];
  server.stdout?.on('data', (d: Buffer) => serverOut.push(d.toString()));
  server.stderr?.on('data', (d: Buffer) => serverOut.push(d.toString()));

  server.on('error', (err) => {
    console.error(`[E2E] Server process error:`, err.message);
  });

  server.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.warn(
        `[E2E] Server exited with code ${code}. Output:\n${serverOut.slice(-10).join('')}`,
      );
    }
  });

  const start = Date.now();
  let lastError: string | null = null;
  while (Date.now() - start < SERVER_TIMEOUT) {
    try {
      const res = await fetch(url);
      if (res.ok) return { url, process: server };
      lastError = `status ${res.status}`;
    } catch (err) {
      lastError = (err as Error).message;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(
    `Server at ${url} not ready within ${SERVER_TIMEOUT}ms. Last error: ${lastError}`,
  );
}

async function ensureScreenshotDir(): Promise<void> {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

const mockAnalyses = [
  {
    id: 'Casey-1712345678900',
    url: 'https://example.com/pricing',
    screenshotBase64: '',
    thoughts:
      '[The Good] The pricing page is very clear and easy to understand.\n[The Bad] The lack of a free tier is concerning.\n[The Dealbreaker] No annual discount option.',
    scores: {
      clarity: 8,
      clarityReason: 'Clear layout',
      valuePerception: 7,
      valuePerceptionReason: 'Good value',
      trust: 6,
      trustReason: 'OK',
      explorationIntent: 5,
      explorationIntentReason: 'Maybe',
      analysisIntent: 4,
      analysisIntentReason: 'Hmm',
      buyIntent: 3,
      buyIntentReason: 'Not sure',
    },
    risks: ['Too expensive', 'No trial', 'Limited features'],
    recommendations: ['Add free tier', 'Improve docs'],
    aiSuggestion: 'Add a free tier to capture more leads',
    personaProfile: {
      name: 'Casey',
      occupation: 'Lead PM',
      bigFive: {
        conscientiousness: 80,
        neuroticism: 30,
        openness: 70,
        extraversion: 40,
        agreeableness: 60,
      },
      values: ['Transparency'],
      fears: ['Hidden fees'],
      communicationStyle: 'Direct',
      pricingSensitivity: 6,
      typicalBudget: '$50/mo',
    },
  },
  {
    id: 'Riley-1712345678901',
    url: 'https://example.com/pricing',
    screenshotBase64: '',
    thoughts:
      '[The Good] API access is well documented.\n[The Bad] Enterprise pricing is opaque.\n[The Dealbreaker] No clear migration path from competitors.',
    scores: {
      clarity: 6,
      clarityReason: 'Could be clearer',
      valuePerception: 5,
      valuePerceptionReason: 'Average',
      trust: 4,
      trustReason: 'Skeptical',
      explorationIntent: 3,
      explorationIntentReason: 'Low',
      analysisIntent: 2,
      analysisIntentReason: 'Minimal',
      buyIntent: 1,
      buyIntentReason: "Won't buy",
    },
    risks: ['Enterprise pricing opaque', 'Lock-in concerns', 'Poor docs'],
    recommendations: ['Publish enterprise pricing', 'Improve docs'],
    aiSuggestion: 'Be transparent about enterprise pricing',
    personaProfile: {
      name: 'Riley',
      occupation: 'VP Eng',
      bigFive: {
        conscientiousness: 70,
        neuroticism: 60,
        openness: 40,
        extraversion: 30,
        agreeableness: 40,
      },
      values: ['Reliability'],
      fears: ['Vendor lock-in'],
      communicationStyle: 'Analytical',
      pricingSensitivity: 4,
      typicalBudget: '$200/mo',
    },
  },
  {
    id: 'Elliot-1712345678902',
    url: 'https://example.com/pricing',
    screenshotBase64: '',
    thoughts:
      '[The Good] The feature set is comprehensive.\n[The Bad] Onboarding process seems complex.\n[The Dealbreaker] No self-serve option for small teams.',
    scores: {
      clarity: 9,
      clarityReason: 'Very clear',
      valuePerception: 8,
      valuePerceptionReason: 'Excellent',
      trust: 7,
      trustReason: 'Trustworthy',
      explorationIntent: 6,
      explorationIntentReason: 'Interested',
      analysisIntent: 5,
      analysisIntentReason: 'Considering',
      buyIntent: 4,
      buyIntentReason: 'Will evaluate',
    },
    risks: ['Complex onboarding', 'Limited integrations', 'Support response time'],
    recommendations: ['Simplify onboarding', 'More integrations'],
    aiSuggestion: 'Streamline the onboarding flow',
    personaProfile: {
      name: 'Elliot',
      occupation: 'Developer',
      bigFive: {
        conscientiousness: 60,
        neuroticism: 40,
        openness: 80,
        extraversion: 50,
        agreeableness: 50,
      },
      values: ['Efficiency'],
      fears: ['Complexity'],
      communicationStyle: 'Technical',
      pricingSensitivity: 8,
      typicalBudget: '$30/mo',
    },
  },
];

describe('Full Flow E2E — Dashboard → Analysis → Results', () => {
  let browser: Browser;
  let server: ChildProcess | null = null;

  beforeAll(async () => {
    await ensureScreenshotDir();

    const result = await findOrStartServer();
    BASE_URL = result.url;
    server = result.process;

    browser = await chromium.launch({ headless: true });
  }, SERVER_TIMEOUT + 30_000);

  afterAll(async () => {
    await browser?.close();
    if (server) {
      server.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 1000));
    }
  });

  it('should complete full flow: dashboard → URL entry → InProgress → Completed → simulations list → detail', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    const consoleMessages: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      consoleMessages.push(msg.text());
      if (msg.type() === 'error') pageErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      if (!err.message.includes('Hydration failed')) {
        pageErrors.push(err.message);
      }
    });

    try {
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);

      const dashboardText = await page.textContent('body');
      expect(dashboardText).toBeTruthy();

      const urlInput = page.locator(
        'input[type="url"], input[placeholder*="url" i], input[placeholder*="URL" i]',
      );
      const urlInputCount = await urlInput.count();
      if (urlInputCount > 0) {
        await urlInput.fill('https://example.com/pricing');
      }

      const simId = `full-flow-sim-${Date.now()}`;

      await page.evaluate(
        ({ id, analyses }) => {
          const inProgressSim = {
            id,
            name: 'Pricing Analysis — example.com',
            url: 'https://example.com/pricing',
            status: 'IN_PROGRESS' as const,
            personaCount: analyses.length,
            totalAnalyses: analyses.length,
            completedAnalyses: 0,
            currentStep: 'STARTING',
            createdAt: new Date(Date.now() - 60_000).toISOString(),
          };
          const storage = {
            state: { simulations: [inProgressSim] },
            version: 0,
          };
          localStorage.setItem('simulation-storage', JSON.stringify(storage));
        },
        { id: simId, analyses: mockAnalyses },
      );

      await page.goto(`${BASE_URL}/dashboard/simulations/${simId}`, {
        waitUntil: 'networkidle',
      });
      await page.waitForTimeout(1000);

      let bodyText = await page.textContent('body');
      const showsInProgress =
        bodyText.includes('Initializing') || bodyText.includes('Gathering feedback');
      expect(showsInProgress).toBe(true);

      await page.evaluate(
        ({ id, count }) => {
          const raw = localStorage.getItem('simulation-storage');
          if (!raw) throw new Error('no store');
          const store = JSON.parse(raw);

          for (let i = 1; i <= count; i++) {
            store.state.simulations = store.state.simulations.map((s: any) =>
              s.id === id
                ? { ...s, completedAnalyses: i, currentStep: 'THINKING' }
                : s,
            );
          }

          localStorage.setItem('simulation-storage', JSON.stringify(store));
        },
        { id: simId, count: mockAnalyses.length },
      );

      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      bodyText = await page.textContent('body');
      expect(bodyText).toContain('Gathering feedback');
      expect(bodyText).toContain('3/3');

      await page.evaluate(
        ({ id, analyses }) => {
          const raw = localStorage.getItem('simulation-storage');
          if (!raw) throw new Error('no store');
          const store = JSON.parse(raw);

          store.state.simulations = store.state.simulations.map((s: any) =>
            s.id === id
              ? {
                  ...s,
                  status: 'COMPLETED' as const,
                  completedAnalyses: analyses.length,
                  completedAt: new Date().toISOString(),
                  analyses,
                }
              : s,
          );

          localStorage.setItem('simulation-storage', JSON.stringify(store));
        },
        { id: simId, analyses: mockAnalyses },
      );

      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('text=Average Scores', { timeout: 5000 });
      await page.waitForTimeout(1000);

      bodyText = await page.textContent('body');

      expect(bodyText).toContain('Average Scores');
      expect(bodyText).toContain('Clarity');
      expect(bodyText).toContain('Trust');
      expect(bodyText).toContain('Buy Intent');

      expect(bodyText).toContain('Casey');
      expect(bodyText).toContain('Riley');
      expect(bodyText).toContain('Elliot');

      expect(bodyText).toContain('Lead PM');
      expect(bodyText).toContain('VP Eng');
      expect(bodyText).toContain('Developer');

      expect(bodyText).toContain('Transparency');

      expect(bodyText).toContain('Average Scores');

      expect(bodyText).toContain('The Good');
      expect(bodyText).toContain('The Bad');
      expect(bodyText).toContain('The Dealbreaker');

      expect(bodyText).toContain('vs Run Avg');

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'pricing-analysis-full-flow-completed.png'),
        fullPage: true,
      });

      const traceMessages = consoleMessages.filter((m) => m.includes('[TRACE]'));

      const benchmarkLines = traceMessages.filter((m) => m.includes('[Benchmark]'));
      expect(benchmarkLines.length).toBeGreaterThanOrEqual(3);
      expect(benchmarkLines[0]).toContain('analysis=');

      const divergenceLines = traceMessages.filter((m) => m.includes('[Divergence]'));
      expect(divergenceLines.length).toBeGreaterThanOrEqual(1);
      expect(divergenceLines[0]).toContain('analyses=');
      expect(divergenceLines[0]).toContain('unique_primary_frictions');

      expect(traceMessages.length).toBeGreaterThanOrEqual(10);

      await page.goto(`${BASE_URL}/dashboard/simulations`, {
        waitUntil: 'networkidle',
      });
      await page.waitForTimeout(1000);

      bodyText = await page.textContent('body');
      expect(bodyText).toContain('Simulations');
      expect(bodyText).toContain('Pricing Analysis');

      expect(bodyText).toContain('Clarity');
      expect(bodyText).toContain('Trust');
      expect(bodyText).toContain('Buy');

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'pricing-analysis-full-flow-list.png'),
        fullPage: true,
      });

      const simLink = page.locator('text=Pricing Analysis').first();
      await simLink.click();
      await page.waitForTimeout(2000);

      bodyText = await page.textContent('body');
      expect(bodyText).toContain('Average Scores');
      expect(bodyText).toContain('The Good');
      expect(bodyText).toContain('Pricing Analysis');

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'pricing-analysis-full-flow-detail-click.png'),
        fullPage: true,
      });

      if (pageErrors.length > 0) {
        console.log(
          '[E2E] Page errors detected:',
          JSON.stringify(pageErrors, null, 2),
        );
      }
      expect(pageErrors).toHaveLength(0);
    } finally {
      await page.close();
    }
  }, TEST_TIMEOUT);
});
