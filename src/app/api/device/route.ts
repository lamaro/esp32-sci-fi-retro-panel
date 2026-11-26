import { displayLines } from "@/components/display-text";
import { NextRequest } from "next/server";

type DeviceReply = { online?: unknown; led?: unknown; uptime?: unknown; ip?: unknown; display?: unknown; scene?: unknown; textSupported?: unknown; weatherCity?: unknown };
type GeoResult = { name?: unknown; latitude?: unknown; longitude?: unknown; admin1?: unknown; country?: unknown };

const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Busca la ciudad con el geocodificador público de Open-Meteo (sin clave).
// Acepta "Ciudad" o "Ciudad, provincia o país" para desambiguar.
async function geocode(query: string) {
  const [name, ...rest] = query.split(",").map((part) => part.trim());
  const hint = plain(rest.join(" ")).toLowerCase();
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({ name, count: "10", language: "es", format: "json" }).toString();
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const data = (await response.json()) as { results?: GeoResult[] };
    const results = (data.results ?? []).filter((r) => typeof r.name === "string" && typeof r.latitude === "number" && typeof r.longitude === "number");
    const match = results.find((r) => !hint || plain(`${r.admin1 ?? ""} ${r.country ?? ""}`).toLowerCase().includes(hint));
    if (!match) return null;
    const label = [match.name, match.admin1, match.country].filter((part) => typeof part === "string" && part).join(", ");
    const screenName = plain(match.name as string).toUpperCase().replace(/[^A-Z0-9 .'-]/g, "").trim().slice(0, 20);
    if (!screenName) return null;
    return { label, city: { name: screenName, lat: match.latitude as number, lon: match.longitude as number } };
  } catch {
    return null;
  }
}

function json(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

function isPrivateIpv4(hostname: string) {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = octets;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function getDeviceConfig() {
  const rawUrl = process.env.ESP32_BASE_URL;
  const token = process.env.ESP32_API_TOKEN;
  if (!rawUrl || !token) return null;

  try {
    const url = new URL(rawUrl);
    const localHost = isPrivateIpv4(url.hostname) || url.hostname.toLowerCase().endsWith(".local");
    if (url.protocol !== "http:" || !localHost || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) return null;
    return { baseUrl: url.origin, token };
  } catch {
    return null;
  }
}

async function callDevice(path: "/api/status" | "/api/led" | "/api/restart" | "/api/display", init?: RequestInit) {
  const config = getDeviceConfig();
  if (!config) return null;

  try {
    return await fetch(`${config.baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(2500),
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  // Use request-time data so the response isn't frozen at build time.
  request.headers.get("host");
  if (!getDeviceConfig()) return json({ configured: false, connected: false, message: "Falta configurar la dirección local y el token del ESP32." });

  const response = await callDevice("/api/status");
  if (!response?.ok) return json({ configured: true, connected: false, message: "ESP32 no disponible. Revisá que esté conectado al Wi-Fi local." });

  const data = (await response.json().catch(() => null)) as DeviceReply | null;
  if (!data || typeof data !== "object") return json({ configured: true, connected: false, message: "El ESP32 devolvió una respuesta que no pudimos leer." });

  return json({
    configured: true,
    textSupported: data.textSupported === true,
    connected: data.online !== false,
    ...(typeof data.led === "boolean" ? { led: data.led } : {}),
    ...(typeof data.uptime === "number" ? { uptime: data.uptime } : {}),
    ...(typeof data.ip === "string" ? { ip: data.ip } : {}),
    ...(typeof data.display === "string" ? { display: data.display } : {}),
    ...(typeof data.scene === "string" ? { scene: data.scene } : {}),
    ...(typeof data.weatherCity === "string" ? { weatherCity: data.weatherCity } : {}),
    message: data.online === false ? "El ESP32 informa que está desconectado." : "ESP32 disponible en la red local.",
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  let sameOrigin = false;
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
      const sameHost = originUrl.hostname === requestUrl.hostname
        || (loopbackHosts.has(originUrl.hostname) && loopbackHosts.has(requestUrl.hostname));
      sameOrigin = originUrl.protocol === requestUrl.protocol
        && originUrl.port === requestUrl.port
        && sameHost
        && originUrl.username === ""
        && originUrl.password === "";
    } catch {
      sameOrigin = false;
    }
  }
  if (!sameOrigin) return json({ configured: false, connected: false, message: "Solicitud de origen no permitido." }, 403);

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ configured: false, connected: false, message: "La instrucción no es válida." }, 400);
  }
  if (!getDeviceConfig()) return json({ configured: false, connected: false, message: "Primero configuraremos la conexión local del ESP32." }, 503);

  if ("action" in body && body.action === "restart") {
    const response = await callDevice("/api/restart", { method: "POST" });
    if (!response?.ok) return json({ configured: true, connected: false, message: "No se pudo reiniciar el ESP32." }, 502);
    return json({ configured: true, connected: true, message: "Reinicio solicitado. La placa volverá a conectarse en unos segundos." });
  }

  if ("display" in body) {
    const modes = ["status", "sunset", "colors", "animation", "text", "console", "hacker", "fatal", "weather", "random"] as const;
    if (typeof body.display !== "string" || !modes.includes(body.display as (typeof modes)[number])) {
      return json({ configured: false, connected: false, message: "Elegí un modo de pantalla válido." }, 400);
    }
    const text = "text" in body ? body.text : undefined;
    const lines = body.display === "text" && typeof text === "string"
      ? displayLines(text) : null;
    if (body.display === "text" && !lines) {
      return json({ message: "Escribí hasta 30 caracteres válidos." }, 400);
    }
    const cityQuery = body.display === "weather" && "city" in body ? body.city : undefined;
    let place: Awaited<ReturnType<typeof geocode>> = null;
    if (cityQuery !== undefined) {
      if (typeof cityQuery !== "string" || !cityQuery.trim() || cityQuery.length > 60) {
        return json({ message: "Escribí el nombre de una ciudad." }, 400);
      }
      place = await geocode(cityQuery);
      if (!place) return json({ message: `No encontramos "${cityQuery.trim()}". Probá con "Ciudad, país".` }, 404);
    }
    const response = await callDevice("/api/display", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: body.display, ...(lines ? { text: lines.join("\n") } : {}), ...(place ? { city: place.city } : {}) }),
    });
    if (!response?.ok) return json({ configured: true, connected: false, message: "No se pudo enviar el modo a la pantalla." }, 502);
    return json({
      configured: true, connected: true, display: body.display,
      ...(place ? { weatherCity: place.city.name } : {}),
      message: place ? `Clima de ${place.label}.` : "Modo enviado a la pantalla.",
    });
  }

  if (!("led" in body) || typeof body.led !== "boolean") {
    return json({ configured: false, connected: false, message: "La instrucción debe incluir led: true o led: false." }, 400);
  }

  const response = await callDevice("/api/led", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ on: body.led }),
  });
  if (!response?.ok) return json({ configured: true, connected: false, message: "No se pudo enviar el comando al ESP32." }, 502);

  const data = (await response.json().catch(() => null)) as DeviceReply | null;
  return json({ configured: true, connected: true, led: typeof data?.led === "boolean" ? data.led : body.led, message: "Comando enviado." });
}
