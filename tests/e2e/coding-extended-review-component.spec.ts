import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { authoredActivities } from '../../src/lib/coding/learning/catalogue';
import { initialActivityState, transitionActivity, artifactHash } from '../../src/lib/coding/learning/state-machine';
import { publicActivityView } from '../../src/lib/coding/learning/public-view';
import { executePractical } from '../../src/lib/coding/learning/runtime';
import { visualReview } from '../../src/lib/coding/learning/visual-review';
import { reviewOwnershipContext } from '../../src/lib/coding/learning/extended-review';
import type { reviewExplanation } from '../../src/lib/coding/learning/teacher';
import { codingComponentStyles } from './coding-styles';

// Actual component, public view, transition and Review service; isolated memory
// persistence and a counted provider stub. No account or learner database writes.
for (const scenario of ['young', 'unknown', 'permitted', 'pending'] as const) test(`extended Review journey: ${scenario}`, async ({ page }) => {
  test.setTimeout(180000);
  const directory = `artifacts/coding-review-pass/browser/${scenario}`; mkdirSync(directory, { recursive: true });
  const activity = authoredActivities.find(item => item.inventoryId === (scenario === 'pending' ? 'Y6.08' : 'Y2.02'))!;
  const age = scenario === 'young' ? 7 : scenario === 'permitted' ? 14 : null;
  const privacyBefore = process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED; delete process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED;
  const counts = { keyReads: 0, modelCalls: 0 };
  const holder = globalThis as typeof globalThis & { __reviewBrowser?: typeof counts }; holder.__reviewBrowser = counts;
  try {
    const teacherBundle = await build({ entryPoints: ['src/lib/coding/learning/teacher.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'counted-provider-fixture', setup(api) {
      api.onResolve({ filter: /api-key-config|model-json/ }, args => ({ path: args.path, namespace: 'fixture' }));
      api.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents: args.path.includes('api-key-config') ? 'export async function getOpenAiApiKey(){globalThis.__reviewBrowser.keyReads++;return "fictional-key"}' : 'export async function requestCoachJson(_key,_system,raw){globalThis.__reviewBrowser.modelCalls++;return {supported:true,confidence:0.95,evidenceQuote:JSON.parse(raw).explanation,feedback:"Your explanation matches the observed result."}}' }));
    } }] });
    const loaded = { exports: {} as { reviewExplanation: typeof reviewExplanation } };
    new Function('require', 'module', 'exports', teacherBundle.outputFiles[0]!.text)(createRequire(`${process.cwd()}/package.json`), loaded, loaded.exports);
    let state = initialActivityState(activity); state.stage = 'review'; state.completed = ['discover', 'predict', 'build', 'practise', 'debug', 'create'];
    state.artifacts.create = activity.independent[0]!.reference;
    if (scenario !== 'pending') state.lastExecution = await executePractical(activity.workbench, state.artifacts.create, activity.independent[0]!.cases[0]!.input);
    state.lastRunStage = 'create'; state.lastRunArtifactHash = artifactHash(state.artifacts.create);
    state.hints = { discover: 1 }; state.tutorMessages = [{ stage: 'discover', message: 'Look at the direction before the move.', source: 'fallback', revealing: false }];
    const history = structuredClone({ hints: state.hints, tutorMessages: state.tutorMessages, assistedVariantIds: state.assistedVariantIds });
    const scope = () => ({ kind: 'learner' as const, age, reviewContext: reviewOwnershipContext('fictional-child', activity.id, state), reviewVariant: state.independentVariant });
    const view = () => ({ ...publicActivityView(activity, state, 'learner', scope()), revision: 'memory-fixture', versions: [] });
    const challenge = scenario === 'pending' ? null : visualReview(activity, state.artifacts.create, state.lastExecution!, { ownershipKey: scope().reviewContext, independentVariant: 0 });
    const styles = await codingComponentStyles();
    const built = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `import React from'react';import{createRoot}from'react-dom/client';import Workspace from'./src/components/coding/LearningWorkspace';createRoot(document.getElementById('root')).render(<Workspace initial={window.initialWorkspace}/>);` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
    const errors: string[] = []; let externalRequests = 0; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/__extended-review') return route.fulfill({ contentType: 'text/html', body: `<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};window.initialWorkspace=${JSON.stringify(view()).replaceAll('<', '\\u003c')};</script><script>${built.outputFiles[0]!.text.replaceAll('</script', '<\\/script')}</script></body></html>` });
      if (url.pathname.startsWith('/coding/blockly/')) return route.fulfill({ body: readFileSync(`public${url.pathname}`), contentType: url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream' });
      if (url.pathname === `/api/student/coding/activities/${activity.id}`) {
        const action = route.request().postDataJSON();
        try {
          const result = await transitionActivity(activity, state, action, { run: executePractical, teach: async () => ({ message: 'Inspect the direction.', source: 'fallback', revealing: false }), reflect: async (...args) => loaded.exports.reviewExplanation(...args, scope()) });
          state = result.state; return route.fulfill({ json: { workspace: { ...view(), message: result.message } } });
        } catch (error) { return route.fulfill({ status: 400, json: { error: String(error) } }); }
      }
      if (url.pathname === '/api/student/coding/next') return route.fulfill({ json: { state: 'none' } });
      if (url.hostname !== '127.0.0.1') externalRequests++;
      return route.abort();
    });
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/__extended-review');
    if (scenario === 'pending') {
      await expect(page.getByRole('heading', { name: 'Review is not complete', exact: true })).toBeVisible();
      await expect(page.getByText(/browser observations/).first()).toBeVisible();
      const draft = 'Saved draft: I still need to observe the keyboard route and viewport.';
      await page.getByRole('textbox', { name: 'Your explanation', exact: true }).fill(draft);
      await page.getByRole('button', { name: 'Save explanation draft', exact: true }).click();
      await expect.poll(() => state.explanation).toBe(draft); await page.reload();
      await expect(page.getByRole('textbox', { name: 'Your explanation', exact: true })).toHaveValue(draft);
      expect(state.mastered).toBe(false); expect(state.completed).not.toContain('review');
    } else if (scenario === 'permitted') {
      await expect(page.getByRole('region', { name: 'Show what you learned', exact: true })).toHaveCount(0);
      const field = page.getByRole('textbox', { name: 'Your explanation', exact: true });
      await field.fill('it works'); await page.getByRole('button', { name: 'Verify mastery and explanation', exact: true }).click();
      await expect.poll(() => state.explanation).toBe('it works'); expect(state.mastered).toBe(false); expect(counts.modelCalls).toBe(1);
      const output = state.lastExecution!.output as { moves: number; x: number };
      await field.fill(`The forward command follows the heading because a turn changes the direction of the later moves. The trace has ${output.moves} moves and ends in column ${output.x}.`);
      await page.getByRole('button', { name: 'Save explanation draft', exact: true }).click();
      await expect.poll(() => state.explanation.includes('heading')).toBe(true); await page.reload();
      await expect(field).toHaveValue(/heading/); await page.getByRole('button', { name: 'Verify mastery and explanation', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Activity mastered — achievement saved', exact: true })).toBeVisible();
      expect(state.mastered).toBe(true); expect(counts).toEqual({ keyReads: 2, modelCalls: 2 });
    } else {
      expect(challenge).toBeTruthy();
      const review = page.getByRole('region', { name: 'Show what you learned', exact: true }); await expect(review).toBeVisible();
      await expect(review.getByRole('button', { name: 'Check my choices', exact: true })).toBeDisabled();
      const first = challenge!.public.questions[0]!;
      const firstRadio = review.locator('fieldset').nth(0).getByRole('radio').nth(Number(challenge!.correct[first.id]));
      await firstRadio.focus(); await page.keyboard.press('Space'); await expect(firstRadio).toBeChecked();
      await review.getByRole('button', { name: 'Save my choices', exact: true }).click();
      await expect.poll(() => state.explanation.includes('visual-review-v1')).toBe(true); await page.reload(); await expect(firstRadio).toBeChecked();
      async function fillParts(wrong: boolean) {
        for (let index = 0; index < challenge!.public.groups!.length; index++) {
          const group = challenge!.public.groups![index]!;
          for (const [position, id] of group.questionIds.entries()) {
            const question = challenge!.public.questions.find(question => question.id === id)!;
            const choice = wrong && index === 1 && position === 0 ? question.choices.find(choice => !(challenge!.accepted?.[id] ?? [challenge!.correct[id]]).includes(choice.id))!.id : challenge!.correct[id];
            await review.locator('fieldset').nth(position).getByRole('radio').nth(Number(choice)).check();
          }
          if (index < challenge!.public.groups!.length - 1) { await review.getByRole('button', { name: 'Next part', exact: true }).click(); await expect(review.getByRole('radio').first()).toBeFocused(); }
        }
      }
      await fillParts(true); await review.getByRole('button', { name: 'Check my choices', exact: true }).click();
      await expect(page.getByText('Not quite yet.', { exact: false }).first()).toBeVisible(); expect(state.mastered).toBe(false);
      for (let index = challenge!.public.groups!.length - 1; index > 0; index--) await review.getByRole('button', { name: 'Previous part', exact: true }).click();
      await fillParts(false);
      for (const width of [1440, 820, 390]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `${directory}/review-${width}.png`, fullPage: true }); }
      await review.getByRole('button', { name: 'Check my choices', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Activity mastered — achievement saved', exact: true })).toBeVisible(); expect(state.mastered).toBe(true); expect(counts).toEqual({ keyReads: 0, modelCalls: 0 });
    }
    expect(state.hints).toEqual(history.hints); expect(state.assistedVariantIds).toEqual(history.assistedVariantIds);
    expect(state.tutorMessages.slice(0, history.tutorMessages.length)).toEqual(history.tutorMessages);
    await page.setViewportSize({ width: 390, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${directory}/outcome.png`, fullPage: true }); expect(errors).toEqual([]); expect(externalRequests).toBe(0);
    writeFileSync(`${directory}/result.json`, JSON.stringify({ passed: true, scenario, age, activity: activity.inventoryId, mastered: state.mastered, reviewComplete: state.completed.includes('review'), provider: counts, externalRequests, browserErrors: errors, memoryPersistenceOnly: true, authenticated: false, historyPreserved: true }, null, 2));
  } finally { delete holder.__reviewBrowser; if (privacyBefore === undefined) delete process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED; else process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED = privacyBefore; }
});
