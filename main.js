import * as THREE from 'three';

// ---------- Renderer / Scene / Camera ----------

const gameFrame = document.getElementById('game-frame');

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(0.275 * window.devicePixelRatio);
renderer.shadowMap.enabled = true;
gameFrame.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const skyColor = 0xbfe8ff;
scene.background = new THREE.Color(skyColor);
scene.fog = new THREE.Fog(skyColor, 26, 50);

const GAME_ASPECT = 3 / 4;
const ORTHO_HALF_WIDTH = 4.5;
const ORTHO_HALF_HEIGHT = ORTHO_HALF_WIDTH / GAME_ASPECT;
const camera = new THREE.OrthographicCamera(
  -ORTHO_HALF_WIDTH, ORTHO_HALF_WIDTH,
  ORTHO_HALF_HEIGHT, -ORTHO_HALF_HEIGHT,
  0.1, 100
);
const CAMERA_DISTANCE = Math.hypot(15, 17);
const CAMERA_ELEVATION_DEG = 35;
const elevationRad = THREE.MathUtils.degToRad(CAMERA_ELEVATION_DEG);
camera.position.set(0, CAMERA_DISTANCE * Math.sin(elevationRad), CAMERA_DISTANCE * Math.cos(elevationRad));
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix();

function resize() {
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  if (windowWidth === 0 || windowHeight === 0) return;

  let width = windowWidth;
  let height = width / GAME_ASPECT;
  if (height > windowHeight) {
    height = windowHeight;
    width = height * GAME_ASPECT;
  }

  gameFrame.style.width = `${width}px`;
  gameFrame.style.height = `${height}px`;
  renderer.setSize(width, height);
}

resize();
requestAnimationFrame(resize);
window.addEventListener('resize', resize);

// ---------- Lights ----------

scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const sun = new THREE.DirectionalLight(0xfff2d0, 1.3);
sun.position.set(8, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 16;
sun.shadow.camera.bottom = -16;
scene.add(sun);

// ---------- Ground ----------

const GROUND_SIZE = 34;
const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 18, 18);
groundGeo.rotateX(-Math.PI / 2);

const pos = groundGeo.attributes.position;
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i);
  const z = pos.getZ(i);
  const distFromCenter = Math.sqrt(x * x + z * z);
  const falloff = Math.max(0, 1 - distFromCenter / (GROUND_SIZE * 0.5));
  const bump = (Math.random() - 0.5) * 0.35 * falloff;
  pos.setY(i, bump);
}
groundGeo.computeVertexNormals();

const groundMat = new THREE.MeshStandardMaterial({
  color: 0x6bbf59,
  flatShading: true,
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = true;
scene.add(ground);

function makeTree(x, z) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, 0.8, 5),
    new THREE.MeshStandardMaterial({ color: 0x8b5a2b, flatShading: true })
  );
  trunk.position.y = 0.4;
  trunk.castShadow = true;
  tree.add(trunk);

  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(0.75, 1.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x3f9e4d, flatShading: true })
  );
  leaves.position.y = 1.5;
  leaves.castShadow = true;
  tree.add(leaves);

  tree.position.set(x, 0, z);
  return tree;
}

const treeSpots = [
  [-13, -10], [13, -9], [-14, 9], [14, 11], [-9, 13], [10, -14],
];
treeSpots.forEach(([x, z]) => scene.add(makeTree(x, z)));

// ---------- Chicken ----------

const BOUNDS = GROUND_SIZE * 0.5 - 2;
const FLEE_DISTANCE = 4;
const FLEE_SPEED_MULTIPLIER = 2.4;
const FLEE_BOOST_DURATION = 0.9;

class Chicken {
  constructor(bodyColor) {
    this.group = new THREE.Group();
    this.group.userData.chicken = this;

    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, flatShading: true });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0xf2a53c, flatShading: true });
    const combMat = new THREE.MeshStandardMaterial({ color: 0xd6392b, flatShading: true });
    const legMat = new THREE.MeshStandardMaterial({ color: 0xf2a53c, flatShading: true });

    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), bodyMat);
    body.scale.set(1, 0.9, 1.3);
    body.position.y = 0.55;
    body.castShadow = true;
    this.group.add(body);

    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), bodyMat);
    head.position.set(0, 0.98, 0.42);
    head.castShadow = true;
    this.group.add(head);

    const comb = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 4), combMat);
    comb.position.set(0, 1.2, 0.42);
    this.group.add(comb);

    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 4), beakMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.96, 0.68);
    this.group.add(beak);

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4), bodyMat);
    tail.rotation.x = Math.PI / 2.6;
    tail.position.set(0, 0.75, -0.58);
    tail.castShadow = true;
    this.group.add(tail);

    this.wings = [];
    [-1, 1].forEach((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.35, 0.6, 0);
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.35, 0.5),
        bodyMat
      );
      wing.position.set(side * 0.18, -0.05, 0);
      wing.castShadow = true;
      pivot.add(wing);
      pivot.rotation.z = side * 0.2;
      this.group.add(pivot);
      this.wings.push({ pivot, side });
    });

    this.legs = [];
    [-1, 1].forEach((side) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.4, 4),
        legMat
      );
      leg.position.set(side * 0.15, 0.2, 0);
      leg.castShadow = true;
      this.group.add(leg);
      this.legs.push(leg);
    });

    this.alert = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.26, 4),
      new THREE.MeshStandardMaterial({ color: 0xff3b30, flatShading: true })
    );
    this.alert.position.set(0, 1.55, 0.3);
    this.alert.scale.setScalar(0.0001);
    this.group.add(this.alert);

    // Walk state
    this.state = 'walk';
    this.speed = 1.0 + Math.random() * 0.6;
    this.walkSpeed = 0.35 + Math.random() * 0.25;
    this.heading = Math.random() * Math.PI * 2;
    this.target = this.pickTarget();
    this.walkClock = Math.random() * 10;
    this.flightHeight = 3.5 + Math.random() * 1.5;
    this.flapSpeed = 10 + Math.random() * 4;
    this.restTimer = 0.5 + Math.random() * 2;

    this.agitation = 0;
    this.agitationThreshold = 8;
    this.liftStartAgitation = 5;
    this.agitationPerClick = 1;
    this.agitationDecayPerSecond = 0.6;
    this.flinchTimer = 0;
    this.preFlightLift = 1.7;
    this.fleeBoostTimer = 0;

    // Orbit state (active while flying)
    this.orbitAngle = Math.random() * Math.PI * 2;
    this.orbitRadius = 2.8 + Math.random() * 1.2;
    this.orbitSpeed = (0.45 + Math.random() * 0.25) * (Math.random() < 0.5 ? 1 : -1);

    // Fall / stun state
    this.fallSpeed = 0;
    this.stunTimer = 0;
  }

  pickTarget() {
    return new THREE.Vector2(
      (Math.random() * 2 - 1) * BOUNDS,
      (Math.random() * 2 - 1) * BOUNDS
    );
  }

  registerClick(hitPoint) {
    if (this.state !== 'walk') return;
    spawnEgg(this.group.position.x, this.group.position.z, this.heading);
    this.flee(hitPoint);
    this.agitation = Math.min(this.agitationThreshold, this.agitation + this.agitationPerClick);
    this.flinchTimer = 0.25;
    if (this.agitation >= this.agitationThreshold) {
      this.startFlying();
    }
  }

  flee(hitPoint) {
    const away = new THREE.Vector2(
      this.group.position.x - hitPoint.x,
      this.group.position.z - hitPoint.z
    );
    if (away.lengthSq() < 0.0001) {
      const randomAngle = Math.random() * Math.PI * 2;
      away.set(Math.sin(randomAngle), Math.cos(randomAngle));
    } else {
      away.normalize();
    }

    this.heading = Math.atan2(away.x, away.y);
    this.group.rotation.y = this.heading;
    this.target = new THREE.Vector2(
      THREE.MathUtils.clamp(this.group.position.x + away.x * FLEE_DISTANCE, -BOUNDS, BOUNDS),
      THREE.MathUtils.clamp(this.group.position.z + away.y * FLEE_DISTANCE, -BOUNDS, BOUNDS)
    );
    this.restTimer = 0;
    this.fleeBoostTimer = FLEE_BOOST_DURATION;
  }

  startFlying() {
    if (this.state === 'fly') return;
    this.state = 'fly';
    this.agitation = 0;
    this.alert.scale.setScalar(0.0001);
    this.flyStartTimer = 0;
    // Begin orbit from wherever the chicken currently stands
    this.orbitAngle = Math.atan2(this.group.position.x, this.group.position.z);
    this.orbitRadius = THREE.MathUtils.clamp(
      Math.hypot(this.group.position.x, this.group.position.z),
      2.5, 4.0
    );
  }

  shootDown() {
    if (this.state !== 'fly' || this.flyStartTimer < 1) return;
    this.state = 'falling';
    this.fallSpeed = 0;
    this.group.rotation.x = 0;
  }

  update(dt) {
    this.walkClock += dt;

    if (this.state === 'walk') {
      if (this.fleeBoostTimer > 0) this.fleeBoostTimer -= dt;
      const speedMultiplier = this.fleeBoostTimer > 0 ? FLEE_SPEED_MULTIPLIER : 1;

      let isWalking = false;
      if (this.restTimer > 0) {
        this.restTimer -= dt;
      } else {
        isWalking = this.updateGroundMovement(dt, speedMultiplier);
      }

      this.agitation = Math.max(0, this.agitation - this.agitationDecayPerSecond * dt);
      const alertRatio = this.agitation / this.agitationThreshold;
      this.alert.scale.setScalar(Math.max(0.0001, alertRatio));
      this.alert.rotation.y += dt * 3;

      if (this.flinchTimer > 0) this.flinchTimer -= dt;
      const flinch = this.flinchTimer > 0 ? Math.sin((this.flinchTimer / 0.25) * Math.PI) : 0;

      const liftRatio = THREE.MathUtils.clamp(
        (this.agitation - this.liftStartAgitation) / (this.agitationThreshold - this.liftStartAgitation),
        0, 1
      );
      const lift = liftRatio * this.preFlightLift;

      const swing = isWalking ? Math.sin(this.walkClock * this.walkSpeed * speedMultiplier * 8) * 0.35 : 0;
      this.legs[0].rotation.x = swing - liftRatio * 0.9;
      this.legs[1].rotation.x = -swing - liftRatio * 0.9;
      this.wings.forEach(({ pivot, side }) => {
        pivot.rotation.z = side * (0.2 + Math.sin(this.walkClock * 4) * 0.05 + flinch * 0.6 + liftRatio * 0.5);
      });
      const bob = isWalking ? Math.abs(Math.sin(this.walkClock * this.walkSpeed * speedMultiplier * 8)) * 0.05 : 0;
      this.group.position.y = bob + flinch * 0.2 + lift;

    } else if (this.state === 'fly') {
      this.flyStartTimer += dt;
      this.updateFlying(dt);
      this.wings.forEach(({ pivot, side }) => {
        pivot.rotation.z = side * (0.3 + Math.sin(this.walkClock * this.flapSpeed) * 0.9);
      });
      this.legs.forEach((leg) => (leg.rotation.x = -0.6));

    } else if (this.state === 'falling') {
      this.updateFalling(dt);
      // Flail wings during tumble
      this.wings.forEach(({ pivot, side }) => {
        pivot.rotation.z = side * (0.3 + Math.sin(this.walkClock * this.flapSpeed * 2.5) * 1.4);
      });

    } else if (this.state === 'stunned') {
      this.updateStunned(dt);
    }
  }

  updateGroundMovement(dt, speedMultiplier = 1) {
    const pos2 = new THREE.Vector2(this.group.position.x, this.group.position.z);
    const toTarget = this.target.clone().sub(pos2);
    const dist = toTarget.length();

    if (dist < 0.3) {
      this.restTimer = 1.5 + Math.random() * 3.5;
      this.target = this.pickTarget();
      return false;
    }

    toTarget.normalize();
    const desiredHeading = Math.atan2(toTarget.x, toTarget.y);
    this.heading = lerpAngle(this.heading, desiredHeading, 1 - Math.pow(0.001, dt));
    this.group.rotation.y = this.heading;

    const moveDist = this.walkSpeed * speedMultiplier * dt;
    this.group.position.x += Math.sin(this.heading) * moveDist;
    this.group.position.z += Math.cos(this.heading) * moveDist;
    return true;
  }

  updateFlying(dt) {
    this.orbitAngle += this.orbitSpeed * dt;

    // Target position on the orbit circle
    const orbitX = Math.sin(this.orbitAngle) * this.orbitRadius;
    const orbitZ = Math.cos(this.orbitAngle) * this.orbitRadius;

    // Ease toward orbit position so the entry looks smooth
    this.group.position.x += (orbitX - this.group.position.x) * Math.min(1, dt * 1.5);
    this.group.position.z += (orbitZ - this.group.position.z) * Math.min(1, dt * 1.5);

    // Face the tangent direction of the orbit
    const tangentX = Math.cos(this.orbitAngle) * Math.sign(this.orbitSpeed);
    const tangentZ = -Math.sin(this.orbitAngle) * Math.sign(this.orbitSpeed);
    const desiredHeading = Math.atan2(tangentX, tangentZ);
    this.heading = lerpAngle(this.heading, desiredHeading, Math.min(1, dt * 3));
    this.group.rotation.y = this.heading;

    const targetY = this.flightHeight + Math.sin(this.walkClock * 2) * 0.25;
    this.group.position.y += (targetY - this.group.position.y) * Math.min(1, dt * 2);
    this.group.rotation.x = -0.15;
  }

  updateFalling(dt) {
    this.fallSpeed += 14 * dt;
    this.group.position.y -= this.fallSpeed * dt;
    this.group.rotation.z += dt * 6;
    this.group.rotation.x += dt * 4;

    if (this.group.position.y <= 0.05) {
      this.group.position.y = 0;
      this.state = 'stunned';
      this.stunTimer = 2.5;
      this.group.rotation.x = Math.PI / 2;
      this.group.rotation.z = 0;
      spawnEgg(this.group.position.x, this.group.position.z, this.heading);
    }
  }

  updateStunned(dt) {
    this.stunTimer -= dt;
    if (this.stunTimer <= 0) {
      this.state = 'walk';
      this.group.rotation.x = 0;
      this.group.rotation.z = 0;
      this.agitation = 0;
      this.restTimer = 1;
      this.target = this.pickTarget();
    }
  }
}

function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

// ---------- Eggs ----------

const EGG_POP_DURATION = 0.25;
const eggGeometry = new THREE.SphereGeometry(0.16, 8, 6);
eggGeometry.scale(0.8, 1.15, 0.8);
const eggMaterial = new THREE.MeshStandardMaterial({ color: 0xfaf3df, flatShading: true });
const eggs = [];

function spawnEgg(x, z, heading) {
  const egg = new THREE.Mesh(eggGeometry, eggMaterial);
  const behind = 0.4;
  egg.position.set(x - Math.sin(heading) * behind, 0.1, z - Math.cos(heading) * behind);
  egg.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.3);
  egg.scale.setScalar(0.001);
  egg.castShadow = true;
  egg.receiveShadow = true;
  scene.add(egg);
  eggs.push({ mesh: egg, age: 0 });
}

function updateEggs(dt) {
  for (const egg of eggs) {
    if (egg.age >= EGG_POP_DURATION) continue;
    egg.age += dt;
    const t = Math.min(1, egg.age / EGG_POP_DURATION);
    const eased = t * t * (3 - 2 * t);
    egg.mesh.scale.setScalar(Math.max(0.001, eased));
  }
}

// ---------- Spawn chickens ----------

const chickenColors = [0xf5f0e6, 0x8b5a2b, 0x3a2a1a, 0xe8d9b5];
const chickens = [];
const CHICKEN_COUNT = 12;

for (let i = 0; i < CHICKEN_COUNT; i++) {
  const color = chickenColors[Math.floor(Math.random() * chickenColors.length)];
  const chicken = new Chicken(color);
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * BOUNDS;
  chicken.group.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  scene.add(chicken.group);
  chickens.push(chicken);
}

// ---------- Raycaster ----------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// ---------- Bullseye cursor ----------

const bullseye = document.createElement('div');
bullseye.innerHTML = `<svg viewBox="0 0 48 48" width="48" height="48">
  <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <circle cx="24" cy="24" r="10" fill="none" stroke="currentColor" stroke-width="3"/>
  <circle cx="24" cy="24" r="3"  fill="currentColor"/>
  <line x1="24" y1="1"  x2="24" y2="13" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <line x1="24" y1="35" x2="24" y2="47" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <line x1="1"  y1="24" x2="13" y2="24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <line x1="35" y1="24" x2="47" y2="24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
</svg>`;
Object.assign(bullseye.style, {
  display: 'none',
  position: 'absolute',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
  zIndex: '10',
});
gameFrame.appendChild(bullseye);

renderer.domElement.addEventListener('mousemove', (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const flying = chickens.filter((c) => c.state === 'fly');
  const hits = flying.length
    ? raycaster.intersectObjects(flying.map((c) => c.group), true)
    : [];

  if (hits.length > 0) {
    let obj = hits[0].object;
    while (obj && !obj.userData.chicken) obj = obj.parent;
    const canShoot = obj && obj.userData.chicken.flyStartTimer >= 1;

    const frameRect = gameFrame.getBoundingClientRect();
    bullseye.style.left = `${event.clientX - frameRect.left}px`;
    bullseye.style.top = `${event.clientY - frameRect.top}px`;
    bullseye.style.color = canShoot ? '#ff8000' : '#888888';
    bullseye.style.display = 'block';
    renderer.domElement.style.cursor = 'none';
  } else {
    bullseye.style.display = 'none';
    renderer.domElement.style.cursor = '';
  }
});

renderer.domElement.addEventListener('mouseleave', () => {
  bullseye.style.display = 'none';
  renderer.domElement.style.cursor = '';
});

// ---------- Click handler ----------

renderer.domElement.addEventListener('click', (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);

  // Flying chickens take priority — click shoots them down
  const flying = chickens.filter((c) => c.state === 'fly');
  if (flying.length) {
    const hits = raycaster.intersectObjects(flying.map((c) => c.group), true);
    if (hits.length > 0) {
      let obj = hits[0].object;
      while (obj && !obj.userData.chicken) obj = obj.parent;
      if (obj) { obj.userData.chicken.shootDown(); return; }
    }
  }

  // Walking chickens — click agitates / lays egg
  const walking = chickens.filter((c) => c.state === 'walk');
  if (walking.length) {
    const hits = raycaster.intersectObjects(walking.map((c) => c.group), true);
    if (hits.length > 0) {
      let obj = hits[0].object;
      while (obj && !obj.userData.chicken) obj = obj.parent;
      if (obj) obj.userData.chicken.registerClick(hits[0].point);
    }
  }
});

// ---------- Animation loop ----------

const clock = new THREE.Clock();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.1);
  chickens.forEach((c) => c.update(dt));
  updateEggs(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
