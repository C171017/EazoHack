import { loadMapStore, nodeDetail, visibleLinks, unplacedNotes } from '@/server/book-map/store';
import { ZOOM_POLICY } from '@/shared/zoom-hierarchy';
export const runtime='nodejs';
export async function GET(request:Request) {
  try {
    const url=new URL(request.url),q=url.searchParams,store=await loadMapStore();
    const {graph,hierarchy,entries}=store;
    if(q.get('version')!==hierarchy.version)return Response.json({error:'Map version changed. Reload to open the new version.'},{status:409});
    const json=(body:object)=>Response.json({version:hierarchy.version,...body},{headers:{'Cache-Control':'private, no-store'}});
    const id=q.get('id')??'',kind=q.get('kind');
    if(kind==='unplaced') {
      const offset=Number(q.get('offset')??0);
      if(!Number.isInteger(offset)||offset<0)return Response.json({error:'Invalid unplaced offset'},{status:400});
      return json(unplacedNotes(store,offset));
    }
    if(kind==='children') {
      const ids=q.getAll('id');
      if(!ids.length||ids.length>12||ids.some(id=>!hierarchy.children[id]))return Response.json({error:'Invalid child request'},{status:400});
      return json({pages:Object.fromEntries(ids.map(id=>[id,hierarchy.children[id].map(child=>entries.get(child)!)]))});
    }
    if(kind==='detail') {const detail=nodeDetail(store,id);return detail?json({detail}):Response.json({error:'Unknown occurrence'},{status:404});}
    if(kind==='anchor') {const anchor=graph.anchors.find(a=>a.id===id);return anchor?json({anchor}):Response.json({error:'Unknown anchor'},{status:404});}
    if(kind==='locate') {
      const node=entries.get(id);if(!node)return Response.json({error:'Unknown node'},{status:404});
      const ancestors:string[]=[];let parent=node.parentId;
      while(parent){ancestors.unshift(parent);parent=entries.get(parent)!.parentId;}
      return json({node,ancestors,pages:Object.fromEntries(ancestors.map(id=>[id,hierarchy.children[id].map(child=>entries.get(child)!)]))});
    }
    if(kind==='edges') {
      const ids=q.getAll('id');if(ids.length>ZOOM_POLICY.nodes||new Set(ids).size!==ids.length||ids.some(id=>!entries.has(id)))return Response.json({error:'Invalid visible set'},{status:400});
      const start=Number(q.get('start')??0),end=Number(q.get('end')??1);
      if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>1||start>end)return Response.json({error:'Invalid range'},{status:400});
      const links=visibleLinks(store,ids,{theme:q.get('theme'),role:q.get('role'),start,end});return json({links:links.slice(0,ZOOM_POLICY.edges),total:links.length});
    }
    return Response.json({error:'Unknown map request'},{status:400});
  } catch(error) {
    console.error('Map request failed:',error instanceof Error?error.message:'Unknown error');
    return Response.json({error:'Could not load map data. Please retry.'},{status:503});
  }
}
