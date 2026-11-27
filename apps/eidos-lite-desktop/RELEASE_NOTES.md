## Improvements

### Native Rust runtime

This release focuses entirely on performance. We rewrote the Eidos File runtime in Rust, and Eidos Lite uses it by default starting in 0.40. Open any existing `.eidos` file to use the new runtime. No data conversion is required.

In our desktop grouping benchmark, the median time from clicking a view to seeing its group counts fell from **1.82 seconds to 97 milliseconds**. Bulk inserts, text search, and loading the first page of records are faster as well.

[![JavaScript and Rust runtime performance in Eidos Lite 0.40](https://media.eidos.space/releases/lite/0.40.0/runtime-performance/72df0a9da2afbe789d922a350c670f59f11b849bca09385402ab2dc1d57d29af/screenshot.webp)](https://media.eidos.space/releases/lite/0.40.0/runtime-performance/72df0a9da2afbe789d922a350c670f59f11b849bca09385402ab2dc1d57d29af/screenshot.webp)

### Switching back to JavaScript

If you run into a compatibility issue, choose **JavaScript** under **Settings → Experimental → File runtime** and restart Lite. Please let us know what happened. If we receive no new reports of compatibility issues after 0.40 ships, we plan to remove the old JavaScript runtime in the next release.
