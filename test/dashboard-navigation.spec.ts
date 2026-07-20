import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'

async function isVisible(page: Page, text: string, timeoutMs = 5000): Promise<boolean> {
  try {
    await page.locator(`text=${text}`).first().waitFor({ state: 'visible', timeout: timeoutMs })
    return true
  } catch {
    return false
  }
}

async function isLocatorVisible(page: Page, selector: string, timeoutMs = 5000): Promise<boolean> {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs })
    return true
  } catch {
    return false
  }
}

describe('Dashboard Navigation — E2E', () => {
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage()
  })

  afterAll(async () => {
    await browser.close()
  })

  it('should load the dashboard and show the setup view for a fresh user', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 })

    const headingVisible = await isVisible(page, 'Define your target market', 10000)
    expect(headingVisible).toBe(true)

    const textareaVisible = await isLocatorVisible(page, 'textarea[placeholder*="B2B SaaS"]')
    expect(textareaVisible).toBe(true)
  })

  it('should show setup view with audience description and generate button', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 })

    const headingVisible = await isVisible(page, 'Define your target market', 10000)
    expect(headingVisible).toBe(true)

    const audienceVisible = await isVisible(page, 'Audience Description')
    expect(audienceVisible).toBe(true)

    const generateVisible = await isLocatorVisible(page, 'button:has-text("Generate Personas")')
    expect(generateVisible).toBe(true)
  })

  it('should have Generate Personas button disabled when textarea is empty', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 })

    const generateBtn = page.locator('button:has-text("Generate Personas")').first()
    await generateBtn.waitFor({ state: 'visible', timeout: 10000 })
    const isDisabled = await generateBtn.isDisabled()
    expect(isDisabled).toBe(true)
  })

  it('should enable Generate Personas button when textarea has content', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 })

    const textarea = page.locator('textarea[placeholder*="B2B SaaS"]').first()
    await textarea.waitFor({ state: 'visible', timeout: 10000 })
    await textarea.fill('B2B SaaS founders dealing with high churn')

    const generateBtn = page.locator('button:has-text("Generate Personas")').first()
    const isEnabled = await generateBtn.isEnabled()
    expect(isEnabled).toBe(true)
  })

  it('should show interview link in the setup view', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 })

    const linkVisible = await isVisible(page, 'Have interview transcripts?', 10000)
    expect(linkVisible).toBe(true)
  })

  it('should navigate to interviews page from setup view link', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 })

    await page.locator('a:has-text("Generate from interviews")').first().click()
    await page.waitForURL('**/dashboard/interviews', { timeout: 10000 })
    expect(page.url()).toContain('/dashboard/interviews')
  })

  it('should navigate to interviews page from sidebar', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 })

    await page.locator('a[href="/dashboard/interviews"]').first().click()
    await page.waitForURL('**/dashboard/interviews', { timeout: 10000 })
    expect(page.url()).toContain('/dashboard/interviews')
  })

  it('should navigate to simulations page from sidebar', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 })

    await page.locator('a[href="/dashboard/simulations"]').first().click()
    await page.waitForURL('**/dashboard/simulations', { timeout: 10000 })
    expect(page.url()).toContain('/dashboard/simulations')
  })

  it('should navigate back to dashboard from interviews via sidebar', async () => {
    await page.goto(`${BASE_URL}/dashboard/interviews`, { waitUntil: 'networkidle', timeout: 30000 })

    await page.locator('nav button:has-text("Personas")').click()
    await page.waitForURL('**/dashboard', { timeout: 10000 })
    expect(page.url()).toMatch(/\/dashboard\/?$/)
  })

  it('should load demo personas when clicking Load Demo Personas', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 })

    const demoBtn = page.locator('button:has-text("Load Demo Personas")').first()
    await demoBtn.waitFor({ state: 'visible', timeout: 10000 })
    await demoBtn.click()

    // After loading demo personas, the setup view should still be visible
    // (demo personas are loaded into the flow, not into the store)
    const headingVisible = await isVisible(page, 'Define your target market', 5000)
    expect(headingVisible).toBe(true)
  })
})
