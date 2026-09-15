/*
 Infinite Gradient 3D Carousel
 Adapted from https://github.com/clementgrellier/gradientslider (MIT)
 — Clément Grellier

 Images: only entries currently visible in index.html (excludes commented-out items).
*/

// ============================================================================
// CONFIGURATION
// ============================================================================

// Edit c1 / c2 hex per slide to match the image. c1 = main wash, c2 = lighter blob.
const SLIDES = [
  { src: 'assets/images/portfolio/allstacks/PS-showcase.svg', c1: '#A17FD9', c2: '#B8B9E1' },
  { src: 'assets/images/portfolio/sa-laptop-clear.jpg', c1: '#EE0000', c2: '#F0D0D0' },
  { src: 'assets/images/portfolio/cmrad-laptop-blue.jpg', c1: '#5A7388', c2: '#E24B4B' },
  { src: 'assets/images/portfolio/REalyse-small-ok.jpg', c1: '#8AA8C8', c2: '#C5D6EA' },
  { src: 'assets/images/portfolio/dynamic-tall.jpg', c1: '#00AEEF', c2: '#7DD8F7' },
  { src: 'assets/images/portfolio/0n-01.jpg', c1: '#C9A227', c2: '#E8B86D' },
  { src: 'assets/images/portfolio/mobile-mockup-bg.jpg', c1: '#7ECFB8', c2: '#2BBBAD' },
  { src: 'assets/images/portfolio/chat/chat-mockup.png', c1: '#C4B5E8', c2: '#DDD4F5' },
  { src: 'assets/images/portfolio/museo-prado.jpg', c1: '#C4A882', c2: '#E8DCC8' },
  { src: 'assets/images/portfolio/ovejas-web.jpg', c1: '#C45C38', c2: '#3A3A3A' },
  { src: 'assets/images/portfolio/other-projects-compress.gif', c1: '#6B7C93', c2: '#C5CBD4' },
];
const IMAGES = SLIDES.map((slide) => slide.src);

// Physics constants
const FRICTION = 0.9; // Velocity decay (0-1, lower = more friction)
const WHEEL_SENS = 0.6; // Mouse wheel sensitivity
const DRAG_SENS = 1.0; // Drag sensitivity

// Visual constants
const MAX_ROTATION = 28; // Maximum card rotation in degrees
const MAX_DEPTH = 140; // Maximum Z-axis depth in pixels
const MIN_SCALE = 0.92; // Minimum card scale
const SCALE_RANGE = 0.1; // Scale variation range
const GAP = 28; // Gap between cards in pixels

// ============================================================================
// DOM REFERENCES
// ============================================================================

const stage = document.querySelector('.portfolio-carousel');
const cardsRoot = document.getElementById('cards');
const bgCanvas = document.getElementById('bg');
const bgCtx = bgCanvas?.getContext('2d', { alpha: false });
const loader = document.getElementById('loader');

function stageHalfWidth() {
  return ((stage && stage.clientWidth) || window.innerWidth) * 0.5;
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

// Carousel state
let items = []; // Array of {el: HTMLElement, x: number}
let positions = []; // Float32Array for wrapped positions
let activeIndex = -1; // Currently centered card index
let isEntering = true; // Prevents interaction during entry animation

// Layout measurements
let CARD_W = 300; // Card width (measured dynamically)
let CARD_H = 400; // Card height (measured dynamically)
let STEP = CARD_W + GAP; // Distance between card centers
let TRACK = 0; // Total carousel track length
let SCROLL_X = 0; // Current scroll position
let VW_HALF = stageHalfWidth();

// Physics state
let vX = 0; // Velocity in X direction

// Animation frame IDs
let rafId = null; // Carousel animation frame
let bgRAF = null; // Background animation frame
let lastTime = 0; // Last frame timestamp
let lastBgDraw = 0; // Last background draw time

// Background gradient state
let gradPalette = []; // Extracted colors from each image
let gradCurrent = { // Current interpolated gradient colors
 r1: 240, g1: 240, b1: 240, // First gradient color (RGB)
 r2: 235, g2: 235, b2: 235 // Second gradient color (RGB)
};
let bgFastUntil = 0; // Timestamp until which to render at high FPS

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Safe modulo operation that handles negative numbers correctly
 * @param {number} n - The dividend
 * @param {number} m - The divisor
 * @returns {number} The positive remainder
 */
function mod(n, m) {
 return ((n % m) + m) % m;
}

// ============================================================================
// IMAGE PRELOADING
// ============================================================================

/**
 * Preload images using link tags for browser optimization
 * @param {string[]} srcs - Array of image URLs
 */
function preloadImageLinks(srcs) {
  if (!document.head) return;
  // Preload is same-origin HTTP only. On file:// it logs unique-origin errors
  // and can block images in Chrome.
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

  srcs.forEach((href) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = href;
    link.fetchPriority = 'high';
    document.head.appendChild(link);
  });
}

/**
 * Wait for all card images to finish loading
 * @returns {Promise}
 */
function waitForImages() {
 const promises = items.map((it) => {
 const img = it.el.querySelector('img');
 if (!img || img.complete) return Promise.resolve();

 return new Promise((resolve) => {
 const done = () => resolve();
 img.addEventListener('load', done, { once: true });
 img.addEventListener('error', done, { once: true });
 });
 });

 return Promise.all(promises);
}

/**
 * Decode all images to prevent jank during first interaction
 * @returns {Promise}
 */
async function decodeAllImages() {
 const tasks = items.map((it) => {
 const img = it.el.querySelector('img');
 if (!img) return Promise.resolve();

 if (typeof img.decode === 'function') {
 return img.decode().catch(() => {});
 }

 return Promise.resolve();
 });

 await Promise.allSettled(tasks);
}

// ============================================================================
// CAROUSEL SETUP
// ============================================================================

/**
 * Create card DOM elements from image array
 */
function createCards() {
  items = [];

  const existing = cardsRoot.querySelectorAll('.card');
  if (existing.length) {
    existing.forEach((card, i) => {
      card.style.willChange = 'transform';
      items.push({ el: card, x: i * STEP });
    });
    return;
  }

  const fragment = document.createDocumentFragment();

  IMAGES.forEach((src, i) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.style.willChange = 'transform';

    const img = new Image();
    img.className = 'card__img';
    img.decoding = 'async';
    img.loading = 'eager';
    img.fetchPriority = 'high';
    img.draggable = false;
    img.alt = '';
    img.src = src;
    if (SLIDES[i]) {
      card.dataset.c1 = SLIDES[i].c1;
      card.dataset.c2 = SLIDES[i].c2;
    }

    card.appendChild(img);
    fragment.appendChild(card);
    items.push({ el: card, x: i * STEP });
  });

  cardsRoot.appendChild(fragment);
}

/**
 * Measure card dimensions and calculate layout
 */
function measure() {
 const sample = items[0]?.el;
 if (!sample) return;

 const r = sample.getBoundingClientRect();
 CARD_W = r.width || CARD_W;
 CARD_H = r.height || CARD_H;
 STEP = CARD_W + GAP;
 TRACK = items.length * STEP;

 // Set initial positions
 items.forEach((it, i) => {
 it.x = i * STEP;
 });

 positions = new Float32Array(items.length);
}

// ============================================================================
// TRANSFORM CALCULATIONS
// ============================================================================

function computeTransformComponents(screenX) {
 const norm = Math.max(-1, Math.min(1, screenX / VW_HALF));
 const absNorm = Math.abs(norm);
 const invNorm = 1 - absNorm;

 const ry = -norm * MAX_ROTATION;
 const tz = invNorm * MAX_DEPTH;
 const scale = MIN_SCALE + invNorm * SCALE_RANGE;

 return { norm, absNorm, invNorm, ry, tz, scale };
}

/**
 * Calculate 3D transform for a card based on its screen position
 * @param {number} screenX - Card's X position relative to viewport center
 * @returns {{transform: string, z: number}} Transform string and Z-depth
 */
function transformForScreenX(screenX) {
 const { ry, tz, scale } = computeTransformComponents(screenX);

 return {
 transform: `translate3d(${screenX}px,-50%,${tz}px) rotateY(${ry}deg) scale(${scale})`,
 z: tz,
 };
}

/**
 * Update all card transforms based on current scroll position
 */
function updateCarouselTransforms() {
 const half = TRACK / 2;
 let closestIdx = -1;
 let closestDist = Infinity;

 // Calculate wrapped positions for infinite scroll
 for (let i = 0; i < items.length; i++) {
 let pos = items[i].x - SCROLL_X;
 
 // Wrap position to nearest equivalent position
 if (pos < -half) pos += TRACK;
 if (pos > half) pos -= TRACK;
 
 positions[i] = pos;

 // Track closest card to center
 const dist = Math.abs(pos);
 if (dist < closestDist) {
 closestDist = dist;
 closestIdx = i;
 }
 }

 // Apply transforms to all cards
 for (let i = 0; i < items.length; i++) {
 const it = items[i];
 const pos = positions[i];
 const { transform, z } = transformForScreenX(pos);

 it.el.style.transform = transform;
 it.el.style.zIndex = String(1000 + Math.round(z)); // Higher z-index for cards in front
 it.el.style.filter = 'none';
 }

 // Update gradient if active card changed
 if (closestIdx !== activeIndex) {
 setActiveGradient(closestIdx);
 }
}

// ============================================================================
// ANIMATION LOOP
// ============================================================================

/**
 * Main animation loop for carousel movement
 * @param {number} t - Current timestamp
 */
function tick(t) {
 const dt = lastTime ? (t - lastTime) / 1000 : 0;
 lastTime = t;

 // Apply velocity to scroll position
 SCROLL_X = mod(SCROLL_X + vX * dt, TRACK);

 // Apply friction to velocity
 const decay = Math.pow(FRICTION, dt * 60);
 vX *= decay;
 if (Math.abs(vX) < 0.02) vX = 0;

 updateCarouselTransforms();
 rafId = requestAnimationFrame(tick);
}

/**
 * Start the carousel animation loop
 */
function startCarousel() {
 cancelCarousel();
 lastTime = 0;
 rafId = requestAnimationFrame((t) => {
 updateCarouselTransforms();
 tick(t);
 });
}

/**
 * Stop the carousel animation loop
 */
function cancelCarousel() {
 if (rafId) cancelAnimationFrame(rafId);
 rafId = null;
}

// ============================================================================
// BACKGROUND COLORS (hex)
// ============================================================================

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [240, 240, 240];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function buildPalette() {
  gradPalette = items.map((it, i) => {
    const slide = SLIDES[i] || {};
    const c1 = it.el.dataset.c1 || slide.c1 || '#d0d4dc';
    const c2 = it.el.dataset.c2 || slide.c2 || '#e8eaef';
    return { c1: hexToRgb(c1), c2: hexToRgb(c2) };
  });
}

/**
 * Set the active gradient based on the centered card
 * @param {number} idx - Card index
 */
function setActiveGradient(idx) {
  if (!bgCtx || idx < 0 || idx >= items.length || idx === activeIndex) return;

  activeIndex = idx;
  const pal = gradPalette[idx] || { c1: [240, 240, 240], c2: [235, 235, 235] };
  const to = {
    r1: pal.c1[0],
    g1: pal.c1[1],
    b1: pal.c1[2],
    r2: pal.c2[0],
    g2: pal.c2[1],
    b2: pal.c2[2],
  };

  // Animate transition with GSAP if available
  if (window.gsap) {
    bgFastUntil = performance.now() + 800; // High FPS for smooth transition
    window.gsap.to(gradCurrent, { ...to, duration: 0.45, ease: 'power2.out' });
  } else {
    Object.assign(gradCurrent, to);
  }
}

// ============================================================================
// BACKGROUND RENDERING
// ============================================================================

/**
 * Resize background canvas to match viewport
 */
function resizeBG() {
  if (!bgCanvas || !bgCtx) return;

  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = bgCanvas.clientWidth || stage.clientWidth;
  const h = bgCanvas.clientHeight || stage.clientHeight;
  const tw = Math.floor(w * dpr);
  const th = Math.floor(h * dpr);

  if (bgCanvas.width !== tw || bgCanvas.height !== th) {
    bgCanvas.width = tw;
    bgCanvas.height = th;
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

/**
 * Render animated gradient background
 */
function drawBackground() {
  if (!bgCanvas || !bgCtx) return;

  const now = performance.now();
  const minInterval = now < bgFastUntil ? 16 : 33; // 60fps or 30fps

  // Throttle rendering based on transition state
  if (now - lastBgDraw < minInterval) {
    bgRAF = requestAnimationFrame(drawBackground);
    return;
  }

  lastBgDraw = now;
  resizeBG();

  const w = bgCanvas.clientWidth || stage.clientWidth;
  const h = bgCanvas.clientHeight || stage.clientHeight;

  bgCtx.fillStyle = '#ffffff';
  bgCtx.fillRect(0, 0, w, h);

  const time = now * 0.0002;
  const cx = w * 0.5;
  const cy = h * 0.5;
  const a1 = w * 0.16;
  const a2 = w * 0.1;

  const x1 = cx + Math.cos(time) * a1;
  const y1 = cy + Math.sin(time * 0.8) * (h * 0.05);
  const x2 = cx + Math.cos(-time * 0.9 + 1.2) * a2;
  const y2 = cy + Math.sin(-time * 0.7 + 0.7) * (h * 0.04);

  const r1 = Math.min(w * 0.93, h * 0.72);
  const r2 = Math.min(w * 0.75, h * 0.6);

  const g1 = bgCtx.createRadialGradient(x1, y1, 0, x1, y1, r1);
  g1.addColorStop(0, `rgba(${gradCurrent.r1},${gradCurrent.g1},${gradCurrent.b1},0.5)`);
  g1.addColorStop(0.55, `rgba(${gradCurrent.r1},${gradCurrent.g1},${gradCurrent.b1},0.22)`);
  g1.addColorStop(1, 'rgba(255,255,255,0)');
  bgCtx.fillStyle = g1;
  bgCtx.fillRect(0, 0, w, h);

  const g2 = bgCtx.createRadialGradient(x2, y2, 0, x2, y2, r2);
  g2.addColorStop(0, `rgba(${gradCurrent.r2},${gradCurrent.g2},${gradCurrent.b2},0.36)`);
  g2.addColorStop(0.6, `rgba(${gradCurrent.r2},${gradCurrent.g2},${gradCurrent.b2},0.14)`);
  g2.addColorStop(1, 'rgba(255,255,255,0)');
  bgCtx.fillStyle = g2;
  bgCtx.fillRect(0, 0, w, h);

  bgRAF = requestAnimationFrame(drawBackground);
}

/**
 * Start background animation loop
 */
function startBG() {
  if (!bgCanvas || !bgCtx) return;
  cancelBG();
  bgRAF = requestAnimationFrame(drawBackground);
}

/**
 * Stop background animation loop
 */
function cancelBG() {
  if (bgRAF) cancelAnimationFrame(bgRAF);
  bgRAF = null;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle window resize
 */
function onResize() {
  const prevStep = STEP || 1;
  const ratio = SCROLL_X / (items.length * prevStep);
  measure();
  VW_HALF = stageHalfWidth();
  SCROLL_X = mod(ratio * TRACK, TRACK);
  updateCarouselTransforms();
  resizeBG();
}

if (stage) {
  // Mouse wheel scrolling
  stage.addEventListener(
    'wheel',
    (e) => {
      if (isEntering) return;
      e.preventDefault();

      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      vX += delta * WHEEL_SENS * 20;
    },
    { passive: false }
  );

  // Prevent default drag behavior
  stage.addEventListener('dragstart', (e) => e.preventDefault());

  // Drag state
  let dragging = false;
  let lastX = 0;
  let lastT = 0;
  let lastDelta = 0;

  // Pointer down - start dragging
  stage.addEventListener('pointerdown', (e) => {
    if (isEntering) return;
    if (e.target.closest('.frame')) return;

    dragging = true;
    lastX = e.clientX;
    lastT = performance.now();
    lastDelta = 0;
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('dragging');
  });

  // Pointer move - update scroll position
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;

    const now = performance.now();
    const dx = e.clientX - lastX;
    const dt = Math.max(1, now - lastT) / 1000;

    SCROLL_X = mod(SCROLL_X - dx * DRAG_SENS, TRACK);
    lastDelta = dx / dt; // Track velocity for momentum
    lastX = e.clientX;
    lastT = now;
  });

  // Pointer up - apply momentum
  stage.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    stage.releasePointerCapture(e.pointerId);
    vX = -lastDelta * DRAG_SENS; // Apply final velocity
    stage.classList.remove('dragging');
  });
}

// Debounced resize handler
window.addEventListener('resize', () => {
  clearTimeout(onResize._t);
  onResize._t = setTimeout(onResize, 80);
});

// Pause animations when tab is hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelCarousel();
    cancelBG();
  } else if (stage && items.length) {
    startCarousel();
    startBG();
  }
});

// ============================================================================
// INITIALIZATION & ENTRY ANIMATION
// ============================================================================

/**
 * Animate visible cards entering the scene
 * @param {Array} visibleCards - Cards to animate
 */
async function animateEntry(visibleCards) {
  await new Promise((r) => requestAnimationFrame(r));

  if (!window.gsap) {
    visibleCards.forEach(({ item, screenX }) => {
      const { transform } = transformForScreenX(screenX);
      item.el.style.opacity = '1';
      item.el.style.transform = transform;
    });
    return;
  }

  const tl = window.gsap.timeline();

  visibleCards.forEach(({ item, screenX }, idx) => {
    const state = { p: 0 }; // 0 -> 1
    const { ry, tz, scale: baseScale } = computeTransformComponents(screenX);

    const START_SCALE = 0.92;
    const START_Y = 40;

    item.el.style.opacity = '0';
    item.el.style.transform =
      `translate3d(${screenX}px,-50%,${tz}px) ` +
      `rotateY(${ry}deg) ` +
      `scale(${START_SCALE}) ` +
      `translateY(${START_Y}px)`;

    tl.to(
      state,
      {
        p: 1,
        duration: 0.6,
        ease: 'power3.out',
        onUpdate: () => {
          const t = state.p;

          const currentScale = START_SCALE + (baseScale - START_SCALE) * t;
          const currentY = START_Y * (1 - t);
          const opacity = t;

          item.el.style.opacity = opacity.toFixed(3);

          if (t >= 0.999) {
            const { transform } = transformForScreenX(screenX);
            item.el.style.transform = transform;
          } else {
            item.el.style.transform =
              `translate3d(${screenX}px,-50%,${tz}px) ` +
              `rotateY(${ry}deg) ` +
              `scale(${currentScale}) ` +
              `translateY(${currentY}px)`;
          }
        },
      },
      idx * 0.05
    );
  });

  await new Promise((resolve) => {
    tl.eventCallback('onComplete', resolve);
  });
}

/**
 * Pre-composite all card positions to prevent first-interaction jank
 */
async function warmupCompositing() {
 const originalScrollX = SCROLL_X;
 const stepSize = STEP * 0.5;
 const numSteps = Math.ceil(TRACK / stepSize);

 // Scroll through entire carousel to force GPU compositing
 for (let i = 0; i < numSteps; i++) {
 SCROLL_X = mod(originalScrollX + i * stepSize, TRACK);
 updateCarouselTransforms();

 // Force paint every few steps (optimization)
 if (i % 3 === 0) {
 await new Promise((r) => requestAnimationFrame(r));
 }
 }

 // Return to original position
 SCROLL_X = originalScrollX;
 updateCarouselTransforms();
 await new Promise((r) => requestAnimationFrame(r));
 await new Promise((r) => requestAnimationFrame(r));
}

/**
 * Initialize the carousel application
 */
async function init() {
  if (!stage || !cardsRoot) return;

  // Preload images for faster loading
  preloadImageLinks(IMAGES);

  // Create DOM elements
  createCards();
  measure();
  VW_HALF = stageHalfWidth();
  updateCarouselTransforms();
  stage.classList.add('carousel-mode');

  // Wait for all images to load
  await waitForImages();

  // Decode images to prevent jank
  await decodeAllImages();

  // Force browser to paint images
  items.forEach((it) => {
    const img = it.el.querySelector('img');
    if (img) void img.offsetHeight;
  });

  // Extract colors from images for gradients
  buildPalette();

  // Find and set initial centered card
  const half = TRACK / 2;
  let closestIdx = 0;
  let closestDist = Infinity;

  for (let i = 0; i < items.length; i++) {
    let pos = items[i].x - SCROLL_X;
    if (pos < -half) pos += TRACK;
    if (pos > half) pos -= TRACK;
    const d = Math.abs(pos);
    if (d < closestDist) {
      closestDist = d;
      closestIdx = i;
    }
  }

  setActiveGradient(closestIdx);

  // Initialize background canvas
  resizeBG();
  if (bgCtx) {
    const w = bgCanvas.clientWidth || stage.clientWidth;
    const h = bgCanvas.clientHeight || stage.clientHeight;
    bgCtx.fillStyle = '#ffffff';
    bgCtx.fillRect(0, 0, w, h);
  }

  // Warmup GPU compositing
  await warmupCompositing();

  // Wait for browser idle time
  if ('requestIdleCallback' in window) {
    await new Promise((r) => requestIdleCallback(r, { timeout: 100 }));
  }

  // Start background animation
  startBG();
  await new Promise((r) => setTimeout(r, 100)); // Let background settle

  // Prepare entry animation for visible cards
  const viewportWidth = (stage && stage.clientWidth) || window.innerWidth;
  const visibleCards = [];

  for (let i = 0; i < items.length; i++) {
    let pos = items[i].x - SCROLL_X;
    if (pos < -half) pos += TRACK;
    if (pos > half) pos -= TRACK;

    const screenX = pos;
    if (Math.abs(screenX) < viewportWidth * 0.6) {
      visibleCards.push({ item: items[i], screenX, index: i });
    }
  }

  // Sort cards left to right
  visibleCards.sort((a, b) => a.screenX - b.screenX);

  // Hide loader
  if (loader) loader.classList.add('loader--hide');

  // Animate cards entering
  await animateEntry(visibleCards);

  // Enable user interaction
  isEntering = false;

  // Start main carousel loop
  startCarousel();
}

// ============================================================================
// START APPLICATION
// ============================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}