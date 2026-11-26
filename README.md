# ESP32 Retro Sci-Fi Panel

A local Next.js control panel for the [ESP32 Retro Sci-Fi modules](https://github.com/lamaro/esp32-sci-fi-retro). It runs on your computer, talks to the board over your Wi-Fi network and switches its screen modes: status, console, hacker terminal, fatal error, weather, sunset, colors, animation, random and your own text.

```
browser ──► Next.js on localhost ──(HTTP + token, LAN)──► ESP32
```

The browser never sees the board's token: the Next.js server reads it from `.env.local` and forwards each command.

## What you need

- An ESP32 DevKit (38 pins, CP2102 USB) wired to a 1.44" ST7735S screen. See the [console module](https://github.com/lamaro/esp32-sci-fi-retro/tree/main/01-console) for the wiring and the 3D-printed case.
- A micro-USB **data** cable.
- Python 3 (to flash the board) and Node.js 22 or later (for the panel).
- A 2.4 GHz Wi-Fi network shared by the board and your computer.

## 1. Get the firmware

```sh
git clone https://github.com/lamaro/esp32-sci-fi-retro.git
cd esp32-sci-fi-retro
python3 -m venv .venv
source .venv/bin/activate
python -m pip install esptool mpremote
cd 01-console/firmware
```

On Windows, activate with `.venv\Scripts\Activate.ps1` in PowerShell and replace `"$PORT"` below with your COM port.

## 2. Find the board's port

Plug in the board and list the serial ports:

```sh
mpremote connect list
PORT=/dev/cu.usbserial-0001   # macOS example. Linux: /dev/ttyUSB0. Windows: COM3
```

If no port shows up, try another cable (many are charge-only) and install the [CP210x driver](https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers).

## 3. Install MicroPython (only once)

Skip this if the board already runs MicroPython. Otherwise download the latest `.bin` for [ESP32_GENERIC](https://micropython.org/download/ESP32_GENERIC/), save it as `firmware.bin` in `01-console/firmware/` and flash it. This erases everything on the board.

```sh
python -m esptool --chip esp32 --port "$PORT" erase-flash
python -m esptool --chip esp32 --port "$PORT" write-flash 0x1000 firmware.bin
```

If it hangs on `Connecting...`, hold the **BOOT** button until it starts writing.

## 4. Configure Wi-Fi and the token

```sh
cp wifi_secrets.py.example wifi_secrets.py
python -c 'import secrets; print(secrets.token_hex(32))'
```

Open `wifi_secrets.py` and fill in `WIFI_SSID`, `WIFI_PASSWORD` and `API_TOKEN` (the random token you just generated). Keep the token: the panel needs the same one.

## 5. Upload the firmware

```sh
mpremote connect "$PORT" fs cp wifi_secrets.py :wifi_secrets.py &&
mpremote connect "$PORT" fs cp font5x7.py :font5x7.py &&
mpremote connect "$PORT" fs cp display_ui.py :display_ui.py &&
mpremote connect "$PORT" fs cp weather.py :weather.py &&
mpremote connect "$PORT" fs cp main.py :main.py &&
mpremote connect "$PORT" reset
```

The board connects to Wi-Fi and shows its IP on the screen. To see the boot log, run `mpremote connect "$PORT" repl` and press **EN** (exit with **Ctrl+]**).

To update the firmware later, copy only `font5x7.py`, `display_ui.py`, `weather.py` and `main.py`, then reset.

## 6. Run the panel

In this repository:

```sh
npm ci
cp .env.example .env.local
```

Edit `.env.local`:

```sh
ESP32_DEVICES=Console=<the IP shown on the screen>
ESP32_API_TOKEN=<the same token as in wifi_secrets.py>
```

With several boards, list them as `Name=IP` separated by commas, for example `ESP32_DEVICES=Console=192.168.1.50,Holo=192.168.1.51`. They all use the same token, so load the same `wifi_secrets.py` on each one. The panel shows a button per board and remembers the last one you picked. A single `ESP32_BASE_URL=http://<ip>` from older versions still works.

Then start it:

```sh
npm run dev -- --hostname 127.0.0.1
```

Open http://localhost:3000. Wait for **Conectado** (the interface is in Spanish) and pick a mode.

## Troubleshooting

| Problem | What to check |
|---|---|
| Panel shows **Desconectado** | The board's IP may have changed (it comes from DHCP). Read it on the screen, update its IP in `ESP32_DEVICES` and restart `npm run dev`. Reserving the IP in your router avoids this. |
| Port busy | Close the REPL or any other serial monitor. |
| White screen but the API answers | Check VCC/GND and the SPI wires by GPIO label, then run `mpremote connect "$PORT" run demo_pantalla.py`. |
| Guest network | Some guest networks isolate devices. Use a network where the computer can reach the board. |

## Security

The board's API is plain HTTP on your LAN, protected by the token. Keep the panel on localhost, don't forward ports on your router, and never commit `.env.local` or `wifi_secrets.py` (both are ignored by Git).
