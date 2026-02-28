import React, { useEffect, useState } from 'react';
import { View, Button, Text } from 'react-native';
import {
  requestBluetoothPermission,
  connectToTherapyBand,
  startHot,
  startCool,
  stopTherapy
} from './TherapyBle';

export default function HotScreen() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    requestBluetoothPermission();
  }, []);

  return (
    <View>
      <Text>Status: {connected ? "Connected" : "Disconnected"}</Text>

      <Button title="Connect" onPress={() => connectToTherapyBand(setConnected)} />

      <Button title="Hot 38° for 10min"
        onPress={() => startHot(38, 10)}
      />

      <Button title="Cool 15min"
        onPress={() => startCool(15)}
      />

      <Button title="OFF"
        onPress={() => stopTherapy()}
      />
    </View>
  );
}