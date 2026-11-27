# Panel design

How the control panel looks and why. Read this before changing the interface.

## What the screen is for

The panel is opened for a short look: see that the board answers, change what its screen shows, close the tab.

- **Its one question:** what is the board's screen showing, and does the board answer?
- **Its main job:** choose a scene, adjust it if it has settings, show it.
- **Other jobs:** switch boards, restart a board.

## Look

Dark, quiet and slightly tinted, after [minimalar.com](https://minimalar.com), set in **Geist** (text) and **Geist Mono** (anything the board reports: IP, uptime, times).

- A near-black ground with a faint green tint, surfaces one or two steps lighter.
- Lines are translucent white (7% and 12%), never solid greys.
- Soft corners: 14px on cards, 10px on rows and fields, pills for the main button and status.
- One accent, green (`#34d399`), for the main action, the selection and "online". Every scene also has its own hue, taken from what it shows (the weather teal, the console green, the fatal red). It appears only as a 3px edge on its row.
- Small uppercase labels with a dot name the two areas of the page, as minimalar does. Nothing else is uppercase.

## Layout

1. **Top bar:** product mark and name, then the boards as a segmented control with a status dot each.
2. **Title row:** the board's name as the `h1` with a status pill. Under it, in mono: IP · time active · last check. *Reiniciar* is a quiet button on the right.
3. **Two columns** (desktop):
   - **Left, the stage (sticky):** a large replica of the selected scene, its settings right under it, and one green *Mostrar en pantalla* button. When the selected scene is already on the screen and nothing changed, the button reads *En pantalla*.
   - **Right, the scenes:** one row per scene: thumbnail, name, one line on what it shows, and an *En pantalla* tag on the current one. Clicking a row selects it; it does not send anything.
4. **Settings live in their scene.** *Clima* has the city. *Texto* is a scene and has the message. The replica updates as you type, so you see the result before sending it.

On a phone the stage comes first and the scene list follows. Once you pick a scene, the page scrolls back to the stage.

The replica ([screen-preview.tsx](src/components/screen-preview.tsx)) is an SVG at 128 × 128 using the firmware's own colours and coordinates.

## Tokens

```css
--ink: #0a0e0d;        --ink-raised: #101614;
--surface: #141b18;    --surface-2: #1b2320;   --surface-3: #232d29;
--line: rgb(255 255 255 / 7%);   --line-strong: rgb(255 255 255 / 12%);
--text: #f4f7f5;       --text-dim: #a6b2ac;    --text-muted: #7d8983;
--accent: #34d399;     --accent-soft: rgb(52 211 153 / 14%);
--danger: #f43f5e;
--radius-md: 14px;     --radius-sm: 10px;      --radius-pill: 999px;
```

`--text-muted` is lifted from minimalar's `#657069` so that small text reaches 4.5:1.

## States

| State | What shows |
|---|---|
| Connected | Green dot and pill, live replica, scenes and button enabled |
| Sending | The button reads *Enviando…* and the other controls wait |
| No answer | Red dot, *Sin conexión*, the server's reason in one line, the replica reads *SIN SEÑAL* |
| Invalid text | The field turns red and names the characters the screen cannot draw |
