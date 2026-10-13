// Architectural & Cartographic HUD for SF 3D
// - Editorial & instrument-grade interface inspired by diorama / Pentagram cartography
// - Zero emojis; custom hairline SVG icons, tabular monospace telemetry, serif neighborhood header
// - Interactive WASD + Q/E tactile micro-cluster, solar timeline scrubber, landmark quick-jumps,
//   command search ('/' shortcut), Satellite / Without Satellite switch ('M'), Walk ('F'), 90s Tour ('C')

import { enuToLatLon, latLonToENU } from '../world/coords';
import type { CameraSystem, RenderMode } from '../camera/CameraSystem';
import type { AtmosphereSky, WeatherPreset } from '../sky/AtmosphereSky';
import type { HeroLandmarkSpec } from '../../tools/landmarks';
import type { NeighborhoodLabel } from '../../tools/labels';

export class HUD {
  private root: HTMLElement;
  private cameraSys: CameraSystem;
  private sky: AtmosphereSky;
  private onToggleMode: (mode: RenderMode) => void;
  private getMode: () => RenderMode;
  private getNearestNeighborhood: (x: number, z: number) => string;

  private landmarks: HeroLandmarkSpec[] = [];
  private neighborhoods: NeighborhoodLabel[] = [];

  private modeBtnSat!: HTMLButtonElement;
  private modeBtnVec!: HTMLButtonElement;
  private neighborhoodEl!: HTMLElement;
  private coordsEl!: HTMLElement;
  private altitudeEl!: HTMLElement;
  private compassNeedleEl!: HTMLElement;
  private headingTextEl!: HTMLElement;
  private timeSlider!: HTMLInputElement;
  private timeLabel!: HTMLElement;
  private presetBtns = new Map<WeatherPreset, HTMLButtonElement>();
  private walkBtn!: HTMLButtonElement;
  private tourBtn!: HTMLButtonElement;
  private tourBannerEl!: HTMLElement;
  private tourBadgeEl!: HTMLElement;
  private tourTitleEl!: HTMLElement;
  private tourSubEl!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private searchResultsEl!: HTMLElement;
  private aboutModalEl!: HTMLElement;
  private wasdBtns = new Map<string, HTMLElement>();
  private activeJumpId = 'salesforce-tower';

  constructor(
    root: HTMLElement,
    cameraSys: CameraSystem,
    sky: AtmosphereSky,
    getMode: () => RenderMode,
    onToggleMode: (mode: RenderMode) => void,
    getNearestNeighborhood: (x: number, z: number) => string
  ) {
    this.root = root;
    this.cameraSys = cameraSys;
    this.sky = sky;
    this.getMode = getMode;
    this.onToggleMode = onToggleMode;
    this.getNearestNeighborhood = getNearestNeighborhood;
    this.buildDOM();
  }

  public setSearchCatalog(landmarks: HeroLandmarkSpec[], neighborhoods: NeighborhoodLabel[]) {
    this.landmarks = landmarks;
    this.neighborhoods = neighborhoods;
  }

  private buildDOM() {
    this.root.innerHTML = `
      <!-- Top Architectural Bar: Cartographic Plinth, Landmark Ribbon & Search, Surface Mode Switch -->
      <header class="hud-top">
        <div class="hud-panel hud-brand-pill">
          <div class="brand-lockup">
            <span class="brand-beacon" aria-hidden="true"></span>
            <span class="brand-mark">SF 3D</span>
          </div>
          <div class="brand-divider"></div>
          <div class="brand-location">
            <span class="brand-kicker">DISTRICT</span>
            <span class="brand-neighborhood" id="hud-neighborhood">Golden Gate</span>
          </div>
        </div>

        <div class="hud-panel hud-nav-bar">
          <div class="hud-quick-jumps" role="navigation" aria-label="Featured landmarks">
            <button class="quick-chip is-active" data-jump="salesforce-tower">Skyline</button>
            <button class="quick-chip" data-jump="golden-gate-bridge">Golden Gate</button>
            <button class="quick-chip" data-jump="ggb-deck">Bridge Walk</button>
            <button class="quick-chip" data-jump="bay-bridge">Bay Bridge</button>
            <button class="quick-chip" data-jump="alcatraz-island">Alcatraz</button>
            <button class="quick-chip" data-jump="palace-of-fine-arts">Palace</button>
            <button class="quick-chip" data-jump="painted-ladies">Painted Ladies</button>
            <button class="quick-chip" data-jump="usf-campus">USF</button>
            <button class="quick-chip" data-jump="ucsf-parnassus">UCSF</button>
          </div>

          <div class="hud-nav-sep"></div>

          <div class="hud-search-wrap">
            <svg class="search-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="6.75" cy="6.75" r="4.75" stroke="currentColor" stroke-width="1.35"/>
              <path d="M10.25 10.25L14 14" stroke="currentColor" stroke-width="1.35" stroke-linecap="square"/>
            </svg>
            <input
              id="hud-search-input"
              type="text"
              placeholder="Search landmarks, towers, districts…"
              autocomplete="off"
              spellcheck="false"
            />
            <kbd class="search-Shortcut" title="Press / to search">/</kbd>
            <div id="hud-search-results" class="hud-search-results hidden"></div>
          </div>
        </div>

        <div class="hud-panel hud-mode-switch" title="Press M to toggle surface rendering mode">
          <button id="btn-mode-sat" class="mode-btn active">
            <span class="mode-indicator"></span>
            SATELLITE
          </button>
          <button id="btn-mode-vec" class="mode-btn">
            <span class="mode-indicator"></span>
            WITHOUT SATELLITE
          </button>
          <kbd class="key-hint">M</kbd>
        </div>
      </header>

      <!-- Editorial Lower-Third Caption (visible during 90s Cinematic Auto-Tour) -->
      <div id="hud-tour-banner" class="hud-tour-banner hidden">
        <div class="tour-meta">
          <span class="tour-live-dot"></span>
          <span id="hud-tour-badge" class="tour-badge">01 / 12</span>
          <span class="tour-sep">·</span>
          <span class="tour-hint">DRAG OR PRESS ANY KEY TO TAKE OVER</span>
        </div>
        <div id="hud-tour-title" class="tour-title"></div>
        <div id="hud-tour-sub" class="tour-sub"></div>
      </div>

      <!-- Bottom Instrument Dock: Telemetry + Compass, Tactile Flight Keys, Solar/Atmosphere Console, Camera Modes -->
      <footer class="hud-bottom">
        <div class="hud-left-cluster">
          <a
            class="hud-panel hud-credit"
            href="https://x.com/athrix_codes"
            target="_blank"
            rel="noopener noreferrer"
            title="Atharvsinh Jadav on X (@athrix_codes)"
          >
            <svg class="credit-x" viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
              <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            <span class="credit-kicker">MADE BY</span>
            <span class="credit-name">Atharv</span>
          </a>

          <div class="hud-panel hud-telemetry-card">
            <button class="compass-ring" id="hud-compass-reset" type="button" title="Click to align camera North (0°)">
              <svg class="compass-dial" viewBox="0 0 36 36" aria-hidden="true">
                <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(236,229,216,0.16)" stroke-width="1"/>
                <path d="M18 2V5M18 31V34M2 18H5M31 18H34" stroke="rgba(236,229,216,0.32)" stroke-width="1"/>
              </svg>
              <div class="compass-needle" id="hud-compass-needle">
                <svg viewBox="0 0 12 26" width="12" height="26" aria-hidden="true">
                  <polygon points="6,1 9.2,13 6,11.2 2.8,13" fill="#e4572e"/>
                  <polygon points="6,25 9.2,13 6,14.8 2.8,13" fill="rgba(236,229,216,0.42)"/>
                </svg>
              </div>
              <span class="compass-n-label">N</span>
            </button>

            <div class="telemetry-stats">
              <div class="stat-row">
                <span class="stat-cell">
                  <span class="stat-label">ALT</span>
                  <span class="stat-val" id="hud-altitude">235 m</span>
                </span>
                <span class="stat-sep"></span>
                <span class="stat-cell">
                  <span class="stat-label">HDG</span>
                  <span class="stat-val" id="hud-heading">325° NW</span>
                </span>
              </div>
              <div class="stat-row muted" id="hud-coords">37.8120° N · 122.4695° W</div>
            </div>
          </div>

          <!-- Tactile Flight Key Cluster -->
          <div class="hud-panel hud-wasd-card" title="Use W A S D + Q/E keys (or hold buttons) to fly. Hold Shift for boost.">
            <div class="wasd-grid">
              <button class="wasd-key sub" data-code="KeyQ" data-act="down" title="Descend (Q)">Q<span>DN</span></button>
              <button class="wasd-key" data-code="KeyW" data-act="w" title="Fly Forward (W)">W<span>FWD</span></button>
              <button class="wasd-key sub" data-code="KeyE" data-act="up" title="Ascend (E / Space)">E<span>UP</span></button>
              <button class="wasd-key" data-code="KeyA" data-act="a" title="Strafe Left (A)">A<span>L</span></button>
              <button class="wasd-key" data-code="KeyS" data-act="s" title="Fly Backward (S)">S<span>REV</span></button>
              <button class="wasd-key" data-code="KeyD" data-act="d" title="Strafe Right (D)">D<span>R</span></button>
            </div>
            <div class="wasd-caption">
              <span><b>DRAG</b> Orbit</span>
              <span><b>SHIFT</b> Boost</span>
            </div>
          </div>
        </div>

        <!-- Solar & Atmosphere Console -->
        <div class="hud-panel hud-lighting-card">
          <div class="preset-group" role="group" aria-label="Atmosphere presets">
            <button class="preset-btn active" data-preset="day" title="California Daylight (Key: L)">
              <svg class="preset-icon" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="2.8" stroke="currentColor" stroke-width="1.3"/>
                <path d="M7 1.2V2.6M7 11.4V12.8M1.2 7H2.6M11.4 7H12.8M2.9 2.9L3.9 3.9M10.1 10.1L11.1 11.1M11.1 2.9L10.1 3.9M3.9 10.1L2.9 11.1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
              <span>Daylight</span>
            </button>
            <button class="preset-btn" data-preset="golden" title="Pacific Golden Hour (Key: L)">
              <svg class="preset-icon" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M1.5 10.2H12.5M3.2 12.2H10.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                <path d="M3.8 10.2A3.2 3.2 0 0 1 10.2 10.2" stroke="currentColor" stroke-width="1.3"/>
                <path d="M7 3.2V4.8M3.4 5.2L4.5 6.2M10.6 5.2L9.5 6.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
              <span>Golden</span>
            </button>
            <button class="preset-btn" data-preset="fog" title="Marine Layer Fog (Key: L)">
              <svg class="preset-icon" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 4.5H10.5M3.5 7.2H12M1.5 9.9H9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              </svg>
              <span>Fog</span>
            </button>
            <button class="preset-btn" data-preset="night" title="Night City Lights (Key: L)">
              <svg class="preset-icon" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M10.8 8.9A4.5 4.5 0 0 1 5.1 3.2A4.5 4.5 0 1 0 10.8 8.9Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
              </svg>
              <span>Night</span>
            </button>
          </div>

          <div class="lighting-sep"></div>

          <div class="slider-group" title="Scrub solar time of day (00:00 – 24:00)">
            <span class="slider-kicker">SOLAR</span>
            <input id="hud-time-slider" type="range" min="0" max="24" step="0.1" value="13.5" />
            <span id="hud-time-label" class="time-readout">13:30</span>
          </div>
        </div>

        <!-- Camera Modes & Attribution -->
        <div class="hud-panel hud-actions-card">
          <button id="btn-walk" class="action-btn" title="First-Person Street & Bridge Deck Walk Mode (Key: F)">
            <span>Walk</span>
            <kbd>F</kbd>
          </button>
          <button id="btn-tour" class="action-btn" title="90-Second Architectural Helicopter Tour (Key: C)">
            <span>90s Tour</span>
            <kbd>C</kbd>
          </button>
          <button id="btn-about" class="action-btn icon-only" title="Open-Data Architecture, Sources & Shortcuts">
            <span>Info</span>
          </button>
        </div>
      </footer>

      <!-- Open-Data Architecture & Controls Modal -->
      <div id="hud-about-modal" class="hud-modal-backdrop hidden">
        <div class="hud-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-header">
            <div>
              <div class="modal-eyebrow">OPEN GEOSPATIAL ARCHITECTURE</div>
              <h2 id="modal-title">San Francisco 3D: Data &amp; Controls</h2>
            </div>
            <button id="btn-close-about" class="modal-close" aria-label="Close modal">✕</button>
          </div>
          <div class="modal-body">
            <p class="modal-lead">
              Built entirely offline from public-domain and open civic datasets with zero proprietary API keys or tile tokens.
            </p>
            <div class="attr-grid">
              <div class="attr-item">
                <strong>OpenStreetMap Contributors (ODbL)</strong>
                <span>Arterial road network, highway interchanges, cable car lines, waterfront piers, parks, and district centroids.</span>
              </div>
              <div class="attr-item">
                <strong>DataSF Civic Datasets (PDDL)</strong>
                <span>176,777 building footprints extruded with lidar roof elevations (<code>ynuv-fyni</code>) and 47,896 urban street trees (<code>tkzw-k3nq</code>).</span>
              </div>
              <div class="attr-item">
                <strong>USGS 3DEP &amp; NOAA NCEI Bathymetry</strong>
                <span>Bare-earth digital elevation models across the San Francisco Peninsula, Marin Headlands, and Golden Gate Strait.</span>
              </div>
              <div class="attr-item">
                <strong>NOAA NGS &amp; USDA NAIP Orthoimagery</strong>
                <span>Public-domain aerial imagery color-graded offline to sample true San Francisco rooftop and façade palettes.</span>
              </div>
            </div>
            <div class="controls-summary">
              <div><kbd>WASD</kbd> <kbd>Shift</kbd> Free-flight &amp; turbo boost</div>
              <div><kbd>Q</kbd> <kbd>E</kbd> <kbd>Space</kbd> Vertical altitude control</div>
              <div><kbd>M</kbd> Toggle Satellite / Without Satellite</div>
              <div><kbd>L</kbd> Cycle Daylight / Golden / Fog / Night</div>
              <div><kbd>F</kbd> Street &amp; Golden Gate deck walk (1.7 m)</div>
              <div><kbd>C</kbd> 90-second cinematic helicopter tour</div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.modeBtnSat = this.root.querySelector('#btn-mode-sat')!;
    this.modeBtnVec = this.root.querySelector('#btn-mode-vec')!;
    this.neighborhoodEl = this.root.querySelector('#hud-neighborhood')!;
    this.coordsEl = this.root.querySelector('#hud-coords')!;
    this.altitudeEl = this.root.querySelector('#hud-altitude')!;
    this.compassNeedleEl = this.root.querySelector('#hud-compass-needle')!;
    this.headingTextEl = this.root.querySelector('#hud-heading')!;
    this.timeSlider = this.root.querySelector('#hud-time-slider')!;
    this.timeLabel = this.root.querySelector('#hud-time-label')!;
    this.walkBtn = this.root.querySelector('#btn-walk')!;
    this.tourBtn = this.root.querySelector('#btn-tour')!;
    this.tourBannerEl = this.root.querySelector('#hud-tour-banner')!;
    this.tourBadgeEl = this.root.querySelector('#hud-tour-badge')!;
    this.tourTitleEl = this.root.querySelector('#hud-tour-title')!;
    this.tourSubEl = this.root.querySelector('#hud-tour-sub')!;
    this.searchInput = this.root.querySelector('#hud-search-input')!;
    this.searchResultsEl = this.root.querySelector('#hud-search-results')!;
    this.aboutModalEl = this.root.querySelector('#hud-about-modal')!;

    this.modeBtnSat.addEventListener('click', () => {
      this.modeBtnSat.blur();
      this.onToggleMode('satellite');
    });
    this.modeBtnVec.addEventListener('click', () => {
      this.modeBtnVec.blur();
      this.onToggleMode('vector');
    });

    // Quick-jump chips
    const quickChips = this.root.querySelectorAll<HTMLButtonElement>('.quick-chip');
    quickChips.forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.blur();
        const id = btn.dataset.jump;
        if (!id) return;
        this.activeJumpId = id;
        quickChips.forEach((b) => b.classList.toggle('is-active', b.dataset.jump === id));

        if (id === 'ggb-deck') {
          const southAnch = latLonToENU(37.8106, -122.4774);
          const northAnch = latLonToENU(37.8324, -122.4795);
          const t = 0.22;
          const bx = southAnch.x + (northAnch.x - southAnch.x) * t;
          const bz = southAnch.z + (northAnch.z - southAnch.z) * t;
          this.cameraSys.interruptCinematic();
          this.cameraSys.controlMode = 'walk';
          this.cameraSys.setPoseImmediate({
            x: bx,
            y: 73.2,
            z: bz,
            headingDeg: 353.5,
            pitchDeg: 4,
          });
          this.update();
          return;
        }
        const lm = this.landmarks.find((l) => l.id === id);
        if (lm) this.flyToLandmark(lm);
      });
    });

    // Interactive on-screen WASD pad
    this.root.querySelectorAll<HTMLButtonElement>('.wasd-key').forEach((btn) => {
      const code = btn.dataset.code!;
      const act = btn.dataset.act!;
      this.wasdBtns.set(act, btn);

      const startHold = (e: Event) => {
        e.preventDefault();
        btn.blur();
        this.cameraSys.setVirtualKey(code, true);
      };
      const endHold = () => {
        this.cameraSys.setVirtualKey(code, false);
      };

      btn.addEventListener('mousedown', startHold);
      btn.addEventListener('mouseup', endHold);
      btn.addEventListener('mouseleave', endHold);
      btn.addEventListener('touchstart', startHold, { passive: false });
      btn.addEventListener('touchend', endHold);
    });

    this.root.querySelector('#hud-compass-reset')!.addEventListener('click', () => {
      this.cameraSys.flyTo(
        {
          ...this.cameraSys.pose,
          headingDeg: 0,
        },
        700
      );
    });

    this.root.querySelectorAll<HTMLButtonElement>('.preset-btn').forEach((btn) => {
      const p = btn.dataset.preset as WeatherPreset;
      this.presetBtns.set(p, btn);
      btn.addEventListener('click', () => {
        btn.blur();
        this.sky.setPreset(p);
        this.syncLightingUI();
      });
    });

    this.timeSlider.addEventListener('input', () => {
      const val = parseFloat(this.timeSlider.value);
      this.sky.setTimeOfDay(val);
      this.syncLightingUI();
    });
    this.timeSlider.addEventListener('change', () => {
      this.timeSlider.blur();
    });

    this.walkBtn.addEventListener('click', () => {
      this.walkBtn.blur();
      const mode = this.cameraSys.toggleWalkMode();
      this.walkBtn.classList.toggle('active', mode === 'walk');
      this.tourBtn.classList.remove('active');
    });

    this.tourBtn.addEventListener('click', () => {
      this.tourBtn.blur();
      const active = this.cameraSys.toggleCinematicTour();
      this.tourBtn.classList.toggle('active', active);
      this.walkBtn.classList.remove('active');
    });

    this.root.querySelector('#btn-about')!.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      this.aboutModalEl.classList.remove('hidden');
    });
    this.root.querySelector('#btn-close-about')!.addEventListener('click', () => {
      this.aboutModalEl.classList.add('hidden');
    });
    this.aboutModalEl.addEventListener('click', (e) => {
      if (e.target === this.aboutModalEl) this.aboutModalEl.classList.add('hidden');
    });

    // Search autocomplete & Fly-To
    this.searchInput.addEventListener('focus', () => this.renderSearchResults());
    this.searchInput.addEventListener('input', () => this.renderSearchResults());
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const matches = this.getSearchMatches(this.searchInput.value);
        if (matches.length > 0) {
          matches[0].action();
          this.searchResultsEl.classList.add('hidden');
          this.searchInput.blur();
        }
      } else if (e.key === 'Escape') {
        this.searchResultsEl.classList.add('hidden');
        this.searchInput.blur();
      }
    });

    // Global '/' shortcut to focus search and 'Escape' to dismiss modal
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '/') {
        e.preventDefault();
        this.searchInput.focus();
        this.searchInput.select();
      } else if (e.key === 'Escape' && !this.aboutModalEl.classList.contains('hidden')) {
        this.aboutModalEl.classList.add('hidden');
      }
    });

    window.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.hud-search-wrap')) {
        this.searchResultsEl.classList.add('hidden');
      }
    });
  }

  private getSearchMatches(query: string): { title: string; badge: string; action: () => void }[] {
    const q = query.trim().toLowerCase();
    const results: { title: string; badge: string; action: () => void }[] = [];

    for (const lm of this.landmarks) {
      const match =
        !q ||
        lm.name.toLowerCase().includes(q) ||
        lm.description.toLowerCase().includes(q) ||
        lm.aliases.some((a) => a.toLowerCase().includes(q));
      if (match) {
        results.push({
          title: lm.name,
          badge: `${Math.round(lm.heightM)}M · ${lm.category.toUpperCase()}`,
          action: () => this.flyToLandmark(lm),
        });
      }
    }

    if (q.length >= 2) {
      for (const n of this.neighborhoods) {
        if (n.name.toLowerCase().includes(q)) {
          results.push({
            title: n.name,
            badge: 'DISTRICT',
            action: () => {
              const enu = latLonToENU(n.lat, n.lon);
              this.cameraSys.flyTo({
                x: enu.x + 250,
                y: n.y + 320,
                z: enu.z + 380,
                headingDeg: 325,
                pitchDeg: -28,
              });
            },
          });
        }
      }
    }

    return results.slice(0, 8);
  }

  private renderSearchResults() {
    const matches = this.getSearchMatches(this.searchInput.value);
    if (matches.length === 0) {
      this.searchResultsEl.classList.add('hidden');
      return;
    }

    this.searchResultsEl.innerHTML = matches
      .map(
        (m, i) => `
        <div class="search-item" data-idx="${i}">
          <span class="search-item-title">${m.title}</span>
          <span class="search-item-badge">${m.badge}</span>
        </div>
      `
      )
      .join('');

    this.searchResultsEl.querySelectorAll<HTMLElement>('.search-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx || '0', 10);
        matches[idx]?.action();
        this.searchResultsEl.classList.add('hidden');
      });
    });

    this.searchResultsEl.classList.remove('hidden');
  }

  public flyToLandmark(lm: HeroLandmarkSpec) {
    this.activeJumpId = lm.id;
    this.root.querySelectorAll<HTMLButtonElement>('.quick-chip').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.jump === lm.id);
    });

    const headRad = (lm.flyHeadingDeg * Math.PI) / 180;
    const pitchRad = (lm.flyPitchDeg * Math.PI) / 180;
    const targetY = lm.baseY + lm.heightM * 0.48;

    const camX = lm.x - Math.sin(headRad) * Math.cos(pitchRad) * lm.flyDistM;
    const camZ = lm.z + Math.cos(headRad) * Math.cos(pitchRad) * lm.flyDistM;
    const camY = targetY - Math.sin(pitchRad) * lm.flyDistM;

    this.cameraSys.flyTo({
      x: camX,
      y: Math.max(25, camY),
      z: camZ,
      headingDeg: lm.flyHeadingDeg,
      pitchDeg: lm.flyPitchDeg,
    });
  }

  public syncModeUI(mode: RenderMode) {
    this.modeBtnSat.classList.toggle('active', mode === 'satellite');
    this.modeBtnVec.classList.toggle('active', mode === 'vector');
  }

  public syncLightingUI() {
    this.timeSlider.value = this.sky.timeOfDay.toFixed(1);
    const hrs = Math.floor(this.sky.timeOfDay);
    const mins = Math.floor((this.sky.timeOfDay - hrs) * 60);
    this.timeLabel.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

    for (const [p, btn] of this.presetBtns.entries()) {
      btn.classList.toggle('active', p === this.sky.preset);
    }
  }

  public update() {
    const pose = this.cameraSys.pose;
    const { lat, lon } = enuToLatLon(pose.x, pose.z);

    this.neighborhoodEl.textContent = this.getNearestNeighborhood(pose.x, pose.z);
    const slopeInfo =
      this.cameraSys.controlMode === 'walk' && Math.abs(this.cameraSys.currentSlopePct) >= 2
        ? ` · ${this.cameraSys.currentSlopePct > 0 ? '+' : ''}${this.cameraSys.currentSlopePct}%`
        : '';
    this.altitudeEl.textContent = `${Math.round(pose.y).toLocaleString()} m${slopeInfo}`;

    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const dirStr = dirs[Math.round(pose.headingDeg / 45) % 8];
    this.headingTextEl.textContent = `${String(Math.round(pose.headingDeg)).padStart(3, '0')}° ${dirStr}`;
    this.compassNeedleEl.style.transform = `rotate(${-pose.headingDeg}deg)`;

    this.coordsEl.textContent = `${lat.toFixed(4)}° N · ${Math.abs(lon).toFixed(4)}° W`;

    // Highlight active WASD keys in real time
    for (const [act, btn] of this.wasdBtns.entries()) {
      btn.classList.toggle(
        'pressed',
        this.cameraSys.isKeyActive(act as 'w' | 'a' | 's' | 'd' | 'up' | 'down')
      );
    }

    this.walkBtn.classList.toggle('active', this.cameraSys.controlMode === 'walk');
    const isTour = this.cameraSys.isCinematic();
    this.tourBtn.classList.toggle('active', isTour);
    this.tourBannerEl.classList.toggle('hidden', !isTour);
    if (isTour) {
      const rawTitle = this.cameraSys.currentShotTitle;
      const dashIdx = rawTitle.indexOf(' — ');
      if (dashIdx !== -1) {
        this.tourBadgeEl.textContent = rawTitle.slice(0, dashIdx).trim();
        this.tourTitleEl.textContent = rawTitle.slice(dashIdx + 3).trim();
      } else {
        this.tourBadgeEl.textContent = '90S TOUR';
        this.tourTitleEl.textContent = rawTitle;
      }
      this.tourSubEl.textContent = this.cameraSys.currentShotSubtitle;
    }
  }
}
