import { BleManager } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import base64 from 'react-native-base64';

const manager = new BleManager();
let deviceConnected = null;

// 🔴 MUST MATCH ESP32
const SERVICE_UUID = "a0000001-0000-0000-0000-000000000001";
const TEMP_UUID = "a0000002-0000-0000-0000-000000000002";
const MODE_UUID = "a0000003-0000-0000-0000-000000000003";
const SET_UUID = "a0000004-0000-0000-0000-000000000004";
const TIMER_UUID = "a0000005-0000-0000-0000-000000000005";

// --------------------
// ANDROID PERMISSION
// --------------------
export async function requestBluetoothPermission() {
  if (Platform.OS === 'android') {
    await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
  }
}

// --------------------
// SCAN + CONNECT
// --------------------
export function connectToTherapyBand(onConnected) {
  manager.startDeviceScan(null, null, async (error, device) => {
    if (error) {
      console.log("Scan Error:", error);
      return;
    }

    // 👇 Change name if needed
    if (device.name === "TherapyBand") {
      manager.stopDeviceScan();

      try {
        deviceConnected = await device.connect();
        await deviceConnected.discoverAllServicesAndCharacteristics();
        console.log("Connected Successfully");
        onConnected(true);
      } catch (err) {
        console.log("Connection Failed:", err);
      }
    }
  });
}

// --------------------
// SEND COMMAND
// --------------------
async function sendCommand(characteristicUuid, commandStr) {
  if (!deviceConnected) {
    console.log("Device not connected");
    return;
  }

  const encoded = base64.encode(commandStr);

  try {
    await deviceConnected.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      characteristicUuid,
      encoded
    );

    console.log(`Sent to ${characteristicUuid}:`, commandStr);
  } catch (error) {
    console.log("Write Error:", error);
  }
}

// --------------------
// HOT MODE
// --------------------
export async function startHot(temp, time) {
  if (temp < 26) temp = 26;
  if (temp > 45) temp = 45;

  await sendCommand(MODE_UUID, "HEAT");
  await sendCommand(SET_UUID, String(temp));
  await sendCommand(TIMER_UUID, String(time));
}

// --------------------
// COOL MODE
// --------------------
export async function startCool(time) {
  await sendCommand(MODE_UUID, "COOL");
  await sendCommand(TIMER_UUID, String(time));
}

// --------------------
// OFF MODE
// --------------------
export async function stopTherapy() {
  await sendCommand(MODE_UUID, "OFF");
  await sendCommand(TIMER_UUID, "0");
}

// --------------------
// TEMPERATURE MONITORING
// --------------------
let tempSubscription = null;

export function monitorTemperature(onTemperatureUpdate) {
  if (!deviceConnected) return;

  tempSubscription = deviceConnected.monitorCharacteristicForService(
    SERVICE_UUID,
    TEMP_UUID,
    (error, characteristic) => {
      if (error) {
        console.log("Temperature Monitor Error:", error);
        return;
      }
      if (characteristic?.value) {
        const rawVal = base64.decode(characteristic.value);
        onTemperatureUpdate(rawVal);
      }
    }
  );
}

export function stopMonitoring() {
  if (tempSubscription) {
    tempSubscription.remove();
    tempSubscription = null;
  }
}

// --------------------
// DISCONNECT
// --------------------
export function disconnectDevice() {
  stopMonitoring();
  if (deviceConnected) {
    deviceConnected.cancelConnection();
    deviceConnected = null;
  }
}