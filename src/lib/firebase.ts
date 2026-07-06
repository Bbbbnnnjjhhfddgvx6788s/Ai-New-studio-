import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User 
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Inlined Firebase Configuration for direct, bulletproof compilation
const firebaseConfig = {
  projectId: "gen-lang-client-0459333690",
  appId: "1:576851741206:web:4a548434ffc56f6349c337",
  apiKey: "AIzaSyDD__6TWso-AjDFEzuI3_VwoFElqAccyHk",
  authDomain: "gen-lang-client-0459333690.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-a275b3c6-7848-4e13-a13c-2fa410a9205a",
  storageBucket: "gen-lang-client-0459333690.firebasestorage.app",
  messagingSenderId: "576851741206",
  measurementId: ""
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Provider with Drive scopes
export const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive.file");

// In-memory token caching
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Sign in with Google Popup
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Failed to get access token from Firebase Auth");
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error("Firebase Sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Get active cached token
export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

// Logout helper
export const logoutUser = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};
