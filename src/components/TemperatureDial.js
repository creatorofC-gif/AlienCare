import React, { useRef, useEffect } from 'react';
import { StyleSheet, View, PanResponder, Dimensions, Animated, Text, TouchableOpacity } from 'react-native';
import Svg, { Path, Circle, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { COLORS } from '../constants/theme';
import { Snowflake } from 'lucide-react-native';

const { width } = Dimensions.get('window');
const DIAL_SIZE = width * 0.72; // Adjusted to match design scale (w-72)
const STROKE_WIDTH = 30; // slightly thicker for conic feeling
const RADIUS = (DIAL_SIZE - STROKE_WIDTH) / 2;
const CENTER = DIAL_SIZE / 2;
const INNER_RADIUS = RADIUS - STROKE_WIDTH / 2 - 10;

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

    useEffect(() => {
        const range = max - min;
        if (range <= 0) {
            animatedAngle.setValue(0);
            return;
        }

        const clampedValue = Math.min(Math.max(value, min), max);
        const targetAngle = ((clampedValue - min) / range) * 360;

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

    const lastAngleRef = useRef(((clampedValue - min) / range) * 360);

    const panResponder = React.useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => mode === 'Hot' || mode === 'Cold',
            onMoveShouldSetPanResponder: () => mode === 'Hot' || mode === 'Cold',
            onPanResponderGrant: (e) => {
                const { locationX, locationY } = e.nativeEvent;
                const adjustedX = locationX - (width - DIAL_SIZE) / 2;
                const adjustedY = locationY - 20;
                lastAngleRef.current = cartesianToPolar(adjustedX, adjustedY);

                Animated.spring(scaleAnim, {
                    toValue: 0.95,
                    useNativeDriver: true,
                }).start();
                if (onInteractionStart) {
                    onInteractionStart();
                }
            },
            onPanResponderMove: (e) => {
                if ((mode !== 'Hot' && mode !== 'Cold') || range <= 0) return;

                const { locationX, locationY } = e.nativeEvent;
                const adjustedX = locationX - (width - DIAL_SIZE) / 2;
                const adjustedY = locationY - 20;

                let angle = cartesianToPolar(adjustedX, adjustedY);
                
                // Prevent wrap-around
                const prevAngle = lastAngleRef.current;
                
                // If there's a huge jump (e.g. 350 -> 10 or 10 -> 350), it's likely a wrap-around
                if (Math.abs(angle - prevAngle) > 180) {
                    if (prevAngle > 180 && angle < 180) {
                        // User trying to wrap past 360 to 0
                        angle = 359.9;
                    } else if (prevAngle < 180 && angle > 180) {
                        // User trying to wrap past 0 to 360
                        angle = 0.1;
                    }
                }
                
                lastAngleRef.current = angle;

                let newValue = Math.round(min + (angle / 360) * range);
                if (newValue < min) newValue = min;
                if (newValue > max) newValue = max;

                if (onChange) onChange(newValue);
            },
            onPanResponderRelease: () => {
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                }).start();
                if (onInteractionEnd) {
                    onInteractionEnd();
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
                {...panResponder.panHandlers}
            >
                <Svg width={DIAL_SIZE} height={DIAL_SIZE}>
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
                                r={12}
                                fill={colors.primary}
                                opacity={0.6}
                            />
                            {/* Main white handle with border */}
                            <Circle
                                cx={x}
                                cy={y}
                                r={10}
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
                                isHot
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
                                    isHot ? { color: COLORS.hot } : { color: 'white' },
                                ]}
                            >
                                SET TIMER
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
