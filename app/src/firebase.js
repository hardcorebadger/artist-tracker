// Import the functions you need from the SDKs you need
import { initializeApp, registerVersion } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import * as fbauth from "firebase/auth";
import { useAuthState } from 'react-firebase-hooks/auth';
import { getFirestore } from "firebase/firestore"
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { updateProfile, sendEmailVerification } from 'firebase/auth';
import { setDoc, doc, getDoc } from 'firebase/firestore';
import { firebaseConfig } from "./config";


const is_dev = location.hostname === "localhost"

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const analytics = getAnalytics(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const v3_url = is_dev ? 'http://127.0.0.1:5001/artist-tracker-e5cce/us-central1/fn_v3_api/' : 'https://fn-v3-api-wfsh2ttvrq-uc.a.run.app/'
export const spotify_redirect = is_dev ? 'http://localhost:3000/app/callback/spotify' : 'https://indiestack.app/app/callback/spotify'

if (is_dev) {
  console.log("Localhost detected. Using emulators.")
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}

// Initialize Firebase Authentication and get a reference to the service
export const auth = fbauth.getAuth(app);

export const useAuth = () => useAuthState(auth)

const provider = new fbauth.GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export const signInOrCreateUserWithGoogle = async () => {
  try {
    await fbauth.signInWithPopup(auth, provider)
  } catch (error) {
    // if user doesnt complete signin stop here
    console.log(error)
    return;

  }
  const first_implied = auth.currentUser.displayName.split(" ")[0]
  const last_implied = auth.currentUser.displayName.split(" ")[1]
  const d = doc(db, 'users', auth.currentUser.uid)
  const udoc = await getDoc(d)
  if (!udoc.exists()) {
    await setDoc(d, {
      first_name: first_implied,
      last_name: last_implied
    })
  }
}
export const createUserWithEmailAndPassword = async (email, password, first, last) => {
  await fbauth.createUserWithEmailAndPassword(auth, email, password)
  await setDoc(doc(db, 'users', auth.currentUser.uid), {
    first_name: first,
    last_name: last
  })
  await updateProfile(auth.currentUser, {displayName: first + " " + last})
  .then((r) => {
    auth.currentUser.reload()
  }).catch(
    (err) => console.log(err)
  )
  await sendEmailVerification(auth.currentUser)
}
export const signInWithEmailAndPassword = (email, password) => fbauth.signInWithEmailAndPassword(auth, email, password);
export const signOut = () => fbauth.signOut(auth);

export default app;