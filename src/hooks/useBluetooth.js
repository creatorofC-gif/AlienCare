import { startHot, startCool, stopTherapy } from '../../BLE_connection/TherapyBle';

/**
 * Function to send commands to the Bluetooth device.
 * 
 * @param {string} mode - 'Hot', 'Cold', or 'Off'
 * @param {number} temperature - The target temperature in Celsius
 * @param {number} timerSeconds - The timer duration in seconds
 */
export const sendCommandToDevice = (mode, temperature, timerSeconds) => {
    console.log(`[Bluetooth] Sending command:`, {
        mode,
        temperature: mode === 'Off' ? 'N/A' : `${temperature}°C`,
        timer: `${timerSeconds} s`
    });

    if (mode === 'Hot') {
        startHot(temperature, timerSeconds);
    } else if (mode === 'Cold') {
        startCool(temperature, timerSeconds);
    } else if (mode === 'Off') {
        stopTherapy();
    }
};
