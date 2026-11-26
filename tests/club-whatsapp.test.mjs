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

test('maps all Marketing numbers and limits Pilates to the four eligible clubs', () => {
  const expected = {
    'Taman Palem': '6287717717731',
    Bogor: '6287717717735',
    'Kramat Jati': '6287717717760',
    Cileungsi: '6287717717743',
    Tambun: '6287717717702',
    'Citra 8 JKT': '6281717717706',
    'Green Pramuka Square': '6287717717785',
    'Graha Raya Bintaro': '6287817717738',
  };
  for (const [service, label] of [['membership', 'Membership'], ['personalTraining', 'Personal Training']]) {
    const clubs = eligibleClubs(service);
    assert.deepEqual(clubs.map(club => club.name), Object.keys(expected));
    for (const club of clubs) {
      const url = new URL(whatsappUrl(club, service));
      assert.equal(url.pathname, '/' + expected[club.name]);
      assert.equal(url.searchParams.get('text'), `Halo RED FITNESS ${club.name}, saya ingin mendapatkan informasi mengenai ${label}.`);
    }
  }
  const pilates = eligibleClubs('pilates');
  assert.deepEqual(pilates.map(club => club.name), [
    'Cileungsi', 'Citra 8 JKT', 'Green Pramuka Square', 'Graha Raya Bintaro',
  ]);
  for (const club of pilates) {
    const url = new URL(whatsappUrl(club, 'pilates'));
    assert.equal(url.pathname, '/' + expected[club.name]);
    assert.ok(url.searchParams.get('text').endsWith('Pilates Performer.'));
  }
});
