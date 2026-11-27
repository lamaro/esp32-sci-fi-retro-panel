// Réplica en SVG de la pantalla ST7735 de 128 × 128. Las coordenadas siguen a
// display_ui.py; los colores son los que se ven en la pantalla real.

export type SceneId =
  | "status" | "sunset" | "colors" | "animation" | "console"
  | "hacker" | "fatal" | "weather" | "forecast" | "random";

export type PreviewMode = SceneId | "text" | "offline" | "idle";

const C = {
  navy: "#10182a", blue: "#24306b", purple: "#473575", rose: "#a85974",
  teal: "#0aa0a8", green: "#2eae62", yellow: "#ffe26d", sun: "#ffd069",
  orange: "#ff7a00", pink: "#f957a7", cobalt: "#3b6cdc", violet: "#30295e",
  term: "#3dfc35", termBg: "#020802", red: "#e00000", white: "#ffffff",
  cyan: "#63e4e9", gray: "#8a8c92", dark: "#1a1f2e",
};

// Texto con la fuente del panel: escala 1 ≈ glifo de 5 × 7.
function T({ x, y, s = 1, fill = C.white, anchor, children }: {
  x: number; y: number; s?: number; fill?: string; anchor?: "middle" | "end"; children: React.ReactNode;
}) {
  return (
    <text x={x} y={y + 7 * s} fill={fill} fontSize={9.2 * s} textAnchor={anchor}
      fontFamily="var(--font-geist-mono), monospace" fontWeight={600} letterSpacing={-0.2 * s}>
      {children}
    </text>
  );
}

export type WeatherData = {
  temp: number; feels: number | null; hum: number | null; code: number; day: boolean;
  max: number | null; min: number | null; rain: number | null; time: string;
  days?: { weekday: string; date: number; code: number; max: number; min: number | null; rain: number | null }[];
};

// Ícono chico del pronóstico, como small_icon() en display_ui.py.
function SmallIcon({ code, cx, cy }: { code: number; cx: number; cy: number }) {
  const clear = code <= 1;
  const partly = code === 2;
  const fog = code === 45 || code === 48;
  const rain = (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
  const snow = (code >= 71 && code <= 77) || code === 85 || code === 86;
  const storm = code >= 95;
  if (clear) return <circle cx={cx} cy={cy} r="7" fill={C.yellow} />;
  if (fog) return <>{[20, 24, 18].map((w, i) => <rect key={i} x={cx - w / 2} y={cy - 6 + i * 5} width={w} height="2" fill={C.gray} />)}</>;
  const color = storm ? "#4a5060" : rain ? "#8a8c92" : partly ? C.white : "#c6c9d2";
  return <>
    {partly && <circle cx={cx + 4} cy={cy - 4} r="5" fill={C.yellow} />}
    <circle cx={cx - 6} cy={cy + 2} r="4" fill={color} />
    <circle cx={cx + 1} cy={cy - 1} r="6" fill={color} />
    <circle cx={cx + 7} cy={cy + 2} r="4" fill={color} />
    <rect x={cx - 10} y={cy + 2} width="21" height="5" fill={color} />
    {rain && [-6, 0, 6].map((x) => <rect key={x} x={cx + x} y={cy + 9} width="2" height="3" fill="#3d9fff" />)}
    {snow && [-6, 0, 6].map((x) => <rect key={x} x={cx + x - 1} y={cy + 10} width="3" height="1" fill={C.white} />)}
    {storm && <rect x={cx} y={cy + 8} width="3" height="6" fill={C.yellow} />}
  </>;
}

type SceneProps = { mode: PreviewMode; ip?: string; city?: string; lines?: string[]; weather?: WeatherData | null };

function Scene({ mode, ip, city, lines, weather }: SceneProps) {
  switch (mode) {
    case "status":
      return <>
        <rect width="128" height="128" fill={C.navy} />
        <rect width="128" height="5" fill={C.green} />
        <T x={10} y={15} s={1.45}>ESP32 ONLINE</T>
        <rect x="10" y="39" width="108" height="1" fill={C.teal} />
        <T x={10} y={52} s={1.45} fill={C.yellow}>WIFI OK</T>
        <T x={10} y={79}>IP LOCAL</T>
        <T x={10} y={94} fill={C.teal}>{ip || "0.0.0.0"}</T>
        <T x={10} y={113}>NEXTJS READY</T>
      </>;
    case "sunset":
      return <>
        <rect width="128" height="55" fill={C.navy} />
        <rect y="55" width="128" height="30" fill={C.purple} />
        <rect y="85" width="128" height="43" fill={C.violet} />
        {[[12, 10], [30, 24], [52, 8], [104, 14], [118, 34], [70, 30]].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="2" height="2" fill={C.white} />
        ))}
        <circle cx="91" cy="62" r="20" fill={C.sun} />
        <rect y="80" width="128" height="48" fill={C.dark} />
        <rect x="69" y="86" width="45" height="3" fill={C.orange} />
        <rect x="74" y="93" width="35" height="3" fill={C.orange} />
        <rect x="80" y="100" width="23" height="2" fill={C.rose} />
        <T x={12} y={113}>SUNSET DEMO</T>
      </>;
    case "colors":
      return <>
        {[C.pink, C.yellow, C.cobalt, C.violet, C.teal, C.orange].map((color, i) => (
          <rect key={color} x={(i % 2) * 64} y={Math.floor(i / 2) * 32} width="64" height="32" fill={color} />
        ))}
        <rect y="96" width="128" height="32" fill={C.navy} />
        <T x={64} y={106} s={1.45} anchor="middle">RGB565 TEST</T>
      </>;
    case "animation":
      return <>
        <rect width="128" height="94" fill={C.navy} />
        <rect y="94" width="128" height="18" fill={C.purple} />
        <rect y="112" width="128" height="16" fill={C.dark} />
        <rect y="112" width="128" height="1" fill={C.teal} />
        <g className="preview-orb">
          <circle cx="34" cy="92" r="10" fill={C.yellow} stroke={C.cyan} strokeWidth="3" />
        </g>
      </>;
    case "console":
      return <>
        <rect width="128" height="128" fill={C.termBg} />
        <rect width="128" height="10" fill={C.term} />
        <T x={3} y={1.5} s={0.85} fill={C.termBg}>MICROPYTHON 1.29</T>
        {[">>> import main", "wifi: connected", "api: listening :80", "display: st7735", "scene: console", ">>> _"].map((line, i) => (
          <T key={line} x={4} y={18 + i * 14} s={0.95} fill={C.term}>{line}</T>
        ))}
      </>;
    case "hacker":
      return <>
        <rect width="128" height="128" fill={C.termBg} />
        {["$ ssh root@node-7", "ACCESS GRANTED", "3F9A 4B1C D29E", "77C0 E15A 09B4", "A1D3 5F62 C8E0", "DECR [######  ]"].map((line, i) => (
          <T key={line} x={4} y={8 + i * 14} s={0.95} fill={C.term}>{line}</T>
        ))}
        <rect x="4" y="100" width="72" height="5" fill={C.term} />
        <rect x="76" y="100" width="48" height="5" fill="#0d3a0d" />
        <T x={4} y={112} s={0.95} fill={C.term}>60%</T>
      </>;
    case "fatal":
      return <>
        <rect width="128" height="128" fill={C.red} />
        <g className="preview-fatal">
          <T x={64} y={24} s={3.3} fill="#000" anchor="middle">FATAL</T>
          <T x={64} y={58} s={3.3} fill="#000" anchor="middle">ERROR</T>
        </g>
        <T x={64} y={102} s={0.95} fill="#000" anchor="middle">SYSTEM HALTED</T>
      </>;
    case "weather": {
      const w = weather;
      const n = (v?: number | null) => (v === undefined || v === null ? "--" : String(Math.round(v)));
      const code = w?.code ?? 0;
      const rainy = code >= 51;
      const cloudy = code >= 2;
      return <>
        <rect width="128" height="128" fill={C.navy} />
        <rect width="128" height="11" fill={C.teal} />
        <T x={4} y={2} s={0.95}>{(city || "BUENOS AIRES").slice(0, 20)}</T>
        {w && !w.day && !cloudy
          ? <circle cx="28" cy="38" r="12" fill="#d8dbe6" />
          : <circle cx={cloudy ? 22 : 28} cy={cloudy ? 32 : 38} r={cloudy ? 9 : 13} fill={C.yellow} />}
        {cloudy && <>
          <rect x="14" y="38" width="34" height="12" rx="6" fill="#c6c9d2" />
          <circle cx="30" cy="38" r="8" fill="#c6c9d2" />
        </>}
        {rainy && [18, 28, 38].map((x) => <rect key={x} x={x} y="54" width="2" height="5" fill="#3d9fff" />)}
        <T x={122} y={18} s={3.6} anchor="end">{n(w?.temp)}°</T>
        <T x={122} y={52} s={0.95} fill={C.gray} anchor="end">ST {n(w?.feels)}°</T>
        <rect x="6" y="75" width="116" height="1" fill={C.teal} />
        <T x={6} y={82} s={0.95}>MAX {n(w?.max)}  MIN {n(w?.min)}</T>
        <T x={6} y={95} s={0.95}>HUMEDAD {n(w?.hum)}%</T>
        <T x={6} y={108} s={0.95}>PROB LLUVIA {n(w?.rain)}%</T>
      </>;
    }
    case "forecast": {
      const days = weather?.days?.length ? weather.days : null;
      return <>
        <rect width="128" height="128" fill={C.navy} />
        <rect width="128" height="11" fill={C.teal} />
        <T x={64} y={2} s={0.95} fill={C.navy} anchor="middle">{(city || "BUENOS AIRES").slice(0, 20)}</T>
        {[0, 1, 2].map((i) => {
          const day = days?.[i];
          const cx = i * 43 + 21;
          const n = (v?: number | null) => (v === undefined || v === null ? "--" : String(Math.round(v)));
          return <g key={i}>
            {i > 0 && <rect x={i * 43 - 1} y="15" width="1" height="92" fill="#4a5060" />}
            <T x={cx} y={16} s={0.95} anchor="middle">{day ? `${day.weekday} ${day.date}` : "---"}</T>
            {day ? <SmallIcon code={day.code} cx={cx} cy={38} /> : <rect x={cx - 10} y={34} width="20" height="8" fill="#4a5060" />}
            <T x={cx} y={56} s={1.6} anchor="middle">{`${n(day?.max)}°`}</T>
            <T x={cx} y={71} s={0.95} fill={C.teal} anchor="middle">{n(day?.min)}</T>
            <T x={cx} y={85} s={0.95} fill="#3d9fff" anchor="middle">{day?.rain === null || day?.rain === undefined ? "--" : `${day.rain}%`}</T>
          </g>;
        })}
        <rect x="6" y="106" width="116" height="1" fill={C.teal} />
        <T x={4} y={114} s={0.95} fill={C.teal}>PRONOSTICO</T>
        <T x={124} y={114} s={0.95} fill={C.teal} anchor="end">{weather?.time || "--:--"}</T>
      </>;
    }
    case "random":
      return <>
        <rect width="64" height="64" fill={C.navy} />
        <rect x="64" width="64" height="64" fill={C.purple} />
        <rect y="64" width="64" height="64" fill={C.termBg} />
        <rect x="64" y="64" width="64" height="64" fill={C.red} />
        <rect width="64" height="3" fill={C.green} />
        <circle cx="96" cy="34" r="12" fill={C.sun} />
        <T x={6} y={74} s={0.95} fill={C.term}>{">>> _"}</T>
        <rect x="40" y="40" width="48" height="48" fill={C.navy} />
        <T x={64} y={47} s={3.3} anchor="middle">?</T>
      </>;
    case "text": {
      const shown = lines && lines.length ? lines : ["VISTA PREVIA"];
      const top = shown.length === 1 ? 54 : 44;
      return <>
        <rect width="128" height="128" fill={C.navy} />
        {shown.map((line, i) => (
          <T key={i} x={64} y={top + i * 20} s={1.45} anchor="middle">{line}</T>
        ))}
      </>;
    }
    case "offline":
      return <>
        <rect width="128" height="128" fill="#050507" />
        <T x={64} y={58} s={1} fill={C.gray} anchor="middle">SIN SEÑAL</T>
      </>;
    default:
      return <>
        <rect width="128" height="128" fill={C.navy} />
        <T x={64} y={58} s={1} fill={C.gray} anchor="middle">EN ESPERA</T>
      </>;
  }
}

export function ScreenPreview({ size = 256, label, animate = false, ...scene }: SceneProps & {
  size?: number; label?: string; animate?: boolean;
}) {
  return (
    <svg className="screen" data-ui data-animate={animate || undefined} width={size} height={size}
      viewBox="0 0 128 128" shapeRendering="crispEdges" role={label ? "img" : undefined}
      aria-label={label} aria-hidden={label ? undefined : true}>
      <Scene {...scene} />
    </svg>
  );
}
