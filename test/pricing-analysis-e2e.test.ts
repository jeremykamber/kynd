// @vitest-environment node

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

const PORTS_TO_TRY = [3000, 3001, 3100, 3207];
const SCREENSHOT_DIR = path.resolve(process.cwd(), '.sisyphus', 'evidence');
const SERVER_TIMEOUT = 120_000;
const TEST_TIMEOUT = 60_000;

let BASE_URL = '';

async function findOrStartServer(): Promise<{
  url: string;
  process: ChildProcess | null;
}> {
  // Try common dev ports first
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

  // No existing server — start one on the last port in the list
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

function buildStorageData(
  id: string,
  name: string,
  analyses: readonly any[],
) {
  return {
    state: {
      simulations: [
        {
          id,
          name,
          url: 'https://example.com/pricing',
          status: 'COMPLETED',
          personaCount: analyses.length,
          createdAt: new Date(Date.now() - 3_600_000).toISOString(),
          completedAt: new Date().toISOString(),
          analyses,
        },
      ],
    },
    version: 0,
  };
}

describe('Pricing Analysis E2E', () => {
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

  it('should render completed analysis with real persona names, identity card, executive summary, and structured thoughts', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    const storageData = buildStorageData(
      'test-sim-e2e',
      'Pricing Analysis — example.com',
      mockAnalyses,
    );
    await page.addInitScript((data: string) => {
      localStorage.setItem('simulation-storage', data);
    }, JSON.stringify(storageData));

    await page.goto(`${BASE_URL}/dashboard/simulations/test-sim-e2e`, {
      waitUntil: 'networkidle',
    });

    await page.waitForSelector('h1');
    await page.waitForSelector('text=Average Scores');

    const bodyText = await page.textContent('body');

    expect(bodyText).toContain('Casey');
    expect(bodyText).toContain('Riley');
    expect(bodyText).toContain('Elliot');
    expect(bodyText).not.toContain('Persona 4');

    expect(bodyText).toContain('Lead PM');
    expect(bodyText).toContain('VP Eng');
    expect(bodyText).toContain('Developer');

    expect(bodyText).toContain('Average Scores');
    expect(bodyText).toContain('Clarity');
    expect(bodyText).toContain('Trust');
    expect(bodyText).toContain('Buy Intent');

    expect(bodyText).toContain('The Good');
    expect(bodyText).toContain('The Bad');
    expect(bodyText).toContain('The Dealbreaker');

    expect(bodyText).toContain('vs Run Avg');

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'pricing-analysis-e2e-full.png'),
      fullPage: true,
    });

    await page.close();
  }, TEST_TIMEOUT);

  it('should emit [TRACE] console logs for Benchmark and Divergence', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    const consoleMessages: string[] = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    const storageData = buildStorageData(
      'trace-sim-e2e',
      'Trace Test',
      mockAnalyses,
    );
    await page.addInitScript((data: string) => {
      localStorage.setItem('simulation-storage', data);
    }, JSON.stringify(storageData));

    await page.goto(`${BASE_URL}/dashboard/simulations/trace-sim-e2e`, {
      waitUntil: 'networkidle',
    });

    await page.waitForSelector('text=Average Scores');
    await page.waitForTimeout(500);

    const traceMessages = consoleMessages.filter((m) => m.includes('[TRACE]'));

    const benchmarkLines = traceMessages.filter((m) =>
      m.includes('[Benchmark]'),
    );
    expect(benchmarkLines.length).toBeGreaterThanOrEqual(3);
    expect(benchmarkLines[0]).toContain('analysis=');

    const divergenceLines = traceMessages.filter((m) =>
      m.includes('[Divergence]'),
    );
    expect(divergenceLines.length).toBeGreaterThanOrEqual(1);
    expect(divergenceLines[0]).toContain('analyses=');
    expect(divergenceLines[0]).toContain('unique_primary_frictions');

    expect(traceMessages.length).toBeGreaterThanOrEqual(10);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'pricing-analysis-e2e-traces.png'),
      fullPage: true,
    });

    await page.close();
  }, TEST_TIMEOUT);

  it('should handle IN_PROGRESS to COMPLETED transition without rendering errors (stack overflow regression)', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    // Track page errors (catches "Maximum call stack size exceeded" etc.)
    // Filter out hydration mismatches — expected with localStorage-dependent SSR
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!err.message.includes('Hydration failed')) {
        pageErrors.push(err.message);
      }
    });

    // Build storage data manually
    const simId = 'transition-sim-e2e';
    const inProgressSim = {
      id: simId,
      name: 'Transition Test',
      url: 'https://example.com',
      status: 'IN_PROGRESS',
      personaCount: mockAnalyses.length,
      totalAnalyses: mockAnalyses.length,
      completedAnalyses: 0,
      currentStep: 'THINKING',
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    };
    const inProgressStorage = { state: { simulations: [inProgressSim] }, version: 0 };

    // Navigate to base URL first to establish the app context
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Seed IN_PROGRESS into localStorage (no addInitScript — avoids overwrite on reload)
    await page.evaluate((data: string) => {
      localStorage.setItem('simulation-storage', data);
    }, JSON.stringify(inProgressStorage));

    // Navigate to simulation — Zustand rehydrates from localStorage
    await page.goto(`${BASE_URL}/dashboard/simulations/${simId}`, {
      waitUntil: 'networkidle',
    });

    // Verify InProgressView rendered
    const inProgressText = await page.textContent('body');
    expect(inProgressText).toContain('Gathering feedback');

    // Simulate rapid progress updates + completion via localStorage
    await page.evaluate((mockData: string) => {
      const analyses = JSON.parse(mockData);
      const raw = localStorage.getItem('simulation-storage');
      if (!raw) throw new Error('No store found');
      const store = JSON.parse(raw);

      // Rapid progress updates (simulating streaming)
      for (let i = 1; i <= analyses.length; i++) {
        store.state.simulations = store.state.simulations.map((s: any) =>
          s.id === 'transition-sim-e2e'
            ? { ...s, completedAnalyses: i }
            : s
        );
      }

      // Mark complete with analyses
      store.state.simulations = store.state.simulations.map((s: any) =>
        s.id === 'transition-sim-e2e'
          ? {
              ...s,
              status: 'COMPLETED',
              completedAnalyses: analyses.length,
              completedAt: new Date().toISOString(),
              analyses,
            }
          : s
      );

      localStorage.setItem('simulation-storage', JSON.stringify(store));
    }, JSON.stringify(mockAnalyses));

    // Reload — Zustand rehydrates from updated localStorage, now COMPLETED
    await page.reload({ waitUntil: 'networkidle' });

    // Wait for CompletedView to render
    await page.waitForSelector('text=Average Scores', { timeout: 5000 });
    await page.waitForTimeout(500);

    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('Average Scores');
    expect(bodyText).toContain('The Good');
    expect(bodyText).toContain('The Bad');
    expect(bodyText).toContain('The Dealbreaker');

    // Critical: verify NO rendering errors (stack overflow would appear here)
    if (pageErrors.length > 0) {
      console.log('[E2E] Page errors detected:', JSON.stringify(pageErrors, null, 2));
    }
    expect(pageErrors).toHaveLength(0);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'pricing-analysis-e2e-transition.png'),
      fullPage: true,
    });

    await page.close();
  }, TEST_TIMEOUT);

  it('should handle old data without personaProfile gracefully', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    const legacyAnalyses = mockAnalyses.map((a, i) => {
      const { personaProfile: _, ...rest } = a;
      return {
        ...rest,
        id: `p${i + 1}-${Date.now()}`,
      };
    });

    const legacyStorageData = buildStorageData(
      'legacy-sim-e2e',
      'Legacy Analysis',
      legacyAnalyses,
    );

    await page.addInitScript((data: string) => {
      localStorage.setItem('simulation-storage', data);
    }, JSON.stringify(legacyStorageData));

    await page.goto(`${BASE_URL}/dashboard/simulations/legacy-sim-e2e`, {
      waitUntil: 'networkidle',
    });

    const bodyText = await page.textContent('body');

    expect(bodyText).toContain('Persona 1');
    expect(bodyText).toContain('Persona 2');
    expect(bodyText).toContain('Persona 3');
    expect(bodyText).not.toContain('Casey');

    expect(bodyText).toContain('Legacy data');

    // Verify persona names appear in the persona cards
    expect(bodyText).toContain('Persona 1');
    expect(bodyText).toContain('Persona 2');
    expect(bodyText).toContain('Persona 3');

    expect(bodyText).not.toContain('Application error');
    expect(bodyText).not.toContain('Something went wrong');

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'pricing-analysis-e2e-legacy.png'),
      fullPage: true,
    });

    await page.close();
  }, TEST_TIMEOUT);
});
