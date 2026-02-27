import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import GradientBackground from '../components/GradientBackground';
import { COLORS, FONTS, SPACING } from '../constants/theme';

const VerificationScreen = ({ navigation, route }) => {
    const [code, setCode] = useState(['', '', '', '']);
    const inputs = useRef([]);

    const expectedOtp = route?.params?.otp ? String(route.params.otp) : null;
    const email = route?.params?.email || null;
    const username = route?.params?.username || null;

    const handleChange = (text, index) => {
        const newCode = [...code];
        newCode[index] = text;
        setCode(newCode);

        if (text && index < 3) {
            inputs.current[index + 1].focus();
        }
    };

    const handleVerify = () => {
        const entered = code.join('');

        if (!code.every(digit => digit !== '')) {
            alert('Please enter the 4-digit code');
            return;
        }

        // If we have an expected OTP from navigation, verify it.
        if (expectedOtp && entered !== expectedOtp) {
            alert('Incorrect code. Please try again.');
            return;
        }

        navigation.navigate('Bluetooth', {
            username,
            email,
        });
    };

    return (
        <GradientBackground>
            <View style={styles.container}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <ChevronLeft color="#fff" size={24} />
                </TouchableOpacity>

                <View style={styles.header}>
                    <Text style={styles.title}>Verification</Text>
                    <Text style={styles.subtitle}>
                        {email
                            ? `We have sent a 4-digit code to ${email}`
                            : 'Enter the 4-digit code we sent to your email'}
                    </Text>
                </View>

                <View style={styles.otpContainer}>
                    {code.map((digit, index) => (
                        <TextInput
                            key={index}
                            ref={(ref) => (inputs.current[index] = ref)}
                            style={styles.otpInput}
                            keyboardType="number-pad"
                            maxLength={1}
                            value={digit}
                            onChangeText={(text) => handleChange(text, index)}
                            placeholderTextColor="rgba(255,255,255,0.3)"
                        />
                    ))}
                </View>

                <TouchableOpacity style={styles.verifyButton} onPress={handleVerify}>
                    <Text style={styles.verifyButtonText}>Verify</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.resendContainer}>
                    <Text style={styles.resendText}>
                        If you don't receive a code, you can request a new one in <Text style={styles.resendLink}>30 sec</Text>
                    </Text>
                    <Text style={styles.resendLink}>Resend</Text>
                </TouchableOpacity>
            </View>
        </GradientBackground>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: SPACING.lg,
        paddingTop: 60,
    },
    backButton: {
        marginBottom: 40,
    },
    header: {
        alignItems: 'center',
        marginBottom: 50,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#fff',
    },
    subtitle: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center',
        marginTop: 15,
    },
    otpContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 40,
        paddingHorizontal: 20,
    },
    otpInput: {
        width: 65,
        height: 65,
        backgroundColor: '#fff',
        borderRadius: 12,
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        color: '#333',
    },
    verifyButton: {
        backgroundColor: COLORS.secondary,
        height: 55,
        borderRadius: 27.5,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 8,
    },
    verifyButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    resendContainer: {
        alignItems: 'center',
        marginTop: 30,
    },
    resendText: {
        color: '#fff',
        fontSize: 14,
    },
    resendLink: {
        color: COLORS.secondary,
        fontWeight: 'bold',
    },
});

export default VerificationScreen;
