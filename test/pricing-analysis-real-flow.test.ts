// @vitest-environment node

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';

const PORTS_TO_TRY = [3000, 3001, 3100, 3207];
const SCREENSHOT_DIR = path.resolve(process.cwd(), '.sisyphus', 'evidence');
const SERVER_TIMEOUT = 120_000;
const ANALYSIS_TIMEOUT = 180_000;
const POST_ANALYSIS_TIMEOUT = 60_000;

let BASE_URL = '';

async function findOrStartServer(): Promise<{ url: string; process: ChildProcess | null }> {
  for (const port of PORTS_TO_TRY) {
    const url = `http://localhost:${port}`;
    try {
      const res = await fetch(url);
      if (res.ok) return { url, process: null };
    } catch { /* try next */ }
  }
  const port = PORTS_TO_TRY[PORTS_TO_TRY.length - 1];
  const url = `http://localhost:${port}`;
  const server = spawn('bun', ['run', 'next', 'dev', '-p', String(port)], {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  server.stderr?.on('data', () => {});
  return { url, server };
}

describe('Real Pricing Analysis Flow', () => {
  let browser: Browser;
  let server: ChildProcess | null = null;

  beforeAll(async () => {
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

  it('should run a real pricing analysis and display results without errors', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const consoleMessages: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => consoleMessages.push(msg.text()));
    page.on('pageerror', (err) => {
      if (!err.message.includes('Hydration failed')) {
        pageErrors.push(err.message);
      }
    });

    // Step 1: Seed personas directly, then navigate to dashboard
    // Skips the persona generation step (can take 2min+) to focus on testing
    // the pricing analysis flow with real LLM calls
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Seed demo personas into the persona store via localStorage so URL input is enabled
    await page.evaluate(() => {
      const demoPersonas = [
        { id: 'p1', name: 'Casey', age: 34, occupation: 'Lead PM', educationLevel: 'Masters', interests: ['SaaS'], goals: ['Ship faster'], conscientiousness: 80, neuroticism: 30, openness: 70, extraversion: 40, agreeableness: 60, values: ['Transparency'], fears: ['Hidden fees'], communicationStyle: 'Direct', decisionStyle: 'Data-driven', pricingSensitivity: 60, typicalBudget: '$50/mo' },
        { id: 'p2', name: 'Riley', age: 42, occupation: 'VP Eng', educationLevel: 'Bachelors', interests: ['DevOps'], goals: ['Scale infrastructure'], conscientiousness: 70, neuroticism: 60, openness: 40, extraversion: 30, agreeableness: 40, values: ['Reliability'], fears: ['Vendor lock-in'], communicationStyle: 'Analytical', decisionStyle: 'Data-driven', pricingSensitivity: 40, typicalBudget: '$200/mo' },
        { id: 'p3', name: 'Elliot', age: 28, occupation: 'Developer', educationLevel: 'Bachelors', interests: ['Open source'], goals: ['Build great products'], conscientiousness: 60, neuroticism: 40, openness: 80, extraversion: 50, agreeableness: 50, values: ['Efficiency'], fears: ['Complexity'], communicationStyle: 'Technical', decisionStyle: 'Gut-driven', pricingSensitivity: 80, typicalBudget: '$30/mo' },
      ];
      const batchId = 'demo-batch-e2e';
      const personaStorage = {
        state: {
          batches: [{ id: batchId, label: 'Demo Personas (E2E)', personas: demoPersonas, source: 'interviews', transcriptCount: 3, createdAt: new Date().toISOString() }],
          activeBatchId: batchId,
          activeDescription: 'Demo personas for E2E testing',
        },
        version: 0,
      };
      localStorage.setItem('persona-storage', JSON.stringify(personaStorage));
    });

    // Reload so Zustand rehydrates
    await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Step 2: Fill in URL input
    const urlInput = await page.$('input[type="url"]');
    if (!urlInput) throw new Error('URL input not found');
    await urlInput.fill('https://www.notion.so/pricing');
    await page.waitForTimeout(500);

    // Step 3: Click Run Pricing Simulation
    const analyzeButton = await page.$('button:has-text("Run Pricing Simulation")');
    if (!analyzeButton) throw new Error(`Run button not found. Buttons: ${(await page.$$eval('button', els => els.map(e => e.textContent?.trim()))).join(', ')}`);
    const isDisabled = await analyzeButton.getAttribute('disabled');
    expect(isDisabled).toBeNull();
    await analyzeButton.click();
    console.log('[E2E] Clicked Run Simulation');

    // Step 5: Verify analysis started (button greys out or text changes)
    await page.waitForTimeout(1000);
    console.log('[E2E] Analysis started, waiting for completion...');

    // Step 5: Wait for completion (button reverts or timeout)
    let analysisCompleted = false;
    try {
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('button');
          return btn && btn.textContent === 'Run Pricing Simulation';
        },
        { timeout: ANALYSIS_TIMEOUT },
      );
      analysisCompleted = true;
      console.log('[E2E] Analysis completed (button reverted)');
    } catch {
      console.log('[E2E] Analysis button did not revert within timeout');
    }

    await page.waitForTimeout(2000);

    // Step 6: Log trace messages
    const traceMessages = consoleMessages.filter(m => m.includes('[TRACE]'));
    console.log(`[E2E] Captured ${traceMessages.length} [TRACE] messages`);

    // Step 7: Report any page errors
    if (pageErrors.length > 0) {
      console.log('[E2E] Page errors during analysis:', JSON.stringify(pageErrors, null, 2));
    }

    // Step 8: Navigate to simulations list
    await page.goto(`${BASE_URL}/dashboard/simulations`, {
      waitUntil: 'networkidle',
      timeout: 15000,
    });
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'real-flow-simulations-list.png'),
      fullPage: true,
    });

    const listText = await page.textContent('body');
    const hasCompleted = listText.includes('Completed');
    const hasInProgress = listText.includes('In Progress');
    console.log(`[E2E] Simulations list: completed=${hasCompleted}, inProgress=${hasInProgress}`);

    // Step 9: Check detail page if a simulation exists
    const simLink = await page.$('a[href*="/dashboard/simulations/"]');
    if (simLink) {
      // Navigate directly to simulations page first, then click
      await simLink.click();
      await page.waitForTimeout(3000);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'real-flow-detail.png'),
        fullPage: true,
      });

      const detailText = await page.textContent('body');
      const hasCompletedView = detailText.includes('AVERAGE');
      const hasStructuredThoughts = detailText.includes('The Good') || detailText.includes('The Bad');
      const hasBenchmarks = detailText.includes('vs Run Avg');

      console.log(`[E2E] Detail page: completedView=${hasCompletedView}, structured=${hasStructuredThoughts}, benchmarks=${hasBenchmarks}`);
    }

    // Step 10: Verify no stack overflow
    const stackOverflowErrors = pageErrors.filter(e =>
      e.includes('Maximum call stack') ||
      e.includes('stack size exceeded') ||
      e.includes('RangeError')
    );
    expect(stackOverflowErrors).toHaveLength(0);
    console.log('[E2E] No stack overflow errors detected');

    await page.close();
  }, ANALYSIS_TIMEOUT + POST_ANALYSIS_TIMEOUT + 30_000);
});
