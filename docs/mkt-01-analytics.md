# MKT-01 measurement contract

## Findings

| Status | Finding |
|---|---|
| Verified | The inspected repository entry HTML and active React code had no GA4, GTM, Meta Pixel, or consent integration. BrowserRouter handles links without full loads. Counting page loads alone misses client navigations. |
| Verified | The four service pages and club directory have stable routes. The homepage has club-carousel controls and opens club contacts with `window.open` on wa.me. A click establishes outbound intent only. The base homepage membership CTA currently targets /dashboard. FIX-01 repairs its destination and filters campaign forwarding. MKT-01 measures only the activation. |
| Verified | Both Free Trial components invoke `send-registration-email`. The checked-in function writes the registration, attempts both emails, then returns `{ success: true }`. Email failure may follow persistence. Lack of a confirmation does not establish that no row exists. PT and other service controls do not implement a confirmed submission path in this baseline. |
| Verified | Marketing route content attaches to the SPA. SEO-01 controls head tags separately. INF-03 changes database policies and does not change the current response contract in source. Hosted behavior must be rechecked after any coordinated release. |
| Assumed | The web stream will use the existing canonical origin and the company will supply its own approved consent interface. Actual platform setup and international privacy requirements are pending review. |
| Blocked | No approved GTM identifier, GA4 measurement ID, owned property/container access, or live consent handoff was supplied. Vendor collection and production attribution cannot be validated. |
| Proposed | Use the app route observer as the single page-view owner. Require explicit analytics consent before loading the container and keep advertising permissions denied in MKT-01. |

## Events

| Event | Trigger | Specific fields |
|---|---|---|
| `page_view` | Initial eligible route after consent, or transition to a different eligible normalized pathname. Query, fragment and trailing-slash changes alone do not count. A return to a route counts as a new view. Nonpublic and unknown paths emit nothing. | Page fields and optional service context. |
| `service_view` | Eligible page view for membership, personal training, Pilates Performer or RED Seitai. | `service_id`. This is a separate event from page_view. |
| `cta_click` | Activation of an approved mapping on the desktop/mobile service navigation or the existing homepage primary membership CTA. | `cta_id`, `cta_location`; `service_id` is CTA intent where applicable. |
| `club_view` | Opening the public directory, or explicitly moving the homepage club carousel to another card. | `cta_location` is `club_directory` or `home_club_carousel`. Club UUID is present on a valid selected card. Directory has no specific club. |
| `whatsapp_click` | Homepage club contact action with a valid HTTPS wa.me phone destination. | `club_id` where valid, `cta_location=home_whatsapp`. Does not measure whether a chat opens, sends, or qualifies. |
| `form_start` | First tracked edit per inline or sticky trial form cycle. | `form_id`. No field/value data. |
| `form_submit_attempt` | Existing client validation passes and a trial function invocation is about to start. | `form_id` and optional validated `club_id`. |
| `form_submit_success` | Existing function call resolves without a transport error and response contains boolean `success: true`. | Same context and form fields as the attempt. This tracks confirmed application response, with no GA4 key-event or generate_lead mapping in MKT-01. |
| `form_submit_error` | Invocation fails or lacks the explicit success acknowledgment. | Fixed `error_code` values `request_failed` and `unexpected_response`. Existing UI behavior is preserved even if analytics sees an unexpected response. |

## Parameter dictionary

- `page_path`, `page_name`, `page_location`: approved route, fixed route name and canonical origin plus that route. Never use full browser URL or a user-provided slug. `page_referrer` is deliberately empty.
- `service_id`: fixed service identifier from the route or approved CTA. `club_id`: validated UUID of a club selected or supplied by existing public club data. No club names, customer identifiers, or free text are sent.
- `cta_id`, `cta_location`, `form_id`, `error_code`: fixed code values only. Non-applicable keys are cleared to empty strings to prevent stale GTM data-layer values.
- `campaign_tagged`: yes/no presence of supported campaign keys. `campaign_source` and `campaign_medium`: normalized values from the fixed allowlists in events.ts. Raw UTM content, click IDs, and referrers are excluded. The most recent eligible classification is carried in memory after consent and cleared on withdrawal. This is aggregate context, with no reliable campaign-level or paid-click matching.
- Form outcomes use the initiating route and consent window. Repeated completion calls and requests spanning withdrawal/regrant emit no duplicate or revived confirmation. Nothing is sent on denied consent. No names, emails, phone numbers, WhatsApp destination or message, error strings, or raw query strings enter the app event payload.

## Enablement and release gates

1. Marketing owns a company GA4 property, web data stream and GTM web container. Set reporting timezone and account roles. Store the real GA4 ID in the approved GTM tag configuration. Do not commit example IDs or publish tags from this PR.
2. Privacy and the product owner approve consent copy and behavior, retention, and the display and persistence mechanism. The app defaults to denied and loads no script until the approved integration dispatches a `redfitness:analytics-consent` event with `detail: 'granted'` after the app mounts. Dispatch `'denied'` on withdrawal and reapply the persisted choice on page load. No preference UI or storage is added here.
3. Use one Google tag under GTM and one custom-event trigger for each approved app event. Disable automatic initial pageviews (`send_page_view: false`), browser-history pageviews, and enhanced-measurement form and outbound events that duplicate app signals. Disable additional automatic collection pending privacy review. Require analytics consent for all analytics tags and keep ad consent denied. Ensure withdrawal stops subsequent tag requests.
4. Bind `page_location` and `page_referrer` to sanitized app values. Review the actual Google tag configuration and network payloads for automatic URL, query, referrer, title, advertising or enhanced-measurement collection. The app layer cannot constrain arbitrary container tags. Release blocks on any personal data or raw query leaking through tag configuration.
5. Approve `VITE_GTM_ENABLED=true` and the actual `VITE_GTM_CONTAINER_ID` in the intended production build environment only. Missing settings, development, localhost and noncanonical preview origins remain inert even with consent. Run mock QA locally. Under separately approved controlled live verification, use Tag Assistant and GA4 DebugView to confirm denied/granted/revoked behavior, one page view per route, no automatic duplicates, and no PII. Do not import events into Ads or declare a conversion without approval.
6. Verify FIX-01 approved paths and URL forwarding in the selected release order. Retest trial outcomes if INF-03 or later form work changes the function/database interaction. Stop collection by turning off the build flag or pausing the approved GTM configuration through the release owner.

[Google SPA measurement](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications) · [Google consent implementation](https://developers.google.com/tag-platform/security/guides/consent)

## Local QA

Run `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/analytics.test.mjs` on Node 24. Build or serve with `VITE_SUPABASE_URL=https://fixture.invalid` and a dummy publishable key. Browser harness requires Playwright in the QA environment. Use `MKT_MOCK_TRANSPORT=1` against Vite dev to record events in memory, and leave it unset against production-build preview to verify the real loader remains off on loopback. Set `MKT_TEST_URL` and optionally `MKT_CHROMIUM_PATH`. The harness intercepts synthetic Supabase requests and blocks external destinations.
