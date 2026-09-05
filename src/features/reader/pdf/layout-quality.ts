import type { Fragment } from './model';

/** Look for repeated wide gutters, not merely words on both halves of a line. */
export function hasAmbiguousLayout(fragments:Fragment[]) {
  const rows:{center:number;height:number;runs:Fragment[]}[]=[];
  for(const f of fragments.filter(f=>f.text.trim()).sort((a,b)=>a.rect.y-b.rect.y)) {
    const last=rows.at(-1);
    const center=f.rect.y+f.rect.height/2;
    if(last&&Math.abs(center-last.center)<Math.max(last.height,f.rect.height)*.75) {
      last.center=(last.center*last.runs.length+center)/(last.runs.length+1);
      last.height=Math.max(last.height,f.rect.height);
      last.runs.push(f);
    } else rows.push({center,height:f.rect.height,runs:[f]});
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
