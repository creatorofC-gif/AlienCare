import { startHot, startCool, stopTherapy } from '../../BLE_connection/TherapyBle';

/**
 * Function to send commands to the Bluetooth device.
 * 
 * @param {string} mode - 'Hot', 'Cold', or 'Off'
 * @param {number} temperature - The target temperature in Celsius
 * @param {number} timerMinutes - The timer duration in minutes
 */
export const sendCommandToDevice = (mode, temperature, timerMinutes) => {
    console.log(`[Bluetooth] Sending command:`, {
        mode,
        temperature: mode === 'Off' ? 'N/A' : `${temperature}°C`,
        timer: `${timerMinutes} min`
    });

    if (mode === 'Hot') {
        startHot(temperature, timerMinutes);
    } else if (mode === 'Cold') {
        startCool(timerMinutes);
    } else if (mode === 'Off') {
        stopTherapy();
    }
};
