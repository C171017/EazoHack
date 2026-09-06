import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

// Only the runner's private Unix socket is accepted, never a network database.
const socket = process.env.EAZO_TEST_PG_SOCKET;
if (!socket || !/^\/tmp\/eazo-account-db\.[A-Za-z0-9]+$/.test(socket)) throw new Error('Run through scripts/test-account-db.sh.');
function sql(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.EAZO_TEST_PSQL ?? 'psql', ['-h', socket, '-p', '5432', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('exit', code => { if (code === 0) resolve(output); else reject(new Error(error)); });
    child.stdin.end(statement);
  });
}
const owner = randomUUID(), book = randomUUID(), source = randomUUID();
await sql(`INSERT INTO auth.users VALUES ('${owner}');
 INSERT INTO public.books(id,owner_id,local_book_id,title,format) VALUES('${book}','${owner}','concurrent','Concurrency','txt');
 INSERT INTO public.book_sources(id,book_id,owner_id,file_hash,extraction_version,source_object,manifest)
 VALUES('${source}','${book}','${owner}','hash','v1','${owner}/${book}/${source}/source.txt','{"sourceBytes":10}');`);
function save(index) {
  const payload = JSON.stringify({ id: `save${index}`, bookId: 'concurrent', anchors: [] });
  return sql(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',true);
   SELECT public.eazo_save_snapshot('${source}',gen_random_uuid(),gen_random_uuid(),0,'${payload}');
   SELECT pg_sleep(0.2); COMMIT;`);
}
const results = await Promise.all([save(1), save(2)]);
const statuses = results.map(result => JSON.parse(result.split('\n').find(line => line.startsWith('{'))).status).sort();
assert.deepEqual(statuses, ['conflict', 'saved']);
assert.equal((await sql(`SELECT revision FROM public.reading_heads WHERE source_id='${source}';`)).trim(), '1');
assert.equal((await sql(`SELECT count(*) FROM public.reading_snapshots WHERE source_id='${source}';`)).trim(), '2');
console.log('PASS: concurrent transactions produce one accepted head and one preserved conflict.');
