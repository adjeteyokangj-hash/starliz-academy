import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { codingComponentStyles } from './coding-styles';
import { UNDERSTANDING_LOOPS, stageBrief } from '../../src/lib/coding/catalog';
import { assessCodingStage, deriveSkillStatus, freshEvidence } from '../../src/lib/coding/assessment';
import { parseCodingProgram, runCodingProgram } from '../../src/lib/coding/runner';
import { CODING_STAGES, stageUnlocked, type CodingStage, type CodingProgram } from '../../src/lib/coding/types';

// Actual production UI, accessible editing and native assessment functions.
// Fictional API persistence; not authenticated DB, live AI or runner acceptance.
test('all seven stages progress, resume and revisit without bypassing checks', async ({ page }) => {
  test.setTimeout(240000);
  const directory = `artifacts/coding-seven-stages/${randomUUID()}`; mkdirSync(directory, { recursive: true });
  const styles = await codingComponentStyles();
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `import React from'react';import{createRoot}from'react-dom/client';import Studio from'./src/components/coding/CodingLessonWorkspace';createRoot(document.getElementById('root')).render(<Studio lessonId="understanding-loops"/>);` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const programs = Object.fromEntries(UNDERSTANDING_LOOPS.stages.map(s => [s.stage, structuredClone(s.starter)])) as Record<CodingStage, CodingProgram>;
  let stage: CodingStage = 'discover', completed: CodingStage[] = [], evidence = freshEvidence();
  let feedback: string | null = null, run: ReturnType<typeof runCodingProgram> | null = null, runs = 0, saves = 0;
  const errors: string[] = [], visits: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const view = () => ({ lesson: UNDERSTANDING_LOOPS, stage, completedStages: completed, program: stage === 'review' ? programs.create : programs[stage], explainedProgram: programs.create.blocks.length ? programs.create : null, evidence, skillStatus: deriveSkillStatus(true, evidence), feedback, run: stage === 'review' && programs.create.blocks.length ? runCodingProgram(programs.create, stageBrief(UNDERSTANDING_LOOPS, 'create').goal) : run, teacherFeedback: null, hintCount: 0, attemptCount: runs, checksPassed: completed.length });
  await page.route('**/*', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/__seven-stages') return route.fulfill({ contentType: 'text/html', body: `<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script>${bundle.outputFiles[0]!.text.replaceAll('</script', '<\\/script')}</script></body></html>` });
    if (path.startsWith('/coding/blockly/')) return route.fulfill({ body: readFileSync(`public${path}`), contentType: path.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream' });
    if (path === '/api/student/coding/next') return route.fulfill({ json: { state: 'caught-up' } });
    if (path !== '/api/student/coding/lessons/understanding-loops') return route.abort();
    if (route.request().method() === 'GET') return route.fulfill({ json: { workspace: view() } });
    const body = route.request().postDataJSON(), requested = body.stage as CodingStage;
    if (!stageUnlocked(requested, completed)) return route.fulfill({ status: 400, json: { error: 'Finish the previous part of the lesson first.' } });
    if (body.action === 'open') { stage = requested; run = null; feedback = null; return route.fulfill({ json: { ok: true, workspace: view() } }); }
    if (body.action === 'save' || body.action === 'run') {
      const parsed = parseCodingProgram(body.program); if (!parsed.ok) return route.fulfill({ status: 400, json: { error: parsed.error } });
      programs[requested] = structuredClone(parsed.program);
      if (body.action === 'save') { saves++; stage = requested; return route.fulfill({ json: { ok: true, workspace: view() } }); }
    }
    const assessment = assessCodingStage({ lesson: UNDERSTANDING_LOOPS, stage: requested, program: requested === 'review' ? programs.create : programs[requested], evidence, predictionChoice: body.choiceId, explanation: body.explanation, revealingHints: 0 });
    feedback = assessment.feedback; run = assessment.run; evidence = assessment.evidence;
    if (body.action === 'run') runs++;
    stage = requested;
    if (assessment.passed && !completed.includes(requested)) {
      completed = [...completed, requested]; stage = CODING_STAGES[CODING_STAGES.indexOf(requested) + 1] ?? requested;
    }
    return route.fulfill({ json: { ok: true, passed: assessment.passed, feedback, run, runSource: 'learner', workspace: view() } });
  });
  const navigation = page.getByRole('region', { name: 'Stage navigation', exact: true });
  const tabs = page.getByRole('navigation', { name: 'Lesson stages', exact: true });
  async function current(expected: CodingStage) {
    await expect(tabs.locator('button[aria-current="step"]')).toContainText(stageBrief(UNDERSTANDING_LOOPS, expected).title, { timeout: 20000 });
    visits.push(expected);
  }
  async function capture(prefix: string) { await page.screenshot({ path: `${directory}/${prefix}-${stage}.png`, fullPage: true }); }
  async function actions() {
    const choice = page.getByText('Choose another way to edit', { exact: true });
    if (!await page.getByRole('button', { name: /^(Use accessible action controls|Open connected blocks)$/ }).isVisible()) await choice.click();
    const button = page.getByRole('button', { name: 'Use accessible action controls', exact: true });
    if (await button.isVisible()) await button.click();
  }
  async function addLoop(times: number, direction: 'right' | 'up') {
    await page.getByRole('button', { name: 'Add at the top', exact: true }).click();
    await page.getByRole('button', { name: 'Add repeat', exact: true }).click();
    await page.getByRole('spinbutton').last().fill(String(times));
    await page.getByRole('button', { name: 'Repeat', exact: true }).last().click();
    await page.getByRole('button', { name: `Move ${direction}`, exact: true }).click();
  }
  await page.goto('/__seven-stages'); await current('discover'); await capture('fresh');
  await expect(navigation.getByRole('button', { name: /Continue to Predict/ })).toBeDisabled();
  const locked = await page.evaluate(async () => (await fetch('/api/student/coding/lessons/understanding-loops', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'open', stage:'review' }) })).status);
  expect(locked).toBe(400);
  await page.getByRole('button', { name: 'I can see the goal — next', exact: true }).click(); await current('predict'); await capture('fresh');
  await page.getByRole('radio', { name: 'The character moves right once', exact: true }).check();
  await page.getByRole('button', { name: 'Check my prediction', exact: true }).click();
  await expect(navigation).toContainText('Not quite'); await current('predict');
  await expect(navigation.getByRole('button', { name: /Continue to Build together/ })).toBeDisabled();
  await page.getByRole('radio', { name: 'The character moves right three times', exact: true }).check();
  await page.getByRole('button', { name: 'Check my prediction', exact: true }).click(); await current('build'); await capture('fresh');
  await actions(); await addLoop(2, 'right'); await page.getByRole('button', { name:'Run my blocks', exact:true }).click();
  await current('build'); await expect(navigation.getByRole('button', { name:/Continue to Practise/ })).toBeDisabled();
  await page.getByRole('spinbutton').fill('4');
  await navigation.getByRole('button', { name:'Previous stage', exact:true }).click(); await current('predict');
  expect(saves).toBe(1); expect(programs.build.blocks[0]).toMatchObject({ kind:'repeat', times:4 });
  await navigation.getByRole('button', { name:/Continue to Build together/ }).click(); await current('build');
  await page.reload(); await current('build');
  await page.getByRole('button', { name:'Run my blocks', exact:true }).click(); await current('practise'); await capture('fresh');
  await expect(navigation).toContainText('Build together complete. You are now on Practise.');
  await expect(page.getByRole('region', { name:'My Program', exact:true })).toContainText('Your target for Practise');
  await actions(); await addLoop(3, 'up'); await page.getByRole('button', { name:'Run my blocks', exact:true }).click(); await current('debug'); await capture('fresh');
  await page.getByRole('button', { name:'Run my blocks', exact:true }).click(); await current('debug');
  await expect(navigation.getByRole('button', { name:/Continue to Create/ })).toBeDisabled();
  await page.getByRole('button', { name:'Remove', exact:true }).last().click();
  await page.getByRole('button', { name:'Repeat', exact:true }).click();
  await page.getByRole('button', { name:'Move right', exact:true }).click();
  await page.getByRole('button', { name:'Run my blocks', exact:true }).click(); await current('create'); await capture('fresh');
  await addLoop(2, 'right'); await addLoop(2, 'up'); await page.getByRole('button', { name:'Run my blocks', exact:true }).click(); await current('review'); await capture('fresh');
  const review = page.getByRole('region', { name:'Review your learning', exact:true });
  await review.getByRole('textbox').fill('My loops repeat a move right two times and a move up two times.');
  await review.getByRole('button', { name:'Send explanation', exact:true }).click();
  await expect(review.getByText('Lesson mastered — well done!', { exact:true })).toBeVisible();
  await expect(review.getByText('You’ve completed all currently available lessons.', { exact:true })).toBeVisible();
  await page.reload(); await current('review');
  const assessedRuns = runs;
  await tabs.getByRole('button', { name:/^Discover/ }).click();
  for (let i=0; i<CODING_STAGES.length; i++) {
    await current(CODING_STAGES[i]!); await capture('revisit');
    if (i<CODING_STAGES.length-1) {
      const button = navigation.getByRole('button', { name:new RegExp(`Continue to ${stageBrief(UNDERSTANDING_LOOPS,CODING_STAGES[i+1]!).title}`) });
      await expect(button).toBeEnabled(); await button.focus(); await page.keyboard.press('Enter');
    }
  }
  expect(runs).toBe(assessedRuns); expect(deriveSkillStatus(true,evidence)).toBe('mastered');
  for (const width of [1440,820,390]) {
    await page.setViewportSize({width,height:1100});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`${directory}/mastered-${width}.png`,fullPage:true});
  }
  expect(errors).toEqual([]);
  writeFileSync(`${directory}/result.json`,JSON.stringify({ freshSevenStages:true, lockedStageRejected:true, failedPredictionBlocked:true, failedBuildBlocked:true, failedDebugBlocked:true, draftSavedBeforeBack:true, resume:true, revisitedAllStagesWithoutRegrading:true, visits, runs, saves, browserErrors:errors, authenticatedDatabaseClaim:false },null,2));
  writeFileSync('artifacts/coding-seven-stages-reference.json',JSON.stringify({directory},null,2));
});
