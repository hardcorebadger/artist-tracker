#!/bin/zsh
cd functions
gsutil -m cp -r gs://artist-tracker-e5cce.firebasestorage.app/cloud-backup-$1 .
firebase emulators:start --import ./cloud-backup-$1