const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const origin = new URL(process.env.UX_TEST_URL || 'http://127.0.0.1:4220').origin;
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const campaign = '?utm_source=fixture&utm_medium=cpc&gclid=fixture&fbclid=social';
const incoming = campaign + '&email=fixture%40example.invalid&token=fixture&next=%2Fjoin';
const clubs = [
  { id: '12345678-1234-4567-9abc-123456789abc', name: 'Fixture Central', city: 'North', address: '1 Test Road' },
  { id: '98765432-4321-4321-abcd-123456789abc', name: 'Fixture South', city: 'South', address: '2 Sample Street' },
  { id: '11111111-1111-4111-8111-111111111111', name: 'Fixture Unlisted', city: 'North', address: '' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.UX_CHROMIUM_PATH });
  try {
    for (const width of [1440, 390, 320]) {
      const context = await browser.newContext({
        viewport: { width, height: 740 }, isMobile: width < 600, reducedMotion: 'reduce',
      });
      let submissions = 0;
      const blockedAnalytics = [];
      await context.route('**/*', (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === origin && request.method() === 'GET') return route.continue();
        if (url.hostname === 'fixture.invalid') {
          const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, accept-profile',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          };
          if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
          if (url.pathname.includes('/functions/v1/send-registration-email')) {
            submissions += 1;
            return route.fulfill({ headers, json: width === 320 ? {} : { success: true } });
          }
          if (url.pathname.endsWith('/clubs')) return route.fulfill({ headers, json: clubs });
          const object = request.headers().accept?.includes('vnd.pgrst.object');
          return route.fulfill({ headers, json: object ? null : [] });
        }
        if (/googletagmanager|google-analytics/.test(url.hostname)) blockedAnalytics.push(url.origin);
        return route.abort();
      });
      const page = await context.newPage();
      const open = (path) => page.goto(origin + path + incoming, { waitUntil: 'domcontentloaded' });
      const link = (name) => page.locator('main').getByRole('link', { name, exact: true }).first();
      const visitSection = async (label, id) => {
        await link(label).click();
        assert.equal(new URL(page.url()).hash, '#' + id);
        assert.equal(await page.locator(`[id="${id}"]`).count(), 1);
        assert.equal(new URL(page.url()).search, incoming);
      };

      await open('/membership');
      assert.equal(await page.locator('main').getByRole('button', { name: /try now|check out now/i }).count(), 0);
      assert.equal(await link('View Club Directory').getAttribute('href'), '/clubs' + campaign);
      await link('Explore Personal Training').click();
      await page.waitForURL(origin + '/personal-training' + campaign);
      await open('/personal-training');
      await visitSection('View PT Location Information', 'pt-inquiry-options');
      assert.equal(await page.locator('main input[type=email]').count(), 0);
      assert.equal(await link('View Club Directory').getAttribute('href'), '/clubs' + campaign);

      await open('/pilates-performer');
      await visitSection('Explore Pilates Programs', 'pilates-programs');
      assert.equal(await page.getByRole('button', { name: 'Start Your Program', exact: true }).count(), 0);
      assert.equal(await link('View Club Directory').getAttribute('href'), '/clubs' + campaign);

      await open('/red-seitai');
      await visitSection('Explore Treatments', 'seitai-treatments');
      assert.equal(await page.getByRole('button', { name: 'Book a Session', exact: true }).count(), 0);
      await link('View Club Directory').click();
      await page.waitForURL(origin + '/clubs' + campaign);
      await page.getByText('Fixture Central', { exact: true }).waitFor();
      await page.getByText(/does not confirm service availability/).waitFor();
      assert.equal(await page.locator('main').getByRole('button', { name: /virtual tour|claim free trial|get proposal/i }).count(), 0);
      const map = page.getByRole('link', { name: /address of Fixture Central on Google Maps/ });
      const mapUrl = new URL(await map.getAttribute('href'));
      assert.equal(mapUrl.origin, 'https://www.google.com');
      assert.equal(mapUrl.pathname, '/maps/search/');
      assert.deepEqual([...mapUrl.searchParams], [['api', '1'], ['query', '1 Test Road']]);
      assert.equal(await map.getAttribute('rel'), 'noopener noreferrer');
      assert.equal(await page.getByRole('link', { name: /address of Fixture Unlisted on Google Maps/ }).count(), 0);
      const search = page.getByRole('searchbox', { name: 'Search club locations' });
      await search.fill('sample street');
      await page.getByText('Fixture South', { exact: true }).waitFor();
      assert.equal(await page.getByText('Fixture Central', { exact: true }).count(), 0);
      await search.fill('unlisted');
      await page.getByText('No clubs match your search.').waitFor();

      await open('/membership');
      const toggle = page.getByRole('button', { name: 'TRY US FOR FREE', exact: true });
      await toggle.focus();
      await page.keyboard.press('Enter');
      const panel = page.getByRole('region', { name: 'Free Trial' });
      await panel.waitFor();
      const bounds = await panel.evaluate((element) => ({
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
        bottom: element.getBoundingClientRect().bottom,
        vw: document.documentElement.clientWidth,
        vh: window.innerHeight,
      }));
      assert.ok(bounds.left >= 0 && bounds.right <= bounds.vw + 1 && bounds.bottom <= bounds.vh + 1, JSON.stringify(bounds));
      await panel.getByRole('button', { name: 'Close free trial' }).click();
      assert.equal(await toggle.evaluate((element) => element === document.activeElement), true);
      await toggle.click();
      await panel.getByLabel('First Name *', { exact: true }).fill('Fixture');
      const email = panel.getByLabel('Email *', { exact: true });
      await email.fill('fixture@example.invalid');
      const register = panel.getByRole('button', { name: 'Register Now', exact: true });
      await register.click();
      if (width === 320) {
        await panel.getByRole('alert').filter({ hasText: 'may already have been received' }).waitFor();
        assert.equal(await register.isDisabled(), true);
        assert.equal(await email.inputValue(), 'fixture@example.invalid');
      } else {
        await panel.getByText("You're Registered!", { exact: true }).waitFor();
      }
      assert.equal(submissions, 1);
      assert.deepEqual(blockedAnalytics, []);
      console.log(`PASS ${width}px: informational service paths, campaign filtering, club search, keyboard/mobile trial and one synthetic request`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
