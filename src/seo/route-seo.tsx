import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
// eslint-disable-next-line import/extensions -- Explicit ESM path shared with Vite and Node.
import { getPublicMetadata, SITE_LOGO, SITE_NAME, SITE_ORIGIN, SOCIAL_IMAGE } from './routes.mjs';

const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: `${SITE_ORIGIN}/`,
  logo: SITE_LOGO,
};

export default function RouteSeo() {
  const { pathname } = useLocation();
  const metadata = getPublicMetadata(pathname);

  if (!metadata) {
    return (
      <Helmet>
        <meta name="robots" content="noindex" />
      </Helmet>
    );
  }

  const { title, description, canonical, path } = metadata;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={SOCIAL_IMAGE} />
      <meta property="og:image:alt" content="RED FITNESS logo" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={SOCIAL_IMAGE} />
      {path === '/' && <script type="application/ld+json">{JSON.stringify(organization)}</script>}
    </Helmet>
  );
}
