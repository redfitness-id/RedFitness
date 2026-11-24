const assert = require('node:assert/strict');
const { chromium } = require('playwright');
// Run against a local production preview built with VITE_SUPABASE_URL=https://fixture.invalid.
const base = new URL(process.env.SEO_PREVIEW_URL || 'http://127.0.0.1:4198').origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const withFix01 = process.env.SEO_WITH_FIX01 === '1';
const campaign = '?utm_source=fixture&gclid=fixture';
(async () => {
  for (const path of ['/', '/membership', '/personal-training', '/clubs']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.match(html, /<title>RED FITNESS Indonesia<\/title>/, path);
    assert.match(html, /name="description"/, path);
    assert.doesNotMatch(html, /rel="canonical"|property="og:|name="twitter:|application\/ld\+json/, path);
  }
  for (const path of ['/rf-admin/login', '/random-seo01-unlisted']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.doesNotMatch(await response.text(), /name="robots"/, path);
  }
  const sitemap = await fetch(`${base}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get('content-type'), /xml/);
  assert.match(await sitemap.text(), /<urlset /);
  const robots = await fetch(`${base}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get('content-type'), /text\/plain/);
  assert.ok((await robots.text()).includes('Sitemap: https://www.redfitness.co.id/sitemap.xml'));

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
        canonicals: document.querySelectorAll('link[rel=canonical]').length,
        ogTitles: document.querySelectorAll('meta[property="og:title"]').length,
        twitterTitles: document.querySelectorAll('meta[name="twitter:title"]').length,
        imageSize: ['width', 'height'].map(
          dimension => document.querySelector(`meta[property="og:image:${dimension}"]`)?.content
        ),
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
        assert.equal(h.canonicals,1,path);
        assert.equal(h.ogTitles,1,path);
        assert.equal(h.twitterTitles,1,path);
        assert.deepEqual(h.imageSize,['512','512'],path);
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
      const nonpublic = ['/rf-admin/login', '/rf-admin/registrations', '/random-seo01-unlisted'];
      if (!withFix01) nonpublic.push('/login', '/join/payment', '/dashboard');
      for (const path of nonpublic) {
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
      if (withFix01) {
        const redirects = {
          '/dashboard': '/membership',
          '/join': '/membership',
          '/join/select-club': '/membership',
          '/join/select-plan': '/membership',
          '/join/details': '/membership',
          '/join/payment': '/membership',
          '/login': '/',
        };
        for (const [source, target] of Object.entries(redirects)) {
          const response = await open(`${source}${campaign}&email=fixture%40example.invalid&token=fixture&next=%2Fjoin&nonce=fixture`);
          assert.equal(response.status(),200,source);
          await page.waitForURL(base + target + campaign);
          await page.waitForFunction(canonical => document.querySelector('link[rel=canonical]')?.href === canonical,
            `https://www.redfitness.co.id${target}`);
          const h = await head();
          assert.equal(h.robots,undefined,source);
          assert.equal(h.canonicals,1,source);
          assert.equal(h.descriptions.length,1,source);
          assert.equal(h.ogTitles,1,source);
          assert.equal(h.twitterTitles,1,source);
        }
        await open(`/${campaign}&token=fixture`);
        await page.getByRole('link',{name:'View Membership',exact:true}).first().click();
        await page.waitForURL(`${base}/membership${campaign}`);
        await page.waitForFunction(() => document.title.startsWith('Gym Membership'));
        const headerClub = page.locator('header').getByRole('link',{name:'Club Finder'});
        assert.equal(await headerClub.getAttribute('href'), `/clubs${campaign}`);
        // External icons are blocked by the fixture. Exercise the visible footer
        // link for the same destination and check the header target separately.
        await page.locator('footer').getByRole('link',{name:'Club Finder',exact:true}).click();
        await page.waitForURL(`${base}/clubs${campaign}`);
        await page.waitForFunction(() => document.title.startsWith('Find a Gym Club'));
      }

      // Simulate a browser-history transition so the same mounted head manager
      // must clear the previous page's metadata, including the document title.
      await open('/membership');
      await page.waitForFunction(() => document.title.startsWith('Gym Membership'));
      await page.evaluate(() => {
        const args = [null, '', '/rf-admin/login'];
        window.history.pushState(...args);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      await page.locator('meta[name=robots]').waitFor({state:'attached'});
      const admin = await head();
      assert.equal(admin.title,'RED FITNESS Indonesia');
      assert.equal(admin.canonicals,0);
      assert.equal(admin.descriptions.length,0);
      assert.equal(admin.ogTitles,0);
      assert.equal(admin.twitterTitles,0);
      await page.goBack({waitUntil:'domcontentloaded'});
      await page.waitForFunction(() => document.title.startsWith('Gym Membership'));
      assert.equal((await head()).robots,undefined);
      console.log(`PASS ${width}px: 10 public pages, metadata/canonicals, H1s, nonpublic noindex, unknown routes, SPA metadata reset and restore${withFix01 ? ' and FIX-01 redirects/CTA allowlisting' : ''}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
