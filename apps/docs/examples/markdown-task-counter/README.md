# Markdown Task Counter

This extension adds **Count Markdown tasks** to the context menu for Markdown
files. It reads the selected file, counts unchecked and checked task-list items,
and displays the result in a notice.

## Try it in Eidos Desktop

1. Open **Settings → Extensions → Install from GitHub**.
2. Enter repository `mayneyao/eidos`, ref `dev`, and package path
   `apps/docs/examples/markdown-task-counter`.
3. Prepare the package, review the exact files and permissions, then install it.
4. Trust the installed snapshot, grant read access to `**/*.md`, and enable it.
5. Create or open a Markdown file containing task-list items.
6. Right-click the file and choose **Count Markdown tasks**, or open that file,
   press <kbd>⌘K</kbd>, and search for the command.

The command runs in the sandboxed Worker runtime. It reads only the selected
Markdown file through the granted host capability and reports checked and
unchecked counts with a host-rendered notice.

For local development, copy the package to
`<space>/.eidos/extensions/example.markdown-task-counter/`, refresh the
Extension Manager, and repeat trust and enablement after changing its content.
