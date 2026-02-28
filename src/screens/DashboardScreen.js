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
    TextInput
} from 'react-native';
import { Thermometer, Wind, Power, Clock, Plus, Settings, Home, User as UserIcon, X } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ref, set, push, onValue } from 'firebase/database';
import { auth, database, isDemo } from '../firebase/firebaseConfig';
import GradientBackground from '../components/GradientBackground';
import TemperatureDial from '../components/TemperatureDial';
import WheelTimer from '../components/WheelTimer';
import { COLORS, SPACING } from '../constants/theme';
import { sendCommandToDevice } from '../hooks/useBluetooth';

const DashboardScreen = ({ navigation, route }) => {
    const [mode, setMode] = useState('Off'); // Hot, Cold, Off
    const [temp, setTemp] = useState(15);
    const [timer, setTimer] = useState(0); // Selected timer (minutes)
    const [remainingSeconds, setRemainingSeconds] = useState(0); // Countdown (seconds)
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [showTimerModal, setShowTimerModal] = useState(false);
    const [presets, setPresets] = useState([]);
    const [isConnected, setIsConnected] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [showPresetModal, setShowPresetModal] = useState(false);
    const [newPresetName, setNewPresetName] = useState('');

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

    useEffect(() => {
        const activeTimer = isTimerRunning ? timer : 0;
        sendCommandToDevice(mode, temp, activeTimer);
    }, [mode, temp, timer, isTimerRunning]);

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

    useEffect(() => {
        if (mode === 'Off' && isTimerRunning) {
            stopTimer();
        }
    }, [mode]);

    const stopTimer = () => {
        setIsTimerRunning(false);
        setRemainingSeconds(0);
    };

    useEffect(() => {
        if (presets.length === 0) {
            setPresets([]);
        }
    }, [user]);

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
        setPresets([...presets, newPreset]);
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
                        setPresets(presets.filter(p => p.id !== id));
                    }
                }
            ]
        );
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

    return (
        <GradientBackground>
            <SafeAreaView style={styles.container}>
                <ScrollView
                    style={styles.contentScroll}
                    contentContainerStyle={styles.contentContainer}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header */}
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

                    {/* Mode Selector */}
                    <View style={styles.modeContainer}>
                        <ModeButton title="Hot" icon={Thermometer} active={mode === 'Hot'} color={COLORS.hot} />
                        <ModeButton title="Cold" icon={Wind} active={mode === 'Cold'} color={COLORS.cold} />
                        <ModeButton title="Off" icon={Power} active={mode === 'Off'} color={COLORS.off} />
                    </View>

                    {/* Presets Moved Up */}
                    <View style={styles.presetsSection}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Saved Presets</Text>
                        </View>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsRow}>
                            {presets.length === 0 && (
                                <Text style={styles.noPresetsText}>No presets saved yet.</Text>
                            )}
                            {presets.map((preset) => (
                                <TouchableOpacity
                                    key={preset.id}
                                    style={styles.presetItem}
                                    onPress={() => applyPreset(preset)}
                                    onLongPress={() => handleDeletePreset(preset.id)}
                                    delayLongPress={500}
                                    activeOpacity={0.7}
                                >
                                    <View style={[
                                        styles.presetIconContainer,
                                        { backgroundColor: preset.mode === 'Hot' ? COLORS.hot : preset.mode === 'Cold' ? COLORS.cold : COLORS.off }
                                    ]}>
                                        {preset.mode === 'Hot' ? <Thermometer color="#fff" size={22} /> :
                                            preset.mode === 'Cold' ? <Wind color="#fff" size={22} /> :
                                                <Power color="#fff" size={22} />}
                                    </View>
                                    <Text style={styles.presetLabel} numberOfLines={1}>{preset.name}</Text>
                                    <Text style={styles.presetDetail}>
                                        {preset.mode === 'Off' ? 'Off' : `${preset.temp}° • ${preset.timer}m`}
                                    </Text>
                                </TouchableOpacity>
                            ))}

                            {presets.length < 3 && (
                                <TouchableOpacity style={styles.presetItem} onPress={handleSavePresetStart} activeOpacity={0.7}>
                                    <View style={[styles.presetIconContainer, { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderStyle: 'dashed' }]}>
                                        <Plus color="rgba(255,255,255,0.7)" size={24} />
                                    </View>
                                    <Text style={[styles.presetLabel, { color: 'rgba(255,255,255,0.7)' }]}>Add New</Text>
                                    <Text style={[styles.presetDetail, { color: 'transparent' }]}>-</Text>
                                </TouchableOpacity>
                            )}
                        </ScrollView>
                    </View>

                    {/* Dial Section */}
                    <Animated.View style={[styles.dialWrapper, { opacity: fadeAnim }]}>
                        {isLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={mode === 'Hot' ? COLORS.hot : COLORS.cold} />
                                <Text style={styles.loadingText}>Adjusting temperature...</Text>
                            </View>
                        ) : mode === 'Cold' ? (
                            <View style={styles.coolModeContainer}>
                                <Wind color={COLORS.cold} size={60} />
                                <Text style={styles.coolModeText}>Cool Mode On</Text>
                            </View>
                        ) : mode === 'Off' ? (
                            <View style={styles.coolModeContainer}>
                                <Power color={COLORS.off} size={60} />
                                <Text style={[styles.coolModeText, { color: COLORS.off }]}>System Off</Text>
                            </View>
                        ) : (
                            <TouchableOpacity activeOpacity={0.9} onPress={() => setShowTimerModal(true)}>
                                <TemperatureDial
                                    value={temp}
                                    min={currentRange.min}
                                    max={currentRange.max}
                                    onChange={setTemp}
                                    mode={mode}
                                    isTimerRunning={isTimerRunning}
                                    timerValue={`${Math.floor(remainingSeconds / 60) < 10 ? '0' : ''}${Math.floor(remainingSeconds / 60)}:${remainingSeconds % 60 < 10 ? '0' : ''}${remainingSeconds % 60}`}
                                />
                            </TouchableOpacity>
                        )}
                    </Animated.View>

                    {/* Refined Timer Section */}
                    <View style={styles.timerSectionCard}>
                        <Text style={styles.timerSectionTitle}>Quick Timer</Text>
                        <View style={styles.timerPresetsRow}>
                            <PresetTimerButton minutes={5} onPress={() => handleTimerSet(5)} isActive={timer === 5 && isTimerRunning} />
                            <PresetTimerButton minutes={10} onPress={() => handleTimerSet(10)} isActive={timer === 10 && isTimerRunning} />
                            <PresetTimerButton minutes={15} onPress={() => handleTimerSet(15)} isActive={timer === 15 && isTimerRunning} />
                            <PresetTimerButton minutes={20} onPress={() => handleTimerSet(20)} isActive={timer === 20 && isTimerRunning} />
                        </View>
                        {isTimerRunning && (
                            <View style={{ alignItems: 'center' }}>
                                <TouchableOpacity style={styles.stopButton} onPress={stopTimer}>
                                    <Text style={styles.stopButtonText}>Stop Timer</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                </ScrollView>

                {/* Top Overlay Timer Modal */}
                <WheelTimer
                    visible={showTimerModal}
                    value={timer}
                    onClose={() => setShowTimerModal(false)}
                    onSave={(val) => {
                        handleTimerSet(val);
                        setShowTimerModal(false);
                    }}
                />

                {/* Naming Modal */}
                <Modal
                    visible={showPresetModal}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowPresetModal(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Save Preset</Text>
                                <TouchableOpacity onPress={() => setShowPresetModal(false)}>
                                    <X color="rgba(255,255,255,0.6)" size={24} />
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.modalSubtitle}>Name your new custom preset</Text>

                            <TextInput
                                style={styles.input}
                                value={newPresetName}
                                onChangeText={setNewPresetName}
                                placeholder="E.g., Morning Heat"
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                autoFocus
                                maxLength={16}
                            />

                            <TouchableOpacity
                                style={[styles.saveBtn, !newPresetName.trim() && { opacity: 0.5 }]}
                                onPress={handleSavePresetConfirm}
                                disabled={!newPresetName.trim()}
                            >
                                <Text style={styles.saveBtnText}>Save Preset</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

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
                        onPress={() => navigation.navigate('Profile', { username, deviceName })}
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
    contentScroll: { flex: 1 },
    contentContainer: { paddingBottom: 110 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        marginTop: 20,
        paddingHorizontal: 10,
    },
    greeting: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
    statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    statusText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },

    modeContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 15,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 25,
        padding: 6,
    },
    modeButtonWrapper: { flex: 1, alignItems: 'center' },
    modeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        paddingVertical: 14,
        borderRadius: 20,
    },
    modeButtonText: { marginLeft: 6, fontWeight: '600', fontSize: 16 },

    presetsSection: {
        marginTop: 15,
        marginBottom: 15,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    sectionHeader: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 15 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
    sectionSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginLeft: 10 },
    noPresetsText: { color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', paddingVertical: 10 },
    presetsRow: { alignItems: 'flex-start' },
    presetItem: { alignItems: 'center', marginRight: 22, width: 70 },
    presetIconContainer: {
        width: 58,
        height: 58,
        borderRadius: 29,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 5,
    },
    presetLabel: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
    presetDetail: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 3, textAlign: 'center' },

    dialWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 330,
        marginVertical: 10,
    },
    loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    loadingText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 15, fontWeight: '500' },
    coolModeContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 250,
        width: 250,
        borderRadius: 125,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.08)',
        shadowColor: COLORS.cold,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 8,
    },
    coolModeText: { color: COLORS.cold, fontSize: 24, fontWeight: 'bold', marginTop: 15 },

    timerSectionCard: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        marginTop: 10,
    },
    timerSectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'rgba(255,255,255,0.9)',
        marginBottom: 15,
        textAlign: 'center',
    },
    timerPresetsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
    presetTimerButton: {
        flex: 1,
        height: 48,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.06)',
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 4,
    },
    presetTimerButtonActive: {
        backgroundColor: COLORS.primary,
    },
    presetTimerText: { color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: '600' },
    presetTimerTextActive: { color: '#fff', fontWeight: 'bold' },

    timerWrapper: { alignItems: 'center', marginTop: 10 },
    timerContainer: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        paddingHorizontal: 30,
        paddingVertical: 14,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        minWidth: 180,
        justifyContent: 'center',
    },
    timerContainerActive: {
        backgroundColor: 'rgba(26, 184, 193, 0.15)',
        borderColor: COLORS.primary,
        borderWidth: 1.5,
    },
    timerText: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginLeft: 12, fontVariant: ['tabular-nums'], letterSpacing: 1 },
    timerTextActive: { color: COLORS.primary },
    timerLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginLeft: 6, marginTop: 6 },

    stopButton: {
        marginTop: 15,
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(255,82,82,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(255,82,82,0.5)',
        width: 140,
        alignItems: 'center',
    },
    stopButtonText: { color: '#FF5252', fontSize: 15, fontWeight: 'bold' },

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        width: '100%',
        backgroundColor: '#1E2336',
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)'
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    modalSubtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 20,
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
        marginBottom: 24,
    },
    saveBtn: {
        backgroundColor: COLORS.primary,
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
    },
    saveBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },

    bottomNav: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 70,
        backgroundColor: 'rgba(12,18,36,0.95)',
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
    },
    navItem: { alignItems: 'center' },
    navText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 4, fontWeight: '500' }
});

export default DashboardScreen;
