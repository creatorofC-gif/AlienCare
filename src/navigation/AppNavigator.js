import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import LogoScreen from '../screens/LogoScreen';
import LoginScreen from '../screens/LoginScreen';
import VerificationScreen from '../screens/VerificationScreen';
import BluetoothScreen from '../screens/BluetoothScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Stack = createStackNavigator();

const AppNavigator = () => {
    return (
        <NavigationContainer>
            <Stack.Navigator
                initialRouteName="Logo"
                screenOptions={{
                    headerShown: false,
                }}
            >
                <Stack.Screen name="Logo" component={LogoScreen} />
                <Stack.Screen name="Login" component={LoginScreen} />
                <Stack.Screen name="Signup" component={LoginScreen} />
                <Stack.Screen name="Verification" component={VerificationScreen} />
                <Stack.Screen name="Bluetooth" component={BluetoothScreen} />
                <Stack.Screen name="Dashboard" component={DashboardScreen} />
                <Stack.Screen name="Profile" component={ProfileScreen} />
            </Stack.Navigator>
        </NavigationContainer>
    );
};

export default AppNavigator;
