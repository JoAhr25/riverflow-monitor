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
  apiKey: ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_FIREBASE_API_KEY) || "AIzaSyDemoKeyForRiverFlowMonitor4ddd9",
  authDomain: "riverflow-monitor-4ddd9.firebaseapp.com",
  projectId: "riverflow-monitor-4ddd9",
  storageBucket: "riverflow-monitor-4ddd9.firebasestorage.app",
  messagingSenderId: "100000000000",
  appId: "1:100000000000:web:riverflowmonitor4ddd9",
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
