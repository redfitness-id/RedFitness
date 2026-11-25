import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildSitemap, getPublicMetadata, SITE_ORIGIN } from '../src/seo/routes.mjs';

const publicPaths = [
  '/', '/membership', '/personal-training', '/clubs', '/classes', '/timetable',
  '/highligth', '/career', '/pilates-performer', '/red-seitai',
];

test('sitemap contains exactly the confirmed public canonical URLs once', () => {
  const sitemap = buildSitemap();
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">\n/);
  assert.match(sitemap, /<\/urlset>\n$/);
  const urls = [...sitemap.matchAll(/<url><loc>([^<]+)<\/loc><\/url>/g)].map((match) => match[1]);
  assert.deepEqual(urls, publicPaths.map((path) => SITE_ORIGIN + path));
  assert.equal(new Set(urls).size, publicPaths.length);
});

test('robots declares the sitemap and permits discovery of noindex pages', () => {
  const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8');
  assert.deepEqual(robots.trim().split(/\n+/), [
    'User-agent: *',
    'Disallow:',
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
  ]);
});

test('public routes have distinct titles, descriptions, and clean canonicals', () => {
  const metadata = publicPaths.map((path) => getPublicMetadata(path));
  for (const [index, page] of metadata.entries()) {
    assert.equal(page.canonical, SITE_ORIGIN + publicPaths[index]);
    assert.ok(page.title);
    assert.ok(page.description);
  }
  assert.equal(new Set(metadata.map((page) => page.title)).size, publicPaths.length);
  assert.equal(new Set(metadata.map((page) => page.description)).size, publicPaths.length);
  assert.deepEqual(getPublicMetadata('/Clubs/'), getPublicMetadata('/clubs'));
  const campaignUrl = new URL('/membership/?utm_source=fixture&gclid=fixture#info', SITE_ORIGIN);
  assert.equal(getPublicMetadata(campaignUrl.pathname).canonical, `${SITE_ORIGIN}/membership`);
});

test('admin, legacy, errors, and unknown routes have no public metadata', () => {
  for (const path of ['/rf-admin', '/rf-admin/login', '/rf-admin/registrations',
    '/dashboard', '/join/payment', '/login', '/404', '/maintenance', '/clubs/unlisted', '/unknown']) {
    assert.equal(getPublicMetadata(path), undefined, path);
  }
});
