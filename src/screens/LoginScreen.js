import React, { useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    Alert,
} from 'react-native';
import { auth } from '../firebase/firebaseConfig';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';
import GradientBackground from '../components/GradientBackground';
import { COLORS, FONTS, SPACING } from '../constants/theme';

// Ensure the auth session closes correctly
WebBrowser.maybeCompleteAuthSession();

const LoginScreen = ({ navigation }) => {

    const WEB_CLIENT_ID = '575262954263-cdcb8s4vissnno1q7rjaij9usqkhpkfc.apps.googleusercontent.com';
    const ANDROID_CLIENT_ID = '575262954263-4rubnaebvqa16vjop68jtpqol7t2p32q.apps.googleusercontent.com';

    const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
        webClientId: WEB_CLIENT_ID,
        androidClientId: ANDROID_CLIENT_ID,
        // Using an empty makeRedirectUri() directs it back to localhost or the native app scheme
        // without routing through Google's banned proxy flow.
        redirectUri: makeRedirectUri(),
    });

    const handleGoogleLogin = () => {
        if (WEB_CLIENT_ID.includes('PASTE_YOUR') || ANDROID_CLIENT_ID.includes('PASTE_YOUR')) {
            Alert.alert(
                'Missing Client IDs',
                'You still need to paste your WEB Client ID! Firebase requires it even for Android.'
            );
            return;
        }
        promptAsync();
    };

    useEffect(() => {
        if (response?.type === 'success') {
            const { id_token } = response.params;
            const credential = GoogleAuthProvider.credential(id_token);

            signInWithCredential(auth, credential)
                .then((userCredential) => {
                    console.log('Google Auth Success:', userCredential.user.email);
                    navigation.navigate('Bluetooth', {
                        email: userCredential.user.email,
                        username: userCredential.user.displayName || 'Google User'
                    });
                })
                .catch((error) => {
                    console.error('Firebase Auth Error:', error);
                    Alert.alert('Google Auth Failed', error.message);
                });
        }
    }, [response]);

    return (
        <GradientBackground>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.container}
            >
                <View style={styles.header}>
                    <Text style={styles.title}>Sign Up</Text>
                    <Text style={styles.subtitle}>Create a new account</Text>
                </View>

                <View style={styles.form}>
                    <Pressable
                        style={[styles.googleButton, !request && styles.googleButtonDisabled]}
                        onPress={handleGoogleLogin}
                        disabled={!request}
                        android_ripple={{ color: 'rgba(255,255,255,0.3)' }}
                    >
                        <Text style={styles.googleButtonText}>Continue with Google</Text>
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </GradientBackground>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: SPACING.lg,
        justifyContent: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 50,
    },
    title: {
        fontSize: 40,
        fontWeight: 'bold',
        color: '#fff',
    },
    subtitle: {
        fontSize: FONTS.size.body,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 10,
    },
    form: {
        width: '100%',
    },
    googleButtonDisabled: {
        opacity: 0.6,
    },
    googleButton: {
        backgroundColor: '#fff',
        height: 55,
        borderRadius: 27.5,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 8,
    },
    googleButtonText: {
        color: '#333',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default LoginScreen;
