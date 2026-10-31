import { createHash } from "node:crypto"

// Adapted from eidos.space's login-artwork.astro: the same brand outline,
// deterministic particles with a 600 ms entrance, without Astro or React startup.
const outline =
  "M256.151 500.829L467.826 378.591L467.85 134.156L256.199 11.9587L44.5239 134.197L44.5 378.632L256.151 500.829ZM255.85 33.3289L440.459 139.913L401.716 162.349L403.25 331.87L390.749 338.809L389.004 169.33L323.205 207.319L324.077 375.821L311.985 382.053L310.704 214.258L256.505 244.693L232.653 230.922L379.275 145.309L325.849 114.463L178.96 199.922L150.897 183.72L298.242 98.5245L249.692 70.4936L101.884 155.422L74.6395 139.693L255.85 33.3289ZM265.077 473.329L265.077 427L117.707 342.561L117.787 330.301L265.077 414.5L265.077 341.991L117.381 256.485L117.14 242.189L265.077 326.5L265.077 264.329L293.613 248.108L293.395 415.991L343.625 386.991L343.733 219.17L372.194 202.569L371.77 370.741L421.567 341.991L420.783 173.992L450.297 156.953L449.85 366.959L265.077 473.329ZM98.0001 178.148L63.8279 158.419L63.3501 367.959L245.87 473.329L245.87 439.959L96.8722 354.128L96.8722 296.459L245.87 380.959L245.87 353.329L97.2186 266.959L97.2186 208.036L245.87 293.86L245.693 263.419L191.098 231.898L213.527 218.653L342.884 143.969L327.243 135.011L174.643 222.398L112.29 186.398L136.521 172.276L263.827 98.7762L249.206 90.335L98.0001 178.148Z"
const animation = `
const host = document.getElementById("lite-startup");
const art = host.querySelector(".art");
const canvas = host.querySelector("canvas");
const ctx = canvas.getContext("2d");
if (ctx) {
  const outline = new Path2D(host.querySelector("path").getAttribute("d"));
  const points = [];
  for (let y = 12; y < 501; y += 4) {
    for (let x = 44; x < 468; x += 4) {
      if (ctx.isPointInPath(outline, x, y, "evenodd"))
        points.push({ x: x - 256, y: y - 256, seed: Math.sin(x * 127.1 + y * 311.7) });
    }
  }
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const theme = matchMedia("(prefers-color-scheme: dark)");
  const size = 192;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = canvas.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const duration = 600;
  let elapsed = 0;
  let lastTime = 0, frame = 0;
  const paint = () => {
    const scale = size * .8 / 512;
    const scatter = Math.pow(1 - Math.min(elapsed / duration, 1), 3);
    canvas.style.filter = scatter > 0 ? "blur(" + scatter * 2 + "px)" : "none";
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = getComputedStyle(art).color;
    ctx.beginPath();
    for (const { x, y, seed } of points) {
      const px = size / 2 + (x + seed * scatter * 210) * scale;
      const py = size / 2 + (y + Math.cos(seed * 9) * scatter * 180) * scale;
      const radius = 1.21 * scale;
      ctx.moveTo(px + radius, py);
      ctx.arc(px, py, radius, 0, Math.PI * 2);
    }
    ctx.fill();
    art.dataset.ready = "true";
  };
  const tick = (time) => {
    if (!lastTime) lastTime = time;
    const delta = time - lastTime;
    if (delta >= 1000 / 30) {
      elapsed = Math.min(elapsed + Math.min(delta, 100), duration);
      lastTime = time;
      paint();
    }
    frame = elapsed < duration ? requestAnimationFrame(tick) : 0;
  };
  const update = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    if (reduced.matches) elapsed = duration;
    paint();
    if (!document.hidden && elapsed < duration) frame = requestAnimationFrame(tick);
  };
  document.addEventListener("visibilitychange", update);
  reduced.addEventListener("change", update);
  theme.addEventListener("change", paint);
  const dispose = () => {
    cancelAnimationFrame(frame);
    document.removeEventListener("visibilitychange", update);
    reduced.removeEventListener("change", update);
    theme.removeEventListener("change", paint);
  };
  window.addEventListener("pagehide", dispose, { once: true });
  window.addEventListener("lite-startup-finished", dispose, { once: true });
  update();
}
`

const styles = `
:root{color-scheme:light dark}
#lite-startup{position:fixed;inset:0;z-index:2147483647;background:light-dark(#f7f7f5,#202020);color:light-dark(#555,#bbb);font:13px system-ui;display:grid;place-content:center;justify-items:center;-webkit-app-region:drag}
#lite-startup .art{position:relative;width:192px;height:192px}
#lite-startup svg{position:absolute;inset:10%;width:80%;height:80%}
#lite-startup canvas{width:100%;height:100%;opacity:0}
#lite-startup [data-ready] canvas{opacity:1}
#lite-startup [data-ready] svg{visibility:hidden}
#lite-startup p{margin:16px 0 0}
`

function markup(label: string): string {
  return `<style>${styles}</style><section id="lite-startup"><div class="art" aria-hidden="true"><svg viewBox="0 0 512 512"><path fill="currentColor" fill-rule="evenodd" d="${outline}"/></svg><canvas></canvas></div><p role="status">${label}</p></section>`
}

export function startupDocument(locale: string): string {
  const label = locale.startsWith("zh") ? "正在打开…" : "Opening…"
  const hash = createHash("sha256").update(animation).digest("base64")
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${hash}'">
<title>Eidos Lite</title></head><body>${markup(label)}<script>${animation}</script></body></html>`
}

// Inline the tiny shell before the renderer bundle loads. The same
// artwork survives React mounting until the Space tree (or recovery UI) commits.
export function withStartupShell(html: string): string {
  const script = `
if (!/^#\\/settings(?:\\/|$)/.test(location.hash)) {
  const appearance = new URLSearchParams(location.search).get("appearance");
  if (appearance === "light" || appearance === "dark") document.documentElement.style.colorScheme = appearance;
  document.querySelector("#lite-startup p").textContent = navigator.language.startsWith("zh") ? "正在打开…" : "Opening…";
  ${animation}
} else document.getElementById("lite-startup").remove();
`
  const hash = createHash("sha256").update(script).digest("base64")
  return html
    .replace("script-src 'self';", `script-src 'self' 'sha256-${hash}';`)
    .replace(
      '<div id="root"></div>',
      `${markup("Opening…")}<script>${script}</script><div id="root"></div>`
    )
}
