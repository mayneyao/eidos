# Comprehensive Markdown Test Document

This document contains **all** common Markdown node types for testing ID preservation.

## Paragraphs and Text Formatting

This is a simple paragraph with _italic_ and **bold** text. We also have `inline code` and ~~strikethrough~~ text.

Here's a paragraph with a [link to example](https://example.com) and an auto-link: <https://github.com>.

## Lists

### Unordered Lists

- First item
- Second item with **bold**
- Third item with [a link](https://example.com)
  - Nested item 1
  - Nested item 2
    - Deeply nested
- Back to top level

### Ordered Lists

1. First numbered item
2. Second numbered item
   1. Nested numbered 1
   2. Nested numbered 2
3. Third numbered item with _italic_

### Task Lists

- [x] Completed task
- [ ] Incomplete task
- [x] Another completed task with **bold**

## Blockquotes

> This is a simple blockquote.

> Blockquote with **formatting** and [links](https://example.com).
>
> > Nested blockquote
> > Second line of nested
>
> Back to first level

## Code

### Code Block with Language

```typescript
function hello(name: string): string {
  return `Hello, ${name}!`
}
```

### Code Block without Language

```
Plain text code block
No language specified
```

### Inline Code

Use `npm install` to install packages. For configuration, edit `config.json`.

## Headings

### Heading Level 3

#### Heading Level 4

##### Heading Level 5

###### Heading Level 6

## Horizontal Rules

Above the rule

---

Below the rule

---

Another rule

---

Final rule

## Tables

| Header 1                    | Header 2 | Header 3 |
| --------------------------- | -------- | -------- |
| Cell 1                      | Cell 2   | Cell 3   |
| **Bold**                    | _Italic_ | `Code`   |
| [Link](https://example.com) | 123      | true     |

## HTML Elements

<div align="center">
  <p>Some HTML content</p>
</div>

## Special Characters

Here's some special characters: &copy; &reg; &trade; &euro; &pound;

Escaping characters: \*not italic\* and \`not code\`

## Emoji

:smile: :heart: :thumbsup:

## Footnotes

Here's a sentence with a footnote[^1].

[^1]: This is the footnote content.

## Definition Lists

Term 1
: Definition 1

Term 2
: Definition 2a
: Definition 2b

## Images

![Alt text](https://via.placeholder.com/150 "Image Title")

## Math (if supported)

Inline math: $E = mc^2$

Block math:

$$
\sum_{i=1}^{n} x_i = x_1 + x_2 + \cdots + x_n
$$

## Mixed Content Paragraph

This paragraph has **bold**, _italic_, `code`, [link](https://example.com), and ~~strikethrough~~ all together. It also spans
multiple lines to test line break handling.

## Empty Paragraphs

Above and below are empty lines.

## Very Long Paragraph

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

## Short Paragraph

Hi.

## Multiple Code Blocks

```javascript
const x = 1
```

```python
def hello():
    return "world"
```

```rust
fn main() {
    println!("Hello, world!");
}
```

## Complex List Structure

1. Item 1
   - Sub A
   - Sub B
     1. Deep 1
     2. Deep 2
   - Sub C
2. Item 2
   1. Sub Num 1
   2. Sub Num 2
3. Item 3

## Blockquote with List

> ## Heading in Blockquote
>
> - Item in quote
> - Another item
>
> ```code
> in quote
> ```
>
> Normal text in quote.

## Final Section

This is the final paragraph of the comprehensive test document.
