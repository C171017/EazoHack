import test from 'node:test';
import assert from 'node:assert/strict';
import {sameOrigin} from '../src/server/cloud/backend';
test('cloud mutations validate browser Host despite Next internal localhost URLs',()=>{
 assert.doesNotThrow(()=>sameOrigin(new Request('http://localhost:3107/api/cloud/login',{headers:{host:'127.0.0.1:3107',origin:'http://127.0.0.1:3107'}})));
 assert.doesNotThrow(()=>sameOrigin(new Request('https://internal/api/cloud/login',{headers:{host:'eazo.example',origin:'https://eazo.example'}})));
 for(const headers of [{host:'eazo.example',origin:'https://attacker.example'},{host:'eazo.example','x-forwarded-host':'attacker.example',origin:'https://attacker.example'},{host:'eazo.example'}, {host:'eazo.example',origin:'https://eazo.example/path'}] as Record<string,string>[])assert.throws(()=>sameOrigin(new Request('https://internal/api/cloud/login',{headers})),/origin/);
});
