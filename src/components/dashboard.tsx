"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { displayLines } from "./display-text";
import { ScreenPreview, type PreviewMode, type SceneId, type WeatherData } from "./screen-preview";

type Board = { id: string; name: string };
type Choice = SceneId | "text";

type DeviceState = {
  configured: boolean;
  connected: boolean;
  uptime?: number;
  ip?: string;
  display?: string;
  scene?: string;
  textSupported?: boolean;
  weatherCity?: string;
  weather?: WeatherData;
  devices?: Board[];
  device?: string;
  message?: string;
};

const initialState: DeviceState = { configured: true, connected: false, message: "Consultando la placa…" };

// hue: el color propio de cada escena, tomado de lo que muestra.
const SCENES: { id: Choice; label: string; about: string; hue: string }[] = [
  { id: "weather", label: "Clima", about: "Clima actual de una ciudad", hue: "#0aa0a8" },
  { id: "text", label: "Texto", about: "Tu mensaje, en dos líneas", hue: "#f4f7f5" },
  { id: "status", label: "Estado e IP", about: "Wi-Fi y dirección de la placa", hue: "#2eae62" },
  { id: "console", label: "Consola", about: "Arranque de MicroPython", hue: "#3dfc35" },
  { id: "hacker", label: "Terminal hacker", about: "Una intrusión de película", hue: "#22c55e" },
  { id: "sunset", label: "Atardecer", about: "Sol sobre el agua, en píxeles", hue: "#ffd069" },
  { id: "animation", label: "Animación", about: "Una pelota que rebota", hue: "#63e4e9" },
  { id: "colors", label: "Colores", about: "Prueba de color RGB565", hue: "#f957a7" },
  { id: "fatal", label: "Error fatal", about: "Pantalla roja que parpadea", hue: "#e00000" },
  { id: "random", label: "Aleatorio", about: "Cambia de escena sola", hue: "#a6b2ac" },
];

const sceneOf = (id?: string) => SCENES.find((scene) => scene.id === id);

function formatUptime(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds)) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days} d ${hours} h`;
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
}

const clock = () => new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date());
const titleCase = (value: string) => value.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase());

function Mark() {
  // La pantalla de la consola: barra de título, una línea y un cursor.
  return (
    <span className="mark" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 18 18" shapeRendering="crispEdges">
        <rect x="2" y="3" width="14" height="3" fill="currentColor" />
        <rect x="2" y="9" width="8" height="2" fill="currentColor" opacity=".55" />
        <rect x="2" y="13" width="3" height="3" fill="currentColor" />
      </svg>
    </span>
  );
}

export default function Dashboard() {
  const [device, setDevice] = useState<DeviceState>(initialState);
  const [devices, setDevices] = useState<Board[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [others, setOthers] = useState<Record<string, boolean>>({});
  const [lastCheck, setLastCheck] = useState("—");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [sending, setSending] = useState(false);
  const [restartBusy, setRestartBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [cityDraft, setCityDraft] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const stageRef = useRef<HTMLElement>(null);

  const lines = displayLines(draft);
  const draftInvalid = draft.trim() !== "" && !lines;
  // Caracteres que la fuente de la placa no tiene (los acentos se quitan solos).
  const badChars = [...new Set(draft.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[A-Z0-9 .!?:-]/g, ""))].join(" ");

  useEffect(() => {
    try { setSelectedBoard(window.localStorage.getItem("esp32-device")); } catch { /* sin almacenamiento */ }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const query = selectedBoard ? `?device=${encodeURIComponent(selectedBoard)}` : "";
      const response = await fetch(`/api/device${query}`, { cache: "no-store" });
      const state = (await response.json()) as DeviceState;
      if (selectedBoard && state.device && state.device !== selectedBoard) setSelectedBoard(state.device);
      if (state.devices) setDevices(state.devices);
      setDevice(state);
      setLastCheck(clock());
    } catch {
      setDevice((current) => ({ ...current, connected: false, message: "El panel local no responde. ¿Sigue corriendo npm run dev?" }));
    }
  }, [selectedBoard]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // La primera vez que la placa responde, el escenario arranca en lo que está mostrando.
  useEffect(() => {
    if (choice === null && device.connected && device.display) {
      setChoice(sceneOf(device.display) ? (device.display as Choice) : "status");
    }
  }, [choice, device.connected, device.display]);

  // Estado de las otras placas, para el punto de cada pestaña.
  const current = device.device;
  useEffect(() => {
    const rest = devices.filter((board) => board.id !== current);
    if (!rest.length) return;
    let alive = true;
    const check = async () => {
      const results = await Promise.all(rest.map(async (board) => {
        try {
          const response = await fetch(`/api/device?device=${encodeURIComponent(board.id)}`, { cache: "no-store" });
          return [board.id, ((await response.json()) as DeviceState).connected] as const;
        } catch {
          return [board.id, false] as const;
        }
      }));
      if (alive) setOthers((prev) => ({ ...prev, ...Object.fromEntries(results) }));
    };
    void check();
    const timer = window.setInterval(() => void check(), 15000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [devices, current]);

  function chooseBoard(id: string) {
    if (id === device.device) return;
    try { window.localStorage.setItem("esp32-device", id); } catch { /* sin almacenamiento */ }
    setSelectedBoard(id);
    setDevice({ ...initialState, devices, device: id });
    setChoice(null);
    setLastCheck("—");
    setFeedback(null);
  }

  function pickScene(id: Choice) {
    setChoice(id);
    setFeedback(null);
    // En el celular el escenario queda arriba de la lista: volver a él.
    if (window.matchMedia("(max-width: 900px)").matches) {
      stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const online = device.connected;
  const boardName = devices.find((board) => board.id === device.device)?.name ?? "ESP32";
  const selected: Choice = choice ?? "status";
  const selectedScene = sceneOf(selected)!;
  const onScreenNow = online && device.display === selected;
  const city = device.weatherCity ? titleCase(device.weatherCity) : undefined;
  const changed = (selected === "weather" && cityDraft.trim() !== "") || selected === "text";
  const ready = selected !== "text" || (lines !== null && device.textSupported === true);
  const buttonIsDone = onScreenNow && !changed;

  async function show() {
    if (!online || sending || !ready || buttonIsDone) return;
    setSending(true);
    setFeedback(null);
    const body: Record<string, string | undefined> = { device: device.device, display: selected };
    if (selected === "text") body.text = draft;
    if (selected === "weather" && cityDraft.trim()) body.city = cityDraft.trim();
    try {
      const response = await fetch("/api/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as DeviceState;
      if (!response.ok) throw new Error(result.message ?? "La placa no aceptó el cambio.");
      setDevice((state) => ({ ...state, ...result, connected: true }));
      if (body.city) { setCityDraft(""); setFeedback({ ok: true, text: result.message ?? "Listo." }); }
      await refresh();
    } catch (error) {
      setFeedback({ ok: false, text: error instanceof Error ? error.message : "Error de conexión." });
    } finally {
      setSending(false);
    }
  }

  async function restart() {
    if (!online || restartBusy || !window.confirm(`¿Reiniciar ${boardName}? La pantalla se apaga unos segundos y la placa vuelve a conectarse al Wi-Fi.`)) return;
    setRestartBusy(true);
    try {
      const response = await fetch("/api/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device: device.device, action: "restart" }),
      });
      const result = (await response.json()) as DeviceState;
      if (!response.ok) throw new Error(result.message ?? "No se pudo reiniciar la placa.");
      setDevice((state) => ({ ...state, connected: false, message: "Reiniciando… vuelve en unos segundos." }));
    } catch (error) {
      setDevice((state) => ({ ...state, message: (error as Error).message }));
    } finally {
      window.setTimeout(() => { setRestartBusy(false); void refresh(); }, 6000);
    }
  }

  // Lo que dibuja el escenario: la escena elegida, con los ajustes que se están escribiendo.
  const stageMode: PreviewMode = !online ? "offline" : selected;
  const typingCity = selected === "weather" && cityDraft.trim() !== "";
  const stageCity = typingCity ? cityDraft.trim().toUpperCase() : device.weatherCity;
  const stageWeather = typingCity ? null : device.weather;
  const nowLabel = device.display === "random"
    ? `Aleatorio · ${sceneOf(device.scene)?.label ?? "—"}`
    : sceneOf(device.display)?.label ?? "—";

  return (
    <div className="app">
      <header className="topbar">
        <div className="wrap topbar-inner">
          <span className="brand"><Mark /> ESP32 Sci-Fi</span>
          {devices.length > 1 && (
            <nav className="boards" aria-label="Placas">
              {devices.map((board) => {
                const isCurrent = board.id === device.device;
                const up = isCurrent ? online : others[board.id];
                return (
                  <button key={board.id} type="button" className="board-tab" aria-current={isCurrent ? "page" : undefined}
                    onClick={() => chooseBoard(board.id)}>
                    <span className="dot" data-up={up === undefined ? undefined : String(up)} aria-hidden="true" />
                    {board.name}
                    <span className="sr-only">{up === undefined ? "" : up ? " (conectada)" : " (sin conexión)"}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </header>

      <main className="wrap">
        <div className="title-row">
          <div>
            <div className="title-line">
              <h1>{boardName}</h1>
              <span className="pill" data-up={String(online)}>
                <span className="dot" data-up={String(online)} aria-hidden="true" />
                {online ? "Conectada" : restartBusy ? "Reiniciando" : "Sin conexión"}
              </span>
            </div>
            <p className="meta">
              <span className="mono">{online && device.ip ? device.ip : "—"}</span>
              <span className="sep" aria-hidden="true">·</span>
              <span>activa <span className="mono">{online ? formatUptime(device.uptime) : "—"}</span></span>
              <span className="sep" aria-hidden="true">·</span>
              <span>consultada <span className="mono">{lastCheck}</span></span>
            </p>
            {!online && <p className="notice" role="status">{device.message}</p>}
          </div>
          <button type="button" className="ghost" disabled={!online || restartBusy} onClick={() => void restart()}>
            {restartBusy ? "Reiniciando…" : "Reiniciar"}
          </button>
        </div>

        <div className="layout">
          <section className="stage" ref={stageRef} aria-labelledby="stage-title">
            <div className="stage-head">
              <h2 id="stage-title">{selectedScene.label}</h2>
              <span className={onScreenNow ? "tag on" : "tag"}>{onScreenNow ? "En pantalla" : online ? `Ahora: ${nowLabel}` : "Sin señal"}</span>
            </div>

            <div className="screen-well">
              <ScreenPreview mode={stageMode} ip={device.ip} city={stageCity} weather={stageWeather}
                lines={lines ?? undefined} size={256} animate
                label={online ? `Vista de la escena ${selectedScene.label}` : "La placa no responde"} />
            </div>

            <form className="settings" onSubmit={(event) => { event.preventDefault(); void show(); }}>
              {selected === "weather" && (
                <div className="field">
                  <label htmlFor="weather-city">Ciudad</label>
                  <input id="weather-city" value={cityDraft} maxLength={60} autoComplete="off"
                    placeholder={city ?? "Buenos Aires"} aria-describedby="weather-city-help"
                    onChange={(event) => { setCityDraft(event.target.value); setFeedback(null); }} />
                  <p id="weather-city-help" className="help">
                    Ahora muestra {city ?? "—"}. Sumá el país si hay varias con el mismo nombre. Datos de Open-Meteo, cada 15 min mientras se ve el clima.
                  </p>
                </div>
              )}
              {selected === "text" && (
                <div className="field">
                  <label htmlFor="screen-text">Mensaje</label>
                  <input id="screen-text" value={draft} maxLength={30} autoComplete="off" spellCheck={false}
                    placeholder="Volvé en 5 min" aria-invalid={draftInvalid || undefined} aria-describedby="screen-text-help"
                    onChange={(event) => { setDraft(event.target.value); setFeedback(null); }} />
                  <p id="screen-text-help" className={draftInvalid ? "help error" : "help"}>
                    <span>{draftInvalid ? `La pantalla no tiene: ${badChars || "?"}. Usá letras, números y . ! ? : -` : "Hasta 30 caracteres, en dos líneas de 15."}</span>
                    <span className="mono count">{draft.length}/30</span>
                  </p>
                </div>
              )}
              {selected !== "weather" && selected !== "text" && <p className="help">{selectedScene.about}. Esta escena no tiene ajustes.</p>}

              <div className="actions">
                <button className="primary" disabled={!online || sending || !ready || buttonIsDone}>
                  {sending ? "Enviando…" : buttonIsDone ? "En pantalla" : "Mostrar en pantalla"}
                </button>
                {feedback && <span className={feedback.ok ? "feedback" : "feedback error"} role="status">{feedback.text}</span>}
              </div>
            </form>
          </section>

          <section className="scenes" aria-labelledby="scenes-title">
            <h2 className="eyebrow" id="scenes-title"><span className="dot" data-up="true" aria-hidden="true" />Escenas</h2>
            <ul className="scene-list">
              {SCENES.map((scene) => {
                const isOn = online && device.display === scene.id;
                return (
                  <li key={scene.id}>
                    <button type="button" className="scene-row" aria-pressed={scene.id === selected}
                      style={{ "--hue": scene.hue } as React.CSSProperties} onClick={() => pickScene(scene.id)}>
                      <ScreenPreview mode={scene.id} ip={device.ip} city={device.weatherCity} weather={device.weather}
                        lines={scene.id === "text" ? lines ?? ["HOLA"] : undefined} size={48} />
                      <span className="scene-text">
                        <span className="scene-name">{scene.label}</span>
                        <span className="scene-about">{scene.about}</span>
                      </span>
                      {isOn && <span className="tag on">En pantalla</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </main>

      <footer className="footer">
        <div className="wrap footer-inner">
          <a href="https://rolonerdea.com" target="_blank" rel="noreferrer" className="byline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rolo-nerdea.svg" width={24} height={24} alt="" />
            By Rolo Nerdea
          </a>
        </div>
      </footer>
    </div>
  );
}
