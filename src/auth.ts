import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  signOut
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Configure Google OAuth Provider
export const provider = new GoogleAuthProvider();
// Add sheets scope
provider.addScope('https://www.googleapis.com/auth/spreadsheets');

// Memory cache for active access token
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Initialize observer
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        // We have a user but no token cached in-memory (e.g., page refresh).
        // Since we can't get accessToken silently from Firebase Auth without a new popup or signIn,
        // we'll flag that we need a fresh login to retrieve the token, or wait if we are in the middle of signing in.
        if (!isSigningIn && onAuthFailure) {
          onAuthFailure();
        }
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Sign in via Popup
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Sheets access token from login');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('OAuth login error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Clear session
export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const setAccessToken = (token: string) => {
  cachedAccessToken = token;
};
