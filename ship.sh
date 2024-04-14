#!/bin/bash

### Helper script to build and deploy stuff ###
# if you're not able to run this script, try chmod 777 ship.sh
# or if your OS doesn't support bash, this is just a small wrapper on
# existing commands, its easy enough to just do manually

if [ -z "$1" ] 
then
  echo "[Indiestack] Building and deploying full stack. This could take some time. Grab a coffee...."
  # build and deploy emails
  cd emails;
  npm run export;
  node deploy.js;
  cd ..;
  # build app
  cd app;
  npm run build;
  cd ..;
  # deploy all firebase
  firebase deploy
fi

# build and deploy the app
if [ "$1" = "app" ] 
then
  echo "[Indiestack] Building and deploying the app..."
  cd app;
  npm run build;
  cd ..;
  firebase deploy --only hosting;
  exit 0
fi

# build and deploy emails
if [ "$1" = "emails" ] 
then
  echo "[Indiestack] Building and deploying emails..."
  cd emails;
  npm run export;
  node deploy.js;
  cd ..;
fi

# deploy functions
if [ "$1" = "functions" ] 
then
  echo "[Indiestack] Deploying functions..."
  firebase deploy --only functions;
fi

# deploy firestore rules and indexes
if [ "$1" = "firestore" ] 
then
  echo "[Indiestack] Deploying firestore config..."
  firebase deploy --only firestore:rules;
  firebase deploy --only firestore:indexes;
fi

# deploy remoteconfig
if [ "$1" = "config" ] 
then
  echo "[Indiestack] Deploying config..."
  firebase deploy --only remoteconfig;
fi