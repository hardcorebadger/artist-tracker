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
  if [ ! -e ".env.dev" ]; then
      echo ".env.dev does not exist."
      exit 1
  fi
  if [ ! -e ".env" ]; then
        echo ".env does not exist."
        exit 1
  fi
  export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES
  export no_proxy=*
#  export FIRESTORE_EMULATOR_HOST=127.0.0.1:8181
#  export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
  echo "[Indiestack] Running emulators for functions...";
  firebase emulators:start --only functions;
fi

if [ "$1" = "all" ]
then
#  if [ ! -e ".env.dev" ]; then
#      echo ".env.dev does not exist."
#      exit 1
#  fi
#  if [ ! -e ".env" ]; then
#        echo ".env does not exist."
#        exit 1
#  fi
  firebase use dev
  export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES
  export no_proxy=*
  export FIRESTORE_EMULATOR_HOST=127.0.0.1:8181
  export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
  echo "[Indiestack] Running emulators for functions...";
  firebase emulators:start --import ./cloud-backup-e5b0a790
fi