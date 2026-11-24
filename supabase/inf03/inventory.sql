-- Load in an authorized operator session. Creates only a temporary function.
-- The output contains catalog metadata, never application rows.
create or replace function pg_temp.inf03_inventory()
returns jsonb language sql stable set search_path = pg_catalog as $$
with targets as (
  select c.* from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('registrations','admin_profiles','clubs','classes','schedules','banners','page_content')
), columns as (
  select t.relname, a.attrelid, a.attnum, a.attname, format_type(a.atttypid,a.atttypmod) as type,
         a.attnotnull, a.attidentity, a.attgenerated, a.attacl::text as acl,
         pg_get_expr(ad.adbin,ad.adrelid) as default_expression
  from targets t join pg_attribute a on a.attrelid = t.oid
  left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
  where a.attnum > 0 and not a.attisdropped
), roles as (
  select * from pg_roles where rolname in ('anon','authenticated','service_role')
), dependencies as (
  select distinct pg_describe_object(d.classid,d.objid,d.objsubid) as object,
    t.relname as referenced_table, d.refobjsubid as referenced_column, d.deptype,
    case when d.classid = 'pg_rewrite'::regclass
      and v.relkind in ('v','m') then pg_get_viewdef(v.oid,true) end as view_definition,
    v.relacl::text as view_acl, v.reloptions as view_options,
    pg_get_userbyid(v.relowner) as view_owner
  from targets t join pg_depend d on d.refclassid = 'pg_class'::regclass and d.refobjid = t.oid
  left join pg_rewrite r on d.classid = 'pg_rewrite'::regclass and r.oid = d.objid
  left join pg_class v on v.oid = r.ev_class
), sequences as (
  select distinct t.relname, s.oid, s.oid::regclass::text as name, s.relacl::text as acl,
    pg_get_userbyid(s.relowner) as owner, pg_sequence_parameters(s.oid)::text as parameters
  from targets t join pg_depend d on d.classid = 'pg_class'::regclass
    and d.refclassid = 'pg_class'::regclass and d.refobjid = t.oid
    and d.deptype in ('i','a')
  join pg_class s on s.oid = d.objid and s.relkind = 'S'
)
select jsonb_build_object(
  'tables', (select jsonb_agg(jsonb_build_array(relname,relkind,relrowsecurity,relforcerowsecurity,
      pg_get_userbyid(relowner),relacl::text) order by relname) from targets),
  'policies', (select jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname)
      from pg_policies p join targets t on t.relname = p.tablename where p.schemaname = 'public'),
  'columns', (select jsonb_agg(to_jsonb(c) - 'attrelid' order by relname,attnum) from columns c),
  'constraints', (select jsonb_agg(jsonb_build_array(t.relname,c.conname,pg_get_constraintdef(c.oid,true),c.convalidated)
      order by t.relname,c.conname) from pg_constraint c join targets t on c.conrelid = t.oid),
  'memberships', (select jsonb_agg(jsonb_build_array(r.rolname,m.rolname,m.rolsuper,m.rolbypassrls,
      pg_has_role(r.oid,m.oid,'USAGE')) order by r.rolname,m.rolname)
      from roles r cross join pg_roles m where pg_has_role(r.oid,m.oid,'MEMBER')),
  'table_grants', (select jsonb_agg(jsonb_build_array(r.rolname,t.relname,p,has_table_privilege(r.oid,t.oid,p))
      order by r.rolname,t.relname,p) from roles r cross join targets t
      cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p),
  'column_grants', (select jsonb_agg(jsonb_build_array(r.rolname,c.relname,c.attname,p,
      has_column_privilege(r.oid,c.attrelid,c.attnum,p)) order by r.rolname,c.relname,c.attname,p)
      from roles r cross join columns c cross join unnest(array['SELECT','INSERT','UPDATE','REFERENCES']) p),
  'sequences', (select jsonb_agg(jsonb_build_array(s.relname,s.name,s.owner,s.acl,s.parameters,r.rolname,
      has_sequence_privilege(r.oid,s.oid,'USAGE')) order by s.relname,s.name,r.rolname)
      from sequences s cross join roles r),
  'dependencies', (select jsonb_agg(to_jsonb(d) order by referenced_table,object,referenced_column,deptype)
      from dependencies d),
  'triggers', (select jsonb_agg(jsonb_build_array(t.relname,g.tgname,g.tgenabled,pg_get_triggerdef(g.oid,true))
      order by t.relname,g.tgname) from targets t join pg_trigger g on g.tgrelid = t.oid where not g.tgisinternal),
  'views', (select jsonb_agg(jsonb_build_array(n.nspname,v.relname,v.relkind,
      pg_get_userbyid(v.relowner),v.relacl::text,v.reloptions,md5(pg_get_viewdef(v.oid,true)),
      has_table_privilege('anon',v.oid,'SELECT'),has_table_privilege('authenticated',v.oid,'SELECT'))
      order by n.nspname,v.relname)
      from pg_class v join pg_namespace n on n.oid = v.relnamespace
      where v.relkind in ('v','m') and n.nspname not in ('pg_catalog','information_schema')
        and n.nspname not like 'pg_%'),
  'routines', (select jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
      pg_get_userbyid(p.proowner),p.prosecdef,p.proacl::text,md5(pg_get_functiondef(p.oid)),
      has_function_privilege('anon',p.oid,'EXECUTE'),has_function_privilege('authenticated',p.oid,'EXECUTE'))
      order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_%'
        and p.prokind in ('f','p'))
);
$$;
