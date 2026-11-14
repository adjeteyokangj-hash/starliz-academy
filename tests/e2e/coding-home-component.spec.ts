import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { codingComponentStyles } from './coding-styles';
import { CODING_PATHWAY_CATALOG, publishedPathwayIds } from '../../src/lib/coding/catalog';
import { publicPlacementQuestions, recommendCodingPathway } from '../../src/lib/coding/placement';
import { authoredActivities } from '../../src/lib/coding/learning/catalogue';

// Real homepage components, synthetic API responses and actual recommendation
// logic. This is browser interaction evidence, not authenticated persistence.
test('Coding homepage highlights lessons and gives actionable placement feedback', async ({ page }) => {
  test.setTimeout(180000);
  const directory = 'artifacts/coding-home-cleanup';
  mkdirSync(directory, { recursive: true });
  const styles = await codingComponentStyles();
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `import React from 'react';import{createRoot}from'react-dom/client';import Home from'./src/components/coding/CodingHome';createRoot(document.getElementById('root')).render(<Home/>);` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles.replaceAll('</style','<\\/style')}</style></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script>${bundle.outputFiles[0]!.text.replaceAll('</script','<\\/script')}</script></body></html>`;
  const home = { curriculumPublished: false, learnerId: 'fictional-component-profile', yearGroup: 'Year 5', yearPathwayTitle: 'Blocks to Text', pathways: CODING_PATHWAY_CATALOG, placementQuestions: publicPlacementQuestions(publishedPathwayIds()), placement: null, lesson: { skillStatus: 'learning', stage: 'practise', assignmentStatus: 'unassigned' } };
  let requests = 0, fail = false;
  const activities = authoredActivities.filter(activity => activity.year === 5 || activity.year === 6).map((activity, index) => ({
    ...activity,
    status: index === 0 ? 'mastered' : 'not_started',
    unlocked: index < 2,
  }));
  const historyRequests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/__coding-home') return route.fulfill({ contentType: 'text/html', body: html });
    if (path === '/api/student/coding') return route.fulfill({ json: home });
    if (path === '/api/student/coding/next') return route.fulfill({ json: { state: 'caught-up' } });
    if (path === '/api/student/coding/activities') return route.fulfill({ json: { activities } });
    if (path === '/api/student/coding/portfolio' || path === '/api/student/coding/readiness') historyRequests.push(path);
    if (path === '/student/coding/portfolio') return route.fulfill({ contentType: 'text/html', body: '<h1>Coding portfolio</h1><div id="coding-portfolio"></div>' });
    if (path === '/api/student/coding/placement') {
      requests++;
      if (fail) return route.fulfill({ status: 400, json: { error: 'Synthetic save failure. Please try again.' } });
      const answers = route.request().postDataJSON().answers;
      return route.fulfill({ json: { ok: true, placement: recommendCodingPathway({ yearGroup: home.yearGroup, answers }) } });
    }
    if (path.startsWith('/api/student/coding/')) return route.fulfill({ json: { activities: [], plans: [], learnerId: home.learnerId, projects: [] } });
    if (path === '/student/coding/understanding-loops') return route.fulfill({ contentType: 'text/html', body: '<h1>Fictional lesson destination</h1>' });
    if (path === '/student/coding/world') return route.fulfill({ contentType: 'text/html', body: '<h1>Fictional game world destination</h1>' });
    return route.abort();
  });
  await page.goto('/__coding-home');
  const card = page.getByRole('region', { name: 'Available Coding lessons' });
  await expect(card.getByRole('link', { name: /Continue lesson/ })).toBeVisible();
  await expect(card.getByRole('link')).toHaveAttribute('href', '/student/coding/understanding-loops');
  const gameWorld = page.getByRole('link', { name: /Explore Coding Game World/ });
  await expect(gameWorld).toHaveAttribute('href', '/student/coding/world');
  await expect(page.getByRole('heading', { name: 'A world of coding inventions', exact: true })).toHaveCount(0);
  await expect(page.getByText(/Understanding Loops is/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Your saved work evidence', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Pathways', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Coding Foundations', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Find a starting point', exact: true })).toHaveCount(0);
  const establishedOrder = await page.evaluate(() => ['Return to dashboard', 'Learn to give a computer instructions', 'Explore Coding Game World', 'Understanding Loops', 'Continue lesson'].map((label) => document.body.innerText.indexOf(label)));
  expect(establishedOrder.every((index, position) => index >= 0 && (position === 0 || index > establishedOrder[position - 1]!))).toBe(true);
  await gameWorld.click();
  await expect(page).toHaveURL(/\/student\/coding\/world$/);
  await expect(page.getByRole('heading', { name: 'Fictional game world destination', exact: true })).toBeVisible();
  home.lesson.skillStatus = 'not_started';
  await page.goto('/__coding-home');
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
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `${directory}/${width}.png`, fullPage: true });
  }
  await form.getByRole('link', { name: 'Open Understanding Loops', exact: false }).click();
  await expect(page).toHaveURL(/\/student\/coding\/understanding-loops$/);
  home.curriculumPublished = true; home.lesson.skillStatus = 'mastered'; await page.goto('/__coding-home');
  await expect(page.getByRole('region', { name: 'Your next learning step', exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('region', { name: 'Find a starting point', exact: true })).toHaveCount(0);
  await expect(page.getByText('You’ve completed all currently available lessons.', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('link', { name: /Revisit lesson/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View my saved project', exact: false })).toHaveAttribute('href', '/student/coding/portfolio#coding-portfolio');
  await expect(page.getByRole('link', { name: 'Return to Coding learning', exact: false })).toHaveCount(0);
  const curriculum = page.getByRole('region', { name: 'StarLiz Coding curriculum' });
  await expect(curriculum.getByRole('heading', { name: 'Your Coding learning journey' })).toBeVisible();
  await expect(curriculum.getByRole('combobox', { name: 'Year' })).toHaveValue('5');
  for (const label of ['Bring your previous learning', 'Mastered lesson · original Coding course', 'Your assessed curriculum creations']) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  }
  await expect(curriculum.locator('summary')).toHaveCount(4);
  for (const [width, height] of [[1440, 1000], [1280, 900], [1024, 768], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const trailingSpace = await curriculum.evaluate(element => document.documentElement.scrollHeight - (element.getBoundingClientRect().bottom + window.scrollY));
    expect(trailingSpace).toBeLessThanOrEqual(40);
    await page.screenshot({ path: `${directory}/mastered-${width}.png`, fullPage: true });
  }
  expect(historyRequests).toEqual([]);
  await page.getByRole('link', { name: /View my saved project/ }).click();
  await expect(page).toHaveURL(/\/student\/coding\/portfolio#coding-portfolio$/);
  await expect(page.getByRole('heading', { name: 'Coding portfolio' })).toBeVisible();
  expect(errors).toEqual([]);
  expect(requests).toBe(3);
  home.curriculumPublished = true; home.lesson.skillStatus = 'learning';
  await page.goto('/__coding-home');
  const journey = page.getByRole('link', { name: 'Open my learning journey', exact: false });
  await expect(journey).toHaveAttribute('href', '#coding-curriculum', { timeout: 20000 });
  await expect(page.getByRole('region', { name: 'Find a starting point', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Continue lesson/ })).toHaveAttribute('href', '/student/coding/understanding-loops');
  await expect(page.getByRole('link', { name: /Explore Coding Game World/ })).toHaveAttribute('href', '/student/coding/world');
  const publishedOrder = await page.evaluate(() => ['Open my learning journey', 'Explore Coding Game World', 'Continue lesson'].map((label) => document.body.innerText.indexOf(label)));
  expect(publishedOrder.every((index, position) => index >= 0 && (position === 0 || index > publishedOrder[position - 1]!))).toBe(true);
  await journey.click();
  await expect(page).toHaveURL(/#coding-curriculum$/);
});
