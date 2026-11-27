## Improvements

### Faster column statistics in large tables

Lite now uses Rust by default to calculate counts and minimum and maximum values for stored numeric columns in unfiltered, unsorted tables. To switch back to the previous desktop runtime, choose **JavaScript** under **Settings → Experimental → File runtime** and restart Lite.
