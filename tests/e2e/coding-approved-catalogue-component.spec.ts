import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { authoredActivities } from '../../src/lib/coding/learning/catalogue';
import { codingComponentStyles } from './coding-styles';

test('approved 440-activity catalogue exposes every year, prerequisite status and a usable next activity', async ({ page }) => {
  test.setTimeout(180000);
  const directory = 'artifacts/coding-approved-catalogue-2026-11-04'; mkdirSync(directory, { recursive: true });
  // Actual authored content, fictional progress: no accounts, database or model requests.
  const activities = authoredActivities.map(activity => ({ ...activity, status: 'not_started', unlocked: activity.prerequisites.length === 0, stage: 'discover', updatedAt: null }));
  const first = activities.find(activity => activity.unlocked)!;
  expect(activities).toHaveLength(440);
  const styles = await codingComponentStyles();
  const built = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `import React from'react';import{createRoot}from'react-dom/client';import Catalogue from'./src/components/coding/LearningCatalogue';import Next from'./src/components/coding/CodingNextStep';createRoot(document.getElementById('root')).render(<><Next lessonId="understanding-loops"/><Catalogue yearGroup="Year 5"/></>);` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/__approved-catalogue') return route.fulfill({ contentType: 'text/html', body: `<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root" style="max-width:1400px;margin:auto;padding:16px"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script>${built.outputFiles[0]!.text.replaceAll('</script','<\\/script')}</script></body></html>` });
    if (url.pathname === '/api/student/coding/activities') return route.fulfill({ json: { activities } });
    if (url.pathname === '/api/student/coding/next') return route.fulfill({ json: { state: 'next', activity: { title: first.title, href: `/student/coding/activities/${first.id}` } } });
    if (url.pathname === `/student/coding/activities/${first.id}`) return route.fulfill({ contentType: 'text/html', body: '<h1>Approved activity destination</h1>' });
    return route.abort();
  });
  await page.goto('/__approved-catalogue');
  await expect(page.getByRole('combobox', { name: 'Year', exact: true })).toHaveValue('5', { timeout: 30000 });
  const catalogue = page.getByRole('region', { name: 'StarLiz Coding curriculum' });
  for (let year = 1; year <= 11; year++) {
    await page.getByRole('combobox', { name: 'Year', exact: true }).selectOption(String(year));
    const selected = activities.filter(activity => activity.year === year);
    for (const group of await catalogue.locator('details').all()) {
      if (await group.getAttribute('open') === null) await group.locator('summary').click();
    }
    await expect(catalogue.getByRole('heading', { level: 3 })).toHaveCount(selected.length);
    await expect(catalogue.getByText(`0 of ${selected.length} activities independently mastered`, { exact: true })).toBeVisible();
  }
  await page.getByRole('combobox', { name: 'Year', exact: true }).selectOption('1');
  await expect(catalogue.getByText('Complete the prerequisite activities to unlock', { exact: true }).first()).toBeVisible();
  await expect(catalogue.getByRole('link', { name: 'Begin activity', exact: true }).first()).toBeVisible();
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${directory}/approved-${width}.png`, fullPage: true });
  }
  await page.getByRole('link', { name: 'Continue to next activity', exact: false }).click();
  await expect(page).toHaveURL(new RegExp(`${first.id}$`));
  await expect(page.getByRole('heading', { name: 'Approved activity destination' })).toBeVisible();
  expect(errors).toEqual([]);
  writeFileSync(`${directory}/result.json`, JSON.stringify({ passed: true, authoredActivities: 440, yearFilters: 11, responsiveWidths: [1440, 820, 390], nextLinkNavigation: true, browserErrors: errors, authenticated: false, data: 'Actual curriculum with fictional progress; intercepted API boundaries' }, null, 2));
});
