import { forwardRef } from 'react';
import { Link, LinkProps, useLocation } from 'react-router-dom';
import { getCampaignSearch } from '../campaign-search';

interface InquiryInfoLinkProps extends Omit<LinkProps, 'to'> {
  href: '/clubs' | '/personal-training';
}

const InquiryInfoLink = forwardRef<HTMLAnchorElement, InquiryInfoLinkProps>(({ href, ...props }, ref) => {
  const { search } = useLocation();

  return <Link ref={ref} to={{ pathname: href, search: getCampaignSearch(search) }} {...props} />;
});

export default InquiryInfoLink;
