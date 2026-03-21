import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronLeft, User as UserIcon, Smartphone, LogOut } from 'lucide-react-native';
import { CommonActions } from '@react-navigation/native';
import GradientBackground from '../components/GradientBackground';
import { auth } from '../firebase/firebaseConfig';
import { COLORS, SPACING } from '../constants/theme';

const ProfileScreen = ({ navigation, route }) => {
    const username = route?.params?.username || auth?.currentUser?.displayName || 'User';
    const deviceName = route?.params?.deviceName || 'Smart Band';

    const handleLogout = async () => {
        try {
            if (auth && typeof auth.signOut === 'function') {
                await auth.signOut();
            }
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

                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
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
