import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/theme';

const GradientBackground = ({ children, style, mode = 'Off' }) => {
    
    let startColor, endColor;

    if (mode === 'Hot') {
        startColor = COLORS.hotBgStart;
        endColor = COLORS.hotBgEnd;
    } else if (mode === 'Cold') {
        startColor = COLORS.coldBgStart;
        endColor = COLORS.coldBgEnd;
    } else {
        startColor = COLORS.offBgStart;
        endColor = COLORS.offBgEnd;
    }

    return (
        <LinearGradient
            colors={[startColor, endColor]}
            style={[styles.container, style]}
            start={{ x: 0.5, y: 0.2 }}
            end={{ x: 0.5, y: 1.0 }}
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
