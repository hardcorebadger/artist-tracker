#!/bin/zsh
HASH=$(date +%s | md5sum | head -c 8)
gcloud firestore export --collection-ids=users,invites,organizations,reports gs://artist-tracker-e5cce.firebasestorage.app/cloud-backup-$HASH
echo "cloud-backup-$HASH"