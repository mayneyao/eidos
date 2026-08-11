## What's new

### Show URL columns as images

Set a URL field's **Display** property to **Image** to show HTTPS values as
lazy-loaded thumbnails in Grid. The same field can be selected as a Gallery
cover, so imported CSV image columns remain ordinary URL data and do not need
to be converted into File fields.

Images remain decoded and cached when rows leave the viewport, making repeated
scrolling faster and preventing the same image from flashing through another
download. URL cells that use the normal link display are now visibly
underlined and open directly without entering edit mode first.

### Attach remote files by URL

File fields can now add an HTTPS address from the cell editor or record
inspector. Remote images receive thumbnails and previews; other remote files
can be opened or downloaded with the same File-field controls as local
attachments.

### More stable browsing and previews

Expanded Explorer folders stay open while the Space tree refreshes. Local File
thumbnails also retain their decoded previews after scrolling away and back,
including when multiple cells reference the same image.

No migration is required. Existing URL and File values remain unchanged.
