"use client";

import { useCallback, useEffect, useState } from "react";

import { displayLines } from "./display-text";

type DeviceState = {
  configured: boolean;
  connected: boolean;
  led?: boolean;
  uptime?: number;
  ip?: string;
  display?: string;
  scene?: string;
  textSupported?: boolean;
  message?: string;
};

const initialState: DeviceState = {
  configured: false,
  connected: false,
  message: "Todavía no configuramos la conexión Wi-Fi del ESP32.",
};

function Icon({ name, size = 20 }: { name: "chip" | "wifi"; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "chip") return <svg {...common}><rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 9h6v6H9zM9 1v4m6-4v4m-6 14v4m6-4v4M1 9h4m14 0h4M1 15h4m14 0h4"/></svg>;
  return <svg {...common}><path d="M5 9a11 11 0 0 1 14 0M8 12a6.5 6.5 0 0 1 8 0m-5 3a2 2 0 0 1 2 0m-1 4h.01"/></svg>;

}

function formatUptime(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds)) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export default function Dashboard() {
  const [device, setDevice] = useState<DeviceState>(initialState);
  const [draft, setDraft] = useState("");
  const [textFeedback, setTextFeedback] = useState("");
  const lines = displayLines(draft);
  const [displayBusy, setDisplayBusy] = useState(false);
  const [restartBusy, setRestartBusy] = useState(false);
  const [lastCheck, setLastCheck] = useState("Consultando el ESP32…");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/device", { cache: "no-store" });
      const state = (await response.json()) as DeviceState;
      setDevice(state);
      setLastCheck(new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()));
    } catch {
      setDevice({ ...initialState, message: "No se pudo consultar el panel local." });
      setLastCheck("Sin respuesta del panel");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function setDisplay(mode: "status" | "sunset" | "colors" | "animation" | "text" | "console" | "hacker" | "fatal" | "random") {
    if (!device.connected || displayBusy) return;
    setTextFeedback("");
    setDisplayBusy(true);
    try {
      const response = await fetch("/api/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display: mode, ...(mode === "text" ? { text: draft } : {}) }),
      });
      const result = (await response.json()) as DeviceState;
      if (!response.ok) throw new Error(result.message ?? "No se pudo cambiar la pantalla.");
      setDevice((current) => ({ ...current, ...result }));
      if (mode === "text") setTextFeedback("Mensaje enviado a la pantalla.");
      await refresh();
    } catch (error) {
      if (mode === "text") setTextFeedback(error instanceof Error ? error.message : "Error de conexión.");
      setDevice((current) => ({ ...current, message: error instanceof Error ? error.message : "Error de conexión." }));
    } finally {
      setDisplayBusy(false);
    }
  }

  async function restartDevice() {
    if (!device.connected || restartBusy || !window.confirm("¿Reiniciar el ESP32? La pantalla se volverá a inicializar y la placa volverá a conectarse al Wi-Fi.")) return;
    setRestartBusy(true);
    try {
      const response = await fetch("/api/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restart" }),
      });
      const result = (await response.json()) as DeviceState;
      if (!response.ok) throw new Error(result.message ?? "No se pudo reiniciar la placa.");
      setDevice((current) => ({ ...current, connected: false, message: result.message }));
      window.setTimeout(() => void refresh(), 2500);
    } catch (error) {
      setDevice((current) => ({ ...current, message: error instanceof Error ? error.message : "Error al reiniciar." }));
    } finally {
      window.setTimeout(() => setRestartBusy(false), 2500);
    }
  }

  const online = device.connected;

  const modes = [
    ["status", "Estado e IP"],
    ["sunset", "Atardecer"],
    ["colors", "Colores"],
    ["animation", "Animación"],
    ["console", "Consola"],
    ["hacker", "Terminal hacker"],
    ["fatal", "Error fatal"],
    ["random", "Aleatorio"],
  ] as const;
  const labelOf = (mode?: string) => modes.find(([key]) => key === mode)?.[1];
  const previewMode = device.display === "random" ? device.scene : device.display;
  const currentMode = device.display === "text"
    ? "Texto personalizado"
    : device.display === "random"
      ? `Aleatorio${labelOf(device.scene) ? ` · ${labelOf(device.scene)}` : ""}`
      : labelOf(device.display);

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <span className="brand"><Icon name="chip" size={18} /> Fieldnotes <span>/ ESP32</span></span>
          <span className="network"><Icon name="wifi" size={16} /> Red local</span>
        </div>
      </header>
      <main className="container dashboard">
        <h1>Panel de control</h1>
        <section className="metrics" aria-label="Estado de la placa">
          <article className="card metric">
            <h2>Conexión</h2>
            <strong className="connection"><span className="dot" data-online={online} />
              {online ? "Conectado" : "Desconectado"}
            </strong>
            <p>{device.message}</p>
            <small>Última consulta · {lastCheck}</small>
          </article>
          <article className="card metric">
            <h2>IP local</h2>
            <strong className="mono">{online && device.ip ? device.ip : "—"}</strong>
            <p>ESP-WROOM-32 · MicroPython</p>
          </article>
          <article className="card metric">
            <h2>Tiempo activa</h2>
            <strong>{formatUptime(device.uptime)}</strong>
            <button className="control restart" disabled={!online || restartBusy}
              onClick={() => void restartDevice()}>
              {restartBusy ? "Reiniciando…" : "Reiniciar placa"}
            </button>
          </article>
        </section>
        <section className="controls" aria-label="Controles de pantalla">
          <article className="card panel">
            <h2>Escenas de pantalla</h2>
            <p className="mono">ST7735 · 128 × 128</p>
            <div className="scene-preview" data-mode={online ? previewMode : undefined}
              role="img" aria-label={currentMode && online ? `Vista previa: ${currentMode}` : "Pantalla en espera"}>
              {online && previewMode === "animation" && <span className="preview-orb" />}
              {online && previewMode === "status" && <span>ESP32 ONLINE<br />{device.ip}</span>}
              {online && previewMode === "console" && <span className="preview-console">{">>> import main\nwifi: connected\napi: :80\n>>> _"}</span>}
              {online && previewMode === "hacker" && <span className="preview-console">{"$ ssh root@node-7\nACCESS GRANTED\n3F9A 4B1C D29E\nDECR[######] 60%"}</span>}
              {online && previewMode === "fatal" && <span className="preview-fatal">FATAL<br />ERROR</span>}
              {online && device.display === "text" && <span>TEXTO ACTIVO</span>}
              {(!online || !currentMode) && <span>EN ESPERA</span>}
            </div>
            <div className="mode-status">
              <span>Modo actual</span>
              <strong>{online ? currentMode ?? "Sin informar" : "—"}</strong>
            </div>
            <div className="display-modes" role="group" aria-label="Modos de pantalla">
              {modes.map(([mode, label]) => (
                <button key={mode} className="control" disabled={!online || displayBusy}
                  onClick={() => void setDisplay(mode)} aria-pressed={device.display === mode}>
                  {label}
                </button>
              ))}
            </div>
          </article>
          <article className="card panel">
            <form className="display-text-form" onSubmit={(event) => {
                event.preventDefault();
                if (lines && device.textSupported) void setDisplay("text");
              }}>
                <label htmlFor="screen-text">Texto personalizado</label>
                <input id="screen-text" value={draft} maxLength={30} placeholder="VOLVÉ EN 5 MIN"
                  onChange={(event) => { setDraft(event.target.value); setTextFeedback(""); }}
                  aria-describedby="screen-text-help" />
                <small id="screen-text-help">Hasta 30 caracteres. Letras, números y . ! ? : -</small>
                <div className="display-text-preview" aria-label="Vista previa del texto">
                  {lines ? lines.map((line, index) => <div key={index}>{line}</div>) : "VISTA PREVIA"}
                </div>
                <button className="primary-button" disabled={!online || !device.textSupported || !lines || displayBusy}>
                  Mostrar en pantalla
                </button>
                {online && !device.textSupported && <small>Actualizá los dos archivos de la placa para habilitar el texto.</small>}
                <small role="status">{textFeedback}</small>
            </form>
          </article>
        </section>
      </main>
    </>
  );
}
