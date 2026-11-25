const CAMPAIGN_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_id',
  'utm_term',
  'utm_content',
  'utm_source_platform',
  'utm_creative_format',
  'utm_marketing_tactic',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
  'ttclid',
]);

export function getCampaignSearch(search: string): string {
  const campaign = new URLSearchParams();

  new URLSearchParams(search).forEach((value, name) => {
    if (CAMPAIGN_PARAMS.has(name)) {
      campaign.append(name, value);
    }
  });

  const query = campaign.toString();
  return query ? `?${query}` : '';
}
