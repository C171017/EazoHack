# API-first, cost-aware model shortlist

Revision: 2026-09-05. Supersedes the default recommendations in [the initial research report](20-generation-model-research.md). User clarified that generation runs through APIs with an application harness less capable than Claude Code/Codex, and cost must receive more weight. Global backend access remains assumed. No API implementation, paid generation or output benchmark was performed.

## What changes

The initial advanced-panel shortlist gave too much weight to model-plus-agent coding evidence. API use does not inherently weaken the underlying model, but a simple request does not inherit the agent application's context preparation, tools, execution feedback, visual checks or repair loop. There is no defensible universal percentage penalty that converts coding-agent scores into Eazo API scores.

The proposal assumes passage context, a precise output contract, application validation/rendering, and at most one bounded repair request. This is an evaluation assumption, not a newly implemented or approved retry policy. No autonomous browser/debugging agent is assumed. With no repair at all, Eazo-specific confidence is lower.

These are provisional **suitability scores**, not measured first-pass success rates. Dimensions: Q = task quality (including source fidelity and useful explanation/design), R = API/output-contract fit (and editing/maturity for images), C = cost fit, L = responsiveness. Q and R contain untested judgments; documented schema support is not proof of semantic correctness. Differences under five points are inconclusive. New weights mean these scores cannot be compared numerically with the initial report.

| Method | Q | R | C | L |
| --- | ---: | ---: | ---: | ---: |
| Explanation | 45% | 20% | 25% | 10% |
| Diagram | 40% | 25% | 25% | 10% |
| Illustration | 45% | 20% | 25% | 10% |
| Interactive panel | 45% | 25% | 20% | 10% |

Q emphasizes clarity for Explanation, correct relationships/readability for Diagram, fidelity/composition for Illustration, and conceptual/functional correctness for Interactive panel. C is a relative editorial rating informed by published prices; no unknown retry rate is fabricated. Score = sum(rating × percentage weight)/10, rounded to whole numbers. Ratings are 0–10, with 10 meaning strongest relative fit, not perfection.

## Explanation

| Model | Q | R | C | L | Score /100 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Gemini 3.8 Flash | 8.5 | 8.5 | 9 | 9 | **87** |
| GPT-5.6 Luna | 7.5 | 9 | 10 | 9 | **86** |
| Claude Sonnet 5 | 8.5 | 9 | 7 | 7.5 | **81** |

## Diagram

| Model | Q | R | C | L | Score /100 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Gemini 3.8 Flash | 8.3 | 8.5 | 9 | 9 | **86** |
| GPT-5.6 Sol | 9.2 | 9 | 6 | 7.5 | **82** |
| Claude Sonnet 5 | 8.5 | 8.5 | 7 | 7.5 | **80** |

## Illustration

| Model | Q | R | C | L | Score /100 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Gemini 3.1 Flash Image | 8.8 | 9 | 8 | 8.5 | **86** |
| MAI-Image-2.6 | 9 | 6.5 | 9 | 7 | **83** |
| GPT Image 2 high | 9.4 | 9 | 4 | 6.5 | **77** |

## Interactive panel

| Model | Q | R | C | L | Score /100 |
| --- | ---: | ---: | ---: | ---: | ---: |
| GPT-5.6 Sol | 9.2 | 9 | 7 | 7.5 | **85** |
| Gemini 3.8 Flash | 8 | 8.5 | 9 | 9 | **84** |
| Claude Sonnet 5 | 8.5 | 8.5 | 8 | 7.5 | **83** |

## Reasons and providers

| Method | Model / provider | Proposed role and limits |
| --- | --- | --- |
| Explanation | Gemini 3.8 Flash / Google Gemini API | First balanced trial; low/medium thinking and a compact structured note. Good price/capability combination; actual passage fidelity must be checked. |
| Explanation | GPT-5.6 Luna / OpenAI Responses API | Budget challenger for short, straightforward explanations. Native structured output and very low token price; not presumed equivalent to larger models on ambiguous arguments. |
| Explanation | Claude Sonnet 5 / Anthropic Claude API | Mid-priced alternative for explanation organization and language. This is a hypothesis to test, not evidence it beats Flash at teaching. |
| Diagram | Gemini 3.8 Flash / Google Gemini API | First trial when Eazo renders validated nodes/edges/chart data using stable layouts. The renderer handles much of the visual difficulty. |
| Diagram | GPT-5.6 Sol / OpenAI Responses API | Higher-quality challenger for complex relationships or unusual compositions; appreciably more expensive. |
| Diagram | Claude Sonnet 5 / Anthropic Claude API | Middle-cost alternative for graph/specification generation; no directly verified SVG superiority. |
| Illustration | Gemini 3.1 Flash Image / Google Gemini API | First balanced trial at 1K, with reference/edit support; use 512px only if readability suffices. |
| Illustration | MAI-Image-2.6 / Microsoft Foundry | Conditional inexpensive challenger; public preview and an unverified official tariff reduce confidence. |
| Illustration | GPT Image 2 / OpenAI Images API | Premium illustration option; score/cost here use high quality because that is the verified leaderboard setting. Test medium separately rather than assuming high-setting quality transfers. |
| Interactive panel | GPT-5.6 Sol / OpenAI Responses API | First quality-oriented trial for moderately complex state/configuration design, without assuming an autonomous repair harness. |
| Interactive panel | Gemini 3.8 Flash / Google Gemini API | Budget-first choice for bounded panels using tested components and mechanisms. |
| Interactive panel | Claude Sonnet 5 / Anthropic Claude API | Middle-cost alternative for the same panel contracts; test against Sol and Flash. |

The panel ranking does not establish that any candidate can reliably produce unrestricted Three.js in a single call. Free-form 3D generation needs its own compilation/execution/visual test evaluation; a stronger model alone does not replace those checks. Astra, Opus and Fable become escalation candidates rather than everyday defaults. Luna is not shortlisted for complex diagram/panel generation because current evidence does not establish sufficient semantic/behavioral quality there.

## Comparable text cost examples

USD per million uncached standard-service tokens: Luna **$0.20/$1.20**, Flash **$0.75/$3.75**, Sonnet **$2/$10**, Sol **$4/$20** (input/output). Flash promotion ends Dec 31, 2026, then $1.50/$7.50; Sol promotion lasts at least through Nov 21. Prices below long-context thresholds; no batch, caching or regional premiums assumed.

These examples use fixed **total billable output tokens including reasoning**, not just visible response length. They are arithmetic scenarios, not observed workload averages. If reasoning exceeds the example budget, actual charges increase. Same token count is an accounting normalization; providers tokenize text differently.

| Model | Explanation: 3K input + 1K total output | Diagram: 4K input + 2K total output | Panel: 6K input + 6K total output |
| --- | ---: | ---: | ---: |
| Luna | $0.0018 | $0.0032 | $0.0084 |
| Flash | $0.0060 | $0.0105 | $0.0270 |
| Sonnet | $0.0160 | $0.0280 | $0.0720 |
| Sol | $0.0320 | $0.0560 | $0.1440 |

Per 1,000 attempts, multiply these figures by 1,000. In the panel scenario that is $27 for Flash, $72 for Sonnet, $144 for Sol. Repairs may include more input context and cost more than the first call. Production metric: total generation + repair + tool spending divided by number of accepted artifacts, with failures retained in the numerator. Also report acceptance rate and latency; a cheap failed result is not good value.

## Image cost scope

- Gemini 3.1 Flash Image: official output price **$0.045/512px**, **$0.067/1K**, plus inputs and applicable text/thinking output. A thousand 1K outputs therefore starts at $67, before retries.
- MAI-Image-2.6: prior AA representative estimate **$0.0389/image**, not a verified final Foundry tariff. Treat this price and ranking as provisional until account pricing is confirmed.
- GPT Image 2 high: prior AA representative estimate **$0.211/image**, not a flat tariff. Official billing is $5/M text input tokens, $8/M image input, $30/M image output. Medium/low may cost less; no matched quality comparison was established here.

These are different image configurations, not matched-cost benchmark results. Do not infer precise savings from the ratio. No image quality scores are extrapolated from high to medium.

## Evidence and validation status

Official API/pricing checks:

- [Luna model, structured output and rates](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
- [Sol model](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [Sonnet model and rates](https://platform.claude.com/docs/en/models/sonnet-5/overview)
- [Flash model/effort](https://ai.google.dev/gemini-api/docs/latest-model?hl=en)
- [Google text/image pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Foundry MAI model access](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image)
- [AA image configuration evidence](https://artificialanalysis.ai/image/leaderboard/text-to-image)

The earlier report preserves benchmark references and their limitations. General-intelligence results are not clean first-call teaching benchmarks; coding-agent ranks receive no numeric conversion or direct scoring bonus in this revision. Lower effort settings are proposed for testing, not assumed to inherit max-effort results.

Before selecting defaults, compare these APIs under the same source context, schema, renderer, output limits and one-repair cap. Log semantic quality, acceptance rate, first-pass validity, repair frequency, actual billable tokens and wall time. No such test was run in this research revision. Documentation-only update; no runtime/provider changes.
