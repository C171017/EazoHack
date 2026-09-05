import { useId } from 'react';
import { activeExplorerIndex, type Explorer, type InteractivePanel as PanelConfig, type PanelState } from '@/shared/interactive-panel';

function ExplorerResult({ item, baseline = false }: { item: Explorer['states'][number]; baseline?: boolean }) {
  return <section className="min-w-0 space-y-3 rounded-xl border border-line bg-mist/40 p-4" aria-label={`${baseline ? 'Baseline: ' : ''}${item.label}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h5 className="text-sm font-medium">{item.label}</h5>
      <span className="text-[10px] text-muted">{item.basis === 'hypothesis' ? 'Hypothetical case' : 'Passage interpretation'}{baseline ? ' · Baseline' : ''}</span>
    </div>
    <div className="space-y-2 text-xs leading-6">
      <p><span className="font-medium">Condition / stage</span><br/>{item.premise}</p>
      <div aria-hidden="true" className="enhancement-heading text-lg">↓</div>
      <p><span className="font-medium">What follows</span><br/>{item.outcome}</p>
      <p className="text-muted">{item.explanation}</p>
    </div>
    <div className="border-t border-line pt-3">
      <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">{item.basis === 'hypothesis' ? 'Passage behind this what-if' : 'From your selection'}</p>
      <blockquote className="border-l-2 border-current pl-3 font-reading text-sm leading-6">{item.evidenceQuote}</blockquote>
    </div>
  </section>;
}

/** Controlled state lives with the artifact, including across enhancement undo/redo. */
export function InteractivePanel({ config, state, onStateChange }: { config: PanelConfig; state: PanelState; onStateChange: (state: PanelState) => void }) {
  const id = useId();
  const { explorer } = config;
  const index = activeExplorerIndex(explorer, state);
  const current = explorer.states[index];
  const isSequence = explorer.mode === 'sequence';
  const compare = !isSequence && state.compareBaseline === true;
  const select = (activeIndex: number) => onStateChange({ ...state, activeIndex });
  const buttonClass = 'rounded-lg border border-line px-3 py-2 text-xs transition-colors hover:bg-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:opacity-40';

  return <div className="space-y-4" data-interactive-panel={explorer.mode}>
    <header><h4 className="font-reading text-xl">{explorer.title}</h4><p className="mt-2 text-sm leading-6 text-muted">{explorer.goal}</p></header>
    <fieldset>
      <legend className="mb-2 text-xs font-medium">{explorer.controlLabel}</legend>
      <div className="flex flex-wrap gap-2">
        {explorer.states.map((item, i) => <button key={i} type="button" aria-pressed={i === index} aria-controls={`${id}-result`}
          className={`${buttonClass} ${i === index ? 'enhancement-heading bg-mist font-medium' : 'text-muted'}`}
          onClick={() => select(i)}>{isSequence ? `${i + 1}. ` : ''}{item.label}</button>)}
      </div>
    </fieldset>
    {isSequence ? <div className="space-y-2">
      <label className="flex justify-between gap-2 text-xs" htmlFor={`${id}-step`}><span>Explore the sequence</span><span>{index + 1} / {explorer.states.length}</span></label>
      <input id={`${id}-step`} aria-valuetext={`Step ${index + 1}: ${current.label}`} type="range" min={0} max={explorer.states.length - 1} step={1} value={index}
        onChange={event => select(Number(event.target.value))} className="w-full accent-[var(--enhancement-color)]"/>
      <div className="flex justify-between gap-2"><button type="button" className={buttonClass} disabled={index === 0} onClick={() => select(index - 1)}>Previous step</button>
        <button type="button" className={buttonClass} disabled={index === explorer.states.length - 1} onClick={() => select(index + 1)}>Next step</button></div>
    </div> : <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={compare} onChange={event => onStateChange({ ...state, compareBaseline: event.target.checked })}
      className="accent-[var(--enhancement-color)]"/>Compare with {explorer.states[0].label}</label>}
    <div id={`${id}-result`} aria-live="polite" aria-atomic="true" className="space-y-3">
      {compare && index !== 0 && <ExplorerResult item={explorer.states[0]} baseline/>}
      <ExplorerResult item={current}/>
    </div>
    <p className="text-xs leading-6"><span className="font-medium">Takeaway </span>{explorer.takeaway}</p>
    <footer className="border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] text-muted">{config.validationStatus === 'mock_unverified' ? 'Demo fixture · No model called' : config.validationStatus === 'reviewed' ? 'Reviewed reading aid' : 'AI reading aid · Not independently verified'}</span>
        <button type="button" className={buttonClass} disabled={index === 0 && !compare} onClick={() => onStateChange({ ...state, activeIndex: 0, compareBaseline: false })}>Reset exploration</button>
      </div>
      <details className="mt-3 text-xs leading-6 text-muted"><summary className="cursor-pointer">Assumptions & limitations</summary><ul className="mt-2 list-disc space-y-1 pl-4">{explorer.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul></details>
    </footer>
  </div>;
}
