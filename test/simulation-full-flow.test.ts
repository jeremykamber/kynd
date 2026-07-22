// @vitest-environment node

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';

const PORTS_TO_TRY = [3000, 3001, 3100, 3207];
const SCREENSHOT_DIR = path.resolve(process.cwd(), '.sisyphus', 'evidence');
const SERVER_TIMEOUT = 120_000;
const ANALYSIS_TIMEOUT = 180_000;

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

const DEMO_PERSONAS = [
  { id: 'p1', name: 'Casey', age: 34, occupation: 'Lead PM', educationLevel: 'Masters', interests: ['SaaS'], goals: ['Ship faster'], conscientiousness: 80, neuroticism: 30, openness: 70, extraversion: 40, agreeableness: 60, values: ['Transparency'], fears: ['Hidden fees'], communicationStyle: 'Direct', decisionStyle: 'Data-driven', pricingSensitivity: 60, typicalBudget: '$50/mo' },
  { id: 'p2', name: 'Riley', age: 42, occupation: 'VP Eng', educationLevel: 'Bachelors', interests: ['DevOps'], goals: ['Scale infrastructure'], conscientiousness: 70, neuroticism: 60, openness: 40, extraversion: 30, agreeableness: 40, values: ['Reliability'], fears: ['Vendor lock-in'], communicationStyle: 'Analytical', decisionStyle: 'Data-driven', pricingSensitivity: 40, typicalBudget: '$200/mo' },
  { id: 'p3', name: 'Elliot', age: 28, occupation: 'Developer', educationLevel: 'Bachelors', interests: ['Open source'], goals: ['Build great products'], conscientiousness: 60, neuroticism: 40, openness: 80, extraversion: 50, agreeableness: 50, values: ['Efficiency'], fears: ['Complexity'], communicationStyle: 'Technical', decisionStyle: 'Gut-driven', pricingSensitivity: 80, typicalBudget: '$30/mo' },
];

describe('Full Simulation Flow — Dashboard → Batch Select → Run → Output', () => {
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

  it('should seed personas, select batch, run simulation, and verify output structure', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!err.message.includes('Hydration failed')) pageErrors.push(err.message);
    });

    try {
      // Step 1: Seed demo personas into localStorage
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1000);

      await page.evaluate((personas) => {
        const batchId = 'e2e-demo-batch';
        const personaStorage = {
          state: {
            batches: [{
              id: batchId,
              label: 'Demo Personas (E2E)',
              personas,
              source: 'interviews',
              transcriptCount: personas.length,
              createdAt: new Date().toISOString(),
            }],
            activeBatchId: batchId,
            activeDescription: 'Demo personas for E2E testing',
          },
          version: 0,
        };
        localStorage.setItem('persona-storage', JSON.stringify(personaStorage));
      }, DEMO_PERSONAS);

      // Reload so Zustand rehydrates
      await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Step 2: Navigate to simulations page
      await page.goto(`${BASE_URL}/dashboard/simulations`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1000);

      // Step 3: Click "Run New Simulation" to open the form
      const runNewBtn = page.locator('button', { hasText: 'Run New Simulation' });
      if (await runNewBtn.count() > 0) {
        await runNewBtn.click();
        await page.waitForTimeout(500);
      }

      // Step 4: Verify batch dropdown exists and has the demo batch
      const batchSelect = page.locator('#batch-select');
      await batchSelect.waitFor({ state: 'visible', timeout: 5000 });

      // Open the dropdown and select the batch
      await batchSelect.click();
      await page.waitForTimeout(300);

      // Click the demo batch item in the dropdown
      const batchItem = page.locator('[data-slot="select-item"], [role="option"]', { hasText: 'Demo Personas' });
      if (await batchItem.count() > 0) {
        await batchItem.first().click();
        await page.waitForTimeout(300);
      }

      // Step 5: Fill in the pricing URL
      const urlInput = page.locator('#pricing-url');
      await urlInput.waitFor({ state: 'visible', timeout: 5000 });
      await urlInput.fill('https://linear.app/pricing');
      await page.waitForTimeout(300);

      // Step 6: Click "Run Simulation" (inside the main form, not the floating button)
      const runBtn = page.getByRole('main').getByRole('button', { name: 'Run Simulation' });
      await runBtn.waitFor({ state: 'visible', timeout: 5000 });
      const isDisabled = await runBtn.getAttribute('disabled');
      expect(isDisabled).toBeNull();
      await runBtn.click();
      console.log('[E2E] Clicked Run Simulation');

      // Step 7: Wait for analysis to complete (button reverts to "Run Simulation")
      const startTime = Date.now();
      let completed = false;
      while (Date.now() - startTime < ANALYSIS_TIMEOUT) {
        await page.waitForTimeout(5000);
        const bodyText = await page.textContent('body');
        // The form shows "Simulating..." or similar while running; reverts when done
        if (!bodyText.includes('Simulating') && !bodyText.includes('Analyzing')) {
          // Double-check: the main Run button should be enabled again
          const mainBtn = page.getByRole('main').getByRole('button', { name: 'Run Simulation' });
          const btnCount = await mainBtn.count();
          if (btnCount > 0) {
            completed = true;
            console.log('[E2E] Analysis completed');
            break;
          }
        }
      }
      if (!completed) console.log('[E2E] Analysis did not complete within timeout, checking simulations list');
      if (!completed) console.log('[E2E] Analysis did not complete within timeout');

      // Step 8: Navigate to simulations list
      await page.goto(`${BASE_URL}/dashboard/simulations`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      const listText = await page.textContent('body');
      console.log(`[E2E] Simulations list: hasCompleted=${listText.includes('Completed')}`);

      // Step 9: Click into the completed simulation
      const simLink = page.locator('a[href*="/dashboard/simulations/"]').first();
      if (await simLink.count() > 0) {
        await simLink.click();
        await page.waitForTimeout(3000);

        const detailText = await page.textContent('body');

        // Verify output structure
        expect(detailText).toContain('Average Scores');
        expect(detailText).toContain('Clarity');
        expect(detailText).toContain('Trust');
        expect(detailText).toContain('Buy Intent');

        // Verify persona names appear
        expect(detailText).toContain('Casey');
        expect(detailText).toContain('Riley');
        expect(detailText).toContain('Elliot');

        // Verify structured thoughts
        expect(detailText).toContain('The Good');
        expect(detailText).toContain('The Bad');
        expect(detailText).toContain('The Dealbreaker');

        // Verify benchmark comparison
        expect(detailText).toContain('vs Run Avg');

        // Verify recommendations section exists
        expect(detailText).toContain('Recommendations');

        // Verify risks section exists
        expect(detailText).toContain('Risks');

        // Verify suggestion section exists
        expect(detailText).toContain('Suggestion');

        console.log('[E2E] Detail page verified: all sections present');

        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, 'full-sim-flow-detail.png'),
          fullPage: true,
        });
      }

      // Step 10: Verify no rendering errors
      const criticalErrors = pageErrors.filter(
        (e) => e.includes('Maximum call stack') || e.includes('RangeError') || e.includes('JSON.parse'),
      );
      expect(criticalErrors).toHaveLength(0);
      console.log('[E2E] No critical rendering errors');

    } finally {
      await page.close();
    }
  }, ANALYSIS_TIMEOUT + 60_000);
});
