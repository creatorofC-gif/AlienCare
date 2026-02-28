#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <TM1637Display.h>

/* ================= AUTO BLE CONFIG ================= */
#define BLE_IDLE_TIMEOUT_MS (3UL * 60UL * 1000UL)

/* ================= PIN MAP ================= */
#define BTN_MODE 32
#define BTN_UP 33
#define BTN_DOWN 25
#define BTN_TIMER 26

#define MOSFET_HEAT 27
#define MOSFET_COOL 14
#define NTC_PIN 34

#define CLK 18
#define DIO 19

TM1637Display display(CLK, DIO);

/* ================= BLE UUIDS ================= */
#define BLE_SERVICE_UUID "a0000001-0000-0000-0000-000000000001"
#define TEMP_UUID "a0000002-0000-0000-0000-000000000002"
#define MODE_UUID "a0000003-0000-0000-0000-000000000003"
#define SET_UUID "a0000004-0000-0000-0000-000000000004"
#define TIMER_UUID "a0000005-0000-0000-0000-000000000005"
/* ================= GLYPHS ================= */
const uint8_t GLYPH_H = 0b01110110;

const uint8_t GLYPH_C = 0b00111001;
const uint8_t GLYPH_O = 0b00111111;
const uint8_t GLYPH_L = 0b00111000;

const uint8_t GLYPH_F = 0b01110001;
const uint8_t DASH = 0b01000000;

/* ================= MODES ================= */
enum Mode { OFF_MODE, HEAT_MODE, COOL_MODE };
Mode mode = OFF_MODE;

/* ================= HEAT ================= */
int setpoint = 32;
const int MIN_SET = 25;
const int MAX_SET = 55;
const float HYST = 1.5;
const float HEAT_IDLE_BAND = 0.4;
const unsigned long HEAT_STANDBY_MS = 3000;
const int MAX_SAFE_TEMP = 47;

/* ================= COOL ================= */
const float MIN_COOL_TEMP = 0.0;
const float HOLD_HYST = 2.0;

/* ================= TIMER ================= */
enum TimerState { TIMER_IDLE, TIMER_SETTING, TIMER_RUNNING };
TimerState timerState = TIMER_IDLE;

unsigned long timerMs = 0;
unsigned long timerStartMs = 0;
unsigned long lastTimerAction = 0;

bool showTimerDisplay = false;
unsigned long timerDisplayUntil = 0;

const unsigned long TIMER_STEP_MS = 5UL * 60000UL;
const unsigned long TIMER_PREVIEW_MS = 3000;
const unsigned long LONGPRESS_MS = 1500;
const unsigned long TIMER_STEP_GAP_MS = 600;
unsigned long lastTimerStepMs = 0;

/* ================= CANCEL BLINK ================= */
bool cancelBlink = false;
unsigned long cancelBlinkUntil = 0;
bool blinkState = false;
unsigned long lastBlinkToggle = 0;

const unsigned long BLINK_INTERVAL_MS = 500;
const unsigned long CANCEL_BLINK_MS = 2000;

/* ================= TIMING ================= */
const unsigned long TEMP_READ_MS = 150;
const unsigned long DISPLAY_MS = 150;
const unsigned long OFF_DISPLAY_MS = 3000;
const unsigned long SETPOINT_PREVIEW_MS = 3000;

/* ================= NTC ================= */
const float R_FIXED = 10000.0;
const float R_NOM = 10000.0;
const float BETA = 3950.0;
const float T_NOM = 25.0;

/* ================= STATE ================= */
float filteredTemp = 0;
bool tempInit = false;
float displayTemp = -100;

bool heaterOn = false;
bool coolerOn = false;

bool showSetpoint = false;
unsigned long setpointUntil = 0;
unsigned long heatStandbyUntil = 0;

unsigned long offStartMs = 0;
unsigned long lastTempRead = 0;
unsigned long lastDisplayUpdate = 0;

/* ================= COOL HOLD ================= */
bool coolHold = false;
unsigned long coolToggleStart = 0;

/* ================= BUTTON STATES ================= */
bool lastModeBtn = HIGH;
bool lastUp = HIGH;
bool lastDown = HIGH;
bool lastTimerBtn = HIGH;
unsigned long timerPressStart = 0;

/* ================= BLE STATE ================= */
bool bleEnabled = true;
bool bleConnected = false;
unsigned long lastUserActivityMs = 0;

/* ================= BLE OBJECTS ================= */
BLEServer *bleServer;
BLECharacteristic *tempChar;
BLECharacteristic *modeChar;
BLECharacteristic *setChar;
BLECharacteristic *timerChar;

/* ================= BLE RATE LIMIT ================= */
unsigned long lastBleTempNotify = 0;
unsigned long lastBleTimerNotify = 0;
Mode lastBleMode = OFF_MODE;
int lastBleSetpoint = -1;

/* ================= TEMP READ ================= */
float readTemp() {
  int adc = analogRead(NTC_PIN);
  float r = R_FIXED * ((float)adc / (4095 - adc));
  return 1.0 / ((log(r / R_NOM) / BETA) + (1.0 / (T_NOM + 273.15))) - 273.15;
}

/* ================= BLE CALLBACKS ================= */
class ModeCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) {
    String v = c->getValue().c_str();
    if (v == "OFF")
      mode = OFF_MODE;
    else if (v == "HEAT")
      mode = HEAT_MODE;
    else if (v == "COOL")
      mode = COOL_MODE;
    if (mode == OFF_MODE)
      offStartMs = millis();
  }
};

class SetCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) {
    int v = atoi(c->getValue().c_str());
    if (v >= MIN_SET && v <= MAX_SET) {
      setpoint = v;
      showSetpoint = true;
      setpointUntil = millis() + SETPOINT_PREVIEW_MS;
      heatStandbyUntil = millis() + HEAT_STANDBY_MS;
    }
  }
};

class TimerCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) {
    int min = atoi(c->getValue().c_str());
    if (min <= 0) {
      timerState = TIMER_IDLE;
      timerMs = 0;
      cancelBlink = true;
      cancelBlinkUntil = millis() + CANCEL_BLINK_MS;
      blinkState = true;
      lastBlinkToggle = millis();
    } else {
      timerMs = (unsigned long)min * 60000UL;
      timerStartMs = millis();
      timerState = TIMER_RUNNING;
      showTimerDisplay = true;
      timerDisplayUntil = millis() + TIMER_PREVIEW_MS;
    }
  }
};

class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer *) { bleConnected = true; }
  void onDisconnect(BLEServer *) {
    bleConnected = false;
    if (bleEnabled)
      BLEDevice::getAdvertising()->start();
  }
};

/* ================= SETUP ================= */
void setup() {
  pinMode(BTN_MODE, INPUT_PULLUP);
  pinMode(BTN_UP, INPUT_PULLUP);
  pinMode(BTN_DOWN, INPUT_PULLUP);
  pinMode(BTN_TIMER, INPUT_PULLUP);

  pinMode(MOSFET_HEAT, OUTPUT);
  pinMode(MOSFET_COOL, OUTPUT);

  display.setBrightness(6);
  display.clear();
  offStartMs = millis();
  lastUserActivityMs = millis();

  BLEDevice::init("TherapyBand");
  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCB());

  BLEService *service = bleServer->createService(BLE_SERVICE_UUID);

  tempChar = service->createCharacteristic(
      TEMP_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  tempChar->addDescriptor(new BLE2902());

  modeChar = service->createCharacteristic(
      MODE_UUID, BLECharacteristic::PROPERTY_READ |
                     BLECharacteristic::PROPERTY_WRITE |
                     BLECharacteristic::PROPERTY_NOTIFY);
  modeChar->addDescriptor(new BLE2902());
  modeChar->setCallbacks(new ModeCB());

  setChar = service->createCharacteristic(
      SET_UUID, BLECharacteristic::PROPERTY_READ |
                    BLECharacteristic::PROPERTY_WRITE |
                    BLECharacteristic::PROPERTY_NOTIFY);
  setChar->addDescriptor(new BLE2902());
  setChar->setCallbacks(new SetCB());

  timerChar = service->createCharacteristic(
      TIMER_UUID, BLECharacteristic::PROPERTY_READ |
                      BLECharacteristic::PROPERTY_WRITE |
                      BLECharacteristic::PROPERTY_NOTIFY);
  timerChar->addDescriptor(new BLE2902());
  timerChar->setCallbacks(new TimerCB());

  service->start();
  BLEDevice::getAdvertising()->start();
}

/* ================= LOOP ================= */
void loop() {
  unsigned long now = millis();

  if (!digitalRead(BTN_MODE) || !digitalRead(BTN_UP) ||
      !digitalRead(BTN_DOWN) || !digitalRead(BTN_TIMER)) {
    lastUserActivityMs = now;
    if (!bleEnabled) {
      bleEnabled = true;
      BLEDevice::getAdvertising()->start();
    }
  }

  if (bleEnabled && mode == OFF_MODE && timerState == TIMER_IDLE &&
      now - lastUserActivityMs > BLE_IDLE_TIMEOUT_MS) {
    bleEnabled = false;
    BLEDevice::getAdvertising()->stop();
  }

  bool m = digitalRead(BTN_MODE);

  if (lastModeBtn == HIGH && m == LOW) {

    mode = (Mode)((mode + 1) % 3);

    coolHold = false;
    showSetpoint = false;
    showTimerDisplay = false;

    if (mode == OFF_MODE)
      offStartMs = now;
  }

  lastModeBtn = m;

  if (now - lastTempRead >= TEMP_READ_MS) {
    lastTempRead = now;
    float raw = readTemp();
    filteredTemp = tempInit ? filteredTemp + (raw - filteredTemp) * 0.30 : raw;
    tempInit = true;
  }

  bool up = digitalRead(BTN_UP);
  bool down = digitalRead(BTN_DOWN);
  if (mode == HEAT_MODE) {
    if (lastUp == HIGH && up == LOW && setpoint < MAX_SET) {
      setpoint++;
      showSetpoint = true;
      setpointUntil = now + SETPOINT_PREVIEW_MS;
      heatStandbyUntil = now + HEAT_STANDBY_MS;
    }
    if (lastDown == HIGH && down == LOW && setpoint > MIN_SET) {
      setpoint--;
      showSetpoint = true;
      setpointUntil = now + SETPOINT_PREVIEW_MS;
      heatStandbyUntil = now + HEAT_STANDBY_MS;
    }
  }
  lastUp = up;
  lastDown = down;
  if (now > setpointUntil)
    showSetpoint = false;

  bool t = digitalRead(BTN_TIMER);
  if (lastTimerBtn == HIGH && t == LOW)
    timerPressStart = now;

  if (lastTimerBtn == LOW && t == HIGH) {
    unsigned long dur = now - timerPressStart;
    if (dur >= LONGPRESS_MS) {
      timerState = TIMER_IDLE;
      timerMs = 0;
      cancelBlink = true;
      cancelBlinkUntil = now + CANCEL_BLINK_MS;
      blinkState = true;
      lastBlinkToggle = now;
    } else if (mode != OFF_MODE && now - lastTimerStepMs >= TIMER_STEP_GAP_MS) {
      if (timerState == TIMER_IDLE) {
        timerState = TIMER_SETTING;
        timerMs = 0;
      } else if (timerState == TIMER_SETTING) {
        timerMs += TIMER_STEP_MS;
      }
      showTimerDisplay = true;
      timerDisplayUntil = now + TIMER_PREVIEW_MS;
      lastTimerAction = now;
      lastTimerStepMs = now;
    }
  }
  lastTimerBtn = t;

  if (timerState == TIMER_SETTING && now - lastTimerAction > TIMER_PREVIEW_MS) {
    if (timerMs > 0) {
      timerState = TIMER_RUNNING;
      timerStartMs = now;
    } else
      timerState = TIMER_IDLE;
  }

  if (timerState == TIMER_RUNNING && now - timerStartMs >= timerMs) {
    timerState = TIMER_IDLE;
    timerMs = 0;
    mode = OFF_MODE;
    offStartMs = now;
  }

  heaterOn = (mode == HEAT_MODE && filteredTemp < MAX_SAFE_TEMP &&
              now >= heatStandbyUntil &&
              abs(filteredTemp - setpoint) > HEAT_IDLE_BAND &&
              filteredTemp <= setpoint - HYST);

  coolerOn = false;
  if (mode == COOL_MODE) {
    if (!coolHold) {
      coolerOn = true;
      if (filteredTemp <= MIN_COOL_TEMP) {
        coolHold = true;
        coolToggleStart = now;
      }
    } else {
      if (filteredTemp > MIN_COOL_TEMP + HOLD_HYST)
        coolerOn = true;
      else
        coolerOn = ((now - coolToggleStart) % 3000) < 1000;
    }
  }

  digitalWrite(MOSFET_HEAT, heaterOn);
  digitalWrite(MOSFET_COOL, coolerOn);

  if (now > timerDisplayUntil)
    showTimerDisplay = false;
  if (now - lastDisplayUpdate >= DISPLAY_MS) {
    lastDisplayUpdate = now;
    updateDisplay(now);
  }

  if (now - lastBleTempNotify >= 500) {
    char b[8];
    dtostrf(filteredTemp, 4, 1, b);
    tempChar->setValue(b);
    tempChar->notify();
    lastBleTempNotify = now;
  }

  if (mode != lastBleMode) {
    modeChar->setValue(mode == OFF_MODE    ? "OFF"
                       : mode == HEAT_MODE ? "HEAT"
                                           : "COOL");
    modeChar->notify();
    lastBleMode = mode;
  }

  if (setpoint != lastBleSetpoint) {
    setChar->setValue(String(setpoint).c_str());
    setChar->notify();
    lastBleSetpoint = setpoint;
  }

  if (now - lastBleTimerNotify >= 1000) {
    if (timerState == TIMER_RUNNING) {
      unsigned long rem = timerMs - (now - timerStartMs);
      timerChar->setValue(String(max(0, (int)(rem / 1000))).c_str());
    } else
      timerChar->setValue("0");
    timerChar->notify();
    lastBleTimerNotify = now;
  }
}

void updateDisplay(unsigned long now) {

  /* ---------- CANCEL BLINK ---------- */
  if (cancelBlink) {
    if (now >= cancelBlinkUntil) {
      cancelBlink = false;
      display.clear();
      return;
    }
    if (now - lastBlinkToggle >= BLINK_INTERVAL_MS) {
      blinkState = !blinkState;
      lastBlinkToggle = now;
    }
    blinkState ? display.showNumberDec(0) : display.clear();
    return;
  }

  /* ---------- TIMER DISPLAY ---------- */
  if (showTimerDisplay) {
    unsigned long rem = (timerState == TIMER_RUNNING)
                            ? timerMs - (now - timerStartMs)
                            : timerMs;

    if ((long)rem < 0)
      rem = 0;

    int mm = rem / 60000;
    int ss = (rem / 1000) % 60;

    display.showNumberDecEx(mm * 100 + ss, 0x40, true);
    return;
  }

  /* ---------- OFF MODE ---------- */
  if (mode == OFF_MODE) {
    if (now - offStartMs < OFF_DISPLAY_MS) {
      uint8_t s[4] = {GLYPH_O, GLYPH_F, GLYPH_F, 0};
      display.setSegments(s);
    } else {
      display.clear();
    }
    return;
  }

  /* ---------- COOL MODE ---------- */
  if (mode == COOL_MODE) {
    uint8_t s[4] = {GLYPH_C, GLYPH_O, GLYPH_O, GLYPH_L};
    display.setSegments(s);
    return;
  }

  /* ---------- HEAT MODE (H-XX ONLY) ---------- */
  if (mode == HEAT_MODE) {

    int v = setpoint;

    uint8_t s[4];
    s[0] = GLYPH_H;
    s[1] = DASH;
    s[2] = display.encodeDigit(v / 10);
    s[3] = display.encodeDigit(v % 10);

    display.setSegments(s);
    return;
  }
}
