## What's new

### Feed view

Feed is a new standard View that reads a Table as a timeline: newest records come first, titled by the Record Label with the Content Field rendered as Markdown. It is a more natural way to read logs, notes, and other content that builds up over time. Feed is available in Eidos Lite, the browser editor, and `eidos serve`.

### Record navigation

The record panel can now move to the previous or next record, following the current View's order, so you can keep reading without returning to the grid. The panel can also switch between the side panel and the full content page.

## Bug fixes

- **Content images**: Record Content now displays images stored with an Eidos File, including relative paths in Markdown and HTML.
- **Sync setup**: Spaces that are not yet connected now use the same compact Sync panel and account menu as connected Spaces.
- **Sync reliability**: A Hosted upload rejected by a Remote race now re-fetches and reclassifies before retrying, instead of replaying against a stale head.
- **Field conversion**: Converting a JSON string array in a Text field into Multi-select now yields one choice per value, and converted scalar cells can be cleared.
- **Windows titlebar**: Caption controls stay visible in the dark theme.
