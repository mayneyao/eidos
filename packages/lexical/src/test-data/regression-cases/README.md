# Regression Cases Directory

This directory is for storing regression test cases exported from `lexical-diff-demo`.

## Workflow

1. **Use lexical-diff-demo** to edit markdown and identify cases where ID preservation rate drops
2. **Export regression cases** from the demo (JSON format)
3. **Copy exported JSON files** to this directory
4. **Run the import script** to add them to the test suite

## Quick Start

```bash
# 1. Copy exported JSON files here
# e.g., lexical-regression-cases-2024-03-29.json

# 2. Run the import script
cd packages/lexical/src/test-data
node add-regression-cases.mjs

# 3. Run tests to verify
pnpm test src/test-data/cases.test.ts
```

## File Format

Exported JSON from lexical-diff-demo should have this structure:

```json
{
  "exportTime": "2024-03-29T12:00:00Z",
  "cases": [
    {
      "timestamp": 1712345678900,
      "oldMarkdown": "# Old content",
      "newMarkdown": "# New content",
      "preservationRate": 0.75,
      "previousRate": 0.95,
      "rateDrop": 0.2
    }
  ]
}
```

Or a single case object:

```json
{
  "timestamp": 1712345678900,
  "oldMarkdown": "# Old",
  "newMarkdown": "# New",
  "preservationRate": 0.5
}
```

## Processed Files

After import, source files are moved to `processed/` directory with a timestamp prefix.
