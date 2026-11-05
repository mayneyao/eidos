## Bug fixes

### Plugin state after restarting macOS

Fixes an issue where restarting macOS could make enabled plugins appear disabled and plugin history appear empty in an existing Space. Lite now preserves the Space's plugin enablement, settings, background permissions and stored plugin data across restarts.

If a Space was already affected before this update, its earlier state may require separate recovery.
