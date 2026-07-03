import * as THREE from 'three';

// ---------- Renderer / Scene / Camera ----------

const gameFrame  = document.getElementById('game-frame');
const packFrame  = document.getElementById('pack-frame');
const statsFrame = document.getElementById('stats-frame');

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(0.275 * window.devicePixelRatio);
renderer.shadowMap.enabled = true;
gameFrame.appendChild(renderer.domElement);

const packRenderer = new THREE.WebGLRenderer({ antialias: false });
packRenderer.setPixelRatio(0.275 * window.devicePixelRatio);
packFrame.appendChild(packRenderer.domElement);

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

// ---------- Stats counters ----------

let totalShots = 0;
let eggsLaid   = 0;
let eggsSwept  = 0;

function resize() {
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  if (windowWidth === 0 || windowHeight === 0) return;

  // Layout: stats(1) + game+pack(6) = 7 parts wide, 6 parts tall (square game area).
  // Shrink game+pack so the full 7-part layout fits within the window.
  const side   = Math.min(Math.floor(windowWidth * 6 / 7), windowHeight);
  const statsW = Math.round(side / 6);
  const gameW  = Math.round(side * 0.75);
  const packW  = Math.round(side * 0.25);

  statsFrame.style.width  = `${statsW}px`;
  statsFrame.style.height = `${side}px`;

  gameFrame.style.width  = `${gameW}px`;
  gameFrame.style.height = `${side}px`;
  renderer.setSize(gameW, side);

  packFrame.style.width  = `${packW}px`;
  packFrame.style.height = `${side}px`;
  packRenderer.setSize(packW, side);
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
  constructor(bodyColor, accentColor = null) {
    this.group = new THREE.Group();
    this.group.userData.chicken = this;

    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, flatShading: true });
    const beakMat = new THREE.MeshStandardMaterial({ color: accentColor ?? 0xf2a53c, flatShading: true });
    const combMat = new THREE.MeshStandardMaterial({ color: accentColor ?? 0xd6392b, flatShading: true });
    const legMat = new THREE.MeshStandardMaterial({ color: accentColor ?? 0xf2a53c, flatShading: true });

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
    this.velocity = new THREE.Vector3();
    this.spinX = 0;
    this.spinY = 0;
    this.spinZ = 0;
    this.stunTimer = 0;
    this.bloodDripTimer = 0;
    this.canLayEggs = true;
  }

  pickTarget() {
    return new THREE.Vector2(
      (Math.random() * 2 - 1) * BOUNDS,
      (Math.random() * 2 - 1) * BOUNDS
    );
  }

  registerClick(hitPoint) {
    if (this.state !== 'walk') return;
    if (this.agitation < this.liftStartAgitation && this.canLayEggs) {
      spawnEgg(this.group.position.x, this.group.position.z, this.heading);
    }
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

  shootDown(hitPoint) {
    if (this.state !== 'fly' || this.flyStartTimer < 1) return;
    totalShots++;
    this.state = 'falling';

    const cx = this.group.position.x;
    const cy = this.group.position.y;
    const cz = this.group.position.z;

    // Push direction: away from the hit point, always has upward + into-background bias
    const pushX = cx - hitPoint.x;
    const pushY = Math.max(cy - hitPoint.y + 2, 2);
    const pushZ = cz - hitPoint.z - 3;
    const pushLen = Math.sqrt(pushX * pushX + pushY * pushY + pushZ * pushZ);
    const speed = 7 + Math.random() * 2;
    this.velocity.set(
      (pushX / pushLen) * speed,
      (pushY / pushLen) * speed,
      (pushZ / pushLen) * speed
    );

    // Project the hit offset onto the camera's own right/up axes so that
    // "left of centre on screen" and "above centre on screen" map correctly
    // regardless of the camera's tilt.
    const hitOffset = new THREE.Vector3(hitPoint.x - cx, hitPoint.y - cy, hitPoint.z - cz);
    const camRight = new THREE.Vector3();
    const camUp    = new THREE.Vector3();
    camera.matrixWorld.extractBasis(camRight, camUp, new THREE.Vector3());
    const offX = hitOffset.dot(camRight); // screen-space left / right
    const offY = hitOffset.dot(camUp);    // screen-space up / down

    // Spin is zero at dead centre and grows with the square of the screen offset.
    const distSq = offX * offX + offY * offY;
    this.spinX = -offY * distSq * 32 + (Math.random() - 0.5) * distSq * 6;
    this.spinY =  offX * distSq * 18 + (Math.random() - 0.5) * distSq * 4;
    this.spinZ = -offX * distSq * 32 + (Math.random() - 0.5) * distSq * 6;

    this.group.rotation.x = 0;
    this.bloodDripTimer = 0;
    spawnBlood(cx, cy + 0.6, cz, 24);
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
    this.velocity.y -= 36 * dt;
    this.group.position.addScaledVector(this.velocity, dt);
    this.group.rotation.x += this.spinX * dt;
    this.group.rotation.y += this.spinY * dt;
    this.group.rotation.z += this.spinZ * dt;

    // Continuous blood drip while tumbling
    this.bloodDripTimer -= dt;
    if (this.bloodDripTimer <= 0) {
      this.bloodDripTimer = 0.06 + Math.random() * 0.05;
      spawnBlood(this.group.position.x, this.group.position.y + 0.4, this.group.position.z, 3);
    }

    if (this.group.position.y <= 0.05) {
      this.group.position.y = 0;
      this.state = 'stunned';
      this.stunTimer = 2.5;
      this.group.rotation.x = Math.PI / 2;
      this.group.rotation.z = 0;
      if (this.canLayEggs) spawnEgg(this.group.position.x, this.group.position.z, this.heading);
    }
  }

  updateStunned(dt) {
    this.stunTimer -= dt;
    if (this.stunTimer <= 0) {
      if (!this.canLayEggs) {
        scene.remove(this.group);
        chickens.splice(chickens.indexOf(this), 1);
        return;
      }
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

// ---------- Blood particles ----------

const BLOOD_GEO = new THREE.BoxGeometry(0.07, 0.07, 0.07);
const BLOOD_MATS = [
  new THREE.MeshStandardMaterial({ color: 0xcc0000, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x8b0000, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0xff2200, flatShading: true }),
];
const bloodParticles = [];

function spawnBlood(x, y, z, count) {
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(BLOOD_GEO, BLOOD_MATS[Math.floor(Math.random() * 3)]);
    mesh.scale.setScalar(0.5 + Math.random() * 1.0);
    mesh.position.set(
      x + (Math.random() - 0.5) * 0.25,
      y + (Math.random() - 0.5) * 0.25,
      z + (Math.random() - 0.5) * 0.25
    );
    const speed = 1.5 + Math.random() * 4.5;
    const angle = Math.random() * Math.PI * 2;
    const upBias = 0.3 + Math.random() * 0.65;
    const lateral = Math.sqrt(1 - upBias * upBias);
    scene.add(mesh);
    bloodParticles.push({
      mesh,
      velocity: new THREE.Vector3(
        Math.sin(angle) * lateral * speed,
        upBias * speed,
        Math.cos(angle) * lateral * speed
      ),
      life: 0,
      maxLife: 0.6 + Math.random() * 0.7,
    });
  }
}

function updateBlood(dt) {
  for (let i = bloodParticles.length - 1; i >= 0; i--) {
    const p = bloodParticles[i];
    p.life += dt;
    p.velocity.y -= 16 * dt;
    p.mesh.position.addScaledVector(p.velocity, dt);

    // Splat on ground — tiny bounce then settle
    if (p.mesh.position.y < 0.035) {
      p.mesh.position.y = 0.035;
      p.velocity.y = Math.abs(p.velocity.y) * 0.2;
      p.velocity.x *= 0.5;
      p.velocity.z *= 0.5;
    }

    // Shrink out near end of life
    const t = p.life / p.maxLife;
    if (t > 0.6) {
      p.mesh.scale.setScalar(Math.max(0.001, ((1 - t) / 0.4) * (0.5 + Math.random() * 1.0)));
    }

    if (p.life >= p.maxLife) {
      scene.remove(p.mesh);
      bloodParticles.splice(i, 1);
    }
  }
}

// ---------- Eggs ----------

const EGG_POP_DURATION = 0.25;
const EGG_HATCH_TIME = 30; // seconds until an unswept egg hatches into a new hen
const EGG_WOBBLE_START = 20; // seconds at which hatching wobble begins
const eggGeometry = new THREE.SphereGeometry(0.16, 8, 6);
eggGeometry.scale(0.8, 1.15, 0.8);
const eggMaterial = new THREE.MeshStandardMaterial({ color: 0xfaf3df, flatShading: true });
const eggs = [];

function spawnEgg(x, z, heading) {
  eggsLaid++;
  const egg = new THREE.Mesh(eggGeometry, eggMaterial);
  const behind = 0.4;
  egg.position.set(x - Math.sin(heading) * behind, 0.1, z - Math.cos(heading) * behind);
  egg.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.3);
  egg.scale.setScalar(0.001);
  egg.castShadow = true;
  egg.receiveShadow = true;
  scene.add(egg);
  eggs.push({ mesh: egg, age: 0, vx: 0, vz: 0 });
}

function hatchEgg(egg) {
  scene.remove(egg.mesh);
  const chick = new Chicken(0xffffff, 0xff6a00);
  chick.canLayEggs = false;
  chick.group.position.set(egg.mesh.position.x, 0, egg.mesh.position.z);
  scene.add(chick.group);
  chickens.push(chick);
}

const EGG_RADIUS = 0.13;
const EGG_REMOVE_DIST = BOUNDS + 5;

function updateEggs(dt) {
  const friction = Math.pow(0.1, dt); // velocity decays to ~10% per second
  for (let i = eggs.length - 1; i >= 0; i--) {
    const egg = eggs[i];
    if (egg.age < EGG_POP_DURATION) {
      egg.age += dt;
      const t = Math.min(1, egg.age / EGG_POP_DURATION);
      egg.mesh.scale.setScalar(Math.max(0.001, t * t * (3 - 2 * t)));
      continue;
    }
    egg.age += dt;
    if (egg.age >= EGG_HATCH_TIME) {
      hatchEgg(egg);
      eggs.splice(i, 1);
      continue;
    }
    // Wobble the egg as it nears hatching (last 10 seconds, intensifying toward hatch)
    if (egg.age > EGG_WOBBLE_START) {
      const progress = (egg.age - EGG_WOBBLE_START) / (EGG_HATCH_TIME - EGG_WOBBLE_START);
      const wobble = Math.sin(egg.age * (8 + progress * 14)) * progress * 0.4;
      egg.mesh.rotation.z = wobble;
    }
    egg.vx *= friction;
    egg.vz *= friction;
    egg.mesh.position.x += egg.vx * dt;
    egg.mesh.position.z += egg.vz * dt;
    const spd = Math.sqrt(egg.vx * egg.vx + egg.vz * egg.vz);
    if (spd > 0.05) {
      egg.mesh.rotation.z -= egg.vx * dt * 2.5;
      egg.mesh.rotation.x += egg.vz * dt * 2.5;
    }
    const ex = egg.mesh.position.x;
    const ez = egg.mesh.position.z;
    if (ex > ORTHO_HALF_WIDTH + 0.3) {
      // Egg crossed the right screen edge — hand it off to the packing table.
      transferEggToPack(ez, egg.vx, egg.vz);
      scene.remove(egg.mesh);
      eggs.splice(i, 1);
    } else if (ex < -EGG_REMOVE_DIST || Math.abs(ez) > EGG_REMOVE_DIST) {
      scene.remove(egg.mesh);
      eggs.splice(i, 1);
    }
  }
}

// ---------- Rake ----------

const PRONG_COUNT = 5;
const RAKE_HEAD_WIDTH = 1.2;
const PRONG_RADIUS = 0.055;
const PUSH_STRENGTH = 22;
const EGG_EGG_STRENGTH = 10;
const MAX_EGG_SPEED = 8;

// Rake tilts forward so prong tips sit on the ground and handle rises into air.
// Euler order YXZ: Y sets heading, X tilt stays in local frame regardless of heading.
const RAKE_TILT = Math.PI * 45 / 180;
// Raise the group so tilted prong tips (local z=0.52, y=0.04) land at world y≈0
const RAKE_Y_OFFSET = 0.52 * Math.sin(RAKE_TILT) - 0.04 * Math.cos(RAKE_TILT);

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const groundPoint = new THREE.Vector3();

function makeRake() {
  const group = new THREE.Group();
  const wood  = new THREE.MeshStandardMaterial({ color: 0x9b6b3a, flatShading: true });
  const metal = new THREE.MeshStandardMaterial({ color: 0xa8a8a8, flatShading: true });

  // Handle — lies along local -Z (trails behind movement direction)
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.042, 2.2, 5), wood);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0, 0.04, -1.1);
  handle.castShadow = true;
  group.add(handle);

  // Head bar — perpendicular cross-piece
  const headBar = new THREE.Mesh(new THREE.BoxGeometry(RAKE_HEAD_WIDTH + 0.08, 0.05, 0.07), metal);
  headBar.position.set(0, 0.04, 0.28);
  headBar.castShadow = true;
  group.add(headBar);

  // Prongs — leading edge (local +Z), spread evenly across head width
  const prongsArray = [];
  for (let i = 0; i < PRONG_COUNT; i++) {
    const xPos = ((i / (PRONG_COUNT - 1)) - 0.5) * RAKE_HEAD_WIDTH;
    const prong = new THREE.Mesh(
      new THREE.CylinderGeometry(PRONG_RADIUS * 0.65, PRONG_RADIUS * 0.45, 0.26, 4),
      metal
    );
    prong.rotation.x = Math.PI / 2;
    prong.position.set(xPos, 0.04, 0.52);
    prong.castShadow = true;
    group.add(prong);
    prongsArray.push(prong);
  }

  // YXZ order: heading (Y) rotates first, then tilt (X) is applied in local frame
  // so the handle always rises behind the prongs regardless of drag direction.
  group.rotation.order = 'YXZ';
  group.rotation.y = Math.PI; // default: face into scene
  group.rotation.x = RAKE_TILT;
  group.visible = false;
  scene.add(group);
  return { group, prongsArray };
}

const rake = makeRake();
let raking = false;
let rakeHeading = Math.PI;
let prevRakeX = 0;
let prevRakeZ = 0;

const prongWorldPos = new THREE.Vector3();
const PRONG_COLL_DIST    = PRONG_RADIUS + EGG_RADIUS;
const PRONG_COLL_DIST_SQ = PRONG_COLL_DIST * PRONG_COLL_DIST;
const EGG_EGG_DIST       = EGG_RADIUS * 2;
const EGG_EGG_DIST_SQ   = EGG_EGG_DIST * EGG_EGG_DIST;

function applyRakeCollision() {
  // Prong → egg impulse
  for (const prong of rake.prongsArray) {
    prong.getWorldPosition(prongWorldPos);
    const px = prongWorldPos.x;
    const pz = prongWorldPos.z;
    for (const egg of eggs) {
      if (egg.age < EGG_POP_DURATION) continue;
      const dx = egg.mesh.position.x - px;
      const dz = egg.mesh.position.z - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq < PRONG_COLL_DIST_SQ && distSq > 0.00001) {
        const dist = Math.sqrt(distSq);
        const overlap = PRONG_COLL_DIST - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        egg.vx += nx * overlap * PUSH_STRENGTH;
        egg.vz += nz * overlap * PUSH_STRENGTH;
        egg.mesh.position.x += nx * overlap * 0.5;
        egg.mesh.position.z += nz * overlap * 0.5;
      }
    }
  }

  // Egg → egg push-apart
  for (let i = 0; i < eggs.length; i++) {
    if (eggs[i].age < EGG_POP_DURATION) continue;
    for (let j = i + 1; j < eggs.length; j++) {
      if (eggs[j].age < EGG_POP_DURATION) continue;
      const dx = eggs[j].mesh.position.x - eggs[i].mesh.position.x;
      const dz = eggs[j].mesh.position.z - eggs[i].mesh.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < EGG_EGG_DIST_SQ && distSq > 0.00001) {
        const dist = Math.sqrt(distSq);
        const overlap = EGG_EGG_DIST - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        const imp = overlap * EGG_EGG_STRENGTH;
        eggs[i].vx -= nx * imp;
        eggs[i].vz -= nz * imp;
        eggs[j].vx += nx * imp;
        eggs[j].vz += nz * imp;
      }
    }
  }

  // Cap speed
  for (const egg of eggs) {
    const spd = Math.sqrt(egg.vx * egg.vx + egg.vz * egg.vz);
    if (spd > MAX_EGG_SPEED) {
      egg.vx = (egg.vx / spd) * MAX_EGG_SPEED;
      egg.vz = (egg.vz / spd) * MAX_EGG_SPEED;
    }
  }
}

// ---------- Packing table ----------
// Separate top-down scene rendered into the 1:4 right panel.
// Camera up = world -Z  →  screen-top = world -Z, screen-bottom = world +Z.
// Eggs enter from the left edge (x ≈ -PACK_HALF_W) and simulated gravity
// pulls them toward +Z where the egg carton sits.

const PACK_HALF_W = 1.0;
const PACK_HALF_H = 4.0;

const packScene = new THREE.Scene();
packScene.background = new THREE.Color(0x222222);

const packCamera = new THREE.OrthographicCamera(
  -PACK_HALF_W, PACK_HALF_W,
  PACK_HALF_H, -PACK_HALF_H,
  0.1, 100
);
packCamera.position.set(0, 20, 0);
packCamera.up.set(0, 0, -1);
packCamera.lookAt(new THREE.Vector3(0, 0, 0));
packCamera.updateProjectionMatrix();

packScene.add(new THREE.AmbientLight(0xffffff, 0.85));
const packSun = new THREE.DirectionalLight(0xffffff, 0.7);
packSun.position.set(3, 10, -2);
packScene.add(packSun);
// Metal table — woven halftone pattern baked into a small canvas,
// tiled with NearestFilter to stay crisp at the pixelated render scale.
const packWeaveCanvas = document.createElement('canvas');
packWeaveCanvas.width = packWeaveCanvas.height = 8;
{
  const wc = packWeaveCanvas.getContext('2d');
  wc.fillStyle = '#c4c4c4';
  wc.fillRect(0, 0, 8, 8);
  // Staggered 2×2 dark blocks — basket-weave when tiled
  wc.fillStyle = '#969696';
  for (let y = 0; y < 8; y += 2) {
    const xStart = (y / 2) % 2 === 0 ? 0 : 2;
    for (let x = xStart; x < 8; x += 4) wc.fillRect(x, y, 2, 2);
  }
}
const packWeaveTex = new THREE.CanvasTexture(packWeaveCanvas);
packWeaveTex.wrapS = packWeaveTex.wrapT = THREE.RepeatWrapping;
packWeaveTex.magFilter = THREE.NearestFilter;
packWeaveTex.minFilter = THREE.NearestFilter;
// Table tile size = 0.5 × 0.5 world units (4 across 2.0 wide, 16 across 8.0 tall).
packWeaveTex.repeat.set(4, 16);

const packTableGeo = new THREE.PlaneGeometry(PACK_HALF_W * 2, PACK_HALF_H * 2);
packTableGeo.rotateX(-Math.PI / 2);
packScene.add(new THREE.Mesh(packTableGeo, new THREE.MeshStandardMaterial({
  map: packWeaveTex, metalness: 0.55, roughness: 0.35,
})));

// Thin metal edge strips that frame the table
const edgeMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.9, roughness: 0.1 });
const edgeStrips = [
  { w: PACK_HALF_W * 2, d: 0.04, x: 0, z: -PACK_HALF_H },
  { w: PACK_HALF_W * 2, d: 0.04, x: 0, z:  PACK_HALF_H },
  { w: 0.04, d: PACK_HALF_H * 2, x: -PACK_HALF_W, z: 0 },
  { w: 0.04, d: PACK_HALF_H * 2, x:  PACK_HALF_W, z: 0 },
];
edgeStrips.forEach(({ w, d, x, z }) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), edgeMat);
  m.position.set(x, 0.03, z);
  packScene.add(m);
});

// 8 egg cartons in a 2×4 grid; each carton is 2×6 = 12 slots (96 total).
const GRID_COLS    = 2;
const GRID_ROWS    = 4;
const CARTON_COLS  = 2;
const CARTON_ROWS  = 6;

// Cell size — panel divided evenly into the grid.
const CELL_W = (PACK_HALF_W * 2) / GRID_COLS;  // 1.0
const CELL_H = (PACK_HALF_H * 2) / GRID_ROWS;  // 2.0

// Scale slot spacing and radius to fit 6 rows in the cell height (with 0.08 margin).
// Maintains original r/SS ≈ 0.342 so each carton looks proportionally identical.
// Original: SS=0.38, r=0.13 → cartonH=2.30 which is too tall for a 2.0-unit cell.
// New:      SS=0.30, r=0.10 → cartonH=1.84 fits with 0.08 margin per side.
const SLOT_SPACING = 0.30;
const PACK_SLOT_R  = 0.10;

// Carton outer dimensions derived from slot geometry.
const cartonW = (CARTON_COLS - 1) * SLOT_SPACING + PACK_SLOT_R * 2 + 0.14; // 0.64
const cartonH = (CARTON_ROWS - 1) * SLOT_SPACING + PACK_SLOT_R * 2 + 0.14; // 1.84

const cartonBaseMat = new THREE.MeshStandardMaterial({ color: 0xd4c48a, flatShading: true });
const cartonWallMat = new THREE.MeshStandardMaterial({ color: 0xb8a870, flatShading: true });
const WALL_H = 0.08;

const packSlots = [];
const slotBaseMat   = new THREE.MeshStandardMaterial({ color: 0xc0aa68, flatShading: true });
const slotFilledMat = new THREE.MeshStandardMaterial({ color: 0x8b7040, flatShading: true });
const slotGeo = new THREE.CylinderGeometry(PACK_SLOT_R, PACK_SLOT_R * 0.85, 0.03, 8);

for (let gc = 0; gc < GRID_COLS; gc++) {
  for (let gr = 0; gr < GRID_ROWS; gr++) {
    const cx = -PACK_HALF_W + (gc + 0.5) * CELL_W;
    const cz = -PACK_HALF_H + (gr + 0.5) * CELL_H;

    // Carton base plate.
    const base = new THREE.Mesh(new THREE.BoxGeometry(cartonW, 0.04, cartonH), cartonBaseMat);
    base.position.set(cx, 0.02, cz);
    packScene.add(base);

    // Outer walls — thickness proportional to slot spacing.
    const WT = SLOT_SPACING * 0.11;   // ≈ 0.033
    const sideWallGeo = new THREE.BoxGeometry(WT, WALL_H, cartonH + WT);
    const endWallGeo  = new THREE.BoxGeometry(cartonW + WT, WALL_H, WT);
    [-1, 1].forEach(s => {
      const sw = new THREE.Mesh(sideWallGeo, cartonWallMat);
      sw.position.set(cx + s * cartonW / 2, WALL_H / 2, cz);
      packScene.add(sw);
      const ew = new THREE.Mesh(endWallGeo, cartonWallMat);
      ew.position.set(cx, WALL_H / 2, cz + s * cartonH / 2);
      packScene.add(ew);
    });

    // Centre column divider only — no row dividers (matches original single-carton design).
    const colDiv = new THREE.Mesh(
      new THREE.BoxGeometry(SLOT_SPACING * 0.07, WALL_H, cartonH), cartonWallMat);
    colDiv.position.set(cx, WALL_H / 2, cz);
    packScene.add(colDiv);

    // Egg slots.
    for (let row = 0; row < CARTON_ROWS; row++) {
      for (let col = 0; col < CARTON_COLS; col++) {
        const sx = cx + (col - (CARTON_COLS - 1) / 2) * SLOT_SPACING;
        const sz = cz + (row - (CARTON_ROWS - 1) / 2) * SLOT_SPACING;
        const sm = new THREE.Mesh(slotGeo, slotBaseMat);
        sm.position.set(sx, 0.035, sz);
        packScene.add(sm);
        packSlots.push({ x: sx, z: sz, filled: false, mesh: sm });
      }
    }
  }
}

// Pack egg physics constants
const PACK_GRAVITY      = 1.0;  // gentle slope pull
const PACK_ATTRACT_DIST = 0.18; // only attracts when almost on top of a slot
const PACK_ATTRACT_STR  = 1.8;  // gentle nudge, not a magnet
const PACK_SNAP_DIST    = 0.12;
const PACK_EGG_DIAM     = 0.22;
const packEggs = [];

// farmZ   — world-Z of the egg when it exited the farm (for screen-Y alignment)
// farmVx/Vz — velocity at exit, carried into the pack scene
function transferEggToPack(farmZ, farmVx, farmVz) {
  eggsSwept++;
  if (packSlots.every(s => s.filled)) return;
  const m = new THREE.Mesh(eggGeometry, eggMaterial);
  // Farm camera is elevated at elevationRad, so world-Z maps to screen-Y via sin(elevation).
  // Pack camera is top-down, so screen-Y maps directly to world-Z.
  // Match NDC-Y: packZ = (farmZ·sin − egg_y·cos) · PACK_HALF_H / ORTHO_HALF_HEIGHT
  const EGG_Y = 0.1;
  const entryZ = THREE.MathUtils.clamp(
    (farmZ * Math.sin(elevationRad) - EGG_Y * Math.cos(elevationRad)) * PACK_HALF_H / ORTHO_HALF_HEIGHT,
    -PACK_HALF_H + 0.15, PACK_HALF_H - 0.15
  );
  m.position.set(-PACK_HALF_W + 0.15, 0.1, entryZ);
  m.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.3);
  packScene.add(m);
  // Carry rightward push from the rake; dampen Z so the egg doesn't shoot off.
  packEggs.push({
    mesh: m,
    vx: Math.max(0.3, farmVx * 0.18),
    vz: farmVz * 0.15,
    settled: false,
    held: false,
    slot: null,
  });
}

function updatePackEggs(dt) {
  const packFriction = Math.pow(0.1, dt); // uniform rolling friction

  for (let i = packEggs.length - 1; i >= 0; i--) {
    const egg = packEggs[i];
    if (egg.settled || egg.held) continue;

    // Gravity toward bottom of screen (+Z direction)
    egg.vz += PACK_GRAVITY * dt;

    // Attract toward nearest unfilled slot
    let nearest = null;
    let nearestDist = Infinity;
    for (const slot of packSlots) {
      if (slot.filled) continue;
      const dx = slot.x - egg.mesh.position.x;
      const dz = slot.z - egg.mesh.position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < nearestDist) { nearestDist = d; nearest = slot; }
    }
    if (nearest && nearestDist < PACK_ATTRACT_DIST) {
      const dx = nearest.x - egg.mesh.position.x;
      const dz = nearest.z - egg.mesh.position.z;
      egg.vx += (dx / nearestDist) * PACK_ATTRACT_STR * dt;
      egg.vz += (dz / nearestDist) * PACK_ATTRACT_STR * dt;
    }

    // Snap into slot
    if (nearest && nearestDist < PACK_SNAP_DIST) {
      egg.mesh.position.set(nearest.x, 0.14, nearest.z);
      egg.mesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
      egg.vx = 0; egg.vz = 0;
      nearest.filled = true;
      nearest.mesh.material = slotFilledMat;
      egg.settled = true;
      egg.slot = nearest;
      continue;
    }

    egg.vx *= packFriction;
    egg.vz *= packFriction;

    egg.mesh.position.x += egg.vx * dt;
    egg.mesh.position.z += egg.vz * dt;

    // Visual roll
    const spd = Math.sqrt(egg.vx * egg.vx + egg.vz * egg.vz);
    if (spd > 0.05) {
      egg.mesh.rotation.z -= egg.vx * dt * 2.5;
      egg.mesh.rotation.x += egg.vz * dt * 2.5;
    }

    // Table boundary bounce
    const bx = PACK_HALF_W - 0.13;
    const bz = PACK_HALF_H - 0.13;
    if (Math.abs(egg.mesh.position.x) > bx) {
      egg.mesh.position.x = Math.sign(egg.mesh.position.x) * bx;
      egg.vx *= -0.4;
    }
    if (egg.mesh.position.z < -bz) { egg.mesh.position.z = -bz; egg.vz *= -0.4; }
    if (egg.mesh.position.z >  bz) { egg.mesh.position.z =  bz; egg.vz *= -0.4; }
  }

  // Pack egg-egg collision
  for (let i = 0; i < packEggs.length; i++) {
    if (packEggs[i].settled || packEggs[i].held) continue;
    for (let j = i + 1; j < packEggs.length; j++) {
      if (packEggs[j].settled || packEggs[j].held) continue;
      const dx = packEggs[j].mesh.position.x - packEggs[i].mesh.position.x;
      const dz = packEggs[j].mesh.position.z - packEggs[i].mesh.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < PACK_EGG_DIAM * PACK_EGG_DIAM && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const overlap = PACK_EGG_DIAM - dist;
        const nx = dx / dist, nz = dz / dist;
        const imp = overlap * 8;
        packEggs[i].vx -= nx * imp; packEggs[i].vz -= nz * imp;
        packEggs[j].vx += nx * imp; packEggs[j].vz += nz * imp;
      }
    }
  }
}

// ---------- Pack table — glove hand interaction ----------

const packRaycaster  = new THREE.Raycaster();
const packPointer    = new THREE.Vector2();
const packGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const packWorldPoint  = new THREE.Vector3();
let heldPackEgg     = null;
let hoveredPackEgg  = null;

// Glove cursor — floats over the pack canvas like the bullseye over the farm.
const gloveEl = document.createElement('div');
Object.assign(gloveEl.style, {
  display: 'none',
  position: 'absolute',
  transform: 'translate(-50%, -48%)',
  pointerEvents: 'none',
  zIndex: '10',
  color: '#e8d44d',          // yellow rubber glove
  filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.55))',
});
packFrame.appendChild(gloveEl);

// Animated glove — one persistent SVG; finger/palm rects updated per frame.
const SVGNS = 'http://www.w3.org/2000/svg';
function mkSvgRect(x, y, w, h, rx, fill) {
  const r = document.createElementNS(SVGNS, 'rect');
  r.setAttribute('x', x);     r.setAttribute('y', y);
  r.setAttribute('width', w); r.setAttribute('height', h);
  r.setAttribute('rx', rx);   r.setAttribute('fill', fill ?? 'currentColor');
  return r;
}
const gloveSvg = document.createElementNS(SVGNS, 'svg');
gloveSvg.setAttribute('viewBox', '0 0 38 52');
gloveSvg.setAttribute('width', '34');
gloveSvg.setAttribute('height', '46');
gloveEl.appendChild(gloveSvg);

// [x, w, rx, yOpen, hOpen, yClose, hClose] — finger bottoms anchor at y=26 when open.
const FDEFS = [
  [ 1, 8, 4.0,  4, 22,  2, 13],
  [11, 8, 4.0,  2, 24,  0, 15],
  [21, 8, 4.0,  2, 24,  2, 13],
  [30, 7, 3.5,  6, 20,  5, 10],
];
const fingerRects = FDEFS.map(([x, w, rx, yO, hO]) => {
  const r = mkSvgRect(x, yO, w, hO, rx);
  gloveSvg.appendChild(r);
  return r;
});
const glovePalm      = mkSvgRect(1, 20, 36, 18, 7);
gloveSvg.appendChild(glovePalm);
const gloveThumb     = mkSvgRect(1, 28, 12,  8, 4);
gloveThumb.setAttribute('opacity', '0');
gloveSvg.appendChild(gloveThumb);
const gloveCuff      = mkSvgRect(5, 33, 28, 17, 5);
gloveSvg.appendChild(gloveCuff);
const gloveCuffShine = mkSvgRect(7, 35, 24,  3, 1.5, 'white');
gloveCuffShine.setAttribute('opacity', '0.22');
gloveSvg.appendChild(gloveCuffShine);

let gloveState = 'idle'; // 'idle' | 'hover' | 'hold'
let gloveAnimT = 0;

function updateGlovePos(event) {
  const fr = packFrame.getBoundingClientRect();
  gloveEl.style.left = `${event.clientX - fr.left}px`;
  gloveEl.style.top  = `${event.clientY - fr.top}px`;
}

function updateGloveAnimation(dt) {
  if (gloveState === 'idle') return;
  gloveAnimT += dt;

  // Overall grab factor: 0 = fully open, 1 = fully closed.
  let grabFactor;
  if (gloveState === 'hold') {
    // Tight fist with a subtle squeeze pulse.
    grabFactor = 1.0 - Math.abs(Math.sin(gloveAnimT * 7)) * 0.07;
  } else {
    // Eager reach: rhythmic close-and-open at ~1.4 Hz, never quite closing all the way.
    const raw = (Math.sin(gloveAnimT * Math.PI * 2.8) + 1) / 2;
    grabFactor = Math.pow(raw, 0.45) * 0.82;
  }

  // Vertical bounce while hovering — hand "reaching" up and down.
  const bounce = gloveState === 'hold' ? 0 : Math.sin(gloveAnimT * 10.5) * 2.8;
  gloveEl.style.transform = `translate(-50%, calc(-48% + ${bounce.toFixed(1)}px))`;

  // Each finger closes with a slight rolling delay (70 ms stagger).
  FDEFS.forEach(([,, , yO, hO, yC, hC], i) => {
    let tf;
    if (gloveState === 'hold') {
      tf = grabFactor;
    } else {
      const phase = i * 0.07;
      const raw = (Math.sin((gloveAnimT - phase) * Math.PI * 2.8) + 1) / 2;
      tf = Math.pow(raw, 0.45) * 0.82;
    }
    fingerRects[i].setAttribute('y', (yO + (yC - yO) * tf).toFixed(1));
    fingerRects[i].setAttribute('height', (hO + (hC - hO) * tf).toFixed(1));
  });

  // Palm shifts up and shortens as hand closes.
  const palmY = 20 + (11 - 20) * grabFactor;
  const palmH = 18 + (15 - 18) * grabFactor;
  glovePalm.setAttribute('y', palmY.toFixed(1));
  glovePalm.setAttribute('height', palmH.toFixed(1));
  const cuffY = palmY + palmH;
  gloveCuff.setAttribute('y', cuffY.toFixed(1));
  gloveCuffShine.setAttribute('y', (cuffY + 2).toFixed(1));

  // Thumb fades in and tracks the palm as the grip tightens.
  gloveThumb.setAttribute('y', (palmY + 8).toFixed(1));
  gloveThumb.setAttribute('opacity', THREE.MathUtils.clamp(grabFactor * 1.3 - 0.1, 0, 1).toFixed(2));
}

packRenderer.domElement.addEventListener('mousemove', (event) => {
  const rect = packRenderer.domElement.getBoundingClientRect();
  packPointer.x = ((event.clientX - rect.left) / rect.width)  * 2 - 1;
  packPointer.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
  packRaycaster.setFromCamera(packPointer, packCamera);

  if (heldPackEgg) {
    // Drag held egg to cursor world position.
    if (packRaycaster.ray.intersectPlane(packGroundPlane, packWorldPoint)) {
      const bx = PACK_HALF_W - 0.15, bz = PACK_HALF_H - 0.15;
      heldPackEgg.mesh.position.x = THREE.MathUtils.clamp(packWorldPoint.x, -bx, bx);
      heldPackEgg.mesh.position.z = THREE.MathUtils.clamp(packWorldPoint.z, -bz, bz);
      heldPackEgg.mesh.position.y = 0.28; // lifted slightly
    }
    updateGlovePos(event);
    return;
  }

  // Check hover over any pack egg.
  const meshes = packEggs.map(e => e.mesh);
  const hits = meshes.length ? packRaycaster.intersectObjects(meshes) : [];
  if (hits.length > 0) {
    hoveredPackEgg = packEggs.find(e => e.mesh === hits[0].object) || null;
    gloveState = 'hover';
    gloveEl.style.display = 'block';
    packRenderer.domElement.style.cursor = 'none';
    updateGlovePos(event);
  } else {
    hoveredPackEgg = null;
    gloveState = 'idle';
    gloveEl.style.display = 'none';
    packRenderer.domElement.style.cursor = '';
  }
});

packRenderer.domElement.addEventListener('mouseleave', () => {
  if (!heldPackEgg) {
    hoveredPackEgg = null;
    gloveState = 'idle';
    gloveEl.style.display = 'none';
    packRenderer.domElement.style.cursor = '';
  }
});

packRenderer.domElement.addEventListener('mousedown', () => {
  if (!hoveredPackEgg) return;
  heldPackEgg = hoveredPackEgg;
  hoveredPackEgg = null;
  // If the egg was settled in a slot, free that slot.
  if (heldPackEgg.slot) {
    heldPackEgg.slot.filled = false;
    heldPackEgg.slot.mesh.material = slotBaseMat;
    heldPackEgg.slot = null;
  }
  heldPackEgg.settled = false;
  heldPackEgg.held = true;
  heldPackEgg.vx = 0;
  heldPackEgg.vz = 0;
  gloveState = 'hold';
  packRenderer.domElement.style.cursor = 'none';
});

packRenderer.domElement.addEventListener('mouseup', () => {
  if (!heldPackEgg) return;
  heldPackEgg.held = false;
  heldPackEgg.mesh.position.y = 0.1; // back to table height

  // Snap into nearest open slot if close enough.
  let nearest = null, nearestDist = Infinity;
  for (const slot of packSlots) {
    if (slot.filled) continue;
    const dx = slot.x - heldPackEgg.mesh.position.x;
    const dz = slot.z - heldPackEgg.mesh.position.z;
    const d  = Math.sqrt(dx * dx + dz * dz);
    if (d < nearestDist) { nearestDist = d; nearest = slot; }
  }
  if (nearest && nearestDist < 0.22) {
    heldPackEgg.mesh.position.set(nearest.x, 0.14, nearest.z);
    heldPackEgg.mesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
    heldPackEgg.vx = 0; heldPackEgg.vz = 0;
    nearest.filled = true;
    nearest.mesh.material = slotFilledMat;
    heldPackEgg.settled = true;
    heldPackEgg.slot = nearest;
  } else {
    heldPackEgg.vx = 0;
    heldPackEgg.vz = 0;
  }

  const released = heldPackEgg;
  heldPackEgg = null;

  // Re-check hover so the glove immediately becomes open if still over an egg.
  const meshes = packEggs.filter(e => e !== released).map(e => e.mesh);
  const hits = meshes.length ? packRaycaster.intersectObjects(meshes) : [];
  if (hits.length > 0) {
    hoveredPackEgg = packEggs.find(e => e.mesh === hits[0].object) || null;
    gloveState = 'hover';
    gloveEl.style.display = 'block';
  } else {
    hoveredPackEgg = null;
    gloveState = 'idle';
    gloveEl.style.display = 'none';
    packRenderer.domElement.style.cursor = '';
  }
});

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

  // Update rake position and heading while dragging
  if (raking && raycaster.ray.intersectPlane(groundPlane, groundPoint)) {
    const dx = groundPoint.x - prevRakeX;
    const dz = groundPoint.z - prevRakeZ;
    if (dx * dx + dz * dz > 0.0001) {
      rakeHeading = Math.atan2(dx, dz);
      rake.group.rotation.y = rakeHeading;
    }
    rake.group.position.set(groundPoint.x, RAKE_Y_OFFSET, groundPoint.z);
    prevRakeX = groundPoint.x;
    prevRakeZ = groundPoint.z;
  }
});

renderer.domElement.addEventListener('mouseleave', () => {
  bullseye.style.display = 'none';
  renderer.domElement.style.cursor = '';
});

// ---------- Input handlers ----------

renderer.domElement.addEventListener('mousedown', (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  // Flying chickens — shoot
  const flying = chickens.filter((c) => c.state === 'fly');
  if (flying.length) {
    const hits = raycaster.intersectObjects(flying.map((c) => c.group), true);
    if (hits.length > 0) {
      let obj = hits[0].object;
      while (obj && !obj.userData.chicken) obj = obj.parent;
      if (obj) { obj.userData.chicken.shootDown(hits[0].point); return; }
    }
  }

  // Walking chickens — agitate / lay egg
  const walking = chickens.filter((c) => c.state === 'walk');
  if (walking.length) {
    const hits = raycaster.intersectObjects(walking.map((c) => c.group), true);
    if (hits.length > 0) {
      let obj = hits[0].object;
      while (obj && !obj.userData.chicken) obj = obj.parent;
      if (obj) { obj.userData.chicken.registerClick(hits[0].point); return; }
    }
  }

  // Ground — start raking
  if (raycaster.ray.intersectPlane(groundPlane, groundPoint)) {
    prevRakeX = groundPoint.x;
    prevRakeZ = groundPoint.z;
    rake.group.position.set(groundPoint.x, RAKE_Y_OFFSET, groundPoint.z);
    rake.group.rotation.y = rakeHeading;
    rake.group.visible = true;
    raking = true;
  }
});

renderer.domElement.addEventListener('mouseup', () => {
  raking = false;
  rake.group.visible = false;
});

// ---------- Stats panel update ----------

const prevStatValues = {};

function flashStat(el) {
  el.style.color = '#e8e847';
  setTimeout(() => { el.style.color = ''; }, 50);
}

function setStat(id, value) {
  const str = String(value);
  if (prevStatValues[id] === str) return;
  prevStatValues[id] = str;
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = str;
  flashStat(el);
}

let statsTick = 0;
function updateStatsPanel(dt) {
  statsTick += dt;
  if (statsTick < 0.2) return;
  statsTick = 0;

  const hens     = chickens.filter(c => c.canLayEggs).length;
  const hensFlying     = chickens.filter(c =>  c.canLayEggs && c.state === 'fly').length;
  const roosters       = chickens.filter(c => !c.canLayEggs).length;
  const roostersFlying = chickens.filter(c => !c.canLayEggs && c.state === 'fly').length;
  const pct            = eggsLaid > 0 ? ((eggsSwept / eggsLaid) * 100).toFixed(1) + '%' : '—';

  setStat('stat-hens',          hens);
  setStat('stat-hens-air',      hensFlying);
  setStat('stat-roosters',      roosters);
  setStat('stat-roosters-air',  roostersFlying);
  setStat('stat-eggs-laid',  eggsLaid);
  setStat('stat-eggs-swept', eggsSwept);
  setStat('stat-eggs-pct',   pct);
  setStat('stat-shots',      totalShots);
}

// ---------- Animation loop ----------

const clock = new THREE.Clock();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.1);
  chickens.forEach((c) => c.update(dt));
  updateBlood(dt);
  updateEggs(dt);
  if (raking) applyRakeCollision();
  updatePackEggs(dt);
  updateGloveAnimation(dt);
  updateStatsPanel(dt);
  renderer.render(scene, camera);
  packRenderer.render(packScene, packCamera);
  requestAnimationFrame(animate);
}

animate();
