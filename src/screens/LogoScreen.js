import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GradientBackground from '../components/GradientBackground';
import { COLORS, FONTS } from '../constants/theme';

const LogoScreen = ({ navigation, route }) => {
    const fadeAnim = React.useRef(new Animated.Value(0)).current;
    const safeResume = route?.params?.safeResume === true;

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
        }).start();

        const checkLoginStatus = async () => {
            try {
                const hasSeenNewSetup = await AsyncStorage.getItem('hasSeenNewSetup_v4');
                if (!hasSeenNewSetup) {
                    await AsyncStorage.multiRemove(['isLoggedIn', 'username', 'hasSeenBluetoothOnLaunch']);
                    await AsyncStorage.setItem('hasSeenNewSetup_v4', 'true');
                }

                const isLoggedIn = await AsyncStorage.getItem('isLoggedIn');
                if (isLoggedIn === 'true') {
                    const username = await AsyncStorage.getItem('username') || 'User';

                    if (safeResume) {
                        navigation.replace('Dashboard', {
                            username,
                            deviceName: 'Smart Band',
                            isConnected: false,
                            autoConnect: false,
                            safeResume: true,
                        });
                        return;
                    }

                    const hasSeenBluetoothOnLaunch = await AsyncStorage.getItem('hasSeenBluetoothOnLaunch');

                    if (hasSeenBluetoothOnLaunch === 'true') {
                        navigation.replace('Dashboard', { 
                            username, 
                            deviceName: 'Smart Band', 
                            isConnected: false,
                            autoConnect: false 
                        });
                    } else {
                        await AsyncStorage.setItem('hasSeenBluetoothOnLaunch', 'true');
                        navigation.replace('Bluetooth', { username });
                    }
                } else {
                    navigation.replace('Login');
                }
            } catch (error) {
                console.error("Error checking login status:", error);
                navigation.replace('Login');
            }
        };

        const timer = setTimeout(() => {
            checkLoginStatus();
        }, 3000);

        return () => clearTimeout(timer);
    }, [navigation, safeResume]);

    return (
        <GradientBackground style={styles.container}>
            <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
                <View style={styles.logoContainer}>
                    <Image
                        source={require('../../assets/title_icon.png')}
                        style={{ width: 150, height: 150 }}
                        resizeMode="contain"
                    />
                </View>
                <Text style={styles.title}>Alien Healthcare</Text>
            </Animated.View>
        </GradientBackground>
    );
};

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        alignItems: 'center',
    },
    logoContainer: {
        width: 150,
        height: 150,
        marginBottom: 20,
    },
    logoCircle: {
        width: 150,
        height: 150,
        borderRadius: 75,
        borderWidth: 2,
        borderColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoIcon: {
        fontSize: 80,
    },
    crossContainer: {
        position: 'absolute',
        top: 30,
        right: 30,
        backgroundColor: COLORS.primary,
        width: 30,
        height: 30,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
    },
    crossText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    title: {
        fontSize: FONTS.size.h1,
        fontWeight: FONTS.weight.bold,
        color: '#FFFFFF',
        marginTop: 20,
    },
});

export default LogoScreen;
