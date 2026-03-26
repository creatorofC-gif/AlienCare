import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { ChevronLeft, User as UserIcon, Smartphone, LogOut, Trash2 } from 'lucide-react-native';
import { CommonActions } from '@react-navigation/native';
import GradientBackground from '../components/GradientBackground';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { disconnectDevice } from '../../BLE_connection/TherapyBle';
import { COLORS, SPACING } from '../constants/theme';

const ProfileScreen = ({ navigation, route }) => {
    const username = route?.params?.username || 'User';
    const deviceName = route?.params?.deviceName || 'Smart Band';

    const handleLogout = async () => {
        try {
            disconnectDevice(); // Ensure the hardware connection fully drops
            await AsyncStorage.removeItem('isLoggedIn');
            await AsyncStorage.removeItem('username');
        } catch (error) {
            console.log('Logout fallback:', error?.message || error);
        }

        navigation.dispatch(
            CommonActions.reset({
                index: 0,
                routes: [{ name: 'Signup' }],
            })
        );
    };

    const handleForgetDevice = async () => {
        Alert.alert(
            "Forget Device?",
            "This will disconnect the current band and restart the pairing process. You will need to scan again.",
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Forget", 
                    style: "destructive", 
                    onPress: async () => {
                        try {
                            disconnectDevice(); // Explicity kill the BLE connection first
                            await AsyncStorage.removeItem('hasSeenBluetoothOnLaunch');
                            // Also logout to be safe and restart flow
                            await AsyncStorage.removeItem('isLoggedIn');
                            navigation.dispatch(
                                CommonActions.reset({
                                    index: 0,
                                    routes: [{ name: 'Signup' }],
                                })
                            );
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }
            ]
        );
    };

    return (
        <GradientBackground>
            <View style={styles.container}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <ChevronLeft color="#fff" size={24} />
                </TouchableOpacity>

                <Text style={styles.title}>Profile</Text>

                <View style={styles.card}>
                    <View style={styles.row}>
                        <UserIcon color="#fff" size={20} />
                        <View style={styles.textWrap}>
                            <Text style={styles.label}>Username</Text>
                            <Text style={styles.value}>{username}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.card}>
                    <View style={styles.row}>
                        <Smartphone color="#fff" size={20} />
                        <View style={styles.textWrap}>
                            <Text style={styles.label}>Device</Text>
                            <Text style={styles.value}>{deviceName}</Text>
                        </View>
                    </View>
                </View>

                <TouchableOpacity 
                    style={[styles.logoutButton, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)', borderWidth: 1 }]} 
                    onPress={handleForgetDevice}
                >
                    <Trash2 color="#ef4444" size={18} />
                    <Text style={[styles.logoutText, { color: '#ef4444' }]}>Forget Device</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.logoutButton, { marginTop: 16 }]} onPress={handleLogout}>
                    <LogOut color="#fff" size={18} />
                    <Text style={styles.logoutText}>Log Out</Text>
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
        marginBottom: 30,
    },
    title: {
        fontSize: 30,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 30,
    },
    card: {
        width: '100%',
        borderRadius: 16,
        padding: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        marginBottom: 16,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    textWrap: {
        marginLeft: 12,
    },
    label: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        marginBottom: 4,
    },
    value: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    logoutButton: {
        marginTop: 24,
        height: 52,
        borderRadius: 26,
        backgroundColor: COLORS.secondary,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
    logoutText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
        marginLeft: 8,
    },
});

export default ProfileScreen;
