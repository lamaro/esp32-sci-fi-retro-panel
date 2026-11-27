import { displayLines } from "@/components/display-text";
import { NextRequest } from "next/server";

type DeviceReply = { online?: unknown; led?: unknown; uptime?: unknown; ip?: unknown; display?: unknown; scene?: unknown; textSupported?: unknown; weatherCity?: unknown; weather?: unknown };
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

type Device = { id: string; name: string; baseUrl: string };

// Acepta una IP privada o un nombre .local, con o sin http://, sin rutas.
function localOrigin(raw: string) {
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
    const localHost = isPrivateIpv4(url.hostname) || url.hostname.toLowerCase().endsWith(".local");
    if (url.protocol !== "http:" || !localHost || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function slug(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "placa";
}

// ESP32_DEVICES="Consola=192.168.1.50,Holo=192.168.1.51" (nombre=IP, separadas por comas).
// Si no está, usa ESP32_BASE_URL como una sola placa. Todas comparten ESP32_API_TOKEN.
function getDevices(): Device[] {
  const devices: Device[] = [];
  const list = process.env.ESP32_DEVICES?.trim();
  const entries = list
    ? list.split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
        const at = entry.indexOf("=");
        return at > 0 ? [entry.slice(0, at).trim(), entry.slice(at + 1).trim()] : [entry, entry];
      })
    : process.env.ESP32_BASE_URL ? [["ESP32", process.env.ESP32_BASE_URL.trim()]] : [];
  for (const [name, address] of entries) {
    const baseUrl = localOrigin(address);
    if (!baseUrl || !name) continue;
    let id = slug(name);
    for (let n = 2; devices.some((device) => device.id === id); n++) id = `${slug(name)}-${n}`;
    devices.push({ id, name: name.slice(0, 40), baseUrl });
  }
  return devices;
}

function getConfig(deviceId?: string | null) {
  const token = process.env.ESP32_API_TOKEN;
  const devices = getDevices();
  if (!token || devices.length === 0) return null;
  const device = devices.find((d) => d.id === deviceId) ?? devices[0];
  return { token, device, devices: devices.map(({ id, name }) => ({ id, name })) };
}

type Config = NonNullable<ReturnType<typeof getConfig>>;

async function callDevice(config: Config, path: "/api/status" | "/api/led" | "/api/restart" | "/api/display", init?: RequestInit) {
  try {
    return await fetch(`${config.device.baseUrl}${path}`, {
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
  const config = getConfig(request.nextUrl.searchParams.get("device"));
  if (!config) return json({ configured: false, connected: false, devices: [], message: "Falta configurar las placas (ESP32_DEVICES) y el token del ESP32." });
  const which = { devices: config.devices, device: config.device.id };

  const response = await callDevice(config, "/api/status");
  if (!response?.ok) return json({ ...which, configured: true, connected: false, message: `${config.device.name} no está disponible. Revisá que esté conectada al Wi-Fi local.` });

  const data = (await response.json().catch(() => null)) as DeviceReply | null;
  if (!data || typeof data !== "object") return json({ ...which, configured: true, connected: false, message: "La placa devolvió una respuesta que no pudimos leer." });

  return json({
    ...which,
    configured: true,
    textSupported: data.textSupported === true,
    connected: data.online !== false,
    ...(typeof data.led === "boolean" ? { led: data.led } : {}),
    ...(typeof data.uptime === "number" ? { uptime: data.uptime } : {}),
    ...(typeof data.ip === "string" ? { ip: data.ip } : {}),
    ...(typeof data.display === "string" ? { display: data.display } : {}),
    ...(typeof data.scene === "string" ? { scene: data.scene } : {}),
    ...(typeof data.weatherCity === "string" ? { weatherCity: data.weatherCity } : {}),
    ...(readWeather(data.weather) ? { weather: readWeather(data.weather) } : {}),
    message: data.online === false ? `${config.device.name} informa que está desconectada.` : `${config.device.name} disponible en la red local.`,
  });
}

// Último dato de clima que tiene la placa (firmware con "weather" en /api/status).
function readWeather(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const temp = num(w.temp);
  if (temp === null) return null;
  return {
    temp, feels: num(w.feels), hum: num(w.hum), code: num(w.code) ?? 0, day: w.day !== false,
    max: num(w.max), min: num(w.min), rain: num(w.rain),
    time: typeof w.time === "string" ? w.time.slice(0, 5) : "",
    // Pronóstico: [día de la semana, día del mes, código, máx, mín, lluvia] por día.
    days: Array.isArray(w.days)
      ? w.days.slice(0, 3).flatMap((d) => Array.isArray(d) && typeof d[0] === "string" && num(d[3]) !== null
        ? [{ weekday: String(d[0]).slice(0, 3), date: num(d[1]) ?? 0, code: num(d[2]) ?? 0, max: num(d[3])!, min: num(d[4]), rain: num(d[5]) }]
        : [])
      : [],
  };
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
  const config = getConfig("device" in body && typeof body.device === "string" ? body.device : null);
  if (!config) return json({ configured: false, connected: false, message: "Primero configurá las placas y el token en .env.local." }, 503);
  if ("device" in body && body.device !== config.device.id) return json({ message: "Esa placa no está en la lista." }, 404);

  if ("action" in body && body.action === "restart") {
    const response = await callDevice(config, "/api/restart", { method: "POST" });
    if (!response?.ok) return json({ configured: true, connected: false, message: "No se pudo reiniciar el ESP32." }, 502);
    return json({ configured: true, connected: true, message: "Reinicio solicitado. La placa volverá a conectarse en unos segundos." });
  }

  if ("display" in body) {
    const modes = ["status", "sunset", "colors", "animation", "text", "console", "hacker", "fatal", "weather", "forecast", "random"] as const;
    if (typeof body.display !== "string" || !modes.includes(body.display as (typeof modes)[number])) {
      return json({ configured: false, connected: false, message: "Elegí un modo de pantalla válido." }, 400);
    }
    const text = "text" in body ? body.text : undefined;
    const lines = body.display === "text" && typeof text === "string"
      ? displayLines(text) : null;
    if (body.display === "text" && !lines) {
      return json({ message: "Escribí hasta 30 caracteres válidos." }, 400);
    }
    const cityQuery = (body.display === "weather" || body.display === "forecast") && "city" in body ? body.city : undefined;
    let place: Awaited<ReturnType<typeof geocode>> = null;
    if (cityQuery !== undefined) {
      if (typeof cityQuery !== "string" || !cityQuery.trim() || cityQuery.length > 60) {
        return json({ message: "Escribí el nombre de una ciudad." }, 400);
      }
      place = await geocode(cityQuery);
      if (!place) return json({ message: `No encontramos "${cityQuery.trim()}". Probá con "Ciudad, país".` }, 404);
    }
    const response = await callDevice(config, "/api/display", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: body.display, ...(lines ? { text: lines.join("\n") } : {}), ...(place ? { city: place.city } : {}) }),
    });
    if (!response?.ok) return json({ configured: true, connected: false, message: "No se pudo enviar el modo a la pantalla." }, 502);
    return json({
      configured: true, connected: true, display: body.display,
      ...(place ? { weatherCity: place.city.name } : {}),
      message: place ? `${body.display === "forecast" ? "Pronóstico" : "Clima"} de ${place.label}.` : "Modo enviado a la pantalla.",
    });
  }

  if (!("led" in body) || typeof body.led !== "boolean") {
    return json({ configured: false, connected: false, message: "La instrucción debe incluir led: true o led: false." }, 400);
  }

  const response = await callDevice(config, "/api/led", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ on: body.led }),
  });
  if (!response?.ok) return json({ configured: true, connected: false, message: "No se pudo enviar el comando al ESP32." }, 502);

  const data = (await response.json().catch(() => null)) as DeviceReply | null;
  return json({ configured: true, connected: true, led: typeof data?.led === "boolean" ? data.led : body.led, message: "Comando enviado." });
}
