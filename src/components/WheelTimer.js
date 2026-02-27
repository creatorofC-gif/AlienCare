import React, { useEffect, useCallback, useState, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions, Platform, BackHandler, ScrollView, Animated } from 'react-native';
// Replaced WheelPicker with custom ScrollView implementation for compatibility
import { BlurView } from 'expo-blur';
import { COLORS } from '../constants/theme';

const { height } = Dimensions.get('window');

// Custom Wheel Picker Component to avoid native dependency issues
const CustomWheelPicker = ({ items, selectedValue, onValueChange }) => {
    return (
        <View style={styles.customPickerContainer}>
            <View style={styles.selectionHighlight} />
            <ScrollView
                showsVerticalScrollIndicator={false}
                snapToInterval={50} // Height of each item
                decelerationRate="fast"
                contentContainerStyle={{ paddingVertical: 75 }} // Center content: (200 - 50)/2 approx
                onMomentumScrollEnd={(e) => {
                    const y = e.nativeEvent.contentOffset.y;
                    const index = Math.round(y / 50);
                    if (items[index]) {
                        onValueChange(items[index].value);
                    }
                }}
            >
                {items.map((item, index) => (
                    <TouchableOpacity
                        key={index}
                        style={styles.pickerItem}
                        onPress={() => onValueChange(item.value)}
                    >
                        <Text style={[
                            styles.pickerItemText,
                            selectedValue === item.value && styles.pickerSelectedItemText
                        ]}>
                            {item.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
};


const WheelTimer = ({ visible, value, onClose, onSave }) => {
    const [selectedValue, setSelectedValue] = useState(value);
    const [isMounted, setIsMounted] = useState(false);

    // Animated values for bottom sheet
    const translateY = useRef(new Animated.Value(height)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    // Sync visibility and handle animations
    useEffect(() => {
        if (visible) {
            setIsMounted(true);
            setSelectedValue(value);

            // Reset starting positions
            opacity.setValue(0);
            translateY.setValue(height);

            // Animate In
            Animated.parallel([
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.spring(translateY, {
                    toValue: 0,
                    damping: 14,
                    stiffness: 100,
                    useNativeDriver: true,
                }),
            ]).start();
        } else if (isMounted) {
            // Animate Out
            Animated.parallel([
                Animated.timing(opacity, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(translateY, {
                    toValue: height,
                    duration: 250,
                    useNativeDriver: true,
                }),
            ]).start(({ finished }) => {
                if (finished) {
                    setIsMounted(false);
                }
            });
        }
    }, [visible, value, isMounted, opacity, translateY]);

    // Handle Manual Closing (e.g. Cancel button)
    const handleClose = useCallback(() => {
        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
            Animated.timing(translateY, {
                toValue: height,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start(({ finished }) => {
            if (finished) {
                onClose();
            }
        });
    }, [onClose, opacity, translateY]);

    const handleSave = () => {
        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
            Animated.timing(translateY, {
                toValue: height,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start(({ finished }) => {
            if (finished) {
                onSave(selectedValue);
            }
        });
    };

    // Hardware Back Button Handler
    useEffect(() => {
        if (isMounted) {
            const backAction = () => {
                handleClose();
                return true;
            };
            const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
            return () => backHandler.remove();
        }
    }, [isMounted, handleClose]);

    // Generate minutes 1 to 60 with "min" label
    const minutes = Array.from({ length: 90 }, (_, i) => ({
        label: `${i + 1}`,
        value: i + 1,
    }));

    // Unmount when animation is done and not visible
    if (!isMounted) return null;

    return (
        <Modal
            transparent={true}
            visible={isMounted} // Keep Modal mounted while animating out
            onRequestClose={handleClose}
            statusBarTranslucent
            animationType="none"
        >
            <View style={styles.container}>
                {/* Animated Backdrop */}
                <Animated.View style={[styles.backdropContainer, { opacity }]}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} activeOpacity={1}>
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={styles.backdropOverlay} />
                    </TouchableOpacity>
                </Animated.View>

                {/* Animated Bottom Sheet */}
                <Animated.View style={[styles.modalContent, { transform: [{ translateY }] }]}>
                    {/* Handle Indicator */}
                    <View style={styles.handleIndicator} />

                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Set Timer</Text>
                        <TouchableOpacity onPress={handleClose} style={styles.cancelButton}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Picker Section */}
                    <View style={styles.pickerWrapper}>
                        {/* Dial in the Minutes */}
                        <CustomWheelPicker
                            items={minutes}
                            selectedValue={selectedValue}
                            onValueChange={setSelectedValue}
                        />
                        <Text style={styles.unitLabel}>min</Text>
                    </View>

                    {/* Footer / Start Button */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.startButton}
                            onPress={handleSave}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.startButtonText}>Start</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-end',
        zIndex: 1000,
    },
    backdropContainer: {
        ...StyleSheet.absoluteFillObject,
    },
    backdropOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)', // Dark overlay
    },
    modalContent: {
        backgroundColor: '#1C1C1E', // Dark Grey Theme
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingBottom: Platform.OS === 'ios' ? 40 : 30,
        paddingHorizontal: 24,
        paddingTop: 16,
        minHeight: 400,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: -10,
        },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 15,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    handleIndicator: {
        width: 40,
        height: 5,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 25,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 35,
    },
    cancelButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    cancelText: {
        color: COLORS.primary, // iOS Blue/Orange style
        fontSize: 17,
        fontWeight: '400',
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    pickerWrapper: {
        height: 200,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 30,
        overflow: 'hidden',
    },
    customPickerContainer: {
        height: 200,
        width: 100,
        justifyContent: 'center',
    },
    pickerItem: {
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pickerItemText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 32,
        fontWeight: '300',
    },
    pickerSelectedItemText: {
        color: '#FFFFFF',
        fontSize: 42,
        fontWeight: '400',
    },
    selectionHighlight: {
        position: 'absolute',
        top: 75, // (200 - 50) / 2
        height: 50,
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 10,
        zIndex: -1,
    },
    unitLabel: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '500',
        marginLeft: 12,
        marginTop: 10,
    },
    footer: {
        marginTop: 'auto',
    },
    startButton: {
        backgroundColor: '#30D158', // iOS Green
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#30D158",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 8,
    },
    startButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
});

export default WheelTimer;
