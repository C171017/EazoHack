-- Rollback-only checks after all migrations. Never creates or deletes real accounts.
begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.denied(statement text,label text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when insufficient_privilege or check_violation or foreign_key_violation then return;
 end;
 raise exception 'FAIL: allowed %',label;
end $$;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
insert into public.books(id,owner_id,local_book_id,title,format) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',auth.uid(),'txt:local','A','txt');
insert into public.book_sources(id,book_id,owner_id,file_hash,extraction_version,source_object,manifest) values
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',auth.uid(),'hash','v1',
 auth.uid()::text||'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source.txt','{"sourceBytes":10}');
insert into storage.objects(bucket_id,name,metadata) select 'eazo-sources',source_object,'{"size":10}' from public.book_sources;
select pg_temp.denied($q$select public.eazo_delete_book_rows('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$q$,'client cannot invoke privileged deletion');
reset role;
insert into public.books(owner_id,local_book_id,title,format) values
 ('22222222-2222-4222-8222-222222222222','other','Other','txt'),
 ('11111111-1111-4111-8111-111111111111','keep','Keep','txt');
set local role service_role;
select pg_temp.denied($q$select public.eazo_delete_book_rows('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$q$,'other owner cannot delete');
select pg_temp.assert(public.eazo_delete_book_rows('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')=array['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid],'returns deleted source');
select pg_temp.assert((select count(*)=2 from public.books),'unrelated books remain');
select pg_temp.assert((select count(*)=0 from public.book_sources),'source removed');
select pg_temp.assert(public.eazo_delete_book_rows('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')='{}'::uuid[],'retry is idempotent');
select pg_temp.denied($q$insert into storage.objects(bucket_id,name) values('eazo-analysis','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/late.json')$q$,'late worker upload fenced');
select pg_temp.denied($q$insert into storage.objects(bucket_id,name) values('eazo-reading','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/late.txt')$q$,'late reading image fenced');
rollback;
