import { getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDCwxtAo_sM7-TFh-dt8s6OAA0weyRIpPo",
  authDomain: "n2scrims.firebaseapp.com",
  projectId: "n2scrims",
  storageBucket: "n2scrims.firebasestorage.app",
  messagingSenderId: "121497558480",
  appId: "1:121497558480:web:ce369d1305a74e91f1add5",
};

const app =
  getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account",
});