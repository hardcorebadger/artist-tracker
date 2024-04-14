echo "[Indiestack] Installing packages for 3 node projects. This could take some time. Grab a coffee...."
cd functions;
npm install;
cd ..;
cd app;
npm install;
cd ..;
cd emails;
npm install;
cd ..;
echo "[Indiestack] Finally done! Wow, that was a lot of packages."