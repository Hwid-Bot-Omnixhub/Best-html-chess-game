export type HairStyle = 'parted' | 'fringe' | 'wavy' | 'spiky' | 'bun' | 'cropped';

export interface GrandmasterPreset {
  id: string;
  fullName: string;
  shortName: string;
  elo: number;
  styleTag: string;
  suitColor: number;
  shirtColor: number;
  tieColor: number;
  skinColor: number;
  hairColor: number;
  eyeColor: number;
  hasGlasses: boolean;
  hairStyle: HairStyle;
}

export const GRANDMASTER_PRESETS: GrandmasterPreset[] = [
  {
    id: 'fischer',
    fullName: 'Bobby Fischer',
    shortName: 'Fischer',
    elo: 2785,
    styleTag: 'Precision & Endgame',
    suitColor: 0x1a2d4a,
    shirtColor: 0xf5f5f5,
    tieColor: 0x8b0000,
    skinColor: 0xf0c8a0,
    hairColor: 0x5a3a1a,
    eyeColor: 0x2a4a7a,
    hasGlasses: true,
    hairStyle: 'parted',
  },
  {
    id: 'carlsen',
    fullName: 'Magnus Carlsen',
    shortName: 'Carlsen',
    elo: 2839,
    styleTag: 'Universal Grinder',
    suitColor: 0x1c1c1c,
    shirtColor: 0xfafafa,
    tieColor: 0x1a3060,
    skinColor: 0xf5d5b0,
    hairColor: 0xd4b060,
    eyeColor: 0x4a7a2a,
    hasGlasses: false,
    hairStyle: 'fringe',
  },
  {
    id: 'nakamura',
    fullName: 'Hikaru Nakamura',
    shortName: 'Nakamura',
    elo: 2802,
    styleTag: 'Blitz & Tactics',
    suitColor: 0x141824,
    shirtColor: 0xe8eef5,
    tieColor: 0x06b6d4,
    skinColor: 0xe8be96,
    hairColor: 0x17171f,
    eyeColor: 0x231a14,
    hasGlasses: true,
    hairStyle: 'spiky',
  },
  {
    id: 'kasparov',
    fullName: 'Garry Kasparov',
    shortName: 'Kasparov',
    elo: 2851,
    styleTag: 'Dynamic Attack',
    suitColor: 0x242026,
    shirtColor: 0xf3f1ed,
    tieColor: 0x7f1d1d,
    skinColor: 0xeec39d,
    hairColor: 0x3b3532,
    eyeColor: 0x3b2a1e,
    hasGlasses: false,
    hairStyle: 'wavy',
  },
  {
    id: 'tal',
    fullName: 'Mikhail Tal',
    shortName: 'Tal',
    elo: 2705,
    styleTag: 'Relentless Sacrifice',
    suitColor: 0x2b211c,
    shirtColor: 0xf4efe6,
    tieColor: 0xb45309,
    skinColor: 0xecc29e,
    hairColor: 0x241914,
    eyeColor: 0x1d1a16,
    hasGlasses: false,
    hairStyle: 'wavy',
  },
  {
    id: 'polgar',
    fullName: 'Judit Polgár',
    shortName: 'Polgár',
    elo: 2735,
    styleTag: 'Fearless Initiative',
    suitColor: 0x311d3f,
    shirtColor: 0xfbf9f7,
    tieColor: 0xd97706,
    skinColor: 0xf2ccb0,
    hairColor: 0x7c361e,
    eyeColor: 0x3f5a36,
    hasGlasses: false,
    hairStyle: 'bun',
  },
  {
    id: 'anand',
    fullName: 'Vishy Anand',
    shortName: 'Anand',
    elo: 2817,
    styleTag: 'Lightning Intuition',
    suitColor: 0x1e293b,
    shirtColor: 0xf8fafc,
    tieColor: 0xca8a04,
    skinColor: 0xc68b5e,
    hairColor: 0x19191d,
    eyeColor: 0x221710,
    hasGlasses: true,
    hairStyle: 'parted',
  },
  {
    id: 'ding',
    fullName: 'Ding Liren',
    shortName: 'Ding',
    elo: 2816,
    styleTag: 'Deep Calculation',
    suitColor: 0x18181b,
    shirtColor: 0xf1f5f9,
    tieColor: 0x3b82f6,
    skinColor: 0xeac096,
    hairColor: 0x16161b,
    eyeColor: 0x1f1712,
    hasGlasses: true,
    hairStyle: 'cropped',
  },
];

export function getGrandmasterById(id: string): GrandmasterPreset {
  return GRANDMASTER_PRESETS.find((gm) => gm.id === id) || GRANDMASTER_PRESETS[0];
}
