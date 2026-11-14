import * as THREE from "three";
import { OrbitControls } from "./OrbitControls.js";

const stage = document.getElementById("model-stage");
const statusNode = document.getElementById("scene-status");
const detailNode = document.getElementById("room-detail");
const planGroup = document.getElementById("plan-rooms");
const viewButtons = [...document.querySelectorAll("[data-view]")];
const actionButtons = [...document.querySelectorAll("[data-action]")];
const roomButtons = [...document.querySelectorAll("[data-room]")];

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const roomMeta = {
  bedroom: { label: "卧室", detail: "约 4.8 × 3.5 m，左侧；双人床靠南墙，书桌位于床头柜旁，衣柜与壁炉沿北墙布置。" },
  bath: { label: "浴室", detail: "约 1.9 × 1.9 m，上方中部；淋浴、马桶和洗手盆均保持在墙体内。" },
  living: { label: "客餐厅", detail: "约 4.1 × 3.5 m，右上方；沙发位于西北角并双面贴墙，圆餐桌靠近东侧阳台。" },
  kitchen: { label: "厨房", detail: "约 4.1 × 1.5 m，右下方；0.58 m 深台面沿南墙，岛台面向客餐厅。" },
  hall: { label: "门厅", detail: "约 2.0 × 1.5 m，下部中央；入户门左侧靠墙布置鞋柜。" },
  balcony: { label: "阳台", detail: "约 1.2 × 2.4 m，最右侧；木地板、玻璃栏板、折叠木椅和小桌。" },
};

const cameraViews = {
  all: { camera: [8.6, 7.2, 10.0], target: [0, 0.72, 0] },
  allMobile: { camera: [12.8, 10.8, 14.4], target: [0, 0.72, 0] },
  bedroom: { camera: [-1.8, 7.2, 8.2], target: [-3.10, 0.74, -0.72] },
  living: { camera: [8.3, 7.0, 9.0], target: [2.82, 0.82, -0.82] },
  kitchen: { camera: [8.6, 6.2, 11.4], target: [3.18, 0.62, 1.62] },
  bath: { camera: [4.3, 6.2, 6.0], target: [0.22, 0.72, -1.34] },
  balcony: { camera: [13.4, 6.0, 7.0], target: [5.48, 0.55, -0.22] },
};

let renderer;
let scene;
let camera;
let controls;
let world;
let labels;
let raycaster;
let pointer;
let cameraTween = null;
let cutaway = true;
let labelsVisible = true;
let selectedRoom = "living";
let pointerDown = null;
let started = false;
let currentView = "all";
let animationRunning = false;
let interactionActive = false;

const cutWalls = [];
const roomFloors = new Map();
const interactive = [];
const labelSprites = [];

function makeCanvasTexture(draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  draw(context, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  return texture;
}

const woodTexture = makeCanvasTexture((ctx, width, height) => {
  ctx.fillStyle = "#d6bb94";
  ctx.fillRect(0, 0, width, height);
  for (let y = 0; y < height; y += 64) {
    ctx.fillStyle = y % 128 === 0 ? "#d1b58c" : "#dcc29c";
    ctx.fillRect(0, y, width, 62);
    ctx.strokeStyle = "rgba(105,75,44,.13)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, y, width, 62);
  }
  ctx.strokeStyle = "rgba(105,75,44,.12)";
  for (let i = 0; i < 50; i += 1) {
    const y = (i * 29) % height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(150, y - 5, 340, y + 7, width, y);
    ctx.stroke();
  }
}, 4.5, 2.3);

const deckTexture = makeCanvasTexture((ctx, width, height) => {
  ctx.fillStyle = "#b98455";
  ctx.fillRect(0, 0, width, height);
  for (let x = 0; x < width; x += 52) {
    ctx.fillStyle = x % 104 === 0 ? "#a87549" : "#c68f5c";
    ctx.fillRect(x, 0, 48, height);
    ctx.strokeStyle = "rgba(66,39,23,.24)";
    ctx.strokeRect(x, 0, 48, height);
  }
}, 2.2, 4.2);

const tileTexture = makeCanvasTexture((ctx, width, height) => {
  ctx.fillStyle = "#eeeae3";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(150,146,139,.45)";
  ctx.lineWidth = 2;
  for (let y = 0; y <= height; y += 42) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    const shift = (y / 42) % 2 ? 34 : 0;
    for (let x = shift; x <= width; x += 68) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 42);
      ctx.stroke();
    }
  }
}, 2, 2);

const brickTexture = makeCanvasTexture((ctx, width, height) => {
  ctx.fillStyle = "#b86743";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(238,206,176,.68)";
  ctx.lineWidth = 4;
  for (let y = 0; y < height; y += 42) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    const shift = (y / 42) % 2 ? 32 : 0;
    for (let x = shift; x < width; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 42);
      ctx.stroke();
    }
  }
}, 1.4, 2.4);

const materials = {
  wall: new THREE.MeshStandardMaterial({ color: 0xf3eee5, roughness: 0.94 }),
  wallCool: new THREE.MeshStandardMaterial({ color: 0xe8e5de, roughness: 0.94 }),
  cut: new THREE.MeshStandardMaterial({ color: 0xded8cd, roughness: 0.92 }),
  slab: new THREE.MeshStandardMaterial({ color: 0x7e6a55, roughness: 0.95 }),
  wood: new THREE.MeshStandardMaterial({ map: woodTexture, color: 0xffffff, roughness: 0.8 }),
  deck: new THREE.MeshStandardMaterial({ map: deckTexture, color: 0xffffff, roughness: 0.88 }),
  tile: new THREE.MeshStandardMaterial({ map: tileTexture, color: 0xffffff, roughness: 0.72 }),
  stone: new THREE.MeshStandardMaterial({ color: 0xe7dfd2, roughness: 0.82 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.78 }),
  cream: new THREE.MeshStandardMaterial({ color: 0xe9e1d3, roughness: 0.96 }),
  ivory: new THREE.MeshStandardMaterial({ color: 0xf1eadf, roughness: 0.94 }),
  taupe: new THREE.MeshStandardMaterial({ color: 0xb7a793, roughness: 0.9 }),
  sage: new THREE.MeshStandardMaterial({ color: 0x71806d, roughness: 0.9 }),
  rust: new THREE.MeshStandardMaterial({ color: 0xa85e3e, roughness: 0.92 }),
  oak: new THREE.MeshStandardMaterial({ color: 0x9e7047, roughness: 0.84 }),
  darkOak: new THREE.MeshStandardMaterial({ color: 0x4b3225, roughness: 0.82 }),
  charcoal: new THREE.MeshStandardMaterial({ color: 0x202320, roughness: 0.72 }),
  black: new THREE.MeshStandardMaterial({ color: 0x111211, roughness: 0.65 }),
  mustard: new THREE.MeshStandardMaterial({ color: 0xd6a12a, roughness: 0.74 }),
  teal: new THREE.MeshStandardMaterial({ color: 0x4baeb4, roughness: 0.74 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8b918e, metalness: 0.74, roughness: 0.3 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xb98a42, metalness: 0.7, roughness: 0.3 }),
  brick: new THREE.MeshStandardMaterial({ map: brickTexture, color: 0xffffff, roughness: 0.9 }),
  fire: new THREE.MeshStandardMaterial({ color: 0xffb43d, emissive: 0xff641e, emissiveIntensity: 2.5, roughness: 0.4 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xbfd4d4,
    transparent: true,
    opacity: 0.26,
    roughness: 0.08,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
  showerGlass: new THREE.MeshPhysicalMaterial({
    color: 0xdde9e8,
    transparent: true,
    opacity: 0.19,
    roughness: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
};

function addBox(parent, { x, z, w, d, h, y = 0, material, room, edges = false, cast = true, receive = true }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x + w / 2, y + h / 2, z + d / 2);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  if (room) mesh.userData.room = room;
  if (edges) {
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, 24),
      new THREE.LineBasicMaterial({ color: 0x665f55, transparent: true, opacity: 0.2 })
    );
    outline.raycast = () => {};
    mesh.add(outline);
  }
  parent.add(mesh);
  if (room) interactive.push(mesh);
  return mesh;
}

function addCylinder(parent, { x, z, rTop, rBottom = rTop, h, y = 0, material, room, segments = 32, rotation = [0, 0, 0] }) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
  mesh.position.set(x, y + h / 2, z);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (room) mesh.userData.room = room;
  parent.add(mesh);
  if (room) interactive.push(mesh);
  return mesh;
}

function addPlane(parent, { x, z, w, d, y = 0, material, room, rotation = [-Math.PI / 2, 0, 0] }) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  mesh.position.set(x + w / 2, y, z + d / 2);
  mesh.rotation.set(...rotation);
  mesh.receiveShadow = true;
  if (room) mesh.userData.room = room;
  parent.add(mesh);
  if (room) interactive.push(mesh);
  return mesh;
}

function addWallZ({ z, x, width, height, material = materials.wall, cut = false, cutHeight = 0.34, fullHeight = height }) {
  const visibleCutHeight = Math.min(cutHeight, fullHeight);
  const mesh = addBox(world, {
    x,
    z,
    w: width,
    d: 0.12,
    h: cut ? fullHeight : height,
    material,
    receive: true,
  });
  if (cut) {
    mesh.scale.y = visibleCutHeight / fullHeight;
    mesh.position.y = visibleCutHeight / 2;
    cutWalls.push({ mesh, cutHeight: visibleCutHeight, fullHeight });
  }
  return mesh;
}

function addWallX({ x, z, depth, height, material = materials.wall, cut = false, cutHeight = 0.34, fullHeight = height }) {
  const visibleCutHeight = Math.min(cutHeight, fullHeight);
  const mesh = addBox(world, {
    x,
    z,
    w: 0.12,
    d: depth,
    h: cut ? fullHeight : height,
    material,
    receive: true,
  });
  if (cut) {
    mesh.scale.y = visibleCutHeight / fullHeight;
    mesh.position.y = visibleCutHeight / 2;
    cutWalls.push({ mesh, cutHeight: visibleCutHeight, fullHeight });
  }
  return mesh;
}

function addFrame(parent, x, y, z, w, h, material = materials.white) {
  const t = 0.045;
  addBox(parent, { x, z, y, w, d: t, h: t, material, cast: false });
  addBox(parent, { x, z, y: y + h - t, w, d: t, h: t, material, cast: false });
  addBox(parent, { x, z, y, w: t, d: t, h, material, cast: false });
  addBox(parent, { x: x + w - t, z, y, w: t, d: t, h, material, cast: false });
}

function addFrameEast(parent, x, y, z, d, h, material = materials.white) {
  const t = 0.045;
  addBox(parent, { x, z, y, w: t, d, h: t, material, cast: false });
  addBox(parent, { x, z, y: y + h - t, w: t, d, h: t, material, cast: false });
  addBox(parent, { x, z, y, w: t, d: t, h, material, cast: false });
  addBox(parent, { x, z: z + d - t, y, w: t, d: t, h, material, cast: false });
}

function addRug(x, z, w, d, room, color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  const rug = addPlane(world, { x, z, w, d, y: 0.255, material: mat, room });
  rug.receiveShadow = true;
  return rug;
}

function addDiningChair(x, z, rotation = 0, room = "living") {
  const group = new THREE.Group();
  group.position.set(x, 0.25, z);
  group.rotation.y = rotation;
  group.userData.room = room;

  addBox(group, { x: -0.22, z: -0.22, w: 0.44, d: 0.44, h: 0.07, y: 0.40, material: materials.charcoal, room });
  for (const lx of [-0.17, 0.14]) {
    for (const lz of [-0.17, 0.14]) {
      addBox(group, { x: lx, z: lz, w: 0.035, d: 0.035, h: 0.40, material: materials.black, room });
    }
  }
  addBox(group, { x: -0.20, z: 0.18, w: 0.40, d: 0.055, h: 0.46, y: 0.44, material: materials.black, room });
  for (const lx of [-0.18, 0.14]) {
    addBox(group, { x: lx, z: 0.18, w: 0.04, d: 0.04, h: 0.46, y: 0.44, material: materials.black, room });
  }
  world.add(group);
  return group;
}

function addPlant(x, z, scale = 1, room) {
  const group = new THREE.Group();
  group.position.set(x, 0.23, z);
  group.userData.room = room;
  const pot = addCylinder(group, { x: 0, z: 0, rTop: 0.14 * scale, rBottom: 0.10 * scale, h: 0.24 * scale, material: materials.rust, room });
  pot.castShadow = true;
  for (let i = 0; i < 8; i += 1) {
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.09 * scale, 10, 8),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0x52704d : 0x68865c, roughness: 0.92 })
    );
    const angle = (i / 8) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 0.12 * scale, 0.30 * scale + (i % 3) * 0.06 * scale, Math.sin(angle) * 0.12 * scale);
    leaf.scale.set(0.62, 1.25, 0.45);
    leaf.rotation.z = angle;
    leaf.castShadow = true;
    leaf.userData.room = room;
    group.add(leaf);
    interactive.push(leaf);
  }
  world.add(group);
  return group;
}

function makeLabel(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.beginPath();
  ctx.roundRect(10, 10, 364, 76, 28);
  ctx.fill();
  ctx.strokeStyle = "rgba(20,20,20,.18)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#171717";
  ctx.font = "500 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 192, 50);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.22, 0.305, 1);
  return sprite;
}

function init() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (error) {
    stage.dataset.webgl = "error";
    statusNode.textContent = "当前浏览器无法显示实时三维模型，已显示静态视图。";
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");
  stage.prepend(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(33, 1, 0.1, 100);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 5.5;
  controls.maxDistance = 22;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minPolarAngle = Math.PI * 0.12;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  world = new THREE.Group();
  world.position.set(-5.7, 0, -2.675);
  scene.add(world);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xc7bfb4, 2.4);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff3dc, 3.8);
  key.position.set(7, 12, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  key.shadow.bias = -0.0002;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdbe5ff, 1.5);
  fill.position.set(-6, 7, -7);
  scene.add(fill);

  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 14),
    new THREE.ShadowMaterial({ color: 0x181714, opacity: 0.18 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(0, -0.012, 0);
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  buildHouse();
  buildLabels();
  drawPlan();
  bindUi();
  setRoom("living", false);
  resize();
  setCameraView("all", true);
  started = true;
  stage.dataset.ready = "true";
  statusNode.textContent = "房屋模型已载入。拖动旋转，滚轮缩放，或使用视角按钮查看房间。";
  requestRender();
  window.setTimeout(makePosterReady, 1200);
}

function buildHouse() {
  // L-shaped slab and room floors.
  addBox(world, { x: 0, z: 0, w: 11.4, d: 3.8, h: 0.22, material: materials.slab, receive: true });
  addBox(world, { x: 5.0, z: 3.8, w: 6.4, d: 1.55, h: 0.22, material: materials.slab, receive: true });

  const floorRooms = [
    ["bedroom", 0.12, 0.12, 4.76, 3.52, materials.wood],
    ["bath", 5.08, 0.12, 1.91, 1.96, materials.tile],
    ["hall", 5.08, 2.18, 1.91, 1.48, materials.wood],
    ["living", 7.06, 0.12, 4.10, 3.52, materials.wood],
    ["hall", 5.08, 3.68, 1.90, 1.55, materials.wood],
    ["kitchen", 7.06, 3.68, 4.10, 1.55, materials.stone],
  ];
  for (const [room, x, z, w, d, baseMaterial] of floorRooms) {
    const material = baseMaterial.clone();
    addBox(world, { x, z, w, d, h: 0.035, y: 0.22, material, room, receive: true });
    if (!roomFloors.has(room)) roomFloors.set(room, []);
    roomFloors.get(room).push(material);
  }

  // North wall with three window openings.
  addWallZ({ z: 0, x: 0, width: 2.92, height: 2.22 });
  addWallZ({ z: 0, x: 2.92, width: 1.20, height: 0.72, material: materials.wall });
  addWallZ({ z: 0, x: 2.92, width: 1.20, height: 0.54, fullHeight: 2.22, material: materials.wall }).position.y += 1.68;
  addFrame(world, 2.92, 0.72, 0.072, 1.20, 0.96);
  addBox(world, { x: 2.92, z: 0.06, w: 1.20, d: 0.018, h: 0.96, y: 0.72, material: materials.glass, cast: false });
  addWallZ({ z: 0, x: 4.12, width: 3.33, height: 2.22 });
  addWallZ({ z: 0, x: 7.45, width: 1.35, height: 0.72 });
  addWallZ({ z: 0, x: 7.45, width: 1.35, height: 0.62, fullHeight: 2.22 }).position.y += 1.60;
  addFrame(world, 7.45, 0.72, 0.072, 1.35, 0.88);
  addBox(world, { x: 7.45, z: 0.06, w: 1.35, d: 0.018, h: 0.88, y: 0.72, material: materials.glass, cast: false });
  addWallZ({ z: 0, x: 8.80, width: 0.45, height: 2.22 });
  addWallZ({ z: 0, x: 9.25, width: 0.78, height: 0.96 });
  addWallZ({ z: 0, x: 9.25, width: 0.78, height: 0.48, fullHeight: 2.22 }).position.y += 1.74;
  addFrame(world, 9.25, 0.96, 0.072, 0.78, 0.78);
  addBox(world, { x: 9.25, z: 0.06, w: 0.78, d: 0.018, h: 0.78, y: 0.96, material: materials.glass, cast: false });
  addWallZ({ z: 0, x: 10.03, width: 1.37, height: 2.22 });

  // West wall with bedroom window.
  addWallX({ x: 0, z: 0, depth: 0.95, height: 2.22 });
  addWallX({ x: 0, z: 0.95, depth: 1.47, height: 0.72 });
  addWallX({ x: 0, z: 0.95, depth: 1.47, height: 0.54, fullHeight: 2.22 }).position.y += 1.68;
  addBox(world, { x: 0.055, z: 0.95, w: 0.018, d: 1.47, h: 0.96, y: 0.72, material: materials.glass, cast: false });
  addWallX({ x: 0, z: 2.42, depth: 1.38, height: 2.22 });

  // Near and interior walls, lowered in cutaway mode.
  addWallZ({ z: 3.68, x: 0, width: 5.0, height: 2.2, material: materials.sage, cut: true });
  // Partition between the entry and dining room. The wall stops at the bathroom corner.
  addWallX({ x: 7.02, z: 3.64, depth: 1.59, height: 2.2, cutHeight: 1.20, material: materials.wall, cut: true });
  addWallX({ x: 5.0, z: 3.8, depth: 1.55, height: 2.2, material: materials.wall, cut: true });
  addWallX({ x: 11.28, z: 0, depth: 1.50, height: 2.2, material: materials.wall, cut: true });
  addWallX({ x: 11.28, z: 3.26, depth: 0.54, height: 2.2, material: materials.wall, cut: true });
  addWallX({ x: 11.28, z: 3.8, depth: 1.55, height: 2.2, material: materials.wall, cut: true });
  addWallZ({ z: 5.23, x: 5.0, width: 0.96, height: 2.2, material: materials.wall, cut: true });
  addWallZ({ z: 5.23, x: 6.80, width: 4.60, height: 2.2, material: materials.wall, cut: true });

  // Bedroom partition and double-door opening.
  addWallX({ x: 4.88, z: 0, depth: 2.10, height: 2.2, material: materials.wall, cut: true });
  addWallX({ x: 4.88, z: 3.18, depth: 0.62, height: 2.2, material: materials.wall, cut: true });
  addBedroomDoor();

  // Bath enclosure with a door opening.
  addWallZ({ z: 2.16, x: 5.08, width: 0.52, height: 1.25, material: materials.wall, cut: true });
  addWallZ({ z: 2.16, x: 6.14, width: 0.85, height: 1.25, material: materials.wall, cut: true });
  addWallX({ x: 6.99, z: 0, depth: 2.16, height: 1.25, material: materials.wall, cut: true });

  // East glazed balcony door.
  addBox(world, { x: 11.21, z: 1.50, w: 0.026, d: 1.76, h: 1.72, material: materials.glass, cast: false });
  addFrameEast(world, 11.17, 0, 1.50, 1.76, 1.72, materials.white);
  addBox(world, { x: 11.21, z: 2.37, w: 0.05, d: 0.035, h: 1.72, material: materials.white, cast: false });

  // Entry door.
  const door = new THREE.Group();
  door.position.set(6.80, 0.22, 5.17);
  door.rotation.y = -0.72;
  addBox(door, { x: -0.76, z: 0, w: 0.76, d: 0.06, h: 1.9, material: materials.oak, room: "hall" });
  addCylinder(door, { x: -0.66, z: 0.045, rTop: 0.035, h: 0.09, y: 0.9, material: materials.brass, room: "hall", rotation: [Math.PI / 2, 0, 0] });
  world.add(door);

  // Balcony deck and rail.
  addBox(world, { x: 11.4, z: 1.36, w: 1.18, d: 2.38, h: 0.08, y: 0.17, material: materials.deck, room: "balcony" });
  addBox(world, { x: 12.56, z: 1.36, w: 0.028, d: 2.38, h: 1.0, y: 0.20, material: materials.glass, room: "balcony", cast: false });
  addBox(world, { x: 11.4, z: 1.36, w: 1.18, d: 0.028, h: 1.0, y: 0.20, material: materials.glass, room: "balcony", cast: false });
  for (const z of [1.36, 1.95, 2.54, 3.13, 3.74]) {
    addBox(world, { x: 12.55, z, w: 0.05, d: 0.05, h: 1.03, y: 0.2, material: materials.white, room: "balcony" });
  }

  buildBedroomFurniture();
  buildBathroomFurniture();
  buildLivingFurniture();
  buildKitchenFurniture();
  buildHallFurniture();
  buildBalconyFurniture();
  buildWallArt();
}

function addBedroomDoor() {
  const doorGroup = new THREE.Group();
  doorGroup.position.set(4.82, 0.22, 2.12);
  doorGroup.rotation.y = -0.86;
  addBox(doorGroup, { x: 0, z: 0, w: 0.045, d: 0.96, h: 1.90, material: materials.oak, room: "bedroom", edges: true });
  addBox(doorGroup, { x: -0.025, z: 0.28, w: 0.018, d: 0.34, h: 0.62, y: 0.92, material: materials.darkOak, room: "bedroom", cast: false });
  addCylinder(doorGroup, { x: 0.065, z: 0.84, rTop: 0.027, h: 0.07, y: 0.96, material: materials.brass, room: "bedroom", rotation: [0, 0, Math.PI / 2] });
  world.add(doorGroup);
}

function buildBedroomFurniture() {
  const room = "bedroom";
  addRug(1.46, 1.12, 3.06, 2.42, room, 0xe9e0d2);

  // 2.90 × 0.60 m built-in wardrobe along the north wall.
  addBox(world, { x: 0.23, z: 0.18, w: 2.90, d: 0.60, h: 2.04, material: materials.ivory, room, edges: true });
  for (const x of [0.96, 1.68, 2.40]) {
    addBox(world, { x, z: 0.785, w: 0.012, d: 0.018, h: 1.86, y: 0.30, material: materials.taupe, room, cast: false });
  }
  for (const x of [0.58, 1.31, 2.03, 2.78]) {
    addBox(world, { x, z: 0.805, w: 0.16, d: 0.022, h: 0.018, y: 1.12, material: materials.brass, room, cast: false });
  }

  // Bed: 1.72 × 2.00 m footprint including the frame.
  addBox(world, { x: 2.06, z: 1.38, w: 1.72, d: 2.00, h: 0.30, y: 0.22, material: materials.taupe, room, edges: true });
  addBox(world, { x: 2.13, z: 1.48, w: 1.58, d: 1.78, h: 0.18, y: 0.50, material: materials.ivory, room, edges: true });
  addBox(world, { x: 2.06, z: 3.34, w: 1.72, d: 0.20, h: 1.02, y: 0.22, material: materials.taupe, room, edges: true });
  // Folded duvet.
  addBox(world, { x: 2.15, z: 1.55, w: 1.54, d: 1.54, h: 0.055, y: 0.69, material: new THREE.MeshStandardMaterial({ color: 0xe8e2d8, roughness: 1 }), room, edges: true });
  for (const x of [2.27, 2.94]) {
    addBox(world, { x, z: 2.88, w: 0.62, d: 0.38, h: 0.15, y: 0.70, material: materials.cream, room, edges: true });
  }

  // Bedside tables.
  for (const x of [1.45, 3.94]) {
    addBox(world, { x, z: 3.02, w: 0.45, d: 0.40, h: 0.43, y: 0.22, material: materials.darkOak, room, edges: true });
  }

  // Desk rotated 90 degrees toward the south wall, with the monitor facing the wardrobe.
  addBox(world, { x: 0.18, z: 3.05, w: 0.95, d: 0.56, h: 0.055, y: 0.80, material: materials.ivory, room, edges: true });
  for (const x of [0.22, 1.08]) {
    for (const z of [3.09, 3.57]) {
      addBox(world, { x, z, w: 0.035, d: 0.035, h: 0.58, y: 0.22, material: materials.darkOak, room });
    }
  }
  addBox(world, { x: 0.58, z: 3.43, w: 0.16, d: 0.10, h: 0.16, y: 0.855, material: materials.charcoal, room });
  addBox(world, { x: 0.30, z: 3.42, w: 0.62, d: 0.075, h: 0.36, y: 1.01, material: materials.charcoal, room, edges: true });
  addBox(world, { x: 0.34, z: 3.405, w: 0.54, d: 0.018, h: 0.30, y: 1.04, material: new THREE.MeshStandardMaterial({ color: 0x26343b, emissive: 0x0d1b22, emissiveIntensity: 0.45, roughness: 0.45 }), room, cast: false });
  addBox(world, { x: 0.40, z: 3.09, w: 0.46, d: 0.25, h: 0.025, y: 0.865, material: materials.black, room });
  addBox(world, { x: 0.91, z: 3.12, w: 0.10, d: 0.15, h: 0.018, y: 0.865, material: materials.ivory, room });
  addDiningChair(0.66, 2.72, Math.PI, room);

  // Stove and white chimney breast on the north wall, beside the wardrobe.
  addBox(world, { x: 3.42, z: 0.17, w: 1.04, d: 0.34, h: 1.18, y: 0.22, material: materials.brick, room, edges: true });
  addBox(world, { x: 3.29, z: 0.12, w: 1.30, d: 0.43, h: 0.76, y: 1.40, material: materials.white, room, edges: true });
  const firebox = addBox(world, { x: 3.58, z: 0.36, w: 0.72, d: 0.020, h: 0.55, y: 0.46, material: materials.black, room, cast: false });
  firebox.rotation.x = 0;
  addPlane(world, { x: 3.70, z: 0.372, w: 0.50, d: 0.28, y: 0.54, material: materials.fire, room, rotation: [0, 0, 0] });
  const fireLight = new THREE.PointLight(0xff7a2e, 2.2, 2.8, 2);
  fireLight.position.set(3.94, 0.72, 0.55);
  world.add(fireLight);

  // Pink artwork on the south wall face.
  addBox(world, { x: 4.03, z: 3.66, w: 0.72, d: 0.028, h: 0.82, y: 0.86, material: new THREE.MeshStandardMaterial({ color: 0xc87278, roughness: 0.86 }), room, cast: false });
  addPlant(0.28, 1.98, 0.74, room);
}

function buildBathroomFurniture() {
  const room = "bath";
  // Shower tray and glass.
  addBox(world, { x: 5.17, z: 0.22, w: 0.78, d: 0.78, h: 0.05, y: 0.24, material: materials.white, room, edges: true });
  addBox(world, { x: 5.94, z: 0.22, w: 0.022, d: 0.78, h: 1.35, y: 0.28, material: materials.showerGlass, room, cast: false });
  addBox(world, { x: 5.17, z: 0.98, w: 0.78, d: 0.022, h: 1.35, y: 0.28, material: materials.showerGlass, room, cast: false });
  addCylinder(world, { x: 5.83, z: 0.34, rTop: 0.026, h: 1.25, y: 0.46, material: materials.steel, room });

  // Toilet.
  addBox(world, { x: 6.28, z: 0.34, w: 0.38, d: 0.50, h: 0.36, y: 0.24, material: materials.white, room, edges: true });
  addBox(world, { x: 6.28, z: 0.16, w: 0.38, d: 0.16, h: 0.70, y: 0.28, material: materials.white, room, edges: true });
  addCylinder(world, { x: 6.47, z: 0.62, rTop: 0.19, h: 0.035, y: 0.60, material: materials.white, room, rotation: [0, 0, 0], segments: 28 });

  // Sink and mirror set against the east wall.
  addBox(world, { x: 6.64, z: 1.19, w: 0.34, d: 0.44, h: 0.74, y: 0.24, material: materials.white, room, edges: true });
  addBox(world, { x: 6.67, z: 1.27, w: 0.25, d: 0.28, h: 0.035, y: 0.99, material: materials.steel, room, cast: false });
  addBox(world, { x: 6.955, z: 1.19, w: 0.025, d: 0.44, h: 0.72, y: 1.12, material: materials.steel, room, cast: false });
}

function buildLivingFurniture() {
  const room = "living";
  const sofaFabric = new THREE.MeshStandardMaterial({ color: 0xb7bda3, roughness: 0.96 });
  addRug(7.08, 0.12, 2.25, 2.25, room, 0xe8dfd1);

  // Sage sofa sits in the northwest corner, touching both the bathroom and north walls.
  addBox(world, { x: 7.08, z: 0.12, w: 0.76, d: 2.00, h: 0.34, y: 0.24, material: sofaFabric, room, edges: true });
  addBox(world, { x: 7.06, z: 0.12, w: 0.22, d: 2.00, h: 0.68, y: 0.26, material: sofaFabric, room, edges: true });
  addBox(world, { x: 7.08, z: 0.12, w: 0.76, d: 0.16, h: 0.52, y: 0.24, material: sofaFabric, room, edges: true });
  addBox(world, { x: 7.08, z: 1.96, w: 0.76, d: 0.16, h: 0.52, y: 0.24, material: sofaFabric, room, edges: true });
  addBox(world, { x: 7.28, z: 0.32, w: 0.50, d: 0.72, h: 0.14, y: 0.58, material: materials.rust, room, edges: true });
  addBox(world, { x: 7.29, z: 1.10, w: 0.49, d: 0.72, h: 0.14, y: 0.58, material: materials.ivory, room, edges: true });

  // Compact glass coffee table and ottoman leave a clear walking line to the dining table.
  addCylinder(world, { x: 8.38, z: 1.12, rTop: 0.44, h: 0.04, y: 0.59, material: materials.glass, room, segments: 40 });
  for (const [dx, dz] of [[-0.34, -0.18], [0.34, -0.18], [0, 0.24]]) {
    addBox(world, { x: 8.38 + dx - 0.018, z: 1.12 + dz - 0.018, w: 0.036, d: 0.036, h: 0.35, y: 0.24, material: materials.oak, room });
  }

  // 1.0 m round dining table; chairs tuck 10 cm under the tabletop.
  addCylinder(world, { x: 10.16, z: 1.36, rTop: 0.50, h: 0.055, y: 0.90, material: materials.ivory, room, segments: 40 });
  addCylinder(world, { x: 10.16, z: 1.36, rTop: 0.065, h: 0.64, y: 0.24, material: materials.oak, room, segments: 24 });
  addDiningChair(10.16, 1.86, 0, room);
  addDiningChair(10.16, 0.86, Math.PI, room);
  addDiningChair(10.66, 1.36, Math.PI / 2, room);
  addDiningChair(9.66, 1.36, -Math.PI / 2, room);

  // Pendant.
  addCylinder(world, { x: 10.16, z: 1.36, rTop: 0.012, h: 1.27, y: 1.98, material: materials.darkOak, room });
  addCylinder(world, { x: 10.16, z: 1.36, rTop: 0.04, rBottom: 0.29, h: 0.22, y: 1.86, material: materials.mustard, room, segments: 32 });
}

function buildKitchenFurniture() {
  const room = "kitchen";
  // South counter (0.58 m deep).
  addBox(world, { x: 7.18, z: 4.58, w: 4.02, d: 0.58, h: 0.82, y: 0.22, material: materials.ivory, room, edges: true });
  addBox(world, { x: 7.16, z: 4.54, w: 4.06, d: 0.62, h: 0.055, y: 1.02, material: materials.white, room, edges: true });
  addBox(world, { x: 7.28, z: 4.72, w: 0.68, d: 0.27, h: 0.018, y: 1.08, material: materials.glass, room, cast: false });
  addBox(world, { x: 8.23, z: 4.72, w: 0.63, d: 0.28, h: 0.018, y: 1.08, material: materials.charcoal, room, cast: false });
  addBox(world, { x: 9.20, z: 4.72, w: 0.52, d: 0.28, h: 0.018, y: 1.08, material: materials.steel, room, cast: false });
  addBox(world, { x: 7.18, z: 5.11, w: 4.02, d: 0.018, h: 0.83, y: 1.08, material: materials.tile, room, cast: false });

  // Return counter extends from the entry/kitchen wall along the kitchen side.
  addBox(world, { x: 7.16, z: 3.78, w: 0.56, d: 0.80, h: 0.82, y: 0.22, material: materials.ivory, room, edges: true });
  addBox(world, { x: 7.12, z: 3.74, w: 0.64, d: 0.88, h: 0.055, y: 1.02, material: materials.white, room, edges: true });

  // Compact espresso machine on the return counter.
  addBox(world, { x: 7.29, z: 3.92, w: 0.30, d: 0.28, h: 0.38, y: 1.08, material: materials.charcoal, room, edges: true });
  addBox(world, { x: 7.29, z: 3.92, w: 0.30, d: 0.07, h: 0.10, y: 1.46, material: materials.steel, room, edges: true });
  addBox(world, { x: 7.57, z: 3.99, w: 0.10, d: 0.13, h: 0.08, y: 1.25, material: materials.steel, room, edges: true });
  addCylinder(world, { x: 7.65, z: 4.05, rTop: 0.026, h: 0.10, y: 1.12, material: materials.brass, room, rotation: [0, 0, Math.PI / 2] });
  addCylinder(world, { x: 7.64, z: 4.04, rTop: 0.045, h: 0.07, y: 1.08, material: materials.white, room, segments: 20 });

  // Tall fridge/pantry.
  addBox(world, { x: 10.55, z: 3.78, w: 0.62, d: 0.78, h: 1.98, y: 0.22, material: materials.ivory, room, edges: true });
  addBox(world, { x: 10.53, z: 3.76, w: 0.025, d: 0.025, h: 1.15, y: 0.92, material: materials.steel, room, cast: false });

  // The island sits in the open dining side; 0.80 m stays clear between it and the stove counter.
  addBox(world, { x: 8.35, z: 3.10, w: 1.30, d: 0.50, h: 0.84, y: 0.22, material: materials.ivory, room, edges: true });
  addBox(world, { x: 8.31, z: 3.06, w: 1.38, d: 0.58, h: 0.06, y: 1.05, material: materials.white, room, edges: true });
  for (const x of [8.60, 9.35]) {
    addCylinder(world, { x, z: 2.86, rTop: 0.16, h: 0.05, y: 0.70, material: materials.oak, room, segments: 28 });
    for (const [dx, dz] of [[-0.11, -0.09], [0.11, -0.09], [-0.11, 0.09], [0.11, 0.09]]) {
      addBox(world, { x: x + dx - 0.012, z: 2.86 + dz - 0.012, w: 0.024, d: 0.024, h: 0.48, y: 0.22, material: materials.darkOak, room });
    }
  }

  // Range hood and warm strip lights.
  addBox(world, { x: 8.21, z: 4.98, w: 0.74, d: 0.33, h: 0.62, y: 1.62, material: materials.charcoal, room, edges: true });
}

function buildHallFurniture() {
  const room = "hall";
  // Keep only one low shoe cabinet, on the left-hand wall immediately inside the entrance.
  addBox(world, { x: 5.08, z: 4.20, w: 0.38, d: 0.82, h: 0.92, y: 0.22, material: materials.oak, room, edges: true });
  addBox(world, { x: 5.475, z: 4.25, w: 0.025, d: 0.72, h: 0.84, y: 0.26, material: materials.darkOak, room, cast: false });
}

function buildBalconyFurniture() {
  const room = "balcony";
  // Foldable slatted timber chair, matching the balcony reference.
  const foldingChair = new THREE.Group();
  foldingChair.position.set(11.97, 0.22, 2.22);
  foldingChair.rotation.y = -Math.PI / 2;
  for (let i = 0; i < 4; i += 1) {
    addBox(foldingChair, { x: -0.27, z: 0.06 + i * 0.13, w: 0.54, d: 0.07, h: 0.035, y: 0.43, material: materials.oak, room, edges: true });
  }
  for (let i = 0; i < 4; i += 1) {
    addBox(foldingChair, { x: -0.27, z: 0.52, w: 0.54, d: 0.045, h: 0.04, y: 0.60 + i * 0.14, material: materials.oak, room, edges: true });
  }
  for (const x of [-0.26, 0.24]) {
    addBox(foldingChair, { x, z: 0.04, w: 0.035, d: 0.52, h: 0.035, y: 0.39, material: materials.darkOak, room });
    addBox(foldingChair, { x, z: 0.08, w: 0.035, d: 0.035, h: 0.42, y: 0, material: materials.darkOak, room });
    addBox(foldingChair, { x, z: 0.47, w: 0.035, d: 0.035, h: 0.70, y: 0, material: materials.darkOak, room });
  }
  addBox(foldingChair, { x: -0.26, z: 0.48, w: 0.035, d: 0.035, h: 0.58, y: 0.46, material: materials.darkOak, room });
  addBox(foldingChair, { x: 0.24, z: 0.48, w: 0.035, d: 0.035, h: 0.58, y: 0.46, material: materials.darkOak, room });
  foldingChair.scale.setScalar(0.8);
  world.add(foldingChair);
  // Teal side table.
  addCylinder(world, { x: 12.02, z: 3.16, rTop: 0.19, h: 0.04, y: 0.54, material: materials.teal, room, segments: 26 });
  addCylinder(world, { x: 12.02, z: 3.16, rTop: 0.022, h: 0.32, y: 0.22, material: materials.teal, room });
  addPlant(11.58, 3.52, 0.62, room);
}

function buildWallArt() {
  const artMat1 = new THREE.MeshStandardMaterial({ color: 0xc2ae98, roughness: 0.88 });
  const artMat2 = new THREE.MeshStandardMaterial({ color: 0x7d9184, roughness: 0.88 });
  const artMat3 = new THREE.MeshStandardMaterial({ color: 0xce746c, roughness: 0.88 });
  addBox(world, { x: 7.52, z: 0.075, w: 0.48, d: 0.025, h: 0.62, y: 0.84, material: artMat1, room: "living", cast: false, edges: true });
  addBox(world, { x: 8.23, z: 0.075, w: 0.54, d: 0.025, h: 0.72, y: 0.78, material: artMat2, room: "living", cast: false, edges: true });
  addBox(world, { x: 10.52, z: 0.075, w: 0.26, d: 0.025, h: 0.58, y: 0.84, material: artMat3, room: "living", cast: false, edges: true });
}

function buildLabels() {
  labels = new THREE.Group();
  world.add(labels);
  const entries = [
    ["卧室", 2.45, 2.24],
    ["浴室", 6.03, 1.10],
    ["客餐厅", 8.53, 1.78],
    ["厨房", 9.05, 4.20],
    ["门厅", 6.00, 4.40],
    ["阳台", 11.98, 2.40],
  ];
  for (const [name, x, z] of entries) {
    const sprite = makeLabel(name);
    sprite.position.set(x, 1.26, z);
    labels.add(sprite);
    labelSprites.push(sprite);
  }
}

function drawPlan() {
  const NS = "http://www.w3.org/2000/svg";
  planGroup.replaceChildren();
  const left = 100;
  const top = 116;
  const s = 54;
  const box = (x, z, w, d, room) => {
    const polygon = document.createElementNS(NS, "polygon");
    polygon.setAttribute("points", [
      [x, z], [x + w, z], [x + w, z + d], [x, z + d],
    ].map(([px, pz]) => `${left + px * s},${top + pz * s}`).join(" "));
    polygon.setAttribute("class", "plan-room");
    polygon.dataset.room = room;
    planGroup.appendChild(polygon);
    polygon.addEventListener("click", () => setRoom(room));
    return polygon;
  };

  box(0, 0, 4.88, 3.8, "bedroom");
  box(5.0, 0, 2.06, 2.18, "bath");
  box(7.06, 0, 4.34, 3.8, "living");
  box(5.0, 2.18, 2.06, 1.62, "hall");
  box(7.06, 3.8, 4.34, 1.55, "kitchen");
  box(5.0, 3.8, 2.06, 1.55, "hall");

  // Balcony is outside the outline and gets the same selectable treatment.
  const balcony = document.createElementNS(NS, "rect");
  balcony.setAttribute("x", String(left + 11.43 * s));
  balcony.setAttribute("y", String(top + 1.36 * s));
  balcony.setAttribute("width", String(1.15 * s));
  balcony.setAttribute("height", String(2.38 * s));
  balcony.setAttribute("class", "plan-room");
  balcony.setAttribute("stroke-dasharray", "7 5");
  balcony.dataset.room = "balcony";
  balcony.addEventListener("click", () => setRoom("balcony"));
  planGroup.appendChild(balcony);

  const wall = document.createElementNS(NS, "path");
  wall.setAttribute("d", [
    `M ${left} ${top}`,
    `H ${left + 11.4 * s}`,
    `V ${top + 5.35 * s}`,
    `H ${left + 5 * s}`,
    `V ${top + 3.8 * s}`,
    `H ${left}`,
    "Z",
  ].join(" "));
  wall.setAttribute("fill", "none");
  wall.setAttribute("stroke", "currentColor");
  wall.setAttribute("stroke-width", "5");
  wall.setAttribute("pointer-events", "none");
  planGroup.appendChild(wall);

  const seams = [
    [4.88, 0, 4.88, 3.8], [5.08, 2.16, 6.99, 2.16],
    [7.06, 0, 7.06, 2.16], [7.02, 3.64, 7.02, 5.23],
    [7.06, 3.8, 11.4, 3.8],
  ];
  for (const [x1, z1, x2, z2] of seams) {
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", String(left + x1 * s));
    line.setAttribute("y1", String(top + z1 * s));
    line.setAttribute("x2", String(left + x2 * s));
    line.setAttribute("y2", String(top + z2 * s));
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "3");
    line.setAttribute("stroke-opacity", ".7");
    line.setAttribute("pointer-events", "none");
    planGroup.appendChild(line);
  }

  const furniture = [
    [0.23, 0.18, 2.90, 0.60], [2.06, 1.38, 1.72, 2.00],
    [3.42, 0.17, 1.04, 0.34], [7.08, 0.12, 0.76, 2.00],
    [7.94, 0.68, 0.88, 0.88], [10.16, 1.36, 1.00, 1.00, "circle"],
    [7.18, 4.58, 4.02, 0.58], [8.35, 3.10, 1.30, 0.50],
    [7.16, 3.78, 0.56, 0.80], [7.29, 3.92, 0.30, 0.28],
    [5.08, 4.20, 0.38, 0.82], [6.64, 1.19, 0.34, 0.44],
    [0.18, 3.05, 0.95, 0.56], [0.44, 2.50, 0.44, 0.44],
    [11.51, 2.00, 0.46, 0.44],
  ];
  for (const [x, z, w, d, shape] of furniture) {
    if (shape === "circle") {
      const circle = document.createElementNS(NS, "circle");
      circle.setAttribute("cx", String(left + x * s));
      circle.setAttribute("cy", String(top + z * s));
      circle.setAttribute("r", String((w * s) / 2));
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", "currentColor");
      circle.setAttribute("stroke-opacity", ".35");
      circle.setAttribute("stroke-width", "1.4");
      circle.setAttribute("pointer-events", "none");
      planGroup.appendChild(circle);
      continue;
    }
    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("x", String(left + x * s));
    rect.setAttribute("y", String(top + z * s));
    rect.setAttribute("width", String(w * s));
    rect.setAttribute("height", String(d * s));
    rect.setAttribute("fill", "none");
    rect.setAttribute("stroke", "currentColor");
    rect.setAttribute("stroke-opacity", ".35");
    rect.setAttribute("stroke-width", "1.4");
    rect.setAttribute("pointer-events", "none");
    planGroup.appendChild(rect);
  }

  const labelData = [
    ["卧室", 2.45, 2.2, "04"], ["浴室", 6.04, 1.10, "05"],
    ["客餐厅", 8.95, 1.58, "01"], ["厨房", 9.00, 4.16, "03"],
    ["门厅", 6.05, 4.42, "06"], ["阳台", 12.0, 2.24, "02"],
  ];
  for (const [text, x, z, number] of labelData) {
    const label = document.createElementNS(NS, "text");
    label.setAttribute("x", String(left + x * s));
    label.setAttribute("y", String(top + z * s));
    label.setAttribute("fill", "currentColor");
    label.setAttribute("font-family", "Figtree, sans-serif");
    label.setAttribute("font-size", "14");
    label.setAttribute("font-weight", "500");
    label.setAttribute("pointer-events", "none");
    label.textContent = text;
    planGroup.appendChild(label);

    const badge = document.createElementNS(NS, "text");
    badge.setAttribute("x", String(left + x * s));
    badge.setAttribute("y", String(top + z * s + 22));
    badge.setAttribute("fill", "var(--p-ink)");
    badge.setAttribute("font-family", "Figtree, sans-serif");
    badge.setAttribute("font-size", "11");
    badge.textContent = number;
    badge.setAttribute("pointer-events", "none");
    planGroup.appendChild(badge);
  }

  const dimension = document.createElementNS(NS, "text");
  dimension.setAttribute("x", String(left));
  dimension.setAttribute("y", String(top + 5.35 * s + 42));
  dimension.setAttribute("fill", "currentColor");
  dimension.setAttribute("font-family", "Figtree, sans-serif");
  dimension.setAttribute("font-size", "13");
  dimension.textContent = "L 形平面 · 总建筑面积 54 m²";
  planGroup.appendChild(dimension);
}

function setRoom(room, announce = true) {
  if (!roomMeta[room]) return;
  selectedRoom = room;
  for (const [name, materialsForRoom] of roomFloors.entries()) {
    for (const material of materialsForRoom) {
      material.emissive.set(name === room ? 0x6f1712 : 0x000000);
      material.emissiveIntensity = name === room ? 0.22 : 0;
    }
  }
  for (const button of roomButtons) button.setAttribute("aria-pressed", String(button.dataset.room === room));
  for (const path of planGroup.querySelectorAll("[data-room]")) {
    path.setAttribute("aria-pressed", String(path.dataset.room === room));
  }
  if (detailNode) {
    detailNode.innerHTML = "";
    const strong = document.createElement("strong");
    strong.textContent = roomMeta[room].label;
    const text = document.createElement("span");
    text.textContent = roomMeta[room].detail;
    detailNode.append(strong, text);
  }
  if (announce) statusNode.textContent = `已选择${roomMeta[room].label}。`;
  requestRender();
}

function setCameraView(name, immediate = false) {
  currentView = name;
  const preset = name === "all" && camera.aspect < 1.18
    ? cameraViews.allMobile
    : (cameraViews[name] || cameraViews.all);
  const toPosition = new THREE.Vector3(...preset.camera);
  const toTarget = new THREE.Vector3(...preset.target);
  if (immediate || reduceMotion.matches) {
    camera.position.copy(toPosition);
    controls.target.copy(toTarget);
    controls.update();
    return;
  }
  cameraTween = {
    start: performance.now(),
    duration: 900,
    fromPosition: camera.position.clone(),
    toPosition,
    fromTarget: controls.target.clone(),
    toTarget,
  };
  requestRender();
}

function setCutaway(enabled) {
  cutaway = enabled;
  for (const { mesh, cutHeight, fullHeight } of cutWalls) {
    const target = enabled ? cutHeight : fullHeight;
    mesh.scale.y = target / fullHeight;
    mesh.position.y = target / 2;
  }
  const button = actionButtons.find((item) => item.dataset.action === "cutaway");
  button?.setAttribute("aria-pressed", String(enabled));
  statusNode.textContent = enabled ? "已切低近侧墙体。" : "已显示完整墙体。";
  requestRender();
}

function setLabels(enabled) {
  labelsVisible = enabled;
  labels.visible = enabled;
  const button = actionButtons.find((item) => item.dataset.action === "labels");
  button?.setAttribute("aria-pressed", String(enabled));
  statusNode.textContent = enabled ? "已显示房间标注。" : "已隐藏房间标注。";
  requestRender();
}

function setAutoRotate(enabled) {
  controls.autoRotate = enabled;
  controls.autoRotateSpeed = 0.65;
  const button = actionButtons.find((item) => item.dataset.action === "rotate");
  button?.setAttribute("aria-pressed", String(enabled));
  if (button) button.textContent = enabled ? "暂停旋转" : "自动旋转";
  statusNode.textContent = enabled ? "房屋正在缓慢旋转。" : "自动旋转已暂停。";
  requestRender();
}

function bindUi() {
  for (const button of viewButtons) {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      setCameraView(view);
      if (roomMeta[view] && view !== "all") setRoom(view);
      for (const item of viewButtons) item.setAttribute("aria-pressed", String(item === button));
    });
  }
  for (const button of actionButtons) {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "cutaway") setCutaway(!cutaway);
      if (action === "labels") setLabels(!labelsVisible);
      if (action === "rotate") setAutoRotate(!controls.autoRotate);
    });
  }
  for (const button of roomButtons) {
    button.addEventListener("click", () => {
      const room = button.dataset.room;
      setRoom(room);
      const view = room === "bedroom" || room === "living" || room === "kitchen" || room === "bath" || room === "balcony" ? room : "all";
      if (view !== "all") setCameraView(view);
      for (const item of viewButtons) item.setAttribute("aria-pressed", String(item.dataset.view === view));
    });
  }

  controls.addEventListener("start", () => {
    cameraTween = null;
    interactionActive = true;
    requestRender();
  });
  controls.addEventListener("end", () => {
    interactionActive = false;
    requestRender();
  });
  controls.addEventListener("change", requestRender);

  renderer.domElement.addEventListener("pointerdown", (event) => {
    pointerDown = { x: event.clientX, y: event.clientY };
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (!pointerDown) return;
    const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    pointerDown = null;
    if (moved > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(interactive, false)[0];
    if (hit?.object.userData.room) setRoom(hit.object.userData.room);
  });

  renderer.domElement.addEventListener("dblclick", () => {
    if (roomMeta[selectedRoom]) setCameraView(selectedRoom);
  });
}

function resize() {
  if (!renderer) return;
  const rect = stage.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (started && currentView === "all") setCameraView("all", true);
  requestRender();
}

function frame(now) {
  if (!started) {
    animationRunning = false;
    return;
  }
  if (cameraTween) {
    const elapsed = now - cameraTween.start;
    const t = Math.min(elapsed / cameraTween.duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.toPosition, eased);
    controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased);
    if (t >= 1) cameraTween = null;
  }
  const controlsChanged = controls.update();
  renderer.render(scene, camera);
  if (controlsChanged || cameraTween || controls.autoRotate || interactionActive) {
    requestAnimationFrame(frame);
  } else {
    animationRunning = false;
  }
}

function requestRender() {
  if (!started || !renderer || !scene || !camera) return;
  if (animationRunning) return;
  animationRunning = true;
  requestAnimationFrame(frame);
}

function makePosterReady() {
  const shareCanvas = document.createElement("canvas");
  shareCanvas.width = 880;
  shareCanvas.height = 620;
  const board = document.getElementById("room-plan");
  if (!board) return;
  const xml = new XMLSerializer().serializeToString(board);
  const blob = new Blob([xml], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
  };
  image.src = url;
}

window.addEventListener("resize", resize);
reduceMotion.addEventListener?.("change", () => {
  if (reduceMotion.matches && controls) setAutoRotate(false);
});
init();
