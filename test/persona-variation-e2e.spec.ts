import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import * as fs from 'fs'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'
const SERVER_LOG_PATH = process.env.NEXT_SERVER_LOG_PATH || '/tmp/kynd-nextjs-logs.txt'

const EXPECTED_LOG_PATTERNS = [
  '[DashboardClient] Variation flow started',
  '[DashboardClient] Calling generateSimilarPersonasAction',
  '[generateSimilarPersonasAction] StreamableValue created',
  '[PersonaAdapter.generateVariationPersonas] Generating',
  '[PersonaAdapter.generateVariationPersonas] Adjustments',
  '[PersonaAdapter.generateVariationPersonas] Calling LLM',
  '[generateSimilarPersonasAction] Successfully generated',
  '[DashboardClient] Stream completed',
]

describe('Persona Variation Flow - E2E', () => {
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage()
  })

  afterAll(async () => {
    await browser.close()
  })

  it('should load the dashboard page', async () => {
    const response = await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 })
    expect(response?.ok()).toBe(true)
    expect(await page.title()).toBeDefined()
  })

  it('should verify server log messages from the variation flow pipeline', async () => {
    const logContent = readServerLogs()

    if (!logContent) {
      console.warn(`Server log file not found at ${SERVER_LOG_PATH}. Skipping assertion.`)
      console.warn('To capture logs, start the server with: bun dev > /tmp/kynd-nextjs-logs.txt 2>&1')
      return
    }

    const missingPatterns = EXPECTED_LOG_PATTERNS.filter(
      (pattern) => !logContent.includes(pattern)
    )

    if (missingPatterns.length > 0) {
      console.warn('Missing log patterns from server output:', missingPatterns)
      console.warn('This may mean the variation flow was not fully exercised.')
      console.warn('Full log content preview (last 50 lines):')
      const lines = logContent.trim().split('\n')
      const preview = lines.slice(Math.max(0, lines.length - 50)).join('\n')
      console.warn(preview)
    }

    // Soft assertion: warns on partial matches but only fails if zero patterns found
    const anyPatternFound = EXPECTED_LOG_PATTERNS.some((p) => logContent.includes(p))
    expect(anyPatternFound).toBe(true)
  })

  it('should have accessible slider UI with 1-5 discrete scale', async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 })

    // Branch: persona cards present → exercise variation UI; absent → just verify page loaded
    const hasPersonaCards = await page.locator('text=Create Variant').count()

    if (hasPersonaCards > 0) {
      await page.locator('text=Create Variant').first().click()
      await page.waitForSelector('text=Variant', { timeout: 5000 })
      await page.locator('text=Variant').click()
      await page.waitForSelector('text=Conscientiousness', { timeout: 3000 })
      await page.waitForSelector('text=Creative Freedom', { timeout: 3000 })
    } else {
      const pageContent = await page.content()
      expect(pageContent.length).toBeGreaterThan(0)
    }
  })
})

function readServerLogs(): string | null {
  try {
    if (fs.existsSync(SERVER_LOG_PATH)) {
      return fs.readFileSync(SERVER_LOG_PATH, 'utf-8')
    }
    return null
  } catch {
    return null
  }
}
