// Deterministic, crash-safe offline recorder for the SF 3D 90-second cinematic tour.
//
// Runs a hidden (headless) Chrome over CDP, steps the app one fixed timestep per frame and
// saves every frame as a JPEG, so the video is perfectly smooth no matter how slowly each
// frame renders. If Chrome crashes, the GPU context is lost or a frame comes out black, it
// restarts Chrome and resumes from the last good frame. Re-running the command also resumes.
// When all frames exist they are encoded to H.264 MP4 with ffmpeg.
//
// Usage:
//   node scripts/record-showcase.mjs                     full 90 s, 1080p, 30 fps
//   node scripts/record-showcase.mjs --fps 60            60 fps instead
//   node scripts/record-showcase.mjs --test 1 --start 63 --frames 2   quick check, writes rec-test-*.jpg
//   options: --out file.mp4  --url http://localhost:5173/  --fresh 1 (ignore saved frames)
//            --keep-frames 1 (keep JPEGs after encoding)

import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import jpeg from 'jpeg-js';

// ---------- options ----------
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
    return acc;
  }, [])
);
const FPS = Number(args.fps ?? 30);
const SECONDS = Number(args.seconds ?? 90);
const WIDTH = 1920;
const HEIGHT = 1080;
const BASE_URL = (args.url ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const APP_URL = `${BASE_URL}?bakedLUT`;
const OUT = resolve(args.out ?? 'sf3d-showcase-1080p.mp4');
const TEST = args.test === '1';
const TEST_START = Math.round(Number(args.start ?? 0) * FPS);
const TOTAL = TEST ? Number(args.frames ?? 3) : Math.round(FPS * SECONDS);
const FRAMES_DIR = resolve(args['frames-dir'] ?? 'rec-frames');
const MAX_RESTARTS = 6;
const SHOT_SEC = 7.5;
const SETTLE_AT_CUT = 6;
const SETTLE_AT_START = 40;
const DAY_UNTIL_SEC = 66; // frames before this must show a bright sky

const LUT_DIR = resolve('public/assets/takram/atmosphere');
const LUT_BASE =
  'https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/' +
  'eac103980f20c0956f2d3215833e73514be08462/packages/atmosphere/assets';
const LUT_FILES = {
  'transmittance.bin': 131072,
  'scattering.bin': 8388608,
  'irradiance.bin': 8192,
  'higher_order_scattering.bin': 8388608,
};

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...m) => console.log(`[rec ${new Date().toLocaleTimeString()}]`, ...m);
const frameFile = (i) => join(FRAMES_DIR, `f_${String(i).padStart(5, '0')}.jpg`);
const fmtTime = (s) => `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`;

class RecoverableError extends Error {}

// ---------- preflight ----------
async function preflight() {
  if (!CHROME) throw new Error('Chrome or Edge was not found.');
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', shell: true }).status !== 0) {
    throw new Error('ffmpeg is not on PATH.');
  }

  mkdirSync(LUT_DIR, { recursive: true });
  for (const [file, size] of Object.entries(LUT_FILES)) {
    const p = join(LUT_DIR, file);
    if (existsSync(p) && statSync(p).size === size) continue;
    log(`Downloading atmosphere LUT ${file}…`);
    const res = await fetch(`${LUT_BASE}/${file}`);
    if (!res.ok) throw new Error(`LUT download failed: ${file} HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length !== size) throw new Error(`LUT ${file} has wrong size ${buf.length}`);
    writeFileSync(p, buf);
  }

  let devServer = null;
  const up = async () => {
    try {
      return (await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) })).ok;
    } catch {
      return false;
    }
  };
  if (!(await up())) {
    const port = new URL(BASE_URL).port || '5173';
    log(`Dev server not running, starting Vite on :${port}…`);
    devServer = spawn('npx', ['vite', '--port', port, '--strictPort'], {
      shell: true, stdio: 'ignore', windowsHide: true,
    });
    for (let i = 0; i < 60 && !(await up()); i++) await sleep(1000);
    if (!(await up())) throw new Error(`Could not start the dev server at ${BASE_URL}`);
  }
  return devServer;
}

// ---------- Chrome session ----------
class Session {
  constructor() {
    this.port = 9300 + Math.floor(Math.random() * 600);
    this.profileDir = mkdtempSync(join(tmpdir(), 'sf3d-rec-'));
    this.pending = new Map();
    this.nextId = 1;
    this.errors = [];
  }

  async start() {
    this.chrome = spawn(
      CHROME,
      [
        '--headless=new',
        `--remote-debugging-port=${this.port}`,
        `--user-data-dir=${this.profileDir}`,
        `--window-size=${WIDTH},${HEIGHT}`,
        '--force-device-scale-factor=1',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-sync',
        '--mute-audio',
        '--hide-scrollbars',
        '--enable-gpu',
        '--ignore-gpu-blocklist',
        '--enable-gpu-rasterization',
        '--use-angle=d3d11',
        '--force-high-performance-gpu',
        '--disable-domain-blocking-for-3d-apis',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling',
        '--disable-hang-monitor',
        'about:blank',
      ],
      { stdio: 'ignore', windowsHide: true }
    );
    this.chrome.on('exit', () => {
      this.dead = true;
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new RecoverableError('Chrome exited'));
      }
      this.pending.clear();
    });

    let wsUrl;
    for (let i = 0; i < 100 && !wsUrl; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json();
        wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
      } catch {}
      if (!wsUrl) await sleep(200);
    }
    if (!wsUrl) throw new RecoverableError('Could not connect to Chrome DevTools');

    this.ws = new WebSocket(wsUrl);
    await new Promise((ok, fail) => {
      this.ws.onopen = ok;
      this.ws.onerror = () => fail(new RecoverableError('DevTools socket error'));
    });
    this.ws.onclose = () => (this.dead = true);
    this.ws.onmessage = (ev) => this.onMessage(JSON.parse(String(ev.data)));

    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('Inspector.enable').catch(() => {});
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false,
    });
    await this.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  }

  onMessage(msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve: ok, reject, timer } = this.pending.get(msg.id);
      clearTimeout(timer);
      this.pending.delete(msg.id);
      if (msg.error) reject(new RecoverableError(`${msg.error.message} ${msg.error.data ?? ''}`));
      else ok(msg.result);
      return;
    }
    let text = null;
    if (msg.method === 'Runtime.exceptionThrown') {
      text = msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text;
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      text = msg.params.args.map((a) => a.value ?? a.description).join(' ');
    } else if (msg.method === 'Inspector.targetCrashed') {
      text = 'Renderer process crashed';
      this.dead = true;
    }
    if (text) {
      this.errors.push(text);
      log('page error:', text.split('\n')[0].slice(0, 220));
    }
  }

  send(method, params = {}, timeoutMs = 120000) {
    if (this.dead) return Promise.reject(new RecoverableError('Chrome is not running'));
    const id = this.nextId++;
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        fail(new RecoverableError(`CDP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: ok, reject: fail, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, timeoutMs = 120000) {
    const r = await this.send(
      'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeoutMs
    );
    if (r.exceptionDetails) {
      throw new RecoverableError(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    }
    return r.result.value;
  }

  async capture() {
    const r = await this.send('Page.captureScreenshot', {
      format: 'jpeg', quality: 95, fromSurface: true, optimizeForSpeed: true,
    });
    return Buffer.from(r.data, 'base64');
  }

  async stop() {
    try { this.ws?.close(); } catch {}
    try { this.chrome?.kill(); } catch {}
    await sleep(1500);
    try { rmSync(this.profileDir, { recursive: true, force: true }); } catch {}
  }

  // Load the app and put it into deterministic recording mode.
  async openApp() {
    log(`Opening ${APP_URL} in hidden Chrome…`);
    const t0 = Date.now();
    await this.send('Page.navigate', { url: APP_URL });
    for (;;) {
      if (this.dead) throw new RecoverableError('Chrome died while the app was loading');
      const ready = await this.evaluate(
        `!!(window.__SF3D__ && __SF3D__.isReady && __SF3D__.sky?.atmosphere?.ready)`
      ).catch(() => false);
      if (ready) break;
      if (Date.now() - t0 > 300000) throw new RecoverableError('App did not become ready in 5 minutes');
      await sleep(500);
    }
    log(`App ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    const check = await this.evaluate(`(() => {
      const app = __SF3D__;
      const gl = app.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const tex = app.sky.atmosphere.textures?.transmittanceTexture;
      const data = tex?.image?.data ?? tex?.userData?.imageData;
      let lutOk = false;
      if (data && data.length) for (let i = 0; i < data.length; i += 64) if (data[i] !== 0) { lutOk = true; break; }
      return {
        gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
        lost: gl.isContextLost(),
        lutOk,
      };
    })()`);
    log('GPU:', check.gpu);
    if (check.lost) throw new RecoverableError('WebGL context was lost during load');
    if (!check.lutOk) throw new RecoverableError('Atmosphere LUT is empty (sky would be black)');
    if (!/nvidia|geforce|rtx/i.test(check.gpu)) {
      log('Warning: not running on the NVIDIA GPU, rendering will be slower.');
    }

    const info = await this.evaluate(
      `(async () => {
        const app = __SF3D__;
        await app.buildings.loadAllRemaining();
        await new Promise((r) => setTimeout(r, 300));
        app.renderPaused = true;

        app.qualityTier = 'high';
        app.sky.atmosphere.clouds.resolutionScale = 0.8;
        app.buildings.maxDrawDistance = 8200;
        app.buildings.shadowDistance = 1650;
        app.onResize();

        window.__ctxLost = false;
        app.renderer.domElement.addEventListener('webglcontextlost', () => (window.__ctxLost = true));
        document.querySelectorAll('input').forEach((el) => el.blur());

        const cs = app.cameraSys;
        const sky = app.sky;
        const KEYS = [
          // [tourSec, hour, fog, cloudCover]: day, sunset time-lapse, blue hour, then a cut to
          // night for the last two shots. Mid-twilight (~20:45) is avoided: the horizon fog
          // band glows brighter than the city there.
          [0.0, 16.2, 0.008, 0.22],
          [60.0, 16.2, 0.008, 0.22],
          [67.5, 19.65, 0.04, 0.28],
          [75.0, 20.35, 0.03, 0.24],
          [75.001, 22.0, 0.015, 0.18],
          [90.0, 22.0, 0.015, 0.18],
        ];
        const smooth = (x) => x * x * (3 - 2 * x);
        const light = (t) => {
          let i = 0;
          while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
          const a = KEYS[i], b = KEYS[i + 1];
          const k = smooth(Math.min(1, Math.max(0, (t - a[0]) / Math.max(1e-6, b[0] - a[0]))));
          const lerp = (j) => a[j] + (b[j] - a[j]) * k;
          sky.fogAmount = lerp(2);
          sky.cloudCover = lerp(3);
          sky.atmosphere.fog = sky.fogAmount;
          sky.atmosphere.coverage = sky.cloudCover;
          sky.setTimeOfDay(lerp(1));
          app.hud.syncLightingUI?.();
        };

        // Everything time-dependent is derived from t, so a resumed session renders the
        // same frames. settle=true re-renders the same instant with dt=0 so temporally
        // accumulated effects (clouds, AO) converge after a hard cut.
        window.__recFrame = (t, dt, settle) => {
          if (!cs.isCinematic()) cs.toggleCinematicTour();
          light(t);
          const step = settle ? 0 : dt;
          cs.cinematicTime = t - step;
          app.elapsedSec = t - step;
          app.stepFrame(step);
          return !window.__ctxLost && !app.renderer.getContext().isContextLost();
        };

        window.__recFrame(0, 0, true);
        return {
          canvas: [app.renderer.domElement.width, app.renderer.domElement.height],
          tris: app.renderer.info.render.triangles,
        };
      })()`,
      600000
    );
    log(`Recording mode ready: canvas ${info.canvas.join('x')}, ${info.tris.toLocaleString()} triangles`);
  }
}

// Mean brightness of the top 20% of a frame (the sky). Daytime frames below this are broken.
function skyBrightness(buf) {
  const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
  const rows = Math.floor(img.height * 0.2);
  let sum = 0, n = 0;
  for (let y = 0; y < rows; y += 8) {
    for (let x = 0; x < img.width; x += 8) {
      const i = (y * img.width + x) * 4;
      sum += 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
      n++;
    }
  }
  return sum / n;
}

// ---------- render ----------
async function renderFrames(frameIndices, sink) {
  let restarts = 0;
  let queue = frameIndices.filter((i) => !sink.has(i));
  const dt = 1 / FPS;
  const t0 = Date.now();
  const totalTodo = queue.length;
  let done = 0;

  while (queue.length) {
    const session = new Session();
    try {
      await session.start();
      await session.openApp();
      let lastShot = -1;

      while (queue.length) {
        const f = queue[0];
        const t = Math.min(SECONDS - 1e-4, f * dt);
        const shot = Math.floor(t / SHOT_SEC);
        if (shot !== lastShot) {
          const n = lastShot < 0 ? SETTLE_AT_START : SETTLE_AT_CUT;
          for (let s = 0; s < n; s++) await session.evaluate(`__recFrame(${t}, ${dt}, true)`);
          lastShot = shot;
        }
        const ok = await session.evaluate(`__recFrame(${t}, ${dt}, false)`);
        if (!ok) throw new RecoverableError(`WebGL context lost at frame ${f}`);
        const jpg = await session.capture();

        if (t < DAY_UNTIL_SEC && (f % 15 === 0 || done === 0)) {
          const lum = skyBrightness(jpg);
          if (lum < 30) throw new RecoverableError(`Frame ${f} sky is black (brightness ${lum.toFixed(1)})`);
        }

        sink.put(f, jpg);
        queue.shift();
        done++;
        if (done === 1 || done % FPS === 0 || !queue.length) {
          const per = (Date.now() - t0) / 1000 / done;
          log(
            `frame ${f + 1}/${TOTAL_FRAMES_LABEL(f)}  t=${t.toFixed(2)}s  shot ${shot + 1}/12  ` +
            `${(per * 1000).toFixed(0)} ms/frame  ETA ${fmtTime(per * (totalTodo - done))}`
          );
        }
      }
      await session.stop();
    } catch (err) {
      await session.stop();
      if (!(err instanceof RecoverableError) && !String(err?.message).includes('CDP')) throw err;
      restarts++;
      if (restarts > MAX_RESTARTS) {
        throw new Error(`Gave up after ${MAX_RESTARTS} restarts. Last error: ${err.message}`);
      }
      log(`Problem: ${err.message}`);
      log(`Restarting Chrome and resuming at frame ${queue[0]} (restart ${restarts}/${MAX_RESTARTS})…`);
      await sleep(3000);
    }
  }
}

let TOTAL_FRAMES_LABEL = () => TOTAL;

function encode() {
  const tmpOut = OUT.replace(/\.mp4$/i, '') + '.encoding.mp4';
  log('Encoding MP4 with ffmpeg (H.264, CRF 16)…');
  const r = spawnSync(
    'ffmpeg',
    [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-framerate', String(FPS),
      '-i', join(FRAMES_DIR, 'f_%05d.jpg'),
      '-vf', `scale=${WIDTH}:${HEIGHT}:flags=lanczos,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16',
      '-profile:v', 'high', '-level', '4.2',
      '-r', String(FPS), '-movflags', '+faststart',
      tmpOut,
    ],
    { stdio: 'inherit' }
  );
  if (r.status !== 0) throw new Error(`ffmpeg failed with exit code ${r.status}`);
  rmSync(OUT, { force: true });
  renameSync(tmpOut, OUT);

  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries',
      'stream=width,height,r_frame_rate,nb_read_frames:format=duration', '-of', 'json', OUT],
    { encoding: 'utf8' }
  );
  const meta = JSON.parse(probe.stdout || '{}');
  const s = meta.streams?.[0] ?? {};
  log(
    `Done: ${OUT}\n      ${s.width}x${s.height}, ${s.r_frame_rate} fps, ${s.nb_read_frames} frames, ` +
    `${Number(meta.format?.duration).toFixed(2)} s, ${(statSync(OUT).size / 1048576).toFixed(1)} MB`
  );
  if (Number(s.nb_read_frames) !== TOTAL) throw new Error(`Expected ${TOTAL} frames, got ${s.nb_read_frames}`);
}

// ---------- main ----------
const runStart = Date.now();
const devServer = await preflight();
const cleanupAll = () => {
  // shell:true wraps Vite in cmd.exe, so kill the whole tree or Vite keeps running.
  if (devServer?.pid) spawnSync('taskkill', ['/pid', String(devServer.pid), '/T', '/F'], { stdio: 'ignore' });
};
process.on('SIGINT', () => { cleanupAll(); process.exit(130); });

try {
  if (TEST) {
    const frames = Array.from({ length: TOTAL }, (_, k) => TEST_START + k);
    TOTAL_FRAMES_LABEL = () => Math.round(FPS * SECONDS);
    const saved = new Set();
    await renderFrames(frames, {
      has: () => false,
      put: (f, buf) => {
        const p = resolve(`rec-test-${String(f).padStart(5, '0')}.jpg`);
        writeFileSync(p, buf);
        saved.add(p);
      },
    });
    log(`Test frames written:\n      ${[...saved].join('\n      ')}`);
  } else {
    if (args.fresh === '1') rmSync(FRAMES_DIR, { recursive: true, force: true });
    mkdirSync(FRAMES_DIR, { recursive: true });
    const existing = new Set(
      readdirSync(FRAMES_DIR)
        .filter((n) => /^f_\d{5}\.jpg$/.test(n) && statSync(join(FRAMES_DIR, n)).size > 10000)
        .map((n) => Number(n.slice(2, 7)))
    );
    if (existing.size) log(`Resuming: ${existing.size}/${TOTAL} frames already rendered.`);
    await renderFrames(Array.from({ length: TOTAL }, (_, i) => i), {
      has: (f) => existing.has(f),
      put: (f, buf) => {
        const p = frameFile(f);
        writeFileSync(p + '.tmp', buf);
        renameSync(p + '.tmp', p);
      },
    });
    encode();
    if (args['keep-frames'] !== '1') rmSync(FRAMES_DIR, { recursive: true, force: true });
  }
  log(`Total time ${fmtTime((Date.now() - runStart) / 1000)}`);
  cleanupAll();
  process.exit(0);
} catch (err) {
  log(`FAILED: ${err.message}`);
  if (!TEST) log('Frames rendered so far are kept. Run the same command again to resume.');
  cleanupAll();
  process.exit(1);
}
