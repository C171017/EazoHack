# Generation model and inference-provider shortlist

> Superseded default shortlist: user clarified API-only generation with a lighter harness and greater cost sensitivity. Use [API-first cost-aware revision](21-api-cost-model-shortlist.md). This report retains the initial research evidence and historical ratings.


Research snapshot: **2026-09-05**. User confirmed global backend/API access. These are recommendations for testing, not approved provider selections. No paid model calls or Eazo output benchmark was run. Product taxonomy: [four methods](19-enhancement-methods.md).

## Scope and interpretation

The practical shortlist balances output quality with an in-reader workflow. It is not the three highest general-intelligence models regardless of cost. Explanation and diagrams emphasize routine use; interactive panels emphasize the requested advanced simulation/Three.js trajectory. For configuration-only panels the premium models may be unnecessary.

All scores are **editorial fit estimates**, not benchmark percentages, measured accuracy, or learning gains. Ratings are 0–10 (10 means strongest relative fit, not flawless), weighted and rounded to /100. Differences of 1–4 points are inconclusive until Eazo tests them. Benchmark evidence, documented API capabilities, and untested product-fit inference are kept distinct. Styling is application-owned; a writing model does not determine typography quality.

## Criteria

| Method | Weighted criteria | What must be checked on real passages |
| --- | --- | --- |
| Explanation | Fidelity/reasoning 35%; teaching clarity 25%; structured output 20%; responsiveness 10%; cost 10% | Preserve qualifications, separate inference from text, explain rather than merely paraphrase, produce concise useful sections |
| Diagram | Meaning/source fidelity 30%; valid code/schema 25%; visual organization 20%; speed 15%; cost 10% | Correct edge direction and type, readable labels, no clipping/overlap, no invented relations |
| Illustration | Passage/instruction fidelity 35%; composition 20%; editing/reference consistency 20%; API/iteration fit 15%; cost 10% | Correct entities, counts and spatial relations, no misleading invented detail, legible at reader size |
| Interactive panel | Functional correctness 35%; conceptual/math correctness 25%; interaction design 20%; integration 10%; cost/latency 10% | Meaningful controls, correct state updates, explicit assumptions, reset and boundaries, actual learning value |

## 1. Explanation

Component columns follow the criterion order above. Formula: sum(component × percentage weight) / 10.

| Candidate and provider | Fidelity | Clarity | Structure | Responsiveness | Cost | Score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GPT-5.6 Sol — OpenAI Responses API | 9.2 | 9.0 | 9.5 | 7.5 | 7.5 | **89** |
| Claude Opus 5 — Anthropic Claude API | 9.5 | 9.3 | 9.3 | 6.5 | 6.5 | **88** |
| Gemini 3.8 Flash — Google Gemini API | 8.6 | 8.5 | 9.0 | 9.0 | 9.5 | **88** |

**Sol is my first trial, with Opus effectively tied.** Sol combines strong document-reasoning evidence with native structured output and a lower fixed-token price than Opus. Its current AA v4.2 score is 51; it scored 28.2% on GDP.pdf's demanding all-criteria-pass metric. Those are broad document-task signals, not measured teaching clarity. [Official model](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [AA model](https://artificialanalysis.ai/models/gpt-5-6-sol), [GDP.pdf results](https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-2).

**Opus is the premium challenger for difficult interpretations and argument-heavy passages.** Current AA v4.2 is 54; AA-Briefcase also places it among the leaders. This supports complex reasoning, while superior passage explanations remain a hypothesis. Its slower generation and higher price reduce routine-use fit. [Official model](https://platform.claude.com/docs/en/models/opus-5/overview), [AA model](https://artificialanalysis.ai/models/claude-opus-5).

**Flash is the economical frequent-use candidate.** GA status, adjustable thinking, and much lower token pricing make it attractive for repeated explanations. Current AA v4.2 is 47. The September 2 analysis reported fast output but substantial reasoning-token usage: high tokens/second does not establish low time-to-visible-answer. Begin testing low/medium effort; do not claim the high-effort benchmark score applies at those settings. [Official model guide](https://ai.google.dev/gemini-api/docs/latest-model?hl=en), [AA current model](https://artificialanalysis.ai/models/gemini-3-8-flash), [dated speed/effort analysis](https://artificialanalysis.ai/articles/gemini-3-8-flash).

Desired explanation output: a short main idea, two or three explanatory sections, a useful example when appropriate, and a clearly marked ambiguity/interpretation note. These are proposed evaluation targets, not a locked content template.

## 2. Diagram

| Candidate and provider | Fidelity | Validity | Organization | Speed | Cost | Score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GPT-5.6 Sol — OpenAI Responses API | 9 | 9 | 9 | 8 | 7 | **87** |
| Claude Opus 5 — Anthropic Claude API | 9 | 10 | 9 | 6 | 6 | **85** |
| Gemini 3.8 Flash — Google Gemini API | 8 | 8 | 8 | 9 | 10 | **83** |

**Sol:** first candidate for graphs, timelines and comparisons. AA's Astra comparison reports particularly strong Sol presentation results, an indirect signal for organizing diagrams. Structured outputs suit validated graph specifications. **Opus:** candidate for complicated relationships, argument decomposition and repair; strong coding evidence, with more cost and waiting. **Flash:** economical for standard layouts supplied by our renderer; less evidence for nuanced or unusual structures. [AA presentation/coding comparison](https://artificialanalysis.ai/articles/benchmarking-gpt-6-astra), [Opus comparison](https://artificialanalysis.ai/articles/claude-fable-5-1), [Flash schema capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash).

No source reviewed establishes a comparative SVG accuracy or label-overlap rate. A controlled renderer can remove many layout errors independently of model choice. Exact numerical plots and logical relationships should use this route rather than asking a raster image model to draw them accurately.

## 3. Illustration

| Candidate and provider | Fidelity | Clarity | Edits | Integration | Cost | Score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GPT Image 2 — OpenAI Images API | 9.5 | 9.4 | 9.2 | 8.0 | 6.5 | **89** |
| Gemini 3.1 Flash Image — Google Gemini API | 8.8 | 8.8 | 8.8 | 9.0 | 8.0 | **88** |
| MAI-Image-2.6 — Microsoft Foundry | 9.0 | 9.0 | 9.0 | 6.5 | 9.0 | **86** |

**GPT Image 2:** quality-first candidate. AA's current text-to-image leaderboard places its high setting first at Elo **1177 ±10**. Official APIs support generation and editing. Use the high-setting result as evidence for that setting, not all settings. [Model and snapshot](https://developers.openai.com/api/docs/models/gpt-image-2), [AA leaderboard](https://artificialanalysis.ai/image/leaderboard/text-to-image).

**Gemini 3.1 Flash Image:** balanced candidate for frequent illustration and revisions. Supports multi-turn editing and reference images. AA Elo **1121 ±9** (fourth in the retrieved leaderboard); 1K output image price $0.067 plus applicable input and other output costs. [Image guide](https://ai.google.dev/gemini-api/docs/image-generation), [pricing](https://ai.google.dev/gemini-api/docs/pricing).

**MAI-Image-2.6:** promising low-price challenger. AA Elo **1149 ±12**, second on the retrieved leaderboard. Microsoft opened public preview on September 4; the integration score discounts this very recent rollout, not measured unreliability. Generation and editing supported. [September 4 announcement](https://microsoft.ai/news/pushing-the-quality-cost-frontier-with-mai-image-2-6/), [Foundry model/version docs](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image).

AA image Elo measures blind preference, not factual faithfulness or instructional effectiveness. Its ranking alone cannot tell us which model preserves a book's spatial relations. No automatic search grounding is part of this recommendation.

## 4. Interactive panel

| Candidate and provider | Functional | Conceptual | Interaction | Integration | Cost/latency | Score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GPT-6 Astra — OpenAI Responses API | 10 | 9 | 9 | 10 | 6 | **92** |
| Claude Opus 5 — Anthropic Claude API | 10 | 9 | 9 | 10 | 5 | **91** |
| Claude Fable 5.1 — Anthropic Claude API | 10 | 10 | 9 | 9 | 3 | **90** |

**Astra:** first advanced-panel candidate for complex state and prospective Three.js scenes. AA's September 3 Coding Agent Index snapshot places it around 67, near Opus. OpenAI's TypeScript/Three.js game case study offers directly relevant capability evidence, but is not a controlled comparison or one-shot guarantee. [Official model](https://developers.openai.com/api/docs/models/gpt-6-astra), [Three.js case study](https://developers.openai.com/blog/how-to-build-games-with-astra), [AA coding comparison](https://artificialanalysis.ai/articles/benchmarking-gpt-6-astra).

**Opus:** close alternative for interaction planning and implementation. Lower fixed-token cost than Astra, but the AA coding workload consumed more tokens; total panel cost needs measurement. **Fable:** reserve for complex reasoning or repairing failed simulations. The cited Coding Agent Index is 70, but cost, latency and integration differences reduce its everyday fit. [Opus specs](https://platform.claude.com/docs/en/models/opus-5/overview), [Fable specs](https://platform.claude.com/docs/en/models/fable-5-1/overview), [AA Fable evaluation](https://artificialanalysis.ai/articles/claude-fable-5-1).

These ratings target advanced panels. For the currently approved configuration-only renderer, test Sol and Flash before paying for frontier coding capability: the application supplies the mechanisms, state management and layout. Neither coding scores nor this research authorize arbitrary model code execution or a Three.js dependency.

## Model IDs and price snapshot

USD, standard synchronous uncached text pricing per **one million tokens**, below long-context thresholds. Reasoning, retries, tool calls and hosting can add cost. Promotional dates must be rechecked before deployment.

| Model | API ID | Recommended provider | Input / output |
| --- | --- | --- | --- |
| GPT-5.6 Sol | `gpt-5.6-sol` | OpenAI | $4 / $20; promotional at least through Nov 21, 2026 |
| Claude Opus 5 | `claude-opus-5` | Anthropic | $5 / $25 |
| Gemini 3.8 Flash | `gemini-3.8-flash` | Google Gemini API | $0.75 / $3.75 through Dec 31, 2026; then $1.50 / $7.50 |
| GPT-6 Astra | `gpt-6-astra` | OpenAI | $10 / $50 |
| Claude Fable 5.1 | `claude-fable-5-1` | Anthropic | $10 / $50 |

Prices are supported by the official model pages linked above. The suggested starting efforts (Sol/Opus medium, Flash low/medium; advanced panels high) are tuning hypotheses, not configurations proven by the cited max/high-effort benchmarks.

| Image model | API ID | Price evidence |
| --- | --- | --- |
| GPT Image 2 | `gpt-image-2`; snapshot `gpt-image-2-2026-04-21` | Official token billing; AA high-setting representative estimate $0.211/image, not a flat API tariff |
| Gemini 3.1 Flash Image | `gemini-3.1-flash-image` | Official output-image price $0.067/1K, $0.101/2K, $0.151/4K, plus input/other applicable tokens |
| MAI-Image-2.6 | `MAI-Image-2.6`, version `2026-07-31` | AA representative estimate $0.0389/image; official final tariff not independently established here; public preview |

Image costs are **not matched settings** and should not be read as a controlled price comparison. [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [Google pricing](https://ai.google.dev/gemini-api/docs/pricing), [AA configuration estimates](https://artificialanalysis.ai/image/leaderboard/text-to-image).

First-party APIs are recommended for direct feature support and explicit model identity. This is not a measured claim that they are faster or cheaper than every reseller. The repository documents a Vertex Gemini integration; choosing Gemini Developer API here does not migrate it. Account entitlement, quota and region still require provider preflight when integration begins.

## Other candidates considered

| Candidate | Why not in a particular top three |
| --- | --- |
| GPT-6 Astra / Claude Fable 5.1 for ordinary explanation or diagrams | Stronger general frontier evidence, but premium cost with no demonstrated Eazo teaching/SVG advantage; retained for advanced panels |
| GPT-5.6 Terra | Native structured output and $2/$12 pricing; plausible middle tier, but Flash covers low-cost testing and Sol covers higher quality in this three-candidate experiment. [Official specs](https://developers.openai.com/api/docs/models/gpt-5.6-terra) |
| Claude Sonnet 5 | Current official docs list $2/$10; attractive additional trial, but AA v4.2 45 versus Flash 47, with no verified passage-specific advantage. Older marketing material has conflicting promotion wording; current platform docs used. [Official specs](https://platform.claude.com/docs/en/models/sonnet-5/overview), [AA](https://artificialanalysis.ai/models/claude-sonnet-5) |
| Reve 2.1 | AA Elo1127 ±9; excellent image contender with hierarchical editing, but AA representative $0.20/image and experimental layout endpoints reduce initial-reader fit. [API announcement](https://blog.reve.com/posts/the-reve-api/) |
| Gemini 3 Pro Image | AA Elo1099 ±9; $0.134/1K–2K versus Flash's $0.067/1K; no demonstrated Eazo advantage to justify default. [Google pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| FLUX.2 max | AA Elo1031 ±9, weaker current preference evidence; still not proof of poorer educational accuracy. [BFL pricing](https://docs.bfl.ai/quick_start/pricing) |

This is a broad practical screening, not an exhaustive benchmark of every model. No proprietary comparative teaching score is claimed.

## Benchmark audit and next validation

AA changed Intelligence Index to **v4.2 on September 4**. Current live pages read Astra max55, Opus max54, Sol max51, Flash high47 and Sonnet max45. September 1–3 articles report older Intelligence numbers; those are not mixed into this table. The Coding Agent Index is a separate model-plus-harness measurement; the 67/70 values above are a dated snapshot. [Version change and methodology](https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-2).

No direct SVG/educational-panel benchmark was verified. Arena webdev rows were not retrievable, so no unverified webdev ranks are used. Vendor demonstrations are capability examples; independent benchmarks are proxies; the fit ratings are our inference.

Before choosing production defaults, use the same 20 passages spanning argument, narrative, quantitative mechanism and technical process, including English and Chinese. Blind-review fidelity and usefulness; measure schema validity, render failures, label overlap and successful interactions; record first useful output, total wall time, billed tokens and retries. Run each candidate with the same task constraints and record effort settings. A serious invented relation or false mechanism should fail an artifact regardless of aesthetics. These tests are proposed, not executed or authorized as a new implementation task.
