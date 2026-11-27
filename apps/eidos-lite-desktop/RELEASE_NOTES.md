## Improvements

### A native Rust runtime for faster statistics in large tables

Eidos Lite 0.40.0 introduces a native Rust runtime, enabled by default for faster numeric column statistics in large tables. It works with your existing files when you view statistics for a stored numeric column in a table without filters or sorting.

In a desktop benchmark with 100,000 rows, the median time to calculate the non-empty count, distinct count, minimum, and maximum together fell from 1.19 seconds to 76 milliseconds.

To switch back to the previous desktop runtime, choose **JavaScript** under **Settings → Experimental → File runtime** and restart Lite.
