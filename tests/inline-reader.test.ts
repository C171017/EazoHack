import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { splitSourceRange, placementsFor } from '../src/features/reader/artifact-placement';
import { createWorkspaceRepository, WorkspaceSnapshotSchema } from '../src/features/persistence';
import { fixtureSelection, fixtureAnchors, makeMockArtifact } from '../src/shared/fixtures';
import { GeneratedImageSchema } from '../src/shared/schemas';

test('multiple inline cuts retain every source character including Unicode and paragraph endings',()=>{
  const text='Hello 世界 🌏.\n\nSecond paragraph.';
  const ranges=splitSourceRange(0,text.length,[5,5,8,12,text.length,-1,text.length+1]);
  assert.equal(ranges.map(r=>text.slice(r.startOffset,r.endOffset)).join(''),text);
  assert.deepEqual(ranges.map(r=>r.endOffset),[5,8,12,text.length]);
});

test('placements migrate legacy TXT results and discard retired collapse state',async()=>{
  const artifacts=['interactive_ui','concept_diagram'].map(kind=>makeMockArtifact(kind as 'interactive_ui'|'concept_diagram',fixtureSelection,`run-${kind}`));
  const placements=placementsFor(artifacts,fixtureAnchors);
  assert.equal(placements.length,2);
  assert.equal(placements[0].selectionId,fixtureSelection.id);
  assert.deepEqual(WorkspaceSnapshotSchema.parse({schemaVersion:1,id:"legacy",bookId:fixtureSelection.bookId,selections:[fixtureSelection],anchors:fixtureAnchors,artifacts,placements:placements.map(p=>({...p,collapsed:true})),savedAt:new Date().toISOString()}).placements,placements);
  const snapshot=WorkspaceSnapshotSchema.parse({schemaVersion:1,id:'inline-test',bookId:fixtureSelection.bookId,selections:[fixtureSelection],anchors:fixtureAnchors,artifacts,placements,savedAt:new Date().toISOString()});
  const repository=createWorkspaceRepository({indexedDB:new IDBFactory()});
  await repository.save(snapshot);
  assert.deepEqual((await repository.load(snapshot.id))?.placements,placements);
  assert.equal(WorkspaceSnapshotSchema.safeParse({...snapshot,placements:[{...placements[0],offset:0}]}).success,false);
  assert.equal(WorkspaceSnapshotSchema.safeParse({...snapshot,placements:[placements[0],placements[0]]}).success,false);
  assert.equal(WorkspaceSnapshotSchema.safeParse({...snapshot,placements:[{...placements[0],selectionId:'other'}]}).success,false);
  assert.equal(WorkspaceSnapshotSchema.safeParse({...snapshot,placements:[{...placements[0],artifactId:'missing'}]}).success,false);
  await repository.close();
});

test('saved image resources reserve dimensions and reject temporary URLs or executable media',()=>{
  const image={status:'ready',resource:{dataUrl:'data:image/png;base64,aGVsbG8=',width:320,height:180},prompt:'A test image',caption:'Test'};
  assert.equal(GeneratedImageSchema.safeParse(image).success,true);
  assert.equal(GeneratedImageSchema.safeParse({...image,resource:{...image.resource,dataUrl:'https://example.com/temporary.png'}}).success,false);
  assert.equal(GeneratedImageSchema.safeParse({...image,resource:{...image.resource,dataUrl:'data:image/svg+xml;base64,aGVsbG8='}}).success,false);
  assert.equal(GeneratedImageSchema.safeParse({...image,resource:{...image.resource,height:0}}).success,false);
});
