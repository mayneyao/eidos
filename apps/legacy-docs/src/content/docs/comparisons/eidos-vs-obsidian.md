---
title: Eidos vs Obsidian
description: Why build Eidos when Obsidian already exists?
---

Obsidian is a great product. Many of Eidos's design principles are deeply inspired by Obsidian: local-first, data ownership, extensibility, open formats. Obsidian has proven an important point: users should own their data, not entrust it to some cloud service that might disappear tomorrow.

Obsidian got one thing right: it built knowledge management on top of plain text. Text is humanity's most durable data format. When your notes are stored as `.md` files, you know they'll still be readable in twenty years. This certainty is precious.

But text also has limitations.

Imagine you're making an indie game. You have hundreds of characters, each with names, levels, skills, and equipment. This information is highly structured. In Obsidian, you'd need to create a markdown file for each character, stuffing attributes into frontmatter. Then pray that Obsidian's search and plugins can help you query this data.

It's like using a hammer to turn screws. It works, but it's not elegant.

## Structured Data

The Obsidian team has also noticed this issue. They recently launched the Base feature, trying to provide users with a better structured data management experience. This is indeed progress, but the implementation approaches have fundamental differences:

In Obsidian, databases are built on top of markdown files. Each row of data still corresponds to a `.md` file, and the database is just a visual representation of these files. When you edit a cell in Obsidian's table, you're actually modifying the frontmatter of some markdown file.

In Eidos, a database is a database. When you create a table, you get a real SQLite table. Data is stored directly in the database, with no intermediate layer.

This isn't just a difference in implementation details. This is a philosophical divergence.

Eidos made a simple choice: use databases for structured data, use documents for unstructured content. Not because we don't like markdown. Quite the opposite, we love it too much to abuse it.

Think about Excel and Word. No one would use Word to manage a financial report with 1000 rows of data, and no one would use Excel to write a long article. This isn't a technical limitation, but the nature of tools.

When you have a table with 1000 rows of data, SQLite knows how to handle it. It was born for this. Making markdown bear this responsibility is like asking a poet to do accounting.

This architectural difference brings practical consequences:

- **Performance**: When you have 10,000 rows of data, SQLite's query speed is orders of magnitude faster than parsing 10,000 markdown files. Eidos can even handle millions of records.
- **Integrity**: Real databases have constraints, transactions, ACID properties. Obsidian's base is just interface-level magic.
- **Flexibility**: You can query Eidos's data with SQL, write complex join queries, do aggregate statistics. Obsidian's query capabilities are limited by its plugin system.

This isn't meant to disparage Obsidian's base feature. For lightweight structured data, it's useful. But when you need real database functionality, Eidos is the better choice.

## Summary

Obsidian is a markdown-centric knowledge management tool. Eidos is a database-centric data management tool. For structured data management, Eidos has the advantage. Eidos focuses on data management rather than knowledge management.
