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
} from 'react-native';
import { Thermometer, Wind, Power, Clock, Plus, Settings, Home, User as UserIcon } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ref, set, push, onValue, limitToLast, query } from 'firebase/database';
import { auth, database, isDemo } from '../firebase/firebaseConfig';
import GradientBackground from '../components/GradientBackground';
import TemperatureDial from '../components/TemperatureDial';
import WheelTimer from '../components/WheelTimer';
import { COLORS, SPACING } from '../constants/theme';
import { sendCommandToDevice } from '../hooks/useBluetooth';

const DashboardScreen = ({ navigation, route }) => {
    const [mode, setMode] = useState('Cold'); // Hot, Cold, Off
    const [temp, setTemp] = useState(15);
    const [timer, setTimer] = useState(10); // Selected timer (minutes)
    const [remainingSeconds, setRemainingSeconds] = useState(0); // Countdown (seconds)
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [showTimerModal, setShowTimerModal] = useState(false);
    const [presets, setPresets] = useState([]);
    const [isConnected, setIsConnected] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const fadeAnim = React.useRef(new Animated.Value(1)).current;
    const timerIntervalRef = React.useRef(null);

    const user = auth.currentUser;
    const username = route?.params?.username || user?.displayName || 'User';
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

    // Temperature ranges
    const TEMP_RANGES = {
        Hot: { min: 25, max: 45 },
        Cold: { min: 10, max: 24 },
        Off: { min: 0, max: 0 },
    };

    useEffect(() => {
        // Enforce range when mode changes - properly initialize temp for Hot mode
        const { min, max } = TEMP_RANGES[mode] || TEMP_RANGES.Cold;
        
        setIsLoading(true);
        Animated.timing(fadeAnim, {
            toValue: 0.5,
            duration: 200,
            useNativeDriver: true,
        }).start();

        // If switching to Hot and current temp is below min, set to min
        // If switching to Cold and current temp is above max, set to max
        // If switching to Off, keep current temp (it will show as OFF)
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
            // Temp is already in range
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

    useEffect(() => {
        // Sync with device whenever settings change
        sendCommandToDevice(mode, temp, timer);
    }, [mode, temp, timer]);

    // Timer countdown functionality (stable: single remainingSeconds state)
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

        // ensure only one interval
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
        }

        timerIntervalRef.current = setInterval(() => {
            setRemainingSeconds((prev) => {
                if (prev <= 1) {
                    // finish
                    if (timerIntervalRef.current) {
                        clearInterval(timerIntervalRef.current);
                        timerIntervalRef.current = null;
                    }
                    setIsTimerRunning(false);
                    Alert.alert("Timer Complete", "Your timer has finished!");
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
    }, [isTimerRunning, remainingSeconds]);

    // Start timer when timer value changes (if mode is not Off)
    const handleTimerSet = (minutes) => {
        if (mode === 'Off') {
            Alert.alert("Mode Off", "Please select Hot or Cold mode to start the timer.");
            return;
        }
        setTimer(minutes);
        const total = Math.max(0, Math.round(minutes * 60));
        setRemainingSeconds(total);
        setIsTimerRunning(total > 0);
    };

    // Stop timer when mode changes to Off
    useEffect(() => {
        if (mode === 'Off' && isTimerRunning) {
            stopTimer();
        }
    }, [mode]);

    // Stop timer
    const stopTimer = () => {
        setIsTimerRunning(false);
        setRemainingSeconds(0);
    };

    // Load presets from Firebase
    useEffect(() => {
        if (!user || isDemo || !database) return;
        const presetsRef = ref(database, `users/${user.uid}/presets`);
        const unsubscribe = onValue(presetsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const presetList = Object.entries(data).map(([id, value]) => ({
                    id,
                    ...value,
                }));
                setPresets(presetList.slice(0, 3)); // Max 3 presets
            } else {
                setPresets([]);
            }
        });

        return () => unsubscribe();
    }, [user]);

    const handleSavePreset = () => {
        if (!user) {
            Alert.alert("Auth Required", "Please login to save presets.");
            return;
        }

        if (isDemo) {
            Alert.alert("Demo Mode", "Presets cannot be saved in demo mode. Please configure Firebase credentials.");

            // Mock local save for demo feel
            const newPreset = {
                id: Date.now().toString(),
                name: `Mode ${presets.length + 1}`,
                mode,
                temp,
                timer,
            };
            setPresets([...presets, newPreset].slice(0, 3));
            return;
        }

        if (presets.length >= 3) {
            Alert.alert("Limit Reached", "You can only save up to 3 custom presets.");
            return;
        }

        const presetName = `Mode ${presets.length + 1}`;
        const presetsRef = ref(database, `users/${user.uid}/presets`);
        const newPresetRef = push(presetsRef);
        set(newPresetRef, {
            name: presetName,
            mode,
            temp,
            timer,
        }).then(() => {
            Alert.alert("Success", "Preset saved successfully!");
        });
    };

    const applyPreset = (preset) => {
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
            setMode(title);
        };

        return (
            <Animated.View style={[styles.modeButtonWrapper, { transform: [{ scale: scaleAnim }] }]}>
                <Pressable
                    style={[
                        styles.modeButton,
                        { backgroundColor: active ? color : 'rgba(255,255,255,0.1)' }
                    ]}
                    android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                    onPress={handlePress}
                >
                    <Icon color={active ? '#fff' : 'rgba(255,255,255,0.5)'} size={20} />
                    <Text style={[styles.modeButtonText, { color: active ? '#fff' : 'rgba(255,255,255,0.5)' }]}>
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
                    <Clock color={isRunning ? COLORS.primary : COLORS.secondary} size={20} />
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
                        <Text style={styles.stopButtonText}>Stop</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    // Preset timer buttons
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

    return (
        <GradientBackground>
            <SafeAreaView style={styles.container}>
                <ScrollView
                    style={styles.contentScroll}
                    contentContainerStyle={styles.contentContainer}
                    showsVerticalScrollIndicator={false}
                >
                <View style={styles.header}>
                    <View>
                        <Text style={styles.greeting}>Hi, {username}</Text>
                        <View style={styles.statusRow}>
                            <View style={[styles.statusDot, { backgroundColor: isConnected ? COLORS.success : COLORS.danger }]} />
                            <Text style={styles.statusText}>{isConnected ? 'Connected' : 'Disconnected'}</Text>
                        </View>
                    </View>
                    <TouchableOpacity>
                        <Settings color="#fff" size={24} />
                    </TouchableOpacity>
                </View>

                <View style={styles.modeContainer}>
                    <ModeButton title="Hot" icon={Thermometer} active={mode === 'Hot'} color={COLORS.hot} />
                    <ModeButton title="Cold" icon={Wind} active={mode === 'Cold'} color={COLORS.cold} />
                    <ModeButton title="Off" icon={Power} active={mode === 'Off'} color={COLORS.off} />
                </View>

                {/* Timer Presets */}
                <View style={styles.timerPresetsContainer}>
                    <Text style={styles.timerPresetsLabel}>Quick Timer</Text>
                    <View style={styles.timerPresetsRow}>
                        <PresetTimerButton 
                            minutes={5} 
                            onPress={() => handleTimerSet(5)}
                            isActive={timer === 5 && isTimerRunning}
                        />
                        <PresetTimerButton 
                            minutes={10} 
                            onPress={() => handleTimerSet(10)}
                            isActive={timer === 10 && isTimerRunning}
                        />
                        <PresetTimerButton 
                            minutes={15} 
                            onPress={() => handleTimerSet(15)}
                            isActive={timer === 15 && isTimerRunning}
                        />
                        <PresetTimerButton 
                            minutes={20} 
                            onPress={() => handleTimerSet(20)}
                            isActive={timer === 20 && isTimerRunning}
                        />
                    </View>
                </View>

                <TimerDisplay
                    selectedMinutes={timer}
                    remainingSeconds={remainingSeconds}
                    isRunning={isTimerRunning}
                    onPress={() => setShowTimerModal(true)}
                    onStop={stopTimer}
                />

                {/* Main Temperature Dial */}
                <Animated.View style={[styles.dialWrapper, { opacity: fadeAnim }]}>
                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={mode === 'Hot' ? COLORS.hot : COLORS.cold} />
                            <Text style={styles.loadingText}>Adjusting temperature...</Text>
                        </View>
                    ) : (
                        <TemperatureDial
                            value={temp}
                            min={currentRange.min}
                            max={currentRange.max}
                            onChange={setTemp}
                            mode={mode}
                        />
                    )}
                </Animated.View>

                <View style={styles.presetsSection}>
                    <Text style={styles.sectionTitle}>Preset Modes</Text>
                    <View style={styles.presetsRow}>
                        {presets.map((preset) => (
                            <TouchableOpacity
                                key={preset.id}
                                style={styles.presetItem}
                                onPress={() => applyPreset(preset)}
                            >
                                <View style={styles.presetIconContainer}>
                                    <Settings color="#fff" size={20} />
                                </View>
                                <Text style={styles.presetLabel}>{preset.name}</Text>
                            </TouchableOpacity>
                        ))}
                        {presets.length < 3 && (
                            <TouchableOpacity style={styles.presetItem} onPress={handleSavePreset}>
                                <View style={[styles.presetIconContainer, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                                    <Plus color="#fff" size={20} />
                                </View>
                                <Text style={styles.presetLabel}>Custom</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
                </ScrollView>

                <WheelTimer
                    visible={showTimerModal}
                    value={timer}
                    onClose={() => setShowTimerModal(false)}
                    onSave={(val) => {
                        handleTimerSet(val);
                        setShowTimerModal(false);
                    }}
                />

                {/* Bottom Navigation */}
                <View style={styles.bottomNav}>
                    <TouchableOpacity style={styles.navItem}>
                        <Home color={COLORS.primary} size={24} />
                        <Text style={[styles.navText, { color: COLORS.primary }]}>Home</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.navItem}>
                        <Clock color="rgba(255,255,255,0.5)" size={24} />
                        <Text style={styles.navText}>History</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.navItem}
                        onPress={() =>
                            navigation.navigate('Profile', {
                                username,
                                deviceName,
                            })
                        }
                    >
                        <UserIcon color="rgba(255,255,255,0.5)" size={24} />
                        <Text style={styles.navText}>Profile</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </GradientBackground>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: SPACING.lg,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    contentScroll: {
        flex: 1,
    },
    contentContainer: {
        paddingBottom: 110,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30,
        marginTop: 20,
        paddingHorizontal: 10,
    },
    greeting: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 5,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
    },
    statusText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
    },
    modeContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    modeButtonWrapper: {
        flex: 1,
        alignItems: 'center',
    },
    modeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '92%',
        paddingVertical: 12,
        borderRadius: 20,
    },
    modeButtonText: {
        marginLeft: 8,
        fontWeight: '600',
    },
    timerWrapper: {
        alignItems: 'center',
        marginTop: 20,
    },
    timerContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 30,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        minWidth: 140,
        justifyContent: 'center',
    },
    timerContainerActive: {
        backgroundColor: 'rgba(26, 184, 193, 0.2)',
        borderColor: COLORS.primary,
        borderWidth: 2,
    },
    dialWrapper: {
        marginTop: 30,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 350,
    },
    loadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    loadingText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        marginTop: 15,
        fontWeight: '500',
    },
    timerText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '600',
        marginLeft: 10,
        fontVariant: ['tabular-nums'],
        letterSpacing: 1,
    },
    timerTextActive: {
        color: COLORS.primary,
        fontSize: 22,
    },
    timerLabel: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        marginLeft: 5,
        marginTop: 4,
    },
    stopButton: {
        marginTop: 12,
        paddingHorizontal: 20,
        paddingVertical: 6,
        borderRadius: 15,
        backgroundColor: 'rgba(255, 82, 82, 0.2)',
        borderWidth: 1,
        borderColor: '#FF5252',
    },
    stopButtonText: {
        color: '#FF5252',
        fontSize: 14,
        fontWeight: '600',
    },
    timerPresetsContainer: {
        marginTop: 20,
        alignItems: 'center',
    },
    timerPresetsLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        fontWeight: '500',
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    timerPresetsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
    },
    presetTimerButton: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 6,
    },
    presetTimerButtonActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
        transform: [{ scale: 1.1 }],
    },
    presetTimerText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    presetTimerTextActive: {
        color: '#fff',
        fontWeight: '700',
    },
    presetsSection: {
        marginTop: 40,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 15,
    },
    presetsRow: {
        flexDirection: 'row',
    },
    presetItem: {
        alignItems: 'center',
        marginRight: 25,
    },
    presetIconContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: COLORS.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    presetLabel: {
        color: '#fff',
        fontSize: 12,
    },
    bottomNav: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 70,
        backgroundColor: 'rgba(0,0,0,0.4)',
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    navItem: {
        alignItems: 'center',
    },
    navText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 10,
        marginTop: 4,
    }
});

export default DashboardScreen;
