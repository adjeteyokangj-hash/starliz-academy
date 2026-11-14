import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { codingComponentStyles } from './coding-styles';

test('collapsing the guide gives its column to the editor without losing work or outputs', async ({ page }) => {
  test.setTimeout(180000);
  const directory = 'artifacts/coding-canvas-room-2026-11-04'; mkdirSync(directory, { recursive: true });
  const styles = await codingComponentStyles();
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import Frame from'./src/components/coding/CodingStudioFrame';import Blocks from'./src/components/coding/BlockCommandsEditor';import*as B from'blockly/core';window.blocksApi=B;function App(){const year=Number(new URLSearchParams(location.search).get('year')||1);const[commands,setCommands]=useState([{id:'move',kind:'move',direction:'right'}]);const[draft,setDraft]=useState('');return <Frame year={year} beginner={year===4} learning={<><h3>Lesson instructions</h3><details data-studio-tutor><summary>StarLiz AI tutor</summary><label>Tutor question<textarea/></label></details></>} outputs={<><section aria-label="Lesson Example"><h2>Lesson Example</h2><button>Replay Example</button></section><section aria-label="My Program"><h2>My Program</h2><button>Replay My Program</button></section></>}><label>My draft<input value={draft} onChange={e=>setDraft(e.target.value)}/></label><Blocks year={year} legacy commands={commands} onChange={setCommands}/></Frame>}createRoot(document.getElementById('root')).render(<App/>);` }, bundle:true, write:false, platform:'browser', format:'iife', jsx:'automatic', define:{'process.env.NODE_ENV':'"production"'} });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/__collapse') return route.fulfill({ contentType:'text/html', body:`<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root" style="padding:16px"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script>${bundle.outputFiles[0]!.text.replaceAll('</script','<\\/script')}</script></body></html>` });
    if (path.startsWith('/coding/blockly/')) return route.fulfill({ body:readFileSync(`public${path}`), contentType:path.endsWith('.svg')?'image/svg+xml':'application/octet-stream' });
    return route.abort();
  });
  const measurements: object[] = [];
  for (const year of [1,4,6,8,11]) {
    await page.setViewportSize({ width:1440, height:1000 });
    await page.goto(`/__collapse?year=${year}`);
    await expect(page.locator('.blocklySvg')).toBeVisible({ timeout:30000 });
    await page.getByRole('textbox', {name:'My draft', exact:true}).fill('Keep my program');
    const workspaceId = await page.evaluate(() => (window as unknown as {blocksApi: {getMainWorkspace(): {id:string}}}).blocksApi.getMainWorkspace().id);
    const canvas = page.locator('.blocklySvg');
    await expect.poll(async () => (await canvas.boundingBox())!.height).toBe(600);
    await page.getByRole('button',{name:'More room',exact:true}).click();
    await expect.poll(async () => (await canvas.boundingBox())!.height).toBe(800);
    await page.getByRole('button',{name:'Fit blocks',exact:true}).click();
    await expect(page.getByRole('slider',{name:'Workspace height',exact:true})).toHaveValue('800');
    await expect.poll(async () => (await canvas.boundingBox())!.height).toBe(800);
    if(year===1)await page.screenshot({path:`${directory}/taller-canvas.png`,fullPage:true});
    const heightControl=page.getByRole('slider',{name:'Workspace height',exact:true});
    await heightControl.focus();await page.keyboard.press('End');
    await expect.poll(async () => (await canvas.boundingBox())!.height).toBe(1200);
    await expect(page.getByRole('button',{name:'More room',exact:true})).toBeDisabled();
    await page.keyboard.press('Home');
    await expect.poll(async () => (await canvas.boundingBox())!.height).toBe(400);
    await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await canvas.boundingBox())!.height).toBe(600);
    for (const width of [1440,1024,768,390]) {
      await page.setViewportSize({width,height:1000});
      const editor = page.locator('.studio-editor');
      const before = (await editor.boundingBox())!;
      expect(before.width).toBeGreaterThan(width - 40);
      const collapse = page.getByText("Instructions", { exact: true });
      await collapse.click();
      await expect(page.getByRole("heading", { name: "Lesson instructions" })).toBeVisible();
      await collapse.focus(); await page.keyboard.press('Enter');
      const reopen = collapse;

      await expect(page.getByRole('heading',{name:'Lesson instructions'})).toBeHidden();
      await expect.poll(async () => (await editor.boundingBox())!.width).toBeCloseTo(before.width, 0);
      const after = (await editor.boundingBox())!;
      await expect(page.getByRole('textbox',{name:'My draft',exact:true})).toHaveValue('Keep my program');
      await expect(page.getByRole('region',{name:'Lesson Example',exact:true})).toBeVisible();
      await expect(page.getByRole('region',{name:'My Program',exact:true})).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      expect(await page.evaluate(() => (window as unknown as {blocksApi: {getMainWorkspace(): {id:string}}}).blocksApi.getMainWorkspace().id)).toBe(workspaceId);
      if(year===1) await page.screenshot({path:`${directory}/collapsed-${width}.png`,fullPage:true});
      measurements.push({year,width,editorBefore:before.width,editorAfter:after.width});
      await reopen.click();
      await expect(page.getByRole('heading',{name:'Lesson instructions'})).toBeVisible();
      await reopen.click();
    }
    await page.getByRole('button',{name:year===4?'Ask AI for help':'Expand AI tutor',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'Tutor question',exact:true})).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button',{name:'Close tutor',exact:true})).toHaveCount(0);
  }
  expect(errors).toEqual([]);
  writeFileSync(`${directory}/result.json`,JSON.stringify({passed:true,measurements,blocklyWorkspacePreserved:true,draftPreserved:true,independentOutputsVisible:true,tutorReopens:true,browserErrors:errors},null,2));
});
