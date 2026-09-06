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
select pg_temp.assert(public.eazo_snapshot_head('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')='{"revision":0,"payload":null}'::jsonb,'empty head');
select pg_temp.assert(public.eazo_save_snapshot('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-dddd-4ddd-8ddd-dddddddddddd','00000000-0000-4000-8000-000000000001',0,'{"id":"save1","bookId":"txt:local","anchors":[],"test":"first"}')->>'revision'='1','first save');
select pg_temp.assert(public.eazo_save_snapshot('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-dddd-4ddd-8ddd-dddddddddddd','00000000-0000-4000-8000-000000000001',0,'{"id":"save1","bookId":"txt:local","anchors":[],"test":"first"}')->>'revision'='1','same mutation replay');
select pg_temp.assert((select count(*)=1 from public.reading_snapshots),'replay does not duplicate');
select pg_temp.assert(public.eazo_save_snapshot('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','00000000-0000-4000-8000-000000000002',0,'{"id":"save2","bookId":"txt:local","anchors":[],"test":"offline"}')->>'status'='conflict','stale offline conflict');
select pg_temp.assert(public.eazo_snapshot_head('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')->'payload'->>'test'='first','conflict preserves cloud head');
select pg_temp.assert((select count(*)=2 from public.reading_snapshots),'conflicting candidate preserved');
select pg_temp.assert(public.eazo_save_snapshot('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','00000000-0000-4000-8000-000000000003',1,'{"id":"save3","bookId":"txt:local","anchors":[],"test":"resolved"}')->>'revision'='2','explicit resolution advances');
select pg_temp.denied($q$select public.eazo_save_snapshot('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-dddd-4ddd-8ddd-dddddddddddd','00000000-0000-4000-8000-000000000001',0,'{"id":"save1","bookId":"txt:local","anchors":[],"test":"tampered"}')$q$,'mutation reused with changed payload');
select pg_temp.denied($q$select public.eazo_save_snapshot('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-dddd-4ddd-8ddd-dddddddddddd',gen_random_uuid(),2,'{"id":"bad","bookId":"different","anchors":[]}')$q$,'wrong book payload');
select pg_temp.denied($q$insert into public.reading_snapshots(book_id,source_id,owner_id,checkpoint_id,device_id,payload) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',auth.uid(),'bypass',gen_random_uuid(),'{}')$q$,'direct insert cannot bypass head');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select pg_temp.assert((select count(*)=0 from public.reading_heads),'other account head hidden');
select pg_temp.assert((select count(*)=0 from public.reading_snapshots),'other account history hidden');
select pg_temp.assert((select count(*)=0 from storage.objects),'other account files hidden');
select pg_temp.denied($q$select public.eazo_snapshot_head('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$q$,'other account head RPC');
select pg_temp.denied($q$select public.eazo_save_snapshot('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',gen_random_uuid(),gen_random_uuid(),2,'{"id":"attack","bookId":"txt:local","anchors":[]}')$q$,'other account save RPC');
select pg_temp.denied($q$select public.eazo_begin_account_deletion('11111111-1111-4111-8111-111111111111')$q$,'client deletion RPC forbidden');
insert into public.books(owner_id,local_book_id,title,format) values(auth.uid(),'b:other','B','txt');
-- User B's allowance is independent from A, and direct API writes cannot bypass it.
insert into public.books(owner_id,local_book_id,title,format)
 select auth.uid(),'limit:'||i,'Quota','txt' from generate_series(1,99) i;
select pg_temp.denied($q$insert into public.books(owner_id,local_book_id,title,format) values(auth.uid(),'over-limit','Quota','txt')$q$,'book quota');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.denied($q$insert into public.books(owner_id,local_book_id,title,format,metadata) values(auth.uid(),'big-metadata','Quota','txt',jsonb_build_object('large',repeat('x',131073)))$q$,'metadata bounded');
select pg_temp.denied($q$insert into public.book_sources(id,book_id,owner_id,file_hash,extraction_version,source_object) values('99999999-9999-4999-8999-999999999999','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',auth.uid(),'no-size','v1',auth.uid()::text||'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/99999999-9999-4999-8999-999999999999/source.txt')$q$,'declared source size required');
select pg_temp.denied($q$insert into public.book_sources(id,book_id,owner_id,file_hash,extraction_version,source_object,manifest) values('99999999-9999-4999-8999-999999999999','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',auth.uid(),'big','v1',auth.uid()::text||'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/99999999-9999-4999-8999-999999999999/source.txt','{"sourceBytes":52428801}')$q$,'per-file quota');
reset role;
set local role service_role;
insert into public.analysis_jobs(id,book_id,source_id,owner_id,idempotency_key,model,pipeline_version,status,lease_token,lease_expires_at)
 values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','k','m','p','running',gen_random_uuid(),now()+interval '5 minutes');
select public.eazo_begin_account_deletion('11111111-1111-4111-8111-111111111111');
select public.eazo_begin_account_deletion('11111111-1111-4111-8111-111111111111');
select pg_temp.assert((select status='cancelled' and lease_token is null from public.analysis_jobs),'deletion cancels worker');
select pg_temp.denied($q$insert into storage.objects(bucket_id,name) values('eazo-analysis','11111111-1111-4111-8111-111111111111/late-worker.json')$q$,'late service worker upload fenced');
select pg_temp.denied($q$select public.eazo_submit_job('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','new','m','p')$q$,'new job fenced');
delete from storage.objects where starts_with(name,'11111111-1111-4111-8111-111111111111/');
select public.eazo_delete_account_rows('11111111-1111-4111-8111-111111111111');
select public.eazo_delete_account_rows('11111111-1111-4111-8111-111111111111');
select pg_temp.assert((select count(*)=100 from public.books where owner_id='22222222-2222-4222-8222-222222222222'),'other account survives cleanup');
reset role;
delete from auth.users where id='11111111-1111-4111-8111-111111111111';
set local role service_role;
select pg_temp.denied($q$insert into storage.objects(bucket_id,name) values('eazo-analysis','11111111-1111-4111-8111-111111111111/after-auth-delete.json')$q$,'deleted account remains fenced');
reset role;
select 'Account isolation, idempotency, conflicts and deletion checks passed' as result;
rollback;
