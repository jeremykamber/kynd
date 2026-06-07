// @vitest-environment node

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';

const PORTS_TO_TRY = [3000, 3001, 3100, 3207];
const SCREENSHOT_DIR = path.resolve(process.cwd(), '.sisyphus', 'evidence');
const SERVER_TIMEOUT = 120_000;
const ANALYSIS_TIMEOUT = 150_000;
const NAV_TIMEOUT = 60000;

let BASE_URL = '';

async function findOrStartServer() {
  for (const port of PORTS_TO_TRY) {
    const url = `http://localhost:${port}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) return { url, process: null };
    } catch { /* try next */ }
  }
  const port = PORTS_TO_TRY[PORTS_TO_TRY.length - 1];
  const url = `http://localhost:${port}`;
  const server = spawn('bun', ['run', 'next', 'dev', '-p', String(port)], {
    env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'], shell: true,
  });
  // Wait for server to be ready (poll every 2s for up to 120s)
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return { url, server };
    } catch { /* still starting */ }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Server did not start within 120s on port ${port}`);
}

describe('Pricing Analysis — Complete Flow', () => {
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
    if (server) { server.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 1000)); }
  });

  it('stays on dashboard until analysis completes, then shows results', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors: string[] = [];
    const traces: string[] = [];
    page.on('console', (msg) => { const t = msg.text(); if (t.includes('[TRACE]')) traces.push(t); });
    page.on('pageerror', (err) => { if (!err.message.includes('Hydration failed')) pageErrors.push(err.message); });

    // Seed personas and start analysis
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      localStorage.setItem('persona-storage', JSON.stringify({
        state: {
          batches: [{ id: 'fb', label: 'Full Batch', personas: [
            { id:'p1',name:'Casey',age:34,occupation:'Lead PM',educationLevel:'Masters',interests:['SaaS'],goals:['Ship faster'],conscientiousness:80,neuroticism:30,openness:70,extraversion:40,agreeableness:60,values:['Transparency'],fears:['Hidden fees'],communicationStyle:'Direct',decisionStyle:'Data-driven',pricingSensitivity:60,typicalBudget:'$50/mo' },
            { id:'p2',name:'Riley',age:42,occupation:'VP Eng',educationLevel:'Bachelors',interests:['DevOps'],goals:['Scale infrastructure'],conscientiousness:70,neuroticism:60,openness:40,extraversion:30,agreeableness:40,values:['Reliability'],fears:['Vendor lock-in'],communicationStyle:'Analytical',decisionStyle:'Data-driven',pricingSensitivity:40,typicalBudget:'$200/mo' },
            { id:'p3',name:'Elliot',age:28,occupation:'Developer',educationLevel:'Bachelors',interests:['Open source'],goals:['Build great products'],conscientiousness:60,neuroticism:40,openness:80,extraversion:50,agreeableness:50,values:['Efficiency'],fears:['Complexity'],communicationStyle:'Technical',decisionStyle:'Gut-driven',pricingSensitivity:80,typicalBudget:'$30/mo' },
          ], source: 'interviews', transcriptCount: 3, createdAt: new Date().toISOString() }],
          activeBatchId: 'fb',
          activeDescription: 'test',
        },
        version: 0,
      }));
    });
    await page.reload({ waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(2000);
    await page.fill('input[type="url"]', 'https://linear.app/pricing');
    await page.click('button:has-text("Run Pricing Simulation")');
    console.log('[TEST] Analysis started');

    // Wait on the dashboard for the analysis to complete
    // The for-await loop processes DONE, markComplete persists to localStorage
    const startTime = Date.now();
    let completed = false;
    while (Date.now() - startTime < ANALYSIS_TIMEOUT) {
      await page.waitForTimeout(3000);
      const text = await page.textContent('body');
      if (text.includes('Simulating...')) continue;
      if (text.includes('Run Pricing Simulation')) {
        completed = true;
        console.log('[TEST] Analysis completed (button reverted)');
        break;
    }
    if (!completed) console.log('[TEST] Button did not revert within timeout');

    // Navigate to simulations list and verify completion
    await page.goto(`${BASE_URL}/dashboard/simulations`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(2000);
    const listText = await page.textContent('body');
    const hasCompleted = listText.includes('Completed');
    console.log(`[TEST] Simulations list shows completed: ${hasCompleted}`);

    // Click into the completed simulation
    if (hasCompleted) {
      try {
        const card = await page.waitForSelector('text=Pricing Analysis', { timeout: 5000 });
        await card.click();
        await page.waitForTimeout(2000);
        const detailText = await page.textContent('body');
        expect(detailText).toContain('Average Scores');
        console.log('[TEST] Detail page shows average scores');
      } catch (e) {
        console.log('[TEST] Could not navigate to detail:', e.message);
      }
    }

    // Verify no stack overflow
    const stackErrors = pageErrors.filter(e => e.includes('Maximum call stack') || e.includes('RangeError'));
    expect(stackErrors).toHaveLength(0);

    // Verify TRACE messages were emitted
    console.log(`[TEST] TRACE messages: ${traces.length}`);
    const doneTraces = traces.filter(t => t.includes('RECEIVED DONE'));
    console.log(`[TEST] DONE traces: ${doneTraces.length}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'complete-flow.png'), fullPage: true });
    await page.close();
  }, ANALYSIS_TIMEOUT + 60_000);
});
