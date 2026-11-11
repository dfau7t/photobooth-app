#pragma once
#include <Arduino.h>
#include <Udp.h>

/**
 * Lightweight, zero-dependency Open Sound Control (OSC 1.0) message builder.
 * Compatible with ESP32-S3, ESP32, and all Arduino architectures.
 */
class OSCMessage {
private:
    char address[64];
    char typeTags[16];
    size_t numArgs;
    uint8_t payload[256];
    size_t payloadLen;

    static void appendPaddedString(uint8_t* dest, size_t& offset, const char* str) {
        size_t len = strlen(str);
        memcpy(dest + offset, str, len);
        offset += len;
        // OSC strings are null-terminated and padded to 4-byte boundaries
        dest[offset++] = '\0';
        while ((offset % 4) != 0) {
            dest[offset++] = '\0';
        }
    }

public:
    OSCMessage(const char* addr = "") {
        setAddress(addr);
        empty();
    }

    void setAddress(const char* addr) {
        strncpy(address, addr, sizeof(address) - 1);
        address[sizeof(address) - 1] = '\0';
    }

    void empty() {
        typeTags[0] = ',';
        typeTags[1] = '\0';
        numArgs = 0;
        payloadLen = 0;
    }

    // Add 32-bit signed integer
    OSCMessage& add(int32_t val) {
        if (numArgs >= sizeof(typeTags) - 2 || payloadLen + 4 > sizeof(payload)) return *this;
        typeTags[1 + numArgs++] = 'i';
        typeTags[1 + numArgs] = '\0';
        uint32_t be = ((uint32_t)(val >> 24) & 0x000000FF) |
                      ((uint32_t)(val >> 8)  & 0x0000FF00) |
                      ((uint32_t)(val << 8)  & 0x00FF0000) |
                      ((uint32_t)(val << 24) & 0xFF000000);
        memcpy(payload + payloadLen, &be, 4);
        payloadLen += 4;
        return *this;
    }

    // Overload for plain int
    OSCMessage& add(int val) {
        return add((int32_t)val);
    }

    // Add 32-bit float
    OSCMessage& add(float val) {
        if (numArgs >= sizeof(typeTags) - 2 || payloadLen + 4 > sizeof(payload)) return *this;
        typeTags[1 + numArgs++] = 'f';
        typeTags[1 + numArgs] = '\0';
        union { float f; uint32_t u; } conv;
        conv.f = val;
        uint32_t be = ((conv.u >> 24) & 0x000000FF) |
                      ((conv.u >> 8)  & 0x0000FF00) |
                      ((conv.u << 8)  & 0x00FF0000) |
                      ((conv.u << 24) & 0xFF000000);
        memcpy(payload + payloadLen, &be, 4);
        payloadLen += 4;
        return *this;
    }

    // Add double (converted to 32-bit float for standard OSC)
    OSCMessage& add(double val) {
        return add((float)val);
    }

    // Add string
    OSCMessage& add(const char* str) {
        if (numArgs >= sizeof(typeTags) - 2) return *this;
        typeTags[1 + numArgs++] = 's';
        typeTags[1 + numArgs] = '\0';
        appendPaddedString(payload, payloadLen, str);
        return *this;
    }

    OSCMessage& add(const String& str) {
        return add(str.c_str());
    }

    // Serialize and write to an active UDP packet
    size_t send(UDP& udp) {
        uint8_t packet[512];
        size_t offset = 0;

        // 1. OSC Address Pattern (padded to 4 bytes)
        appendPaddedString(packet, offset, address);

        // 2. OSC Type Tag String (padded to 4 bytes)
        appendPaddedString(packet, offset, typeTags);

        // 3. Arguments payload
        if (payloadLen > 0) {
            memcpy(packet + offset, payload, payloadLen);
            offset += payloadLen;
        }

        return udp.write(packet, offset);
    }

    // Convenience method: beginPacket -> send -> endPacket
    bool send(UDP& udp, IPAddress ip, uint16_t port) {
        if (!udp.beginPacket(ip, port)) return false;
        send(udp);
        return udp.endPacket();
    }
};
