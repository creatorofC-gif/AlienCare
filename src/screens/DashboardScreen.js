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
    KeyboardAvoidingView,
    AppState
} from 'react-native';
import { Thermometer, Wind, Power, Clock, Plus, Settings, Home, User as UserIcon, X, ChevronLeft } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { NativeEventEmitter, NativeModules } from 'react-native';

const { TherapyTimer } = NativeModules;

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

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
    const SESSION_STATE_KEY = 'therapy_session_state';
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
    const targetTimeRef = React.useRef(null);
    const lastRemainingSecondsRef = React.useRef(-1);
    const autoConnectAttemptedRef = React.useRef(false);
    const isConnectedRef = React.useRef(isConnected);
    const scanModalVisibleRef = React.useRef(scanModalVisible);
    const isUserAdjustingDialRef = React.useRef(false);
    const ignoreDeviceUpdateUntilRef = React.useRef(0);
    const lastTempUpdateSourceRef = React.useRef('init'); // 'user' | 'device' | 'init'
    const lastModeUpdateSourceRef = React.useRef('init'); // 'user' | 'device' | 'init'
    const lastHotTempRef = React.useRef(40);
    const lastColdTempRef = React.useRef(15);
    const cooldownDuration = 5000; // 5s cooldown as requested

    const [isScanning, setIsScanning] = useState(false);
    const [scanModalVisible, setScanModalVisible] = useState(false);

    const username = route?.params?.username || 'User';
    const deviceName = route?.params?.deviceName || 'Smart Band';
    const safeResume = route?.params?.safeResume === true;

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

    useEffect(() => {
        Notifications.requestPermissionsAsync().catch(() => {});
    }, []);

    useEffect(() => {
        if (!TherapyTimer) {
            return undefined;
        }

        const eventEmitter = new NativeEventEmitter(TherapyTimer);
        const subscription = eventEmitter.addListener('TherapyTimerEvent', event => {
            if (event?.event === 'timerCompleted') {
                setIsTimerRunning(false);
                setRemainingSeconds(0);
                setTimer(0);
                targetTimeRef.current = null;
                lastRemainingSecondsRef.current = 0;
                prevIsTimerRunningRef.current = false;
                AsyncStorage.removeItem('therapy_timer_target').catch(() => {});
                AsyncStorage.removeItem(SESSION_STATE_KEY).catch(() => {});
                setMode('Off');

                Alert.alert(
                    "Time's Up!",
                    "Your therapy session has finished.",
                    [
                        {
                            text: 'Stop Alarm',
                            onPress: () => {
                                TherapyTimer.stopAlarm?.().catch(() => {});
                            }
                        }
                    ],
                    { cancelable: false }
                );
            }
        });

        return () => subscription.remove();
    }, []);

    // Session Restoration (App Killed/Restarted)
    useEffect(() => {
        const restoreSession = async () => {
            try {
                // Prefer native module as the authoritative source of truth
                if (TherapyTimer) {
                    const active = await TherapyTimer.isTimerActive();
                    if (active) {
                        const rem = await TherapyTimer.getRemainingSeconds();
                        const sessionStateStr = await AsyncStorage.getItem(SESSION_STATE_KEY);
                        if (sessionStateStr) {
                            try {
                                const sessionState = JSON.parse(sessionStateStr);
                                if (sessionState?.mode && sessionState.mode !== 'Off') {
                                    setMode(sessionState.mode);
                                }
                                if (typeof sessionState?.temp === 'number') {
                                    setTemp(sessionState.temp);
                                }
                                if (typeof sessionState?.timer === 'number') {
                                    setTimer(sessionState.timer);
                                }
                            } catch (_) {}
                        }
                        const targetMs = Date.now() + rem * 1000;
                        targetTimeRef.current = targetMs;
                        lastRemainingSecondsRef.current = rem;
                        setRemainingSeconds(rem);
                        setIsTimerRunning(true);
                        prevIsTimerRunningRef.current = true;
                        return;
                    }
                }
            } catch (err) { }
        };
        restoreSession();
    }, []);

    // Handle App returning from background — sync JS UI with native service state
    useEffect(() => {
        const subscription = AppState.addEventListener('change', async nextAppState => {
            if (nextAppState === 'active') {
                // Re-sync from native service (non-blocking, only on app resume)
                if (TherapyTimer) {
                    TherapyTimer.isTimerActive()
                        .then(active => {
                            if (active) {
                                return TherapyTimer.getRemainingSeconds().then(rem => {
                                    AsyncStorage.getItem(SESSION_STATE_KEY)
                                        .then(sessionStateStr => {
                                            if (!sessionStateStr) return;
                                            try {
                                                const sessionState = JSON.parse(sessionStateStr);
                                                if (sessionState?.mode && sessionState.mode !== 'Off') {
                                                    setMode(sessionState.mode);
                                                }
                                                if (typeof sessionState?.temp === 'number') {
                                                    setTemp(sessionState.temp);
                                                }
                                                if (typeof sessionState?.timer === 'number') {
                                                    setTimer(sessionState.timer);
                                                }
                                            } catch (_) {}
                                        })
                                        .catch(() => {});
                                    // Re-anchor the local ref so JS countdown stays accurate
                                    targetTimeRef.current = Date.now() + rem * 1000;
                                    setRemainingSeconds(rem);
                                    setIsTimerRunning(true);
                                    prevIsTimerRunningRef.current = true;
                                });
                            } else if (isTimerRunning) {
                                // Timer finished while in background
                                setIsTimerRunning(false);
                                setRemainingSeconds(0);
                                targetTimeRef.current = null;
                                prevIsTimerRunningRef.current = false;
                                AsyncStorage.removeItem('therapy_timer_target').catch(() => {});
                                AsyncStorage.removeItem(SESSION_STATE_KEY).catch(() => {});
                                setMode('Off');
                            }
                        })
                        .catch(() => {});
                }
            }
        });

        return () => { subscription.remove(); };
    }, [isTimerRunning, temp]);

    useEffect(() => {
        isConnectedRef.current = isConnected;
    }, [isConnected]);

    useEffect(() => {
        scanModalVisibleRef.current = scanModalVisible;
    }, [scanModalVisible]);

    useEffect(() => {
        if (route?.params?.autoConnect && !safeResume) {
            setScanModalVisible(true);
            const autoScanTimer = setTimeout(() => {
                handleBluetoothScan();
            }, 700);
            navigation.setParams({ autoConnect: undefined });
            return () => clearTimeout(autoScanTimer);
        }
    }, [navigation, route?.params?.autoConnect, safeResume]);

    useEffect(() => {
        if (!isConnected) return;

        let lastHeartbeat = Date.now();
        const heartbeatInterval = setInterval(() => {
            if (Date.now() - lastHeartbeat > 4000) {
                console.log("[Dashboard] Heatbeat timeout! Disconnecting visibly.");
                setIsConnected(false);
                clearInterval(heartbeatInterval);
                // Dynamically import to safely kill connection from within interval
                import('../../BLE_connection/TherapyBle').then(m => m.disconnectDevice());
            }
        }, 1500);

        // Start monitoring from ESP32
        monitorDeviceStatus(
            (newMode) => {
                lastHeartbeat = Date.now();
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
                lastHeartbeat = Date.now();
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
                
                // Extremely reliable background timer trick: 
                // Any time the ESP32 sends a temperature update (often), we use that hardware-triggered 
                // wake-up to also recalculate and pump our JS timer, preventing it from pausing when backgrounded.
                if (prevIsTimerRunningRef.current && targetTimeRef.current) {
                    const now = Date.now();
                    const rem = Math.round((targetTimeRef.current - now) / 1000);
                    if (rem >= 0 && rem !== lastRemainingSecondsRef.current) {
                        lastRemainingSecondsRef.current = rem;
                        setRemainingSeconds(rem);
                    }
                }
            },
            (newTimerSeconds) => {
                lastHeartbeat = Date.now();
                if (Date.now() < ignoreDeviceUpdateUntilRef.current) {
                    return;
                }
                
                if (newTimerSeconds > 0) {
                    // Do not let the hardware's imprecise (rounded to minute) backup timer 
                    // overwrite the app's ultra-precise seconds timer while it's ticking.
                    if (prevIsTimerRunningRef.current) {
                        if (targetTimeRef.current) {
                            const now = Date.now();
                            const rem = Math.round((targetTimeRef.current - now) / 1000);
                            if (rem > 0) {
                                setRemainingSeconds(rem);
                            }
                        }
                        return;
                    }

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
        // Listen for disconnect
        onDeviceDisconnect(() => {
            setIsConnected(false);
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            Alert.alert("Disconnected", "The TherapyBand has been disconnected.");
        });

        return () => {
            if (heartbeatInterval) clearInterval(heartbeatInterval);
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
        if (mode === 'Hot') lastHotTempRef.current = temp;
        if (mode === 'Cold') lastColdTempRef.current = temp;

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

    // NOTE: We do NOT send BLE commands here on isTimerRunning change.
    // handleTimerSet and stopTimer each send their own correct command directly.
    // Sending here causes a race: remainingSeconds is still 0 (stale) when isTimerRunning
    // flips to true, which tells the ESP32 to stop — turning off its display.

    useEffect(() => {
        if (!isTimerRunning) {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
            return;
        }

        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
        }

        // Pure JS local countdown using targetTimeRef — NO async native calls here.
        // This avoids blocking the JS thread (and BLE callbacks) with Promises every tick.
        timerIntervalRef.current = setInterval(() => {
            if (!targetTimeRef.current) return;
            const now = Date.now();
            const remaining = Math.round((targetTimeRef.current - now) / 1000);

            if (remaining <= 0) {
                if (lastRemainingSecondsRef.current !== 0) {
                    lastRemainingSecondsRef.current = 0;
                    setRemainingSeconds(0);
                }
            } else if (remaining !== lastRemainingSecondsRef.current) {
                lastRemainingSecondsRef.current = remaining;
                setRemainingSeconds(remaining);
            }
        }, 500); // 500ms tick so we don't miss the exact second boundary

        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        };
    }, [isTimerRunning]); // NOTE: removed remainingSeconds from deps — prevents interval churn

    const handleTimerSet = async (minutes) => {
        if (mode === 'Off') {
            Alert.alert("Mode Off", "Please select Hot or Cold mode to start the timer.");
            return;
        }
        setTimer(minutes);
        const totalSeconds = Math.max(0, Math.round(minutes * 60));

        // Start native foreground service — pass SECONDS (not minutes)
        // Native service uses: endTime = SystemClock.elapsedRealtime() + durationInMillis
        if (totalSeconds > 0 && TherapyTimer) {
            TherapyTimer.startTimer(totalSeconds).catch(e => console.warn('[Timer] startTimer error:', e));
        }

        // Anchor JS local countdown
        const targetMs = Date.now() + totalSeconds * 1000;
        targetTimeRef.current = targetMs;
        lastRemainingSecondsRef.current = totalSeconds;
        setRemainingSeconds(totalSeconds);
        setIsTimerRunning(totalSeconds > 0);
        prevIsTimerRunningRef.current = (totalSeconds > 0);
        ignoreDeviceUpdateUntilRef.current = Date.now() + cooldownDuration;

        // Persist so session survives app kill
        if (totalSeconds > 0) {
            AsyncStorage.setItem('therapy_timer_target', targetMs.toString()).catch(() => {});
            AsyncStorage.setItem(SESSION_STATE_KEY, JSON.stringify({ mode, temp, timer: minutes })).catch(() => {});
        }

        // Inform hardware — MUST send SECONDS (ESP32 expects seconds, e.g. 120 not 2).
        // Sending minutes meant "2 seconds" to hardware, causing instant shutdown.
        sendCommandToDevice(mode, temp, totalSeconds);
    };

    useEffect(() => {
        if (mode === 'Off' && isTimerRunning) {
            // ESP32 usually turns off slightly before the native alarm rings.
            // If the timer is almost done, do NOT cancel the native timer so the alarm sounds!
            if (lastRemainingSecondsRef.current > 3 && lastRemainingSecondsRef.current !== -1) {
                stopTimer();
            } else {
                setIsTimerRunning(false);
                setRemainingSeconds(0);
                prevIsTimerRunningRef.current = false;
            }
        }
    }, [mode]);

    const stopTimer = () => {
        setIsTimerRunning(false);
        prevIsTimerRunningRef.current = false;
        setRemainingSeconds(0);
        targetTimeRef.current = null;
        ignoreDeviceUpdateUntilRef.current = Date.now() + cooldownDuration;
        AsyncStorage.removeItem('therapy_timer_target').catch(() => {});
        AsyncStorage.removeItem(SESSION_STATE_KEY).catch(() => {});
        
        if (TherapyTimer) {
            TherapyTimer.stopTimer();
        }
        
        // Also inform the hardware to stop the timer
        sendCommandToDevice(mode, temp, 0); 
    };

    useEffect(() => {
        if (!isTimerRunning || mode === 'Off') return;
        AsyncStorage.setItem(SESSION_STATE_KEY, JSON.stringify({ mode, temp, timer })).catch(() => {});
    }, [isTimerRunning, mode, temp, timer]);

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
            const totalSeconds = Math.max(0, Math.round(preset.timer * 60));
            
            // Start native service with SECONDS (not minutes)
            if (totalSeconds > 0 && TherapyTimer) {
                TherapyTimer.startTimer(totalSeconds).catch(e => console.warn('[Timer] startTimer error:', e));
            }
            
            const targetMs = Date.now() + totalSeconds * 1000;
            targetTimeRef.current = targetMs;
            lastRemainingSecondsRef.current = totalSeconds;
            AsyncStorage.setItem('therapy_timer_target', targetMs.toString()).catch(() => {});
            AsyncStorage.setItem(SESSION_STATE_KEY, JSON.stringify({ mode: preset.mode, temp: preset.temp, timer: preset.timer })).catch(() => {});
            setRemainingSeconds(totalSeconds);
            setIsTimerRunning(totalSeconds > 0);
            prevIsTimerRunningRef.current = (totalSeconds > 0);
            
            // Inform hardware of preset timer (in SECONDS)
            sendCommandToDevice(preset.mode, preset.temp, totalSeconds);
        } else {
            setTimer(preset.timer);
            setRemainingSeconds(0);
            setIsTimerRunning(false);
            AsyncStorage.removeItem(SESSION_STATE_KEY).catch(() => {});
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
                const targetTemp = (title === 'Hot') ? lastHotTempRef.current : (title === 'Cold' ? lastColdTempRef.current : temp);
                sendCommandToDevice(title, targetTemp, -1);
                setTemp(targetTemp);
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

    const handleBluetoothScan = async (retryCount = 0) => {
        autoConnectAttemptedRef.current = false;
        setIsScanning(true);
        try {
            await requestBluetoothPermission();
            scanForDevices((devices) => {
                if (devices && devices.length > 0) {
                    const therapyBand = devices.find(d => 
                        (d.name === "TherapyBand" || d.localName === "TherapyBand")
                    );
                    if (therapyBand) {
                        if (autoConnectAttemptedRef.current) return;
                        autoConnectAttemptedRef.current = true;
                        connectToGivenDevice(therapyBand, (success) => {
                            if (success) {
                                setIsConnected(true);
                                setIsScanning(false);
                                setScanModalVisible(false);
                            } else {
                                autoConnectAttemptedRef.current = false;
                                setIsScanning(false);
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
                if (!isConnectedRef.current && scanModalVisibleRef.current) {
                    if (retryCount === 0) {
                        handleBluetoothScan(1);
                        return;
                    }
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
        // Reset immediately so ESP32 temp updates flow through right after user lifts finger.
        // (Cooldown was already started in handleDialInteractionStart — extending it here
        //  was blocking all ESP32 temperature notifications for 5s after every touch.)
        ignoreDeviceUpdateUntilRef.current = 0;
        lastTempUpdateSourceRef.current = 'user';
        // Send -1 to preserve the hardware timer's current active countdown seamlessly
        sendCommandToDevice(mode, temp, -1);
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
                        <Text style={styles.modalSubtitle}>Press any button on your band to wake it up!</Text>
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
        gap: 10,
    },
    offBadge: {
        paddingHorizontal: 18,
        paddingVertical: 10,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.2)',
    },
    offBadgeText: { 
        fontSize: 13, 
        fontWeight: 'bold', 
        color: '#f87171',
        textTransform: 'uppercase', 
        letterSpacing: 2 
    },
    connectionBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
    },
    connectionDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    connectionText: {
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
    },
    settingsButton: { 
        paddingHorizontal: 4,
        paddingVertical: 8,
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
        padding: 8,
        borderRadius: 34,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        width: 250,
    },
    modeTab: {
        flex: 1,
        paddingVertical: 14,
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
        fontSize: 15,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.4)',
    },
    modeTabTextActive: {
        fontSize: 15,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 2,
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
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        maxWidth: 180,
    },
    presetChipDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 10,
    },
    presetChipText: {
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '700',
        fontSize: 14,
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
        alignItems: 'center',
    },
    customPresetBtn: {
        width: 250,
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
