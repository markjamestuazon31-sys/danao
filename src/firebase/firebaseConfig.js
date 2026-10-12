import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

/**
 * Jidanao Learning Hub Firebase configuration.
 *
 * Firebase web configuration identifies the project; access is enforced by
 * Authentication and Realtime Database Rules. This project intentionally uses
 * Realtime Database as its only application data store. Environment variables
 * can override project values for deployments without changing source code.
 *
 * Classroom pictures for Picture & Symbol Match are stored as compressed
 * base64 data URLs on camera program records in RTDB (no Firebase Storage).
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDND3Ee3El1bTH5sXxc1h-hvxBNQd_588Q",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "learning-management-5b688.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://learning-management-5b688-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "learning-management-5b688",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "465443961131",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:465443961131:web:3facb154cb3778a3ad6d6e",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-YVL5XDD15V",
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);
