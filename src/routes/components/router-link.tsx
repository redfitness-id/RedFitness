import { forwardRef } from 'react';
import { Link, LinkProps, parsePath, useLocation } from 'react-router-dom';
import { getCampaignSearch } from 'src/routes/campaign-search';

// ----------------------------------------------------------------------

interface RouterLinkProps extends Omit<LinkProps, 'to'> {
  href: string;
  preserveCampaignSearch?: boolean;
}

const RouterLink = forwardRef<HTMLAnchorElement, RouterLinkProps>(
  ({ href, preserveCampaignSearch = false, ...other }, ref) => {
    const { search } = useLocation();

    let to: LinkProps['to'] = href;

    if (preserveCampaignSearch && /^\/(?![\\/])/.test(href)) {
      const destination = parsePath(href);

      if (!destination.search) {
        to = { ...destination, search: getCampaignSearch(search) };
      }
    }

    return <Link ref={ref} to={to} {...other} />;
  }
);

export default RouterLink;
