// =============================================================================
// Nova — Looking Glass app : main.js
// -----------------------------------------------------------------------------
// SCAFFOLD STEP 5: Full elegance redesign — "digital goddess".
//
// Everything is rebuilt toward restraint and a real HUMANOID BUST silhouette:
//   GEOMETRY  : elongated skull-like head with a flattened face plane, a slim
//               tapered neck, and a single LATHE-revolved torso that gives
//               natural shoulders + chest as one continuous classical bust.
//   LIGHTING  : NO bloom, NO loud point lights. One cool key light (upper-left),
//               one dim purple fill (right). Materials only whisper-glow.
//   PARTICLES : sparse, tiny, twinkling star-dust — not fireworks.
//   BRAIN     : same idea, far more delicate — hairline lines, pinpoint nodes.
//   COLOR     : purple-dominant gradient; green is only a soft edge accent.
//
// Key technique reused here: VERTEX COLORS (per-corner tinting) for the gradient.
// Key technique introduced: LatheGeometry — revolving a 2D profile around an
// axis to "turn" a silhouette into a 3D form, like clay on a potter's wheel.
// =============================================================================

import * as THREE from "three";
import { initNovaChat } from "./nova-chat.js";

// -----------------------------------------------------------------------------
// STATE FLAG (kept for the future speech/Claude trigger)
// -----------------------------------------------------------------------------
let novaActive = false; // flip to make Nova subtly "wake up"
let activation = 0; // smoothed 0..1 version of novaActive

// -----------------------------------------------------------------------------
// COLORS / TOPICS
// -----------------------------------------------------------------------------
const WHITE = new THREE.Color(0xffffff);

// Topic palette. setTopic("sustainability") etc. smoothly retints Nova to one
// of these. The Claude API's topic detection will call setTopic() later.
const TOPIC_COLORS = {
  default: 0xa100ff, // Accenture purple
  sustainability: 0x00c9a7, // teal
  innovation: 0x00bfff, // electric blue
  operations: 0xffa500, // warm amber
};

// The color Nova is currently displaying. The tween eases this toward the
// chosen topic color, and every frame we repaint the body/edges/particles from
// it. Start on the default purple.
const displayColor = new THREE.Color(TOPIC_COLORS.default);

const STAR_WHITE = new THREE.Color(0xffffff);
const STAR_PINK = new THREE.Color(0xffb3d9); // soft pink
const NODE_WHITE = new THREE.Color(0xffffff);
const NODE_PINK = new THREE.Color(0xffb3d9);
const NODE_TEAL = new THREE.Color(0x66ffc2);

// -----------------------------------------------------------------------------
// 1. SCENE
// -----------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070010); // near-black purple

// -----------------------------------------------------------------------------
// 2. CAMERA — framed for the taller, full bust.
// -----------------------------------------------------------------------------
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0.6, 6.2);
camera.lookAt(0, 0.5, 0);

// -----------------------------------------------------------------------------
// 3. RENDERER — no post-processing anymore (bloom removed), so we render the
// scene straight to the screen with renderer.render() again.
// -----------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.body.appendChild(renderer.domElement);

// -----------------------------------------------------------------------------
// 4. LIGHTING — soft and cool, but bright enough to actually read.
// -----------------------------------------------------------------------------
// Ambient lifts the whole figure off the black background so she isn't a
// silhouette. Still cool/soft in character, just no longer near-zero.
scene.add(new THREE.AmbientLight(0x3a3358, 0.8));

// KEY: a soft, cool pale-blue-white light from the upper LEFT.
const keyLight = new THREE.DirectionalLight(0xcfe6ff, 1.8);
keyLight.position.set(-4, 5, 3);
scene.add(keyLight);

// FILL: a dim pale-purple light from the RIGHT to lift the shadows gently.
const fillLight = new THREE.DirectionalLight(0xc7a8ff, 0.7);
fillLight.position.set(5, 1, 2);
scene.add(fillLight);

// =============================================================================
// 5. COLOR HELPERS
// =============================================================================
// gradientT(): 0 = purple side (front-left), 1 = green side (back-right).
function gradientT(x, y, z) {
  return THREE.MathUtils.clamp((x - z) / 3.6 + 0.5, 0, 1);
}

// paintGradient(): write a per-vertex color gradient (colorA→colorB along the
// diagonal) into the geometry's "color" attribute. It REUSES the existing color
// attribute when present, so we can repaint every frame during a topic tween
// without allocating new arrays each time.
function paintGradient(geometry, offset, colorA, colorB) {
  const pos = geometry.attributes.position;
  let attr = geometry.getAttribute("color");
  if (!attr) {
    attr = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    geometry.setAttribute("color", attr);
  }
  const arr = attr.array;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = gradientT(
      pos.getX(i) + offset.x,
      pos.getY(i) + offset.y,
      pos.getZ(i) + offset.z
    );
    c.copy(colorA).lerp(colorB, t);
    arr[i * 3 + 0] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  attr.needsUpdate = true;
}

// Registries of the geometries we repaint when the topic color changes.
const bodyTargets = []; // { geom, offset } — the frosted-glass bodies
const edgeTargets = []; // { geom, offset } — the glowing edge lines

// paintBody(): retint ALL of Nova's body + edge geometry from one base color.
// We derive a small darker→lighter gradient around the base so she keeps her
// dimensional, faceted shading in whatever topic hue we give her.
const _bodyA = new THREE.Color();
const _bodyB = new THREE.Color();
const _edgeA = new THREE.Color();
const _edgeB = new THREE.Color();
function paintBody(base) {
  _bodyA.copy(base).multiplyScalar(0.7); // shaded side (darker)
  _bodyB.copy(base).lerp(WHITE, 0.45); // lit side (toward white)
  for (const { geom, offset } of bodyTargets) paintGradient(geom, offset, _bodyA, _bodyB);

  _edgeA.copy(base).lerp(WHITE, 0.15); // edge glow, dim end
  _edgeB.copy(base).lerp(WHITE, 0.6); // edge glow, bright end
  for (const { geom, offset } of edgeTargets) paintGradient(geom, offset, _edgeA, _edgeB);
}

// Frosted-glass material — now with only a SUBTLE emissive whisper (no bloom to
// amplify it), so Nova glows softly from within rather than radiating.
function makeGlassMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true, // purple→green gradient lives in the vertices
    metalness: 0.0,
    roughness: 0.45,
    // PARTIAL transmission (not 1.0): full transmission made her a clear window
    // onto the black background, so she looked black. At 0.5 the frosted-glass
    // feel remains, but her purple body color and emissive glow now show.
    transmission: 0.5,
    thickness: 0.8,
    ior: 1.3,
    transparent: true,
    emissive: 0x3a1066, // purple self-glow — "lit from within"
    emissiveIntensity: 0.55,
    flatShading: true, // low-poly facets
    side: THREE.DoubleSide,
  });
}

// =============================================================================
// 6. BUILDING NOVA — a continuous humanoid bust
// =============================================================================
const nova = new THREE.Group();
scene.add(nova);

// addFacetedPart(): glass body + ultra-faint "hairline crack" wireframe + a
// low-opacity edge accent. The pieces are positioned to OVERLAP/interpenetrate
// so they read as one carved sculpture, not separate floating parts.
function addFacetedPart(geometry, position, edgeAngle = 20) {
  // Register this body geometry so paintBody() can retint it on topic changes.
  bodyTargets.push({ geom: geometry, offset: position });

  const mesh = new THREE.Mesh(geometry, makeGlassMaterial());
  mesh.position.copy(position);
  nova.add(mesh);

  // Hairline wireframe — like fine cracks in crystal (extremely faint).
  const wireframe = new THREE.LineSegments(
    new THREE.WireframeGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05 })
  );
  wireframe.position.copy(position);
  nova.add(wireframe);

  // Edge accent lines (also registered so they retint with the topic).
  const edgeGeometry = new THREE.EdgesGeometry(geometry, edgeAngle);
  edgeTargets.push({ geom: edgeGeometry, offset: position });
  const edgeMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
  });
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edges.position.copy(position);
  nova.add(edges);

  return edgeMaterial; // returned so the loop can gently vary its opacity
}

const edgeMaterials = [];

// --- 6a. HEAD ----------------------------------------------------------------
// Start from an icosahedron, then SCALE it taller-than-wide (1.0 × 1.2 × 1.0)
// for a skull-like proportion, and FLATTEN the front so there's an implied face.
const headGeometry = new THREE.IcosahedronGeometry(0.62, 1);
headGeometry.scale(1.0, 1.2, 1.0); // elongate vertically (taller skull)

// Flatten the front face: push the front-facing vertices (z > 0) back toward
// the center. This creates a subtly flat "facial plane" so Nova has a clear
// front/face direction instead of being a perfect ball.
{
  const pos = headGeometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z > 0) pos.setZ(i, z * 0.8); // compress the front hemisphere
  }
  pos.needsUpdate = true;
}
edgeMaterials.push(addFacetedPart(headGeometry, new THREE.Vector3(0, 1.0, 0)));

// --- 6b. NECK ----------------------------------------------------------------
// A slim, elegant tapered cylinder: narrow at the top (under the jaw), a touch
// wider at the base where it meets the shoulders.
const neckGeometry = new THREE.CylinderGeometry(0.15, 0.26, 0.6, 8);
edgeMaterials.push(addFacetedPart(neckGeometry, new THREE.Vector3(0, 0.4, 0)));

// --- 6c. TORSO (shoulders + chest as ONE lathe-revolved form) ----------------
// LatheGeometry revolves a 2D profile (a list of x=radius, y=height points)
// around the Y axis. By shaping the profile we sculpt a classical bust: a
// narrowish cut base at the bottom, widening through the chest to the broad
// shoulders, then curving back inward up to the neck. Revolving it makes the
// shoulders sweep naturally outward (a smooth curve, not a flat cone).
const torsoProfile = [
  new THREE.Vector2(0.0, 0.0), // bottom center (caps the underside)
  new THREE.Vector2(0.52, 0.0), // bottom edge — the "cut" base of the bust
  new THREE.Vector2(0.6, 0.18), // narrowing slightly at the very bottom
  new THREE.Vector2(0.78, 0.5), // chest
  new THREE.Vector2(0.95, 0.85), // widest point — the shoulders
  new THREE.Vector2(0.88, 1.05), // shoulder begins curving up
  new THREE.Vector2(0.5, 1.22), // sweeping in toward the neck
  new THREE.Vector2(0.24, 1.32), // neck base
];
// 12 radial segments keeps it gently faceted to match the head's low-poly feel.
const torsoGeometry = new THREE.LatheGeometry(torsoProfile, 12);
// Make her WIDER than DEEP (scale X up, Z down) so the silhouette reads as a
// human torso with distinct left/right shoulders rather than a round tube.
torsoGeometry.scale(1.18, 1.0, 0.82);
// Place so the profile's neck base (local y≈1.32) overlaps the neck bottom.
edgeMaterials.push(addFacetedPart(torsoGeometry, new THREE.Vector3(0, -1.0, 0), 30));

// All body/edge geometries are registered now — do the initial paint so they
// have their color attributes before the first render (starts on default purple).
paintBody(displayColor);

// --- 6d. ACCENTURE ">" CHEST DECAL ------------------------------------------
// We map the logo onto a small plane sitting just in front of Nova's chest. The
// plane is a CHILD of `nova`, so it rotates and breathes along with her body.
//
// The real logo PNG lives in /public/assets. We don't use it raw for two
// reasons: (1) it's cropped tight to the image edges, so on a plane the chevron
// would look like a wedge — we pad it; (2) it's solid purple, which is nearly
// invisible when additive-blended over Nova's purple body — so we bake in a soft
// pink glow HALO and render it bright. MeshBasicMaterial is always full-bright
// (ignores lighting), so with additive blending the decal reads as emissive.
const logoMaterial = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0.95,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  // depthTest:false means the glass body can never hide the decal — it always
  // draws on top of the chest. (This is why it was invisible before: the front
  // glass face was occluding the plane.)
  depthTest: false,
  side: THREE.DoubleSide,
});
// BRIGHTNESS: `color` multiplies the texture; pushing channels ABOVE 1 over-
// drives the additive glow so the logo clearly stands out. Leaning the red/blue
// higher than green keeps it a vivid pink-magenta.
logoMaterial.color.setRGB(2.4, 1.5, 2.4);

// Load the PNG ourselves (via a plain Image) so we can repaint it onto a canvas
// with padding + a glow halo, then hand that canvas to Three.js as a texture.
const logoImage = new Image();
logoImage.onload = () => {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Draw the chevron centered at 72% size so its arms get breathing room.
  const s = size * 0.72;
  const off = (size - s) / 2;

  // Bake a soft pink glow into the texture; drawing twice strengthens it.
  ctx.shadowColor = "#ff79c0";
  ctx.shadowBlur = 38;
  ctx.drawImage(logoImage, off, off, s, s);
  ctx.drawImage(logoImage, off, off, s, s);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  logoMaterial.map = tex;
  logoMaterial.needsUpdate = true; // tell Three.js the material now has a texture
};
// Vite serves the /public folder at the site root, so this path resolves to
// public/assets/accenture-logo.png.
logoImage.src = "/assets/accenture-logo.png";

const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), logoMaterial);
logo.position.set(0, -0.12, 0.72); // centered on the chest, clearly in front of it
logo.renderOrder = 10; // draw last so it sits on top of everything else
nova.add(logo);

// =============================================================================
// 7. STAR-DUST PARTICLES — sparse, tiny, twinkling
// =============================================================================
// Far fewer particles than before, scattered in a wide loose shell so they read
// as distant motes, not a cloud. Each one twinkles independently by gently
// varying its brightness over time.
const STAR_COUNT = 140;
const starCenter = new THREE.Vector3(0, 0.4, 0);

// Per-particle spherical drift + twinkle data.
const sTheta = new Float32Array(STAR_COUNT);
const sPhi = new Float32Array(STAR_COUNT);
const sRadius = new Float32Array(STAR_COUNT);
const sThetaSpeed = new Float32Array(STAR_COUNT);
const sPhiSpeed = new Float32Array(STAR_COUNT);
const sTwinkleSpeed = new Float32Array(STAR_COUNT);
const sTwinklePhase = new Float32Array(STAR_COUNT);
const sBaseColor = []; // THREE.Color per particle
const sIsAccent = []; // true = "topic-colored" particle, false = plain white

const starPositions = new Float32Array(STAR_COUNT * 3);
const starColors = new Float32Array(STAR_COUNT * 3);

for (let i = 0; i < STAR_COUNT; i++) {
  sTheta[i] = Math.random() * Math.PI * 2;
  sPhi[i] = Math.acos(2 * Math.random() - 1);
  sRadius[i] = 2.2 + Math.random() * 2.0; // wide, loose shell (2.2..4.2)
  sThetaSpeed[i] = (Math.random() - 0.5) * 0.06; // VERY slow drift
  sPhiSpeed[i] = (Math.random() - 0.5) * 0.03;
  sTwinkleSpeed[i] = 0.4 + Math.random() * 0.8; // independent fade rate
  sTwinklePhase[i] = Math.random() * Math.PI * 2;
  // ~22% of particles are "accent" — they take the current TOPIC color; the
  // rest stay white. paintParticles() (below) fills in the accent color.
  sIsAccent[i] = Math.random() >= 0.78;
  sBaseColor[i] = STAR_WHITE.clone();
}

// paintParticles(): set the accent particles to a soft tint of the base color.
// White particles are left alone, so the field reads as "white + topic accent".
const _pAccent = new THREE.Color();
function paintParticles(base) {
  _pAccent.copy(base).lerp(WHITE, 0.3); // softened so it's not harshly saturated
  for (let i = 0; i < STAR_COUNT; i++) {
    if (sIsAccent[i]) sBaseColor[i].copy(_pAccent);
  }
}
paintParticles(displayColor); // initial accent color (default purple)

// applyTopic(): repaint everything that responds to the topic, from one color.
function applyTopic(base) {
  paintBody(base);
  paintParticles(base);
}

const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(starPositions, 3).setUsage(THREE.DynamicDrawUsage)
);
starGeometry.setAttribute(
  "color",
  new THREE.BufferAttribute(starColors, 3).setUsage(THREE.DynamicDrawUsage)
);

// A small, fairly sharp round sprite so each particle reads as a pinpoint star.
function makeStarTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.5)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const starMaterial = new THREE.PointsMaterial({
  size: 0.035, // tiny
  map: makeStarTexture(),
  vertexColors: true,
  transparent: true,
  opacity: 0.5, // capped low — these are faint
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
});
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

// =============================================================================
// 8. NEURAL NETWORK ABOVE THE HEAD — delicate "thought patterns"
// =============================================================================
// Same concept as before but dialled WAY down: pinpoint nodes (drawn as Points,
// not spheres) and hairline connection lines at low opacity.
const brain = new THREE.Group();
brain.position.set(0, 2.55, 0); // floats above the head (head top ≈ 1.7)
scene.add(brain);

const NODE_COUNT = 30;
const LINK_DISTANCE = 1.0;
const nodeBase = [];
const nodePhase = [];
const nodeFreq = [];
const nodeAmp = new Float32Array(NODE_COUNT);
const nodePositions = new Float32Array(NODE_COUNT * 3);
const nodeColors = new Float32Array(NODE_COUNT * 3);
const nodePalette = [NODE_WHITE, NODE_PINK, NODE_TEAL];

for (let i = 0; i < NODE_COUNT; i++) {
  nodeBase.push(
    new THREE.Vector3(
      (Math.random() - 0.5) * 2.0,
      (Math.random() - 0.5) * 0.9,
      (Math.random() - 0.5) * 2.0
    )
  );
  nodePhase.push(
    new THREE.Vector3(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    )
  );
  nodeFreq.push(
    new THREE.Vector3(
      0.3 + Math.random() * 0.4,
      0.3 + Math.random() * 0.4,
      0.3 + Math.random() * 0.4
    )
  );
  nodeAmp[i] = 0.12 + Math.random() * 0.1;
  // Faint node color (multiplied down so the pinpoints glow softly).
  const c = nodePalette[i % nodePalette.length];
  nodeColors[i * 3 + 0] = c.r * 0.8;
  nodeColors[i * 3 + 1] = c.g * 0.8;
  nodeColors[i * 3 + 2] = c.b * 0.8;
}

const nodeGeometry = new THREE.BufferGeometry();
nodeGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(nodePositions, 3).setUsage(THREE.DynamicDrawUsage)
);
nodeGeometry.setAttribute("color", new THREE.BufferAttribute(nodeColors, 3));
const nodeMaterial = new THREE.PointsMaterial({
  size: 0.04, // tiny glowing points (no spheres)
  map: makeStarTexture(),
  vertexColors: true,
  transparent: true,
  opacity: 0.8,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
});
const nodePoints = new THREE.Points(nodeGeometry, nodeMaterial);
brain.add(nodePoints);

// Hairline connection lines.
const pairs = [];
for (let a = 0; a < NODE_COUNT; a++) {
  for (let b = a + 1; b < NODE_COUNT; b++) pairs.push([a, b]);
}
const linePositions = new Float32Array(pairs.length * 2 * 3);
const lineColors = new Float32Array(pairs.length * 2 * 3);
const lineGeometry = new THREE.BufferGeometry();
lineGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage)
);
lineGeometry.setAttribute(
  "color",
  new THREE.BufferAttribute(lineColors, 3).setUsage(THREE.DynamicDrawUsage)
);
const lineMaterial = new THREE.LineBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.25, // delicate
  blending: THREE.AdditiveBlending,
});
const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
brain.add(lineSegments);
// Line color = faint blend of its two endpoints' node colors.
const pairBaseColors = pairs.map(([a, b]) => {
  const ca = nodePalette[a % nodePalette.length];
  const cb = nodePalette[b % nodePalette.length];
  return ca.clone().lerp(cb, 0.5).multiplyScalar(0.55); // dimmed for delicacy
});

// =============================================================================
// 9. RESIZE
// =============================================================================
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// =============================================================================
// 10. TEMPORARY active/idle toggle (Space or "A") — stand-in for speech later.
// =============================================================================
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.key.toLowerCase() === "a") {
    novaActive = !novaActive;
    console.log("novaActive =", novaActive);
  }
});
window.setNovaActive = (v) => {
  novaActive = !!v;
};

// =============================================================================
// 10b. TOPIC COLOR SYSTEM
// -----------------------------------------------------------------------------
// setTopic(name) starts an ~800ms smooth tween of `displayColor` toward the
// chosen topic's color. The animation loop drives the tween and repaints Nova's
// body, edges, and accent particles from `displayColor` each frame.
//
// The Claude API topic detection will call this later, e.g. setTopic("operations").
// =============================================================================
const TOPIC_TWEEN_MS = 800;
let topicTween = null; // { from: Color, to: Color, start: seconds }

function setTopic(topic) {
  const hex = TOPIC_COLORS[topic];
  if (hex === undefined) {
    console.warn(
      `setTopic: unknown topic "${topic}". Valid: ${Object.keys(TOPIC_COLORS).join(", ")}`
    );
    return;
  }
  // Tween FROM whatever we're showing now TO the new topic color.
  topicTween = {
    from: displayColor.clone(),
    to: new THREE.Color(hex),
    start: elapsed,
  };
  console.log(`setTopic("${topic}")`);
}
// Expose for the Claude layer and for manual testing from the console.
window.setTopic = setTopic;

// Preview helper: number keys 1–4 switch topics.
const TOPIC_KEYS = { 1: "default", 2: "sustainability", 3: "innovation", 4: "operations" };
window.addEventListener("keydown", (e) => {
  if (TOPIC_KEYS[e.key]) setTopic(TOPIC_KEYS[e.key]);
});

// =============================================================================
// 11. ANIMATION
// =============================================================================
const clock = new THREE.Clock();
let elapsed = 0;
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  elapsed += dt;
  const t = elapsed;

  // Ease activation toward the target (subtle now — no bloom to drive).
  activation += ((novaActive ? 1 : 0) - activation) * Math.min(1, dt * 3.0);

  // --- TOPIC COLOR TWEEN ----------------------------------------------------
  // While a tween is active, interpolate displayColor and repaint Nova from it.
  if (topicTween) {
    const p = Math.min(1, ((elapsed - topicTween.start) * 1000) / TOPIC_TWEEN_MS);
    const eased = p * p * (3 - 2 * p); // smoothstep — gentle ease in/out
    displayColor.copy(topicTween.from).lerp(topicTween.to, eased);
    applyTopic(displayColor); // retint body + edges + accent particles
    if (p >= 1) topicTween = null; // tween finished
  }

  // --- NOVA: gentle breathing + slow rotation, plus a barely-there edge lift --
  const breath = 1 + Math.sin(t * 1.1) * 0.012;
  nova.scale.set(breath, breath, breath);
  nova.rotation.y += 0.0022;

  const edgePulse = 0.18 + ((Math.sin(t * 1.5) + 1) / 2) * 0.1 + activation * 0.15;
  for (const mat of edgeMaterials) mat.opacity = edgePulse;

  // Chest logo pulses IN SYNC with breathing: we reuse the same 1.1 frequency
  // as `breath` above, so the glow swells and the decal scales on every breath.
  const breathPhase = (Math.sin(t * 1.1) + 1) / 2; // 0..1, same rhythm as breath
  // Higher floor (0.75) keeps the logo clearly visible even at the dim end of
  // the breath; it still swells toward 1.0 on each inhale.
  logoMaterial.opacity = 0.75 + breathPhase * 0.25 + activation * 0.1;
  logo.scale.setScalar(1 + breathPhase * 0.06); // subtle "breathing" size pulse

  // --- STARS: slow drift + independent twinkle ------------------------------
  // Active state nudges the drift a little faster and brightens twinkle slightly
  // (kept subtle to preserve the calm mood).
  const speedMul = 1 + activation * 1.2;
  const spread = 1 + activation * 0.15;
  for (let i = 0; i < STAR_COUNT; i++) {
    sTheta[i] += sThetaSpeed[i] * dt * speedMul;
    sPhi[i] += sPhiSpeed[i] * dt * speedMul;
    const r = sRadius[i] * spread;
    const sinPhi = Math.sin(sPhi[i]);
    starPositions[i * 3 + 0] = starCenter.x + r * sinPhi * Math.cos(sTheta[i]);
    starPositions[i * 3 + 1] = starCenter.y + r * Math.cos(sPhi[i]);
    starPositions[i * 3 + 2] = starCenter.z + r * sinPhi * Math.sin(sTheta[i]);

    // Twinkle: brightness oscillates 0..1, mapped into a faint 0.15..0.5 range.
    const tw = (Math.sin(t * sTwinkleSpeed[i] + sTwinklePhase[i]) + 1) / 2;
    const level = 0.15 + tw * (0.35 + activation * 0.15);
    const c = sBaseColor[i];
    starColors[i * 3 + 0] = c.r * level;
    starColors[i * 3 + 1] = c.g * level;
    starColors[i * 3 + 2] = c.b * level;
  }
  starGeometry.attributes.position.needsUpdate = true;
  starGeometry.attributes.color.needsUpdate = true;

  // --- BRAIN: drift nodes, fade hairline links, slow independent rotation ----
  for (let i = 0; i < NODE_COUNT; i++) {
    const base = nodeBase[i];
    const ph = nodePhase[i];
    const fr = nodeFreq[i];
    nodePositions[i * 3 + 0] = base.x + Math.sin(t * fr.x + ph.x) * nodeAmp[i];
    nodePositions[i * 3 + 1] = base.y + Math.sin(t * fr.y + ph.y) * nodeAmp[i];
    nodePositions[i * 3 + 2] = base.z + Math.sin(t * fr.z + ph.z) * nodeAmp[i];
  }
  nodeGeometry.attributes.position.needsUpdate = true;

  for (let i = 0; i < pairs.length; i++) {
    const [a, b] = pairs[i];
    tmpA.set(nodePositions[a * 3], nodePositions[a * 3 + 1], nodePositions[a * 3 + 2]);
    tmpB.set(nodePositions[b * 3], nodePositions[b * 3 + 1], nodePositions[b * 3 + 2]);
    const strength = Math.max(0, 1 - tmpA.distanceTo(tmpB) / LINK_DISTANCE);
    const pIndex = i * 6;
    linePositions[pIndex + 0] = tmpA.x;
    linePositions[pIndex + 1] = tmpA.y;
    linePositions[pIndex + 2] = tmpA.z;
    linePositions[pIndex + 3] = tmpB.x;
    linePositions[pIndex + 4] = tmpB.y;
    linePositions[pIndex + 5] = tmpB.z;
    const c = pairBaseColors[i];
    const r = c.r * strength, g = c.g * strength, bl = c.b * strength;
    lineColors[pIndex + 0] = r; lineColors[pIndex + 1] = g; lineColors[pIndex + 2] = bl;
    lineColors[pIndex + 3] = r; lineColors[pIndex + 4] = g; lineColors[pIndex + 5] = bl;
  }
  lineGeometry.attributes.position.needsUpdate = true;
  lineGeometry.attributes.color.needsUpdate = true;
  brain.rotation.y += 0.0010;
  brain.position.y = 2.55 + Math.sin(t * 0.5) * 0.06;

  renderer.render(scene, camera);
}

animate();

// =============================================================================
// 12. CONNECT NOVA'S BRAIN + VOICE
// -----------------------------------------------------------------------------
// Wire the Claude/TTS layer to the 3D scene:
//   - onTopic   → setTopic() smoothly retints Nova to the detected topic.
//   - onSpeaking→ sets novaActive so the particles/edges/glow react while she
//                 talks, then settle when she stops.
// =============================================================================
initNovaChat({
  onTopic: (topic) => setTopic(topic),
  onSpeaking: (isSpeaking) => {
    novaActive = isSpeaking;
  },
});
