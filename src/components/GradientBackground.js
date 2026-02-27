import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/theme';

const GradientBackground = ({ children, style }) => {
    return (
        <LinearGradient
            colors={[COLORS.backgroundStart, COLORS.backgroundEnd]}
            style={[styles.container, style]}
        >
            {children}
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});

export default GradientBackground;
