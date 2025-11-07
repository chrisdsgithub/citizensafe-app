// firebaseConfig.js
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyD7UE84OZRqzwzqq9hxQb8PO6cwT45UqlM",
  authDomain: "citizensafe-437b0.firebaseapp.com",
  projectId: "citizensafe-437b0",
  storageBucket: "citizensafe-437b0.firebasestorage.app",
  messagingSenderId: "34735094764",
  appId: "1:34735094764:web:8a5e85538601ce025c5ec9",
  measurementId: "G-QGVZD7ZKY7"
};

// Initialize Firebase app (prevent duplicate initialization)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// ✅ Proper Auth setup for Expo / React Native
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  auth = getAuth(app);
}

const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
