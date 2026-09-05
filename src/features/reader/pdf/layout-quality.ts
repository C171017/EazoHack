import type { Fragment } from './model';

/** Look for repeated wide gutters, not merely words on both halves of a line. */
export function hasAmbiguousLayout(fragments:Fragment[]) {
  const rows:{y:number;height:number;runs:Fragment[]}[]=[];
  for(const f of fragments.filter(f=>f.text.trim()).sort((a,b)=>a.rect.y-b.rect.y)) {
    const last=rows.at(-1);
    if(last&&Math.abs(f.rect.y-last.y)<Math.min(last.height,f.rect.height)*.55)last.runs.push(f);
    else rows.push({y:f.rect.y,height:f.rect.height,runs:[f]});
  }
  const gutters:{left:number;right:number}[]=[];
  for(const row of rows) {
    const sorted=row.runs.sort((a,b)=>a.rect.x-b.rect.x);
    let edge=sorted[0].rect.x+sorted[0].rect.width;
    for(const run of sorted.slice(1)) {
      if(run.rect.x-edge>.045)gutters.push({left:edge,right:run.rect.x});
      edge=Math.max(edge,run.rect.x+run.rect.width);
    }
  }
  return gutters.some(g=>gutters.filter(other=>Math.min(g.right,other.right)-Math.max(g.left,other.left)>.025).length>=4);
}
