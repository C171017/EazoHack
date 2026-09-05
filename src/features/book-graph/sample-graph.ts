import { GraphSchema, SourceAnchorSchema } from '../../shared/schemas';
import type { BookPreview } from '../reader/book-preview';

// Editorial navigation sample, not model output or whole-book analysis.
const seeds = [
  ['festival','Civic ritual','Prayers at the Piraeus',0,0,'I went down yesterday to the Piraeus','327A'],
  ['festival','Civic ritual','The torch-race',0,0,'Adeimantus added: Has no one told you','328A'],
  ['dialogue','Persuasion','Strength in numbers',1,0,'And are you stronger than all these?', '327C'],
  ['dialogue','Persuasion','An alternative: persuasion',1,2,'May there not be the alternative, I said,','327C'],
  ['dialogue','Listening','Refusing to listen',1,1,'But can you persuade us, if we refuse','327C'],
  ['dialogue','Conversation','The pleasure of conversation',1,2,"You don't come to see me, Socrates,",'328C–D'],
  ['age','Age and character','A traveller’s question',2,4,'I replied: There is nothing which for my part','328E'],
  ['age','Age and character','The complaints of age',2,0,'I will tell you, Socrates, he said,','329A–D'],
  ['age','Age and character','Character, not age',2,3,"The truth\nis, Socrates, that these regrets,",'329D'],
] as const;

export function createSampleGraph(preview: BookPreview) {
  const graphVersion = `republic-opening-3d-v1-${preview.fileHash.slice(0,8)}`;
  const anchors = seeds.map(([key,,label,,,phrase],i) => {
    const start = preview.text.indexOf(phrase);
    if(start < 0) throw new Error(`Sample source missing: ${label}`);
    const paragraphEnd = preview.text.indexOf('\n\n',start);
    const end = paragraphEnd < 0 ? preview.text.length : paragraphEnd;
    return SourceAnchorSchema.parse({id:`map-anchor-${key}-${i}`,bookId:'plato-republic',fileHash:preview.fileHash,extractionVersion:preview.extractionVersion,locators:[{kind:'txt',startOffset:preview.startOffset+start,endOffset:preview.startOffset+end}],quote:preview.text.slice(start,end),prefix:preview.text.slice(Math.max(0,start-40),start),suffix:preview.text.slice(end,end+40),resolution:'exact'});
  });
  const identityNames = [...new Set(seeds.map(s => s[1]))];
  const identityId = (name: string) => `identity-${identityNames.indexOf(name as typeof identityNames[number])}`;
  const evidence = (anchorIds: string[],rationale: string) => ({anchorIds,rationale,ruleVersion:'editorial-sample-v1',confidence:null});
  const territories = ['Civic life','Dialogue','Age & character'].map((label,i) => {
    const anchorIds = seeds.flatMap((s,j) => s[3] === i ? [anchors[j].id] : []);
    return {id:`territory-${i}`,label,centroidX:[0.12,0.5,0.88][i],anchorIds,coverage:anchorIds.length/seeds.length,orderLocked:true,evidence:evidence(anchorIds,'Editorial grouping of the opening excerpt. Coverage is the fraction of sample occurrences, not the whole book. Theme order follows civic gathering → conversation → reflection on age; proximity is navigational.')};
  });
  const nodes = seeds.map(([,identity,label,theme,level,,source],i) => ({
    id:`occurrence-${i}`,identityId:identityId(identity),kind:'occurrence',label,
    summary:`Editorial reading of Book I, ${source}. This occurrence is anchored to the original excerpt; the theme and level are interpretive.`,
    anchorIds:[anchors[i].id],themeTerritoryIds:[territories[theme].id],structuralLevel:level,
    position:{x:territories[theme].centroidX,y:level,z:anchors[i].locators[0].startOffset/preview.totalCharacters},
    evidence:evidence([anchors[i].id],`Placed in “${territories[theme].label}”. ${['A directly locatable scene or example.','A claim made in the exchange.','A reusable concept expressed in the passage.','An explanation organizing several claims.','A question organizing the following discussion.'][level]} Classification is provisional, with confidence unassessed.`),sourceLabel:`Book I · ${source}`,
  }));
  const pairs = [[2,3,'contrasts with'],[3,4,'is challenged by'],[6,7,'elicits'],[7,8,'is reframed by']] as const;
  return GraphSchema.parse({id:'republic-opening-map',bookId:'plato-republic',graphVersion,fileHash:preview.fileHash,extractionVersion:preview.extractionVersion,sourceLength:preview.totalCharacters,anchors,territories,nodes,
    identities:identityNames.map(label=>({id:identityId(label),label,summary:'Shared editorial identity; no single source coordinate is assigned.',occurrenceIds:nodes.filter(n=>n.identityId===identityId(label)).map(n=>n.id)})),
    edges:pairs.map(([a,b,type],i)=>({id:`relation-${i}`,source:nodes[a].id,target:nodes[b].id,type,evidenceAnchorIds:[anchors[a].id,anchors[b].id],rationale:'Editorial interpretation of the paired passages in this sample; not a verified whole-book relation.',provenance:'editorial'})),
  });
}
