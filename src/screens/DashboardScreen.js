import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    SafeAreaView,
    ScrollView,
    Alert,
    BackHandler,
    Pressable,
    Platform,
    StatusBar,
    ActivityIndicator,
    Animated,
    Modal,
    TextInput,
    KeyboardAvoidingView
} from 'react-native';
import { Thermometer, Wind, Power, Clock, Plus, Settings, Home, User as UserIcon, X, ChevronLeft } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

// Setup Notification Channel for Android
const setupNotifications = async () => {
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('therapy-timer-vibrate', {
            name: 'Therapy Timer',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 500, 200, 500, 200, 500],
            lightColor: '#FF231F7C',
            sound: null, // explicitly mute sound for vibration only
            enableVibration: true,
            showBadge: true,
        });

        // Setup Silent Channel for active updates (NO Vibrate!)
        await Notifications.setNotificationChannelAsync('therapy-timer-active', {
            name: 'Active Therapy Session',
            importance: Notifications.AndroidImportance.LOW,
            vibrationPattern: [0],
            sound: null,
            enableVibration: false,
            showBadge: false,
        });

        // Setup actionable categories
        await Notifications.setNotificationCategoryAsync('therapy_timer_controls', [
            {
                identifier: 'cancel_timer',
                buttonTitle: 'Cancel',
                options: { opensAppToForeground: true }
            }
        ]);
    }
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
        console.warn('Notification permission not granted');
    }
};

import GradientBackground from '../components/GradientBackground';
import TemperatureDial from '../components/TemperatureDial';
import WheelTimer from '../components/WheelTimer';
import { COLORS, SPACING } from '../constants/theme';
import { sendCommandToDevice } from '../hooks/useBluetooth';
import { 
    monitorDeviceStatus, 
    stopDeviceStatusMonitoring, 
    onDeviceDisconnect,
    requestBluetoothPermission, 
    scanForDevices, 
    connectToGivenDevice 
} from '../../BLE_connection/TherapyBle';
const DashboardScreen = ({ navigation, route }) => {
    const [mode, setMode] = useState('Off'); // Hot, Cold, Off
    const [temp, setTemp] = useState(15);
    const [timer, setTimer] = useState(0); // Selected timer (minutes)
    const [remainingSeconds, setRemainingSeconds] = useState(0); // Countdown (seconds)
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [showTimerModal, setShowTimerModal] = useState(false);
    const [presets, setPresets] = useState([]);
    const [isConnected, setIsConnected] = useState(route?.params?.isConnected ?? false);
    const [isLoading, setIsLoading] = useState(false);
    const [showPresetModal, setShowPresetModal] = useState(false);
    const [newPresetName, setNewPresetName] = useState('');

    const fadeAnim = React.useRef(new Animated.Value(1)).current;
    const timerIntervalRef = React.useRef(null);
    const notificationIdRef = React.useRef(null);
    const isUserAdjustingDialRef = React.useRef(false);
    const ignoreDeviceUpdateUntilRef = React.useRef(0);
    const lastTempUpdateSourceRef = React.useRef('init'); // 'user' | 'device' | 'init'
    const lastModeUpdateSourceRef = React.useRef('init'); // 'user' | 'device' | 'init'
    const cooldownDuration = 5000; // 5s cooldown as requested

    const [isScanning, setIsScanning] = useState(false);
    const [scanModalVisible, setScanModalVisible] = useState(false);

    const username = route?.params?.username || 'User';
    const deviceName = route?.params?.deviceName || 'Smart Band';

    // Android Back Button Handling
    useFocusEffect(
        React.useCallback(() => {
            const onBackPress = () => {
                Alert.alert("Exit App", "Are you sure you want to exit?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Exit", onPress: () => BackHandler.exitApp() }
                ]);
                return true;
            };
            let backHandlerSubscription;

            if (Platform.OS === 'android') {
                backHandlerSubscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
            }

            return () => {
                if (Platform.OS === 'android' && backHandlerSubscription?.remove) {
                    backHandlerSubscription.remove();
                } else if (Platform.OS === 'android' && BackHandler.removeEventListener) {
                    BackHandler.removeEventListener('hardwareBackPress', onBackPress);
                }
            };
        }, [])
    );

    // Notification Action Listener for Cancel Button
    useEffect(() => {
        const subscription = Notifications.addNotificationResponseReceivedListener(response => {
            if (response.actionIdentifier === 'cancel_timer') {
                stopTimer();
            }
        });
        return () => subscription.remove();
    }, []);

    // Session Restoration (App Killed/Restarted)
    useEffect(() => {
        const restoreSession = async () => {
            try {
                const targetStr = await AsyncStorage.getItem('therapy_timer_target');
                if (targetStr) {
                    const target = parseInt(targetStr, 10);
                    const now = Date.now();
                    if (target > now) {
                        // Resume local timer representation
                        const remaining = Math.round((target - now) / 1000);
                        setRemainingSeconds(remaining);
                        setIsTimerRunning(true);
                    } else {
                        // Clean up old state
                        await AsyncStorage.removeItem('therapy_timer_target');
                    }
                }
            } catch (err) { }
        };
        restoreSession();
    }, []);

    useEffect(() => {
        if (route?.params?.autoConnect) {
            setScanModalVisible(true);
            handleBluetoothScan();
            navigation.setParams({ autoConnect: undefined });
        }
    }, [route?.params?.autoConnect]);

    useEffect(() => {
        if (!isConnected) return;

        // Start monitoring from ESP32
        monitorDeviceStatus(
            (newMode) => {
                if (Date.now() < ignoreDeviceUpdateUntilRef.current) {
                    return;
                }
                lastModeUpdateSourceRef.current = 'device';
                setMode((prevMode) => {
                    if (prevMode !== newMode) return newMode;
                    return prevMode;
                });
            },
            (newTemp) => {
                if (isUserAdjustingDialRef.current) {
                    return;
                }
                if (Date.now() < ignoreDeviceUpdateUntilRef.current) {
                    return;
                }
                lastTempUpdateSourceRef.current = 'device';
                setTemp((prevTemp) => {
                    if (prevTemp !== newTemp) return newTemp;
                    return prevTemp;
                });
            },
            (newTimerSeconds) => {
                if (Date.now() < ignoreDeviceUpdateUntilRef.current) {
                    return;
                }
                
                if (newTimerSeconds > 0) {
                    // Do not let the hardware's imprecise (rounded to minute) backup timer 
                    // overwrite the app's ultra-precise seconds timer while it's ticking.
                    if (prevIsTimerRunningRef.current) return;

                    setRemainingSeconds(newTimerSeconds);
                    setIsTimerRunning(true);
                    setTimer(Math.ceil(newTimerSeconds / 60));
                    prevIsTimerRunningRef.current = true;
                } else {
                    if (isUserAdjustingDialRef.current) return;
                    if (isTimerRunning) {
                        setIsTimerRunning(false);
                        setRemainingSeconds(0);
                        prevIsTimerRunningRef.current = false;
                        if (timerIntervalRef.current) {
                            clearInterval(timerIntervalRef.current);
                            timerIntervalRef.current = null;
                        }
                    }
                }
            }
        );

        setupNotifications();

        // Listen for disconnect
        onDeviceDisconnect(() => {
            setIsConnected(false);
            Alert.alert("Disconnected", "The TherapyBand has been disconnected.");
        });

        return () => {
            stopDeviceStatusMonitoring();
        };
    }, [isConnected]);

    // Temperature ranges
    const TEMP_RANGES = {
        Hot: { min: 25, max: 55 },
        Cold: { min: 10, max: 24 },
        Off: { min: 0, max: 0 },
    };

    useEffect(() => {
        const { min, max } = TEMP_RANGES[mode] || TEMP_RANGES.Cold;

        setIsLoading(true);
        Animated.timing(fadeAnim, {
            toValue: 0.5,
            duration: 200,
            useNativeDriver: true,
        }).start();

        if (mode === 'Hot' && temp < min) {
            setTimeout(() => {
                setTemp(min);
                setIsLoading(false);
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }).start();
            }, 300);
        } else if (mode === 'Cold' && temp > max) {
            setTimeout(() => {
                setTemp(max);
                setIsLoading(false);
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }).start();
            }, 300);
        } else {
            setTimeout(() => {
                setIsLoading(false);
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }).start();
            }, 200);
        }
    }, [mode]);

    const prevIsTimerRunningRef = React.useRef(false);

    useEffect(() => {
        if (lastModeUpdateSourceRef.current === 'device' || lastTempUpdateSourceRef.current === 'device') {
            lastModeUpdateSourceRef.current = 'init';
            lastTempUpdateSourceRef.current = 'init';
            return;
        }
        if (lastModeUpdateSourceRef.current === 'init' && lastTempUpdateSourceRef.current === 'init') {
            return;
        }

        if (isUserAdjustingDialRef.current) {
            // Do not send continuous commands to device while user is actively dragging the dial
            return;
        }

        // When changing mode or temp, skip sending the timer characteristic if it is already running
        // so we don't reset the device's own timer.
        sendCommandToDevice(mode, temp, -1); 
    }, [mode, temp]);

    useEffect(() => {
        // Only send timer command when state changes (start/stop)
        if (isTimerRunning !== prevIsTimerRunningRef.current) {
            if (isTimerRunning) {
                sendCommandToDevice(mode, temp, remainingSeconds);
            } else {
                sendCommandToDevice(mode, temp, 0);
            }
            prevIsTimerRunningRef.current = isTimerRunning;
        }
    }, [isTimerRunning]);

    useEffect(() => {
        if (!isTimerRunning) {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
            return;
        }

        if (remainingSeconds <= 0) {
            setIsTimerRunning(false);
            return;
        }

        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
        }

        timerIntervalRef.current = setInterval(() => {
            setRemainingSeconds((prev) => {
                if (prev <= 1) {
                    if (timerIntervalRef.current) {
                        clearInterval(timerIntervalRef.current);
                        timerIntervalRef.current = null;
                    }
                    setIsTimerRunning(false);
                    AsyncStorage.removeItem('therapy_timer_target').catch(() => {});
                    // Final "Time Up" notification handled here
                    Notifications.scheduleNotificationAsync({
                        content: {
                            title: 'Time\'s Up!',
                            body: 'Timer Completed. Your therapy session has finished.',
                            sound: false,
                            priority: Notifications.AndroidNotificationPriority.MAX,
                            vibrate: [0, 500, 200, 500, 200, 500],
                            android: {
                                channelId: 'therapy-timer-vibrate',
                                sound: false,
                            }
                        },
                        trigger: null, // show immediately
                    });
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        };
    }, [isTimerRunning, remainingSeconds, isConnected]);

    // Live Notification Update Effect
    useEffect(() => {
        if (isTimerRunning && remainingSeconds > 0) {
            const updateNotification = async () => {
                const h = Math.floor(remainingSeconds / 3600);
                const m = Math.floor((remainingSeconds % 3600) / 60);
                const s = remainingSeconds % 60;
                const timeStr = `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

                await Notifications.scheduleNotificationAsync({
                    identifier: 'therapy-session-active',
                    content: {
                        title: 'Therapy Session Active',
                        body: `Time remaining: ${timeStr}`,
                        sticky: true,
                        autoDismiss: false,
                        categoryId: 'therapy_timer_controls',
                        android: {
                            channelId: 'therapy-timer-active', // Silent channel
                            ongoing: true,
                        }
                    },
                    trigger: null,
                });
            };

            updateNotification();
        } else {
            Notifications.dismissNotificationAsync('therapy-session-active');
        }
    }, [isTimerRunning, remainingSeconds]); // Update every second!

    const handleTimerSet = async (minutes) => {
        if (mode === 'Off') {
            Alert.alert("Mode Off", "Please select Hot or Cold mode to start the timer.");
            return;
        }
        setTimer(minutes);
        const total = Math.max(0, Math.round(minutes * 60));
        setRemainingSeconds(total);
        setIsTimerRunning(total > 0);
        ignoreDeviceUpdateUntilRef.current = Date.now() + cooldownDuration;

        if (total > 0) {
            // Persist the target so we survive app kills
            await AsyncStorage.setItem('therapy_timer_target', (Date.now() + total * 1000).toString());

            const { status } = await Notifications.requestPermissionsAsync();
            if (status === 'granted') {
                // Scheduled notification for the end
                const id = await Notifications.scheduleNotificationAsync({
                    content: {
                        title: 'Time\'s Up!',
                        body: 'Timer Completed. Your therapy session has finished.',
                        sound: false,
                        priority: Notifications.AndroidNotificationPriority.HIGH,
                        vibrate: [0, 500, 200, 500, 200, 500],
                        android: {
                            channelId: 'therapy-timer-vibrate',
                        }
                    },
                    trigger: { seconds: total },
                });
                notificationIdRef.current = id;
            }
        }
    };

    useEffect(() => {
        if (mode === 'Off' && isTimerRunning) {
            stopTimer();
        }
    }, [mode]);

    const stopTimer = () => {
        setIsTimerRunning(false);
        setRemainingSeconds(0);
        ignoreDeviceUpdateUntilRef.current = Date.now() + cooldownDuration;
        AsyncStorage.removeItem('therapy_timer_target').catch(() => {});
        
        if (notificationIdRef.current) {
            Notifications.cancelScheduledNotificationAsync(notificationIdRef.current);
            notificationIdRef.current = null;
        }
        Notifications.dismissNotificationAsync('therapy-session-active');
        
        // Also inform the hardware to stop the timer
        sendCommandToDevice(mode, temp, 0); 
    };

    useEffect(() => {
        const loadPresets = async () => {
            try {
                const storedPresets = await AsyncStorage.getItem('custom_presets');
                if (storedPresets) {
                    setPresets(JSON.parse(storedPresets));
                }
            } catch (error) {
                console.error("Failed to load presets:", error);
            }
        };
        loadPresets();
    }, []);

    const savePresetsToStorage = async (newPresets) => {
        try {
            await AsyncStorage.setItem('custom_presets', JSON.stringify(newPresets));
        } catch (error) {
            console.error("Failed to save presets:", error);
        }
    };

    const handleSavePresetStart = () => {
        if (presets.length >= 3) {
            Alert.alert("Limit Reached", "You can only save up to 3 custom presets.");
            return;
        }
        setNewPresetName(`Mode ${presets.length + 1}`);
        setShowPresetModal(true);
    };

    const handleSavePresetConfirm = () => {
        if (!newPresetName.trim()) {
            Alert.alert("Invalid Name", "Please enter a valid preset name.");
            return;
        }
        const newPreset = {
            id: Date.now().toString(),
            name: newPresetName.trim(),
            mode,
            temp,
            timer,
        };
        const updatedPresets = [...presets, newPreset];
        setPresets(updatedPresets);
        savePresetsToStorage(updatedPresets);
        
        setShowPresetModal(false);
        setNewPresetName('');
    };

    const handleDeletePreset = (id) => {
        Alert.alert(
            "Delete Preset?",
            "Are you sure you want to delete this preset?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                        const updatedPresets = presets.filter(p => p.id !== id);
                        setPresets(updatedPresets);
                        savePresetsToStorage(updatedPresets);
                    }
                }
            ]
        );
    };

    const applyPreset = (preset) => {
        if (!isConnected) {
            Alert.alert("Offline", "Please connect to the TherapyBand to use presets.");
            return;
        }
        ignoreDeviceUpdateUntilRef.current = Date.now() + cooldownDuration;
        lastModeUpdateSourceRef.current = 'user';
        lastTempUpdateSourceRef.current = 'user';
        setMode(preset.mode);
        setTemp(preset.temp);
        if (preset.timer > 0 && preset.mode !== 'Off') {
            setTimer(preset.timer);
            const total = Math.max(0, Math.round(preset.timer * 60));
            setRemainingSeconds(total);
            setIsTimerRunning(total > 0);
        } else {
            setTimer(preset.timer);
            setRemainingSeconds(0);
            setIsTimerRunning(false);
        }
    };

    const ModeButton = ({ title, icon: Icon, active, color }) => {
        const scaleAnim = React.useRef(new Animated.Value(1)).current;

        const handlePress = () => {
            Animated.sequence([
                Animated.spring(scaleAnim, {
                    toValue: 0.95,
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                }),
            ]).start();
            ignoreDeviceUpdateUntilRef.current = Date.now() + cooldownDuration;
            lastModeUpdateSourceRef.current = 'user';
            setMode(title);
            
            // INSTANT MODE SWITCH: Activation fix for Cold/Hot buttons
            if (title === 'Off') {
                sendCommandToDevice('Off', 0, 0);
            } else {
                const { min } = TEMP_RANGES[title];
                const startTemp = (title === 'Hot') ? Math.max(temp, min) : Math.min(temp, 24);
                sendCommandToDevice(title, startTemp, -1);
                setTemp(startTemp);
            }
        };

        return (
            <Animated.View style={[styles.modeButtonWrapper, { transform: [{ scale: scaleAnim }] }]}>
                <Pressable
                    style={[
                        styles.modeButton,
                        { backgroundColor: active ? color : 'rgba(255,255,255,0.08)' }
                    ]}
                    android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                    onPress={handlePress}
                >
                    <Icon color={active ? '#fff' : 'rgba(255,255,255,0.6)'} size={20} />
                    <Text style={[styles.modeButtonText, { color: active ? '#fff' : 'rgba(255,255,255,0.6)' }]}>
                        {title}
                    </Text>
                </Pressable>
            </Animated.View>
        );
    };

    const TimerDisplay = ({ selectedMinutes, remainingSeconds, isRunning, onPress, onStop }) => {
        const mm = isRunning ? Math.floor(remainingSeconds / 60) : selectedMinutes;
        const ss = isRunning ? remainingSeconds % 60 : 0;
        const displayMinutes = mm < 10 ? `0${mm}` : String(mm);
        const displaySeconds = ss < 10 ? `0${ss}` : String(ss);

        return (
            <View style={styles.timerWrapper}>
                <TouchableOpacity
                    style={[styles.timerContainer, isRunning && styles.timerContainerActive]}
                    onPress={onPress}
                    activeOpacity={0.7}
                >
                    <Clock color={isRunning ? COLORS.primary : 'rgba(255,255,255,0.5)'} size={22} />
                    <Text style={[styles.timerText, isRunning && styles.timerTextActive]}>
                        {displayMinutes}:{displaySeconds}
                    </Text>
                    {!isRunning && <Text style={styles.timerLabel}>min</Text>}
                </TouchableOpacity>
                {isRunning && (
                    <TouchableOpacity
                        style={styles.stopButton}
                        onPress={onStop}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.stopButtonText}>Stop Timer</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const PresetTimerButton = ({ minutes, onPress, isActive }) => (
        <TouchableOpacity
            style={[styles.presetTimerButton, isActive && styles.presetTimerButtonActive]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <Text style={[styles.presetTimerText, isActive && styles.presetTimerTextActive]}>
                {minutes}m
            </Text>
        </TouchableOpacity>
    );

    const currentRange = TEMP_RANGES[mode] || TEMP_RANGES.Cold;

    const handleBluetoothScan = async () => {
        setIsScanning(true);
        try {
            await requestBluetoothPermission();
            scanForDevices((devices) => {
                if (devices && devices.length > 0) {
                    const therapyBand = devices.find(d => 
                        (d.name === "TherapyBand" || d.localName === "TherapyBand")
                    );
                    if (therapyBand) {
                        connectToGivenDevice(therapyBand, (success) => {
                            if (success) {
                                setIsConnected(true);
                                setScanModalVisible(false);
                            } else {
                                setScanModalVisible(false);
                                Alert.alert("Connection Failed", "Could not connect to TherapyBand.");
                            }
                        });
                    } else {
                        // Keep scanning or timeout handled by scanForDevices
                    }
                }
            });

            // If not found after 8 seconds (matching TherapyBle timeout)
            setTimeout(() => {
                setIsScanning(false);
                if (!isConnected && scanModalVisible) {
                    setScanModalVisible(false);
                    Alert.alert("Device Not Found", "Please make sure the band is powered on and nearby.");
                }
            }, 8500);

        } catch (err) {
            console.error("Scan error:", err);
            setScanModalVisible(false);
        }
    };

    const handleDialInteractionStart = () => {
        isUserAdjustingDialRef.current = true;
        ignoreDeviceUpdateUntilRef.current = Date.now() + cooldownDuration;
    };

    const handleDialInteractionEnd = () => {
        isUserAdjustingDialRef.current = false;
        ignoreDeviceUpdateUntilRef.current = Date.now() + cooldownDuration;
        lastTempUpdateSourceRef.current = 'user';
        const activeTimer = isTimerRunning ? Math.ceil(remainingSeconds / 60) : 0;
        sendCommandToDevice(mode, temp, activeTimer);
    };

    const lastSentTimeRef = React.useRef(0);

    const handleTempChangeFromDial = (newTemp) => {
        if (!isConnected) return;
        lastTempUpdateSourceRef.current = 'user';
        setTemp(newTemp);
        
        // INSTANT FEEDBACK: send update every 150ms while dragging
        const now = Date.now();
        if (now - lastSentTimeRef.current > 150) {
            sendCommandToDevice(mode, newTemp, -1);
            lastSentTimeRef.current = now;
        }
    };

    return (
        <GradientBackground mode={mode}>
            <SafeAreaView style={styles.container}>
                {/* Header block mirroring HTML */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <TouchableOpacity 
                            style={styles.backButton}
                            onPress={() => {
                                Alert.alert("Exit App", "Are you sure you want to exit?", [
                                    { text: "Cancel", style: "cancel" },
                                    { text: "Exit", onPress: () => BackHandler.exitApp() }
                                ]);
                            }}
                        >
                            <ChevronLeft color="white" size={20} />
                        </TouchableOpacity>
                        <Text style={styles.greetingHeader}>Hello, {username}</Text>
                        <Text style={[styles.subtitleHeader, mode === 'Hot' ? { color: COLORS.hot } : mode === 'Cold' ? { color: COLORS.cold } : { color: 'rgba(255,255,255,0.4)' }]}>
                            {mode === 'Hot' ? 'THERAPY READY' : mode === 'Cold' ? 'SYSTEM COOLING' : 'IDLE'}
                        </Text>
                    </View>
                    <View style={styles.headerRight}>
                        <TouchableOpacity
                            style={[
                                styles.connectionBadge,
                                { borderColor: isConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)' }
                            ]}
                            activeOpacity={0.8}
                            onPress={() => {
                                if (!isConnected) {
                                    setScanModalVisible(true);
                                    handleBluetoothScan();
                                }
                            }}
                        >
                            <View style={[
                                styles.connectionDot,
                                { backgroundColor: isConnected ? COLORS.success : COLORS.danger }
                            ]} />
                            <Text style={[
                                styles.connectionText,
                                { color: isConnected ? COLORS.success : COLORS.danger }
                            ]}>
                                {isConnected ? 'CONNECTED' : 'OFFLINE'}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.offBadge, !isConnected && { opacity: 0.5 }]} 
                            onPress={() => {
                                if (!isConnected) return;
                                setMode('Off');
                            }}
                            activeOpacity={isConnected ? 0.7 : 1}
                        >
                            <Text style={styles.offBadgeText}>OFF</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.settingsButton} onPress={() => navigation.navigate('Profile', { username, deviceName })}>
                            <Settings color="rgba(255,255,255,0.6)" size={24} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Mode toggle */}
                <View style={styles.modeContainer}>
                    <View style={styles.modePill}>
                        <TouchableOpacity 
                            style={[
                                styles.modeTab, 
                                mode === 'Hot' && styles.hotTabActive,
                                !isConnected && { opacity: 0.5 }
                            ]} 
                            onPress={() => {
                                if (!isConnected) {
                                    Alert.alert("Offline", "Please connect to the TherapyBand via Bluetooth first.");
                                    return;
                                }
                                setMode('Hot');
                            }}
                            activeOpacity={isConnected ? 0.7 : 1}
                        >
                            <Text style={[styles.modeTabText, mode === 'Hot' && {color: 'white'}]}>HOT</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[
                                styles.modeTab, 
                                mode === 'Cold' && styles.coldTabActive,
                                !isConnected && { opacity: 0.5 }
                            ]} 
                            onPress={() => {
                                if (!isConnected) {
                                    Alert.alert("Offline", "Please connect to the TherapyBand via Bluetooth first.");
                                    return;
                                }
                                setMode('Cold');
                            }}
                            activeOpacity={isConnected ? 0.7 : 1}
                        >
                            <Text style={[styles.modeTabText, mode === 'Cold' && {color: 'white'}]}>COLD</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Dial Section */}
                <Animated.View style={[styles.dialWrapper, { opacity: fadeAnim }]}>
                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="rgba(255,255,255,0.5)" />
                        </View>
                    ) : (
                        <TemperatureDial
                            value={temp}
                            min={currentRange.min}
                            max={currentRange.max}
                            onChange={handleTempChangeFromDial}
                            mode={mode}
                            isTimerRunning={isTimerRunning}
                            timerValue={`${Math.floor(remainingSeconds / 60) < 10 ? '0' : ''}${Math.floor(remainingSeconds / 60)}:${remainingSeconds % 60 < 10 ? '0' : ''}${remainingSeconds % 60}`}
                            onTimerPress={() => {
                                if (!isConnected) {
                                    Alert.alert("Offline", "Please connect to the TherapyBand to use the timer.");
                                    return;
                                }
                                if (isTimerRunning) {
                                    stopTimer();
                                } else {
                                    setShowTimerModal(true);
                                }
                            }}
                            onInteractionStart={() => {
                                if (!isConnected) {
                                    Alert.alert("Offline", "Please connect to the TherapyBand to change temperature.");
                                }
                                handleDialInteractionStart();
                            }}
                            onInteractionEnd={handleDialInteractionEnd}
                        />
                    )}
                </Animated.View>

                {/* Presets shown below dial (tap to apply, long-press to delete) */}
                {presets.length > 0 && (
                    <View style={styles.presetsRow}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsRowContent}>
                            {presets.map((preset) => (
                                <TouchableOpacity
                                    key={preset.id}
                                    style={[
                                        styles.presetChip,
                                        { borderColor: preset.mode === 'Hot' ? 'rgba(249, 115, 22, 0.35)' : preset.mode === 'Cold' ? 'rgba(59, 130, 246, 0.35)' : 'rgba(255,255,255,0.18)' },
                                        !isConnected && { opacity: 0.5 }
                                    ]}
                                    activeOpacity={isConnected ? 0.85 : 1}
                                    onPress={() => applyPreset(preset)}
                                    onLongPress={() => handleDeletePreset(preset.id)}
                                    delayLongPress={500}
                                >
                                    <View style={[
                                        styles.presetChipDot,
                                        { backgroundColor: preset.mode === 'Hot' ? COLORS.hot : preset.mode === 'Cold' ? COLORS.cold : COLORS.off }
                                    ]} />
                                    <Text style={styles.presetChipText} numberOfLines={1}>
                                        {preset.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                <View style={{ flex: 1 }} />

                {/* Bottom Custom Preset Button */}
                <View style={styles.bottomSection}>
                    <TouchableOpacity 
                        style={[
                            styles.customPresetBtn, 
                            mode === 'Hot' ? styles.presetHot : mode === 'Cold' ? styles.presetCold : styles.presetOff
                        ]}
                        onPress={handleSavePresetStart}
                        activeOpacity={0.9}
                    >
                        <Text style={styles.customPresetText}>CUSTOM PRESET</Text>
                    </TouchableOpacity>
                </View>

                {/* HTML explicitly had this home indicator graphic at the very bottom */}
                <View style={styles.homeIndicatorWrapper}>
                    <View style={styles.homeIndicator} />
                </View>
            </SafeAreaView>

            {/* Top Overlay Timer Modal */}
            <WheelTimer
                visible={showTimerModal}
                value={timer}
                onClose={() => setShowTimerModal(false)}
                onSave={(val) => {
                    ignoreDeviceUpdateUntilRef.current = Date.now() + cooldownDuration;
                    lastModeUpdateSourceRef.current = 'user'; // Treat as user action
                    handleTimerSet(val);
                    setShowTimerModal(false);
                }}
            />

            {/* Scanning Modal */}
            <Modal
                visible={scanModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setScanModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { alignItems: 'center', paddingVertical: 40 }]}>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                        <Text style={[styles.modalTitle, { marginTop: 20 }]}>Scanning...</Text>
                        <Text style={styles.modalSubtitle}>Searching for TherapyBand</Text>
                        <TouchableOpacity 
                            style={[styles.saveBtn, { marginTop: 20, backgroundColor: 'rgba(255,255,255,0.1)' }]}
                            onPress={() => setScanModalVisible(false)}
                        >
                            <Text style={styles.saveBtnText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Modified Preset Modal - Lists Presets & Allows Saving */}
            <Modal
                visible={showPresetModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowPresetModal(false)}
            >
                <KeyboardAvoidingView 
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={{ flex: 1 }}
                >
                    <Pressable style={styles.modalOverlay} onPress={() => setShowPresetModal(false)}>
                        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Save Preset</Text>
                                <TouchableOpacity 
                                    hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                                    onPress={() => setShowPresetModal(false)}
                                >
                                    <X color="rgba(255,255,255,0.6)" size={24} />
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.modalSubtitle}>Save current settings</Text>
                            <TextInput
                                style={styles.input}
                                value={newPresetName}
                                onChangeText={setNewPresetName}
                                placeholder={`e.g., "Mode ${presets.length + 1}"`}
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                maxLength={16}
                                autoFocus
                            />
                            <TouchableOpacity
                                style={[styles.saveBtn, !newPresetName.trim() && { opacity: 0.5 }]}
                                onPress={handleSavePresetConfirm}
                                disabled={!newPresetName.trim()}
                            >
                                <Text style={styles.saveBtnText}>Save preset</Text>
                            </TouchableOpacity>
                        </Pressable>
                    </Pressable>
                </KeyboardAvoidingView>
            </Modal>
        </GradientBackground>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: SPACING.lg,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    headerLeft: {
        flexDirection: 'column',
        justifyContent: 'center',
    },
    backButton: {
        padding: 6,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    greetingHeader: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFFFFF',
        letterSpacing: -0.5,
    },
    subtitleHeader: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 2,
        marginTop: 2,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    offBadge: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.2)',
    },
    offBadgeText: { 
        fontSize: 10, 
        fontWeight: 'bold', 
        color: '#f87171',
        textTransform: 'uppercase', 
        letterSpacing: 2 
    },
    connectionBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
    },
    connectionDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 6,
    },
    connectionText: {
        fontSize: 9,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
    },
    settingsButton: { 
        padding: 8 
    },
    modeContainer: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 10,
        marginBottom: 10,
    },
    modePill: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 4,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        width: 180,
    },
    modeTab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 30,
    },
    hotTabActive: {
        backgroundColor: COLORS.hot,
        shadowColor: COLORS.hot,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4,
    },
    coldTabActive: {
        backgroundColor: COLORS.cold,
        shadowColor: COLORS.cold,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4,
    },
    modeTabText: {
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        color: 'rgba(255,255,255,0.4)',
    },
    modeTabTextActive: {
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        color: 'white',
    },
    dialWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 350,
        marginTop: 40,
    },
    presetsRow: {
        width: '100%',
        marginTop: 6,
        marginBottom: 10,
    },
    presetsRowContent: {
        paddingHorizontal: 2,
        gap: 10,
    },
    presetChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        maxWidth: 160,
    },
    presetChipDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    presetChipText: {
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '700',
        fontSize: 12,
        letterSpacing: 0.5,
    },
    loadingContainer: { 
        alignItems: 'center', 
        justifyContent: 'center', 
        paddingVertical: 60 
    },
    bottomSection: {
        width: '100%',
        paddingBottom: 20,
    },
    customPresetBtn: {
        width: '100%',
        paddingVertical: 20,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    presetHot: {
        backgroundColor: COLORS.hot,
        shadowColor: COLORS.hot,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    presetCold: {
        backgroundColor: COLORS.cold,
        shadowColor: COLORS.cold,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    presetOff: {
        backgroundColor: COLORS.off,
        shadowColor: COLORS.off,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    customPresetText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 3,
    },
    homeIndicatorWrapper: {
        width: '100%',
        paddingBottom: 8,
        alignItems: 'center',
        justifyContent: 'center'
    },
    homeIndicator: {
        height: 6,
        width: 130,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 3,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        width: '100%',
        backgroundColor: '#111827',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    modalSubtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 12,
        marginTop: 10,
    },
    noPresetsText: {
        color: 'rgba(255,255,255,0.4)',
        fontStyle: 'italic',
        paddingVertical: 10,
    },
    presetListItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 12,
        borderRadius: 12,
        marginBottom: 8,
    },
    presetListIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    presetListLabel: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 14,
    },
    presetListDetail: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        marginTop: 2,
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        color: '#fff',
        fontSize: 16,
        marginBottom: 20,
    },
    saveBtn: {
        backgroundColor: COLORS.hot,
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
    },
    saveBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
        letterSpacing: 1,
    }
});

export default DashboardScreen;