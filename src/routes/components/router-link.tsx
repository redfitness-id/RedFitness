import { forwardRef } from 'react';
import { Link, LinkProps, parsePath, useLocation } from 'react-router-dom';

// ----------------------------------------------------------------------

interface RouterLinkProps extends Omit<LinkProps, 'to'> {
  href: string;
  preserveSearch?: boolean;
}

const RouterLink = forwardRef<HTMLAnchorElement, RouterLinkProps>(
  ({ href, preserveSearch = false, ...other }, ref) => {
    const { search } = useLocation();

    const destination = parsePath(href);
    const to = preserveSearch && !destination.search ? { ...destination, search } : href;

    return <Link ref={ref} to={to} {...other} />;
  }
);

export default RouterLink;
