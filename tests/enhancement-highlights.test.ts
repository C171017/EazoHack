import assert from 'node:assert/strict';
import { test } from 'node:test';
import { highlightSegments, type EnhancementHighlight } from '../src/features/reader/enhancement-highlights';
import { artifactEnhancement } from '../src/shared/enhancements';
import { makeMockArtifact, fixtureSelection } from '../src/shared/fixtures';
import { enhancementHistoryReducer, emptyEnhancementHistory } from '../src/features/assistance/enhancement-history';

test('overlapping enhancement marks preserve every source character across inline cuts', () => {
  const text = 'A 世界 🌏 passage.\n\nSecond paragraph.';
  const marks: EnhancementHighlight[] = [
    { startOffset: 2, endOffset: 15, kind: 'explanation' },
    { startOffset: 8, endOffset: text.length-2, kind: 'diagram' },
    { startOffset: 8, endOffset: text.length-2, kind: 'diagram' },
  ];
  const parts = [[0,12],[12,text.length]].flatMap(([start,end]) => highlightSegments(start,end,marks,{startOffset:0,endOffset:5}));
  assert.equal(parts.map(p => text.slice(p.startOffset,p.endOffset)).join(''),text);
  assert.deepEqual(parts.find(p => p.startOffset === 8)?.kinds,['explanation','diagram']);
  assert.equal(parts.filter(p => p.kinds.length === 2).length,2);
  assert.equal(parts.at(-1)?.kinds.length,0);
  assert.equal(parts[0].active,true);
});

test('undo/redo removes and restores the generated color identities', () => {
  const artifact = makeMockArtifact('concept_diagram',fixtureSelection,'color-test');
  const generated = enhancementHistoryReducer(emptyEnhancementHistory,{type:'generate',artifacts:[artifact],placements:[]});
  const undone = enhancementHistoryReducer(generated,{type:'undo'});
  assert.deepEqual(undone.present.artifacts.map(artifactEnhancement),[]);
  const redone = enhancementHistoryReducer(undone,{type:'redo'});
  assert.deepEqual(redone.present.artifacts.map(artifactEnhancement),['diagram']);
  assert.deepEqual(highlightSegments(0,10,[],{startOffset:2,endOffset:8}).map(p => [p.active,p.kinds]),[[false,[]],[true,[]],[false,[]]]);
});

test('explanations and interactive panels sharing a storage kind keep distinct identities', () => {
  const artifact = makeMockArtifact('interactive_ui',fixtureSelection,'color-test');
  assert.equal(artifact.kind,'interactive_ui');
  if (artifact.kind !== 'interactive_ui') return;
  assert.equal(artifactEnhancement({...artifact,payload:{...artifact.payload,components:[{component:'ExplanationCard',props:{title:'Meaning',body:'A passage explanation'}}]}}),'explanation');
  assert.equal(artifactEnhancement({...artifact,payload:{...artifact.payload,components:[{component:'ParameterSlider',props:{label:'Value',min:0,max:4,value:2,step:1,unit:''}}]}}),'interactive');
  assert.equal(artifactEnhancement(makeMockArtifact('generated_image',fixtureSelection,'image-test')),'illustration');
  assert.equal(artifactEnhancement(makeMockArtifact('source_discovery',fixtureSelection,'source-test')),null);
});
