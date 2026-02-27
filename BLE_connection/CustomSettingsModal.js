import React, { useState } from 'react';
import { View, Text, Modal, Button, TextInput } from 'react-native';
import { startHot, startCool, stopTherapy } from '../bluetooth/TherapyBle';

export default function CustomSettingsModal({ visible, onClose }) {

  const [mode, setMode] = useState("HOT");   // HOT | COOL | OFF
  const [temperature, setTemperature] = useState(38);
  const [time, setTime] = useState(10);

  const handleSave = () => {

    if (mode === "HOT") {
      let temp = parseInt(temperature);

      if (temp < 26) temp = 26;
      if (temp > 45) temp = 45;

      startHot(temp, time);
    }

    else if (mode === "COOL") {
      startCool(time);
    }

    else if (mode === "OFF") {
      stopTherapy();
    }

    onClose();
  };

  return (
    <Modal visible={visible} transparent>

      <View style={{ backgroundColor: "#222", padding: 20 }}>

        <Text>Select Mode</Text>

        <Button title="HOT" onPress={() => setMode("HOT")} />
        <Button title="COOL" onPress={() => setMode("COOL")} />
        <Button title="OFF" onPress={() => setMode("OFF")} />

        {mode === "HOT" && (
          <>
            <Text>Temperature (26-45)</Text>
            <TextInput
              keyboardType="numeric"
              value={temperature.toString()}
              onChangeText={setTemperature}
            />
          </>
        )}

        {mode !== "OFF" && (
          <>
            <Text>Timer (minutes)</Text>
            <TextInput
              keyboardType="numeric"
              value={time.toString()}
              onChangeText={(val) => setTime(parseInt(val))}
            />
          </>
        )}

        <Button title="Save & Start" onPress={handleSave} />
        <Button title="Cancel" onPress={onClose} />

      </View>

    </Modal>
  );
}