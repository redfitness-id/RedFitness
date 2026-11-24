const assert = require('node:assert/strict');
const { chromium } = require('playwright');
// Run against a local production preview built with VITE_SUPABASE_URL=https://fixture.invalid.
const base = new URL(process.env.SEO_PREVIEW_URL || 'http://127.0.0.1:4198').origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.SEO_CHROMIUM_PATH });
  try {
    const paths = ['/', '/membership', '/personal-training', '/clubs', '/classes', '/timetable',
      '/highligth', '/career', '/pilates-performer', '/red-seitai'];
    for (const width of [1440,390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 600, reducedMotion: 'reduce' });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === base && route.request().method() === 'GET') return route.continue();
        if (url.hostname === 'fixture.invalid') {
          const object = route.request().headers().accept?.includes('vnd.pgrst.object');
          return route.fulfill({ json: object ? null : [] });
        }
        return route.abort();
      });
      const page = await context.newPage();
      const open = path => page.goto(base + path, { waitUntil: 'domcontentloaded' });
      const head = async () => page.evaluate(() => ({
        canonical: document.querySelector('link[rel=canonical]')?.href,
        descriptions: Array.from(document.querySelectorAll('meta[name=description]'), tag => tag.content),
        ogUrl: document.querySelector('meta[property="og:url"]')?.content,
        ogTitle: document.querySelector('meta[property="og:title"]')?.content,
        title: document.title,
        robots: document.querySelector('meta[name=robots]')?.content,
        schema: document.querySelector('script[type="application/ld+json"]')?.textContent,
        lang: document.documentElement.lang,
        viewport: document.querySelector('meta[name=viewport]').content,
      }));
      for (const path of paths) {
        const canonical = 'https://www.redfitness.co.id' + path;
        await open(path);
        await page.locator('link[rel=canonical]').waitFor({ state:'attached' });
        await page.locator('main h1').first().waitFor({ state:'attached' });
        const h = await head();
        assert.equal(h.lang,'en',path);
        assert.equal(h.canonical,canonical,path);
        assert.equal(h.ogUrl,canonical,path);
        assert.equal(h.ogTitle,h.title,path);
        assert.equal(h.descriptions.length,1,path);
        assert.equal(h.robots,undefined,path);
        assert.equal(h.viewport.includes('maximum-scale'),false,path);
        assert.equal(await page.locator('main h1').count(),1,path);
        if (path === '/') assert.equal(JSON.parse(h.schema)['@type'],'Organization');
        else assert.equal(h.schema,undefined,path);
      }
      await open('/clubs/?utm_source=fixture&gclid=fixture#visit');
      await page.locator('link[rel=canonical]').waitFor({ state:'attached' });
      assert.equal((await head()).canonical,'https://www.redfitness.co.id/clubs');
      assert.ok(page.url().includes('utm_source=fixture'));
      for (const path of ['/rf-admin/login', '/rf-admin/registrations', '/login', '/join/payment', '/dashboard', '/random-seo01-unlisted']) {
        const response = await open(path);
        await page.locator('meta[name=robots]').waitFor({state:'attached'});
        assert.equal(response.status(),200,path); // local and current host serve a SPA shell.
        const h = await head();
        assert.equal(h.robots,'noindex',path);
        assert.equal(h.canonical,undefined,path);
        assert.equal(h.ogUrl,undefined,path);
        if (path === '/dashboard' || path === '/random-seo01-unlisted') {
          await page.getByRole('heading',{name:'Sorry, Page Not Found!'}).waitFor({state:'attached'});
          assert.equal(new URL(page.url()).pathname,path);
          await page.getByRole('link',{name:'Go to Home'}).click();
          await page.waitForURL(base + '/');
          await page.locator('link[rel=canonical]').waitFor({state:'attached'});
          assert.equal((await head()).robots,undefined);
        }
      }
      console.log(`PASS ${width}px: 10 public pages, metadata/canonicals, H1s, nonpublic noindex, unknown routes, SPA return to home`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
