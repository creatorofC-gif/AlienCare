import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Easing, Alert } from 'react-native';
import { ChevronLeft, Bluetooth, Smartphone, BatteryMedium, CheckCircle2 } from 'lucide-react-native';
import GradientBackground from '../components/GradientBackground';
import { COLORS, SPACING } from '../constants/theme';
import { requestBluetoothPermission, connectToTherapyBand } from '../../BLE_connection/TherapyBle';

const BluetoothScreen = ({ navigation, route }) => {
    const username = route?.params?.username || '';
    const selectedDevice = 'Smart Band';
    const [currentStep, setCurrentStep] = useState(0);
    const [isBluetoothConnected, setIsBluetoothConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isNearConfirmed, setIsNearConfirmed] = useState(false);
    const [isPowerConfirmed, setIsPowerConfirmed] = useState(false);
    const [isPairingComplete, setIsPairingComplete] = useState(false);

    const steps = [
        {
            title: 'Step 1',
            description: 'Connect to Bluetooth to start pairing.',
            actionLabel: isConnecting ? 'Connecting...' : (isBluetoothConnected ? 'Bluetooth Connected' : 'Connect Bluetooth'),
            icon: Bluetooth,
        },
        {
            title: 'Step 2',
            description: 'Keep your smart band near your phone.',
            actionLabel: isNearConfirmed ? 'Band is Nearby' : 'Band is Nearby',
            icon: Smartphone,
        },
        {
            title: 'Step 3',
            description: 'Confirm the band is charged and powered ON.',
            actionLabel: isPowerConfirmed ? 'Band is Powered ON' : 'Band is Powered ON',
            icon: BatteryMedium,
        },
        {
            title: 'Step 4',
            description: 'Complete pairing and continue to dashboard.',
            actionLabel: isPairingComplete ? 'Pairing Complete' : 'Finish Pairing',
            icon: CheckCircle2,
        },
    ];

    const titleAnim = useRef(new Animated.Value(0)).current;
    const stepAnim = useRef(new Animated.Value(0)).current;
    const buttonAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(0)).current;
    const progressAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animations = [
            Animated.timing(titleAnim, {
                toValue: 1,
                duration: 350,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(stepAnim, {
                toValue: 1,
                duration: 320,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(buttonAnim, {
                toValue: 1,
                duration: 300,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
        ];

        Animated.sequence(animations).start();

        const pulseLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 900,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 0,
                    duration: 900,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
            ])
        );

        pulseLoop.start();
        return () => pulseLoop.stop();
    }, [buttonAnim, pulseAnim, stepAnim, titleAnim]);

    useEffect(() => {
        stepAnim.setValue(0);
        Animated.timing(stepAnim, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [currentStep, stepAnim]);

    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: (currentStep + 1) / steps.length,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [currentStep, progressAnim, steps.length]);

    const handleStepAction = () => {
        if (currentStep === 0) {
            if (isBluetoothConnected || isConnecting) return;
            setIsConnecting(true);

            requestBluetoothPermission().then(() => {
                connectToTherapyBand((success) => {
                    setIsConnecting(false);
                    if (success) {
                        setIsBluetoothConnected(true);
                        setCurrentStep(1);
                    } else {
                        Alert.alert("Connection Failed", "Could not connect to the device. Please try again.");
                    }
                });
            }).catch(err => {
                setIsConnecting(false);
                Alert.alert("Permission Error", "Could not request Bluetooth permission.");
            });
            return;
        }

        if (currentStep === 1) {
            setIsNearConfirmed(true);
            setCurrentStep(2);
            return;
        }

        if (currentStep === 2) {
            setIsPowerConfirmed(true);
            setCurrentStep(3);
            return;
        }

        if (currentStep === 3) {
            setIsPairingComplete(true);
        }
    };

    const canContinue = isBluetoothConnected && isNearConfirmed && isPowerConfirmed && isPairingComplete;

    const progressPercent = progressAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
    });

    const activeStep = steps[currentStep];

    return (
        <GradientBackground>
            <View style={styles.container}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <ChevronLeft color="#fff" size={24} />
                </TouchableOpacity>

                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                    <Animated.View
                        style={[
                            styles.beaconWrap,
                            {
                                transform: [
                                    {
                                        scale: pulseAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [1, 1.08],
                                        }),
                                    },
                                ],
                                opacity: pulseAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.7, 1],
                                }),
                            },
                        ]}
                    >
                        <View style={styles.beaconOuter}>
                            <Bluetooth color={isBluetoothConnected ? "#26C6DA" : "#fff"} size={36} />
                        </View>
                    </Animated.View>

                    <Animated.Text
                        style={[
                            styles.title,
                            {
                                opacity: titleAnim,
                                transform: [
                                    {
                                        translateY: titleAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [18, 0],
                                        }),
                                    },
                                ],
                            },
                        ]}
                    >
                        Instruction how to use Smart Band
                    </Animated.Text>

                    <View style={styles.stepCountWrap}>
                        <Text style={styles.stepCountText}>Step {currentStep + 1} of {steps.length}</Text>
                    </View>

                    <View style={styles.progressTrackGlobal}>
                        <Animated.View style={[styles.progressFillGlobal, { width: progressPercent }]} />
                    </View>

                    <Animated.View
                        style={[
                            styles.stepContainer,
                            {
                                opacity: stepAnim,
                                transform: [
                                    {
                                        translateY: stepAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [20, 0],
                                        }),
                                    },
                                ],
                            },
                        ]}
                    >
                        <View style={styles.stepHeader}>
                            <View style={styles.stepBadge}>
                                {activeStep.icon && (
                                    <activeStep.icon color="#fff" size={20} />
                                )}
                            </View>
                            <Text style={styles.stepTitle}>{activeStep.title}</Text>
                        </View>
                        <Text style={styles.stepDescription}>{activeStep.description}</Text>
                        <TouchableOpacity
                            style={[
                                styles.stepActionButton,
                                (currentStep === 0 && isConnecting) && styles.stepActionButtonDisabled,
                                ((currentStep === 0 && isBluetoothConnected) ||
                                    (currentStep === 1 && isNearConfirmed) ||
                                    (currentStep === 2 && isPowerConfirmed) ||
                                    (currentStep === 3 && isPairingComplete)) && styles.stepActionButtonDone,
                            ]}
                            onPress={handleStepAction}
                            disabled={currentStep === 0 && isConnecting}
                        >
                            <Text style={styles.stepActionButtonText}>{activeStep.actionLabel}</Text>
                        </TouchableOpacity>
                    </Animated.View>

                    <Animated.View
                        style={[
                            styles.buttonWrap,
                            {
                                opacity: buttonAnim,
                                transform: [
                                    {
                                        translateY: buttonAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [18, 0],
                                        }),
                                    },
                                ],
                            },
                        ]}
                    >
                        <TouchableOpacity
                            style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
                            disabled={!canContinue}
                            onPress={() =>
                                navigation.navigate('Dashboard', {
                                    username,
                                    deviceName: selectedDevice,
                                })
                            }
                        >
                            <Text style={styles.continueButtonText}>Continue</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </ScrollView>
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
        marginBottom: 40,
    },
    content: {
        alignItems: 'center',
        paddingBottom: 40,
    },
    stepCountWrap: {
        width: '100%',
        marginBottom: 10,
    },
    stepCountText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontWeight: '600',
    },
    progressTrackGlobal: {
        width: '100%',
        height: 5,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.18)',
        overflow: 'hidden',
        marginBottom: 22,
    },
    progressFillGlobal: {
        height: '100%',
        backgroundColor: 'rgba(255,255,255,0.95)',
    },
    beaconWrap: {
        marginBottom: 18,
    },
    beaconOuter: {
        width: 74,
        height: 74,
        borderRadius: 37,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    beaconInner: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'rgba(255,255,255,0.85)',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 40,
    },
    stepContainer: {
        width: '100%',
        marginBottom: 25,
        padding: 16,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    stepHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    stepBadge: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    stepBadgeText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    stepTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 5,
    },
    stepDescription: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.8)',
        lineHeight: 24,
    },
    stepActionButton: {
        marginTop: 12,
        borderRadius: 12,
        height: 44,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    stepActionButtonDisabled: {
        opacity: 0.7,
    },
    stepActionButtonDone: {
        backgroundColor: 'rgba(38, 198, 218, 0.4)',
    },
    stepActionButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    continueButton: {
        backgroundColor: COLORS.secondary,
        height: 55,
        width: '100%',
        borderRadius: 27.5,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 50,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 8,
    },
    continueButtonDisabled: {
        opacity: 0.45,
    },
    buttonWrap: {
        width: '100%',
        marginTop: 25,
    },
    continueButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default BluetoothScreen;
