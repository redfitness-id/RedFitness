// @ts-check
export const SITE_ORIGIN = 'https://www.redfitness.co.id';
export const SITE_NAME = 'RED FITNESS';
export const SITE_LOGO = `${SITE_ORIGIN}/logo/logo_full.svg`;
export const SOCIAL_IMAGE = `${SITE_ORIGIN}/logo/favicon.png`;

const publicPages = new Map([
  ['/', {
    title: 'RED FITNESS Indonesia | Gym, Personal Training & Classes',
    description: 'Explore RED FITNESS gym membership, personal training and group classes. Find a club and explore Pilates Performer and RED Seitai.',
  }],
  ['/membership', {
    title: 'Gym Membership | RED FITNESS Indonesia',
    description: 'Explore RED FITNESS gym membership and learn about facilities, group classes and personal training.',
  }],
  ['/personal-training', {
    title: 'Personal Training | RED FITNESS Indonesia',
    description: 'Learn how RED FITNESS personal training works, from fitness assessments and goal setting to personalized coaching.',
  }],
  ['/clubs', {
    title: 'Find a Gym Club | RED FITNESS Indonesia',
    description: 'Explore the RED FITNESS club directory to find gym locations and addresses.',
  }],
  ['/classes', {
    title: 'Group Fitness Classes | RED FITNESS Indonesia',
    description: 'Explore RED FITNESS group fitness classes and find class schedules by club.',
  }],
  ['/timetable', {
    title: 'Group Class Timetable | RED FITNESS Indonesia',
    description: 'Choose a RED FITNESS club and day to view its scheduled group fitness classes.',
  }],
  ['/highligth', {
    title: 'Highlights | RED FITNESS Indonesia',
    description: 'Explore highlights and featured activities from RED FITNESS Indonesia.',
  }],
  ['/career', {
    title: 'Careers | RED FITNESS Indonesia',
    description: 'Explore career areas and find application information at RED FITNESS Indonesia.',
  }],
  ['/pilates-performer', {
    title: 'Pilates Performer | RED FITNESS Indonesia',
    description: 'Explore Pilates Performer programs and learn about reformer Pilates at RED FITNESS.',
  }],
  ['/red-seitai', {
    title: 'RED Seitai Therapy | RED FITNESS Indonesia',
    description: 'Explore RED Seitai, a Japanese bodywork service, and learn about its treatment options.',
  }],
]);

/** @param {string} pathname */
export function getPublicMetadata(pathname) {
  // Match React Router's case-insensitive paths and optional trailing slash.
  const path = pathname.replace(/\/+$/, '').toLowerCase() || '/';
  const metadata = publicPages.get(path);

  return metadata ? { ...metadata, path, canonical: `${SITE_ORIGIN}${path}` } : undefined;
}

export function buildSitemap() {
  const urls = Array.from(publicPages.keys(), (path) => `  <url><loc>${SITE_ORIGIN}${path}</loc></url>`);

  return ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
