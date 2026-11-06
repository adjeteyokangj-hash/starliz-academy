import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { codingComponentStyles } from './coding-styles';

test('completion distinguishes caught-up, prerequisites, next activity and a failed lookup', async ({ page }) => {
  test.setTimeout(180000);
  const directory = 'artifacts/coding-next-step-2026-11-04'; mkdirSync(directory, { recursive: true });
  const styles = await codingComponentStyles();
  const built = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `import React from'react';import{createRoot}from'react-dom/client';import Next from'./src/components/coding/CodingNextStep';createRoot(document.getElementById('root')).render(<Next lessonId="understanding-loops" bookingId="fictional-booking"/>);` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  let state = 'caught-up', fail = false, hang = false;
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/__next') return route.fulfill({ contentType: 'text/html', body: `<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root" style="max-width:700px;margin:auto;padding:16px"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script>${built.outputFiles[0]!.text.replaceAll('</script','<\\/script')}</script></body></html>` });
    if (url.pathname === '/api/student/coding/next') {
      expect(url.searchParams.get('completedLessonId')).toBe('understanding-loops');
      expect(url.searchParams.get('bookingId')).toBe('fictional-booking');
      if (hang) return;
      return fail ? route.fulfill({ status: 503, json: { error: 'Synthetic unavailable response' } }) : route.fulfill({ json: { state, activity: { title: 'Fictional published lesson', href: '/student/coding/activities/fictional-published' } } });
    }
    if (url.pathname === '/student/coding/activities/fictional-published') return route.fulfill({ contentType: 'text/html', body: '<h1>Fictional next activity destination</h1>' });
    return route.abort();
  });
  await page.goto('/__next');
  await expect(page.getByText('You’ve completed all currently available lessons.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue to next activity', exact: false })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Return to Coding learning', exact: false })).toHaveAttribute('href', '/student/coding?bookingId=fictional-booking');
  await page.screenshot({ path: `${directory}/caught-up.png`, fullPage: true });
  state = 'prerequisites'; await page.reload();
  await expect(page.getByText('Other published activities still need prerequisite evidence.', { exact: false })).toBeVisible();
  await expect(page.getByText('You’ve completed all currently available lessons.', { exact: true })).toHaveCount(0);
  fail = true; await page.reload();
  await expect(page.getByText('We could not check your next activity just now.', { exact: false })).toBeVisible();
  fail = false; hang = true;
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(page.getByText('Checking your next available activity…', { exact: true })).toBeVisible();
  await expect(page.getByText('We could not check your next activity just now.', { exact: false })).toBeVisible({ timeout: 22000 });
  hang = false;
  fail = false; state = 'next'; await page.getByRole('button', { name: 'Check again', exact: true }).click();
  const next = page.getByRole('link', { name: 'Continue to next activity', exact: false });
  await expect(next).toHaveAttribute('href', '/student/coding/activities/fictional-published?bookingId=fictional-booking');
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${directory}/next-${width}.png`, fullPage: true });
  }
  await next.click();
  await expect(page).toHaveURL(/fictional-published\?bookingId=fictional-booking$/);
  expect(errors).toEqual([]);
});
