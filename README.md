# Alien Healthcare Smart Band App

This is a cross-platform mobile application built with React Native and Expo for managing a smart wearable band.

## Features

- **Dashboard**: Control heating and cooling modes with specific temperature ranges.
- **Timer**: iOS-style scrolling wheel timer (1-60 mins).
- **Custom Modes**: Save up to 3 custom configurations to Firebase.
- **Authentication**: Secure login and verification flow.
- **Bluetooth Ready**: Integrated `sendCommandToDevice` stub for future BLE connectivity.

## Setup Instructions

### 1. Firebase Configuration
You must provide your own Firebase project credentials.
Go to `src/firebase/firebaseConfig.js` and replace the placeholders in the `firebaseConfig` object with your actual keys from the Firebase Console.

Ensure you have **Email/Password** authentication and **Real-time Database** enabled in your Firebase project.

### 2. Install Dependencies
Run the following command in the project root:
```bash
npm install
```

### 3. Run the App
- For Android: `npx expo start --android`
- For iOS: `npx expo start --ios`
- For Web: `npx expo start --web`

## Directory Structure
- `src/components`: Reusable UI components like the Temperature Dial and Wheel Timer.
- `src/screens`: Individual app screens (Login, Dashboard, etc.).
- `src/navigation`: Navigation stack configuration.
- `src/firebase`: Firebase initialization and services.
- `src/constants`: Theme, colors, and global styles.

## Design
The UI is strictly based on the Alien Healthcare Figma design, featuring a premium teal gradient aesthetic and gold-themed interactive elements.
# AlienCare
