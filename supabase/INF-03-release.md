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
| Admin | Same, plus own profile | SELECT only | Clubs, classes, schedules, banners, page content | Existing permitted operations only |
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

## Expected production inventory and fail-closed check

| Table | Expected shapes from supplied evidence |
|---|---|
| registrations | Authenticated SELECT and DELETE with unconditional row predicates; anon INSERT with unconditional check. |
| admin_profiles | Own-profile SELECT keyed by auth.uid(); no client write policy was shown. |
| clubs, classes, schedules | Public unconditional ALL, with additional permissive policies whose names, roles and predicates remain unresolved. |
| page_content | Authenticated unconditional ALL. |
| banners | Public ALL conditioned on authenticated role. |

These are minimum expected observations. Exact policy names, additional policies, visibility filters, staff exceptions, grants, and dependency definitions have not been supplied. Verify public SELECT behavior on all five content tables before authorizing their proposed public read policies.

Load `supabase/inf03/inventory.sql` in an authorized operator session and capture `SELECT pg_temp.inf03_inventory();` for independent review. Inventory includes exact policies, column types/defaults, constraints, sequence ACLs and usage, memberships, effective table and column grants, triggers, dependency metadata, and view/RPC signatures and definition fingerprints. Review callable routine bodies and exposed schemas separately for dynamic SQL or indirect paths, including through triggers. PostgreSQL dependency metadata alone cannot establish their behavior. Reconcile existing exceptions in the migration and tests before signing off. If exact metadata or the alternate-path review is missing, stop.

Record `SELECT md5(pg_temp.inf03_inventory()::text);` for the reviewed snapshot and provide that approved value privately as `INF03_REVIEWED_INVENTORY_MD5` to the exact-version runner. Do not recompute and auto-approve a fresh digest at release. Quiesce concurrent ACL, policy, role, view, and RPC changes during the controlled window. The migration locks the seven tables, then rejects missing approval or different inventory before replacing policies. It checks effective privileges again inside the transaction and aborts on residual inherited or column grants. Use the reviewed `supabase/inf03/apply-reviewed-version.sh` with matching `INF03_APPROVED_VERSION` and a trusted direct/session libpq connection. The runner loads the helper and sets the fingerprint inside the same transaction as migration 001. It locks and writes the standard Supabase ledger (version, name and source SQL), rejects duplicates or later recorded versions, and requires 001 before 002. It does not create or repair the ledger. Test with the operator's actual Supabase CLI version and ledger in staging; do not use a bulk push for these two releases. The digest is a drift check. Access to the trusted operator workflow is the authorization boundary.

### Private production reconciliation

1. Confirm the project identity and read-only scope with the Supabase owner. Use an approved operator workstation and direct/session connection. Run the inventory in a dedicated session, retaining only temporary helper state. Query catalog and migration-ledger version metadata only. Do not query lead rows, Auth users, staff identities, role assignments per user, objects containing credentials, or stored migration bodies.
2. Store the catalog result in a restricted, encrypted location. Names of private views/RPCs and roles, grant chains, dependencies, policy expressions, trigger/view definitions, internal identifiers, ledger details, and the digest all stay out of public artifacts. Even definitions can contain sensitive values. For PR evidence publish only redacted outcomes and approval status.
3. Compare all seven exact policy lists, effective and inherited grants, column ACLs, constraints, defaults, sequence access, privileged owners and role memberships, approved exceptions, dependency behavior, and exposed RPCs/views. Obtain aggregate role attestation from the role owner without extracting staff identities. Compare production ledger versions with source and verify both target versions are pending in order.
4. Have a second Security/Privacy reviewer approve the captured digest and exact migration version privately. Bind only that digest at execution. If the comparison shows drift or an unexplained alternate path, stop and review it. The runner never generates its own approval.

### Transaction boundary

The runner assembles the complete SQL batch before connecting. Use only the runner for 001 and 002. `psql --single-transaction` owns the sole transaction, including the ledger insert. Keep migration and inventory inputs free of top-level transaction commands. A top-level `COMMIT` in an input would end the outer transaction early even if psql later exited with an error. The isolated suite invokes the same runner and forces the ledger insert to fail after observing the policy DDL for each version, then compares policies, grants, and ledger state across fresh connections.

## Routine deletion and exceptional erasure

Admin users retain registration SELECT only. The current registrations UI still renders Delete and does not surface a failed delete clearly. A separately approved frontend change should remove the Delete action and its handler, and report access failures clearly. Until that release, brief staff that routine deletion is unavailable. Database containment does not need to wait for the UI change.

Exceptional privacy erasure requires a documented authorized request, Privacy/Security approval, scope confirmation including retention obligations, and a separately authorized trusted operator. Record the decision and completion using the approved audit process without copying PII into tickets. Keep browser roles read-only for lead data.

## Emergency containment

Use the separate [emergency proposal](INF-03-emergency.md) only after explicit incident approval.

## Release and recovery

1. Run `supabase/tests/run-inf03-isolated.sh`. It provisions an isolated PostgreSQL 15 container and uses synthetic data only. This tests the SQL boundary, including an existing broad permissive policy and the service-role insert. It does not run the Supabase Auth gateway, Storage HTTP service, browser, Edge Function, or mail provider.
2. Apply migration 001 to isolated Supabase staging. Test both trial forms with a test inbox, authorized lead list and joined club display, denied direct lead deletion, content upserts, schedule manager edits, and unauthorized requests. Verify permission decisions through the gateway with synthetic IDs and accounts.
3. Apply migration 002 only after Storage prerequisites pass. Test anonymous public asset reads, authorized club/class/banner upload and replacement, denied other-user writes, and another bucket. The guards add no grants, so a missing permissive admin policy blocks the Storage release.
4. Obtain the Supabase owner's authorization for each migration. Use exact-version releases and record them in the migration ledger. A bulk push queues both files, so defer it while either migration has an unresolved gate. Schedule production with a bounded lock timeout and named operator. Recheck catalog policies and grants after each activation, confirm public page/asset reads without data extraction, and monitor aggregate intake, email and admin error signals. Any synthetic production smoke test that creates a lead needs separate approval. This PR does not authorize it.
5. If a migration raises an error before commit, the transaction rolls back. After commit, recover with a reviewed forward migration for the specific approved role, client, or asset path. If an emergency freeze was used, keep lead protection until the reviewed replacement is active. Do not replay broad legacy grant/policy snapshots as rollback. Never discard saved leads to recover from policy changes.
6. Frontend route guards, lead-cache clearing, CSV safety, and richer Edge Function validation/notification semantics remain separately coordinated. Confirm production Vercel access before shipping frontend changes. Database containment can proceed independently after its gates pass.

## Isolated Supabase integration gate

Use a disposable, unlinked local stack or an independently provisioned staging project with a synthetic schema and a separate project identifier. Use fresh synthetic keys and accounts, isolate production endpoints at the network/configuration boundary, and verify the frontend build, PostgREST, Edge Function, and Storage all point to the test environment. Do not import production tables, objects, or secrets. Run the exact-version runner and verify ledger visibility with the intended Supabase CLI version.

Use both browser trial forms with independent synthetic requests. Verify persisted synthetic rows and confirm both customer and staff notifications at a controlled test sink. The checked-in function sends to Resend and fixes the staff recipient in source. Use a test-only provider interception or a staging-only harness that redirects every recipient to the test sink. Block live provider egress unless an approved sandbox with safe recipients is in place. Missing sink isolation is a blocking condition.

Cover anonymous public reads and denied writes, unassigned/ordinary authenticated denial, designated admin lead SELECT with DELETE denied, approved content/banner upserts, and schedule-manager edits with lead and other content access denied. Compare pre- and post-migration HTTP behavior on synthetic records.

## Isolated Supabase Storage HTTP test plan

Use a disposable local/staging Supabase project, synthetic Auth accounts and small synthetic images. Seed one reviewed public fitness-assets image and a separate fixture bucket with its own baseline policy. Record only status and synthetic object keys. Use the browser SDK or equivalent Storage HTTP methods with anon, unassigned authenticated, schedule manager/editor, and admin sessions.

1. Fetch a public fixture image directly as an anonymous visitor. Confirm HTTP 200 and unchanged bytes before and after the migration.
2. As admin, upload to the existing clubs, classes and banners prefixes. Verify successful public retrieval. Verify the actual admin replacement flow that uploads a new image and updates the reference. If in-place replacement is operationally required, exercise the approved update/upsert method separately. Its prerequisite permissive policy must already exist.
3. Attempt uploads and in-place replacements as anonymous and ordinary authenticated users. Verify denial and unchanged original bytes. Test a move into and out of fitness-assets where the API allows moves.
4. Repeat the other bucket's before/after read and write checks. Results must match its own approved baseline. Confirm no redirect or bucket setting change. Record failures as release blockers.

## Decisions requiring RED FITNESS approval

- Security and Privacy approve designated lead-read admins and exceptional erasure workflow, incident scope, evidence retention, and trusted profile assignment ownership. Confirm when direct anonymous intake may be retired.
- Operations approves the schedule manager scope and documents who may author public content and manage assets. If an editor role is needed, define it explicitly before granting capabilities.
- Commercial and Operations confirm public content visibility, approved intake callers, and the staffed recipient of lead notifications.
- The Supabase owner approves production metadata access, each exact migration, emergency use if needed, staging evidence, recovery point, and the release window.

## Production readiness checklist

- [ ] Authorized catalog snapshot matches the supplied policy shapes and every additional policy is reconciled, including legitimate role exceptions and data visibility.
- [ ] Approved production fingerprint and controlled runner are recorded. The release procedure uses the same loaded helper, with a rehearsed migration ledger workflow.
- [ ] Lead entitlements, role assignments, indirect RPC/view paths and service-role privileges are signed off. The remaining Delete control has either a separately approved fix or a documented staff notice.
- [ ] Isolated Supabase staging passes both free-trial forms and the mail sink, PostgREST editor/schedule/registration requests, and all six Storage HTTP checks.
- [ ] Recovery checkpoint, least-privilege forward recovery, and a named operator are approved. Each migration has separate release authorization.
