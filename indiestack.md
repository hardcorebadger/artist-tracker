# Indiestack

# Quickstart

Start by forking the repo, cloning your repo, and cd into the directory

## 1. Set up a firebase project

Go to https://firebase.google.com, create a new project

Add Authentication to the project, enable email/password as well as Google sign in

Add Hosting, Firestore and Functions to the project

You'll need to create a Firestore database, configure however you want

When adding Functions, you'll need to upgrade to a Blaze plan. It's pay as you go (ie free for MVP)

## 2. Install the firebase CLI

Read more about the Firebase CLI here https://firebase.google.com/docs/cli

`curl -sL https://firebase.tools | bash`
auto detect OS and install the CLI

`firebase login`
log into your firebase account

## 3. Connect Indiestack to Firebase

`firebase projects:list`
list your firebase projects, you should see the one you just made

`firebase use [project ID]`
Use the project ID you just found

Now you've connected Indiestack with Firebase!

## 4. Connect the app to Firebase

Start by creating a config file in `/app/src` using the example provided
`cd app/src` `cp config.js.example config.js`

Add a web app in Firebase. Go to Project Settings, scroll to the bottom and click Add App. Select the `</>` Web App option, create the app. [Detailed Instructions](https://support.google.com/firebase/answer/9326094?hl=en)


Firebase gives you a config object for the app, it looks like this

```
 const firebaseConfig = {
   apiKey: "***************************************",
   authDomain: "****************.firebaseapp.com",
   projectId: "****************",
   storageBucket: "****************.appspot.com",
   messagingSenderId: "****************",
   appId: "************************************************"
 };
 ```

Copy the config object andreplace the example in `/app/src/config.js`

After giving you the config code, Firebase is going to walk you through a bunch of things. We already did all that so just skip on through and get back to the console.

Now the app can communicate with firebase for auth, functions and data!

## 5. Connect emails to Firebase

Set up a service account with the firebase admin SDK and download the private key
[Get a service account key](https://console.firebase.google.com/project/_/settings/serviceaccounts/adminsdk)

Take the json file, rename it `key.json` and drop it in the `/emails` folder
(Don't worry, this private key file is ignored by git and only used locally)

Navigate to the functions folder `cd functions` and create a .env file using the example provided `cp .env.example .env`

Next set up an account with resend (a developer friendly service for sending emails)
[Get a Resend Account](https://resend.com/signup)

Once you're in, create an API key, copy it, and paste it into the RESEND_API_KEY variable in `/functions/.env`

Now you can locally develop {{handlebar}} templates in react, deploy them to firebase, and send them via a function or backend trigger.

## 6. Connect Indiestack to Payments

Set up an account with Lemonsqueezy (payments) and create an API key (in dashboard go to settings/API)

Paste the API key into `/functions/.env` to allow the backend to interact with LS. (If you skipped email setup, you'll need to copy the example env file first `cp .env.example .env`)

To configure the app to have access levels, as well as show billing and subscription information, indiestack provides a product config in `/app/src/config.js`. This is a simple abstraction that ties product IDs to access levels. You can create tiered offrings, upsells, or one time purchases using this simple setup. It looks like this

```
export const products = {
  11111: {
    display: "Elite",
    checkout: "https://[store].lemonsqueezy.com/checkout/buy/......",
    access: ['elite', 'starter']
  },
  22222: {
    display: "Starter",
    checkout: "https://[store].lemonsqueezy.com/checkout/buy/......",
    access: ['starter']
  }
}
```

We need to fill this in with real values. TL;DR you need to replace `11111` and `22222` with real product IDs from LS and update the checkout URLs to the corresponding ones for each product. Let's do it.

For an example setup, create 2 subscription products in Lemonsqueezy - one called Starter and one called Elite. 

Once they are created, select the first product, and copy the product ID out of the URL - it will look something like this: `https://app.lemonsqueezy.com/products/12345` - copy `12345` and replace the first key in the `config.js` with the ID. 

Next click "share" on the product, configure the checkout and copy the checkout link (not the overlay, just the raw url) and paste it into the `checkout` line for the first object in `config.js`

Do the same with the next product for the second key in `config.js`

Payments are now connected to your project!

## 7. Deploy Indiestack

Everything is ready to go, now time to deploy the fullstack app!

### `./install.sh`
This is a bash script to install all the node dependencies. Technically, Indiestack is made out of 3 different node projects. This script just runs `npm install` for all three. In the future, if you have any new dependencies, you can just run that in whichever project you need to update (ie `cd functions` `npm install`)

### `./ship.sh`
This is a bash script that builds and deploys the app, emails, functions, and other backend pieces. It could take some time.

When the deploy completes, you'll be able to visit your live Indiestack app at https://[your project].web.app

## 8. Connect Payments (back to) Indiestack

Everything looks great! The one thing you might notice however, is that when you buy a product, you don't see any updates in the app. This is because we need to set up webooks for Lemonsqueezy to tell firebase when users buy products. This has to be done after your functions are deployed. Hence it's unfortunate precense at the end of this quickstart

First we have to allow unathorized access to the webhook handler we just deployed, then we have to add a call to it in the lemonsqueezy dashboard.

### Allowing unauthorized access to the handler

1. Go to the [GCP Functions Console](https://console.cloud.google.com/functions/?_ga=2.128808900.993349643.1689354266-527993939.1689108344)
2. Click on the function called `lmSqueezy`
3. Click the **Powered By Cloud Run** link in the top right corner of the Function details overview page.
4. Open the Security tab, and under **Authentication**, select **Allow unauthenticated invocations**.
5. Click **Save**

### Setting up the webhook in Lemonsqueezy
1. In the dashboard click **Settings** then in the dropdown click **Webhooks**
2. Add a new webhook, and select all the following events
```
order_created
order_refunded
subscription_created
subscription_updated
subscription_cancelled
subscription_resumed
subscription_expired
subscription_paused
subscription_unpaused
```
3. Now copy paste the URL of the lmSqueezy cloud function into the webhook URL (this can be found in the firebase dashboard under Functions)
4. Hit **Save**

### Configure redirects

When a user completes checkout, they will be redirected back to a URL you set in Lemonsqueezy. We want this to be our app.
Now they we've deployed our app, we can set the redirect URLs for our products to that app.

1. Find your root app URL (If you want to use local development, use localhost:3000 otherwise use the link firebase gave you)
2. Edit each product in Lemonsqueezy, in the redirect URL setting, set it to `[root url]/app/home`
3. Hit **Save**

Wow - that part was annoying! But not everything is officially linked together and workng!

## And you're off! You have a fully deployed, fullstack app with Auth, Payments, Landing pages, Emails, and more. Happy hacking!

# Config

Ensure you have correctly configured all of the following firebase connections

### `/app/src/firebase.json`
Connects the app to firebase. Needs to have your app config in it. Get it by creating a new app in Firebase project settings. Paste the code you get in this file.

### `/emails/key.json`
Connects the emails to firebase. A private key for an admin API service account on Firebase. Used to upload email templates in build and deploy locally (ignored by git)

### `firebase use [project ID]`
Config the root directory to point at firebase
Handles functions, firestore, and remote config

### `/functions/.env`
Configure your resend API key to send emails
Configure your lemonsqueezy API key to manage payments

### `/app/src/products.js`
Connects lemonsqueezy product in in app access levels

# Configuring acces levels

`/app/src/products.js` is a flexible abstraction layer between products users buy and access to content within the app.
The way it works is by linking a lemonsqueezy product ID with one or more "access" levels - string identifiers used in the app.

```
export const products = {
  11111: {
    display: "Elite",
    checkout: "https://indiestack.lemonsqueezy.com/checkout/buy/...",
    access: ['elite', 'starter']
  },
  22222: {
    display: "Starter",
    checkout: "https://indiestack.lemonsqueezy.com/checkout/buy/...",
    access: ['starter']
  }
}
```

It is recommended you set up 1 product for each access level. If you want to create different ways to pay for that acess level (ie monthly vs yearly options, or a one time deal, or a presale) you can do that using variants on the product - Indiestack will handle the access regardless

The example provided shows how to set up a 2 tier subscription offering

The keys in the json are the lemonsqueezy product IDs. The object contains 3 fields:
`display` is simply how to display the access level name to users
`checkout` is the checkout link for the product
`access` is an array of access level identifiers - you can call them whatever you want

To use access levels, check out the examples of components in `/components/AccessGates.js` as well as `routing/AccessGuard.js` both provide various ways to gate content from users based on access level.

# Email verification

Blocking users until email verification is turned off by default, but you can turn it on by going to `/app/src/routing/AuthGuard.js` and changing `GUARD_EMAIL_VERIFICATION` to `true`

This only affects signups that use email/password. oAuth signups through google do not need to verify

# Building email templates

Email templates ae built using react.email - you can check them out online for more documentation. For getting started, read the README in the `/emails` folder

# Ship script

### `./ship.sh`

Ships the entire fullstack application - compiles and uploads emails, builds and deploys the app, builds and deploys the cloud functions, firestore rules and remoteconfig.

You may need to fix execute access to this script to run it  `chmod 777 ship.sh`

### `./ship.sh [app | emails | functions | fiestore | config]`

Use a supplied suffix command to ship individual parts of the application

# Help

Hey! I'm Jake, the creator of Indiestack. Indiestack is relatively new, so if something doesn't go quite right, you have questions, suggestions, issues, or just want to chat, I'm always available

You can find me on twitter @jaketref or email me jake@indiestack.xyz

In the future we may set up a discord as the community around Indiestack grows!