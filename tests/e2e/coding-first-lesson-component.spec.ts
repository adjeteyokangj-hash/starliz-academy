import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdirSync, readFileSync } from 'node:fs';
import type * as Blockly from 'blockly/core';
import { codingComponentStyles } from './coding-styles';
import { UNDERSTANDING_LOOPS } from '../../src/lib/coding/catalog';
import { runCodingProgram } from '../../src/lib/coding/runner';
import type { CodingProgram } from '../../src/lib/coding/types';

// Real components and Blockly, trusted native execution, fictional API state.
// Does not claim authenticated persistence, model or runner acceptance.
test('first lesson guides a beginner and locates an empty repeat without changing their program', async ({ page }) => {
  test.setTimeout(180000);
  const directory = 'artifacts/coding-first-lesson-2026-11-04'; mkdirSync(directory, { recursive: true });
  const styles = await codingComponentStyles();
  const built = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `import React from'react';import{createRoot}from'react-dom/client';import Workspace from'./src/components/coding/CodingLessonWorkspace';import*as B from'blockly/core';window.blocksApi=B;createRoot(document.getElementById('root')).render(<Workspace lessonId="understanding-loops"/>);` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  let program: CodingProgram = { blocks: [{ id: 'first', kind: 'repeat', times: 3, body: [{ id: 'move', kind: 'move', direction: 'right' }] }, { id: 'empty', kind: 'repeat', times: 2, body: [] }] };
  const workspace = { lesson: UNDERSTANDING_LOOPS, stage: 'discover', completedStages: [], program, evidence: {}, skillStatus: 'learning', feedback: null, run: null as ReturnType<typeof runCodingProgram> | null, teacherFeedback: null, hintCount: 0, attemptCount: 0, checksPassed: 0 };
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/__first-lesson') return route.fulfill({ contentType: 'text/html', body: `<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script>${built.outputFiles[0]!.text.replaceAll('</script', '<\\/script')}</script></body></html>` });
    if (path.startsWith('/coding/blockly/')) return route.fulfill({ body: readFileSync(`public${path}`), contentType: path.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream' });
    if (path === '/api/student/coding/lessons/understanding-loops') {
      if (route.request().method() === 'GET') return route.fulfill({ json: { workspace } });
      const action = route.request().postDataJSON(); program = action.program; workspace.program = program;
      if (action.action === 'run') workspace.run = runCodingProgram(program, { x: 3, y: 0 });
      return route.fulfill({ json: { workspace, run: workspace.run, runSource: 'learner' } });
    }
    return route.abort();
  });
  await page.goto('/__first-lesson');
  await expect(page.locator('.blocklySvg').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show empty repeat', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo blocks', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Restore starter', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Use accessible action controls', exact: true })).toBeHidden();
  await expect(page.locator('details[data-studio-tutor]')).not.toHaveAttribute('open');
  const guide = page.locator('.studio-guide-content');
  await expect(guide.locator(':scope > :first-child')).toContainText('Instructions');
  const example = page.getByRole('region', { name: 'Lesson Example', exact: true });
  const own = page.getByRole('region', { name: 'My Program', exact: true });
  await expect(example).toContainText('Start here');
  await example.getByRole('button', { name: 'Replay Example', exact: true }).click();
  await expect(example).toContainText('The example reached the star!');
  await expect(example.locator('[aria-label="Example destination"]')).toContainText('⭐');
  await expect(example.locator('[aria-label="Example destination"]')).toContainText('🙂');
  const before = await example.locator('[aria-label="Lesson example output"]').innerHTML();
  await page.getByRole('button', { name: 'Show empty repeat', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { blocksApi: typeof Blockly }).blocksApi.common.getSelected()?.id)).toBe('node:empty');
  // Remove only the identified surplus block, using the actual Blockly API.
  await page.evaluate(() => ((window as unknown as { blocksApi: typeof Blockly }).blocksApi.getMainWorkspace() as Blockly.WorkspaceSvg).getBlockById('node:empty')!.dispose(true));
  await expect(page.getByRole('button', { name: 'Show empty repeat', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Run my blocks', exact: true }).click();
  await expect(own.locator('[aria-label="Program output"]')).toBeVisible();
  await expect.poll(() => workspace.run?.reachedGoal).toBe(true);
  expect(program.blocks).toHaveLength(1);
  expect(await example.locator('[aria-label="Lesson example output"]').innerHTML()).toBe(before);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Your workspace matches the saved version.', { exact: true })).toBeVisible();
  await expect(own.getByText('Showing your program', { exact: false })).toBeVisible();
  await expect(own.getByText('Your program reached the star!', { exact: true })).toBeVisible();
  await page.getByText('More program options', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore starter', exact: true })).toBeVisible();
  await page.getByText('More program options', { exact: true }).click();
  for (const width of [1600, 820, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1600) {
      const a = await example.boundingBox(), b = await own.boundingBox();
      expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
    }
    await page.screenshot({ path: `${directory}/${width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
