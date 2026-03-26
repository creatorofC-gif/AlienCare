import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import GradientBackground from '../components/GradientBackground';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING } from '../constants/theme';

const NameSetupScreen = ({ navigation, route }) => {
    const [name, setName] = useState('');
    const phoneNumber = route.params?.phoneNumber || '';

    const handleSave = async () => {
        if (name.trim().length === 0) {
            Alert.alert("Name Required", "Please enter your name.");
            return;
        }

        try {
            await AsyncStorage.setItem('isLoggedIn', 'true');
            await AsyncStorage.setItem('username', name.trim());
        } catch (e) {
            console.error('Failed to save name', e);
        }

        navigation.navigate('Bluetooth', {
            username: name.trim()
        });
    };

    return (
        <GradientBackground>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.title}>What's your name?</Text>
                        <Text style={styles.subtitle}>Enter your name to personalize your experience</Text>
                    </View>

                    <View style={styles.form}>
                        <TextInput
                            style={styles.input}
                            placeholder="Your Name"
                            placeholderTextColor="rgba(255,255,255,0.6)"
                            value={name}
                            onChangeText={setName}
                            autoCapitalize="words"
                            maxLength={30}
                        />

                        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                            <Text style={styles.saveButtonText}>Continue</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </GradientBackground>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: SPACING.lg,
        paddingTop: 100,
    },
    header: {
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
        fontSize: 18,
        marginBottom: 30,
    },
    saveButton: {
        backgroundColor: COLORS.secondary,
        height: 55,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 8,
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default NameSetupScreen;
