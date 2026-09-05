import { axisValue, axisMaximum, type BookAxisVersion } from '../../shared/book-axes';
import type { NodeDetail } from '../../shared/zoom-hierarchy';
import type { SourceAnchor } from '../../shared/schemas';

export function AxisDetails({detail,onSource,onLocate,axisVersion}:{axisVersion?:BookAxisVersion;detail:NodeDetail;onSource:(anchor:SourceAnchor)=>void;onLocate:(id:string)=>void}) {
  const a=detail.node.axisAssessment;
  if(!a)return null;
  return <details className="map-axis-evidence"><summary>Why this position?</summary>
    {([['Reasoning depth',a.reasoningDepth],['Generality',a.generality]] as const).map(([label,rating])=><div key={label}><p><strong>{label}: {axisValue(rating.value,axisVersion)}</strong><br/>{rating.rationale}</p>{rating.anchorIds.map(id=>{const anchor=detail.anchors.find(a=>a.id===id);return anchor?<button key={id} className="map-source-button" onClick={()=>onSource(anchor)}>Read {label.toLowerCase()} evidence ↗</button>:null;})}</div>)}
    {!!a.reasoningDepth.prerequisiteNodeIds.length&&<><p>Builds on</p><div className="map-related">{a.reasoningDepth.prerequisiteNodeIds.map(id=><button key={id} onClick={()=>onLocate(id)}>{detail.neighbours.find(n=>n.id===id)?.label??id} ↗</button>)}</div></>}
    <p>Source-grounded model interpretation. Ratings use 0–{axisMaximum(axisVersion)}; grid lines are spatial guides, not score bins. The scale is ordered; equal numeric differences need not mean equal differences in meaning.</p>
  </details>;
}
