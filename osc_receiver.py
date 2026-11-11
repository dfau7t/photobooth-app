"""
OSC Receiver module for Photobooth Studio.
Listens for Open Sound Control (OSC) UDP packets sent by external hardware
(such as an Arduino Nano ESP32 button) to trigger the camera shutter.

Zero-dependency standard library implementation (uses `socket`, `struct`, `threading`, and `queue`).
"""

import socket
import struct
import threading
import queue
import time
from typing import Callable, Optional, List, Tuple, Any


def parse_osc_packet(data: bytes) -> Tuple[Optional[str], List[Any]]:
    """
    Parses a binary OSC 1.0 packet (message or bundle) into (address, args).
    Returns (None, []) if data is not a valid OSC packet.
    """
    if not data:
        return None, []

    # Handle OSC Bundles
    if data.startswith(b"#bundle\x00"):
        # Skip '#bundle\0' (8 bytes) + timetag (8 bytes) = 16 bytes
        idx = 16
        results: List[Tuple[Optional[str], List[Any]]] = []
        while idx + 4 <= len(data):
            elem_len = struct.unpack(">i", data[idx:idx + 4])[0]
            idx += 4
            if elem_len > 0 and idx + elem_len <= len(data):
                elem_addr, elem_args = parse_osc_packet(data[idx:idx + elem_len])
                if elem_addr:
                    return elem_addr, elem_args
                idx += elem_len
            else:
                break
        return None, []

    # OSC Message must start with '/'
    if not data.startswith(b"/"):
        return None, []

    # 1. Parse OSC Address Pattern (null-terminated, padded to 4-byte boundary)
    null_idx = data.find(b"\x00")
    if null_idx == -1:
        return None, []

    address = data[:null_idx].decode("ascii", errors="replace")
    idx = (null_idx + 4) & ~3
    if idx >= len(data):
        return address, []

    # 2. Parse Type Tag String (starts with ',', null-terminated, padded to 4 bytes)
    if data[idx:idx + 1] != b",":
        return address, []

    tag_null = data.find(b"\x00", idx)
    if tag_null == -1:
        tag_null = len(data)

    type_tags = data[idx + 1:tag_null].decode("ascii", errors="replace")
    idx = (tag_null + 4) & ~3
    args: List[Any] = []

    # 3. Parse Argument Payloads
    for tag in type_tags:
        if tag == "i":
            if idx + 4 <= len(data):
                args.append(struct.unpack(">i", data[idx:idx + 4])[0])
                idx += 4
        elif tag == "f":
            if idx + 4 <= len(data):
                args.append(struct.unpack(">f", data[idx:idx + 4])[0])
                idx += 4
        elif tag == "s":
            s_end = data.find(b"\x00", idx)
            if s_end != -1:
                args.append(data[idx:s_end].decode("utf-8", errors="replace"))
                idx = (s_end + 4) & ~3
            else:
                args.append(data[idx:].decode("utf-8", errors="replace"))
                idx = len(data)
        elif tag == "b":  # Blob
            if idx + 4 <= len(data):
                blob_len = struct.unpack(">i", data[idx:idx + 4])[0]
                idx += 4
                args.append(data[idx:idx + blob_len])
                idx = (idx + blob_len + 3) & ~3
        elif tag == "T":  # True
            args.append(True)
        elif tag == "F":  # False
            args.append(False)

    return address, args


def create_osc_packet(address: str, args: Optional[List[Any]] = None) -> bytes:
    """Serializes an OSC address and list of arguments into an OSC 1.0 binary packet."""
    if args is None:
        args = []

    # Address padded to 4 bytes
    addr_bytes = address.encode("ascii") + b"\x00"
    while len(addr_bytes) % 4 != 0:
        addr_bytes += b"\x00"

    tags = ","
    arg_bytes = b""
    for a in args:
        if isinstance(a, bool):
            tags += "T" if a else "F"
        elif isinstance(a, int):
            tags += "i"
            arg_bytes += struct.pack(">i", a)
        elif isinstance(a, float):
            tags += "f"
            arg_bytes += struct.pack(">f", a)
        elif isinstance(a, str):
            tags += "s"
            sb = a.encode("utf-8") + b"\x00"
            while len(sb) % 4 != 0:
                sb += b"\x00"
            arg_bytes += sb
        elif isinstance(a, (bytes, bytearray)):
            tags += "b"
            blob_data = bytes(a)
            arg_bytes += struct.pack(">i", len(blob_data)) + blob_data
            while len(arg_bytes) % 4 != 0:
                arg_bytes += b"\x00"

    tag_bytes = tags.encode("ascii") + b"\x00"
    while len(tag_bytes) % 4 != 0:
        tag_bytes += b"\x00"

    return addr_bytes + tag_bytes + arg_bytes


def get_local_ip() -> str:
    """Attempts to detect local machine IP on the active LAN."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


class OSCReceiver:
    """
    Background UDP listener for Open Sound Control messages.
    Drains events into a thread-safe queue to ensure callbacks execute
    safely on the main Pygame UI thread.
    """

    def __init__(
        self,
        host: str = "0.0.0.0",
        port: int = 8000,
        address: str = "/button/press",
        on_button_press: Optional[Callable[[List[Any]], None]] = None,
        enabled: bool = True,
        debounce_seconds: float = 0.35,
    ):
        self.host = host
        self.port = port
        self.target_address = address
        self.on_button_press = on_button_press
        self.enabled = enabled
        self.debounce_seconds = debounce_seconds

        self.last_trigger_time: float = 0.0
        self.trigger_count: int = 0
        self.event_queue: queue.Queue = queue.Queue()
        self.running: bool = False
        self.sock: Optional[socket.socket] = None
        self.thread: Optional[threading.Thread] = None
        self.bound_port: Optional[int] = None

    def start(self):
        """Initializes UDP socket and starts background listener thread."""
        if not self.enabled:
            print("[OSC] Hardware OSC listener disabled via configuration.")
            return

        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            # Allow address reuse
            self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.sock.bind((self.host, self.port))
            self.sock.settimeout(0.4)
            self.bound_port = self.sock.getsockname()[1]
            self.running = True

            self.thread = threading.Thread(target=self._listen_loop, daemon=True, name="OSC-Listener")
            self.thread.start()

            local_ip = get_local_ip()
            print(f"[OSC] 🎛️  Listening for Arduino button on {self.host}:{self.bound_port} (path: '{self.target_address}')")
            print(f"      (Configure Arduino TARGET_IP to: {local_ip}, TARGET_PORT to: {self.bound_port})")

        except (PermissionError, OSError) as e:
            print(f"[OSC] ⚠️ Warning: Could not bind UDP socket on {self.host}:{self.port}: {e}")
            print("      (Application will run normally without external OSC hardware button).")
            self.enabled = False
            self.running = False
            if self.sock:
                try:
                    self.sock.close()
                except Exception:
                    pass
                self.sock = None

    def _listen_loop(self):
        """Worker loop running in a background thread."""
        while self.running and self.sock:
            try:
                data, client_addr = self.sock.recvfrom(2048)
                self.handle_incoming_packet(data, client_addr)
            except socket.timeout:
                continue
            except Exception as e:
                if self.running:
                    print(f"[OSC] Socket error in listener: {e}")
                break

    def handle_incoming_packet(self, data: bytes, client_addr: Tuple[str, int]):
        """Decodes OSC packet and enqueues event if address matches and debounce permits."""
        address, args = parse_osc_packet(data)
        if not address:
            return

        # Check if address matches target (or wildcard)
        if address == self.target_address or self.target_address == "*":
            now = time.time()
            if now - self.last_trigger_time >= self.debounce_seconds:
                self.last_trigger_time = now
                self.trigger_count += 1
                sender = f"{client_addr[0]}:{client_addr[1]}" if client_addr else "local"
                print(f"[OSC] 🔘 Received '{address}' from {sender} (arg={args}) -> Triggering Shutter #{self.trigger_count}")
                self.event_queue.put((address, args))
            else:
                # Debounced
                pass

    def inject_packet(self, data: bytes, client_addr: Tuple[str, int] = ("127.0.0.1", 8888)):
        """Directly injects a packet for testing and simulated environments."""
        self.handle_incoming_packet(data, client_addr)

    def poll(self):
        """
        Drains all queued triggers and executes callbacks on the calling (main UI) thread.
        Call this in your main Pygame event loop.
        """
        while not self.event_queue.empty():
            try:
                address, args = self.event_queue.get_nowait()
                if self.on_button_press:
                    try:
                        self.on_button_press(args)
                    except TypeError:
                        self.on_button_press()
            except queue.Empty:
                break

    def stop(self):
        """Stops background thread and closes UDP socket cleanly."""
        self.running = False
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=0.6)
