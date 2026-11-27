## Improvements

### Native Rust File Runtime

Eidos Lite 0.40.0 uses the native Rust File Runtime by default when you create or open an `.eidos` file. It handles table reads and writes, filtering, sorting, and column statistics.

To switch back to the original desktop runtime, choose **JavaScript** under **Settings → Experimental → File runtime** and restart Lite.
