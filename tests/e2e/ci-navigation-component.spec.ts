import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';

async function fixture(page: Page) {
  const state = { reply: { status: 401, body: {} as Record<string, unknown> }, requests: [] as Array<{ path: string; body: unknown; cookie: string }> };
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import Subscription from './src/app/subscription/page';import{StripeCheckoutButton}from'./src/components/billing/StripeCheckoutButton';
    import Soft from './src/components/paywall/SoftPaywallBanner';import Upgrade from './src/components/paywall/UpgradePrompt';
    import Reset from './src/components/parent/ResetChildLoginPanel';
    window.fixture={pushes:[],tracking:[],saved:[]};
    function App(){const[name,setName]=useState('existing-name'),[left,setLeft]=useState(2);const mode=new URLSearchParams(location.search).get('mode');
      if(mode==='subscription')return <Subscription/>;
      if(mode==='stripe')return <StripeCheckoutButton planId="plan-fixture" planKey="family"/>;
      if(mode==='parent')return <><button onClick={()=>setName('updated-name')}>Update supplied username</button><Reset childId="fixture-child" childName="Fictional child" currentUsername={name} onSuccess={x=>window.fixture.saved.push(x)} onCancel={()=>{}}/></>;
      return <><Soft sessionsLeft={left}/><Upgrade reason="limit"/><button onClick={()=>setLeft(3)}>More sessions</button></>;}
    createRoot(document.getElementById('root')).render(<App/>);` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'framework-fixtures', setup(api) {
      api.onResolve({ filter: /^(next\/navigation|next\/link|@\/components\/layout\/Navbar|@\/lib\/admin-tracking)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      api.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', resolveDir: process.cwd(), contents: args.path === 'next/navigation' ? 'export function useRouter(){return {push:href=>window.fixture.pushes.push(href)}}' : args.path === '@/lib/admin-tracking' ? 'export async function trackUsageEvent(e){window.fixture.tracking.push(e)}' : args.path === 'next/link' ? 'import React from "react";export default function Link(p){return React.createElement("a",p)}' : 'export default function Navbar(){return null}' }));
    } }] });
  await page.context().addCookies([{ name: 'fixture-session', value: 'retained', url: 'http://127.0.0.1:3000' }]);
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/__ci-navigation') return route.fulfill({ contentType: 'text/html', body: `<html><body><div id="root"></div><script>${bundle.outputFiles[0]!.text.replaceAll('</script', '<\\/script')}</script></body></html>` });
    if (url.hostname === 'checkout.stripe.test') return route.fulfill({ contentType: 'text/html', body: '<h1>External checkout fixture</h1>' });
    if (url.pathname === '/api/subscription') return route.fulfill({ json: { subscription: { status: 'active', pricingPlanId: 'existing-plan', planName: 'Existing', currentPricePence: 1000, currentCurrency: 'GBP', currentInterval: 'month', childrenUsed: 1, childLimit: 2, provider: 'stripe', badge: 'Active' }, accountCountry: 'GB', plans: [{ id: 'plan-fixture', name: 'Fixture plan', price: 20, currency: 'GBP', interval: 'month', audience: 'family', features: [], ctaLabel: 'Choose fixture plan', stripePriceId: 'price_fixture', isActive: true }] } });
    if (url.pathname === '/api/subscription/checkout' || url.pathname === '/api/billing/stripe/checkout') {
      state.requests.push({ path: url.pathname, body: request.postDataJSON(), cookie: request.headers().cookie ?? '' });
      return route.fulfill({ status: state.reply.status, json: state.reply.body });
    }
    if (url.pathname === '/api/parent/usernames/availability') return route.fulfill({ json: { available: false, valid: true, message: 'That fixture username is taken.', suggestions: ['free-fixture-name'] } });
    if (url.pathname === '/api/parent/children/fixture-child/reset-login') { state.requests.push({ path: url.pathname, body: request.postDataJSON(), cookie: request.headers().cookie ?? '' }); return route.fulfill({ json: { username: 'existing-name', temporaryPassword: 'synthetic-fixture-only' } }); }
    return route.abort();
  });
  return state;
}

test('paywall buttons keep their destinations and conditional visibility', async ({ page }) => {
  await fixture(page); await page.goto('/__ci-navigation');
  await page.getByRole('button', { name: 'Upgrade', exact: true }).click(); await page.getByRole('button', { name: 'Upgrade Now', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { fixture: { pushes: string[] } }).fixture.pushes)).toEqual(['/pricing', '/pricing']);
  await page.getByRole('button', { name: 'More sessions' }).click(); await expect(page.getByRole('button', { name: 'Upgrade', exact: true })).toHaveCount(0);
});

test('Stripe checkout keeps request/session, internal sign-up and external checkout navigation', async ({ page }) => {
  const state = await fixture(page); await page.goto('/__ci-navigation?mode=stripe');
  await page.getByRole('button', { name: 'Start with Stripe' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { fixture: { pushes: string[] } }).fixture.pushes)).toEqual(['/signup']);
  expect(state.requests[0]!.body).toEqual({ planKey: 'family', planId: 'plan-fixture' }); expect(state.requests[0]!.cookie).toContain('fixture-session=retained');
  state.reply = { status: 400, body: { error: 'Checkout fixture refused' } }; await page.reload(); await page.getByRole('button', { name: 'Start with Stripe' }).click(); await expect(page.getByText('Checkout fixture refused')).toBeVisible();
  state.reply = { status: 200, body: { url: 'https://checkout.stripe.test/session-fixture' } }; await page.reload(); await page.getByRole('button', { name: 'Start with Stripe' }).click();
  await expect(page).toHaveURL('https://checkout.stripe.test/session-fixture'); await expect(page.getByRole('heading', { name: 'External checkout fixture' })).toBeVisible();
});

test('subscription checkout keeps country, 401 handling, errors and both external URL response shapes', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/__ci-navigation?mode=subscription'); await page.getByRole('button', { name: 'Choose fixture plan' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { fixture: { pushes: string[] } }).fixture.pushes)).toEqual(['/signup']);
  expect(state.requests[0]!.body).toEqual({ planId: 'plan-fixture', countryCode: 'GB' }); expect(state.requests[0]!.cookie).toContain('fixture-session=retained');
  state.reply = { status: 400, body: { error: 'Subscription fixture refused' } }; await page.reload(); await page.getByRole('button', { name: 'Choose fixture plan' }).click(); await expect(page.getByText('Subscription fixture refused')).toBeVisible();
  for (const body of [{ checkoutUrl: 'https://checkout.stripe.test/preferred', url: 'https://checkout.stripe.test/unused' }, { url: 'https://checkout.stripe.test/fallback' }]) {
    state.reply = { status: 200, body }; await page.goto('/__ci-navigation?mode=subscription'); await page.getByRole('button', { name: 'Choose fixture plan' }).click(); await expect(page).toHaveURL(body.checkoutUrl ?? body.url);
  }
});

test('committed reset form retains existing-username, availability and prop synchronization behaviour', async ({ page }) => {
  await fixture(page); await page.goto('/__ci-navigation?mode=parent'); await page.getByRole('button', { name: 'Set manually' }).click();
  await expect(page.getByText('Keeping the current username.')).toBeVisible();
  const username = page.getByRole('textbox', { name: 'Username', exact: true }); await expect(username).toHaveValue('existing-name');
  await username.fill('taken-fixture'); await expect(page.getByText('That fixture username is taken.')).toBeVisible(); await expect(page.getByRole('button', { name: 'Reset Login', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'free-fixture-name', exact: true }).click(); await expect(username).toHaveValue('free-fixture-name');
  await page.getByRole('button', { name: 'Update supplied username' }).click(); await expect(username).toHaveValue('updated-name'); await expect(page.getByText('Keeping the current username.')).toBeVisible();
  await username.fill('a'); await expect(page.getByText('Keeping the current username.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Generate new password' }).click(); await expect(username).toHaveCount(0);
});
