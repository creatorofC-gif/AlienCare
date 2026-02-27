import { BleManager } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import base64 from 'react-native-base64';

const manager = new BleManager();
let deviceConnected = null;

// 🔴 MUST MATCH ESP32
const SERVICE_UUID = "12345678-1234-1234-1234-1234567890ab";
const CHARACTERISTIC_UUID = "abcd1234-5678-1234-5678-abcdef123456";

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
async function sendCommand(command) {
  if (!deviceConnected) {
    console.log("Device not connected");
    return;
  }

  const encoded = base64.encode(command);

  try {
    await deviceConnected.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      CHARACTERISTIC_UUID,
      encoded
    );

    console.log("Sent:", command);
  } catch (error) {
    console.log("Write Error:", error);
  }
}

// --------------------
// HOT MODE
// --------------------
export function startHot(temp, time) {
  if (temp < 26) temp = 26;
  if (temp > 45) temp = 45;

  const command = `HOT,${temp},${time}`;
  sendCommand(command);
}

// --------------------
// COOL MODE
// --------------------
export function startCool(time) {
  const command = `COOL,0,${time}`;
  sendCommand(command);
}

// --------------------
// OFF MODE
// --------------------
export function stopTherapy() {
  const command = `OFF,0,0`;
  sendCommand(command);
}

// --------------------
// DISCONNECT
// --------------------
export function disconnectDevice() {
  if (deviceConnected) {
    deviceConnected.cancelConnection();
    deviceConnected = null;
  }
}