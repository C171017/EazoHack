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
insert into storage.objects(bucket_id,name,metadata) values
 ('eazo-reading',auth.uid()::text||'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/'||repeat('a',64)||'.txt','{"size":1024}');
select pg_temp.assert((select count(*)=1 from storage.objects where bucket_id='eazo-reading'),'owner reads illustration');
select pg_temp.denied($q$insert into storage.objects(bucket_id,name,metadata) values('eazo-reading','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/'||repeat('b',64)||'.txt','{"size":104857600}')$q$,'image account quota');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select pg_temp.assert((select count(*)=0 from storage.objects where bucket_id='eazo-reading'),'other account cannot read illustration');
select pg_temp.denied($q$insert into storage.objects(bucket_id,name,metadata) values('eazo-reading','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/'||repeat('c',64)||'.txt','{"size":1}')$q$,'other account cannot upload illustration');
reset role;
select public.eazo_begin_account_deletion('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.denied($q$insert into storage.objects(bucket_id,name,metadata) values('eazo-reading','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/'||repeat('d',64)||'.txt','{"size":1}')$q$,'deletion fences late illustration uploads');
rollback;
