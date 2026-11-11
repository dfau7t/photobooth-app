#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <OSCMessage.h>

// ==========================================
// 1. Wi-Fi Configuration
// ==========================================
const char* WIFI_SSID = "WiFi-CIID";
const char* WIFI_PASS = "AstinoLan2024!";

// ==========================================
// 2. OSC Target Configuration
// ==========================================
// IP address of the computer or device receiving the OSC message.
// If you want to broadcast to any device on your local network,
// you can use your subnet broadcast (e.g., IPAddress(192, 168, 1, 255))
// or universal broadcast IPAddress(255, 255, 255, 255).
const IPAddress TARGET_IP(10, 35, 30, 5); 
const unsigned int TARGET_PORT = 8000;         // Target port (e.g. 8000, 9000, 12000)
const unsigned int LOCAL_PORT  = 8888;         // Local UDP port to listen/bind
const char* OSC_ADDRESS        = "/button/press";

// ==========================================
// 3. Hardware & Pin Definitions
// ==========================================
// On Arduino Nano ESP32, silkscreen pin D2 maps to D2 macro
#if defined(D2)
const int BUTTON_PIN = D2;
#else
const int BUTTON_PIN = 2;
#endif

// We use INPUT_PULLUP:
// Wire button between BUTTON_PIN (D2) and GND.
// When pressed, digitalRead() returns LOW.
// When released, digitalRead() returns HIGH.
const int BUTTON_PRESSED_STATE = LOW;

// Debounce settings
const unsigned long DEBOUNCE_DELAY_MS = 50;
int lastSteadyState = !BUTTON_PRESSED_STATE;
int lastFlickerState = !BUTTON_PRESSED_STATE;
unsigned long lastDebounceTime = 0;

// UDP instance
WiFiUDP udp;

// ==========================================
// Helper: Send OSC Message
// ==========================================
void sendOSC() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[OSC] Error: Wi-Fi not connected. Message skipped.");
    return;
  }

  // Create OSC Message
  OSCMessage msg(OSC_ADDRESS);
  msg.add(1); // Sends integer value 1 (you can also send a string or float)

  // Send over UDP
  udp.beginPacket(TARGET_IP, TARGET_PORT);
  msg.send(udp);
  udp.endPacket();
  msg.empty(); // Free allocated OSC buffer memory

  Serial.printf("[OSC] Sent %s 1 to %s:%u\n", 
                OSC_ADDRESS, 
                TARGET_IP.toString().c_str(), 
                TARGET_PORT);

  // Quick flash on built-in LED for visual feedback
  digitalWrite(LED_BUILTIN, HIGH);
  delay(60);
  digitalWrite(LED_BUILTIN, LOW);
}

// ==========================================
// Setup
// ==========================================
void setup() {
  // Initialize LED
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);

  // Configure Button with internal pull-up (connect button between D2 and GND)
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // Serial logging (Native USB CDC on ESP32-S3)
  Serial.begin(115200);
  unsigned long start = millis();
  while (!Serial && (millis() - start < 2500)) {
    // Wait briefly for Serial Monitor to attach
  }

  Serial.println("\n--- Arduino Nano ESP32 OSC Button ---");
  Serial.print("Connecting to Wi-Fi SSID: ");
  Serial.println(WIFI_SSID);

  // Wi-Fi setup
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  // Wait for Wi-Fi connection with LED blinking
  while (WiFi.status() != WL_CONNECTED) {
    digitalWrite(LED_BUILTIN, HIGH);
    delay(150);
    digitalWrite(LED_BUILTIN, LOW);
    delay(150);
    Serial.print(".");
  }

  Serial.println("\n[Wi-Fi] Connected successfully!");
  Serial.print("[Wi-Fi] IP Address: ");
  Serial.println(WiFi.localIP());

  // Bind local UDP port
  udp.begin(LOCAL_PORT);
  Serial.printf("[UDP] Listening on local port: %u\n", LOCAL_PORT);
  Serial.printf("[OSC] Ready! Press button on pin D2 to send message.\n");

  // Keep LED off in ready state
  digitalWrite(LED_BUILTIN, LOW);
}

// ==========================================
// Main Loop
// ==========================================
void loop() {
  int currentReading = digitalRead(BUTTON_PIN);

  // Reset debounce timer if state flickered
  if (currentReading != lastFlickerState) {
    lastDebounceTime = millis();
    lastFlickerState = currentReading;
  }

  // Check if state remained steady longer than debounce delay
  if ((millis() - lastDebounceTime) > DEBOUNCE_DELAY_MS) {
    // Check if the steady state has actually changed
    if (currentReading != lastSteadyState) {
      lastSteadyState = currentReading;

      // Trigger action on transition to pressed
      if (lastSteadyState == BUTTON_PRESSED_STATE) {
        Serial.println("[Button] Pressed!");
        sendOSC();
      } else {
        Serial.println("[Button] Released.");
      }
    }
  }
}
