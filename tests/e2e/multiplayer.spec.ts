import { test, expect, type Page, type Browser } from '@playwright/test'

/**
 * Two real players plus two bots play one full hand:
 * host creates a table → friend joins from the invite link → swap three → choose void suit →
 * play until the hand ends → both see the same settlement.
 */

const SHOTS = process.env.E2E_SCREENSHOT_DIR

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

async function signIn(browser: Browser, name: string, path = '/login') {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await page.goto(path)
  const play = page.getByRole('button', { name: 'Play', exact: true })
  // Typing before Vue hydrates is lost, so retry until the button reacts.
  await expect(async () => {
    await page.getByLabel('Your nickname').fill(name)
    await expect(play).toBeEnabled({ timeout: 500 })
  }).toPass({ timeout: 15_000 })
  await play.click()
  return page
}

/**
 * Take one sensible action if this page has anything to do. Returns true when it acted.
 * Buttons can vanish mid-click when the turn moves on, so every click is short and tolerant.
 */
async function tryClick(locator: ReturnType<Page['locator']>): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) return false
  return locator.click({ timeout: 1500 }).then(() => true, () => false)
}

async function step(page: Page): Promise<boolean> {
  if (await tryClick(page.locator('.act--hu'))) return true
  if (await tryClick(page.locator('.act--pass'))) return true
  // Tap a tile twice to discard it (the second tap confirms).
  const tile = page.locator('.self-hand .tile--clickable').last()
  if (await tryClick(tile)) {
    await tryClick(page.locator('.self-hand .tile--selected'))
    return true
  }
  return false
}

test('two friends and two bots play a full hand', async ({ browser }) => {
  test.setTimeout(240_000)

  // Host
  const host = await signIn(browser, 'Alice')
  await expect(host.getByRole('heading', { name: 'Waiting Room' })).toBeVisible()
  await host.getByRole('button', { name: /New table/ }).click()
  await expect(host).toHaveURL(/\/room\/[A-Z0-9]{6}$/)
  const code = (await host.locator('.invite .code').innerText()).trim()
  expect(code).toMatch(/^[A-Z0-9]{6}$/)

  // Friend opens the invite link, picks a nickname and lands at the table
  const friend = await signIn(browser, 'Bob', `/join/${code}`)
  await expect(friend).toHaveURL(new RegExp(`/room/${code}$`))
  await expect(host.locator('.seats li.filled')).toHaveCount(2)

  // Host fills the table with bots and keeps the hand quick
  await host.getByRole('button', { name: '+ Add a bot seat' }).click()
  await host.getByRole('button', { name: '+ Add a bot seat' }).click()
  await expect(host.locator('.seats li.filled')).toHaveCount(4)
  await shot(host, '01-waiting-room')

  await host.getByRole('button', { name: /Start with 4 players/ }).click()

  // swap three (exchange three) is on by default for new tables
  for (const page of [host, friend]) {
    await expect(page.getByText('Swap three tiles')).toBeVisible()
    await page.getByRole('button', { name: 'Suggest' }).click()
    await page.getByRole('button', { name: 'Swap' }).click()
  }
  await shot(host, '02-exchange')

  // void suit (void suit)
  for (const page of [host, friend]) {
    await expect(page.getByText('Choose your void suit')).toBeVisible({ timeout: 15_000 })
    await shot(page, page === host ? '03-suit-host' : '03-suit-friend')
    await page.locator('.suit.recommended').click()
  }

  // Play until the settlement overlay appears for both players
  const deadline = Date.now() + 200_000
  let tookTableShot = false
  while (Date.now() < deadline) {
    if (await host.getByRole('heading', { name: 'Settlement' }).isVisible().catch(() => false)) break
    const acted = (await step(host)) || (await step(friend))
    if (acted && !tookTableShot) {
      await shot(host, '04-table')
      tookTableShot = true
    }
    if (!acted) await host.waitForTimeout(250)
  }

  await expect(host.getByRole('heading', { name: 'Settlement' })).toBeVisible()
  await expect(friend.getByRole('heading', { name: 'Settlement' })).toBeVisible()
  await shot(host, '05-result')

  // Both players see the same scores and the host can deal again
  const hostRows = await host.locator('.settle tbody tr').allInnerTexts()
  const friendRows = await friend.locator('.settle tbody tr').allInnerTexts()
  expect(hostRows.sort()).toEqual(friendRows.sort())
  await expect(host.getByRole('button', { name: 'Next hand' })).toBeVisible()
  await expect(friend.getByText('Waiting for the host to deal the next hand')).toBeVisible()
})

test('a bad room code shows a friendly error', async ({ browser }) => {
  const page = await signIn(browser, 'Carol')
  await page.locator('input.code').fill('ZZZZZZ')
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page.locator('.mj-error')).toContainText(/no room|no table/i)
})
