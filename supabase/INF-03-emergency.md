# Proposed emergency containment before Vercel access

Approval only. This procedure has not been executed.

## Prerequisites and recovery checkpoint

- The incident owner, Supabase owner, and Security/Privacy approver must authorize the exact project, scopes below, operator, and staff interruption. Confirm Vercel access is unnecessary for database containment.
- Using a trusted operator session, record the active project, catalog policies, direct and effective relation and column grants, memberships, exposed views/RPCs, role ownership and bypass flags. Keep production lead data out of the capture. Restrict access to any operational metadata.
- Confirm an existing managed backup or point-in-time recovery checkpoint, its timestamp, and operator recovery access. Keep a schema-only record of affected grants/policies. Avoid an ad hoc copy of customer data.
- Confirm current public readers and the Edge Function service-role insert and club lookup privileges. Leave the existing direct anonymous intake grant in place during this emergency procedure until caller compatibility has been proven. Coordinate a short change window and pause concurrent privilege, policy, and API configuration changes.

## Minimal temporary restrictions

Review the [candidate SQL](inf03/emergency-freeze.sql) against the approved catalog. It is outside the migration directory and requires an explicit approval setting in the operator session. It only covers direct grants and verifies effective client privileges before commit. An approved alternative is needed if inherited ACLs, column grants, or exposed RPCs and views are still active. The candidate aborts on residual direct-role privileges and does not attempt to rewrite those additional paths.

Use a reviewed, short transaction with a lock timeout. The operator must tailor the exact revocations to the observed ACLs and abort the transaction if its verification fails.

1. On public.registrations remove SELECT and DELETE access from PUBLIC, anon and authenticated, covering corresponding column and inherited privileges where applicable. Contain any separately exposed view/RPC path explicitly using the verified inventory. Retain the trusted service intake role.
2. Temporarily revoke INSERT, UPDATE, and DELETE on public.clubs, public.classes, public.schedules, public.page_content, and public.banners from PUBLIC, anon and authenticated. Cover inherited and column privileges and separately exposed writer paths identified in the inventory. Preserve SELECT. Do not remove role-specific policies as part of this freeze.
3. Keep Storage outside this emergency proposal until bucket-level access is verified and a separate protective change approved.

**Expected impact:** Browser-based lead lists/downloads and lead deletion fail during the freeze. Club, schedule, banner, and content editing may also fail for legitimate staff using browser roles. Public reads and existing trial intake are intended to continue. Notify Operations before the change.

## Verification and recovery

- Before commit, recheck effective grants and catalog conditions for blocked operations, including bypass through verified dependents. Confirm public read permissions and the service-role insert and club lookup remain effective. Roll back the transaction if any check fails.
- After commit, verify public pages, monitor aggregate intake and operational errors, and keep customer rows out of smoke checks. Exercise all affected operations on synthetic data in isolation.
- Restore approved staff workflow through the role-scoped migration or a narrowly reviewed corrective policy. Leave routine lead DELETE closed. Never restore broad access as a convenience rollback. Use the managed recovery checkpoint only on incident-owner approval, with a plan to preserve valid lead writes made after the checkpoint.
