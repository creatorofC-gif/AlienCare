import React, { useRef, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { StyleSheet, View, PanResponder, Dimensions, Animated, Text, TouchableOpacity, Vibration, NativeModules } from 'react-native';
const { TherapyTimer } = NativeModules;
import Svg, { Path, Circle, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { COLORS } from '../constants/theme';
import { Snowflake } from 'lucide-react-native';

const { width } = Dimensions.get('window');
const DIAL_SIZE = width * 0.85; // Adjusted dial size (was 0.72)
const STROKE_WIDTH = 36; // slightly thicker for conic feeling (was 30)
const RADIUS = (DIAL_SIZE - STROKE_WIDTH) / 2;
const CENTER = DIAL_SIZE / 2;
const INNER_RADIUS = RADIUS - STROKE_WIDTH / 2 - 10;
const MAX_ANGLE = 340;

const TemperatureDial = ({
    value,
    min,
    max,
    onChange,
    mode = 'Off',
    timerValue,
    isTimerRunning,
    onTimerPress,
    onInteractionStart,
    onInteractionEnd,
}) => {
    const animatedAngle = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const lastValRef = useRef(value);

    const triggerDialHapticTick = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };

    useEffect(() => {
        const range = max - min;
        if (range <= 0) {
            animatedAngle.setValue(0);
            return;
        }

        const clampedValue = Math.min(Math.max(value, min), max);
        const targetAngle = ((clampedValue - min) / range) * MAX_ANGLE;

        Animated.spring(animatedAngle, {
            toValue: targetAngle,
            damping: 20,
            stiffness: 120,
            useNativeDriver: false,
        }).start();

        // Sync lastValRef so haptic gate stays accurate when ESP32 updates value externally
        lastValRef.current = clampedValue;
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
    const angleOfValue = range <= 0 ? 0 : ((clampedValue - min) / range) * MAX_ANGLE;
    const { x, y } = polarToCartesian(angleOfValue);

    const propsRef = useRef({ onChange, onInteractionStart, onInteractionEnd, min, max, mode, range });
    useEffect(() => {
        propsRef.current = { onChange, onInteractionStart, onInteractionEnd, min, max, mode, range };
    });

    const lastAngleRef = useRef(((clampedValue - min) / range) * MAX_ANGLE);

    const panResponder = React.useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: (e) => {
                const { mode: currentMode } = propsRef.current;
                const { locationX, locationY } = e.nativeEvent;
                const dx = locationX - 2 - CENTER;
                const dy = locationY - 2 - CENTER;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                // Only respond if touch is on the ring (with some tolerance)
                const inRing = dist >= RADIUS - STROKE_WIDTH && dist <= RADIUS + STROKE_WIDTH;
                return (currentMode === 'Hot' || currentMode === 'Cold') && inRing;
            },
            onMoveShouldSetPanResponder: (e) => {
                const { mode: currentMode } = propsRef.current;
                const { locationX, locationY } = e.nativeEvent;
                const dx = locationX - 2 - CENTER;
                const dy = locationY - 2 - CENTER;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const inRing = dist >= RADIUS - STROKE_WIDTH && dist <= RADIUS + STROKE_WIDTH;
                return (currentMode === 'Hot' || currentMode === 'Cold') && inRing;
            },
            onPanResponderGrant: (e) => {
                const { onInteractionStart: onStart } = propsRef.current;
                const { locationX, locationY } = e.nativeEvent;
                lastAngleRef.current = cartesianToPolar(locationX - 2, locationY - 2);

                Animated.spring(scaleAnim, {
                    toValue: 0.95,
                    useNativeDriver: true,
                }).start();
                if (onStart) {
                    onStart();
                }
            },
            onPanResponderMove: (e) => {
                const { mode: currentMode, range: currentRange, min: currentMin, max: currentMax, onChange: onValChange } = propsRef.current;
                if ((currentMode !== 'Hot' && currentMode !== 'Cold') || currentRange <= 0) return;

                const { locationX, locationY } = e.nativeEvent;
                let angle = cartesianToPolar(locationX - 2, locationY - 2);
                
                // Prevent sudden jumps
                let delta = angle - lastAngleRef.current;
                if (delta > 180) delta -= 360;
                if (delta < -180) delta += 360;
                
                let newAngle = lastAngleRef.current + delta;
                if (newAngle < 0) newAngle = 0;
                if (newAngle > MAX_ANGLE) newAngle = MAX_ANGLE;
                
                lastAngleRef.current = newAngle;

                let newValue = Math.round(currentMin + (newAngle / MAX_ANGLE) * currentRange);
                if (newValue < currentMin) newValue = currentMin;
                if (newValue > currentMax) newValue = currentMax;

                if (newValue !== lastValRef.current) {
                    triggerDialHapticTick();
                    lastValRef.current = newValue;
                }

                if (onValChange) onValChange(newValue);
            },
            onPanResponderRelease: () => {
                const { onInteractionEnd: onEnd } = propsRef.current;
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                }).start();
                if (onEnd) {
                    onEnd();
                }
            },
        })
    ).current;

    const isHot = mode === 'Hot';
    const isCold = mode === 'Cold';

    const colors = isHot ? {
        primary: COLORS.hot,
        secondary: COLORS.hotSecondary,
        track: COLORS.hotSecondary,
        glow: 'rgba(249, 115, 22, 0.6)'
    } : (isCold ? {
        primary: COLORS.cold,
        secondary: COLORS.coldSecondary,
        track: COLORS.coldSecondary,
        glow: 'rgba(59, 130, 246, 0.6)'
    } : {
        primary: COLORS.off,
        secondary: '#111827',
        track: '#111827',
        glow: 'rgba(255,255,255,0.1)'
    });

    const displayTemp = mode === 'Off' ? 'OFF' : `${Math.round(clampedValue)}°C`;
    const showTemperatureText = !isCold;

    return (
        <View style={styles.container}>
            <Animated.View
                style={[
                    styles.ringWrapper,
                    isHot && { shadowColor: 'rgba(124, 45, 18, 0.5)' },
                    isCold && { shadowColor: 'rgba(30, 58, 138, 0.5)' },
                    { transform: [{ scale: scaleAnim }] }
                ]}
            >
                {/* Dedicated Touch Overlay for PanResponder */}
                <View 
                    style={StyleSheet.absoluteFill} 
                    {...panResponder.panHandlers} 
                />
                <Svg width={DIAL_SIZE} height={DIAL_SIZE} pointerEvents="none">
                    <Defs>
                        <LinearGradient id="gradientTrack" x1="0%" y1="0%" x2="100%" y2="0%">
                            <Stop offset="0%" stopColor={colors.secondary} />
                            <Stop offset="100%" stopColor={colors.primary} />
                        </LinearGradient>
                    </Defs>

                    {/* Background Track Circle */}
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
                    {isHot && range > 0 && (
                        <Path
                            d={`M ${polarToCartesian(0).x} ${polarToCartesian(0).y} A ${RADIUS} ${RADIUS} 0 ${angleOfValue > 180 ? 1 : 0} 1 ${x} ${y}`}
                            stroke="url(#gradientTrack)"
                            strokeWidth={STROKE_WIDTH}
                            fill="transparent"
                            strokeLinecap="round"
                        />
                    )}

                    {/* Indicator Knob */}
                    {isHot && range > 0 && (
                        <G>
                            {/* Inner glow element replacement */}
                            <Circle
                                cx={x}
                                cy={y}
                                r={16}
                                fill={colors.primary}
                                opacity={0.6}
                            />
                            {/* Main white handle with border */}
                            <Circle
                                cx={x}
                                cy={y}
                                r={14}
                                fill="#FFFFFF"
                                stroke="rgba(255,255,255,0.4)"
                                strokeWidth={2}
                            />
                        </G>
                    )}
                </Svg>

                {/* Inner Elements OVERLAID */}
                <View style={[StyleSheet.absoluteFill, styles.innerContent]}>
                    {showTemperatureText && (
                        <Text style={styles.temperatureText}>{displayTemp}</Text>
                    )}
                    {isCold && (
                        <Snowflake
                            width={40}
                            height={40}
                            color={COLORS.cold}
                            strokeWidth={1}
                            style={styles.snowflakeGlow}
                        />
                    )}
                    {isTimerRunning && (
                        <Text style={[styles.timerText, { color: 'white' }]}>
                            {timerValue}
                        </Text>
                    )}
                    {mode !== 'Off' && (
                        <TouchableOpacity
                            style={[
                                styles.timerBtn,
                                isTimerRunning 
                                    ? {
                                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                        borderColor: 'rgba(239, 68, 68, 0.3)',
                                    }
                                    : isHot
                                    ? {
                                        backgroundColor: 'rgba(249, 115, 22, 0.1)',
                                        borderColor: 'rgba(249, 115, 22, 0.3)',
                                    }
                                    : {
                                        backgroundColor: 'rgba(255,255,255,0.05)',
                                        borderColor: 'rgba(255,255,255,0.1)',
                                    },
                            ]}
                            onPress={onTimerPress}
                        >
                            <Text
                                style={[
                                    styles.timerBtnText,
                                    isTimerRunning 
                                        ? { color: '#ef4444' } 
                                        : isHot 
                                        ? { color: COLORS.hot } 
                                        : { color: 'white' },
                                ]}
                            >
                                {isTimerRunning ? 'STOP TIMER' : 'SET TIMER'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 10,
        width: '100%',
    },
    ringWrapper: {
        width: DIAL_SIZE + 4,
        height: DIAL_SIZE + 4,
        borderRadius: (DIAL_SIZE + 4) / 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 4,
        borderColor: 'rgba(255,255,255,0.05)',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.6,
        shadowRadius: 20,
        elevation: 15,
        backgroundColor: 'transparent',
    },
    innerContent: {
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        pointerEvents: 'box-none'
    },
    temperatureText: {
        fontSize: 64,
        fontWeight: '900',
        color: '#FFFFFF',
        letterSpacing: -2,
    },
    timerText: {
        fontSize: 32,
        fontWeight: 'bold',
        marginTop: 4,
        letterSpacing: 2,
        fontVariant: ['tabular-nums']
    },
    timerBtn: {
        marginTop: 18,
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
    },
    timerBtnText: {
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
    snowflakeGlow: {
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 15,
    }
});

export default TemperatureDial;
