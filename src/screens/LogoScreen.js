import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, Animated } from 'react-native';
import GradientBackground from '../components/GradientBackground';
import { COLORS, FONTS } from '../constants/theme';

const LogoScreen = ({ navigation }) => {
    const fadeAnim = new Animated.Value(0);

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
        }).start();

        const timer = setTimeout(() => {
            navigation.replace('Login');
        }, 3000);

        return () => clearTimeout(timer);
    }, [navigation]);

    return (
        <GradientBackground style={styles.container}>
            <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
                <View style={styles.logoContainer}>
                    {/* Logo placeholder - would be an image if provided */}
                    <View style={styles.logoCircle}>
                        <Text style={styles.logoIcon}>👽</Text>
                        <View style={styles.crossContainer}>
                            <Text style={styles.crossText}>+</Text>
                        </View>
                    </View>
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
