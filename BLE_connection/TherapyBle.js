import { BleManager } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import base64 from 'react-native-base64';

let manager = null;
let deviceConnected = null;

function getBleManager() {
  if (manager) return manager;
  try {
    manager = new BleManager();
    return manager;
  } catch (e) {
    manager = null;
    return null;
  }
}

export function isBleAvailable() {
  return Boolean(getBleManager());
}

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
    let permissions = [];
    if (Platform.Version >= 31) {
      permissions = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ];
    } else {
      permissions = [
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ];
    }

    try {
      await PermissionsAndroid.requestMultiple(permissions);
    } catch (err) {
      console.warn(err);
    }
  }
}

// --------------------
// SCAN FOR DEVICES
// --------------------
export async function scanForDevices(onDeviceFound) {
  const m = getBleManager();
  if (!m) {
    onDeviceFound([]);
    return;
  }
  const discoveredDevices = new Map();

  m.startDeviceScan(null, null, (error, device) => {
    if (error) return;

    if (device && (device.name || device.localName)) {
      discoveredDevices.set(device.id, device);
      // Pass back unique list to update UI
      onDeviceFound(Array.from(discoveredDevices.values()));
    }
  });

  // Automatically stop scanning after 8 seconds
  setTimeout(() => {
    m.stopDeviceScan();
  }, 8000);
}

// --------------------
// CONNECT TO GIVEN DEVICE
// --------------------
export async function connectToGivenDevice(device, onConnected) {
  const m = getBleManager();
  if (!m) {
    onConnected(false);
    return;
  }

  m.stopDeviceScan(); // Stop scanning before connecting

  try {
    deviceConnected = await device.connect();
    await deviceConnected.discoverAllServicesAndCharacteristics();
    onConnected(true);
  } catch (err) {
    onConnected(false);
  }
}

// --------------------
// SEND COMMAND
// --------------------
async function sendCommand(characteristicUuid, commandStr) {
  if (!deviceConnected) {
    console.warn(`[BLE] sendCommand skipped — no device connected. Char=${characteristicUuid} Val="${commandStr}"`);
    return;
  }

  const encoded = base64.encode(commandStr);
  console.log(`[BLE] WRITE char=${characteristicUuid} value="${commandStr}"`);

  try {
    await deviceConnected.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      characteristicUuid,
      encoded
    );
  } catch (error) {
    console.error(`[BLE] WRITE ERROR char=${characteristicUuid} val="${commandStr}"`, error?.message);
  }
}

// --------------------
// HOT MODE
// --------------------
export async function startHot(temp, time) {
  if (temp < 10) temp = 10;
  if (temp > 55) temp = 55;

  await sendCommand(MODE_UUID, "HEAT");
  await sendCommand(SET_UUID, String(Math.round(temp)));
  if (time >= 0) {
    // MUST send integer — ESP32 parseInt chokes on floats like "1.5" → parses as 1
    await sendCommand(TIMER_UUID, String(Math.round(time)));
  }
}

// --------------------
// COOL MODE
// --------------------
export async function startCool(temp, time) {
  if (temp < 10) temp = 10;
  if (temp > 55) temp = 55;

  await sendCommand(MODE_UUID, "COOL");
  await sendCommand(SET_UUID, String(Math.round(temp)));
  if (time >= 0) {
    await sendCommand(TIMER_UUID, String(Math.round(time)));
  }
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
      if (error) return;
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
// DEVICE STATUS SYNCHRONIZATION
// --------------------
let modeSubscription = null;
let setpointSubscription = null;
let timerSubscription = null;

export function monitorDeviceStatus(onModeUpdate, onSetpointUpdate, onTimerUpdate) {
  if (!deviceConnected) return;

  modeSubscription = deviceConnected.monitorCharacteristicForService(
    SERVICE_UUID,
    MODE_UUID,
    (error, characteristic) => {
      if (error) return;
      if (characteristic?.value) {
        const rawVal = base64.decode(characteristic.value);
        let appMode = 'Off';
        if (rawVal === 'HEAT') appMode = 'Hot';
        else if (rawVal === 'COOL') appMode = 'Cold';
        else if (rawVal === 'OFF') appMode = 'Off';
        onModeUpdate(appMode);
      }
    }
  );

  setpointSubscription = deviceConnected.monitorCharacteristicForService(
    SERVICE_UUID,
    SET_UUID,
    (error, characteristic) => {
      if (error) return;
      if (characteristic?.value) {
        const rawVal = base64.decode(characteristic.value);
        const setpoint = parseInt(rawVal, 10);
        if (!isNaN(setpoint)) onSetpointUpdate(setpoint);
      }
    }
  );

  timerSubscription = deviceConnected.monitorCharacteristicForService(
    SERVICE_UUID,
    TIMER_UUID,
    (error, characteristic) => {
      if (error) return;
      if (characteristic?.value) {
        const rawVal = base64.decode(characteristic.value);
        const timerSeconds = parseInt(rawVal, 10);
        if (!isNaN(timerSeconds)) onTimerUpdate(timerSeconds);
      }
    }
  );
}

export function stopDeviceStatusMonitoring() {
  if (modeSubscription) {
    modeSubscription.remove();
    modeSubscription = null;
  }
  if (setpointSubscription) {
    setpointSubscription.remove();
    setpointSubscription = null;
  }
  if (timerSubscription) {
    timerSubscription.remove();
    timerSubscription = null;
  }
}

// --------------------
// DISCONNECT listener
// --------------------
export function onDeviceDisconnect(callback) {
  if (deviceConnected) {
    deviceConnected.onDisconnected((error, device) => {
      deviceConnected = null;
      callback();
    });
  }
}

// --------------------
// DISCONNECT
// --------------------
export function disconnectDevice() {
  stopMonitoring();
  stopDeviceStatusMonitoring();
  if (deviceConnected) {
    deviceConnected.cancelConnection();
    deviceConnected = null;
  }
}