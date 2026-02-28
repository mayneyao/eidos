---
name: eidos-automation
description: Automate common Eidos tasks like creating tables, organizing data, and managing spaces. Use when user wants to perform bulk operations or set up structured data in Eidos.
---

# Eidos Automation Skill

This skill helps you automate common Eidos tasks.

## When to Use

- User wants to create  multiple tables with similar structures
- User needs to bulk import or organize data
- User wants to set up a new space with predefined structure
- User needs to perform repetitive data operations

## Available Operations

### 1. Create Table

Use `write_file` to create a table definition:

```javascript
// Example: Create a tasks table
const tableSchema = {
  name: "tasks",
  fields: [
    { name: "title", type: "text" },
    { name: "status", type: "select", options: ["todo", "in-progress", "done"] },
    { name: "priority", type: "select", options: ["low", "medium", "high"] },
    { name: "due_date", type: "date" }
  ]
}
```

### 2. Bulk Data Import

When user provides data to import:

1. Check data format (CSV, JSON, etc.)
2. Parse the data structure
3. Create appropriate table schema
4. Transform data to match schema
5. Use write_file to create data records

### 3. Space Setup Templates

Common space templates:

**Project Management**
- Tasks table
- Projects table  
- Team members table
- Timeline/milestones table

**Knowledge Base**
- Notes table
- Tags/categories table
- Resources/links table
- Bookmarks table

**CRM/Contacts**
- Contacts table
- Companies table
- Interactions/notes table
- Tags table

## Workflow Example

User request: "Set up a project management space"

1. Acknowledge the request
2. List tables you'll create
3. Create each table using write_file
4. Add sample data if requested
5. Summarize what was created

## Best Practices

- Always confirm structure before creating multiple items
- Use consistent naming conventions (lowercase, underscores)
- Provide clear field descriptions
- Set sensible default values where applicable
- Consider relationships between tables

## Error Handling

If creation fails:
- Check if space is selected (use switch_space if needed)
- Verify write permissions
- Check for naming conflicts
- Validate data types and constraints
