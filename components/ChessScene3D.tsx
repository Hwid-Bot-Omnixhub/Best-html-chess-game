'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ChessEngine,
  chooseEloMove,
  evaluateMoveQuality,
  getBestMoves,
  isFischerLosingPosition,
  QUALITY_CONFIG,
  type BestMoveSuggestion,
  type ChessMove,
  type GameOverReason,
  type MoveQuality,
  type Piece,
  type PieceColor,
} from '@/lib/chess-engine';
import { getLeaderboardSnapshot } from '@/lib/chess-leaderboard';
import { getGrandmasterById, type GrandmasterPreset } from '@/lib/chess-players';
import {
  BOARD_CENTER,
  BOARD_SCALE,
  FLOOR_Y,
  PIECE_BASE_Y,
  PIECE_GRASP_HEIGHTS,
  TABLE_TOP_Y,
  boardToWorld,
  buildChairModel,
  buildPlayerModel,
  createAssetPool,
  createPieceMeshGroup,
  disposeAssetPool,
  type AssetPool,
  type PlayerRig,
} from '@/lib/three-chess-assets';
import { createCrowdSystem } from '@/lib/three-crowd';
import { soundEngine } from '@/lib/sound-effects';

export type GameStatus = 'ready' | 'playing' | 'paused' | 'ended';
export type ExtendedEndReason = GameOverReason | 'timeout' | '';

export interface BestMoveArrowInfo {
  from: string;
  to: string;
  san: string;
  score: number;
}

export interface MatchResultInfo {
  matchId: number;
  winnerColor: PieceColor | null;
  winnerPresetId: string | null;
  loserPresetId: string | null;
  isDraw: boolean;
  reason: ExtendedEndReason;
  whitePresetId: string;
  blackPresetId: string;
}

export interface HudSnapshot {
  status: GameStatus;
  whiteTime: number;
  blackTime: number;
  activeClock: PieceColor;
  turnText: string;
  gameOverReason: ExtendedEndReason;
  outcomeTitle: string;
  outcomeDetail: string;
  isCheck: boolean;
  whiteName: string;
  blackName: string;
  whitePresetId: string;
  blackPresetId: string;
  board: (Piece | null)[][];
  history: ChessMove[];
  qualities: MoveQuality[];
  lastQuality: MoveQuality | null;
  bestMoves: BestMoveArrowInfo[];
  showBestArrows: boolean;
  lastMatchResult: MatchResultInfo | null;
}

export interface ChessSceneControls {
  startOrTogglePause: () => void;
  resetGame: () => void;
  setTimeMinutes: (minutes: number) => void;
  setWhiteElo: (elo: number) => void;
  setBlackElo: (elo: number) => void;
  setSpeed: (speed: number) => void;
  replacePlayer: (side: PieceColor, presetId: string) => void;
  toggleBestArrows: () => void;
}

interface ChessScene3DProps {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  controlsRef: React.MutableRefObject<ChessSceneControls | null>;
}

interface FlyingPieceState {
  mesh: THREE.Group;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  grounded: boolean;
  tipped: boolean;
  tipTargetX: number;
  tipTargetZ: number;
  thrown: boolean;
  throwAt: number;
}

// Pre-allocated math helpers at module scope — ZERO GC allocations in the render loop
const _ikLocalTarget = new THREE.Vector3();
const _ikToTarget = new THREE.Vector3();
const _ikDir = new THREE.Vector3();
const _ikClampedTarget = new THREE.Vector3();
const _ikPoleDir = new THREE.Vector3();
const _ikSideAxis = new THREE.Vector3();
const _ikBendDir = new THREE.Vector3();
const _ikElbowPos = new THREE.Vector3();
const _ikUpperDir = new THREE.Vector3();
const _ikForeDir = new THREE.Vector3();
const _ikDownVec = new THREE.Vector3(0, -1, 0);
const _ikQuatUpper = new THREE.Quaternion();
const _ikQuatUpperInv = new THREE.Quaternion();
const _ikQuatFore = new THREE.Quaternion();

const _headLocalLook = new THREE.Vector3();
const _handTargetVec = new THREE.Vector3();
const _handTargetVec2 = new THREE.Vector3();
const _lookTargetVec = new THREE.Vector3();
const _btnWorldVec = new THREE.Vector3();
const _handshakeTarget = new THREE.Vector3();
const _handshakePoint = new THREE.Vector3(4, 2.38, 4);
const _chinWorldVec = new THREE.Vector3();
const _thinkPoleVec = new THREE.Vector3();
const _idleTargetVec = new THREE.Vector3();
const _idlePoleVec = new THREE.Vector3();
const _crowdFocusVec = new THREE.Vector3(4, 0.6, 4);
const _wristWorldTarget = new THREE.Vector3();
const _qForeWorld = new THREE.Quaternion();
const _qHandDesired = new THREE.Quaternion();
const _qWristTarget = new THREE.Quaternion();
const _identityQuat = new THREE.Quaternion();
const _handBasis = new THREE.Matrix4();
const _hAxisX = new THREE.Vector3();
const _hAxisY = new THREE.Vector3();
const _hAxisZ = new THREE.Vector3();

const TABLE_WHITE_EDGE_Z = 7.10;
const TABLE_BLACK_EDGE_Z = 0.90;
const BODY_TABLE_CLEARANCE_Z = 0.72;
const PLAYER_SCALE = 2.25;
const ELBOW_TO_WRIST_LEN = 1.04;

const _restQuatLShoulder = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.14, 0, 0.22));
const _restQuatRShoulder = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.14, 0, -0.22));
const _restQuatFore = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.42, 0, 0));

type HandPoseMode =
  | 'rest'
  | 'pre-grab'
  | 'grab'
  | 'clock-transition'
  | 'clock-press'
  | 'chin-think'
  | 'fischer-v-pose'
  | 'finger-tap'
  | 'handshake'
  | 'fist'
  | 'point';

// Finger targets: [index, middle, ring, pinky, thumbRotX, thumbRotZSignless]
const HAND_FINGER_TARGETS: Record<HandPoseMode, [number, number, number, number, number, number]> = {
  rest: [-0.26, -0.32, -0.38, -0.44, -0.22, -0.45],
  'pre-grab': [-0.14, -0.16, -0.44, -0.56, -0.08, -0.78],
  grab: [-0.94, -0.96, -1.04, -1.10, -0.88, 0.24],
  'clock-transition': [-0.08, -0.10, -0.88, -0.98, -0.32, -0.12],
  'clock-press': [-0.05, -0.06, -1.22, -1.28, -0.44, 0.08],
  'chin-think': [-0.82, -0.92, -1.08, -1.16, -0.36, -0.12],
  'fischer-v-pose': [-0.08, -0.08, -1.34, -1.38, -0.52, 0.08],
  'finger-tap': [-0.12, -0.46, -0.78, -0.90, -0.26, -0.34],
  handshake: [-0.36, -0.42, -0.48, -0.54, -0.34, -0.16],
  fist: [-1.35, -1.38, -1.40, -1.40, -0.85, 0.22],
  point: [-0.05, -1.25, -1.32, -1.36, -0.55, 0.14],
};

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function computeHandBasisAndOffsets(
  player: PlayerRig,
  isRightArm: boolean,
  pose: HandPoseMode,
  poseBlend?: { next: HandPoseMode; t: number }
): { hasBasis: boolean; offsetY: number; offsetZ: number } {
  if (pose === 'rest' || pose === 'fist' || pose === 'point') {
    return { hasBasis: false, offsetY: 0.12 * PLAYER_SCALE, offsetZ: 0 };
  }

  const dirZ = player.isWhite ? -1 : 1;
  // Shoulder side in world X: White (rotY=PI) flips local X, Black (rotY=0) preserves local X
  const armWorldXSign = (player.isWhite ? -1 : 1) * (isRightArm ? -1 : 1);

  if (pose === 'pre-grab' || pose === 'grab') {
    // Fingers (-Y local) point downward-forward over the piece; palm (+Z) faces downward-inward
    _hAxisY.set(0, 0.78, -dirZ * 0.62).normalize();
    _hAxisZ.set(0, -0.62, -dirZ * 0.78).normalize();
    _hAxisX.crossVectors(_hAxisY, _hAxisZ).normalize();
    _hAxisZ.crossVectors(_hAxisX, _hAxisY).normalize();
    _handBasis.makeBasis(_hAxisX, _hAxisY, _hAxisZ);
    // Pinch contact point between curled fingertips and thumb sits at (0, -0.155, +0.065) in wristPivot space
    return { hasBasis: true, offsetY: 0.155 * PLAYER_SCALE, offsetZ: 0.065 * PLAYER_SCALE };
  }

  if (pose === 'chin-think') {
    // Curled fingers (-Y) point upward-forward-inward; palm/knuckles (+Z) cup against underside/front of chin
    _hAxisY.set(armWorldXSign * 0.16, -0.82, -dirZ * 0.55).normalize();
    _hAxisZ.set(0, 0.55, -dirZ * 0.82).normalize();
    _hAxisX.crossVectors(_hAxisY, _hAxisZ).normalize();
    _hAxisZ.crossVectors(_hAxisX, _hAxisY).normalize();
    _handBasis.makeBasis(_hAxisX, _hAxisY, _hAxisZ);
    return { hasBasis: true, offsetY: 0.14 * PLAYER_SCALE, offsetZ: 0.05 * PLAYER_SCALE };
  }

  if (pose === 'fischer-v-pose') {
    // Iconic Bobby Fischer V face pose: palm heel under chin, index & middle spread clearly across lower face
    _hAxisY.set(armWorldXSign * 0.14, -0.96, -dirZ * 0.25).normalize();
    _hAxisZ.set(0, 0.25, -dirZ * 0.97).normalize();
    _hAxisX.crossVectors(_hAxisY, _hAxisZ).normalize();
    _hAxisZ.crossVectors(_hAxisX, _hAxisY).normalize();
    _handBasis.makeBasis(_hAxisX, _hAxisY, _hAxisZ);
    return { hasBasis: true, offsetY: 0.085 * PLAYER_SCALE, offsetZ: 0.025 * PLAYER_SCALE };
  }

  if (pose === 'finger-tap') {
    // Palm faces downward over the table edge, fingers angled gently forward to tap wood surface
    _hAxisY.set(0, 0.28, -dirZ * 0.96).normalize();
    _hAxisZ.set(0, -0.96, -dirZ * 0.28).normalize();
    _hAxisX.crossVectors(_hAxisY, _hAxisZ).normalize();
    _hAxisZ.crossVectors(_hAxisX, _hAxisY).normalize();
    _handBasis.makeBasis(_hAxisX, _hAxisY, _hAxisZ);
    return { hasBasis: true, offsetY: 0.215 * PLAYER_SCALE, offsetZ: 0.02 * PLAYER_SCALE };
  }

  if (pose === 'handshake') {
    // Extended hand shakes vertically: fingers (-Y) point forward toward opponent, palm (+Z) faces inward
    _hAxisY.set(0, 0.16, -dirZ).normalize();
    _hAxisZ.set(-armWorldXSign, 0, 0).normalize();
    _hAxisX.crossVectors(_hAxisY, _hAxisZ).normalize();
    _hAxisZ.crossVectors(_hAxisX, _hAxisY).normalize();
    _handBasis.makeBasis(_hAxisX, _hAxisY, _hAxisZ);
    return { hasBasis: true, offsetY: 0.115 * PLAYER_SCALE, offsetZ: 0.015 * PLAYER_SCALE };
  }

  // Clock transition / clock press: palm levels downward over the brass button, extended fingers forward-down
  const nextIsClock = poseBlend?.next === 'clock-press' || poseBlend?.next === 'clock-transition';
  const lt = poseBlend ? THREE.MathUtils.clamp(poseBlend.t, 0, 1) : 0;
  const tilt = pose === 'clock-press' ? 0.54 : nextIsClock ? THREE.MathUtils.lerp(0.42, 0.54, lt) : 0.42;
  _hAxisY.set(-0.22, tilt, -dirZ * 0.82).normalize();
  _hAxisZ.set(0, -0.92, -dirZ * 0.39).normalize();
  _hAxisX.crossVectors(_hAxisY, _hAxisZ).normalize();
  _hAxisZ.crossVectors(_hAxisX, _hAxisY).normalize();
  _handBasis.makeBasis(_hAxisX, _hAxisY, _hAxisZ);
  // Extended index/middle fingertip pad sits at (0, -0.225, +0.025) in wristPivot space
  return { hasBasis: true, offsetY: 0.225 * PLAYER_SCALE, offsetZ: 0.025 * PLAYER_SCALE };
}

function applyHandArticulation(
  player: PlayerRig,
  isRightArm: boolean,
  pose: HandPoseMode,
  blend = 0.25,
  poseLerpToNext?: { next: HandPoseMode; t: number },
  precomputedHasBasis?: boolean
) {
  const isLeftHand = !isRightArm;
  const wristPivot = isRightArm ? player.rightWristPivot : player.leftWristPivot;
  const fingerPivots = isRightArm ? player.rFingerPivots : player.lFingerPivots;
  const thumbPivot = isRightArm ? player.rThumbPivot : player.lThumbPivot;
  const tSign = isLeftHand ? 1 : -1;

  const baseVals = HAND_FINGER_TARGETS[pose];
  const nextVals = poseLerpToNext ? HAND_FINGER_TARGETS[poseLerpToNext.next] : null;
  const lt = poseLerpToNext ? THREE.MathUtils.clamp(poseLerpToNext.t, 0, 1) : 0;

  for (let i = 0; i < 4; i++) {
    const tgt = nextVals ? THREE.MathUtils.lerp(baseVals[i], nextVals[i], lt) : baseVals[i];
    fingerPivots[i].rotation.x += (tgt - fingerPivots[i].rotation.x) * blend;
    // Spread index & middle fingers apart laterally for Bobby Fischer's V face pose
    let targetSpreadZ = 0;
    if (pose === 'fischer-v-pose') {
      targetSpreadZ = i === 0 ? tSign * 0.36 : i === 1 ? -tSign * 0.32 : 0;
    }
    fingerPivots[i].rotation.z += (targetSpreadZ - fingerPivots[i].rotation.z) * blend;
  }

  const tgtThumbX = nextVals ? THREE.MathUtils.lerp(baseVals[4], nextVals[4], lt) : baseVals[4];
  const tgtThumbZ =
    tSign * (nextVals ? THREE.MathUtils.lerp(baseVals[5], nextVals[5], lt) : baseVals[5]);
  thumbPivot.rotation.x += (tgtThumbX - thumbPivot.rotation.x) * blend;
  thumbPivot.rotation.z += (tgtThumbZ - thumbPivot.rotation.z) * blend;

  const hasBasis =
    precomputedHasBasis !== undefined
      ? precomputedHasBasis
      : computeHandBasisAndOffsets(player, isRightArm, pose, poseLerpToNext).hasBasis;

  if (!hasBasis) {
    wristPivot.quaternion.slerp(_identityQuat, blend);
    return;
  }

  const forePivot = isRightArm ? player.rightForePivot : player.leftForePivot;
  if (precomputedHasBasis === undefined) {
    player.root.updateMatrixWorld(true);
  }
  forePivot.getWorldQuaternion(_qForeWorld);
  _qHandDesired.setFromRotationMatrix(_handBasis);
  _qWristTarget.copy(_qForeWorld).invert().multiply(_qHandDesired);
  wristPivot.quaternion.slerp(_qWristTarget, Math.min(1, blend * 1.15));
}

function reachHandToTarget(
  player: PlayerRig,
  isRightArm: boolean,
  worldTargetPos: THREE.Vector3,
  blend = 1.0,
  pose: HandPoseMode | number = 'rest',
  poseBlend?: { next: HandPoseMode; t: number },
  poleDirOverride?: THREE.Vector3
) {
  player.root.updateMatrixWorld(true);
  const shoulderPivot = isRightArm ? player.rightArmPivot : player.leftArmPivot;
  const forePivot = isRightArm ? player.rightForePivot : player.leftForePivot;

  const resolvedPose: HandPoseMode =
    typeof pose === 'number'
      ? pose >= 0.85
        ? 'fist'
        : pose >= 0.45
          ? 'grab'
          : pose >= 0.2
            ? 'pre-grab'
            : 'rest'
      : pose;

  const { hasBasis, offsetY, offsetZ } = computeHandBasisAndOffsets(
    player,
    isRightArm,
    resolvedPose,
    poseBlend
  );

  // Compensate wrist position so the actual contact point (pinch, fingertip pad, or chin cup)
  // lands directly on worldTargetPos rather than leaving the wrist short!
  _wristWorldTarget.copy(worldTargetPos);
  if (hasBasis) {
    _wristWorldTarget.addScaledVector(_hAxisY, offsetY).addScaledVector(_hAxisZ, -offsetZ);
  }

  // Convert compensated wrist target into upperBody's local frame (where shoulderPivot lives!)
  _ikLocalTarget.copy(_wristWorldTarget);
  player.upperBody.worldToLocal(_ikLocalTarget);

  const shoulderOrigin = shoulderPivot.position;
  _ikToTarget.subVectors(_ikLocalTarget, shoulderOrigin);

  const L1 = player.upperArmLen;
  const L2 = ELBOW_TO_WRIST_LEN;
  const maxReach = (L1 + L2) * 0.992;
  const minReach = Math.abs(L1 - L2) + 0.08;
  let d = _ikToTarget.length();
  if (d < 0.0001) return;

  _ikDir.copy(_ikToTarget).divideScalar(d);
  d = THREE.MathUtils.clamp(d, minReach, maxReach);
  _ikClampedTarget.copy(shoulderOrigin).addScaledVector(_ikDir, d);

  const outSign = isRightArm ? -1 : 1;
  if (poleDirOverride) {
    _ikPoleDir.copy(poleDirOverride).normalize();
  } else {
    // Keep elbow pole outward and upward (+Y) so elbows never dip below TABLE_TOP_Y
    _ikPoleDir.set(outSign * 0.85, 0.35, -0.35).normalize();
  }

  _ikSideAxis.crossVectors(_ikDir, _ikPoleDir);
  if (_ikSideAxis.lengthSq() < 0.0001) {
    _ikSideAxis.set(0, 1, 0);
  } else {
    _ikSideAxis.normalize();
  }
  _ikBendDir.crossVectors(_ikSideAxis, _ikDir).normalize();

  const cosAlpha = THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const sinAlpha = Math.sqrt(Math.max(0, 1 - cosAlpha * cosAlpha));

  _ikElbowPos
    .copy(shoulderOrigin)
    .addScaledVector(_ikDir, L1 * cosAlpha)
    .addScaledVector(_ikBendDir, L1 * sinAlpha);

  _ikUpperDir.subVectors(_ikElbowPos, shoulderOrigin).normalize();
  _ikQuatUpper.setFromUnitVectors(_ikDownVec, _ikUpperDir);

  _ikForeDir.subVectors(_ikClampedTarget, _ikElbowPos).normalize();
  _ikQuatUpperInv.copy(_ikQuatUpper).invert();
  _ikForeDir.applyQuaternion(_ikQuatUpperInv).normalize();
  _ikQuatFore.setFromUnitVectors(_ikDownVec, _ikForeDir);

  shoulderPivot.quaternion.slerp(_ikQuatUpper, blend);
  forePivot.quaternion.slerp(_ikQuatFore, blend);

  applyHandArticulation(
    player,
    isRightArm,
    resolvedPose,
    Math.max(0.28, blend * 0.9),
    poseBlend,
    hasBasis
  );
}

function applyPlayerStance(
  player: PlayerRig,
  chair: THREE.Group,
  standAmount: number,
  stepX: number,
  stepZ: number,
  leanX: number,
  blend: number
) {
  const s = THREE.MathUtils.clamp(standAmount, 0, 1);
  const thighRotX = THREE.MathUtils.lerp(-1.55, -0.06, s);
  const kneeRotX = THREE.MathUtils.lerp(1.55, 0.08, s);

  player.leftThighPivot.rotation.x += (thighRotX - player.leftThighPivot.rotation.x) * blend;
  player.rightThighPivot.rotation.x += (thighRotX - player.rightThighPivot.rotation.x) * blend;
  player.leftKneePivot.rotation.x += (kneeRotX - player.leftKneePivot.rotation.x) * blend;
  player.rightKneePivot.rotation.x += (kneeRotX - player.rightKneePivot.rotation.x) * blend;

  const curThigh = player.leftThighPivot.rotation.x;
  const curKnee = player.leftKneePivot.rotation.x;
  const hipDrop =
    player.thighLen * Math.cos(-curThigh) + player.shinLen * Math.cos(-(curThigh + curKnee)) + 0.17;
  const desiredY = FLOOR_Y + (hipDrop - 0.62) * 2.25;

  const base = player.seatedPosition;
  // Never allow hips/thighs/torso base to step inside the solid wooden table!
  let targetWorldZ = base.z + stepZ;
  if (player.isWhite) {
    targetWorldZ = Math.max(targetWorldZ, TABLE_WHITE_EDGE_Z + BODY_TABLE_CLEARANCE_Z);
  } else {
    targetWorldZ = Math.min(targetWorldZ, TABLE_BLACK_EDGE_Z - BODY_TABLE_CLEARANCE_Z);
  }

  player.root.position.x += (base.x + stepX - player.root.position.x) * blend;
  player.root.position.z += (targetWorldZ - player.root.position.z) * blend;
  player.root.position.y += (desiredY - player.root.position.y) * blend;
  player.upperBody.rotation.x += (leanX - player.upperBody.rotation.x) * blend;

  // Slide chair slightly back as player stands so hips/legs never clip into the backrest
  const dirZ = player.isWhite ? -1 : 1;
  const desiredChairZ = base.z - dirZ * s * 1.05;
  chair.position.z += (desiredChairZ - chair.position.z) * blend;
}

function movePlayerIntoReach(
  player: PlayerRig,
  chair: THREE.Group,
  target: THREE.Vector3,
  blend = 0.22
) {
  const dirZ = player.isWhite ? -1 : 1;
  const distZFromSeat = Math.max(0, (target.z - player.seatedPosition.z) * dirZ);
  const dx = target.x - player.seatedPosition.x;

  // Stand up whenever reaching beyond the player's near ranks (~2.0 world units)
  const stand = THREE.MathUtils.clamp((distZFromSeat - 2.0) / 3.0, 0, 1);
  // Step right up to the table clearance limit (7.82 / 0.18) without clipping into table
  const stepZ = dirZ * (stand * 0.43);
  const stepX = THREE.MathUtils.clamp(dx * 0.65, -1.9, 1.9) * (0.35 + 0.65 * stand);
  const leanX = 0.14 + 0.92 * stand;

  applyPlayerStance(player, chair, stand, stepX, stepZ, leanX, blend);
}

function aimHeadAtWorld(player: PlayerRig, worldPos: THREE.Vector3, blend = 0.14) {
  player.root.updateMatrixWorld(true);
  _headLocalLook.copy(worldPos);
  player.upperBody.worldToLocal(_headLocalLook);
  const dx = _headLocalLook.x;
  const dy = _headLocalLook.y - 1.33;
  const dz = Math.max(0.25, _headLocalLook.z - 0.06);

  const targetYaw = THREE.MathUtils.clamp(Math.atan2(dx, dz) * 0.65, -0.45, 0.45);
  const targetPitch = THREE.MathUtils.clamp(-Math.atan2(dy, dz) * 0.55, 0.08, 0.52);

  player.headGroup.rotation.y += (targetYaw - player.headGroup.rotation.y) * blend;
  player.headGroup.rotation.x += (targetPitch - player.headGroup.rotation.x) * blend;
  player.headGroup.rotation.z += (0 - player.headGroup.rotation.z) * blend;
}

function smoothReturnToRest(player: PlayerRig, chair: THREE.Group, blend = 0.14) {
  applyPlayerStance(player, chair, 0, 0, 0, 0, blend);
  player.leftArmPivot.quaternion.slerp(_restQuatLShoulder, blend);
  player.leftForePivot.quaternion.slerp(_restQuatFore, blend);
  player.rightArmPivot.quaternion.slerp(_restQuatRShoulder, blend);
  player.rightForePivot.quaternion.slerp(_restQuatFore, blend);
  applyHandArticulation(player, false, 'rest', blend);
  applyHandArticulation(player, true, 'rest', blend);
  player.torso.rotation.x += (0.06 - player.torso.rotation.x) * blend;
  player.upperBody.rotation.y *= 1 - blend;
  player.upperBody.rotation.z *= 1 - blend;
  player.upperBody.position.y += (0.75 - player.upperBody.position.y) * blend;
  player.mouthMesh.scale.y += (0.08 - player.mouthMesh.scale.y) * blend;
}

function applyThinkChinPose(
  player: PlayerRig,
  useLeftArm: boolean,
  blend = 0.15,
  useFischerVPose = false
) {
  const isRightArm = !useLeftArm;
  // Rest the non-thinking arm smoothly in the lap
  if (useLeftArm) {
    player.rightArmPivot.quaternion.slerp(_restQuatRShoulder, blend);
    player.rightForePivot.quaternion.slerp(_restQuatFore, blend);
    applyHandArticulation(player, true, 'rest', blend);
  } else {
    player.leftArmPivot.quaternion.slerp(_restQuatLShoulder, blend);
    player.leftForePivot.quaternion.slerp(_restQuatFore, blend);
    applyHandArticulation(player, false, 'rest', blend);
  }

  // Compute exact world chin/face target on headGroup
  player.root.updateMatrixWorld(true);
  if (useFischerVPose) {
    _chinWorldVec.set(0, -0.19, 0.33);
  } else {
    _chinWorldVec.set(0, -0.22, 0.21);
  }
  player.headGroup.localToWorld(_chinWorldVec);

  const outSign = isRightArm ? -1 : 1;
  _thinkPoleVec.set(outSign * 0.55, -0.38, 0.74);
  reachHandToTarget(
    player,
    isRightArm,
    _chinWorldVec,
    Math.min(1, blend * 1.35),
    useFischerVPose ? 'fischer-v-pose' : 'chin-think',
    undefined,
    _thinkPoleVec
  );
}

function applyPresetIdleAnimation(
  player: PlayerRig,
  chair: THREE.Group,
  elapsed: number,
  blend = 0.12
) {
  const id = player.presetId;
  const nearEdgeZ = player.isWhite ? 6.86 : 1.14;
  // Camera-facing side arm (White's left arm & Black's right arm are both on -X world)
  const camSideIsRight = !player.isWhite;

  let leanX = 0.02;
  let upperY = 0.75 + Math.sin(elapsed * 1.5) * 0.008;
  let headPitch = 0.22 + Math.sin(elapsed * 0.9) * 0.02;
  let headYaw = Math.sin(elapsed * 0.45) * 0.04;
  let headRoll = 0;
  let browLTarget = -0.08;
  let browRTarget = 0.08;
  let activeRightArm = false;
  let activeLeftArm = false;

  if (id === 'fischer') {
    // Bobby Fischer: taps index finger rhythmically in bursts on the near mahogany table border
    leanX = 0.07;
    headPitch = 0.25 + Math.sin(elapsed * 1.2) * 0.02;
    headYaw = Math.sin(elapsed * 0.72) * 0.09;
    browLTarget = -0.04;
    browRTarget = 0.04;

    applyPlayerStance(player, chair, 0, 0, 0, leanX, blend);
    _idleTargetVec.set(2.78, TABLE_TOP_Y + 0.035, nearEdgeZ);
    const outSign = camSideIsRight ? -1 : 1;
    _idlePoleVec.set(outSign * 0.85, 0.42, -0.35);
    reachHandToTarget(
      player,
      camSideIsRight,
      _idleTargetVec,
      Math.min(1, blend * 1.6),
      'finger-tap',
      undefined,
      _idlePoleVec
    );
    // Rhythmic bursts of index-finger tapping
    const burst = Math.sin(elapsed * 1.05);
    const tapOffset = burst > -0.15 ? -Math.abs(Math.sin(elapsed * 8.4)) * 0.36 : 0;
    const fPivots = camSideIsRight ? player.rFingerPivots : player.lFingerPivots;
    fPivots[0].rotation.x += (-0.06 + tapOffset - fPivots[0].rotation.x) * Math.min(1, blend * 2.4);

    if (camSideIsRight) activeRightArm = true;
    else activeLeftArm = true;
  } else if (id === 'carlsen') {
    // Magnus Carlsen: periodically adjusts his tie knot with a relaxed confident tilt
    leanX = -0.02;
    headPitch = 0.20 + Math.sin(elapsed * 0.8) * 0.02;
    headRoll = 0.04 + Math.sin(elapsed * 0.5) * 0.025;
    applyPlayerStance(player, chair, 0, 0, 0, leanX, blend);

    const tieCycle = Math.sin(elapsed * 0.92);
    if (tieCycle > -0.1) {
      player.root.updateMatrixWorld(true);
      const nudgeX = Math.sin(elapsed * 3.4) * 0.035;
      const nudgeY = Math.sin(elapsed * 2.6) * 0.025;
      _idleTargetVec.set(0.02 + nudgeX, 0.77 + nudgeY, 0.48);
      player.upperBody.localToWorld(_idleTargetVec);
      _idlePoleVec.set(-0.75, -0.25, 0.6);
      reachHandToTarget(
        player,
        true,
        _idleTargetVec,
        Math.min(1, blend * 1.35),
        'pre-grab',
        undefined,
        _idlePoleVec
      );
      activeRightArm = true;
    }
  } else if (id === 'anand') {
    // Vishy Anand: periodically raises hand to adjust his glasses at the bridge
    leanX = 0.03;
    headPitch = 0.21 + Math.sin(elapsed * 0.7) * 0.02;
    headYaw = Math.sin(elapsed * 0.4) * 0.05;
    applyPlayerStance(player, chair, 0, 0, 0, leanX, blend);

    const glassCycle = Math.sin(elapsed * 1.02 + 0.8);
    if (glassCycle > 0.2) {
      player.root.updateMatrixWorld(true);
      const sideSign = camSideIsRight ? -1 : 1;
      _idleTargetVec.set(sideSign * 0.13, 0.075, 0.33);
      player.headGroup.localToWorld(_idleTargetVec);
      _idlePoleVec.set(-sideSign * 0.6, -0.35, 0.72);
      reachHandToTarget(
        player,
        camSideIsRight,
        _idleTargetVec,
        Math.min(1, blend * 1.4),
        'pre-grab',
        undefined,
        _idlePoleVec
      );
      if (camSideIsRight) activeRightArm = true;
      else activeLeftArm = true;
    }
  } else if (id === 'nakamura') {
    // Hikaru Nakamura: energetic blitz bounce & rapid visualization head glances
    leanX = 0.08;
    upperY = 0.75 + Math.abs(Math.sin(elapsed * 4.6)) * 0.016;
    headPitch = 0.17 + Math.sin(elapsed * 2.4) * 0.055;
    headYaw = Math.sin(elapsed * 1.65) * 0.11;
    headRoll = Math.sin(elapsed * 1.1) * 0.04;
    applyPlayerStance(player, chair, 0, 0, 0, leanX, blend);
  } else if (id === 'kasparov') {
    // Garry Kasparov: leans forward intensely with a clenched fist on the table edge & furrowed brows
    leanX = 0.12;
    headPitch = 0.25;
    headYaw = Math.sin(elapsed * 0.9) * 0.04;
    browLTarget = 0.10;
    browRTarget = -0.10;
    applyPlayerStance(player, chair, 0, 0, 0, leanX, blend);

    _idleTargetVec.set(player.isWhite ? 5.22 : 2.78, TABLE_TOP_Y + 0.14, nearEdgeZ);
    _idlePoleVec.set(-0.85, 0.35, -0.35);
    reachHandToTarget(player, true, _idleTargetVec, Math.min(1, blend * 1.4), 'fist', undefined, _idlePoleVec);
    activeRightArm = true;
  } else if (id === 'tal') {
    // Mikhail Tal: piercing forward gaze with hypnotic hovering hand gesture near chest
    leanX = 0.06;
    headPitch = 0.17;
    headYaw = Math.sin(elapsed * 0.55) * 0.06;
    headRoll = 0.065;
    applyPlayerStance(player, chair, 0, 0, 0, leanX, blend);

    if (Math.sin(elapsed * 0.85) > -0.2) {
      player.root.updateMatrixWorld(true);
      _idleTargetVec.set(0.16, 0.90 + Math.sin(elapsed * 1.9) * 0.03, 0.46);
      player.upperBody.localToWorld(_idleTargetVec);
      _idlePoleVec.set(0.7, -0.3, 0.65);
      reachHandToTarget(
        player,
        false,
        _idleTargetVec,
        Math.min(1, blend * 1.3),
        'pre-grab',
        undefined,
        _idlePoleVec
      );
      activeLeftArm = true;
    }
  } else if (id === 'polgar') {
    // Judit Polgar: upright poised stance, left hand resting near lapel with calm attentive nods
    leanX = 0.03;
    headPitch = 0.21 + Math.sin(elapsed * 1.3) * 0.025;
    headYaw = Math.sin(elapsed * 0.42) * 0.045;
    applyPlayerStance(player, chair, 0, 0, 0, leanX, blend);

    if (Math.sin(elapsed * 0.78) > -0.15) {
      player.root.updateMatrixWorld(true);
      _idleTargetVec.set(0.14, 0.76, 0.45);
      player.upperBody.localToWorld(_idleTargetVec);
      _idlePoleVec.set(0.72, -0.28, 0.62);
      reachHandToTarget(
        player,
        false,
        _idleTargetVec,
        Math.min(1, blend * 1.25),
        'pre-grab',
        undefined,
        _idlePoleVec
      );
      activeLeftArm = true;
    }
  } else {
    // Ding Liren / default: calm meditative breathing and gentle reflective head tilt
    leanX = 0.04;
    upperY = 0.75 + Math.sin(elapsed * 1.05) * 0.012;
    headPitch = 0.23 + Math.sin(elapsed * 0.65) * 0.025;
    headRoll = -0.045 + Math.sin(elapsed * 0.48) * 0.02;
    applyPlayerStance(player, chair, 0, 0, 0, leanX, blend);
  }

  if (!activeLeftArm) {
    player.leftArmPivot.quaternion.slerp(_restQuatLShoulder, blend);
    player.leftForePivot.quaternion.slerp(_restQuatFore, blend);
    applyHandArticulation(player, false, 'rest', blend);
  }
  if (!activeRightArm) {
    player.rightArmPivot.quaternion.slerp(_restQuatRShoulder, blend);
    player.rightForePivot.quaternion.slerp(_restQuatFore, blend);
    applyHandArticulation(player, true, 'rest', blend);
  }

  player.headGroup.rotation.x += (headPitch - player.headGroup.rotation.x) * blend;
  player.headGroup.rotation.y += (headYaw - player.headGroup.rotation.y) * blend;
  player.headGroup.rotation.z += (headRoll - player.headGroup.rotation.z) * blend;
  player.browL.rotation.z += (browLTarget - player.browL.rotation.z) * blend;
  player.browR.rotation.z += (browRTarget - player.browR.rotation.z) * blend;
  player.torso.rotation.x += (0.06 - player.torso.rotation.x) * blend;
  player.upperBody.rotation.y *= 1 - blend;
  player.upperBody.rotation.z *= 1 - blend;
  player.upperBody.position.y += (upperY - player.upperBody.position.y) * blend;
  player.mouthMesh.scale.y += (0.08 - player.mouthMesh.scale.y) * blend;
}

export default function ChessScene3D({ onHudUpdate, controlsRef }: ChessScene3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onHudUpdateRef = useRef(onHudUpdate);

  useEffect(() => {
    onHudUpdateRef.current = onHudUpdate;
  }, [onHudUpdate]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isMobile = window.innerWidth < 768;

    // Detect Software WebGL (SwiftShader / llvmpipe / WARP) for rendering budget scaling
    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2') || probe.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param) || '');
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0e18);
    scene.fog = new THREE.Fog(0x0d0e18, 42, 92);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      150
    );
    camera.position.set(isMobile ? -19 : -15.5, isMobile ? 15 : 12.5, isMobile ? 19.5 : 16.5);
    camera.lookAt(4.3, 1.3, 4);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.65));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.cursor = 'grab';
    container.appendChild(renderer.domElement);

    // Studio environment map for metallic reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.target.set(4.3, 1.3, 4);
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 8;
    controls.maxDistance = 52;
    controls.enablePan = false;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.9;

    // WebGL context loss safety
    let contextLost = false;
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
    };
    const handleContextRestored = () => {
      contextLost = false;
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    // ---- LIGHTING RIG (Warm Key + Cool Hemisphere Fill + Rim + Overhead) ----
    const hemiLight = new THREE.HemisphereLight(0x9fb4e8, 0x261d17, 0.85);
    scene.add(hemiLight);

    const mainLight = new THREE.DirectionalLight(0xfff5e0, 2.05);
    mainLight.position.set(12, 24, 15);
    mainLight.castShadow = !isSoftwareGl;
    mainLight.shadow.mapSize.set(isMobile ? 512 : 1024, isMobile ? 512 : 1024);
    const sd = 20;
    mainLight.shadow.camera.left = -sd;
    mainLight.shadow.camera.right = sd;
    mainLight.shadow.camera.top = sd;
    mainLight.shadow.camera.bottom = -sd;
    mainLight.shadow.camera.near = 1;
    mainLight.shadow.camera.far = 65;
    mainLight.shadow.bias = -0.0005;
    mainLight.shadow.normalBias = 0.02;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x7c96d6, 0.65);
    fillLight.position.set(-14, 12, -8);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x284cb8, 0.45);
    rimLight.position.set(0, 10, -20);
    scene.add(rimLight);

    const boardLight = new THREE.PointLight(0xfff2d6, 1.5, 24);
    boardLight.position.set(4, 11, 4);
    scene.add(boardLight);

    // ---- SHARED ASSET POOL ----
    const pool: AssetPool = createAssetPool(renderer.capabilities.getMaxAnisotropy());

    // ---- STATIC ENVIRONMENT (Floor, Rug, Tournament Table) ----
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x10121e, roughness: 0.92 });
    const groundGeo = new THREE.PlaneGeometry(80, 80);
    pool.materials.push(groundMat);
    pool.geometries.push(groundGeo);

    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = FLOOR_Y;
    ground.receiveShadow = true;
    ground.matrixAutoUpdate = false;
    ground.updateMatrix();
    scene.add(ground);

    const rugMat = new THREE.MeshStandardMaterial({ color: 0x181c30, roughness: 0.95 });
    const rugGeo = new THREE.BoxGeometry(23, 0.04, 23);
    pool.materials.push(rugMat);
    pool.geometries.push(rugGeo);

    const rug = new THREE.Mesh(rugGeo, rugMat);
    rug.position.set(5.0, FLOOR_Y + 0.02, 2.8);
    rug.receiveShadow = true;
    rug.matrixAutoUpdate = false;
    rug.updateMatrix();
    scene.add(rug);

    // ---- TOURNAMENT CROWD & RED-ROPE STANCHION BARRIERS ----
    const crowd = createCrowdSystem();
    scene.add(crowd.group);

    const tableGroup = new THREE.Group();
    scene.add(tableGroup);

    const tableWoodMat = new THREE.MeshStandardMaterial({
      color: 0x332016,
      map: pool.woodTexture,
      roughness: 0.48,
      metalness: 0.12,
    });
    const tableTrimMat = new THREE.MeshStandardMaterial({
      color: 0xb8942a,
      roughness: 0.32,
      metalness: 0.72,
    });
    pool.materials.push(tableWoodMat, tableTrimMat);

    const tableTopGeo = new THREE.BoxGeometry(10.6, 0.36, 6.2);
    const tableEdgeGeo = new THREE.BoxGeometry(10.72, 0.10, 6.32);
    const tableApronGeo = new THREE.BoxGeometry(9.2, 0.42, 5.0);
    const tableLegH = Math.abs(FLOOR_Y);
    const tableLegGeo = new THREE.BoxGeometry(0.45, tableLegH, 0.45);
    const tableFootGeo = new THREE.BoxGeometry(0.52, 0.14, 0.52);
    pool.geometries.push(tableTopGeo, tableEdgeGeo, tableApronGeo, tableLegGeo, tableFootGeo);

    const tableTop = new THREE.Mesh(tableTopGeo, tableWoodMat);
    tableTop.position.set(4.4, -0.18, 4.0);
    tableTop.receiveShadow = true;
    tableTop.castShadow = true;
    tableGroup.add(tableTop);

    const tableEdgeTrim = new THREE.Mesh(tableEdgeGeo, tableTrimMat);
    tableEdgeTrim.position.set(4.4, -0.18, 4.0);
    tableGroup.add(tableEdgeTrim);

    const tableApron = new THREE.Mesh(tableApronGeo, tableWoodMat);
    tableApron.position.set(4.4, -0.55, 4.0);
    tableApron.castShadow = true;
    tableGroup.add(tableApron);

    const tableLegPositions = [
      [-0.3, 1.35],
      [9.1, 1.35],
      [-0.3, 6.65],
      [9.1, 6.65],
    ];
    for (const [tlx, tlz] of tableLegPositions) {
      const tLeg = new THREE.Mesh(tableLegGeo, tableWoodMat);
      tLeg.position.set(tlx, FLOOR_Y + tableLegH / 2, tlz);
      tLeg.castShadow = true;
      tLeg.receiveShadow = true;
      tableGroup.add(tLeg);

      const tFoot = new THREE.Mesh(tableFootGeo, tableTrimMat);
      tFoot.position.set(tlx, FLOOR_Y + 0.07, tlz);
      tableGroup.add(tFoot);
    }

    // ---- CHESSBOARD GROUP ----
    const boardGroup = new THREE.Group();
    boardGroup.position.set(BOARD_CENTER.x, TABLE_TOP_Y, BOARD_CENTER.z);
    boardGroup.scale.set(BOARD_SCALE, BOARD_SCALE, BOARD_SCALE);
    scene.add(boardGroup);

    const boardBaseMat = new THREE.MeshStandardMaterial({
      color: 0x1a1b2e,
      roughness: 0.48,
      metalness: 0.3,
    });
    const boardBorderMat = new THREE.MeshStandardMaterial({
      color: 0xb8942a,
      roughness: 0.35,
      metalness: 0.65,
    });
    const boardBaseGeo = new THREE.BoxGeometry(9.0, 0.35, 9.0);
    const boardBorderGeo = new THREE.BoxGeometry(8.6, 0.12, 8.6);
    const sqGeo = new THREE.BoxGeometry(0.97, 0.09, 0.97);
    pool.materials.push(boardBaseMat, boardBorderMat);
    pool.geometries.push(boardBaseGeo, boardBorderGeo, sqGeo);

    const baseMesh = new THREE.Mesh(boardBaseGeo, boardBaseMat);
    baseMesh.position.set(0, 0.175, 0);
    baseMesh.receiveShadow = true;
    baseMesh.castShadow = true;
    boardGroup.add(baseMesh);

    const borderMesh = new THREE.Mesh(boardBorderGeo, boardBorderMat);
    borderMesh.position.set(0, 0.41, 0);
    boardGroup.add(borderMesh);

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const isLight = (row + col) % 2 === 0;
        const sq = new THREE.Mesh(sqGeo, isLight ? pool.lightSquareMat : pool.darkSquareMat);
        sq.position.set(col - 3.5, 0.48, row - 3.5);
        sq.receiveShadow = true;
        boardGroup.add(sq);
      }
    }

    // ---- CHESS CLOCK 3D MODEL ----
    const clockGroup = new THREE.Group();
    const CLOCK_REST_POS = new THREE.Vector3(7.85, TABLE_TOP_Y, 4.0);
    clockGroup.position.copy(CLOCK_REST_POS);
    scene.add(clockGroup);

    const clockBodyMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.4,
      metalness: 0.5,
    });
    const clockFaceMat = new THREE.MeshStandardMaterial({ color: 0x0a0a1a, roughness: 0.2 });

    function createClockDisplayCanvas() {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 144;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      pool.textures.push(tex);
      return { canvas: c, ctx: c.getContext('2d')!, tex };
    }

    const dispScreenW = createClockDisplayCanvas();
    const dispScreenB = createClockDisplayCanvas();

    const dispMatW = new THREE.MeshBasicMaterial({ map: dispScreenW.tex });
    const dispMatB = new THREE.MeshBasicMaterial({ map: dispScreenB.tex });
    const btnMat = new THREE.MeshStandardMaterial({
      color: 0xffd966,
      roughness: 0.28,
      metalness: 0.65,
      emissive: new THREE.Color(0x332200),
    });
    const pedMat = new THREE.MeshStandardMaterial({ color: 0x141524, roughness: 0.7 });
    pool.materials.push(clockBodyMat, clockFaceMat, dispMatW, dispMatB, btnMat, pedMat);

    const clockBodyGeo = new THREE.BoxGeometry(1.05, 0.62, 1.65);
    const clockFaceGeo = new THREE.BoxGeometry(0.9, 0.05, 1.5);
    const dispTopGeo = new THREE.PlaneGeometry(0.56, 0.34);
    const dispSideGeo = new THREE.PlaneGeometry(0.52, 0.26);
    const btnGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.14, 14);
    const pedGeo = new THREE.CylinderGeometry(0.52, 0.68, 0.1, 14);
    pool.geometries.push(clockBodyGeo, clockFaceGeo, dispTopGeo, dispSideGeo, btnGeo, pedGeo);

    const clockBodyMesh = new THREE.Mesh(clockBodyGeo, clockBodyMat);
    clockBodyMesh.position.y = 0.33;
    clockBodyMesh.castShadow = true;
    clockGroup.add(clockBodyMesh);

    const clockFaceMesh = new THREE.Mesh(clockFaceGeo, clockFaceMat);
    clockFaceMesh.position.set(0, 0.66, 0);
    clockGroup.add(clockFaceMesh);

    // Top digital LCD displays
    const dispW = new THREE.Mesh(dispTopGeo, dispMatW);
    dispW.position.set(-0.08, 0.692, 0.38);
    dispW.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    clockGroup.add(dispW);

    const dispB = new THREE.Mesh(dispTopGeo, dispMatB);
    dispB.position.set(-0.08, 0.692, -0.38);
    dispB.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    clockGroup.add(dispB);

    // Camera-facing side LCD displays on the -X clock face for effortless reading from low angles
    const dispSideW = new THREE.Mesh(dispSideGeo, dispMatW);
    dispSideW.position.set(-0.532, 0.36, 0.39);
    dispSideW.rotation.y = -Math.PI / 2;
    clockGroup.add(dispSideW);

    const dispSideB = new THREE.Mesh(dispSideGeo, dispMatB);
    dispSideB.position.set(-0.532, 0.36, -0.39);
    dispSideB.rotation.y = -Math.PI / 2;
    clockGroup.add(dispSideB);

    const btnW = new THREE.Mesh(btnGeo, btnMat);
    btnW.position.set(0, 0.76, 0.44);
    btnW.castShadow = true;
    clockGroup.add(btnW);

    const btnB = new THREE.Mesh(btnGeo, btnMat);
    btnB.position.set(0, 0.76, -0.44);
    btnB.castShadow = true;
    clockGroup.add(btnB);

    const pedMesh = new THREE.Mesh(pedGeo, pedMat);
    pedMesh.position.y = 0.05;
    clockGroup.add(pedMesh);

    const clockButtons = { white: btnW, black: btnB };
    const clockButtonBaseY = { white: 0.76, black: 0.76 };

    // ---- PLAYERS & CHAIRS ----
    let whitePreset: GrandmasterPreset = getGrandmasterById('fischer');
    let blackPreset: GrandmasterPreset = getGrandmasterById('carlsen');

    let whitePlayer = buildPlayerModel(true, whitePreset);
    let blackPlayer = buildPlayerModel(false, blackPreset);
    scene.add(whitePlayer.root);
    scene.add(blackPlayer.root);

    const whiteChair = buildChairModel(pool);
    const WHITE_CHAIR_POS = new THREE.Vector3(4, 0, 8.25);
    whiteChair.position.copy(WHITE_CHAIR_POS);
    whiteChair.rotation.y = Math.PI;
    scene.add(whiteChair);

    const blackChair = buildChairModel(pool);
    const BLACK_CHAIR_POS = new THREE.Vector3(4, 0, -0.25);
    blackChair.position.copy(BLACK_CHAIR_POS);
    blackChair.rotation.y = 0;
    scene.add(blackChair);

    // ---- PIECES CONTAINERS ----
    const piecesGroup = new THREE.Group();
    scene.add(piecesGroup);
    const slidePieceGroup = new THREE.Group();
    scene.add(slidePieceGroup);
    const capturedPiecesGroup = new THREE.Group();
    scene.add(capturedPiecesGroup);
    const quality3DGroup = new THREE.Group();
    scene.add(quality3DGroup);
    const bestArrowsGroup = new THREE.Group();
    scene.add(bestArrowsGroup);

    let pieceMeshes: THREE.Group[] = [];
    const pieceMap = new Map<string, THREE.Group>();
    let slidePieceMesh: THREE.Group | null = null;
    let secondarySlideMesh: THREE.Group | null = null;
    let quality3DSprite: THREE.Sprite | null = null;
    let quality3DTimer = 0;
    let showBestArrows = false;
    let bestMoves: BestMoveArrowInfo[] = [];

    // ---- MUTABLE ENGINE & ANIMATION STATE ----
    let chess = new ChessEngine();
    let status: GameStatus = 'ready';
    let gameOverReason: ExtendedEndReason = '';
    let outcomeTitle = '';
    let outcomeDetail = '';
    let baseTimeSec = 600;
    let whiteTime = 600;
    let blackTime = 600;
    let activeClock: PieceColor = 'w';
    let timerRunning = false;
    const initialLb = getLeaderboardSnapshot();
    let whiteElo = initialLb.find((e) => e.id === whitePreset.id)?.elo ?? whitePreset.elo;
    let blackElo = initialLb.find((e) => e.id === blackPreset.id)?.elo ?? blackPreset.elo;
    let gameSpeed = 1.0;
    let turnText = 'Press Start to play';

    let animState:
      | 'idle'
      | 'handshake'
      | 'white-think'
      | 'black-think'
      | 'move-sequence'
      | 'clock-press'
      | 'frustration'
      | 'checkmate-cutscene' = 'idle';
    let animTimer = 0;
    let isDeepThink = false;
    let lastWasDeepThink = false;
    let thinkingPending = false;
    let thinkTimerHandle: number | null = null;
    let lastClockDisplayKey = '';

    let moveQualities: MoveQuality[] = [];
    let lastQuality: MoveQuality | null = null;
    const fischerLosingLocked = { w: false, b: false };
    let matchCounter = 0;
    let lastMatchResult: MatchResultInfo | null = null;

    const captureTraySlots: THREE.Vector3[] = [];
    let captureAnimation: {
      mesh: THREE.Group;
      from: THREE.Vector3;
      to: THREE.Vector3;
      progress: number;
    } | null = null;

    let handshakeAnim: { elapsed: number; duration: number } | null = null;
    let frustrationAnim: {
      player: PlayerRig;
      opponent: PlayerRig;
      timer: number;
      totalDuration: number;
      sighed: boolean;
    } | null = null;
    let clockPressAnim: {
      player: PlayerRig;
      isRightArm: boolean;
      buttonKey: 'white' | 'black';
      fromWorld: THREE.Vector3;
      btnWorld: THREE.Vector3;
      progress: number;
    } | null = null;

    let moveAnim: {
      phase: 'reach-pickup' | 'move-piece' | 'release';
      progress: number;
      player: PlayerRig;
      isRightArm: boolean;
      mesh: THREE.Group;
      rookData: {
        mesh: THREE.Group;
        fromX: number;
        fromZ: number;
        toX: number;
        toZ: number;
      } | null;
      capturedMesh: THREE.Group | null;
      capKey: string;
      fromRow: number;
      fromCol: number;
      toRow: number;
      toCol: number;
      fromX: number;
      fromZ: number;
      toX: number;
      toZ: number;
      graspOffsetY: number;
      isWhite: boolean;
      madeMove: ChessMove;
      quality: MoveQuality;
      captureStarted?: boolean;
    } | null = null;

    // ---- CHECKMATE RAGE CUTSCENE STATE ----
    let cutsceneState: {
      loser: PlayerRig;
      winner: PlayerRig;
      loserChair: THREE.Group;
      winnerChair: THREE.Group;
      dirZ: number;
      elapsed: number;
      slammed: boolean;
      sweepStep: number;
      boardLaunched: boolean;
      boardLanded: boolean;
      laughCount: number;
      rageSoundCount: number;
      tableOffsetY: number;
      tableVelY: number;
      camShakeAmp: number;
      boardVel: THREE.Vector3;
      boardAngVel: THREE.Vector3;
      clockVel: THREE.Vector3;
      clockAngVel: THREE.Vector3;
      clockKnocked: boolean;
      flyingPieces: FlyingPieceState[];
    } | null = null;

    function emitHud() {
      onHudUpdateRef.current({
        status,
        whiteTime,
        blackTime,
        activeClock,
        turnText,
        gameOverReason,
        outcomeTitle,
        outcomeDetail,
        isCheck: !chess.isGameOver() && chess.inCheck(),
        whiteName: whitePreset.shortName,
        blackName: blackPreset.shortName,
        whitePresetId: whitePreset.id,
        blackPresetId: blackPreset.id,
        board: chess.board(),
        history: chess.history(),
        qualities: moveQualities.slice(),
        lastQuality,
        bestMoves: bestMoves.slice(),
        showBestArrows,
        lastMatchResult,
      });
    }

    function updateFischerLosingStatus() {
      if (
        whitePreset.id === 'fischer' &&
        !fischerLosingLocked.w &&
        isFischerLosingPosition(chess, 'w')
      ) {
        fischerLosingLocked.w = true;
      }
      if (
        blackPreset.id === 'fischer' &&
        !fischerLosingLocked.b &&
        isFischerLosingPosition(chess, 'b')
      ) {
        fischerLosingLocked.b = true;
      }
    }

    function clearBestArrows() {
      for (let i = bestArrowsGroup.children.length - 1; i >= 0; i--) {
        const child = bestArrowsGroup.children[i];
        child.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          }
        });
        bestArrowsGroup.remove(child);
      }
    }

    function add3DBestArrow(fromSq: string, toSq: string, rankIdx: number) {
      const fromCol = fromSq.charCodeAt(0) - 97;
      const fromRow = 8 - parseInt(fromSq[1], 10);
      const toCol = toSq.charCodeAt(0) - 97;
      const toRow = 8 - parseInt(toSq[1], 10);

      const fp = boardToWorld(fromRow, fromCol);
      const tp = boardToWorld(toRow, toCol);
      const dx = tp.x - fp.x;
      const dz = tp.z - fp.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.05) return;

      const startInset = 0.14 * BOARD_SCALE;
      const endInset = 0.14 * BOARD_SCALE;
      const tipY = Math.max(0.22 * BOARD_SCALE, dist - endInset);
      const headLen = Math.min(0.32 * BOARD_SCALE, (tipY - startInset) * 0.44);
      const shaftHalfW = (rankIdx === 0 ? 0.068 : 0.052) * BOARD_SCALE;
      const headHalfW = (rankIdx === 0 ? 0.18 : 0.14) * BOARD_SCALE;

      const shape = new THREE.Shape();
      shape.moveTo(-shaftHalfW, startInset);
      shape.lineTo(-shaftHalfW, tipY - headLen);
      shape.lineTo(-headHalfW, tipY - headLen);
      shape.lineTo(0, tipY);
      shape.lineTo(headHalfW, tipY - headLen);
      shape.lineTo(shaftHalfW, tipY - headLen);
      shape.lineTo(shaftHalfW, startInset);
      shape.closePath();

      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.022 * BOARD_SCALE,
        bevelEnabled: false,
      });
      const colorHex = rankIdx === 0 ? 0x22c55e : 0x38bdf8;
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: new THREE.Color(colorHex),
        emissiveIntensity: rankIdx === 0 ? 0.45 : 0.3,
        roughness: 0.35,
        metalness: 0.1,
        transparent: true,
        opacity: rankIdx === 0 ? 0.9 : 0.72,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });

      const arrowMesh = new THREE.Mesh(geo, mat);
      arrowMesh.rotation.x = -Math.PI / 2;
      arrowMesh.renderOrder = 5;

      const arrowHolder = new THREE.Group();
      arrowHolder.position.set(fp.x, TABLE_TOP_Y + 0.545 * BOARD_SCALE, fp.z);
      arrowHolder.rotation.y = Math.atan2(-dx, -dz);
      arrowHolder.add(arrowMesh);
      bestArrowsGroup.add(arrowHolder);
    }

    function refreshBestArrows(hideTemporary = false) {
      clearBestArrows();
      if (
        !showBestArrows ||
        hideTemporary ||
        chess.isGameOver() ||
        animState === 'checkmate-cutscene'
      ) {
        bestMoves = [];
        return;
      }

      const raw: BestMoveSuggestion[] = getBestMoves(chess, chess.turn(), 2);
      if (raw.length === 0) {
        bestMoves = [];
        return;
      }

      const topScore = raw[0].score;
      const filtered = raw.filter((item, idx) => idx === 0 || topScore - item.score <= 180);
      bestMoves = filtered.map((item) => ({
        from: item.move.from,
        to: item.move.to,
        san: item.move.san,
        score: item.score,
      }));

      for (let i = bestMoves.length - 1; i >= 0; i--) {
        add3DBestArrow(bestMoves[i].from, bestMoves[i].to, i);
      }
    }

    function clearQualitySprite() {
      if (quality3DSprite) {
        quality3DGroup.remove(quality3DSprite);
        quality3DSprite.material.map?.dispose();
        quality3DSprite.material.dispose();
        quality3DSprite = null;
      }
      quality3DTimer = 0;
    }

    function show3DQualityBadge(toRow: number, toCol: number, qualityKey: MoveQuality) {
      const q = QUALITY_CONFIG[qualityKey];
      if (!q) return;
      clearQualitySprite();

      const canvas = document.createElement('canvas');
      canvas.width = 192;
      canvas.height = 192;
      const ctx = canvas.getContext('2d')!;
      ctx.beginPath();
      ctx.arc(96, 96, 82, 0, Math.PI * 2);
      ctx.fillStyle = q.color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.font = 'bold 84px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(q.symbol, 96, 102);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })
      );
      const wp = boardToWorld(toRow, toCol);
      sprite.position.set(wp.x, 2.8, wp.z);
      sprite.scale.set(1.15, 1.15, 1.15);
      quality3DGroup.add(sprite);
      quality3DSprite = sprite;
      quality3DTimer = 0;
    }

    // Builds pieces cleanly using the shared geometry/material pool
    function renderPiecesFromBoard() {
      piecesGroup.clear();
      pieceMeshes = [];
      pieceMap.clear();
      const board = chess.board();
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const piece = board[r][c];
          if (piece) {
            const pg = createPieceMeshGroup(piece.type, piece.color, r, c, pool);
            piecesGroup.add(pg);
            pieceMeshes.push(pg);
            pieceMap.set(`${r},${c}`, pg);
          }
        }
      }
    }

    // Syncs piece map cleanly after a single move without rebuilding all 32 meshes!
    function syncMovedPieceToMap(
      toRow: number,
      toCol: number,
      madeMove: ChessMove,
      isWhiteMove: boolean
    ) {
      const toKey = `${toRow},${toCol}`;
      // If pawn promoted, replace only that single mesh with promoted piece mesh
      const finalType = madeMove.promotion ? madeMove.promotion : madeMove.piece;
      const existing = pieceMap.get(toKey);
      if (existing) {
        piecesGroup.remove(existing);
        pieceMeshes = pieceMeshes.filter((p) => p !== existing);
      }
      const placed = createPieceMeshGroup(finalType, madeMove.color, toRow, toCol, pool);
      piecesGroup.add(placed);
      pieceMeshes.push(placed);
      pieceMap.set(toKey, placed);

      if (madeMove.flags === 'k' || madeMove.flags === 'q') {
        const rRow = isWhiteMove ? 7 : 0;
        const rToCol = madeMove.flags === 'k' ? 5 : 3;
        const rKey = `${rRow},${rToCol}`;
        const rookMesh = createPieceMeshGroup('r', madeMove.color, rRow, rToCol, pool);
        piecesGroup.add(rookMesh);
        pieceMeshes.push(rookMesh);
        pieceMap.set(rKey, rookMesh);
      }
    }

    function resetPlayerRig(player: PlayerRig, chair: THREE.Group, chairPos: THREE.Vector3) {
      player.root.position.copy(player.seatedPosition);
      player.root.rotation.set(0, player.baseRotationY, 0);
      player.upperBody.position.set(0, 0.75, 0);
      player.upperBody.rotation.set(0, 0, 0);
      player.torso.rotation.set(0.06, 0, 0);
      player.headGroup.rotation.set(0.22, 0, 0);
      player.mouthMesh.scale.set(1, 0.08, 1);
      player.browL.rotation.z = -0.08;
      player.browR.rotation.z = 0.08;
      player.leftThighPivot.rotation.set(-1.55, 0, 0);
      player.rightThighPivot.rotation.set(-1.55, 0, 0);
      player.leftKneePivot.rotation.set(1.55, 0, 0);
      player.rightKneePivot.rotation.set(1.55, 0, 0);
      player.leftArmPivot.rotation.set(0.14, 0, 0.22);
      player.leftForePivot.rotation.set(-1.42, 0, 0);
      player.leftWristPivot.quaternion.identity();
      player.rightArmPivot.rotation.set(0.14, 0, -0.22);
      player.rightForePivot.rotation.set(-1.42, 0, 0);
      player.rightWristPivot.quaternion.identity();
      applyHandArticulation(player, false, 'rest', 1);
      applyHandArticulation(player, true, 'rest', 1);

      chair.position.copy(chairPos);
      chair.rotation.set(0, player.baseRotationY, 0);
    }

    function drawClockLcd(
      screen: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture },
      label: string,
      sec: number,
      isActive: boolean,
      accent: string
    ) {
      const { canvas, ctx, tex } = screen;
      const w = canvas.width;
      const h = canvas.height;
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      const text = `${m}:${s.toString().padStart(2, '0')}`;

      ctx.fillStyle = isActive ? '#0a1424' : '#080a12';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = isActive ? accent : 'rgba(255,255,255,0.16)';
      ctx.lineWidth = isActive ? 6 : 3;
      ctx.strokeRect(4, 4, w - 8, h - 8);

      ctx.fillStyle = isActive ? accent : 'rgba(203,213,225,0.55)';
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(label, 16, 12);

      if (isActive) {
        ctx.beginPath();
        ctx.arc(w - 24, 24, 7, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.fill();
      }

      ctx.fillStyle = isActive ? '#ffffff' : '#94a3b8';
      ctx.font = 'bold 68px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h * 0.62);
      tex.needsUpdate = true;
    }

    function refreshClockDisplayTextures(force = false) {
      const wSec = Math.max(0, Math.floor(whiteTime));
      const bSec = Math.max(0, Math.floor(blackTime));
      const key = `${wSec}:${bSec}:${activeClock}:${status}:${timerRunning ? 1 : 0}`;
      if (!force && key === lastClockDisplayKey) return;
      lastClockDisplayKey = key;

      const whiteActive = status === 'playing' && activeClock === 'w';
      const blackActive = status === 'playing' && activeClock === 'b';
      drawClockLcd(dispScreenW, 'WHITE', wSec, whiteActive, '#60a5fa');
      drawClockLcd(dispScreenB, 'BLACK', bSec, blackActive, '#fbbf24');
    }

    function resetAllState() {
      if (thinkTimerHandle !== null) {
        window.clearTimeout(thinkTimerHandle);
        thinkTimerHandle = null;
      }
      thinkingPending = false;
      chess = new ChessEngine();
      status = 'ready';
      gameOverReason = '';
      outcomeTitle = '';
      outcomeDetail = '';
      whiteTime = baseTimeSec;
      blackTime = baseTimeSec;
      activeClock = 'w';
      timerRunning = false;
      turnText = 'Press Start to play';
      soundEngine.updateCrowdAmbience(0, false);

      animState = 'idle';
      animTimer = 0;
      isDeepThink = false;
      lastWasDeepThink = false;
      handshakeAnim = null;
      moveAnim = null;
      clockPressAnim = null;
      frustrationAnim = null;
      cutsceneState = null;

      if (slidePieceMesh) {
        slidePieceGroup.remove(slidePieceMesh);
        slidePieceMesh = null;
      }
      if (secondarySlideMesh) {
        slidePieceGroup.remove(secondarySlideMesh);
        secondarySlideMesh = null;
      }
      capturedPiecesGroup.clear();
      captureTraySlots.length = 0;
      captureAnimation = null;

      moveQualities = [];
      lastQuality = null;
      lastMatchResult = null;
      fischerLosingLocked.w = false;
      fischerLosingLocked.b = false;
      clearQualitySprite();

      // Restore board, table, clock, players, and chairs
      tableGroup.position.set(0, 0, 0);
      tableGroup.rotation.set(0, 0, 0);

      boardGroup.position.set(BOARD_CENTER.x, TABLE_TOP_Y, BOARD_CENTER.z);
      boardGroup.rotation.set(0, 0, 0);
      boardGroup.scale.set(BOARD_SCALE, BOARD_SCALE, BOARD_SCALE);

      clockGroup.position.copy(CLOCK_REST_POS);
      clockGroup.rotation.set(0, 0, 0);
      clockButtons.white.position.y = clockButtonBaseY.white;
      clockButtons.black.position.y = clockButtonBaseY.black;

      resetPlayerRig(whitePlayer, whiteChair, WHITE_CHAIR_POS);
      resetPlayerRig(blackPlayer, blackChair, BLACK_CHAIR_POS);
      refreshClockDisplayTextures(true);

      renderPiecesFromBoard();
      refreshBestArrows(false);
      emitHud();
    }

    function beginHandshake() {
      handshakeAnim = { elapsed: 0, duration: 3.2 };
      whitePlayer.root.position.copy(whitePlayer.seatedPosition);
      blackPlayer.root.position.copy(blackPlayer.seatedPosition);
      animState = 'handshake';
      turnText = `${whitePreset.shortName} & ${blackPreset.shortName} shaking hands...`;
      emitHud();
    }

    function triggerCheckmateCutscene(matedColor: PieceColor) {
      const loser = matedColor === 'w' ? whitePlayer : blackPlayer;
      const winner = matedColor === 'w' ? blackPlayer : whitePlayer;
      const loserChair = matedColor === 'w' ? whiteChair : blackChair;
      const winnerChair = matedColor === 'w' ? blackChair : whiteChair;
      const dirZ = loser.isWhite ? -1 : 1;

      const winnerName = matedColor === 'w' ? blackPreset.shortName : whitePreset.shortName;
      const loserName = matedColor === 'w' ? whitePreset.shortName : blackPreset.shortName;
      const winnerPresetId = matedColor === 'w' ? blackPreset.id : whitePreset.id;
      const loserPresetId = matedColor === 'w' ? whitePreset.id : blackPreset.id;
      matchCounter += 1;
      lastMatchResult = {
        matchId: matchCounter,
        winnerColor: matedColor === 'w' ? 'b' : 'w',
        winnerPresetId,
        loserPresetId,
        isDraw: false,
        reason: 'checkmate',
        whitePresetId: whitePreset.id,
        blackPresetId: blackPreset.id,
      };
      gameOverReason = 'checkmate';
      outcomeTitle = `Checkmate · ${winnerName} Wins`;
      outcomeDetail = `${loserName} was checkmated`;
      turnText = `Checkmate! ${winnerName} wins`;
      stopTimer();
      clearBestArrows();
      bestMoves = [];
      soundEngine.playCrowdCheer(true);
      emitHud();

      // Collect all remaining board & captured pieces into physics-driven flying pieces
      const flyingPieces: FlyingPieceState[] = [];
      const allPieces = [...pieceMeshes];
      capturedPiecesGroup.children.forEach((child) => {
        if (child instanceof THREE.Group) {
          capturedPiecesGroup.remove(child);
          piecesGroup.add(child);
          allPieces.push(child);
        }
      });

      allPieces.forEach((mesh, idx) => {
        // Assign throw timing spread across 4 angry sweeps between t=1.8s and t=3.4s
        const wave = idx % 4;
        const throwAt = 1.82 + wave * 0.42 + Math.random() * 0.16;
        flyingPieces.push({
          mesh,
          vel: new THREE.Vector3(),
          angVel: new THREE.Vector3(),
          grounded: false,
          tipped: false,
          tipTargetX: (Math.random() > 0.5 ? 1 : -1) * (1.28 + Math.random() * 0.25),
          tipTargetZ: (Math.random() - 0.5) * 1.4,
          thrown: false,
          throwAt,
        });
      });

      cutsceneState = {
        loser,
        winner,
        loserChair,
        winnerChair,
        dirZ,
        elapsed: 0,
        slammed: false,
        sweepStep: 0,
        boardLaunched: false,
        boardLanded: false,
        laughCount: 0,
        rageSoundCount: 0,
        tableOffsetY: 0,
        tableVelY: 0,
        camShakeAmp: 0,
        boardVel: new THREE.Vector3(),
        boardAngVel: new THREE.Vector3(),
        clockVel: new THREE.Vector3(),
        clockAngVel: new THREE.Vector3(),
        clockKnocked: false,
        flyingPieces,
      };
      animState = 'checkmate-cutscene';
    }

    function startTimer() {
      timerRunning = true;
    }

    function stopTimer() {
      timerRunning = false;
    }

    function switchClock() {
      activeClock = activeClock === 'w' ? 'b' : 'w';
      if (!chess.isGameOver() && status === 'playing') startTimer();
      else stopTimer();
      emitHud();
    }

    function endGame(
      reasonKey: ExtendedEndReason,
      title: string,
      detail: string,
      winnerColor?: PieceColor
    ) {
      stopTimer();
      status = 'ended';
      animState = 'idle';
      gameOverReason = reasonKey;
      outcomeTitle = title;
      outcomeDetail = detail;
      turnText = title;
      matchCounter += 1;
      lastMatchResult = {
        matchId: matchCounter,
        winnerColor: winnerColor ?? null,
        winnerPresetId:
          winnerColor === 'w' ? whitePreset.id : winnerColor === 'b' ? blackPreset.id : null,
        loserPresetId:
          winnerColor === 'w' ? blackPreset.id : winnerColor === 'b' ? whitePreset.id : null,
        isDraw: !winnerColor,
        reason: reasonKey,
        whitePresetId: whitePreset.id,
        blackPresetId: blackPreset.id,
      };
      clearBestArrows();
      bestMoves = [];
      emitHud();
    }

    function resolveNonCheckmateGameOver() {
      const reason = chess.gameOverReason();
      if (reason === 'stalemate') {
        endGame('stalemate', 'Stalemate · Draw', 'Side to move has no legal moves and is not in check');
      } else if (reason === 'repetition') {
        endGame('repetition', 'Draw · Threefold Repetition', 'Identical board position occurred 3 times');
      } else if (reason === 'insufficient') {
        endGame('insufficient', 'Draw · Insufficient Material', 'Neither player has enough pieces to force mate');
      } else if (reason === 'fifty') {
        endGame('fifty', 'Draw · 50-Move Rule', '50 consecutive moves with no pawn advance or capture');
      } else if (reason === 'checkmate') {
        triggerCheckmateCutscene(chess.turn());
      } else {
        endGame('stalemate', 'Game Ended · Draw', 'No further moves available');
      }
    }

    function executeMove(move: ChessMove) {
      const fromRow = 8 - parseInt(move.from[1], 10);
      const fromCol = move.from.charCodeAt(0) - 97;
      const toRow = 8 - parseInt(move.to[1], 10);
      const toCol = move.to.charCodeAt(0) - 97;

      const madeMove = chess.move(move);
      if (!madeMove) {
        if (chess.isGameOver() || chess.moves().length === 0) {
          resolveNonCheckmateGameOver();
        } else {
          scheduleNextThink();
        }
        return;
      }

      const quality = evaluateMoveQuality(madeMove, chess);
      moveQualities.push(quality);

      const isWhiteMove = madeMove.color === 'w';
      const player = isWhiteMove ? whitePlayer : blackPlayer;
      const isRightArm = isWhiteMove;

      const fromKey = `${fromRow},${fromCol}`;
      const srcMesh = pieceMap.get(fromKey);
      if (srcMesh) {
        piecesGroup.remove(srcMesh);
        pieceMeshes = pieceMeshes.filter((p) => p !== srcMesh);
        pieceMap.delete(fromKey);
      }

      if (slidePieceMesh) slidePieceGroup.remove(slidePieceMesh);
      if (secondarySlideMesh) {
        slidePieceGroup.remove(secondarySlideMesh);
        secondarySlideMesh = null;
      }

      slidePieceMesh = createPieceMeshGroup(madeMove.piece, madeMove.color, fromRow, fromCol, pool);
      const fwp = boardToWorld(fromRow, fromCol);
      const twp = boardToWorld(toRow, toCol);
      slidePieceMesh.position.set(fwp.x, PIECE_BASE_Y, fwp.z);
      slidePieceGroup.add(slidePieceMesh);

      let rookData: {
        mesh: THREE.Group;
        fromX: number;
        fromZ: number;
        toX: number;
        toZ: number;
      } | null = null;
      if (madeMove.flags === 'k' || madeMove.flags === 'q') {
        const rRow = isWhiteMove ? 7 : 0;
        const rFromCol = madeMove.flags === 'k' ? 7 : 0;
        const rToCol = madeMove.flags === 'k' ? 5 : 3;
        const rKey = `${rRow},${rFromCol}`;
        const rMesh = pieceMap.get(rKey);
        if (rMesh) {
          piecesGroup.remove(rMesh);
          pieceMeshes = pieceMeshes.filter((p) => p !== rMesh);
          pieceMap.delete(rKey);
        }
        secondarySlideMesh = createPieceMeshGroup('r', madeMove.color, rRow, rFromCol, pool);
        const rfwp = boardToWorld(rRow, rFromCol);
        const rtwp = boardToWorld(rRow, rToCol);
        secondarySlideMesh.position.set(rfwp.x, PIECE_BASE_Y, rfwp.z);
        slidePieceGroup.add(secondarySlideMesh);
        rookData = {
          mesh: secondarySlideMesh,
          fromX: rfwp.x,
          fromZ: rfwp.z,
          toX: rtwp.x,
          toZ: rtwp.z,
        };
      }

      let captureRow = toRow;
      if (madeMove.flags.includes('e')) {
        captureRow = isWhiteMove ? toRow + 1 : toRow - 1;
      }
      const capKey = `${captureRow},${toCol}`;
      const capturedMesh = pieceMap.get(capKey) || null;
      const graspOffsetY = PIECE_GRASP_HEIGHTS[madeMove.piece] || 0.7 * BOARD_SCALE;

      moveAnim = {
        phase: 'reach-pickup',
        progress: 0,
        player,
        isRightArm,
        mesh: slidePieceMesh,
        rookData,
        capturedMesh,
        capKey,
        fromRow,
        fromCol,
        toRow,
        toCol,
        fromX: fwp.x,
        fromZ: fwp.z,
        toX: twp.x,
        toZ: twp.z,
        graspOffsetY,
        isWhite: isWhiteMove,
        madeMove,
        quality,
      };

      animState = 'move-sequence';
      turnText = `${isWhiteMove ? whitePreset.shortName : blackPreset.shortName} moving...`;
      refreshBestArrows(true);
      emitHud();
    }

    function startClockPressAnimation(fromWorld?: THREE.Vector3) {
      const isWhiteTurn = chess.turn() === 'w';
      const justMovedIsWhite = !isWhiteTurn;
      const player = justMovedIsWhite ? whitePlayer : blackPlayer;
      const isRightArm = justMovedIsWhite;
      const buttonKey: 'white' | 'black' = justMovedIsWhite ? 'white' : 'black';

      clockButtons[buttonKey].getWorldPosition(_btnWorldVec);
      const startPos = fromWorld
        ? fromWorld.clone()
        : new THREE.Vector3(BOARD_CENTER.x + 1.1, PIECE_BASE_Y + 0.65, BOARD_CENTER.z);

      clockPressAnim = {
        player,
        isRightArm,
        buttonKey,
        fromWorld: startPos,
        btnWorld: _btnWorldVec.clone(),
        progress: 0,
      };
      animState = 'clock-press';
    }

    function scheduleNextThink() {
      if (chess.isGameOver()) {
        resolveNonCheckmateGameOver();
        return;
      }
      updateFischerLosingStatus();
      const turn = chess.turn();
      animState = turn === 'w' ? 'white-think' : 'black-think';
      const pieceCount = pieceMeshes.length;
      const branching = chess.moves().length;
      const complexPosition = branching >= 24 || (pieceCount >= 20 && branching >= 18);
      const shouldDeepThink =
        !lastWasDeepThink &&
        chess.history().length >= 4 &&
        (chess.inCheck() || branching >= 28 || Math.random() < 0.24);
      isDeepThink = shouldDeepThink;
      lastWasDeepThink = shouldDeepThink;

      if (shouldDeepThink) {
        animTimer = (3.8 + Math.random() * 1.6) / gameSpeed;
        turnText = `${turn === 'w' ? whitePreset.shortName : blackPreset.shortName} thinking deeply...`;
      } else {
        animTimer = (complexPosition ? 1.8 + Math.random() * 1.3 : 0.75 + Math.random() * 0.6) / gameSpeed;
        turnText = `${turn === 'w' ? whitePreset.shortName : blackPreset.shortName}'s turn`;
      }
      refreshBestArrows(false);
      refreshClockDisplayTextures();
      emitHud();
    }

    function triggerFrustrationAnimation(player: PlayerRig) {
      const opponent = player === whitePlayer ? blackPlayer : whitePlayer;
      frustrationAnim = {
        player,
        opponent,
        timer: 0,
        totalDuration: 2.95,
        sighed: false,
      };
      animState = 'frustration';
      const blundererName = player === whitePlayer ? whitePreset.shortName : blackPreset.shortName;
      turnText = `${blundererName} realizes the blunder...`;
      emitHud();
    }

    // ---- EXPOSE CONTROLS TO REACT HUD ----
    controlsRef.current = {
      startOrTogglePause: () => {
        if (status === 'ready') {
          status = 'playing';
          beginHandshake();
          refreshClockDisplayTextures(true);
          soundEngine.updateCrowdAmbience(0.25, true);
          emitHud();
        } else if (status === 'playing') {
          status = 'paused';
          turnText = 'Paused';
          soundEngine.updateCrowdAmbience(0, false);
          refreshClockDisplayTextures(true);
          emitHud();
        } else if (status === 'paused') {
          status = 'playing';
          soundEngine.updateCrowdAmbience(0.25, true);
          refreshClockDisplayTextures(true);
          if (animState === 'handshake') {
            turnText = `${whitePreset.shortName} & ${blackPreset.shortName} shaking hands...`;
          } else if (animState === 'checkmate-cutscene') {
            turnText = outcomeTitle || 'Checkmate!';
          } else if (animState === 'white-think') {
            turnText = isDeepThink
              ? `${whitePreset.shortName} thinking deeply...`
              : `${whitePreset.shortName}'s turn`;
          } else if (animState === 'black-think') {
            turnText = isDeepThink
              ? `${blackPreset.shortName} thinking deeply...`
              : `${blackPreset.shortName}'s turn`;
          } else {
            turnText = `${activeClock === 'w' ? whitePreset.shortName : blackPreset.shortName}'s turn`;
          }
          emitHud();
        } else if (status === 'ended') {
          // Reset back to ready state without auto-starting!
          resetAllState();
        }
      },
      resetGame: () => {
        resetAllState();
      },
      setTimeMinutes: (minutes: number) => {
        baseTimeSec = minutes * 60;
        if (status === 'ready') {
          whiteTime = baseTimeSec;
          blackTime = baseTimeSec;
          refreshClockDisplayTextures(true);
          emitHud();
        }
      },
      setWhiteElo: (elo: number) => {
        whiteElo = elo;
      },
      setBlackElo: (elo: number) => {
        blackElo = elo;
      },
      setSpeed: (speed: number) => {
        gameSpeed = speed;
      },
      replacePlayer: (side: PieceColor, presetId: string) => {
        const preset = getGrandmasterById(presetId);
        const isWhite = side === 'w';
        const oldRig = isWhite ? whitePlayer : blackPlayer;
        const chair = isWhite ? whiteChair : blackChair;
        const chairPos = isWhite ? WHITE_CHAIR_POS : BLACK_CHAIR_POS;

        const newRig = buildPlayerModel(isWhite, preset);
        newRig.root.position.copy(oldRig.root.position);
        newRig.root.rotation.copy(oldRig.root.rotation);
        newRig.upperBody.position.copy(oldRig.upperBody.position);
        newRig.upperBody.rotation.copy(oldRig.upperBody.rotation);
        newRig.leftThighPivot.rotation.copy(oldRig.leftThighPivot.rotation);
        newRig.rightThighPivot.rotation.copy(oldRig.rightThighPivot.rotation);
        newRig.leftKneePivot.rotation.copy(oldRig.leftKneePivot.rotation);
        newRig.rightKneePivot.rotation.copy(oldRig.rightKneePivot.rotation);
        newRig.leftArmPivot.quaternion.copy(oldRig.leftArmPivot.quaternion);
        newRig.leftForePivot.quaternion.copy(oldRig.leftForePivot.quaternion);
        newRig.leftWristPivot.quaternion.copy(oldRig.leftWristPivot.quaternion);
        newRig.rightArmPivot.quaternion.copy(oldRig.rightArmPivot.quaternion);
        newRig.rightForePivot.quaternion.copy(oldRig.rightForePivot.quaternion);
        newRig.rightWristPivot.quaternion.copy(oldRig.rightWristPivot.quaternion);

        scene.remove(oldRig.root);
        scene.add(newRig.root);
        oldRig.dispose();

        const lbEntry = getLeaderboardSnapshot().find((e) => e.id === preset.id);
        const effectivePresetElo = lbEntry ? lbEntry.elo : preset.elo;

        if (isWhite) {
          whitePlayer = newRig;
          whitePreset = preset;
          whiteElo = effectivePresetElo;
          fischerLosingLocked.w = false;
        } else {
          blackPlayer = newRig;
          blackPreset = preset;
          blackElo = effectivePresetElo;
          fischerLosingLocked.b = false;
        }
        updateFischerLosingStatus();

        // Update any in-flight animation references so active scenes stay seamless
        if (moveAnim && moveAnim.player === oldRig) moveAnim.player = newRig;
        if (clockPressAnim && clockPressAnim.player === oldRig) clockPressAnim.player = newRig;
        if (frustrationAnim && frustrationAnim.player === oldRig) frustrationAnim.player = newRig;
        if (cutsceneState) {
          if (cutsceneState.loser === oldRig) cutsceneState.loser = newRig;
          if (cutsceneState.winner === oldRig) cutsceneState.winner = newRig;
        }
        if (status === 'ready') {
          resetPlayerRig(newRig, chair, chairPos);
        }
        if (animState === 'white-think' && isWhite) {
          turnText = `${whitePreset.shortName}'s turn`;
        } else if (animState === 'black-think' && !isWhite) {
          turnText = `${blackPreset.shortName}'s turn`;
        }
        emitHud();
      },
      toggleBestArrows: () => {
        showBestArrows = !showBestArrows;
        refreshBestArrows(animState === 'move-sequence');
        emitHud();
      },
    };

    // Initialize pieces, 3D clock LCD & HUD
    renderPiecesFromBoard();
    refreshClockDisplayTextures(true);
    emitHud();

    // ---- ANIMATION LOOP ----
    const clock = new THREE.Clock();
    let frameId = 0;
    let clockHudAccum = 0;
    let crowdElapsed = 0;
    let crowdExcitement = 0.14;
    let crowdAudioAccum = 0;
    let disposed = false;

    const triggerCrowdShutter = () => {
      if (status === 'playing') {
        soundEngine.playCameraShutter();
      }
    };

    function updateCheckmateCutscene(dt: number) {
      if (!cutsceneState) return;
      const cs = cutsceneState;
      const scaledDt = dt * Math.min(gameSpeed, 1.8);
      cs.elapsed += scaledDt;
      const t = cs.elapsed;

      // Damped table spring & camera impact shake
      if (cs.tableOffsetY !== 0 || cs.tableVelY !== 0) {
        const force = -160 * cs.tableOffsetY - 14 * cs.tableVelY;
        cs.tableVelY += force * dt;
        cs.tableOffsetY += cs.tableVelY * dt;
        if (Math.abs(cs.tableOffsetY) < 0.001 && Math.abs(cs.tableVelY) < 0.01) {
          cs.tableOffsetY = 0;
          cs.tableVelY = 0;
        }
        tableGroup.position.y = cs.tableOffsetY;
      }
      if (cs.camShakeAmp > 0.002) {
        camera.position.x += (Math.random() - 0.5) * cs.camShakeAmp;
        camera.position.y += (Math.random() - 0.5) * cs.camShakeAmp * 0.7;
        cs.camShakeAmp *= Math.exp(-8 * dt);
      }

      // ---- LOSER ANIMATION PHASES ----
      const l = cs.loser;
      const w = cs.winner;
      const dZ = cs.dirZ;

      if (t < 0.65) {
        // Phase 1: Realization & Shock (brace to stand up)
        const p = t / 0.65;
        applyPlayerStance(l, cs.loserChair, p * 0.25, 0, -dZ * 0.08 * p, 0.22 * p, 0.28);
        l.headGroup.rotation.x = THREE.MathUtils.lerp(0.22, 0.45, p);
        l.browL.rotation.z = THREE.MathUtils.lerp(-0.08, 0.26, p);
        l.browR.rotation.z = THREE.MathUtils.lerp(0.08, -0.26, p);
        l.mouthMesh.scale.y = 0.08 + 0.45 * p;
        _handTargetVec.set(4 + (l.isWhite ? 1.5 : -1.5), 1.6, 4 - dZ * 2.2);
        reachHandToTarget(l, true, _handTargetVec, 0.35, 0.4);
        _handTargetVec2.set(4 - (l.isWhite ? 1.5 : -1.5), 1.6, 4 - dZ * 2.2);
        reachHandToTarget(l, false, _handTargetVec2, 0.35, 0.4);
      } else if (t < 1.75) {
        // Phase 2: Stand up onto straight legs, raise both fists high & SLAM THE TABLE HARD!
        if (t < 0.96) {
          const p = (t - 0.65) / 0.31;
          applyPlayerStance(l, cs.loserChair, 0.25 + 0.75 * p, 0, dZ * 0.4 * p, -0.14 * p, 0.38);
          _handTargetVec.set(2.3, 2.8 + 0.6 * p, 4 - dZ * 2.75);
          _handTargetVec2.set(5.7, 2.8 + 0.6 * p, 4 - dZ * 2.75);
          reachHandToTarget(l, l.isWhite ? false : true, _handTargetVec, 0.55, 1.0);
          reachHandToTarget(l, l.isWhite ? true : false, _handTargetVec2, 0.55, 1.0);
          l.mouthMesh.scale.y = 0.9;
        } else if (t < 1.16) {
          const p = (t - 0.96) / 0.2;
          applyPlayerStance(l, cs.loserChair, 1.0, 0, dZ * 0.45, THREE.MathUtils.lerp(-0.14, 0.42, p), 0.45);
          const fistY = THREE.MathUtils.lerp(3.2, TABLE_TOP_Y + 0.14, p * p);
          _handTargetVec.set(2.2, fistY, 4 - dZ * 2.85);
          _handTargetVec2.set(5.8, fistY, 4 - dZ * 2.85);
          reachHandToTarget(l, l.isWhite ? false : true, _handTargetVec, 0.8, 1.0);
          reachHandToTarget(l, l.isWhite ? true : false, _handTargetVec2, 0.8, 1.0);
        } else {
          // Impact trigger at t >= 1.12
          if (!cs.slammed) {
            cs.slammed = true;
            cs.tableVelY = -0.45;
            cs.camShakeAmp = 0.26;
            soundEngine.playTableSlam();
            soundEngine.playPieceClatter(5);
            soundEngine.playRageGrunt();
            // Tip over all pieces on the board!
            for (const fp of cs.flyingPieces) {
              fp.tipped = true;
              fp.vel.set((Math.random() - 0.5) * 1.1, 1.3 + Math.random() * 1.4, (Math.random() - 0.5) * 1.1);
            }
          }
          // Hold standing lean & fists slammed on table while glaring
          applyPlayerStance(l, cs.loserChair, 1.0, 0, dZ * 0.45, 0.42, 0.35);
          _handTargetVec.set(2.2, TABLE_TOP_Y + 0.14, 4 - dZ * 2.85);
          _handTargetVec2.set(5.8, TABLE_TOP_Y + 0.14, 4 - dZ * 2.85);
          reachHandToTarget(l, l.isWhite ? false : true, _handTargetVec, 0.7, 1.0);
          reachHandToTarget(l, l.isWhite ? true : false, _handTargetVec2, 0.7, 1.0);
          l.headGroup.rotation.y = Math.sin((t - 1.16) * 20) * 0.14;
        }
      } else if (t < 3.75) {
        // Phase 3: Standing furiously, sweeping & throwing pieces off the board onto the floor!
        const p = (t - 1.75) / 2.0;
        applyPlayerStance(l, cs.loserChair, 1.0, 0, dZ * 1.05, 0.34, 0.22);

        const sweepWave = Math.floor(p * 4);
        if (sweepWave > cs.sweepStep) {
          cs.sweepStep = sweepWave;
          soundEngine.playPieceClatter(6);
        }

        const swing = Math.sin(p * Math.PI * 8);
        l.upperBody.rotation.y = swing * 0.35;
        l.mouthMesh.scale.y = 0.95 + Math.abs(Math.sin(t * 14)) * 0.35;
        l.headGroup.rotation.y = swing * 0.25;

        // Right arm sweeps across board
        _handTargetVec.set(4 + swing * 3.4, TABLE_TOP_Y + 0.45 + Math.abs(swing) * 0.5, 4 + dZ * 0.2);
        reachHandToTarget(l, true, _handTargetVec, 0.55, 0.8);
        // Left arm sweeps counter-phase
        _handTargetVec2.set(4 - swing * 3.4, TABLE_TOP_Y + 0.55 + Math.abs(swing) * 0.5, 4 - dZ * 0.3);
        reachHandToTarget(l, false, _handTargetVec2, 0.55, 0.8);
      } else if (t < 5.35) {
        // Phase 4: Standing over table, grab the chessboard and FLIP IT OVER!
        if (t < 4.18) {
          // Reach down to grab both near corners of the board
          const p = (t - 3.75) / 0.43;
          applyPlayerStance(l, cs.loserChair, 1.0, 0, dZ * 1.35, THREE.MathUtils.lerp(0.34, 0.52, p), 0.28);
          l.upperBody.rotation.y *= 0.85;
          _handTargetVec.set(1.8, TABLE_TOP_Y + 0.22, 4 - dZ * 2.65);
          _handTargetVec2.set(6.2, TABLE_TOP_Y + 0.22, 4 - dZ * 2.65);
          reachHandToTarget(l, l.isWhite ? false : true, _handTargetVec, 0.7, 1.0);
          reachHandToTarget(l, l.isWhite ? true : false, _handTargetVec2, 0.7, 1.0);
        } else {
          if (!cs.boardLaunched) {
            cs.boardLaunched = true;
            cs.camShakeAmp = 0.32;
            soundEngine.playBoardFlipCrash();
            soundEngine.playRageGrunt();
            cs.boardVel.set((Math.random() - 0.5) * 2.4, 9.8, dZ * 4.4);
            cs.boardAngVel.set(dZ * 7.8, 0.9, 1.6);

            // Also knock the chess clock off the table!
            cs.clockKnocked = true;
            cs.clockVel.set(5.2, 5.8, dZ * 2.6);
            cs.clockAngVel.set(3.2, 4.5, -5.0);

            // Launch any remaining pieces
            for (const fp of cs.flyingPieces) {
              if (!fp.thrown) {
                fp.thrown = true;
                fp.grounded = false;
                fp.vel.set((Math.random() - 0.5) * 9, 5 + Math.random() * 6, dZ * (3 + Math.random() * 5));
                fp.angVel.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14);
              }
            }
          }
          // Follow-through heave arms upward while standing tall!
          const p = Math.min((t - 4.18) / 0.55, 1);
          applyPlayerStance(l, cs.loserChair, 1.0, 0, dZ * 0.95, THREE.MathUtils.lerp(0.52, -0.22, p), 0.28);
          _handTargetVec.set(2.0, 2.8 + 1.8 * p, 4 - dZ * 1.5);
          _handTargetVec2.set(6.0, 2.8 + 1.8 * p, 4 - dZ * 1.5);
          reachHandToTarget(l, l.isWhite ? false : true, _handTargetVec, 0.5, 0.4);
          reachHandToTarget(l, l.isWhite ? true : false, _handTargetVec2, 0.5, 0.4);
        }
      } else {
        // Phase 5: FULL STANDING RAGE TANTRUM! Shaking fists, stomping, thrashing head & screaming
        applyPlayerStance(
          l,
          cs.loserChair,
          1.0,
          Math.sin(t * 9) * 0.12,
          dZ * 0.45,
          0.12 + Math.sin(t * 15) * 0.12,
          0.28
        );
        l.root.position.y += Math.abs(Math.sin(t * 14)) * 0.16;
        l.upperBody.rotation.y = Math.sin(t * 11) * 0.28;
        l.upperBody.rotation.z = Math.cos(t * 13) * 0.12;
        l.headGroup.rotation.y = Math.sin(t * 18) * 0.36;
        l.headGroup.rotation.x = 0.05 + Math.sin(t * 12) * 0.14;
        l.mouthMesh.scale.y = 0.95 + Math.abs(Math.sin(t * 16)) * 0.45;

        const ragePhase = t * 14;
        _handTargetVec.set(
          l.root.position.x - 1.5 + Math.sin(ragePhase) * 0.6,
          2.9 + Math.abs(Math.cos(ragePhase)) * 1.1,
          l.root.position.z + dZ * 1.6
        );
        _handTargetVec2.set(
          l.root.position.x + 1.5 - Math.sin(ragePhase) * 0.6,
          2.9 + Math.abs(Math.sin(ragePhase)) * 1.1,
          l.root.position.z + dZ * 1.6
        );
        reachHandToTarget(l, true, _handTargetVec, 0.45, 1.0);
        reachHandToTarget(l, false, _handTargetVec2, 0.45, 1.0);

        if (t > 5.8 && cs.rageSoundCount < 2 && Math.floor((t - 5.5) / 1.4) > cs.rageSoundCount) {
          cs.rageSoundCount++;
          soundEngine.playRageGrunt();
        }
      }

      // ---- WINNER LAUGHING ANIMATION (from t = 2.0s onward!) ----
      if (t >= 2.0) {
        const laughIntensity = THREE.MathUtils.smoothstep(t, 2.0, 2.8);
        const bounce = Math.sin(t * 16);
        const chuckle = Math.abs(Math.sin(t * 13));

        // Seated leaning back in chair, head thrown back laughing, shoulders shaking
        applyPlayerStance(
          w,
          cs.winnerChair,
          0,
          0,
          0,
          -0.24 * laughIntensity + bounce * 0.045,
          0.18
        );
        w.upperBody.position.y += (0.75 + chuckle * 0.055 * laughIntensity - w.upperBody.position.y) * 0.25;
        w.headGroup.rotation.x += (-0.28 * laughIntensity + bounce * 0.12 - w.headGroup.rotation.x) * 0.2;
        w.headGroup.rotation.y += (Math.sin(t * 5) * 0.14 - w.headGroup.rotation.y) * 0.15;
        w.mouthMesh.scale.y = 0.2 + chuckle * 0.95 * laughIntensity;
        w.browL.rotation.z = -0.18;
        w.browR.rotation.z = 0.18;

        // Winner points mockingly with right arm toward the raging loser & clutches belly/knee with left!
        const pointTargetX = l.root.position.x + Math.sin(t * 14) * 0.2;
        const pointTargetY = 2.25 + bounce * 0.18;
        const pointTargetZ = THREE.MathUtils.lerp(w.root.position.z, l.root.position.z, 0.45);
        _handTargetVec.set(pointTargetX, pointTargetY, pointTargetZ);
        reachHandToTarget(w, true, _handTargetVec, 0.28, 'point');

        const bellyZ = w.root.position.z + (w.isWhite ? -1.1 : 1.1);
        _handTargetVec2.set(w.root.position.x + (w.isWhite ? -0.45 : 0.45), -0.45 + chuckle * 0.15, bellyZ);
        reachHandToTarget(w, false, _handTargetVec2, 0.24, 0.6);

        if (cs.laughCount < 3 && Math.floor((t - 2.0) / 1.9) >= cs.laughCount) {
          cs.laughCount++;
          soundEngine.playWinnerLaugh();
        }
      } else {
        smoothReturnToRest(w, cs.winnerChair, 0.12);
      }

      // ---- PIECE PHYSICS (Fall over on table slam -> Throw to ground -> Bounce & roll) ----
      for (let i = 0; i < cs.flyingPieces.length; i++) {
        const fp = cs.flyingPieces[i];
        const m = fp.mesh;

        // Launch piece into the air when its throw wave triggers
        if (!fp.thrown && t >= fp.throwAt) {
          fp.thrown = true;
          fp.grounded = false;
          const sideBias = (Math.random() - 0.5) * 11.5;
          fp.vel.set(sideBias, 4.2 + Math.random() * 5.2, dZ * (2.5 + Math.random() * 5.5));
          fp.angVel.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14);
        }

        if (fp.thrown && !fp.grounded) {
          fp.vel.y -= 19.6 * dt;
          m.position.addScaledVector(fp.vel, dt);
          m.rotation.x += fp.angVel.x * dt;
          m.rotation.y += fp.angVel.y * dt;
          m.rotation.z += fp.angVel.z * dt;

          const floorLimit = FLOOR_Y + 0.18;
          if (m.position.y <= floorLimit) {
            m.position.y = floorLimit;
            if (Math.abs(fp.vel.y) > 1.4) {
              fp.vel.y = -fp.vel.y * 0.36;
              fp.vel.x *= 0.68;
              fp.vel.z *= 0.68;
              fp.angVel.multiplyScalar(0.6);
            } else {
              fp.vel.set(0, 0, 0);
              fp.angVel.set(0, 0, 0);
              fp.grounded = true;
            }
          }
        } else if (fp.tipped && !fp.thrown) {
          // Table slam: pieces hop slightly & topple onto their sides on the board!
          if (m.position.y > PIECE_BASE_Y || fp.vel.y > 0) {
            fp.vel.y -= 16.0 * dt;
            m.position.x += fp.vel.x * dt;
            m.position.y += fp.vel.y * dt;
            m.position.z += fp.vel.z * dt;
            if (m.position.y <= PIECE_BASE_Y + 0.1) {
              m.position.y = PIECE_BASE_Y + 0.1;
              fp.vel.set(0, 0, 0);
            }
          }
          m.rotation.x += (fp.tipTargetX - m.rotation.x) * 0.22;
          m.rotation.z += (fp.tipTargetZ - m.rotation.z) * 0.22;
        }
      }

      // ---- CHESSBOARD FLIP PHYSICS ----
      if (cs.boardLaunched && !cs.boardLanded) {
        cs.boardVel.y -= 20.0 * dt;
        boardGroup.position.addScaledVector(cs.boardVel, dt);
        boardGroup.rotation.x += cs.boardAngVel.x * dt;
        boardGroup.rotation.y += cs.boardAngVel.y * dt;
        boardGroup.rotation.z += cs.boardAngVel.z * dt;

        const boardFloorY = FLOOR_Y + 0.35;
        if (boardGroup.position.y <= boardFloorY) {
          boardGroup.position.y = boardFloorY;
          if (Math.abs(cs.boardVel.y) > 2.2) {
            cs.boardVel.y = -cs.boardVel.y * 0.28;
            cs.boardVel.x *= 0.55;
            cs.boardVel.z *= 0.55;
            cs.boardAngVel.multiplyScalar(0.35);
            soundEngine.playTableSlam();
          } else {
            cs.boardLanded = true;
            // Settle upside down / crooked on floor
            boardGroup.rotation.x = Math.PI + (Math.random() - 0.5) * 0.18;
            boardGroup.rotation.z = (Math.random() - 0.5) * 0.22;
          }
        }
      }

      // ---- KNOCKED CHESS CLOCK PHYSICS ----
      if (cs.clockKnocked) {
        cs.clockVel.y -= 19.6 * dt;
        clockGroup.position.addScaledVector(cs.clockVel, dt);
        clockGroup.rotation.x += cs.clockAngVel.x * dt;
        clockGroup.rotation.y += cs.clockAngVel.y * dt;
        clockGroup.rotation.z += cs.clockAngVel.z * dt;
        if (clockGroup.position.y <= FLOOR_Y + 0.32) {
          clockGroup.position.y = FLOOR_Y + 0.32;
          if (Math.abs(cs.clockVel.y) > 1.5) {
            cs.clockVel.y = -cs.clockVel.y * 0.32;
            cs.clockVel.x *= 0.5;
            cs.clockVel.z *= 0.5;
            cs.clockAngVel.multiplyScalar(0.4);
          } else {
            cs.clockKnocked = false;
          }
        }
      }

      // Transition to 'ended' after full 8.8s spectacle (but keep winner laughing / loser slumped in post-match loop!)
      if (t >= 8.8 && status !== 'ended') {
        status = 'ended';
        emitHud();
      }
    }

    function updateLoop(dt: number) {
      if (status === 'paused') {
        // Frozen cleanly while paused! User can still orbit camera around the scene.
        return;
      }

      // Animate 3D quality badge cleanly inside the main loop (zero orphaned rAF loops)
      if (quality3DSprite) {
        quality3DTimer += dt;
        const p = Math.min(quality3DTimer / 1.5, 1);
        const scale =
          p < 0.2 ? 0.3 + (p / 0.2) * 0.95 : p < 0.8 ? 1.25 - (p - 0.2) * 0.1 : 1.19 * (1 - (p - 0.8) / 0.2);
        quality3DSprite.scale.set(Math.max(0.01, scale), Math.max(0.01, scale), 1);
        quality3DSprite.position.y = 2.8 + p * 0.65;
        quality3DSprite.material.opacity = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
        if (p >= 1) {
          clearQualitySprite();
          if (lastQuality !== null) {
            lastQuality = null;
            emitHud();
          }
        }
      }

      if (status === 'ready') {
        // Preset-specific idle animations while waiting for user to press Start
        const t = performance.now() * 0.001;
        applyPresetIdleAnimation(whitePlayer, whiteChair, t, 0.12);
        applyPresetIdleAnimation(blackPlayer, blackChair, t + 1.85, 0.12);
        crowdElapsed += dt;
        crowdExcitement = Math.max(0.12, crowdExcitement * Math.exp(-0.85 * dt));
        _crowdFocusVec.set(BOARD_CENTER.x, 0.6, BOARD_CENTER.z);
        crowd.update(dt, crowdElapsed, _crowdFocusVec, crowdExcitement);
        return;
      }

      if (animState === 'checkmate-cutscene') {
        updateCheckmateCutscene(dt);
        crowdElapsed += dt;
        crowdExcitement = 1.0;
        if (cutsceneState) {
          _crowdFocusVec.copy(cutsceneState.loser.root.position);
          _crowdFocusVec.y = 1.1;
        }
        crowd.update(dt, crowdElapsed, _crowdFocusVec, crowdExcitement, triggerCrowdShutter);
        crowdAudioAccum += dt;
        if (crowdAudioAccum >= 0.14) {
          crowdAudioAccum = 0;
          soundEngine.updateCrowdAmbience(1.0, status === 'playing');
        }
        return;
      }

      if (status === 'ended') {
        // Post-match idle (if ended by draw/time)
        const t = performance.now() * 0.001;
        applyPresetIdleAnimation(whitePlayer, whiteChair, t, 0.1);
        applyPresetIdleAnimation(blackPlayer, blackChair, t + 1.85, 0.1);
        crowdElapsed += dt;
        crowdExcitement = Math.max(0.18, crowdExcitement * Math.exp(-0.5 * dt));
        _crowdFocusVec.set(BOARD_CENTER.x, 0.6, BOARD_CENTER.z);
        crowd.update(dt, crowdElapsed, _crowdFocusVec, crowdExcitement);
        soundEngine.updateCrowdAmbience(0, false);
        return;
      }

      crowdElapsed += dt;
      crowdExcitement = Math.max(0.1, crowdExcitement * Math.exp(-0.85 * dt));
      _crowdFocusVec.set(BOARD_CENTER.x, 0.6, BOARD_CENTER.z);
      crowdAudioAccum += dt;
      if (crowdAudioAccum >= 0.14) {
        crowdAudioAccum = 0;
        soundEngine.updateCrowdAmbience(crowdExcitement, status === 'playing');
      }
      refreshClockDisplayTextures();

      // ---- PLAYING STATE ----
      if (status === 'playing' && timerRunning) {
        const clockDt = dt;
        if (activeClock === 'w') {
          whiteTime = Math.max(0, whiteTime - clockDt);
          if (whiteTime <= 0) {
            endGame('timeout', `Time Out · ${blackPreset.shortName} Wins`, `${whitePreset.shortName} ran out of time`, 'b');
            return;
          }
        } else {
          blackTime = Math.max(0, blackTime - clockDt);
          if (blackTime <= 0) {
            endGame('timeout', `Time Out · ${whitePreset.shortName} Wins`, `${blackPreset.shortName} ran out of time`, 'w');
            return;
          }
        }
        clockHudAccum += clockDt;
        if (clockHudAccum >= 0.15) {
          clockHudAccum = 0;
          emitHud();
        }
      }

      if (captureAnimation) {
        captureAnimation.progress = Math.min(1, captureAnimation.progress + dt * 1.9 * gameSpeed);
        const cp = easeInOutCubic(captureAnimation.progress);
        const arc = Math.sin(cp * Math.PI) * 0.85;
        captureAnimation.mesh.position.set(
          THREE.MathUtils.lerp(captureAnimation.from.x, captureAnimation.to.x, cp),
          THREE.MathUtils.lerp(captureAnimation.from.y, captureAnimation.to.y, cp) + arc,
          THREE.MathUtils.lerp(captureAnimation.from.z, captureAnimation.to.z, cp)
        );
        if (captureAnimation.progress >= 1) captureAnimation = null;
      }

      if (animState === 'handshake' && handshakeAnim) {
        handshakeAnim.elapsed += dt * gameSpeed;
        const t = Math.min(handshakeAnim.elapsed / handshakeAnim.duration, 1);
        const approach = THREE.MathUtils.smoothstep(t, 0.05, 0.42);
        const settle = 1 - THREE.MathUtils.smoothstep(t, 0.78, 1.0);
        const stand = approach * settle;
        const bob =
          t > 0.42 && t < 0.78 ? Math.sin(((t - 0.42) / 0.36) * Math.PI * 4) * 0.045 : 0;

        // Stand strictly behind the table edges (7.95 / 0.05) and lean forward above table
        applyPlayerStance(whitePlayer, whiteChair, stand, 0, -0.30 * stand, 0.42 * stand, 0.32);
        applyPlayerStance(blackPlayer, blackChair, stand, 0, 0.30 * stand, 0.42 * stand, 0.32);

          // Lift hands above the table & chess pieces before extending to center handshake point
        if (t < 0.24) {
          const liftP = easeInOutCubic(t / 0.24);
          _handTargetVec.set(4.55, THREE.MathUtils.lerp(1.2, 2.45, liftP), THREE.MathUtils.lerp(7.35, 5.8, liftP));
          reachHandToTarget(whitePlayer, true, _handTargetVec, 0.45, 'handshake');
          _handTargetVec2.set(3.45, THREE.MathUtils.lerp(1.2, 2.45, liftP), THREE.MathUtils.lerp(0.65, 2.2, liftP));
          reachHandToTarget(blackPlayer, true, _handTargetVec2, 0.45, 'handshake');
          aimHeadAtWorld(whitePlayer, _handshakePoint, 0.14);
          aimHeadAtWorld(blackPlayer, _handshakePoint, 0.14);
        } else if (t <= 0.80) {
          _handshakeTarget.copy(_handshakePoint);
          _handshakeTarget.y += bob;
          reachHandToTarget(whitePlayer, true, _handshakeTarget, 0.55 + approach * 0.45, 'handshake');
          reachHandToTarget(blackPlayer, true, _handshakeTarget, 0.55 + approach * 0.45, 'handshake');
          aimHeadAtWorld(whitePlayer, _handshakeTarget, 0.14);
          aimHeadAtWorld(blackPlayer, _handshakeTarget, 0.14);
          crowdExcitement = Math.max(crowdExcitement, 0.48);
        } else {
          const retP = easeInOutCubic((t - 0.80) / 0.20);
          _handTargetVec.set(4.55, THREE.MathUtils.lerp(2.4, 1.35, retP), THREE.MathUtils.lerp(5.2, 7.35, retP));
          reachHandToTarget(whitePlayer, true, _handTargetVec, 0.45, 0.0);
          _handTargetVec2.set(3.45, THREE.MathUtils.lerp(2.4, 1.35, retP), THREE.MathUtils.lerp(2.8, 0.65, retP));
          reachHandToTarget(blackPlayer, true, _handTargetVec2, 0.45, 0.0);
          _lookTargetVec.set(BOARD_CENTER.x, 0.5, BOARD_CENTER.z);
          aimHeadAtWorld(whitePlayer, _lookTargetVec, 0.14);
          aimHeadAtWorld(blackPlayer, _lookTargetVec, 0.14);
        }

        if (t >= 1) {
          handshakeAnim = null;
          applyPlayerStance(whitePlayer, whiteChair, 0, 0, 0, 0, 1);
          applyPlayerStance(blackPlayer, blackChair, 0, 0, 0, 0, 1);
          smoothReturnToRest(whitePlayer, whiteChair, 1);
          smoothReturnToRest(blackPlayer, blackChair, 1);
          startTimer();
          scheduleNextThink();
        }
        crowd.update(dt, crowdElapsed, _handshakePoint, crowdExcitement);
        return;
      }

      if (animState === 'frustration' && frustrationAnim) {
        const fa = frustrationAnim;
        fa.timer += dt * gameSpeed;
        const player = fa.player;
        const opp = fa.opponent;
        const playerChair = player === whitePlayer ? whiteChair : blackChair;
        const oppChair = opp === whitePlayer ? whiteChair : blackChair;
        const t = fa.timer;

        // Opponent stays calm in their preset idle animation
        applyPresetIdleAnimation(opp, oppChair, crowdElapsed + 1.4, 0.12);

        if (t < 0.98) {
          // 1) 1-second realization beat: arm returns cleanly to lap while staring at the blunder
          const p = easeInOutCubic(t / 0.98);
          smoothReturnToRest(player, playerChair, 0.16);
          player.headGroup.rotation.x += (0.31 - player.headGroup.rotation.x) * 0.18;
          player.browL.rotation.z += (THREE.MathUtils.lerp(0.02, 0.14, p) - player.browL.rotation.z) * 0.2;
          player.browR.rotation.z += (THREE.MathUtils.lerp(-0.02, -0.14, p) - player.browR.rotation.z) * 0.2;
        } else if (t < 2.35) {
          // 2) Frustrated sigh after realizing the blunder
          if (!fa.sighed) {
            fa.sighed = true;
            soundEngine.playFrustratedSigh();
            crowdExcitement = Math.max(crowdExcitement, 0.55);
            const blundererName = player === whitePlayer ? whitePreset.shortName : blackPreset.shortName;
            turnText = `${blundererName} sighs in frustration`;
            emitHud();
          }

          const sighP = (t - 0.98) / 1.37;
          const inhale = sighP < 0.2 ? sighP / 0.2 : 1;
          const exhale = sighP >= 0.2 ? (sighP - 0.2) / 0.8 : 0;

          smoothReturnToRest(player, playerChair, 0.14);
          const leanTarget = sighP < 0.2 ? -0.05 * inhale : THREE.MathUtils.lerp(-0.05, 0.10, exhale);
          const chestYTarget =
            sighP < 0.2 ? 0.75 + 0.018 * inhale : 0.768 - Math.sin(exhale * Math.PI * 0.72) * 0.032;

          player.upperBody.rotation.x += (leanTarget - player.upperBody.rotation.x) * 0.2;
          player.upperBody.position.y += (chestYTarget - player.upperBody.position.y) * 0.2;
          player.browL.rotation.z += (0.16 - player.browL.rotation.z) * 0.2;
          player.browR.rotation.z += (-0.16 - player.browR.rotation.z) * 0.2;
          player.mouthMesh.scale.y =
            sighP < 0.2
              ? 0.08 + 0.16 * inhale
              : 0.08 + 0.28 * Math.sin(Math.min(1, exhale * 1.1) * Math.PI);
          player.headGroup.rotation.x +=
            (0.35 + (sighP >= 0.2 ? Math.sin(exhale * Math.PI) * 0.08 : -0.03) - player.headGroup.rotation.x) * 0.2;
          player.headGroup.rotation.y +=
            ((sighP >= 0.2 ? Math.sin(exhale * Math.PI * 2.5) * 0.11 : 0) - player.headGroup.rotation.y) * 0.22;
        } else {
          // 3) Settle back into composed seated posture
          smoothReturnToRest(player, playerChair, 0.16);
          player.browL.rotation.z += (-0.08 - player.browL.rotation.z) * 0.2;
          player.browR.rotation.z += (0.08 - player.browR.rotation.z) * 0.2;
        }

        if (fa.timer >= fa.totalDuration) {
          frustrationAnim = null;
          if (!chess.isGameOver()) {
            scheduleNextThink();
          } else {
            resolveNonCheckmateGameOver();
          }
        }
        crowdExcitement = Math.max(crowdExcitement, 0.42);
        _crowdFocusVec.copy(player.headGroup.getWorldPosition(_lookTargetVec));
        crowd.update(dt, crowdElapsed, _crowdFocusVec, crowdExcitement, triggerCrowdShutter);
        return;
      }

      if (animState === 'move-sequence' && moveAnim) {
        const ma = moveAnim;
        const playerChair = ma.isWhite ? whiteChair : blackChair;
        const otherPlayer = ma.isWhite ? blackPlayer : whitePlayer;
        const otherChair = ma.isWhite ? blackChair : whiteChair;
        smoothReturnToRest(otherPlayer, otherChair, 0.1);

        if (ma.isRightArm) {
          ma.player.leftArmPivot.quaternion.slerp(_restQuatLShoulder, 0.15);
          ma.player.leftForePivot.quaternion.slerp(_restQuatFore, 0.15);
        } else {
          ma.player.rightArmPivot.quaternion.slerp(_restQuatRShoulder, 0.15);
          ma.player.rightForePivot.quaternion.slerp(_restQuatFore, 0.15);
        }

        const sitDamp = 1 - Math.exp(-8 * dt * Math.max(1, gameSpeed));
        if (ma.phase === 'reach-pickup') {
          ma.progress += dt * 2.15 * gameSpeed;
          const p = Math.min(ma.progress, 1);

          // 1) Lift hand over table edge (0..0.34), 2) Descend open fingers around piece (0.34..0.82), 3) Pinch/grab (0.82..1.0)
          const edgeZ = ma.isWhite ? TABLE_WHITE_EDGE_Z + 0.15 : TABLE_BLACK_EDGE_Z - 0.15;
          const midX = THREE.MathUtils.lerp(
            ma.player.root.position.x + (ma.isRightArm ? 0.9 : -0.9),
            ma.fromX,
            0.45
          );
          const midZ = THREE.MathUtils.lerp(edgeZ, ma.fromZ, 0.45);
          const graspY = PIECE_BASE_Y + ma.graspOffsetY;

          if (p < 0.34) {
            const upP = easeInOutCubic(p / 0.34);
            _handTargetVec.set(
              THREE.MathUtils.lerp(ma.player.root.position.x + (ma.isRightArm ? 0.9 : -0.9), midX, upP),
              THREE.MathUtils.lerp(0.95, TABLE_TOP_Y + 1.45, upP),
              THREE.MathUtils.lerp(edgeZ, midZ, upP)
            );
            movePlayerIntoReach(ma.player, playerChair, _handTargetVec, 0.28);
            reachHandToTarget(ma.player, ma.isRightArm, _handTargetVec, 0.72, 'pre-grab');
          } else if (p < 0.82) {
            const downP = easeInOutCubic((p - 0.34) / 0.48);
            _handTargetVec.set(
              THREE.MathUtils.lerp(midX, ma.fromX, downP),
              THREE.MathUtils.lerp(TABLE_TOP_Y + 1.45, graspY + 0.05, downP),
              THREE.MathUtils.lerp(midZ, ma.fromZ, downP)
            );
            movePlayerIntoReach(ma.player, playerChair, _handTargetVec, 0.32);
            reachHandToTarget(ma.player, ma.isRightArm, _handTargetVec, 0.86, 'pre-grab');
          } else {
            const pinchP = easeInOutCubic((p - 0.82) / 0.18);
            _handTargetVec.set(ma.fromX, THREE.MathUtils.lerp(graspY + 0.05, graspY, pinchP), ma.fromZ);
            movePlayerIntoReach(ma.player, playerChair, _handTargetVec, 0.36);
            reachHandToTarget(ma.player, ma.isRightArm, _handTargetVec, 0.96, 'pre-grab', {
              next: 'grab',
              t: pinchP,
            });
          }
          aimHeadAtWorld(ma.player, _handTargetVec, 0.16);
          _crowdFocusVec.copy(_handTargetVec);

          if (p >= 1) {
            ma.phase = 'move-piece';
            ma.progress = 0;
          }
        } else if (ma.phase === 'move-piece') {
          ma.progress += dt * 1.95 * gameSpeed;
          const p = Math.min(ma.progress, 1);
          const e = easeInOutCubic(p);

          const curX = ma.fromX + (ma.toX - ma.fromX) * e;
          const curZ = ma.fromZ + (ma.toZ - ma.fromZ) * e;
          const liftPeak = ma.madeMove.piece === 'n' ? 0.72 : 0.48;
          const curY = PIECE_BASE_Y + Math.sin(e * Math.PI) * liftPeak;

          ma.mesh.position.set(curX, curY, curZ);

          if (ma.rookData) {
            const rx = ma.rookData.fromX + (ma.rookData.toX - ma.rookData.fromX) * e;
            const rz = ma.rookData.fromZ + (ma.rookData.toZ - ma.rookData.fromZ) * e;
            ma.rookData.mesh.position.set(rx, PIECE_BASE_Y + Math.sin(e * Math.PI) * 0.28, rz);
          }

          if (ma.capturedMesh && p >= 0.72 && !ma.captureStarted) {
            ma.captureStarted = true;
            crowdExcitement = Math.max(crowdExcitement, 0.78);
            soundEngine.playCaptureSnap();
            soundEngine.playCrowdCheer(false);
            const captured = ma.capturedMesh;
            const start = captured.position.clone();
            piecesGroup.remove(captured);
            capturedPiecesGroup.add(captured);
            captured.position.copy(start);
            pieceMeshes = pieceMeshes.filter((pm) => pm !== captured);
            pieceMap.delete(ma.capKey);
            const slot = captureTraySlots.length;
            const target = new THREE.Vector3(
              8.65 + (slot % 2) * 0.40,
              PIECE_BASE_Y,
              1.15 + Math.floor(slot / 2) * 0.36
            );
            captureTraySlots.push(target.clone());
            captureAnimation = { mesh: captured, from: start, to: target, progress: 0 };
            ma.capturedMesh = null;
          }

          _handTargetVec.set(curX, curY + ma.graspOffsetY, curZ);
          movePlayerIntoReach(ma.player, playerChair, _handTargetVec, 0.36);
          reachHandToTarget(ma.player, ma.isRightArm, _handTargetVec, 0.98, 'grab');
          aimHeadAtWorld(ma.player, _handTargetVec, 0.18);
          _crowdFocusVec.copy(_handTargetVec);

          if (p >= 1) {
            if (!ma.captureStarted) soundEngine.playMoveTap();
            soundEngine.playMoveQualitySfx(ma.quality);
            if (ma.quality === 'brilliant' || ma.quality === 'great') {
              crowdExcitement = Math.max(crowdExcitement, 0.88);
              soundEngine.playCrowdCheer(false);
            } else if (ma.quality === 'blunder') {
              crowdExcitement = Math.max(crowdExcitement, 0.85);
            }
            if (chess.inCheck()) {
              crowdExcitement = Math.max(crowdExcitement, 0.9);
              soundEngine.playCrowdGasp();
            }
            ma.mesh.position.set(ma.toX, PIECE_BASE_Y, ma.toZ);
            lastQuality = ma.quality;
            show3DQualityBadge(ma.toRow, ma.toCol, ma.quality);

            if (slidePieceMesh) {
              slidePieceGroup.remove(slidePieceMesh);
              slidePieceMesh = null;
            }
            if (secondarySlideMesh) {
              slidePieceGroup.remove(secondarySlideMesh);
              secondarySlideMesh = null;
            }
            syncMovedPieceToMap(ma.toRow, ma.toCol, ma.madeMove, ma.isWhite);
            updateFischerLosingStatus();
            emitHud();

            if (chess.isGameOver()) {
              ma.phase = 'release';
              ma.progress = 0;
            } else if (ma.quality === 'blunder') {
              const blunderer = ma.player;
              moveAnim = null;
              switchClock();
              triggerFrustrationAnimation(blunderer);
            } else {
              const handReleaseWorld = _handTargetVec.set(
                ma.toX,
                PIECE_BASE_Y + ma.graspOffsetY,
                ma.toZ
              );
              moveAnim = null;
              stopTimer();
              const nextMover = chess.turn() === 'w' ? whitePreset.shortName : blackPreset.shortName;
              const prevMover = chess.turn() === 'w' ? blackPreset.shortName : whitePreset.shortName;
              turnText = `${prevMover} pressing clock (${nextMover} next)...`;
              emitHud();
              startClockPressAnimation(handReleaseWorld);
            }
          }
        } else if (ma.phase === 'release') {
          ma.progress += dt * 1.65 * gameSpeed;
          const p = Math.min(ma.progress, 1);
          if (p < 0.45) {
            const upP = easeInOutCubic(p / 0.45);
            const edgeZ = ma.isWhite ? TABLE_WHITE_EDGE_Z + 0.15 : TABLE_BLACK_EDGE_Z - 0.15;
            _handTargetVec.set(
              ma.toX,
              PIECE_BASE_Y + ma.graspOffsetY + 0.95 * upP,
              THREE.MathUtils.lerp(ma.toZ, edgeZ, upP * 0.55)
            );
            reachHandToTarget(ma.player, ma.isRightArm, _handTargetVec, 0.55, 'grab', {
              next: 'pre-grab',
              t: upP,
            });
          } else {
            smoothReturnToRest(ma.player, playerChair, sitDamp);
          }
          if (p >= 1) {
            moveAnim = null;

            if (chess.isCheckmate()) {
              triggerCheckmateCutscene(chess.turn());
            } else {
              resolveNonCheckmateGameOver();
            }
          }
        }
        crowd.update(dt, crowdElapsed, _crowdFocusVec, crowdExcitement);
        return;
      }

      if (animState === 'clock-press' && clockPressAnim) {
        clockPressAnim.progress += dt * 1.12 * gameSpeed;
        const p = Math.min(clockPressAnim.progress, 1);
        const ca = clockPressAnim;
        const caChair = ca.player === whitePlayer ? whiteChair : blackChair;
        const sitDamp = 1 - Math.exp(-8.5 * dt * Math.max(1, gameSpeed));

        if (p < 0.16) {
          // Phase 1: Unpinch fingers off the chess piece and lift hand cleanly above pieces
          const uP = easeInOutCubic(p / 0.16);
          _handTargetVec.set(
            ca.fromWorld.x,
            ca.fromWorld.y + 0.62 * uP,
            ca.fromWorld.z
          );
          movePlayerIntoReach(ca.player, caChair, _handTargetVec, sitDamp);
          reachHandToTarget(ca.player, ca.isRightArm, _handTargetVec, 0.65, 'grab', {
            next: 'pre-grab',
            t: uP,
          });
          aimHeadAtWorld(ca.player, _handTargetVec, 0.16);
        } else if (p < 0.44) {
          // Phase 2: Sweep over to the clock while morphing fingers into flat index+middle press gesture
          const gP = easeInOutCubic((p - 0.16) / 0.28);
          const liftY = ca.fromWorld.y + 0.62;
          const hoverClockY = clockButtonBaseY[ca.buttonKey] + 0.52;
          const arcY = Math.sin(gP * Math.PI) * 0.35;
          _handTargetVec.set(
            THREE.MathUtils.lerp(ca.fromWorld.x, ca.btnWorld.x, gP),
            THREE.MathUtils.lerp(liftY, hoverClockY, gP) + arcY,
            THREE.MathUtils.lerp(ca.fromWorld.z, ca.btnWorld.z, gP)
          );
          movePlayerIntoReach(ca.player, caChair, _handTargetVec, 0.24);
          reachHandToTarget(ca.player, ca.isRightArm, _handTargetVec, 0.68, 'pre-grab', {
            next: 'clock-press',
            t: gP,
          });
          aimHeadAtWorld(ca.player, ca.btnWorld, 0.16);
        } else if (p < 0.58) {
          // Phase 3: Lower extended index & middle fingertips cleanly onto the brass clock button
          const pressP = (p - 0.44) / 0.14;
          const downCurve = Math.sin(pressP * Math.PI);
          if (pressP >= 0.35 && clockButtons[ca.buttonKey].position.y === clockButtonBaseY[ca.buttonKey]) {
            soundEngine.playClockClick();
          }
          const pressDepth = downCurve * 0.09;
          clockButtons[ca.buttonKey].position.y = clockButtonBaseY[ca.buttonKey] - pressDepth;
          _handTargetVec.set(
            ca.btnWorld.x,
            THREE.MathUtils.lerp(
              clockButtonBaseY[ca.buttonKey] + 0.52,
              clockButtonBaseY[ca.buttonKey] + 0.05,
              Math.sin(Math.min(pressP * 1.35, 1) * (Math.PI / 2))
            ) - pressDepth,
            ca.btnWorld.z
          );
          movePlayerIntoReach(ca.player, caChair, _handTargetVec, 0.28);
          reachHandToTarget(ca.player, ca.isRightArm, _handTargetVec, 0.88, 'clock-press');
          aimHeadAtWorld(ca.player, ca.btnWorld, 0.16);
        } else if (p < 0.70) {
          // Phase 4: Release button & lift fingertips smoothly clear of the clock
          clockButtons[ca.buttonKey].position.y = clockButtonBaseY[ca.buttonKey];
          const liftP = easeInOutCubic((p - 0.58) / 0.12);
          _handTargetVec.set(
            THREE.MathUtils.lerp(ca.btnWorld.x, ca.btnWorld.x - 0.45, liftP),
            clockButtonBaseY[ca.buttonKey] + 0.08 + 0.68 * liftP,
            THREE.MathUtils.lerp(ca.btnWorld.z, ca.player.seatedPosition.z, liftP * 0.28)
          );
          reachHandToTarget(ca.player, ca.isRightArm, _handTargetVec, 0.55, 'clock-press', {
            next: 'rest',
            t: liftP * 0.65,
          });
          _lookTargetVec.set(BOARD_CENTER.x, 0.5, BOARD_CENTER.z);
          aimHeadAtWorld(ca.player, _lookTargetVec, 0.12);
        } else {
          // Phase 5: Smoothly sit back down onto the chair and lower arm back to lap (no snap!)
          clockButtons[ca.buttonKey].position.y = clockButtonBaseY[ca.buttonKey];
          const settleDamp = 1 - Math.exp(-9.0 * dt * Math.max(1, gameSpeed));
          smoothReturnToRest(ca.player, caChair, settleDamp);
          _lookTargetVec.set(BOARD_CENTER.x, 0.5, BOARD_CENTER.z);
          aimHeadAtWorld(ca.player, _lookTargetVec, settleDamp);
        }

        if (p >= 1) {
          clockButtons[ca.buttonKey].position.y = clockButtonBaseY[ca.buttonKey];
          clockPressAnim = null;
          switchClock();
          if (!chess.isGameOver()) {
            scheduleNextThink();
          } else {
            resolveNonCheckmateGameOver();
          }
        }
        crowd.update(dt, crowdElapsed, _crowdFocusVec, crowdExcitement);
        return;
      }

      if (animState === 'white-think' || animState === 'black-think') {
        animTimer -= dt * gameSpeed;
        const isWhiteTurn = animState === 'white-think';
        const player = isWhiteTurn ? whitePlayer : blackPlayer;
        const playerChair = isWhiteTurn ? whiteChair : blackChair;
        const otherPlayer = isWhiteTurn ? blackPlayer : whitePlayer;
        const otherChair = isWhiteTurn ? blackChair : whiteChair;
        const t = performance.now() * 0.0022 * gameSpeed;
        const thinkDamp = 1 - Math.exp(-7.5 * dt * Math.max(1, gameSpeed));

        const useFischerVPose = isWhiteTurn
          ? whitePreset.id === 'fischer' && fischerLosingLocked.w
          : blackPreset.id === 'fischer' && fischerLosingLocked.b;

        if (isDeepThink || useFischerVPose) {
          // Deep calculation or Bobby Fischer locked in his losing V-pose: lean in, furrow brows, scan variations
          applyPlayerStance(player, playerChair, 0, 0, 0, isDeepThink ? 0.22 : 0.16, thinkDamp);
          player.browL.rotation.z += ((useFischerVPose ? 0.15 : 0.14) - player.browL.rotation.z) * thinkDamp;
          player.browR.rotation.z += ((useFischerVPose ? -0.15 : -0.14) - player.browR.rotation.z) * thinkDamp;
          player.headGroup.rotation.z = Math.sin(t * 0.5) * 0.04;
          player.headGroup.rotation.x = 0.27 + Math.sin(t * 0.85) * 0.045;
          player.headGroup.rotation.y = Math.sin(t * 0.42) * (isDeepThink ? 0.19 : 0.1);
        } else {
          applyPlayerStance(player, playerChair, 0, 0, 0, 0.14, thinkDamp);
          player.browL.rotation.z += (-0.08 - player.browL.rotation.z) * thinkDamp;
          player.browR.rotation.z += (0.08 - player.browR.rotation.z) * thinkDamp;
          player.headGroup.rotation.z = Math.sin(t) * 0.04;
          player.headGroup.rotation.x = 0.25 + Math.sin(t * 1.3) * 0.035;
          player.headGroup.rotation.y = Math.sin(t * 0.75) * 0.07;
        }
        applyThinkChinPose(player, isWhiteTurn, thinkDamp, useFischerVPose);
        // Waiting opponent runs their preset-specific idle animation smoothly
        applyPresetIdleAnimation(otherPlayer, otherChair, crowdElapsed + 1.85, thinkDamp);

        if (animTimer <= 0 && !thinkingPending) {
          thinkingPending = true;
          const elo = isWhiteTurn ? whiteElo : blackElo;
          // Yield to a macrotask so the frame renders cleanly before search runs
          thinkTimerHandle = window.setTimeout(() => {
            thinkTimerHandle = null;
            thinkingPending = false;
            if (disposed || status !== 'playing') return;
            if (chess.isGameOver()) {
              resolveNonCheckmateGameOver();
              return;
            }
            const chosen = chooseEloMove(chess, isWhiteTurn ? 'w' : 'b', elo);
            if (chosen) {
              executeMove(chosen);
            } else {
              resolveNonCheckmateGameOver();
            }
          }, 0);
        }
        crowd.update(dt, crowdElapsed, _crowdFocusVec, crowdExcitement, triggerCrowdShutter);
        return;
      }

      if (animState === 'idle') {
        const t = performance.now() * 0.001 * gameSpeed;
        applyPresetIdleAnimation(whitePlayer, whiteChair, t, 0.12);
        applyPresetIdleAnimation(blackPlayer, blackChair, t + 1.85, 0.12);
        crowd.update(dt, crowdElapsed, _crowdFocusVec, crowdExcitement, triggerCrowdShutter);
      }
    }

    // Software WebGL loop pacing via fence sync (never setTimeout after render)
    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 60);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    // Pre-compile shaders on hardware GPU
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      updateLoop(dt);
      controls.update();
      if (!contextLost) {
        renderer.render(scene, camera);
      }
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    if (isSoftwareGl) afterDraw(tick);
    else frameId = requestAnimationFrame(tick);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      if (thinkTimerHandle !== null) window.clearTimeout(thinkTimerHandle);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      clearQualitySprite();
      clearBestArrows();
      soundEngine.stopCrowdAmbience();
      crowd.dispose();
      whitePlayer.dispose();
      blackPlayer.dispose();
      disposeAssetPool(pool);
      envTarget.dispose();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [controlsRef]);

  return <div ref={mountRef} className="w-full h-full relative" />;
}
