# Performance evidence

Status: Baseline measurement, not a performance guarantee or release gate.

## Reproduce the headless codec baseline

From the repository root:

```sh
pnpm --filter @eidos.space/markdown benchmark:codec
pnpm --filter @eidos.space/markdown exec node scripts/benchmark-codec.mjs 5000
```

The first command rebuilds the public artifact. The second reuses that build;
rebuild after source changes. Counts from 1 through 10000 can be passed to the
script. It prints JSON containing the environment, input sizes, sample count,
median and maximum durations. Failures in source or paragraph-count assertions
fail the command rather than being reported as successful performance samples.

Each case has one warm-up and five measured samples with a fresh headless
Lexical editor. Plugin compilation and correctness assertions are outside the
timers. Import includes the discrete editor update; export reads committed state.
Analysis is measured separately; import still includes its own required parsing.
No GC is forced. Cases run sequentially in one process, so these are warm-process
observations, not independent cold-start measurements.

The deterministic corpus is uniquely numbered English/Chinese plain paragraphs.
Every iteration asserts exact exported source (excluding trailing whitespace)
and the root paragraph count. These checks do not establish general source
fidelity for mixed syntax or arbitrary edits.

## Local baseline, 2026-09-05

Apple M2, macOS arm64, Node v22.23.1. Durations below are medians in milliseconds.
100/1000/5000 paragraphs contain 10,090/101,891/513,891 UTF-8 bytes respectively.

| Preset   | Paragraphs | Analyze |  Import | Export |
| -------- | ---------: | ------: | ------: | -----: |
| Minimal  |        100 |    2.05 |    9.31 |   0.21 |
| Minimal  |       1000 |   15.31 |   70.90 |   1.42 |
| Minimal  |       5000 |   87.05 |  374.72 |   6.57 |
| GFM      |        100 |    3.94 |   15.91 |   0.33 |
| GFM      |       1000 |   34.59 |  141.37 |   1.58 |
| GFM      |       5000 |  178.09 |  747.93 |   8.20 |
| Obsidian |        100 |    3.55 |   21.89 |   0.29 |
| Obsidian |       1000 |   34.36 |  220.62 |   1.78 |
| Obsidian |       5000 |  174.67 | 1115.89 |   9.35 |

The 5000-paragraph imports are roughly five times the 1000-paragraph imports
in these runs. That is evidence about this corpus, not an algorithmic complexity
proof. The original Obsidian baseline exceeds one second without DOM work.

## Same-source parse-tree reuse

CPU sampling of the built artifact (`node --cpu-prof`) identified substantial
time in micromark tokenization, extension combination and garbage collection.
Inspection confirmed that inline semantics and inline plugin protection parsed
the same paragraph separately. They now share the parsed tree only when no
supplemental reference/footnote definitions were appended. Different parser
inputs still take separate paths; there is no global cache or retained document.

After rebuilding, the same five-sample benchmark was repeated without a
concurrent build/browser run. Import medians in milliseconds:

| Preset   | Paragraphs | Original | After reuse |
| -------- | ---------: | -------: | ----------: |
| Minimal  |       5000 |   374.72 |      375.26 |
| GFM      |       5000 |   747.93 |      765.09 |
| Obsidian |       5000 |  1115.89 |      805.89 |

Obsidian improves about 28% for this corpus; Minimal/GFM do not use this duplicate
inline-plugin parse path and show no improvement. These are sequential local
observations, not statistical guarantees. Exact source and paragraph-count
assertions pass, as do 240 package tests, TypeScript checking and all 83
production-browser regressions after the change. Browser latency remains open.

## Remaining evidence

- Profile import to explain preset overhead before changing parser ownership.
- Browser initial render, typing-to-paint, selection and scrolling distributions.
- Mixed lists, tables, equations, source-only blocks and resource-heavy documents.
- Memory retention across document/preset changes and multiple editors.
- Minimal versus full consumer bundle sizes, tree-shaking and release budgets.

The browser regression suite proves behavioral correctness for its long-document
cases, not latency, throughput, memory limits or a universal document-size limit.
