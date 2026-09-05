import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InteractiveConfig } from '../src/features/assistance/artifact-view';
import { InteractiveUiConfigSchema } from '../src/shared/schemas';

test('registered UI treats generated content as text and escapes HTML',()=>{
  const config=InteractiveUiConfigSchema.parse({schemaVersion:'1',components:[{component:'ExplanationCard',props:{title:'<script>alert(1)</script>',body:'<img src=x onerror=alert(1)>'}}],assumptions:[],ruleSources:[],validationStatus:'mock_unverified'});
  const html=renderToStaticMarkup(createElement(InteractiveConfig,{config,state:{},onStateChange:()=>{}}));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
});

test('restored interaction state cannot escape validated slider bounds',()=>{
  const config=InteractiveUiConfigSchema.parse({schemaVersion:'1',components:[{component:'ParameterSlider',props:{label:'Fixture parameter',min:1,max:5,step:1,value:3,unit:'steps'}}],assumptions:[],ruleSources:[],validationStatus:'mock_unverified'});
  const render=(value:number)=>renderToStaticMarkup(createElement(InteractiveConfig,{config,state:{'0':value},onStateChange:()=>{}}));
  assert.ok(render(999).includes('value="5"'));
  assert.ok(render(-999).includes('value="1"'));
});
