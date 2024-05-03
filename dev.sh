# build and deploy the app
if [ "$1" = "app" ] 
then
  echo "[Indiestack] Running develpment host for app...";
  cd app;
  npm run start;
fi

# deploy functions
if [ "$1" = "functions" ] 
then
  echo "[Indiestack] Running emulators for functions...";
  firebase emulators:start --only functions;
fi