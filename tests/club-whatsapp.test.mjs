import assert from 'node:assert/strict';
import test from 'node:test';
import { eligibleClubs, normalizePhone, whatsappUrl } from '../src/sections/clubs/whatsapp-routing.ts';

const fixture = { name: 'Fixture Club', phone: '0812 0000 0000', active: true, services: ['membership'] };

test('normalizes Indonesian mobile formats and rejects invalid values', () => {
  assert.equal(normalizePhone('0812 0000 0000'), '6281200000000');
  assert.equal(normalizePhone('+62 (812) 0000-0000'), '6281200000000');
  assert.equal(normalizePhone('6281200000000'), '6281200000000');
  for (const value of ['', '0812', '+65 81200000', '081200000000 ext 9']) {
    assert.equal(normalizePhone(value), null);
  }
});

test('filters inactive, unsupported, and invalid fixture routes', () => {
  const contacts = [fixture, { ...fixture, active: false }, { ...fixture, phone: 'invalid' }];
  assert.deepEqual(eligibleClubs('membership', contacts), [fixture]);
  assert.deepEqual(eligibleClubs('pilates', contacts), []);
  assert.equal(whatsappUrl(fixture, 'pilates'), null);
  assert.equal(whatsappUrl({ ...fixture, active: false }, 'membership'), null);
});

test('encodes an inquiry message and keeps the original number intact', () => {
  const url = new URL(whatsappUrl(fixture, 'membership'));
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.pathname, '/6281200000000');
  assert.equal(url.searchParams.get('text'), 'Halo RED FITNESS Fixture Club, saya ingin mendapatkan informasi mengenai Membership.');
  assert.equal(fixture.phone, '0812 0000 0000');
});
