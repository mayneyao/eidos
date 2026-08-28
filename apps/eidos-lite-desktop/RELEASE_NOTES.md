## What's new

### Sync merged Spaces without oversized uploads

Sync now avoids uploading history that already exists on the Remote after a
merge. If an optimized upload is still too large for one request, Eidos Lite
automatically sends the same data in smaller parts. Spaces with long or merged
histories can resume Sync without losing Local checkpoints.

### Retry any Sync error manually

Every Sync error keeps a **Try again** action. Account, quota, update, and
re-clone guidance remains available beside it, so you can retry after fixing
the cause without creating another checkpoint or restarting Eidos Lite.

No migration is required.
