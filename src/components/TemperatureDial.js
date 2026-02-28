import React, { useRef, useEffect } from 'react';
import { StyleSheet, View, PanResponder, Dimensions, Animated, Easing } from 'react-native';
import Svg, { Path, Circle, G, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { COLORS } from '../constants/theme';

const { width } = Dimensions.get('window');
const DIAL_SIZE = width * 0.85;
const STROKE_WIDTH = 35;
const RADIUS = (DIAL_SIZE - STROKE_WIDTH) / 2;
const CENTER = DIAL_SIZE / 2;
const INNER_RADIUS = RADIUS - STROKE_WIDTH / 2 - 10;

const TemperatureDial = ({ value, min, max, onChange, mode = 'Off', timerValue, isTimerRunning }) => {
    // Animation values
    const animatedAngle = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(1)).current;

    // Animate when value changes
    useEffect(() => {
        const range = max - min;
        if (range <= 0) {
            animatedAngle.setValue(0);
            return;
        }

        const clampedValue = Math.min(Math.max(value, min), max);
        const targetAngle = ((clampedValue - min) / range) * 360;

        // Smooth animation to new angle
        Animated.spring(animatedAngle, {
            toValue: targetAngle,
            damping: 20,
            stiffness: 120,
            useNativeDriver: false,
        }).start();
    }, [value, min, max]);

    const polarToCartesian = (angle) => {
        const r = RADIUS;
        const a = ((angle - 90) * Math.PI) / 180.0;
        const x = CENTER + r * Math.cos(a);
        const y = CENTER + r * Math.sin(a);
        return { x, y };
    };

    const cartesianToPolar = (x, y) => {
        const dx = x - CENTER;
        const dy = y - CENTER;
        let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        if (angle < 0) angle += 360;
        return angle;
    };

    const range = max - min;
    const clampedValue = Math.min(Math.max(value, min), max);
    const angleOfValue = range <= 0 ? 0 : ((clampedValue - min) / range) * 360;
    const { x, y } = polarToCartesian(angleOfValue);

    const panResponder = React.useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => mode !== 'Off',
            onMoveShouldSetPanResponder: () => mode !== 'Off',
            onPanResponderGrant: () => {
                Animated.spring(scaleAnim, {
                    toValue: 0.95,
                    useNativeDriver: true,
                }).start();
            },
            onPanResponderMove: (e) => {
                if (mode === 'Off' || range <= 0) return;

                const { locationX, locationY } = e.nativeEvent;
                const adjustedX = locationX - (width - DIAL_SIZE) / 2;
                const adjustedY = locationY - 20;

                let angle = cartesianToPolar(adjustedX, adjustedY);
                if (angle < 0) angle = 0;
                if (angle > 360) angle = 360;

                let newValue = Math.round(min + (angle / 360) * range);
                if (newValue < min) newValue = min;
                if (newValue > max) newValue = max;

                if (onChange) {
                    onChange(newValue);
                }
            },
            onPanResponderRelease: () => {
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                }).start();
            },
        })
    ).current;

    // Clean color scheme
    const isHot = mode === 'Hot';
    const isCold = mode === 'Cold';

    const hotColors = {
        primary: '#FF6B35',
        secondary: '#FF8C42',
        track: 'rgba(255, 107, 53, 0.2)',
    };

    const coldColors = {
        primary: '#00B4D8',
        secondary: '#0096C7',
        track: 'rgba(0, 180, 216, 0.2)',
    };

    const offColors = {
        primary: '#6C757D',
        secondary: '#495057',
        track: 'rgba(108, 117, 125, 0.2)',
    };

    const colors = isHot ? hotColors : (isCold ? coldColors : offColors);

    return (
        <View style={styles.container}>
            <Animated.View
                style={[
                    styles.shadowContainer,
                    {
                        transform: [{ scale: scaleAnim }],
                    }
                ]}
            >
                <Svg width={DIAL_SIZE} height={DIAL_SIZE}>
                    <Defs>
                        {/* Clean gradient for the track */}
                        <LinearGradient id="gradientTrack" x1="0%" y1="0%" x2="100%" y2="0%">
                            <Stop offset="0%" stopColor={colors.secondary} />
                            <Stop offset="100%" stopColor={colors.primary} />
                        </LinearGradient>
                    </Defs>

                    {/* Background Track (subtle) */}
                    <Circle
                        cx={CENTER}
                        cy={CENTER}
                        r={RADIUS}
                        stroke={colors.track}
                        strokeWidth={STROKE_WIDTH}
                        fill="transparent"
                        strokeLinecap="round"
                    />

                    {/* Active Progress Path */}
                    {range > 0 && (
                        <Path
                            d={`M ${polarToCartesian(0).x} ${polarToCartesian(0).y} A ${RADIUS} ${RADIUS} 0 ${angleOfValue > 180 ? 1 : 0} 1 ${x} ${y}`}
                            stroke="url(#gradientTrack)"
                            strokeWidth={STROKE_WIDTH}
                            fill="transparent"
                            strokeLinecap="round"
                        />
                    )}

                    {/* Clean tick marks - hidden in Cold mode */}
                    {mode !== 'Cold' && Array.from({ length: 8 }).map((_, i) => {
                        const tickAngle = (i / 8) * 360;
                        const innerTick = {
                            x: CENTER + (INNER_RADIUS) * Math.cos(((tickAngle - 90) * Math.PI) / 180),
                            y: CENTER + (INNER_RADIUS) * Math.sin(((tickAngle - 90) * Math.PI) / 180),
                        };
                        const outerTick = {
                            x: CENTER + (INNER_RADIUS + 8) * Math.cos(((tickAngle - 90) * Math.PI) / 180),
                            y: CENTER + (INNER_RADIUS + 8) * Math.sin(((tickAngle - 90) * Math.PI) / 180),
                        };
                        const isActive = tickAngle <= angleOfValue;

                        return (
                            <G key={i}>
                                <Path
                                    d={`M ${innerTick.x} ${innerTick.y} L ${outerTick.x} ${outerTick.y}`}
                                    stroke={isActive ? colors.primary : 'rgba(255,255,255,0.15)'}
                                    strokeWidth={isActive ? 2.5 : 1.5}
                                    strokeLinecap="round"
                                />
                            </G>
                        );
                    })}

                    {/* Handle */}
                    {range > 0 && (
                        <G {...panResponder.panHandlers}>
                            {/* Subtle glow */}
                            <Circle
                                cx={x}
                                cy={y}
                                r={24}
                                fill={colors.primary}
                                opacity={0.3}
                            />
                            {/* Main handle */}
                            <Circle
                                cx={x}
                                cy={y}
                                r={18}
                                fill="#FFFFFF"
                                stroke={colors.primary}
                                strokeWidth={3}
                            />
                            {/* Inner dot */}
                            <Circle
                                cx={x}
                                cy={y}
                                r={6}
                                fill={colors.primary}
                            />
                        </G>
                    )}

                    {/* Center Display */}
                    <G>
                        {/* Clean background circle */}
                        <Circle
                            cx={CENTER}
                            cy={CENTER}
                            r={INNER_RADIUS - 15}
                            fill="rgba(0,0,0,0.25)"
                        />

                        {/* Temperature Value */}
                        <SvgText
                            x={CENTER}
                            y={isTimerRunning ? CENTER - 10 : CENTER + 10}
                            fontSize="56"
                            fontWeight="300"
                            fill="#FFFFFF"
                            textAnchor="middle"
                            alignmentBaseline="middle"
                        >
                            {mode === 'Off' ? 'OFF' : `${Math.round(clampedValue)}°`}
                        </SvgText>

                        {/* Timer Display Inside Dial */}
                        {isTimerRunning && (
                            <SvgText
                                x={CENTER}
                                y={CENTER + 35}
                                fontSize="22"
                                fontWeight="600"
                                fill={colors.primary}
                                textAnchor="middle"
                                alignmentBaseline="middle"
                                letterSpacing="1"
                            >
                                {timerValue}
                            </SvgText>
                        )}
                    </G>
                </Svg>
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 20,
        width: '100%',
    },
    shadowContainer: {
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 8,
        },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 15,
    }
});

export default TemperatureDial;
