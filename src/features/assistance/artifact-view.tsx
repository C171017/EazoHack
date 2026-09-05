import type { Artifact, InteractiveUiConfig } from '@/shared/schemas';
type State = Record<string,string|number|boolean|null>;
export function InteractiveConfig({config,state,onStateChange}:{config:InteractiveUiConfig;state:State;onStateChange:(state:State)=>void}) {
  return <div className="space-y-4">{config.components.map((item,index)=>{
    switch(item.component) {
      case 'ExplanationCard':return <div key={index}><h4 className="font-reading text-lg">{item.props.title}</h4><p className="mt-2 text-xs leading-6 text-muted">{item.props.body}</p></div>;
      case 'ParameterSlider': {
        const {min,max,value,step,label,unit}=item.props;
        const stored=state[String(index)];
        const current=typeof stored==='number'?Math.min(max,Math.max(min,stored)):value;
        return <label key={index} className="block text-xs"><span className="flex justify-between"><span>{label}</span><span>{current} {unit}</span></span><input aria-label={label} type="range" min={min} max={max} step={step} value={current} onChange={e=>onStateChange({...state,[String(index)]:Number(e.target.value)})} className="mt-3 w-full accent-moss"/><span className="text-[10px] text-muted">Fixture state control; no validated teaching model.</span></label>;
      }
      case 'ComparisonTable':return <div key={index} className="overflow-x-auto"><h4 className="mb-2 text-xs font-medium">{item.props.title}</h4><table className="w-full text-left text-xs"><thead><tr>{item.props.columns.map((column,i)=><th key={i} className="border-b border-line p-2">{column}</th>)}</tr></thead><tbody>{item.props.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j} className="border-b border-line p-2">{cell}</td>)}</tr>)}</tbody></table></div>;
      case 'StepSequence':return <div key={index}><h4 className="text-xs font-medium">{item.props.title}</h4><ol className="mt-2 list-inside list-decimal space-y-2 text-xs">{item.props.steps.map((step,i)=><li key={i}>{step}</li>)}</ol></div>;
      case 'SimplePlot': {
        const xs=item.props.points.map(p=>p.x),ys=item.props.points.map(p=>p.y),minX=Math.min(...xs),minY=Math.min(...ys),dx=Math.max(...xs)-minX||1,dy=Math.max(...ys)-minY||1;
        return <figure key={index}><figcaption className="text-xs">{item.props.title}</figcaption><svg role="img" aria-label={`${item.props.title}: ${item.props.xLabel} versus ${item.props.yLabel}`} viewBox="0 0 360 160" className="mt-2 w-full"><path d="M 30 10 V 135 H 350" fill="none" stroke="#66736a"/><polyline points={item.props.points.map(p=>`${30+310*(p.x-minX)/dx},${130-110*(p.y-minY)/dy}`).join(' ')} fill="none" stroke="#82a98a" strokeWidth="2"/></svg><p className="text-[10px] text-muted">{item.props.xLabel} / {item.props.yLabel}</p></figure>;
      }
    }
  })}<p className="border-t border-line pt-3 text-[10px] leading-5 text-muted">{config.validationStatus} · {config.assumptions.join(' ')}</p></div>;
}
export function ArtifactView({artifact,state,onStateChange}:{artifact:Artifact;state:State;onStateChange:(state:State)=>void}) {
  return <article className="rounded-panel border border-line bg-paper p-5"><div className="mb-4 flex justify-between text-[10px] uppercase tracking-widest"><span>{artifact.kind.replaceAll('_',' ')}</span><span className="text-moss">Mock fixture</span></div>
    {artifact.kind==='interactive_ui'&&<InteractiveConfig config={artifact.payload} state={state} onStateChange={onStateChange}/>}
    {artifact.kind==='generated_image'&&<div className="rounded-lg border border-dashed border-line bg-mist p-6 text-center"><span className="text-3xl text-muted">▧</span><p className="mt-3 text-sm">No image generated</p><p className="mt-2 text-xs leading-5 text-muted">{artifact.payload.caption}</p></div>}
    {artifact.kind==='source_discovery'&&<div><h4 className="font-reading text-lg">Source scope is still open.</h4><p className="mt-2 text-xs leading-6 text-muted">{artifact.payload.summary}</p><p className="mt-3 text-[10px] text-muted">0 retrieved references · no search performed</p></div>}
    {artifact.kind==='concept_diagram'&&<div><svg viewBox={`0 0 520 ${Math.max(120,artifact.payload.nodes.length*65)}`} role="img" aria-label="Mock passage diagram" className="w-full">{artifact.payload.edges.map(edge=>{const a=artifact.payload.nodes.findIndex(n=>n.id===edge.source),b=artifact.payload.nodes.findIndex(n=>n.id===edge.target);return <g key={edge.id}><line x1="180" y1={a*65+30} x2="180" y2={b*65+30} stroke="#66736a"/><text x="315" y={(a+b)*32.5+35} fill="#969d98" fontSize="10">{edge.label}</text></g>;})}{artifact.payload.nodes.map((node,i)=><g key={node.id}><rect x="35" y={i*65+10} width="260" height="42" rx="9" fill="#121513" stroke="#292d2a"/><text x="165" y={i*65+35} textAnchor="middle" fill="#f3f4f1" fontSize="12">{node.label}</text></g>)}</svg><p className="text-[10px] leading-5 text-muted">{artifact.payload.legend}</p></div>}
  </article>;
}
