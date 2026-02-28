import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    TextInput,
    Alert,
    ScrollView,
    Image,
} from 'react-native';
import GradientBackground from '../components/GradientBackground';
import { COLORS, FONTS, SPACING } from '../constants/theme';

const LoginScreen = ({ navigation }) => {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [otp, setOtp] = useState('');
    const [otpSent, setOtpSent] = useState(false);

    const handleSendOTP = () => {
        if (phoneNumber.length < 10) {
            Alert.alert('Invalid Number', 'Please enter a valid 10-digit mobile number.');
            return;
        }
        // Mock sending OTP
        setOtpSent(true);
        Alert.alert('OTP Sent', 'A dummy OTP has been sent. Any code works!');
    };

    const handleVerifyOTP = () => {
        if (otp.length < 4) {
            Alert.alert('Invalid OTP', 'Please enter the code you received.');
            return;
        }

        // Mock verification success
        console.log('Dummy OTP Verified Success');
        navigation.navigate('Bluetooth', {
            email: `${phoneNumber}@dummy.com`,
            username: 'OTP User'
        });
    };

    return (
        <GradientBackground>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardAvoid}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContainer}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.header}>
                        <Image
                            source={require('../../assets/icon.jpeg')}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                        <Text style={styles.title}>Alien HealthCare</Text>
                        <Text style={styles.subtitle}>Sign in with your mobile number</Text>
                    </View>

                    <View style={styles.form}>
                        {!otpSent ? (
                            <>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter Mobile Number"
                                    placeholderTextColor="rgba(255,255,255,0.6)"
                                    keyboardType="phone-pad"
                                    value={phoneNumber}
                                    onChangeText={setPhoneNumber}
                                    maxLength={10}
                                />
                                <Pressable
                                    style={styles.actionButton}
                                    onPress={handleSendOTP}
                                    android_ripple={{ color: 'rgba(255,255,255,0.3)' }}
                                >
                                    <Text style={styles.actionButtonText}>Send OTP</Text>
                                </Pressable>
                            </>
                        ) : (
                            <>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter Fake OTP (any digits)"
                                    placeholderTextColor="rgba(255,255,255,0.6)"
                                    keyboardType="number-pad"
                                    value={otp}
                                    onChangeText={setOtp}
                                    maxLength={6}
                                />
                                <Pressable
                                    style={styles.actionButton}
                                    onPress={handleVerifyOTP}
                                    android_ripple={{ color: 'rgba(255,255,255,0.3)' }}
                                >
                                    <Text style={styles.actionButtonText}>Verify & Login</Text>
                                </Pressable>

                                <Pressable
                                    style={{ marginTop: 15, alignItems: 'center', padding: 10 }}
                                    onPress={() => {
                                        setOtpSent(false);
                                        setOtp('');
                                    }}
                                >
                                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16 }}>Change Number</Text>
                                </Pressable>
                            </>
                        )}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </GradientBackground>
    );
};

const styles = StyleSheet.create({
    keyboardAvoid: {
        flex: 1,
    },
    scrollContainer: {
        flexGrow: 1,
        padding: SPACING.lg,
        justifyContent: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 50,
    },
    logo: {
        width: 120,
        height: 120,
        borderRadius: 24,
        marginBottom: 20,
        backgroundColor: '#fff',
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
    input: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        color: '#fff',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        marginBottom: 20,
    },
    actionButton: {
        backgroundColor: '#fff',
        height: 55,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 8,
    },
    actionButtonText: {
        color: '#333',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default LoginScreen;
