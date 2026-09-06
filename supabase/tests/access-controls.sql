-- Rollback-only test; works with the local stand-ins or a fresh local Supabase stack.
begin;
create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.denied(statement text, label text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when insufficient_privilege or foreign_key_violation or check_violation or unique_violation then return;
 end;
 raise exception 'FAIL: allowed %', label;
end $$;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
insert into public.books(id,owner_id,local_book_id,title,format) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',auth.uid(),'txt:local','Test','txt');
insert into public.book_sources(id,book_id,owner_id,file_hash,extraction_version,source_object,manifest) values
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',auth.uid(),'hash','v1',
 '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source.txt',jsonb_build_object('sourceBytes',10,'sourceSha256',repeat('a',64)));
insert into storage.objects(bucket_id,name) select 'eazo-sources',source_object from public.book_sources;
select public.eazo_save_snapshot('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',gen_random_uuid(),gen_random_uuid(),0,'{"id":"checkpoint","bookId":"txt:local","anchors":[]}');
insert into public.reading_events(book_id,source_id,owner_id,device_id,local_event_id,kind,payload)
 values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',auth.uid(),gen_random_uuid(),'1','selection','{}');
select pg_temp.assert((select count(*)=1 from public.books),'owner read');
update public.books set title='Updated' where owner_id=auth.uid();
select pg_temp.assert((select title='Updated' from public.books),'owner metadata update');
select pg_temp.denied($q$update public.books set owner_id='22222222-2222-4222-8222-222222222222'$q$,'owner transfer');
select pg_temp.denied($q$update public.book_sources set file_hash='other'$q$,'source mutation');
select pg_temp.denied('delete from public.reading_snapshots','snapshot deletion');
select pg_temp.denied('update public.reading_events set payload=''{}''','event mutation');
-- Storage uses RLS to hide update/delete targets (0 rows), not necessarily an error.
with changed as (update storage.objects set name='tampered' returning *) select pg_temp.assert(count(*)=0,'source overwrite blocked') from changed;
with removed as (delete from storage.objects returning *) select pg_temp.assert(count(*)=0,'source delete blocked') from removed;
select pg_temp.denied($q$insert into storage.objects(bucket_id,name) values ('eazo-sources','arbitrary')$q$,'unregistered upload');
select pg_temp.denied($q$insert into storage.objects(bucket_id,name) values ('eazo-analysis','fake/graph.json')$q$,'browser graph upload');
select pg_temp.denied($q$select public.claim_analysis_job(gen_random_uuid())$q$,'browser worker RPC');
select pg_temp.denied($q$insert into public.analysis_jobs(book_id,source_id,owner_id,idempotency_key,pipeline_version,model) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',auth.uid(),'k','v','m')$q$,'browser job dispatch');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select pg_temp.assert((select count(*)=0 from public.books),'other user read');
select pg_temp.assert((select count(*)=0 from public.book_sources),'other user sources');
select pg_temp.assert((select count(*)=0 from public.reading_snapshots),'other user snapshots');
select pg_temp.assert((select count(*)=0 from public.reading_events),'other user events');
select pg_temp.assert((select count(*)=0 from storage.objects),'other user storage');
with changed as (update public.books set title='attack' returning *) select pg_temp.assert(count(*)=0,'other user update') from changed;
select pg_temp.denied($q$insert into public.books(owner_id,local_book_id,title,format) values ('11111111-1111-4111-8111-111111111111','attack','attack','txt')$q$,'forged owner');
select pg_temp.denied($q$select public.eazo_save_snapshot('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',gen_random_uuid(),gen_random_uuid(),1,'{"id":"attack","bookId":"txt:local","anchors":[]}')$q$,'cross-owner source snapshot');
select pg_temp.denied($q$insert into public.reading_events(book_id,source_id,owner_id,device_id,local_event_id,kind,payload) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',auth.uid(),gen_random_uuid(),'attack','selection','{}')$q$,'cross-owner source FK');
select pg_temp.denied($q$insert into storage.objects(bucket_id,name) values ('eazo-sources','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/original.pdf')$q$,'cross-user upload');
reset role;
set local role service_role;
insert into public.analysis_jobs(id,book_id,source_id,owner_id,idempotency_key,pipeline_version,model) values
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','once','v1','test');
select pg_temp.assert(public.eazo_worker('claim','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd')->>'id'='cccccccc-cccc-4ccc-8ccc-cccccccccccc','claim queued');
select pg_temp.assert(public.eazo_worker('claim','cccccccc-cccc-4ccc-8ccc-cccccccccccc','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')->>'busy'='true','duplicate claim fenced');
select pg_temp.assert(not public.complete_analysis_job('cccccccc-cccc-4ccc-8ccc-cccccccccccc',gen_random_uuid(),'v1',repeat('a',64)),'wrong lease rejected');
select pg_temp.assert(public.heartbeat_analysis_job(id,lease_token),'heartbeat') from public.analysis_jobs;
update public.analysis_jobs set lease_expires_at=now()-interval '1 second';
select pg_temp.assert(not public.heartbeat_analysis_job(id,lease_token),'expired heartbeat rejected') from public.analysis_jobs;
select pg_temp.assert(not public.complete_analysis_job(id,lease_token,'v1',repeat('a',64)),'expired publish rejected') from public.analysis_jobs;
select pg_temp.assert(public.eazo_worker('claim','cccccccc-cccc-4ccc-8ccc-cccccccccccc','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')->>'id'='cccccccc-cccc-4ccc-8ccc-cccccccccccc','reclaim expired');
select pg_temp.assert((select attempt=2 from public.analysis_jobs where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'),'reclaim increments attempt');
select pg_temp.assert(public.complete_analysis_job(id,lease_token,'v1',repeat('a',64)),'publish valid lease') from public.analysis_jobs;
select pg_temp.assert((select status='succeeded' from public.analysis_jobs),'atomic success');
insert into storage.objects(bucket_id,name) select 'eazo-analysis',manifest_object from public.graph_versions;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.assert((select count(*)=1 from public.graph_versions),'owner graph');
select pg_temp.assert((select count(*)=1 from public.analysis_jobs),'owner job');
select pg_temp.assert((select count(*)=2 from storage.objects),'owner published output');
select pg_temp.denied('update public.analysis_jobs set status=''succeeded''','browser forge success');
select pg_temp.denied('delete from public.graph_versions','browser delete graph');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select pg_temp.assert((select count(*)=0 from public.graph_versions),'other user graph');
select pg_temp.assert((select count(*)=0 from public.analysis_jobs),'other user job');
select pg_temp.assert((select count(*)=0 from storage.objects),'other user output');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.denied('select * from public.books','anonymous books');
select pg_temp.denied('select * from public.analysis_jobs','anonymous jobs');
select pg_temp.assert((select count(*)=0 from storage.objects),'anonymous storage');
select pg_temp.denied($q$insert into storage.objects(bucket_id,name) values ('eazo-sources','anonymous')$q$,'anonymous upload');
reset role;
select 'All access-control and lease assertions passed' as result;
rollback;
