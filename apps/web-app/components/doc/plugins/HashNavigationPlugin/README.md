# HashNavigationPlugin

This plugin implements automatic navigation to heading positions based on URL hash anchors.

## Features

- Listen for URL hash changes (e.g., `#my-heading`)
- Automatically find corresponding headings in the document
- Smooth scroll to target heading position
- Automatically select the target heading

## Usage

1. Create headings in your document, for example:
   ```markdown
   # My Heading
   ## Another Heading
   ### Third Level Heading
   ```

2. Add corresponding hash anchors in the URL (using exact heading text):
   - `#My Heading` will jump to "My Heading"
   - `#Another Heading` will jump to "Another Heading"
   - `#Third Level Heading` will jump to "Third Level Heading"

## Matching Rules

- **Direct text matching**: URL hash directly matches heading text
- **Case insensitive**: Ignores case differences
- **Unicode support**: Fully supports Chinese and other Unicode characters
- **URL decoding**: Automatically handles URL-encoded characters

## Examples

If the heading is "Hello World! (2024)", the URL should be `#Hello World! (2024)`

If the heading is "我的中文标题", the URL should be `#我的中文标题`

URL: `https://example.com/doc#我的中文标题` will automatically jump to that heading.
