import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDZgOzgyGmiYDERY34H-tW3vANqG4VJ9kc",
  authDomain: "riverflow-monitor-4ddd9.firebaseapp.com",
  projectId: "riverflow-monitor-4ddd9",
  storageBucket: "riverflow-monitor-4ddd9.firebasestorage.app",
  messagingSenderId: "148695893657",
  appId: "1:148695893657:web:168343e4858c913f419a08",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

export {
  signInWithEmailAndPassword,
  firebaseSignOut,
  onAuthStateChanged,
  type User,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
};
