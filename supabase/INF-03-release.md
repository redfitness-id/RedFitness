# INF-03 Supabase containment release review

The Product Orchestrator supplied the production policy evidence. This branch has no production management connection. No customer records, production role assignments, or secrets were retrieved. Review this runbook and reconcile the actual database metadata before applying either migration.

## Effective access

RLS is enabled on the seven reviewed public tables. Broad DML grants alone do not show effective row access. The confirmed registration policies permit every authenticated user to select and delete leads, and allow direct anonymous inserts. The confirmed public ALL policies on clubs, classes, and schedules permit anonymous and authenticated users to read and mutate those rows. The supplied page-content and banner policies permit authenticated writes. Own-profile selection is confirmed, and no profile write policy was shown. The fitness-assets INSERT/UPDATE policy predicates are permissive. Effective anonymous Storage writes are unverified pending grants, gateway, and bucket checks.

| Actor | Reviewed public reads | Registration access after | Table writes after | fitness-assets writes after |
|---|---|---|---|---|
| Anonymous | Clubs, classes, schedules, banners, page content | None directly | None | None via anon |
| Authenticated, no profile | Same | None | None | None |
| Schedule manager | Same, plus own profile | None | Schedules only | None |
| Editor | Same, plus own profile if present | None | None | None |
| Admin | Same, plus own profile | SELECT, DELETE | Clubs, classes, schedules, banners, page content | Existing permitted operations only |
| Edge Function service role | Existing club lookup access | Existing INSERT continues | Existing privileged backend access | Existing privileged backend access |

The current UI recognizes admin and schedule_manager. Editor is synthetic and has no write authority in this release. Profile assignments remain trusted-operator operations. The migration adds no profile write policy. No application code changes are included.

## Metadata-only preflight

An authorized project operator should inspect the following on the exact active project. Record metadata only. Keep account IDs, connection strings, keys, and lead data out of review artifacts.

- Capture policy definitions and RLS flags for the seven public tables and storage.objects, including extra permissive and restrictive policies. The table migration replaces every existing policy on those seven tables. Any intentional exception, such as club-scoped scheduling or a public visibility filter, must be represented and retested before approval.
- Compare effective relation and column grants, role memberships, ownership/BYPASSRLS, exposed views/RPCs, trigger or SECURITY DEFINER paths, and migration history. Investigate alternate lead access independently before declaring containment. Verify the private rf_security schema name is unused and excluded from API exposure.
- Have the role owner attest aggregate assignments for admin and schedule_manager and flag unknown roles, with no individual IDs in the report. Confirm admin_profiles is authoritative and only managed through an approved operator workflow.
- Confirm public readers can legitimately see the five public tables and all columns currently selected by the site. Check the existing admin upsert, identity/sequence permissions, foreign keys, alternate clients, and audit/reporting jobs in staging.
- Check Storage RLS, effective grants, bucket settings and permitted methods using metadata. In isolated Supabase staging verify upload, retrieval, and replacement via Storage HTTP on existing club/class/banner paths. Verify all client roles that can access Storage. The migration narrows anon/authenticated access for one bucket, retains existing public reads and other buckets, and assumes no extra untrusted Storage client role.
- Verify the deployed browser and Edge Function revisions and gateway configuration. Source calls send-registration-email from both trial forms. Its server-only service-role client inserts registrations then looks up the selected club name. Verify those privileges, correct environment binding, function invocation, and test-sink notification in isolated Supabase staging. Verify there are no approved direct anonymous writers before revoking that path.
- Capture reviewed metadata definitions and recovery checkpoints. Verify exact migration versions with the Supabase migration ledger, and rehearse from a comparable schema with synthetic data.

## Emergency containment before Vercel access

Subject to explicit incident authorization, an operator can contain these database paths without a frontend deployment. First capture policy/grant metadata and preserve access to the current trusted operator account. Prefer migration 001 when its preflight is complete and lead and admin workflows have passed staging.

If immediate containment is required before that validation, remove public-client SELECT/DELETE access on registrations and temporarily freeze anon/authenticated writes to clubs, classes, and schedules. Extend the write freeze to page_content or banners when the incident scope warrants it. Where the confirmed problem is via direct table grants, revoke the corresponding privileges from PUBLIC, anon and authenticated and inspect inherited and column grants, policies, exposed views and RPCs for alternate paths. Preserve public reads and the server-side service-role insert. Use a short transaction with a lock timeout and record the applied DDL. The emergency freeze can temporarily block staff reads and editing. Communicate the interruption and restore those operations only through reviewed role-scoped access.

Keep the anonymous intake grant until caller compatibility is proven if an urgent freeze is applied separately. If the Storage exposure is independently confirmed, deploy only a verified restrictive guard for fitness-assets. Pause unverified uploads and preserve public asset reads rather than changing grants globally across all buckets. Production changes need the separate approvals below.

## Release and recovery

1. Run `supabase/tests/run-inf03-isolated.sh`. It provisions an isolated PostgreSQL 15 container and uses synthetic data only. This tests the SQL boundary, including an existing broad permissive policy and the service-role insert. It does not run the Supabase Auth gateway, Storage HTTP service, browser, Edge Function, or mail provider.
2. Apply migration 001 to isolated Supabase staging. Test both trial forms with a test inbox, authorized lead list/delete and joined club display, content upserts, schedule manager edits, and unauthorized requests. Verify permission decisions through the gateway with synthetic IDs and accounts.
3. Apply migration 002 only after Storage prerequisites pass. Test anonymous public asset reads, authorized club/class/banner upload and replacement, denied other-user writes, and another bucket. The guards add no grants, so a missing permissive admin policy blocks the Storage release.
4. Obtain the Supabase owner's authorization for each migration. Use exact-version releases and record them in the migration ledger. A bulk push queues both files, so defer it while either migration has an unresolved gate. Schedule production with a bounded lock timeout and named operator. Recheck catalog policies and grants after each activation, confirm public page/asset reads without data extraction, and monitor aggregate intake, email and admin error signals. Any synthetic production smoke test that creates a lead needs separate approval. This PR does not authorize it.
5. If a migration raises an error before commit, the transaction rolls back. After commit, recover with a reviewed forward migration for the specific approved role, client, or asset path. If an emergency freeze was used, keep lead protection until the reviewed replacement is active. Do not replay broad legacy grant/policy snapshots as rollback. Never discard saved leads to recover from policy changes.
6. Frontend route guards, lead-cache clearing, CSV safety, and richer Edge Function validation/notification semantics remain separately coordinated. Confirm production Vercel access before shipping frontend changes. Database containment can proceed independently after its gates pass.

## Decisions requiring RED FITNESS approval

- Security and Privacy approve lead read and deletion entitlements, incident scope, evidence retention, and trusted profile assignment ownership. Confirm when direct anonymous intake may be retired.
- Operations approves the schedule manager scope and documents who may author public content and manage assets. If an editor role is needed, define it explicitly before granting capabilities.
- Commercial and Operations confirm public content visibility, approved intake callers, and the staffed recipient of lead notifications.
- The Supabase owner approves production metadata access, each exact migration, emergency use if needed, staging evidence, recovery point, and the release window.
