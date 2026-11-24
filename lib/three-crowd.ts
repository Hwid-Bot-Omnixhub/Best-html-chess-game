import * as THREE from 'three';
import { FLOOR_Y } from './three-chess-assets';

export type CrowdRole = 'photographer' | 'watcher' | 'cheerer';

interface CrowdSpec {
  x: number;
  z: number;
  yOffset: number;
  role: CrowdRole;
}

interface SpectatorMeta {
  x: number;
  z: number;
  baseY: number;
  scale: number;
  yaw: number;
  role: CrowdRole;
  phase: number;
  speedMult: number;
  photoIdx: number;
  nextFlashIn: number;
  flashTimer: number;
}

export interface CrowdSystem {
  group: THREE.Group;
  update: (
    dt: number,
    elapsed: number,
    focusWorld: THREE.Vector3,
    excitement: number,
    onFlash?: () => void
  ) => void;
  dispose: () => void;
}

// Pre-allocated math helpers at module scope — ZERO GC allocations in the render loop
const _toFocus = new THREE.Vector3();
const _boardFocusOrigin = new THREE.Vector3(4, 0, 4);
const _axisY = new THREE.Vector3(0, 1, 0);

const _vPos = new THREE.Vector3();
const _vScale = new THREE.Vector3();
const _vOne = new THREE.Vector3(1, 1, 1);
const _vZero = new THREE.Vector3(0, 0, 0);
const _vUpper = new THREE.Vector3(0, 0.94, 0);
const _vHead = new THREE.Vector3(0, 1.03, 0.02);
const _vArm = new THREE.Vector3();
const _vFore = new THREE.Vector3(0, -0.56, 0);
const _vCam = new THREE.Vector3(0, -0.05, 0.34);
const _vFlashScale = new THREE.Vector3();
const _vFlashPos = new THREE.Vector3(0.07, 0.06, 0.08);
const _vSkullScale = new THREE.Vector3(1, 1.08, 1);

const _eTmp = new THREE.Euler();
const _qRoot = new THREE.Quaternion();
const _qUpper = new THREE.Quaternion();
const _qHead = new THREE.Quaternion();
const _qArm = new THREE.Quaternion();
const _qFore = new THREE.Quaternion();
const _qCamLens = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const _qIdentity = new THREE.Quaternion();

const _mRoot = new THREE.Matrix4();
const _mUpperLocal = new THREE.Matrix4();
const _mUpperWorld = new THREE.Matrix4();
const _mHeadLocal = new THREE.Matrix4();
const _mHeadWorld = new THREE.Matrix4();
const _mArmLocal = new THREE.Matrix4();
const _mArmWorld = new THREE.Matrix4();
const _mForeLocal = new THREE.Matrix4();
const _mForeWorld = new THREE.Matrix4();
const _mCamLocal = new THREE.Matrix4();
const _mCamWorld = new THREE.Matrix4();
const _mTmp = new THREE.Matrix4();
const _mOut = new THREE.Matrix4();
const _cTmp = new THREE.Color();

const JACKET_PALETTE = [
  0x1d2438,
  0x2c1e2a,
  0x1e332d,
  0x33271e,
  0x242636,
  0x3d2028,
  0x263248,
  0x2d2a24,
  0x18202c,
  0x312b42,
];
const SHIRT_PALETTE = [0xe8ecf2, 0xd8cdb8, 0xb8c7da, 0xe5d6c5, 0xc7d2de];
const SKIN_PALETTE = [0xf2c29b, 0xe5b288, 0xc68b59, 0x8d5524, 0xf6cfb2];
const HAIR_PALETTE = [0x171412, 0x3b2618, 0x614124, 0x2a2623, 0x9e7d47, 0x767a82];

function addStanchionBarrier(
  parent: THREE.Group,
  points: [number, number][],
  trackG: <T extends THREE.BufferGeometry>(g: T) => T,
  trackM: <T extends THREE.Material>(m: T) => T
) {
  const brassMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xd9b24c,
      roughness: 0.24,
      metalness: 0.86,
    })
  );
  const darkBaseMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x161824,
      roughness: 0.42,
      metalness: 0.55,
    })
  );
  const redVelvetMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x991b22,
      roughness: 0.72,
      metalness: 0.05,
    })
  );

  const baseDiscGeo = trackG(new THREE.CylinderGeometry(0.32, 0.36, 0.09, 14));
  const baseDomeGeo = trackG(new THREE.CylinderGeometry(0.11, 0.28, 0.11, 14));
  const poleShaftGeo = trackG(new THREE.CylinderGeometry(0.052, 0.058, 2.15, 10));
  const collarGeo = trackG(new THREE.TorusGeometry(0.075, 0.02, 6, 12));
  const finialGeo = trackG(new THREE.SphereGeometry(0.105, 10, 10));
  const claspGeo = trackG(new THREE.CylinderGeometry(0.052, 0.052, 0.14, 8));

  const ropeAnchorY = FLOOR_Y + 1.94;
  const dirVec = new THREE.Vector3();
  const upVec = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < points.length; i++) {
    const [px, pz] = points[i];
    const poleGroup = new THREE.Group();
    poleGroup.position.set(px, FLOOR_Y, pz);

    const baseDisc = new THREE.Mesh(baseDiscGeo, darkBaseMat);
    baseDisc.position.y = 0.045;
    baseDisc.receiveShadow = true;
    poleGroup.add(baseDisc);

    const baseDome = new THREE.Mesh(baseDomeGeo, brassMat);
    baseDome.position.y = 0.14;
    poleGroup.add(baseDome);

    const shaft = new THREE.Mesh(poleShaftGeo, brassMat);
    shaft.position.y = 1.075;
    shaft.castShadow = true;
    poleGroup.add(shaft);

    const collar = new THREE.Mesh(collarGeo, brassMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.94;
    poleGroup.add(collar);

    const finial = new THREE.Mesh(finialGeo, brassMat);
    finial.position.y = 2.22;
    poleGroup.add(finial);

    poleGroup.updateMatrixWorld(true);
    poleGroup.traverse((o) => {
      o.matrixAutoUpdate = false;
      o.updateMatrix();
    });
    parent.add(poleGroup);

    if (i < points.length - 1) {
      const [nx, nz] = points[i + 1];
      const start = new THREE.Vector3(px, ropeAnchorY, pz);
      const end = new THREE.Vector3(nx, ropeAnchorY, nz);
      const mid = new THREE.Vector3(
        (px + nx) * 0.5,
        ropeAnchorY - 0.38,
        (pz + nz) * 0.5
      );
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const ropeGeo = trackG(new THREE.TubeGeometry(curve, 14, 0.045, 7, false));
      const ropeMesh = new THREE.Mesh(ropeGeo, redVelvetMat);
      ropeMesh.matrixAutoUpdate = false;
      ropeMesh.updateMatrix();
      parent.add(ropeMesh);

      dirVec.subVectors(end, start).normalize();
      for (const anchor of [start, end]) {
        const clasp = new THREE.Mesh(claspGeo, brassMat);
        clasp.position.copy(anchor).addScaledVector(dirVec, anchor === start ? 0.1 : -0.1);
        clasp.quaternion.setFromUnitVectors(upVec, dirVec);
        clasp.matrixAutoUpdate = false;
        clasp.updateMatrix();
        parent.add(clasp);
      }
    }
  }
}

export function createCrowdSystem(): CrowdSystem {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackG = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackM = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // ---- STANCHION POLES WITH RED VELVET ROPES ----
  // 1) Back VIP barrier behind Black player
  addStanchionBarrier(
    group,
    [
      [-2.4, -4.1],
      [0.8, -4.1],
      [4.0, -4.1],
      [7.2, -4.1],
      [10.4, -4.1],
    ],
    trackG,
    trackM
  );

  // 2) Right-side VIP barrier behind chess clock & capture tray
  addStanchionBarrier(
    group,
    [
      [12.0, -2.8],
      [12.0, 0.6],
      [12.0, 4.0],
      [12.0, 7.4],
      [12.0, 10.8],
    ],
    trackG,
    trackM
  );

  // 3) Far-left barrier (2-pole red velvet tie framing the left stage edge without blocking camera)
  addStanchionBarrier(
    group,
    [
      [-3.5, -2.6],
      [-3.5, 0.8],
      [-3.5, 4.1],
    ],
    trackG,
    trackM
  );

  // ---- TIERED STANDING GALLERY RISERS (subtle dark arena steps for back rows) ----
  const riserMat = trackM(new THREE.MeshStandardMaterial({ color: 0x131624, roughness: 0.9 }));
  const backRiserGeo = trackG(new THREE.BoxGeometry(15.5, 0.24, 2.8));
  const backRiser = new THREE.Mesh(backRiserGeo, riserMat);
  backRiser.position.set(4.1, FLOOR_Y + 0.12, -7.8);
  backRiser.matrixAutoUpdate = false;
  backRiser.updateMatrix();
  group.add(backRiser);

  const rightRiserGeo = trackG(new THREE.BoxGeometry(2.8, 0.24, 15.2));
  const rightRiser = new THREE.Mesh(rightRiserGeo, riserMat);
  rightRiser.position.set(16.0, FLOOR_Y + 0.12, 3.8);
  rightRiser.matrixAutoUpdate = false;
  rightRiser.updateMatrix();
  group.add(rightRiser);

  // ---- DENSE 72-SPECTATOR CROWD ROSTER (3 tiered rows, zero-lag instancing) ----
  const ROLES: CrowdRole[] = ['watcher', 'photographer', 'cheerer', 'watcher', 'cheerer'];
  const crowdSpecs: CrowdSpec[] = [];

  // Back gallery: 3 rows (11 + 11 + 11 = 33 spectators)
  for (let i = 0; i < 11; i++) {
    const x = -2.2 + i * 1.28;
    crowdSpecs.push({ x, z: -5.15, yOffset: 0, role: ROLES[i % ROLES.length] });
  }
  for (let i = 0; i < 11; i++) {
    const x = -1.55 + i * 1.28;
    crowdSpecs.push({ x, z: -6.35, yOffset: 0, role: ROLES[(i + 2) % ROLES.length] });
  }
  for (let i = 0; i < 11; i++) {
    const x = -2.2 + i * 1.28;
    crowdSpecs.push({ x, z: -7.75, yOffset: 0.24, role: ROLES[(i + 1) % ROLES.length] });
  }

  // Right gallery: 3 rows (9 + 9 + 9 = 27 spectators)
  for (let i = 0; i < 9; i++) {
    const z = -2.1 + i * 1.48;
    crowdSpecs.push({ x: 13.15, z, yOffset: 0, role: ROLES[(i + 1) % ROLES.length] });
  }
  for (let i = 0; i < 9; i++) {
    const z = -1.4 + i * 1.48;
    crowdSpecs.push({ x: 14.45, z, yOffset: 0, role: ROLES[(i + 3) % ROLES.length] });
  }
  for (let i = 0; i < 9; i++) {
    const z = -2.0 + i * 1.48;
    crowdSpecs.push({ x: 15.85, z, yOffset: 0.24, role: ROLES[i % ROLES.length] });
  }

  // Far-left flank behind the red-rope barrier: 2 rows (6 + 6 = 12 spectators)
  for (let i = 0; i < 6; i++) {
    const z = -2.2 + i * 1.26;
    crowdSpecs.push({ x: -4.65, z, yOffset: 0, role: ROLES[(i + 2) % ROLES.length] });
  }
  for (let i = 0; i < 6; i++) {
    const z = -1.55 + i * 1.26;
    crowdSpecs.push({ x: -5.95, z, yOffset: 0.1, role: ROLES[(i + 4) % ROLES.length] });
  }

  const N = crowdSpecs.length; // 72 spectators
  const N2 = N * 2;

  // ---- SHARED INSTANCED GEOMETRIES & MATERIALS (~13 draw calls total for ALL 72 spectators!) ----
  const legGeo = trackG(new THREE.CylinderGeometry(0.11, 0.095, 0.92, 7));
  const shoeGeo = trackG(new THREE.BoxGeometry(0.16, 0.08, 0.28));
  const torsoGeo = trackG(new THREE.CylinderGeometry(0.28, 0.24, 0.82, 8));
  const shirtGeo = trackG(new THREE.BoxGeometry(0.18, 0.42, 0.06));
  const headGeo = trackG(new THREE.SphereGeometry(0.21, 10, 8));
  const hairGeo = trackG(
    new THREE.SphereGeometry(0.222, 9, 7, 0, Math.PI * 2, 0, Math.PI * 0.58)
  );
  const eyeGeo = trackG(new THREE.SphereGeometry(0.022, 5, 5));
  const upperArmGeo = trackG(new THREE.CylinderGeometry(0.082, 0.075, 0.56, 7));
  const foreArmGeo = trackG(new THREE.CylinderGeometry(0.07, 0.062, 0.54, 7));
  const handGeo = trackG(new THREE.SphereGeometry(0.065, 6, 5));
  const cameraBodyGeo = trackG(new THREE.BoxGeometry(0.24, 0.14, 0.11));
  const cameraLensGeo = trackG(new THREE.CylinderGeometry(0.048, 0.055, 0.12, 8));
  const flashBulbGeo = trackG(new THREE.SphereGeometry(0.075, 6, 6));

  const pantsMat = trackM(new THREE.MeshStandardMaterial({ color: 0x151822, roughness: 0.82 }));
  const shoeMat = trackM(new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.35 }));
  const eyeMat = trackM(new THREE.MeshStandardMaterial({ color: 0x12131c, roughness: 0.2 }));
  const cameraMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0x1c1e26, roughness: 0.3, metalness: 0.65 })
  );
  const lensMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0x26354d, roughness: 0.12, metalness: 0.9 })
  );
  const flashMat = trackM(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
  );

  // Neutral white base materials tinted per-instance via setColorAt()
  const jacketInstMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.68, metalness: 0.05 })
  );
  const shirtInstMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 })
  );
  const skinInstMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 })
  );
  const hairInstMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 })
  );

  const legsInst = new THREE.InstancedMesh(legGeo, pantsMat, N2);
  const shoesInst = new THREE.InstancedMesh(shoeGeo, shoeMat, N2);
  const torsoInst = new THREE.InstancedMesh(torsoGeo, jacketInstMat, N);
  const shirtInst = new THREE.InstancedMesh(shirtGeo, shirtInstMat, N);
  const headInst = new THREE.InstancedMesh(headGeo, skinInstMat, N);
  const hairInst = new THREE.InstancedMesh(hairGeo, hairInstMat, N);
  const eyesInst = new THREE.InstancedMesh(eyeGeo, eyeMat, N2);
  const upperArmsInst = new THREE.InstancedMesh(upperArmGeo, jacketInstMat, N2);
  const foreArmsInst = new THREE.InstancedMesh(foreArmGeo, jacketInstMat, N2);
  const handsInst = new THREE.InstancedMesh(handGeo, skinInstMat, N2);

  let photoCount = 0;
  for (let i = 0; i < N; i++) {
    if (crowdSpecs[i].role === 'photographer') photoCount++;
  }
  const P = Math.max(1, photoCount);
  const camBodyInst = new THREE.InstancedMesh(cameraBodyGeo, cameraMat, P);
  const camLensInst = new THREE.InstancedMesh(cameraLensGeo, lensMat, P);
  const flashInst = new THREE.InstancedMesh(flashBulbGeo, flashMat, P);

  const dynamicInsts = [
    torsoInst,
    shirtInst,
    headInst,
    hairInst,
    eyesInst,
    upperArmsInst,
    foreArmsInst,
    handsInst,
    camBodyInst,
    camLensInst,
    flashInst,
  ];
  for (const inst of [legsInst, shoesInst, ...dynamicInsts]) {
    inst.frustumCulled = false;
    group.add(inst);
  }
  for (const inst of dynamicInsts) {
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  const spectators: SpectatorMeta[] = [];
  let pCursor = 0;

  for (let idx = 0; idx < N; idx++) {
    const spec = crowdSpecs[idx];
    const scale = 1.98 + ((idx * 17) % 11) * 0.018;
    const baseY = FLOOR_Y + spec.yOffset;
    const yaw = Math.atan2(4 - spec.x, 4 - spec.z);
    const photoIdx = spec.role === 'photographer' ? pCursor++ : -1;

    // Pre-bake static leg + shoe transforms once at init!
    _mRoot.compose(
      _vPos.set(spec.x, baseY, spec.z),
      _qRoot.setFromAxisAngle(_axisY, yaw),
      _vScale.set(scale, scale, scale)
    );
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? 1 : -1;
      _mTmp.makeTranslation(side * 0.14, 0.5, 0);
      _mOut.multiplyMatrices(_mRoot, _mTmp);
      legsInst.setMatrixAt(idx * 2 + s, _mOut);

      _mTmp.makeTranslation(side * 0.14, 0.04, 0.06);
      _mOut.multiplyMatrices(_mRoot, _mTmp);
      shoesInst.setMatrixAt(idx * 2 + s, _mOut);
    }

    // Assign per-instance palette colors once at init
    const jacketColor = JACKET_PALETTE[idx % JACKET_PALETTE.length];
    const shirtColor = SHIRT_PALETTE[(idx * 2) % SHIRT_PALETTE.length];
    const skinColor = SKIN_PALETTE[(idx * 3) % SKIN_PALETTE.length];
    const hairColor = HAIR_PALETTE[(idx * 5) % HAIR_PALETTE.length];

    _cTmp.setHex(jacketColor);
    torsoInst.setColorAt(idx, _cTmp);
    upperArmsInst.setColorAt(idx * 2, _cTmp);
    upperArmsInst.setColorAt(idx * 2 + 1, _cTmp);
    foreArmsInst.setColorAt(idx * 2, _cTmp);
    foreArmsInst.setColorAt(idx * 2 + 1, _cTmp);

    _cTmp.setHex(shirtColor);
    shirtInst.setColorAt(idx, _cTmp);

    _cTmp.setHex(skinColor);
    headInst.setColorAt(idx, _cTmp);
    handsInst.setColorAt(idx * 2, _cTmp);
    handsInst.setColorAt(idx * 2 + 1, _cTmp);

    _cTmp.setHex(hairColor);
    hairInst.setColorAt(idx, _cTmp);

    spectators.push({
      x: spec.x,
      z: spec.z,
      baseY,
      scale,
      yaw,
      role: spec.role,
      phase: idx * 1.17,
      speedMult: 0.85 + (idx % 5) * 0.11,
      photoIdx,
      nextFlashIn: 0.7 + ((idx * 1.37) % 4.4),
      flashTimer: 0,
    });
  }

  legsInst.instanceMatrix.needsUpdate = true;
  shoesInst.instanceMatrix.needsUpdate = true;

  let shutterCooldown = 0;

  function update(
    dt: number,
    elapsed: number,
    focusWorld: THREE.Vector3,
    excitement: number,
    onFlash?: () => void
  ) {
    shutterCooldown = Math.max(0, shutterCooldown - dt);
    _toFocus.subVectors(focusWorld, _boardFocusOrigin);
    const focusOffsetYaw = THREE.MathUtils.clamp(_toFocus.x * 0.04, -0.25, 0.25);

    for (let i = 0; i < N; i++) {
      const sp = spectators[i];
      const t = elapsed * sp.speedMult + sp.phase;

      let bounce = 0;
      let upperPitch = 0.08;
      let headPitch = 0.06;
      let headYaw = focusOffsetYaw * 0.5;
      let lArmRx = -0.42;
      let lArmRy = 0;
      let lArmRz = -0.14;
      let lForeRx = -1.05;
      let rArmRx = -0.42;
      let rArmRy = 0;
      let rArmRz = 0.14;
      let rForeRx = -1.05;

      if (sp.role === 'photographer') {
        upperPitch = 0.08 + Math.sin(t * 0.9) * 0.03;
        headYaw = Math.sin(t * 0.7) * 0.12 + focusOffsetYaw * 0.5;
        headPitch = 0.06 + Math.sin(t * 1.3) * 0.03;
        const aimLift = Math.sin(t * 1.1) * 0.08;
        lArmRx = -1.12 + aimLift;
        lArmRz = -0.28;
        lForeRx = -1.18;
        rArmRx = -1.12 + aimLift;
        rArmRz = 0.28;
        rForeRx = -1.18;

        sp.nextFlashIn -= dt * (1 + excitement * 2.1);
        if (sp.nextFlashIn <= 0) {
          sp.flashTimer = 0.14;
          sp.nextFlashIn = excitement > 0.6 ? 1.0 + Math.random() * 1.5 : 2.8 + Math.random() * 4.5;
          if (onFlash && shutterCooldown <= 0) {
            shutterCooldown = 1.4;
            onFlash();
          }
        }
      } else if (sp.role === 'cheerer') {
        const cheerFreq = 4.5 + excitement * 4.2;
        bounce = Math.abs(Math.sin(t * cheerFreq)) * (0.04 + excitement * 0.08);
        upperPitch = -0.05 + Math.sin(t * 3.1) * 0.06;
        headYaw = Math.sin(t * 2.4) * 0.18 + focusOffsetYaw * 0.4;
        headPitch = -0.08 + Math.sin(t * cheerFreq) * 0.08;

        const waveL = Math.sin(t * cheerFreq);
        const waveR = Math.sin(t * cheerFreq + 0.65);
        lArmRx = -2.35 + waveL * 0.45;
        lArmRz = -0.35 - excitement * 0.15;
        lForeRx = -0.45 + Math.abs(waveL) * 0.35;
        rArmRx = -2.35 + waveR * 0.45;
        rArmRz = 0.35 + excitement * 0.15;
        rForeRx = -0.45 + Math.abs(waveR) * 0.35;
      } else {
        upperPitch = 0.12 + Math.sin(t * 0.8) * 0.04;
        headYaw = Math.sin(t * 0.9) * 0.16 + focusOffsetYaw;
        headPitch = 0.1 + Math.sin(t * 0.6) * 0.04;

        if (excitement > 0.55) {
          const clap = Math.sin(t * 9.0) * 0.22;
          lArmRx = -0.95;
          lArmRy = 0.25 + clap;
          lArmRz = -0.1;
          lForeRx = -1.15;
          rArmRx = -0.95;
          rArmRy = -0.25 - clap;
          rArmRz = 0.1;
          rForeRx = -1.15;
        } else {
          lArmRx = -0.42 + Math.sin(t * 0.7) * 0.05;
          rArmRx = -0.42 + Math.cos(t * 0.7) * 0.05;
        }
      }

      // 1) Root + Upper Body
      _mRoot.compose(
        _vPos.set(sp.x, sp.baseY + bounce, sp.z),
        _qRoot.setFromAxisAngle(_axisY, sp.yaw),
        _vScale.set(sp.scale, sp.scale, sp.scale)
      );
      _mUpperLocal.compose(_vUpper, _qUpper.setFromEuler(_eTmp.set(upperPitch, 0, 0)), _vOne);
      _mUpperWorld.multiplyMatrices(_mRoot, _mUpperLocal);

      _mTmp.makeTranslation(0, 0.42, 0);
      _mOut.multiplyMatrices(_mUpperWorld, _mTmp);
      torsoInst.setMatrixAt(i, _mOut);

      _mTmp.makeTranslation(0, 0.56, 0.24);
      _mOut.multiplyMatrices(_mUpperWorld, _mTmp);
      shirtInst.setMatrixAt(i, _mOut);

      // 2) Head + Hair + Eyes (+ Camera/Flash if photographer)
      _mHeadLocal.compose(_vHead, _qHead.setFromEuler(_eTmp.set(headPitch, headYaw, 0)), _vOne);
      _mHeadWorld.multiplyMatrices(_mUpperWorld, _mHeadLocal);

      _mTmp.compose(_vZero, _qIdentity, _vSkullScale);
      _mOut.multiplyMatrices(_mHeadWorld, _mTmp);
      headInst.setMatrixAt(i, _mOut);

      _mTmp.makeTranslation(0, 0.04, 0);
      _mOut.multiplyMatrices(_mHeadWorld, _mTmp);
      hairInst.setMatrixAt(i, _mOut);

      _mTmp.makeTranslation(-0.075, 0.03, 0.195);
      _mOut.multiplyMatrices(_mHeadWorld, _mTmp);
      eyesInst.setMatrixAt(i * 2, _mOut);

      _mTmp.makeTranslation(0.075, 0.03, 0.195);
      _mOut.multiplyMatrices(_mHeadWorld, _mTmp);
      eyesInst.setMatrixAt(i * 2 + 1, _mOut);

      if (sp.photoIdx >= 0) {
        _mCamLocal.compose(_vCam, _qIdentity, _vOne);
        _mCamWorld.multiplyMatrices(_mHeadWorld, _mCamLocal);
        camBodyInst.setMatrixAt(sp.photoIdx, _mCamWorld);

        _mTmp.compose(_vPos.set(0, -0.01, 0.09), _qCamLens, _vOne);
        _mOut.multiplyMatrices(_mCamWorld, _mTmp);
        camLensInst.setMatrixAt(sp.photoIdx, _mOut);

        if (sp.flashTimer > 0) {
          sp.flashTimer = Math.max(0, sp.flashTimer - dt);
          const p = sp.flashTimer / 0.14;
          const fs = 1 + (1 - p) * 2.3;
          _mTmp.compose(_vFlashPos, _qIdentity, _vFlashScale.set(fs, fs, fs));
          _mOut.multiplyMatrices(_mCamWorld, _mTmp);
        } else {
          _mTmp.compose(_vFlashPos, _qIdentity, _vFlashScale.set(0, 0, 0));
          _mOut.multiplyMatrices(_mCamWorld, _mTmp);
        }
        flashInst.setMatrixAt(sp.photoIdx, _mOut);
      }

      // 3) Left Arm + Forearm + Hand
      _mArmLocal.compose(
        _vArm.set(0.34, 0.78, 0.02),
        _qArm.setFromEuler(_eTmp.set(lArmRx, lArmRy, lArmRz)),
        _vOne
      );
      _mArmWorld.multiplyMatrices(_mUpperWorld, _mArmLocal);
      _mTmp.makeTranslation(0, -0.28, 0);
      _mOut.multiplyMatrices(_mArmWorld, _mTmp);
      upperArmsInst.setMatrixAt(i * 2, _mOut);

      _mForeLocal.compose(_vFore, _qFore.setFromEuler(_eTmp.set(lForeRx, 0, 0)), _vOne);
      _mForeWorld.multiplyMatrices(_mArmWorld, _mForeLocal);
      _mTmp.makeTranslation(0, -0.27, 0);
      _mOut.multiplyMatrices(_mForeWorld, _mTmp);
      foreArmsInst.setMatrixAt(i * 2, _mOut);

      _mTmp.makeTranslation(0, -0.56, 0);
      _mOut.multiplyMatrices(_mForeWorld, _mTmp);
      handsInst.setMatrixAt(i * 2, _mOut);

      // 4) Right Arm + Forearm + Hand
      _mArmLocal.compose(
        _vArm.set(-0.34, 0.78, 0.02),
        _qArm.setFromEuler(_eTmp.set(rArmRx, rArmRy, rArmRz)),
        _vOne
      );
      _mArmWorld.multiplyMatrices(_mUpperWorld, _mArmLocal);
      _mTmp.makeTranslation(0, -0.28, 0);
      _mOut.multiplyMatrices(_mArmWorld, _mTmp);
      upperArmsInst.setMatrixAt(i * 2 + 1, _mOut);

      _mForeLocal.compose(_vFore, _qFore.setFromEuler(_eTmp.set(rForeRx, 0, 0)), _vOne);
      _mForeWorld.multiplyMatrices(_mArmWorld, _mForeLocal);
      _mTmp.makeTranslation(0, -0.27, 0);
      _mOut.multiplyMatrices(_mForeWorld, _mTmp);
      foreArmsInst.setMatrixAt(i * 2 + 1, _mOut);

      _mTmp.makeTranslation(0, -0.56, 0);
      _mOut.multiplyMatrices(_mForeWorld, _mTmp);
      handsInst.setMatrixAt(i * 2 + 1, _mOut);
    }

    for (const inst of dynamicInsts) {
      inst.instanceMatrix.needsUpdate = true;
    }
  }

  function dispose() {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  }

  return { group, update, dispose };
}
