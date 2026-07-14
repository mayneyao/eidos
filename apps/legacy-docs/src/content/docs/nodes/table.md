---
title: Tables
description: When structure matters
sidebar:
  order: 2
---

Tables are where Eidos gets serious about data. While documents are great for thinking and writing, tables are for when you need structure, relationships, and the ability to slice and dice information in different ways.

## The architecture decision that matters

Here's something that might surprise you: most "database-like" productivity tools aren't actually using real databases under the hood. They're usually storing everything in one giant table and using clever tricks to make it look like you have multiple tables.

We did the opposite. Every table you create in Eidos becomes an actual database table. When you create a "Projects" table, you get a real database table named `tb_<node_id>` in SQLite.

Why does this matter? Performance and integrity. Real database tables have real indexes, real foreign keys, and real query optimization. Your data behaves like data, not like a simulation of data.

## What every table gets

Every table starts with two essential fields:

- `_id` - A unique identifier for each row
- `title` - Because humans need names for things

These aren't just conveniences. The `_id` field is what makes relationships between tables possible. The `title` field is what makes your data readable when you're linking between tables or viewing it in different contexts.

## The field types that matter

### Basic fields

These are your bread and butter:

- **Text** - For words and sentences
- **Number** - For quantities and calculations
- **Date** - For time-based data
- **Checkbox** - For yes/no decisions
- **Select** - For choosing from a predefined list
- **Multi-select** - For tags and categories
- **File** - For attachments and media

### Computed fields

These are where tables get interesting:

- **Formula** - Like Excel formulas, but for your structured data
- **Link/Relation** - Connect rows across different tables
- **Lookup** - Pull data from related tables

:::tip

Eidos formulas are built on SQLite's generated column feature. What does this mean? You write standard SQL statements to define your formulas, not some clunky proprietary dialect. This is real SQL with real database performance.

Why does this matter? When you need complex calculations, you have the full power of SQL at your disposal. Need aggregations? Window functions? Subqueries? No problem.

For more advanced use cases, Eidos also provides UDF (User Defined Function) extensions. You can implement complex business logic in JavaScript, then call these functions from your SQL formulas. This gives you the best of both worlds: SQL's performance with JavaScript's flexibility.

:::

### System fields

These track themselves:

- **created_at** - When the row was born
- **last_edited_at** - When it was last touched
- **created_by** - Who made it
- **last_edited_by** - Who changed it last

## Three ways to see your data

Tables support three view types, each optimized for different ways of thinking:

**Grid view** is your default. It looks like Excel and works like Excel. Perfect for editing data directly, sorting, filtering, and getting a comprehensive overview.

**Gallery view** is for when your data includes images or when you want to see more information about each item at once. Think Pinterest, but for your structured data.

**Kanban view** turns your table into a project board. Pick a select field to group by, and suddenly you have columns with draggable cards. It's the same data, just organized to match how you think about workflows.

The elegant thing is that these are just different lenses on the same information. Change the view, and you change how you interact with your data, but the underlying structure stays the same.
