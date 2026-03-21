import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyC10pHefSyzios-LQgrmswEWBBaaDOBZMA",
    authDomain: "alienhealthcare.firebaseapp.com",
    projectId: "alienhealthcare",
    storageBucket: "alienhealthcare.firebasestorage.app",
    messagingSenderId: "575262954263",
    appId: "1:575262954263:web:cc97579445df67b1a55d52"
};

// Check if credentials are placeholders
const isPlaceholder = firebaseConfig.apiKey === "YOUR_API_KEY" || !firebaseConfig.apiKey;

let auth, database, isDemo;

if (isPlaceholder) {
    console.log("Firebase: Using placeholder credentials. App will run in Demo Mode.");
    isDemo = true;
    auth = {
        currentUser: { uid: 'demo-user-123' },
        onAuthStateChanged: (cb) => {
            cb({ uid: 'demo-user-123', displayName: 'Harsh' });
            return () => { };
        }
    };
    database = null;
} else {
    isDemo = false;
    try {
        const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

        // Ensure we properly set persistence for React Native, and fallback to getAuth 
        // to avoid "already initialized" errors when Expo Fast refreshes code
        try {
            auth = initializeAuth(app, {
                persistence: getReactNativePersistence(AsyncStorage)
            });
        } catch (authError) {
            auth = getAuth(app);
        }

        database = getDatabase(app);
    } catch (error) {
        console.error("Firebase initialization failed:", error);
        isDemo = true;
        auth = { currentUser: { uid: 'demo-user-123' } };
        database = null;
    }
}

export { auth, database, isDemo };
export default getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
