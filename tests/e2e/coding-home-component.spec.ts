import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { codingComponentStyles } from './coding-styles';
import { CODING_PATHWAY_CATALOG, publishedPathwayIds } from '../../src/lib/coding/catalog';
import { publicPlacementQuestions, recommendCodingPathway } from '../../src/lib/coding/placement';
import { runCodingProgram } from '../../src/lib/coding/runner';
import type { CodingProgram } from '../../src/lib/coding/types';

// Real homepage components, synthetic API responses and actual recommendation
// logic. This is browser interaction evidence, not authenticated persistence.
test('Coding homepage highlights lessons and gives actionable placement feedback', async ({ page }) => {
  test.setTimeout(180000);
  const directory = 'artifacts/coding-home-feedback-2026-11-04';
  mkdirSync(directory, { recursive: true });
  const styles = await codingComponentStyles();
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `import React from 'react';import{createRoot}from'react-dom/client';import Home from'./src/components/coding/CodingHome';createRoot(document.getElementById('root')).render(<Home/>);` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const html = `<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles.replaceAll('</style','<\\/style')}</style></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script>${bundle.outputFiles[0]!.text.replaceAll('</script','<\\/script')}</script></body></html>`;
  const home = { curriculumPublished: false, learnerId: 'fictional-component-profile', yearGroup: 'Year 5', yearPathwayTitle: 'Blocks to Text', pathways: CODING_PATHWAY_CATALOG, placementQuestions: publicPlacementQuestions(publishedPathwayIds()), placement: null, lesson: { skillStatus: 'learning', stage: 'practise', assignmentStatus: 'unassigned' } };
  let requests = 0, fail = false;
  const savedProgram: CodingProgram = { blocks: [{ id: 'saved-loop', kind: 'repeat', times: 2, body: [{ id: 'saved-move', kind: 'move', direction: 'right' }] }] };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/__coding-home') return route.fulfill({ contentType: 'text/html', body: html });
    if (path === '/api/student/coding') return route.fulfill({ json: home });
    if (path === '/api/student/coding/next') return route.fulfill({ json: { state: 'caught-up' } });
    if (path === '/api/student/coding/portfolio') return route.fulfill({ json: { learnerId: home.learnerId, projects: [], legacyProjects: home.lesson.skillStatus === 'mastered' ? [{ lessonId: 'understanding-loops', title: 'Understanding Loops', projectTitle: 'Build a path to the star using loops', preview: { program: savedProgram, run: runCodingProgram(savedProgram, { x: 2, y: 0 }), updatedAt: '2026-11-04T00:00:00.000Z', evidenceStatus: 'assessed-version' } }] : [] } });
    if (path === '/api/student/coding/placement') {
      requests++;
      if (fail) return route.fulfill({ status: 400, json: { error: 'Synthetic save failure. Please try again.' } });
      const answers = route.request().postDataJSON().answers;
      return route.fulfill({ json: { ok: true, placement: recommendCodingPathway({ yearGroup: home.yearGroup, answers }) } });
    }
    if (path.startsWith('/api/student/coding/')) return route.fulfill({ json: { activities: [], plans: [], learnerId: home.learnerId, projects: [] } });
    if (path === '/student/coding/understanding-loops') return route.fulfill({ contentType: 'text/html', body: '<h1>Fictional lesson destination</h1>' });
    return route.abort();
  });
  await page.goto('/__coding-home');
  const card = page.getByRole('region', { name: 'Available Coding lessons' });
  await expect(card.getByRole('link', { name: /Continue lesson/ })).toBeVisible();
  await expect(card.getByRole('link')).toHaveAttribute('href', '/student/coding/understanding-loops');
  const form = page.getByRole('region', { name: 'Find a starting point', exact: true });
  await form.getByRole('button', { name: 'Find my starting point', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Choose an answer');
  expect(requests).toBe(0);
  await form.getByRole('radio', { name: 'A repeat block with hop inside it', exact: true }).check();
  await form.getByRole('button', { name: 'Find my starting point', exact: true }).click();
  await expect(form.getByRole('heading', { name: 'Your starting point is saved' })).toBeVisible();
  await expect(form.getByText('This placement supports some revision', { exact: false })).toBeVisible();
  await expect(form.getByRole('link', { name: 'Open Understanding Loops', exact: false })).toHaveAttribute('href', '/student/coding/understanding-loops');
  fail = true;
  await form.getByRole('radio', { name: 'A block that only changes the colour', exact: true }).check();
  await form.getByRole('button', { name: 'Find my starting point', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Synthetic save failure');
  await expect(card).toBeVisible();
  await expect(form.getByRole('radio', { name: 'A block that only changes the colour', exact: true })).toBeChecked();
  fail = false;
  await form.getByRole('button', { name: 'Find my starting point', exact: true }).click();
  await expect(form.getByRole('heading', { name: 'Your starting point is saved' })).toBeVisible();
  await expect(form.getByText('While your recommended pathway awaits publication', { exact: false })).toBeVisible();
  await expect(form.getByRole('alert')).toHaveCount(0);
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${directory}/${width}.png`, fullPage: true });
  }
  await form.getByRole('link', { name: 'Open Understanding Loops', exact: false }).click();
  await expect(page).toHaveURL(/\/student\/coding\/understanding-loops$/);
  home.lesson.skillStatus = 'mastered'; await page.goto('/__coding-home');
  await expect(page.getByRole('region', { name: 'Your next learning step', exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('region', { name: 'Find a starting point', exact: true })).toHaveCount(0);
  await expect(page.getByText('You’ve completed all currently available lessons.', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('link', { name: /Revisit lesson/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View my saved project', exact: false })).toHaveAttribute('href', '#coding-portfolio');
  await expect(page.getByRole('link', { name: 'Return to Coding learning', exact: false })).toHaveCount(0);
  const portfolio = page.getByRole('region', { name: 'Your Coding portfolio', exact: true });
  await expect(portfolio.getByText('Mastered lesson · original Coding course', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(portfolio.getByText('Your saved project', { exact: true })).toBeVisible();
  await expect(portfolio.getByText('This version supplied the independent mastery evidence.', { exact: true })).toBeVisible();
  await portfolio.getByRole('button', { name: 'Replay project', exact: true }).click();
  await expect(portfolio.getByRole('status')).toContainText(/Step [12] of 2/);
  await portfolio.getByRole('button', { name: 'Pause', exact: true }).click();
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${directory}/mastered-${width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
  expect(requests).toBe(3);
  home.curriculumPublished = true; home.lesson.skillStatus = 'learning';
  await page.goto('/__coding-home');
  await expect(page.getByRole('link', { name: 'Open my learning journey', exact: false })).toHaveAttribute('href', '#coding-curriculum', { timeout: 20000 });
  const approvedForm = page.getByRole('region', { name: 'Find a starting point', exact: true });
  await approvedForm.getByRole('radio', { name: 'A repeat block with hop inside it', exact: true }).check();
  await approvedForm.getByRole('button', { name: 'Find my starting point', exact: true }).click();
  await expect(approvedForm.getByRole('link', { name: 'Open my learning journey', exact: false })).toHaveAttribute('href', '#coding-curriculum');
  await expect(approvedForm.getByText('While your recommended pathway awaits publication', { exact: false })).toHaveCount(0);
});
