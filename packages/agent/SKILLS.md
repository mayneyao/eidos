# Agent Skills for Eidos

This document describes the skills system for the Eidos agent, which follows the [Agent Skills standard](https://agentskills.io/).

## What are Skills?

Skills are self-contained capability packages that extend the agent's functionality. They provide specialized workflows, instructions, helper scripts, and reference documentation for specific tasks.

Skills use **progressive disclosure**: only skill names and descriptions are included in the agent's system prompt. Full instructions are loaded on-demand when the agent needs to use a skill.

## Skills Locations

Skills are loaded from two locations with a priority system:

### Global Skills

- **Location:** `~/.eidos/skills/`
- **Scope:** Available to all spaces
- **Use case:** Common skills you want available everywhere

### Space-Level Skills

- **Location:** `<space-path>/.eidos/skills/`
- **Scope:** Available only in that specific space
- **Priority:** **Higher priority** - overrides global skills with the same name

## Directory Structure

Skills can be organized in two ways:

**1. Direct Markdown Files** (in skills root):
```
~/.eidos/skills/
├── quick-start.md
└── troubleshooting.md
```

**2. Subdirectories with SKILL.md** (recommended for complex skills):
```
~/.eidos/skills/
├── data-analysis/
│   ├── SKILL.md
│   ├── scripts/
│   │   └── process.py
│   └── references/
│       └── api-docs.md
└── code-review/
    └── SKILL.md
```

## SKILL.md Format

Every skill must have YAML frontmatter with `name` and `description`, followed by markdown instructions:

```markdown
---
name: example-skill
description: Brief description of what this skill does and when to use it
---

# Example Skill

## Overview

Detailed explanation of the skill and its purpose.

## Usage

Step-by-step instructions for using this skill.

## Examples

Concrete examples of how to use the skill.
```

### Frontmatter Fields

- **name** (required): Unique identifier for the skill, use kebab-case (e.g., `data-analysis`)
- **description** (required): Clear description of what the skill does and when to use it. This is shown to the agent in the system prompt.

### Content Guidelines

- Use clear, actionable instructions
- Include examples where helpful
- Reference relative paths for scripts/assets within the skill directory
- Keep descriptions concise but informative

## How Skills Work

1. **Startup:** Agent scans global and space-level skill directories
2. **System Prompt:** Skill names, descriptions, and paths are added to the system prompt in XML format
3. **On-Demand Loading:** When a task matches a skill, the agent uses the `read_file` tool to load the full SKILL.md
4. **Execution:** Agent follows the skill's instructions

## Creating a Custom Skill

### Example: Web Scraping Skill

1. Create the skill directory:
   ```bash
   mkdir -p ~/.eidos/skills/web-scraping
   ```

2. Create `SKILL.md`:
   ```markdown
   ---
   name: web-scraping
   description: Extract data from websites using various techniques. Use when the user needs to scrape or extract data from web pages.
   ---
   
   # Web Scraping Skill
   
   ## When to Use
   
   - User needs to extract data from a website
   - User wants to monitor a website for changes
   - User needs to download content from multiple pages
   
   ## Instructions
   
   1. First, check if the website has an official API
   2. If no API, use execute_shell with curl
   3. For JavaScript-heavy sites, mention jina_fetch tool
   4. Always respect robots.txt and rate limiting
   
   ## Example
   
   For simple HTML:
   \`\`\`bash
   curl -s "https://example.com" | grep -oP '(?<=<title>).*(?=</title>)'
   \`\`\`
   ```

3. Test by starting the agent and asking about web scraping

## Priority Resolution

When skills with the same name exist in both global and space directories:

- ✅ **Space skill takes precedence**
- ❌ Global skill is ignored

This allows you to:
- Have default skills globally
- Override them per-space with custom versions
- Keep space-specific customizations without affecting other spaces

## Security Considerations

> [!WARNING]
> Skills can instruct the model to perform ANY action and may include executable code. Always review skill content before use, especially skills from external sources.

## Best Practices

1. **Descriptive names:** Use clear, kebab-case names (e.g., `git-workflow`, not `gw`)
2. **Detailed descriptions:** Help the agent know when to use the skill
3. **Modular skills:** Keep skills focused on specific tasks
4. **Version control:** Store your skills directory in version control
5. **Test thoroughly:** Test skills with different user requests
6. **Document edge cases:** Include error handling instructions

## Troubleshooting

### Skills not loading

Check that:
- Directory exists: `ls -la ~/.eidos/skills/`
- SKILL.md files are present
- YAML frontmatter is valid (three dashes, name and description present)
- File permissions allow reading

### Skill not being used

- Check the description is clear and relevant to the task
- Ask the agent: "what skills do you have?"
- Explicitly mention the skill name in your request
- Load the skill manually: "read the [skill-name] skill and follow its instructions"

## Examples

For example skills, see [badlogic/pi-skills](https://github.com/badlogic/pi-skills) which provides pre-built skills compatible with the Agent Skills standard.
