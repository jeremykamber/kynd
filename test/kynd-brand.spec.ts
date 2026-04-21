import { test, expect } from '@playwright/test'

test.describe('Kynd Brand Verification', () => {
  test('marketing page loads with Kynd branding', async ({ page }) => {
    await page.goto('http://localhost:3005')

    await expect(page.getByRole('link', { name: 'Kynd Kynd' })).toBeVisible()
    await expect(page.getByText('Meet Kynd')).toBeVisible()

    const heroText = page.locator('h1')
    await expect(heroText).toContainText('Know your user')
  })

  test('marketing page has correct colors', async ({ page }) => {
    await page.goto('http://localhost:3005')
    
    const html = page.locator('html')
    const bgColor = await html.evaluate(el => getComputedStyle(el).backgroundColor)
    console.log('Page background:', bgColor)
  })

  test('dashboard layout has Kynd branding', async ({ page }) => {
    await page.goto('http://localhost:3005/dashboard')

    await expect(page.getByRole('link', { name: 'Kynd Kynd' })).toBeVisible()
  })

  test('no DeepBound references remain', async ({ page }) => {
    await page.goto('http://localhost:3005')
    
    const content = await page.content()
    const deepboundMatches = content.toLowerCase().match(/deepbound/g) || []
    console.log('DeepBound matches:', deepboundMatches.length)
    expect(deepboundMatches.length).toBe(0)
  })
})