const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const fixture = new URL(process.env.MKT_TEST_URL || 'http://127.0.0.1:4293');
  assert.ok(['127.0.0.1', 'localhost'].includes(fixture.hostname));
  const browser = await chromium.launch({ executablePath: process.env.MKT_CHROMIUM_PATH });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const origin = 'https://www.redfitness.co.id';
    const loaders = [];
    let attempts = 0;
    await context.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.origin === origin && route.request().method() === 'GET') {
        const response = await route.fetch({url:fixture.origin + u.pathname + u.search, maxRedirects: 0});
        return route.fulfill({response});
      }
      if (u.origin === 'https://www.googletagmanager.com' && u.pathname === '/gtm.js') {
        loaders.push(u.searchParams.get('id'));
        return route.fulfill({contentType:'application/javascript',body:''});
      }
      if (u.hostname === 'fixture.invalid') {
        const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'};
        if (route.request().method() === 'OPTIONS') return route.fulfill({headers,status:204});
        if (u.pathname === '/functions/v1/send-registration-email') {
          attempts++;
          return route.fulfill({headers,json:{success:true}});
        }
        return route.fulfill({headers,json:route.request().headers().accept?.includes('vnd.pgrst.object')?null:[]});
      }
      return route.abort();
    });
    const page=await context.newPage();
    const items=()=>page.evaluate(()=>window.dataLayer?.filter(e=>typeof e.event==='string') ?? []);
    await page.goto(origin + '/?email=secret%40example.invalid');
    const allow=page.getByRole('button',{name:'Allow analytics'});
    const decline=page.getByRole('button',{name:'Decline analytics'});
    await decline.click();
    assert.deepEqual(await items(),[]);
    assert.deepEqual(loaders,[]);
    await allow.click();
    await allow.click();
    await page.waitForFunction(()=>window.dataLayer?.some(e=>e.event==='page_view'));
    await page.getByLabel('Email Address *',{exact:true}).fill('trial@example.invalid');
    await page.getByLabel('First Name *',{exact:true}).first().fill('Synthetic Tester');
    await page.getByRole('button',{name:'Claim My Free Week',exact:true}).click();
    await page.waitForFunction(()=>window.dataLayer.some(e=>e.event==='free_trial_submit_success'));
    assert.equal(attempts,1);
    await page.locator('header').getByRole('link',{name:'Club Finder',exact:true}).click();
    await page.waitForURL(/\/clubs/);
    const controls=page.getByRole('heading',{name:'Hubungi Klub via WhatsApp'}).locator('..').locator('[aria-haspopup=listbox]');
    await controls.nth(0).click();
    await page.getByRole('option',{name:'Pilates Performer',exact:true}).click();
    await controls.nth(1).click();
    await page.getByRole('option',{name:'Citra 8 JKT',exact:true}).click();
    await page.evaluate(()=>document.addEventListener('click',e=>{if(e.target.closest('a[href^="https://wa.me/"]'))e.preventDefault();},true));
    const whatsapp=page.getByRole('link',{name:'Buka WhatsApp'});
    await whatsapp.click();
    const events=await items();
    assert.deepEqual(loaders,['GTM-KZL3DGV9']);
    assert.deepEqual(events.filter(e=>e.event==='page_view').map(e=>e.page_path),['/','/clubs']);
    const clicks=events.filter(e=>e.event==='whatsapp_click');
    assert.equal(clicks.length,1);
    const {club,service,page_path}=clicks[0];
    assert.deepEqual([club,service,page_path],['Citra 8 JKT','Pilates Performer','/clubs']);
    assert.equal(events.filter(e=>e.event==='free_trial_submit_success').length,1);
    assert.equal(events.filter(e=>e.event==='generate_lead').length,0);
    assert.doesNotMatch(JSON.stringify(events),/example\.invalid|Synthetic Tester|6281717717706|wa\.me/);
    await decline.click();
    await whatsapp.click();
    assert.deepEqual(await items(),events);
    console.log('PASS enabled build: default denied, one loader, two SPA page views, one mocked success and one safe WhatsApp click, withdrawal stops events');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
