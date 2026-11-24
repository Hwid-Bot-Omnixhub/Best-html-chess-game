import * as THREE from 'three';
import type { PieceColor, PieceType } from './chess-engine';
import type { GrandmasterPreset } from './chess-players';

export const FLOOR_Y = -3.4;
export const TABLE_TOP_Y = 0;
export const BOARD_SCALE = 0.62;
export const BOARD_CENTER = { x: 4, z: 4 };
export const PIECE_BASE_Y = 0.525 * BOARD_SCALE;

export const PIECE_GRASP_HEIGHTS: Record<PieceType, number> = {
  p: 0.55 * BOARD_SCALE,
  r: 0.80 * BOARD_SCALE,
  n: 0.80 * BOARD_SCALE,
  b: 0.88 * BOARD_SCALE,
  q: 0.96 * BOARD_SCALE,
  k: 1.05 * BOARD_SCALE,
};

export interface PlayerRig {
  root: THREE.Group;
  torso: THREE.Mesh;
  upperBody: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftForePivot: THREE.Group;
  rightForePivot: THREE.Group;
  leftWristPivot: THREE.Group;
  rightWristPivot: THREE.Group;
  leftThighPivot: THREE.Group;
  rightThighPivot: THREE.Group;
  leftKneePivot: THREE.Group;
  rightKneePivot: THREE.Group;
  lFingerPivots: THREE.Group[];
  rFingerPivots: THREE.Group[];
  lThumbPivot: THREE.Group;
  rThumbPivot: THREE.Group;
  headGroup: THREE.Group;
  mouthMesh: THREE.Mesh;
  browL: THREE.Mesh;
  browR: THREE.Mesh;
  upperArmLen: number;
  foreArmLen: number;
  thighLen: number;
  shinLen: number;
  seatedPosition: THREE.Vector3;
  baseRotationY: number;
  isWhite: boolean;
  presetId: string;
  dispose: () => void;
}

export interface AssetPool {
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
  pieceGeo: {
    baseCyl: THREE.CylinderGeometry;
    baseTrim: THREE.TorusGeometry;
    pStem: THREE.CylinderGeometry;
    pHead: THREE.SphereGeometry;
    rStem: THREE.CylinderGeometry;
    rNeck: THREE.CylinderGeometry;
    rTop: THREE.CylinderGeometry;
    rBatt: THREE.BoxGeometry;
    nStem: THREE.CylinderGeometry;
    nNeck: THREE.BoxGeometry;
    nSnout: THREE.BoxGeometry;
    nEar: THREE.ConeGeometry;
    nEye: THREE.SphereGeometry;
    bStem: THREE.CylinderGeometry;
    bBulge: THREE.SphereGeometry;
    bNeck: THREE.CylinderGeometry;
    bTip: THREE.SphereGeometry;
    bFinial: THREE.ConeGeometry;
    qStem: THREE.CylinderGeometry;
    qWaist: THREE.CylinderGeometry;
    qCrown: THREE.SphereGeometry;
    qPt: THREE.ConeGeometry;
    qOrb: THREE.SphereGeometry;
    kStem: THREE.CylinderGeometry;
    kWaist: THREE.CylinderGeometry;
    kHead: THREE.SphereGeometry;
    kCrossV: THREE.BoxGeometry;
    kCrossH: THREE.BoxGeometry;
    kOrb: THREE.SphereGeometry;
  };
  pieceMat: {
    wBody: THREE.MeshStandardMaterial;
    wAccent: THREE.MeshStandardMaterial;
    wGold: THREE.MeshStandardMaterial;
    bBody: THREE.MeshStandardMaterial;
    bAccent: THREE.MeshStandardMaterial;
    bGold: THREE.MeshStandardMaterial;
    eye: THREE.MeshStandardMaterial;
  };
  woodTexture: THREE.CanvasTexture;
  lightSquareMat: THREE.MeshStandardMaterial;
  darkSquareMat: THREE.MeshStandardMaterial;
}

function createProceduralWoodTexture(baseHex: string, grainHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = grainHex;
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < 42; i++) {
    const y = (i / 42) * 256;
    ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(
      85,
      y + Math.sin(i * 0.7) * 6,
      170,
      y - Math.cos(i * 0.5) * 6,
      256,
      y + Math.sin(i) * 3
    );
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createAssetPool(maxAnisotropy: number): AssetPool {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackG = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackM = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const woodTexture = createProceduralWoodTexture('#2e1c13', '#150b06');
  woodTexture.anisotropy = maxAnisotropy;
  textures.push(woodTexture);

  const pieceGeo = {
    baseCyl: trackG(new THREE.CylinderGeometry(0.32, 0.38, 0.1, 14)),
    baseTrim: trackG(new THREE.TorusGeometry(0.34, 0.03, 6, 16)),
    pStem: trackG(new THREE.CylinderGeometry(0.14, 0.2, 0.28, 12)),
    pHead: trackG(new THREE.SphereGeometry(0.17, 10, 10)),
    rStem: trackG(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 12)),
    rNeck: trackG(new THREE.CylinderGeometry(0.19, 0.22, 0.1, 12)),
    rTop: trackG(new THREE.CylinderGeometry(0.26, 0.21, 0.12, 12)),
    rBatt: trackG(new THREE.BoxGeometry(0.1, 0.12, 0.1)),
    nStem: trackG(new THREE.CylinderGeometry(0.16, 0.22, 0.32, 10)),
    nNeck: trackG(new THREE.BoxGeometry(0.22, 0.38, 0.28)),
    nSnout: trackG(new THREE.BoxGeometry(0.16, 0.14, 0.26)),
    nEar: trackG(new THREE.ConeGeometry(0.06, 0.14, 6)),
    nEye: trackG(new THREE.SphereGeometry(0.03, 6, 6)),
    bStem: trackG(new THREE.CylinderGeometry(0.17, 0.24, 0.42, 12)),
    bBulge: trackG(new THREE.SphereGeometry(0.19, 10, 10)),
    bNeck: trackG(new THREE.CylinderGeometry(0.07, 0.14, 0.12, 10)),
    bTip: trackG(new THREE.SphereGeometry(0.09, 8, 8)),
    bFinial: trackG(new THREE.ConeGeometry(0.04, 0.1, 6)),
    qStem: trackG(new THREE.CylinderGeometry(0.19, 0.28, 0.52, 12)),
    qWaist: trackG(new THREE.CylinderGeometry(0.14, 0.19, 0.1, 12)),
    qCrown: trackG(new THREE.SphereGeometry(0.22, 12, 12)),
    qPt: trackG(new THREE.ConeGeometry(0.05, 0.14, 6)),
    qOrb: trackG(new THREE.SphereGeometry(0.07, 8, 8)),
    kStem: trackG(new THREE.CylinderGeometry(0.21, 0.3, 0.56, 12)),
    kWaist: trackG(new THREE.CylinderGeometry(0.15, 0.21, 0.1, 12)),
    kHead: trackG(new THREE.SphereGeometry(0.22, 12, 12)),
    kCrossV: trackG(new THREE.BoxGeometry(0.08, 0.3, 0.08)),
    kCrossH: trackG(new THREE.BoxGeometry(0.22, 0.08, 0.07)),
    kOrb: trackG(new THREE.SphereGeometry(0.04, 6, 6)),
  };

  const pieceMat = {
    wBody: trackM(
      new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.32, metalness: 0.08 })
    ),
    wAccent: trackM(
      new THREE.MeshStandardMaterial({ color: 0xd4c294, roughness: 0.45, metalness: 0.32 })
    ),
    wGold: trackM(
      new THREE.MeshStandardMaterial({
        color: 0xffd966,
        roughness: 0.22,
        metalness: 0.85,
        emissive: new THREE.Color(0x221100),
      })
    ),
    bBody: trackM(
      new THREE.MeshStandardMaterial({ color: 0x222328, roughness: 0.46, metalness: 0.12 })
    ),
    bAccent: trackM(
      new THREE.MeshStandardMaterial({ color: 0x484a52, roughness: 0.38, metalness: 0.38 })
    ),
    bGold: trackM(
      new THREE.MeshStandardMaterial({
        color: 0xb68d28,
        roughness: 0.25,
        metalness: 0.82,
        emissive: new THREE.Color(0x110800),
      })
    ),
    eye: trackM(new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 })),
  };

  const lightSquareMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0xf1e8d2, roughness: 0.32, metalness: 0.0 })
  );
  const darkSquareMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0x3b2314, roughness: 0.65, metalness: 0.05 })
  );

  return {
    geometries,
    materials,
    textures,
    pieceGeo,
    pieceMat,
    woodTexture,
    lightSquareMat,
    darkSquareMat,
  };
}

export function disposeAssetPool(pool: AssetPool) {
  pool.geometries.forEach((g) => g.dispose());
  pool.materials.forEach((m) => m.dispose());
  pool.textures.forEach((t) => t.dispose());
}

export function boardToWorld(r: number, c: number) {
  return {
    x: BOARD_CENTER.x + (c - 3.5) * BOARD_SCALE,
    z: BOARD_CENTER.z + (r - 3.5) * BOARD_SCALE,
  };
}

export function createPieceMeshGroup(
  type: PieceType,
  color: PieceColor,
  r: number,
  c: number,
  pool: AssetPool
): THREE.Group {
  const isWhite = color === 'w';
  const bodyMat = isWhite ? pool.pieceMat.wBody : pool.pieceMat.bBody;
  const accentMat = isWhite ? pool.pieceMat.wAccent : pool.pieceMat.bAccent;
  const goldMat = isWhite ? pool.pieceMat.wGold : pool.pieceMat.bGold;
  const g = pool.pieceGeo;

  const group = new THREE.Group();
  group.scale.set(BOARD_SCALE, BOARD_SCALE, BOARD_SCALE);

  const baseCyl = new THREE.Mesh(g.baseCyl, bodyMat);
  baseCyl.position.y = 0.05;
  baseCyl.castShadow = true;
  group.add(baseCyl);

  const baseTrim = new THREE.Mesh(g.baseTrim, accentMat);
  baseTrim.rotation.x = Math.PI / 2;
  baseTrim.position.y = 0.09;
  group.add(baseTrim);

  if (type === 'p') {
    const stem = new THREE.Mesh(g.pStem, bodyMat);
    stem.position.y = 0.24;
    stem.castShadow = true;
    group.add(stem);

    const head = new THREE.Mesh(g.pHead, bodyMat);
    head.position.y = 0.52;
    head.castShadow = true;
    group.add(head);
  } else if (type === 'r') {
    const stem = new THREE.Mesh(g.rStem, bodyMat);
    stem.position.y = 0.35;
    stem.castShadow = true;
    group.add(stem);

    const neck = new THREE.Mesh(g.rNeck, bodyMat);
    neck.position.y = 0.65;
    group.add(neck);

    const top = new THREE.Mesh(g.rTop, bodyMat);
    top.position.y = 0.76;
    group.add(top);

    for (let i = 0; i < 5; i++) {
      if (i % 2 === 0) {
        const batt = new THREE.Mesh(g.rBatt, accentMat);
        const angle = (i / 5) * Math.PI * 2;
        batt.position.set(Math.sin(angle) * 0.2, 0.9, Math.cos(angle) * 0.2);
        group.add(batt);
      }
    }
  } else if (type === 'n') {
    const stem = new THREE.Mesh(g.nStem, bodyMat);
    stem.position.y = 0.26;
    stem.castShadow = true;
    group.add(stem);

    const neck2 = new THREE.Mesh(g.nNeck, bodyMat);
    neck2.position.set(0.04, 0.6, 0);
    neck2.rotation.z = 0.18;
    neck2.castShadow = true;
    group.add(neck2);

    const snout = new THREE.Mesh(g.nSnout, bodyMat);
    snout.position.set(0.14, 0.75, 0.05);
    snout.castShadow = true;
    group.add(snout);

    const ear = new THREE.Mesh(g.nEar, bodyMat);
    ear.position.set(-0.02, 0.84, -0.04);
    ear.rotation.z = -0.2;
    group.add(ear);

    const eye = new THREE.Mesh(g.nEye, pool.pieceMat.eye);
    eye.position.set(0.14, 0.78, -0.11);
    group.add(eye);
  } else if (type === 'b') {
    const stem = new THREE.Mesh(g.bStem, bodyMat);
    stem.position.y = 0.31;
    stem.castShadow = true;
    group.add(stem);

    const bulge = new THREE.Mesh(g.bBulge, bodyMat);
    bulge.position.y = 0.64;
    bulge.castShadow = true;
    group.add(bulge);

    const neck2 = new THREE.Mesh(g.bNeck, bodyMat);
    neck2.position.y = 0.78;
    group.add(neck2);

    const tip = new THREE.Mesh(g.bTip, accentMat);
    tip.position.y = 0.88;
    group.add(tip);

    const finial = new THREE.Mesh(g.bFinial, goldMat);
    finial.position.y = 0.98;
    group.add(finial);
  } else if (type === 'q') {
    const stem = new THREE.Mesh(g.qStem, bodyMat);
    stem.position.y = 0.36;
    stem.castShadow = true;
    group.add(stem);

    const waist = new THREE.Mesh(g.qWaist, bodyMat);
    waist.position.y = 0.67;
    group.add(waist);

    const crown = new THREE.Mesh(g.qCrown, bodyMat);
    crown.scale.y = 0.75;
    crown.position.y = 0.78;
    crown.castShadow = true;
    group.add(crown);

    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const pt = new THREE.Mesh(g.qPt, goldMat);
      pt.position.set(Math.sin(angle) * 0.18, 0.95, Math.cos(angle) * 0.18);
      group.add(pt);
    }

    const orb = new THREE.Mesh(g.qOrb, goldMat);
    orb.position.y = 1.0;
    group.add(orb);
  } else if (type === 'k') {
    const stem = new THREE.Mesh(g.kStem, bodyMat);
    stem.position.y = 0.38;
    stem.castShadow = true;
    group.add(stem);

    const waist = new THREE.Mesh(g.kWaist, bodyMat);
    waist.position.y = 0.71;
    group.add(waist);

    const head2 = new THREE.Mesh(g.kHead, bodyMat);
    head2.scale.y = 0.8;
    head2.position.y = 0.82;
    head2.castShadow = true;
    group.add(head2);

    const crossV = new THREE.Mesh(g.kCrossV, goldMat);
    crossV.position.y = 1.08;
    group.add(crossV);

    const crossH = new THREE.Mesh(g.kCrossH, goldMat);
    crossH.position.y = 1.08;
    group.add(crossH);

    const crossOrb = new THREE.Mesh(g.kOrb, goldMat);
    crossOrb.position.y = 1.24;
    group.add(crossOrb);
  }

  const wp = boardToWorld(r, c);
  group.position.set(wp.x, PIECE_BASE_Y, wp.z);
  group.userData = { type, color, row: r, col: c };
  return group;
}

export function buildChairModel(pool: AssetPool): THREE.Group {
  const chair = new THREE.Group();
  const trackM = <T extends THREE.Material>(m: T) => {
    pool.materials.push(m);
    return m;
  };
  const trackG = <T extends THREE.BufferGeometry>(g: T) => {
    pool.geometries.push(g);
    return g;
  };

  const leatherMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0x1a1c26, roughness: 0.45, metalness: 0.1 })
  );
  const woodMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0x3b2313, roughness: 0.55, metalness: 0.1 })
  );
  const chromeMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0xb8bec8, roughness: 0.2, metalness: 0.88 })
  );

  const seatY = -1.62;
  const floorY = FLOOR_Y;
  const legHeight = seatY - floorY;

  const seat = new THREE.Mesh(trackG(new THREE.BoxGeometry(2.1, 0.28, 2.0)), leatherMat);
  seat.position.set(0, seatY - 0.14, 0.15);
  seat.castShadow = true;
  seat.receiveShadow = true;
  chair.add(seat);

  const seatFrame = new THREE.Mesh(trackG(new THREE.BoxGeometry(2.22, 0.16, 2.12)), woodMat);
  seatFrame.position.set(0, seatY - 0.26, 0.15);
  seatFrame.castShadow = true;
  chair.add(seatFrame);

  const postGeo = trackG(new THREE.CylinderGeometry(0.08, 0.09, 2.6, 10));
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, woodMat);
    post.position.set(side * 0.92, seatY + 1.15, -0.82);
    post.rotation.x = -0.1;
    post.castShadow = true;
    chair.add(post);
  }

  const backrest = new THREE.Mesh(trackG(new THREE.BoxGeometry(1.95, 1.9, 0.26)), leatherMat);
  backrest.position.set(0, seatY + 1.35, -0.86);
  backrest.rotation.x = -0.1;
  backrest.castShadow = true;
  chair.add(backrest);

  const topRail = new THREE.Mesh(trackG(new THREE.BoxGeometry(2.08, 0.22, 0.3)), woodMat);
  topRail.position.set(0, seatY + 2.34, -0.96);
  topRail.rotation.x = -0.1;
  topRail.castShadow = true;
  chair.add(topRail);

  const armSupportGeo = trackG(new THREE.CylinderGeometry(0.06, 0.06, 0.95, 8));
  const armPadGeo = trackG(new THREE.BoxGeometry(0.22, 0.12, 1.55));
  for (const side of [-1, 1]) {
    const armSupport = new THREE.Mesh(armSupportGeo, chromeMat);
    armSupport.position.set(side * 1.05, seatY + 0.42, 0.65);
    armSupport.castShadow = true;
    chair.add(armSupport);

    const armPad = new THREE.Mesh(armPadGeo, leatherMat);
    armPad.position.set(side * 1.05, seatY + 0.92, 0.02);
    armPad.castShadow = true;
    chair.add(armPad);
  }

  const legGeo = trackG(new THREE.CylinderGeometry(0.08, 0.065, legHeight, 10));
  const footGeo = trackG(new THREE.CylinderGeometry(0.08, 0.09, 0.08, 10));
  const legCoords = [
    [-0.92, 0.95],
    [0.92, 0.95],
    [-0.92, -0.72],
    [0.92, -0.72],
  ];
  for (const [lx, lz] of legCoords) {
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.set(lx, floorY + legHeight / 2, lz);
    leg.castShadow = true;
    chair.add(leg);

    const foot = new THREE.Mesh(footGeo, chromeMat);
    foot.position.set(lx, floorY + 0.04, lz);
    chair.add(foot);
  }

  const stretcherGeo = trackG(new THREE.BoxGeometry(1.84, 0.08, 0.08));
  const stretcherF = new THREE.Mesh(stretcherGeo, woodMat);
  stretcherF.position.set(0, floorY + 0.55, 0.95);
  chair.add(stretcherF);
  const stretcherB = new THREE.Mesh(stretcherGeo, woodMat);
  stretcherB.position.set(0, floorY + 0.55, -0.72);
  chair.add(stretcherB);

  return chair;
}

export function buildPlayerModel(isWhite: boolean, preset: GrandmasterPreset): PlayerRig {
  const root = new THREE.Group();
  const PLAYER_SCALE = 2.25;
  root.scale.set(PLAYER_SCALE, PLAYER_SCALE, PLAYER_SCALE);

  const ownedMaterials: THREE.Material[] = [];
  const ownedGeometries: THREE.BufferGeometry[] = [];
  const trackM = <T extends THREE.Material>(m: T) => {
    ownedMaterials.push(m);
    return m;
  };
  const trackG = <T extends THREE.BufferGeometry>(g: T) => {
    ownedGeometries.push(g);
    return g;
  };

  const suitColor = preset.suitColor;
  const shirtColor = preset.shirtColor;
  const tieColor = preset.tieColor;
  const skinColor = preset.skinColor;
  const hairColor = preset.hairColor;

  const suitMat = trackM(
    new THREE.MeshStandardMaterial({ color: suitColor, roughness: 0.52, metalness: 0.05 })
  );
  const shirtMat = trackM(new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.6 }));
  const tieMat = trackM(new THREE.MeshStandardMaterial({ color: tieColor, roughness: 0.45 }));
  const skinMat = trackM(new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.5 }));
  const hairMat = trackM(new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.88 }));
  const eyeMat = trackM(new THREE.MeshStandardMaterial({ color: 0x1a1a2a }));
  const eyeWhiteMat = trackM(new THREE.MeshStandardMaterial({ color: 0xffffff }));
  const browMat = trackM(new THREE.MeshStandardMaterial({ color: hairColor }));
  const lipMat = trackM(new THREE.MeshStandardMaterial({ color: 0xc07060 }));
  const mouthOpenMat = trackM(new THREE.MeshStandardMaterial({ color: 0x3b0d0d, roughness: 0.9 }));
  const shoeBlack = trackM(
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.1 })
  );
  const pantsBlack = trackM(
    new THREE.MeshStandardMaterial({ color: 0x1a1a26, roughness: 0.8 })
  );
  const goldAccent = trackM(
    new THREE.MeshStandardMaterial({ color: 0xd4a832, roughness: 0.2, metalness: 0.9 })
  );

  // Pelvis / Hips
  const hips = new THREE.Mesh(trackG(new THREE.CylinderGeometry(0.33, 0.35, 0.32, 14)), suitMat);
  hips.position.set(0, 0.68, 0);
  hips.castShadow = true;
  root.add(hips);

  // Upper Body group (pivots from waist at y=0.75 so torso/head/arms lean & thrash together naturally!)
  const upperBody = new THREE.Group();
  upperBody.position.set(0, 0.75, 0);
  root.add(upperBody);

  const torso = new THREE.Mesh(trackG(new THREE.CylinderGeometry(0.39, 0.33, 1.05, 14)), suitMat);
  torso.position.set(0, 0.50, 0.02);
  torso.rotation.x = 0.06;
  torso.castShadow = true;
  upperBody.add(torso);

  const shirt = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.3, 0.6, 0.05)), shirtMat);
  shirt.position.set(0, 0.65, 0.39);
  upperBody.add(shirt);

  const tie = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.07, 0.42, 0.04)), tieMat);
  tie.position.set(0, 0.60, 0.42);
  upperBody.add(tie);

  const tieKnot = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.1, 0.07, 0.05)), tieMat);
  tieKnot.position.set(0, 0.84, 0.41);
  upperBody.add(tieKnot);

  const lapelGeo = trackG(new THREE.BoxGeometry(0.14, 0.4, 0.04));
  const lapelL = new THREE.Mesh(lapelGeo, suitMat);
  lapelL.position.set(0.14, 0.77, 0.40);
  lapelL.rotation.z = -0.25;
  upperBody.add(lapelL);

  const lapelR = new THREE.Mesh(lapelGeo, suitMat);
  lapelR.position.set(-0.14, 0.77, 0.40);
  lapelR.rotation.z = 0.25;
  upperBody.add(lapelR);

  const btnGeo = trackG(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 8));
  for (let i = 0; i < 3; i++) {
    const btn = new THREE.Mesh(btnGeo, goldAccent);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(0, 0.43 + i * 0.14, 0.40);
    upperBody.add(btn);
  }

  const pocket = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.1, 0.07, 0.03)), shirtMat);
  pocket.position.set(0.26, 0.83, 0.39);
  upperBody.add(pocket);

  // Head
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.33, 0.06);
  upperBody.add(headGroup);

  const skull = new THREE.Mesh(trackG(new THREE.SphereGeometry(0.3, 16, 14)), skinMat);
  skull.scale.y = 1.12;
  skull.castShadow = true;
  headGroup.add(skull);

  const neck = new THREE.Mesh(trackG(new THREE.CylinderGeometry(0.1, 0.13, 0.22, 10)), skinMat);
  neck.position.y = -0.28;
  headGroup.add(neck);

  const jaw = new THREE.Mesh(trackG(new THREE.SphereGeometry(0.22, 12, 10)), skinMat);
  jaw.scale.set(0.9, 0.55, 0.85);
  jaw.position.set(0, -0.14, 0.02);
  headGroup.add(jaw);

  const cheekGeo = trackG(new THREE.SphereGeometry(0.14, 8, 8));
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(cheekGeo, skinMat);
    cheek.scale.set(0.7, 0.55, 0.6);
    cheek.position.set(side * 0.22, 0.02, 0.14);
    headGroup.add(cheek);
  }

  const socketMat = trackM(
    new THREE.MeshStandardMaterial({ color: Math.max(0, skinColor - 0x101010), roughness: 0.5 })
  );
  const irisMat = trackM(
    new THREE.MeshStandardMaterial({ color: preset.eyeColor, roughness: 0.1 })
  );
  const socketGeo = trackG(new THREE.SphereGeometry(0.08, 8, 8));
  const eyeWhiteGeo = trackG(new THREE.SphereGeometry(0.065, 8, 8));
  const irisGeo = trackG(new THREE.SphereGeometry(0.04, 8, 8));
  const pupilGeo = trackG(new THREE.SphereGeometry(0.025, 6, 6));
  const browGeo = trackG(new THREE.BoxGeometry(0.11, 0.028, 0.025));
  const lidGeo = trackG(
    new THREE.SphereGeometry(0.065, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5)
  );

  let browL!: THREE.Mesh;
  let browR!: THREE.Mesh;
  for (const side of [-1, 1]) {
    const socket = new THREE.Mesh(socketGeo, socketMat);
    socket.scale.set(1.1, 0.8, 0.7);
    socket.position.set(side * 0.11, 0.07, 0.26);
    headGroup.add(socket);

    const eyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    eyeWhite.scale.set(1.0, 0.8, 0.7);
    eyeWhite.position.set(side * 0.11, 0.07, 0.27);
    headGroup.add(eyeWhite);

    const iris = new THREE.Mesh(irisGeo, irisMat);
    iris.position.set(side * 0.11, 0.07, 0.30);
    headGroup.add(iris);

    const pupil = new THREE.Mesh(pupilGeo, eyeMat);
    pupil.position.set(side * 0.11, 0.07, 0.31);
    headGroup.add(pupil);

    const brow = new THREE.Mesh(browGeo, browMat);
    brow.position.set(side * 0.11, 0.17, 0.27);
    brow.rotation.z = -side * 0.08;
    headGroup.add(brow);
    if (side === -1) browR = brow;
    else browL = brow;

    const lid = new THREE.Mesh(lidGeo, skinMat);
    lid.position.set(side * 0.11, 0.08, 0.265);
    lid.rotation.x = Math.PI;
    headGroup.add(lid);
  }

  const noseBridge = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.07, 0.14, 0.06)), skinMat);
  noseBridge.position.set(0, 0.02, 0.30);
  headGroup.add(noseBridge);

  const nostrilGeo = trackG(new THREE.SphereGeometry(0.055, 8, 8));
  const nostrilL = new THREE.Mesh(nostrilGeo, skinMat);
  nostrilL.scale.set(0.7, 0.6, 0.8);
  nostrilL.position.set(-0.055, -0.08, 0.30);
  headGroup.add(nostrilL);

  const nostrilR = new THREE.Mesh(nostrilGeo, skinMat);
  nostrilR.scale.set(0.7, 0.6, 0.8);
  nostrilR.position.set(0.055, -0.08, 0.30);
  headGroup.add(nostrilR);

  const noseTip = new THREE.Mesh(trackG(new THREE.SphereGeometry(0.065, 10, 8)), skinMat);
  noseTip.scale.set(0.9, 0.7, 1.0);
  noseTip.position.set(0, -0.07, 0.31);
  headGroup.add(noseTip);

  const upperLip = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.14, 0.03, 0.03)), lipMat);
  upperLip.position.set(0, -0.14, 0.29);
  headGroup.add(upperLip);

  const lowerLip = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.13, 0.04, 0.035)), lipMat);
  lowerLip.position.set(0, -0.19, 0.28);
  headGroup.add(lowerLip);

  // Expressive open mouth cavity (scaled Y from 0.05 at rest up to 1.2 when laughing / yelling)
  const mouthMesh = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.13, 0.09, 0.04)), mouthOpenMat);
  mouthMesh.position.set(0, -0.165, 0.295);
  mouthMesh.scale.y = 0.08;
  headGroup.add(mouthMesh);

  const earGeo = trackG(new THREE.SphereGeometry(0.07, 8, 8));
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.scale.set(0.5, 0.75, 0.6);
    ear.position.set(side * 0.3, 0.05, 0);
    headGroup.add(ear);
  }

  // Preset-driven Hair & Glasses
  const hairCap = new THREE.Mesh(
    trackG(new THREE.SphereGeometry(0.315, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.56)),
    hairMat
  );
  hairCap.position.y = 0.04;
  headGroup.add(hairCap);

  const sideHairGeo = trackG(new THREE.BoxGeometry(0.085, 0.22, 0.24));
  const sideHairL = new THREE.Mesh(sideHairGeo, hairMat);
  sideHairL.position.set(-0.295, 0.08, -0.02);
  headGroup.add(sideHairL);
  const sideHairR = new THREE.Mesh(sideHairGeo, hairMat);
  sideHairR.position.set(0.295, 0.08, -0.02);
  headGroup.add(sideHairR);

  if (preset.hairStyle === 'fringe') {
    const fringe = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.42, 0.1, 0.1)), hairMat);
    fringe.position.set(0, 0.3, 0.26);
    headGroup.add(fringe);
  } else if (preset.hairStyle === 'spiky') {
    const spikeGeo = trackG(new THREE.ConeGeometry(0.08, 0.16, 6));
    for (let i = -2; i <= 2; i++) {
      const spike = new THREE.Mesh(spikeGeo, hairMat);
      spike.position.set(i * 0.085, 0.36 - Math.abs(i) * 0.02, 0.1 + (i % 2) * 0.04);
      spike.rotation.x = 0.28;
      spike.rotation.z = -i * 0.15;
      headGroup.add(spike);
    }
  } else if (preset.hairStyle === 'wavy') {
    const waveGeo = trackG(new THREE.SphereGeometry(0.11, 10, 8));
    for (let i = -2; i <= 2; i++) {
      const puff = new THREE.Mesh(waveGeo, hairMat);
      puff.scale.set(1.0, 0.7, 1.1);
      puff.position.set(i * 0.1, 0.31 - Math.abs(i) * 0.025, 0.12 - Math.abs(i) * 0.03);
      headGroup.add(puff);
    }
  } else if (preset.hairStyle === 'bun') {
    const bun = new THREE.Mesh(trackG(new THREE.SphereGeometry(0.14, 12, 10)), hairMat);
    bun.position.set(0, 0.12, -0.34);
    headGroup.add(bun);
  } else if (preset.hairStyle === 'cropped') {
    const topCrop = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.44, 0.07, 0.42)), hairMat);
    topCrop.position.set(0, 0.31, 0.04);
    headGroup.add(topCrop);
  }

  if (preset.hasGlasses) {
    const glassMat = trackM(
      new THREE.MeshStandardMaterial({ color: 0x221a14, roughness: 0.2, metalness: 0.8 })
    );
    const lensMat = trackM(
      new THREE.MeshStandardMaterial({
        color: 0x88aacc,
        transparent: true,
        opacity: 0.25,
        roughness: 0.1,
        side: THREE.DoubleSide,
      })
    );
    const bridge = new THREE.Mesh(
      trackG(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 6)),
      glassMat
    );
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, 0.07, 0.30);
    headGroup.add(bridge);

    const frameGeo = trackG(new THREE.TorusGeometry(0.075, 0.018, 8, 16));
    const lensGeo = trackG(new THREE.CircleGeometry(0.072, 14));
    for (const side of [-1, 1]) {
      const frame = new THREE.Mesh(frameGeo, glassMat);
      frame.position.set(side * 0.11, 0.07, 0.30);
      headGroup.add(frame);
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.set(side * 0.11, 0.07, 0.298);
      headGroup.add(lens);
    }
  }

  headGroup.rotation.x = 0.22;

  const collar = new THREE.Mesh(trackG(new THREE.CylinderGeometry(0.14, 0.14, 0.14, 12)), shirtMat);
  collar.position.set(0, 1.05, 0.04);
  upperBody.add(collar);

  const shoulderGeo = trackG(new THREE.SphereGeometry(0.19, 10, 8));
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(shoulderGeo, suitMat);
    shoulder.scale.set(0.8, 0.7, 0.9);
    shoulder.position.set(side * 0.44, 0.97, 0.04);
    shoulder.castShadow = true;
    upperBody.add(shoulder);
  }

  const UPPER_ARM_LEN = 0.84;
  const FORE_ARM_LEN = 1.23;

  const upperArmGeo = trackG(new THREE.CylinderGeometry(0.115, 0.125, UPPER_ARM_LEN, 10));
  const elbowGeo = trackG(new THREE.SphereGeometry(0.105, 8, 8));
  const foreArmGeo = trackG(new THREE.CylinderGeometry(0.095, 0.105, 1.02, 10));
  const wristGeo = trackG(new THREE.SphereGeometry(0.072, 8, 8));
  const palmGeo = trackG(new THREE.BoxGeometry(0.14, 0.125, 0.052));
  const fingerProxGeo = trackG(new THREE.CylinderGeometry(0.015, 0.0135, 0.056, 6));
  const fingerDistGeo = trackG(new THREE.CylinderGeometry(0.0125, 0.01, 0.048, 6));
  const fingerTipGeo = trackG(new THREE.SphereGeometry(0.011, 6, 6));
  const thumbProxGeo = trackG(new THREE.CylinderGeometry(0.0165, 0.0145, 0.05, 6));
  const thumbDistGeo = trackG(new THREE.CylinderGeometry(0.0135, 0.011, 0.042, 6));

  function buildArticulatedHand(wristPivot: THREE.Group, isLeftHand: boolean) {
    const wristMesh = new THREE.Mesh(wristGeo, skinMat);
    wristPivot.add(wristMesh);

    const palm = new THREE.Mesh(palmGeo, skinMat);
    palm.position.set(0, -0.075, 0);
    palm.castShadow = true;
    wristPivot.add(palm);

    // Ordered [0]=index, [1]=middle, [2]=ring, [3]=pinky
    const fingerPivots: THREE.Group[] = [];
    const xCoords = isLeftHand
      ? [0.048, 0.016, -0.016, -0.048]
      : [-0.048, -0.016, 0.016, 0.048];
    const lenScales = [0.96, 1.04, 0.96, 0.78];

    for (let f = 0; f < 4; f++) {
      const fPivot = new THREE.Group();
      fPivot.position.set(xCoords[f], -0.136, 0.004);
      wristPivot.add(fPivot);

      const prox = new THREE.Mesh(fingerProxGeo, skinMat);
      prox.scale.y = lenScales[f];
      prox.position.y = -0.028 * lenScales[f];
      fPivot.add(prox);

      const distJoint = new THREE.Group();
      distJoint.position.y = -0.056 * lenScales[f];
      distJoint.rotation.x = -0.24;
      fPivot.add(distJoint);

      const dist = new THREE.Mesh(fingerDistGeo, skinMat);
      dist.scale.y = lenScales[f];
      dist.position.y = -0.024 * lenScales[f];
      distJoint.add(dist);

      const tip = new THREE.Mesh(fingerTipGeo, skinMat);
      tip.position.y = -0.048 * lenScales[f];
      distJoint.add(tip);

      fingerPivots.push(fPivot);
    }

    const thumbPivot = new THREE.Group();
    const tSign = isLeftHand ? 1 : -1;
    thumbPivot.position.set(tSign * 0.072, -0.058, 0.018);
    thumbPivot.rotation.set(-0.22, 0, -tSign * 0.45);
    wristPivot.add(thumbPivot);

    const tProx = new THREE.Mesh(thumbProxGeo, skinMat);
    tProx.position.y = -0.025;
    thumbPivot.add(tProx);

    const tDist = new THREE.Mesh(thumbDistGeo, skinMat);
    tDist.position.set(-tSign * 0.008, -0.064, 0.008);
    tDist.rotation.x = -0.28;
    thumbPivot.add(tDist);

    return { fingerPivots, thumbPivot };
  }

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(0.52, 0.93, 0.04);
  upperBody.add(leftArmPivot);

  const lUpperArm = new THREE.Mesh(upperArmGeo, suitMat);
  lUpperArm.position.y = -UPPER_ARM_LEN / 2;
  lUpperArm.castShadow = true;
  leftArmPivot.add(lUpperArm);
  const lElbow = new THREE.Mesh(elbowGeo, suitMat);
  lElbow.position.y = -UPPER_ARM_LEN;
  leftArmPivot.add(lElbow);

  const leftForePivot = new THREE.Group();
  leftForePivot.position.y = -UPPER_ARM_LEN;
  leftArmPivot.add(leftForePivot);
  const lForeArm = new THREE.Mesh(foreArmGeo, suitMat);
  lForeArm.position.y = -0.51;
  lForeArm.castShadow = true;
  leftForePivot.add(lForeArm);

  const leftWristPivot = new THREE.Group();
  leftWristPivot.position.y = -1.04;
  leftForePivot.add(leftWristPivot);
  const { fingerPivots: lFingerPivots, thumbPivot: lThumbPivot } = buildArticulatedHand(
    leftWristPivot,
    true
  );

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(-0.52, 0.93, 0.04);
  upperBody.add(rightArmPivot);

  const rUpperArm = new THREE.Mesh(upperArmGeo, suitMat);
  rUpperArm.position.y = -UPPER_ARM_LEN / 2;
  rUpperArm.castShadow = true;
  rightArmPivot.add(rUpperArm);
  const rElbow = new THREE.Mesh(elbowGeo, suitMat);
  rElbow.position.y = -UPPER_ARM_LEN;
  rightArmPivot.add(rElbow);

  const rightForePivot = new THREE.Group();
  rightForePivot.position.y = -UPPER_ARM_LEN;
  rightArmPivot.add(rightForePivot);
  const rForeArm = new THREE.Mesh(foreArmGeo, suitMat);
  rForeArm.position.y = -0.51;
  rForeArm.castShadow = true;
  rightForePivot.add(rForeArm);

  const rightWristPivot = new THREE.Group();
  rightWristPivot.position.y = -1.04;
  rightForePivot.add(rightWristPivot);
  const { fingerPivots: rFingerPivots, thumbPivot: rThumbPivot } = buildArticulatedHand(
    rightWristPivot,
    false
  );

  // Articulated Legs (Thigh -> Knee -> Shin -> Ankle/Shoe)
  const THIGH_LEN = 0.44;
  const SHIN_LEN = 0.62;
  const hipJointGeo = trackG(new THREE.SphereGeometry(0.155, 10, 8));
  const thighGeo = trackG(new THREE.CylinderGeometry(0.15, 0.135, THIGH_LEN, 10));
  const kneeGeo = trackG(new THREE.SphereGeometry(0.13, 8, 8));
  const shinGeo = trackG(new THREE.CylinderGeometry(0.12, 0.095, SHIN_LEN, 10));
  const shoeMainGeo = trackG(new THREE.BoxGeometry(0.21, 0.10, 0.36));
  const shoeToeGeo = trackG(new THREE.SphereGeometry(0.105, 8, 6));

  let leftThighPivot!: THREE.Group;
  let rightThighPivot!: THREE.Group;
  let leftKneePivot!: THREE.Group;
  let rightKneePivot!: THREE.Group;

  for (const side of [-1, 1]) {
    const thighPivot = new THREE.Group();
    thighPivot.position.set(side * 0.22, 0.62, 0.08);
    thighPivot.rotation.x = -1.55;
    root.add(thighPivot);

    const hipJoint = new THREE.Mesh(hipJointGeo, pantsBlack);
    thighPivot.add(hipJoint);

    const thigh = new THREE.Mesh(thighGeo, pantsBlack);
    thigh.position.y = -THIGH_LEN / 2;
    thigh.castShadow = true;
    thighPivot.add(thigh);

    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -THIGH_LEN, 0);
    kneePivot.rotation.x = 1.55;
    thighPivot.add(kneePivot);

    const knee = new THREE.Mesh(kneeGeo, pantsBlack);
    knee.castShadow = true;
    kneePivot.add(knee);

    const shin = new THREE.Mesh(shinGeo, pantsBlack);
    shin.position.y = -SHIN_LEN / 2;
    shin.castShadow = true;
    kneePivot.add(shin);

    const shoeMain = new THREE.Mesh(shoeMainGeo, shoeBlack);
    shoeMain.position.set(0, -SHIN_LEN - 0.12, 0.08);
    shoeMain.castShadow = true;
    kneePivot.add(shoeMain);

    const shoeToe = new THREE.Mesh(shoeToeGeo, shoeBlack);
    shoeToe.scale.set(0.95, 0.5, 1.2);
    shoeToe.position.set(0, -SHIN_LEN - 0.11, 0.24);
    kneePivot.add(shoeToe);

    if (side === 1) {
      leftThighPivot = thighPivot;
      leftKneePivot = kneePivot;
    } else {
      rightThighPivot = thighPivot;
      rightKneePivot = kneePivot;
    }
  }

  const SEAT_WORLD_Y = -3.00;
  const baseRotationY = isWhite ? Math.PI : 0;
  root.position.set(4, SEAT_WORLD_Y, isWhite ? 8.25 : -0.25);
  root.rotation.y = baseRotationY;

  return {
    root,
    torso,
    upperBody,
    leftArmPivot,
    rightArmPivot,
    leftForePivot,
    rightForePivot,
    leftWristPivot,
    rightWristPivot,
    leftThighPivot,
    rightThighPivot,
    leftKneePivot,
    rightKneePivot,
    lFingerPivots,
    rFingerPivots,
    lThumbPivot,
    rThumbPivot,
    headGroup,
    mouthMesh,
    browL,
    browR,
    upperArmLen: UPPER_ARM_LEN,
    foreArmLen: FORE_ARM_LEN,
    thighLen: THIGH_LEN,
    shinLen: SHIN_LEN,
    seatedPosition: root.position.clone(),
    baseRotationY,
    isWhite,
    presetId: preset.id,
    dispose: () => {
      for (const g of ownedGeometries) g.dispose();
      for (const m of ownedMaterials) m.dispose();
    },
  };
}
