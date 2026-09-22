## What's new

### Run plugin actions on your records

Plugins can now add actions to a table's context menu. Run an action on selected records or the current filtered set, follow its progress in a task window that can be minimized or expanded, and undo or redo supported changes without running the action again.

Plugins can also provide a dedicated workspace for a `.eidos` file through **Open with**. Connection settings, including endpoints, models and API keys, are managed in the plugin's settings; API keys are stored encrypted on your device.

## Improvements

- **Plugin installation**: Drag a `.eidos-plugin` file onto the Plugins page to install or update it.
- **Plugin compatibility**: Eidos checks a plugin's required API before installation and execution. An incompatible update leaves the installed version intact, and incompatible plugins remain available for inspection or removal.
- **Editor titles**: The title bar identifies the active plugin or Markdown editing mode alongside the filename.

## Bug fixes

- **Dark mode**: Markdown in Feed and record details now follows the app's theme, even when it differs from the system appearance.
- **History**: Diff values stay aligned with their column labels when historical column order differs.
- **Plugin pages**: Avoid an unnecessary page scrollbar.
