export type PieceColor = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  type: PieceType;
  color: PieceColor;
}

export interface ChessMove {
  from: string;
  to: string;
  san: string;
  piece: PieceType;
  color: PieceColor;
  flags: string;
  captured?: PieceType;
  promotion?: PieceType;
}

export type MoveQuality =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export const QUALITY_CONFIG: Record<
  MoveQuality,
  { symbol: string; color: string; label: string; bg: string }
> = {
  brilliant: { symbol: '!!', color: '#06b6d4', label: 'Brilliant', bg: 'rgba(6,182,212,0.95)' },
  great: { symbol: '!', color: '#22c55e', label: 'Great', bg: 'rgba(34,197,94,0.95)' },
  best: { symbol: '★', color: '#84cc16', label: 'Best', bg: 'rgba(132,204,22,0.95)' },
  excellent: { symbol: '✓', color: '#84cc16', label: 'Excellent', bg: 'rgba(132,204,22,0.85)' },
  good: { symbol: '·', color: '#94a3b8', label: 'Good', bg: 'rgba(148,163,184,0.85)' },
  inaccuracy: { symbol: '?!', color: '#f59e0b', label: 'Inaccuracy', bg: 'rgba(245,158,11,0.95)' },
  mistake: { symbol: '?', color: '#f97316', label: 'Mistake', bg: 'rgba(249,115,22,0.95)' },
  blunder: { symbol: '??', color: '#ef4444', label: 'Blunder', bg: 'rgba(239,68,68,0.95)' },
};

const FILES = 'abcdefgh';
const PIECE_NAMES: Record<PieceType, string> = {
  p: '',
  r: 'R',
  n: 'N',
  b: 'B',
  q: 'Q',
  k: 'K',
};

export type GameOverReason = '' | 'checkmate' | 'stalemate' | 'insufficient' | 'repetition' | 'fifty';

export class ChessEngine {
  _board: (Piece | null)[][];
  _turn: PieceColor = 'w';
  _castling = { K: true, Q: true, k: true, q: true };
  _enPassant: string | null = null;
  _halfmoves = 0;
  _fullmoves = 1;
  _gameOver = false;
  _gameOverReason: GameOverReason = '';
  _history: ChessMove[] = [];
  private _positionCounts = new Map<string, number>();

  constructor(fen?: string) {
    this._board = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
    this._initFromFen(
      fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    );
  }

  private _initFromFen(fen: string) {
    const parts = fen.split(' ');
    const rows = parts[0].split('/');
    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') {
          c += parseInt(ch, 10);
        } else {
          const color: PieceColor = ch === ch.toUpperCase() ? 'w' : 'b';
          this._board[r][c] = { type: ch.toLowerCase() as PieceType, color };
          c++;
        }
      }
    }
    this._turn = (parts[1] as PieceColor) || 'w';
    const cast = parts[2] || '-';
    this._castling = {
      K: cast.includes('K'),
      Q: cast.includes('Q'),
      k: cast.includes('k'),
      q: cast.includes('q'),
    };
    this._enPassant = parts[3] && parts[3] !== '-' ? parts[3] : null;
    this._recordPosition();
  }

  private _positionKey(): string {
    let key = '';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this._board[r][c];
        key += p ? (p.color === 'w' ? p.type.toUpperCase() : p.type) : '.';
      }
    }
    const cStr =
      (this._castling.K ? 'K' : '') +
      (this._castling.Q ? 'Q' : '') +
      (this._castling.k ? 'k' : '') +
      (this._castling.q ? 'q' : '');
    return `${key}|${this._turn}|${cStr}|${this._enPassant || '-'}`;
  }

  private _recordPosition(): number {
    const key = this._positionKey();
    const next = (this._positionCounts.get(key) || 0) + 1;
    this._positionCounts.set(key, next);
    return next;
  }

  board(): (Piece | null)[][] {
    return this._board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
  }

  turn(): PieceColor {
    return this._turn;
  }

  isGameOver(): boolean {
    return this._gameOver;
  }

  gameOverReason(): GameOverReason {
    return this._gameOverReason;
  }

  inCheck(): boolean {
    const kPos = this._findKing(this._turn);
    if (!kPos) return false;
    return this._isAttacked(kPos[0], kPos[1], this._turn === 'w' ? 'b' : 'w');
  }

  hasSeenPositionTwice(): boolean {
    return (this._positionCounts.get(this._positionKey()) || 0) >= 2;
  }

  countOfPosition(key: string): number {
    return this._positionCounts.get(key) || 0;
  }

  isCheckmate(): boolean {
    return this._gameOverReason === 'checkmate';
  }

  isDraw(): boolean {
    return (
      this._gameOverReason === 'stalemate' ||
      this._gameOverReason === 'insufficient' ||
      this._gameOverReason === 'repetition' ||
      this._gameOverReason === 'fifty'
    );
  }

  isStalemate(): boolean {
    return this._gameOverReason === 'stalemate';
  }

  isThreefoldRepetition(): boolean {
    return this._gameOverReason === 'repetition';
  }

  history(): ChessMove[] {
    return this._history.map((h) => ({ ...h }));
  }

  _inBounds(r: number, c: number): boolean {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  _findKing(color: PieceColor): [number, number] | null {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this._board[r][c];
        if (p && p.type === 'k' && p.color === color) return [r, c];
      }
    }
    return null;
  }

  _isAttacked(r: number, c: number, byColor: PieceColor): boolean {
    const b = this._board;
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    for (let d = 0; d < 8; d++) {
      const dr = dirs[d][0];
      const dc = dirs[d][1];
      const isCardinal = dr === 0 || dc === 0;
      for (let step = 1; step < 8; step++) {
        const nr = r + dr * step;
        const nc = c + dc * step;
        if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) break;
        const p = b[nr][nc];
        if (p) {
          if (p.color === byColor) {
            if (isCardinal && (p.type === 'r' || p.type === 'q')) return true;
            if (!isCardinal && (p.type === 'b' || p.type === 'q')) return true;
            if (step === 1 && p.type === 'k') return true;
          }
          break;
        }
      }
    }
    const knightMoves = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];
    for (let i = 0; i < 8; i++) {
      const nr = r + knightMoves[i][0];
      const nc = c + knightMoves[i][1];
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const p = b[nr][nc];
        if (p && p.color === byColor && p.type === 'n') return true;
      }
    }
    const pawnDir = byColor === 'w' ? 1 : -1;
    const pr = r + pawnDir;
    if (pr >= 0 && pr < 8) {
      if (c - 1 >= 0) {
        const p = b[pr][c - 1];
        if (p && p.color === byColor && p.type === 'p') return true;
      }
      if (c + 1 < 8) {
        const p = b[pr][c + 1];
        if (p && p.color === byColor && p.type === 'p') return true;
      }
    }
    return false;
  }

  private _wouldLeaveKingInCheck(
    fromR: number,
    fromC: number,
    toR: number,
    toC: number,
    promoteTo: PieceType | null,
    isEnPassant: boolean
  ): boolean {
    const b = this._board;
    const orig = b[toR][toC];
    const piece = b[fromR][fromC]!;
    let epCaptured: Piece | null = null;
    const epRow = piece.color === 'w' ? toR + 1 : toR - 1;
    if (isEnPassant) {
      epCaptured = b[epRow][toC];
      b[epRow][toC] = null;
    }
    b[toR][toC] = promoteTo ? { type: promoteTo, color: piece.color } : piece;
    b[fromR][fromC] = null;
    const kPos = this._findKing(piece.color);
    const inCheck = kPos
      ? this._isAttacked(kPos[0], kPos[1], piece.color === 'w' ? 'b' : 'w')
      : false;
    b[fromR][fromC] = piece;
    b[toR][toC] = orig;
    if (isEnPassant) b[epRow][toC] = epCaptured;
    return inCheck;
  }

  moves(): ChessMove[] {
    const result: ChessMove[] = [];
    const b = this._board;
    const color = this._turn;
    const opp: PieceColor = color === 'w' ? 'b' : 'w';

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        if (!p || p.color !== color) continue;

        const addMove = (
          toR: number,
          toC: number,
          flags = '',
          promoteTo: PieceType | null = null
        ) => {
          const isEp = flags.includes('e');
          if (this._wouldLeaveKingInCheck(r, c, toR, toC, promoteTo, isEp)) return;
          const captured = isEp ? b[color === 'w' ? toR + 1 : toR - 1][toC] : b[toR][toC];
          const from = FILES[c] + (8 - r);
          const to = FILES[toC] + (8 - toR);
          const san =
            (p.type === 'p'
              ? flags.includes('c') || isEp
                ? FILES[c]
                : ''
              : PIECE_NAMES[p.type]) +
            (flags.includes('c') || isEp ? 'x' : '') +
            to +
            (promoteTo ? '=' + promoteTo.toUpperCase() : '');
          result.push({
            from,
            to,
            san,
            piece: p.type,
            color,
            flags: flags || 'n',
            captured: captured ? captured.type : undefined,
            promotion: promoteTo || undefined,
          });
        };

        if (p.type === 'p') {
          const dir = color === 'w' ? -1 : 1;
          const startRow = color === 'w' ? 6 : 1;
          const promRow = color === 'w' ? 0 : 7;
          if (this._inBounds(r + dir, c) && !b[r + dir][c]) {
            if (r + dir === promRow) {
              for (const pt of ['q', 'r', 'b', 'n'] as PieceType[]) {
                addMove(r + dir, c, '', pt);
              }
            } else {
              addMove(r + dir, c);
              if (r === startRow && !b[r + 2 * dir][c]) addMove(r + 2 * dir, c, 'b');
            }
          }
          for (const dc of [-1, 1]) {
            const nr = r + dir;
            const nc = c + dc;
            if (this._inBounds(nr, nc)) {
              const target = b[nr][nc];
              if (target && target.color === opp) {
                if (nr === promRow) {
                  for (const pt of ['q', 'r', 'b', 'n'] as PieceType[]) {
                    addMove(nr, nc, 'c', pt);
                  }
                } else {
                  addMove(nr, nc, 'c');
                }
              }
              const epFile = this._enPassant ? this._enPassant.charCodeAt(0) - 97 : -1;
              const epRow = color === 'w' ? 2 : 5;
              if (this._enPassant && nc === epFile && nr === epRow) addMove(nr, nc, 'e');
            }
          }
        } else if (p.type === 'n') {
          for (const [dr, dc] of [
            [-2, -1],
            [-2, 1],
            [-1, -2],
            [-1, 2],
            [1, -2],
            [1, 2],
            [2, -1],
            [2, 1],
          ]) {
            const nr = r + dr;
            const nc = c + dc;
            if (this._inBounds(nr, nc) && b[nr][nc]?.color !== color) {
              addMove(nr, nc, b[nr][nc] ? 'c' : 'n');
            }
          }
        } else if (p.type === 'b' || p.type === 'r' || p.type === 'q') {
          const dirs =
            p.type === 'b'
              ? [
                  [1, 1],
                  [1, -1],
                  [-1, 1],
                  [-1, -1],
                ]
              : p.type === 'r'
                ? [
                    [0, 1],
                    [0, -1],
                    [1, 0],
                    [-1, 0],
                  ]
                : [
                    [0, 1],
                    [0, -1],
                    [1, 0],
                    [-1, 0],
                    [1, 1],
                    [1, -1],
                    [-1, 1],
                    [-1, -1],
                  ];
          for (const [dr, dc] of dirs) {
            for (let step = 1; step < 8; step++) {
              const nr = r + dr * step;
              const nc = c + dc * step;
              if (!this._inBounds(nr, nc)) break;
              if (b[nr][nc]) {
                if (b[nr][nc]!.color !== color) addMove(nr, nc, 'c');
                break;
              }
              addMove(nr, nc);
            }
          }
        } else if (p.type === 'k') {
          for (const [dr, dc] of [
            [-1, -1],
            [-1, 0],
            [-1, 1],
            [0, -1],
            [0, 1],
            [1, -1],
            [1, 0],
            [1, 1],
          ]) {
            const nr = r + dr;
            const nc = c + dc;
            if (this._inBounds(nr, nc) && b[nr][nc]?.color !== color) {
              addMove(nr, nc, b[nr][nc] ? 'c' : 'n');
            }
          }
          if (color === 'w' && r === 7 && c === 4) {
            if (
              this._castling.K &&
              !b[7][5] &&
              !b[7][6] &&
              b[7][7]?.type === 'r' &&
              b[7][7]?.color === 'w' &&
              !this._isAttacked(7, 4, 'b') &&
              !this._isAttacked(7, 5, 'b') &&
              !this._isAttacked(7, 6, 'b')
            ) {
              result.push({ from: 'e1', to: 'g1', san: 'O-O', piece: 'k', color, flags: 'k' });
            }
            if (
              this._castling.Q &&
              !b[7][3] &&
              !b[7][2] &&
              !b[7][1] &&
              b[7][0]?.type === 'r' &&
              b[7][0]?.color === 'w' &&
              !this._isAttacked(7, 4, 'b') &&
              !this._isAttacked(7, 3, 'b') &&
              !this._isAttacked(7, 2, 'b')
            ) {
              result.push({ from: 'e1', to: 'c1', san: 'O-O-O', piece: 'k', color, flags: 'q' });
            }
          }
          if (color === 'b' && r === 0 && c === 4) {
            if (
              this._castling.k &&
              !b[0][5] &&
              !b[0][6] &&
              b[0][7]?.type === 'r' &&
              b[0][7]?.color === 'b' &&
              !this._isAttacked(0, 4, 'w') &&
              !this._isAttacked(0, 5, 'w') &&
              !this._isAttacked(0, 6, 'w')
            ) {
              result.push({ from: 'e8', to: 'g8', san: 'O-O', piece: 'k', color, flags: 'k' });
            }
            if (
              this._castling.q &&
              !b[0][3] &&
              !b[0][2] &&
              !b[0][1] &&
              b[0][0]?.type === 'r' &&
              b[0][0]?.color === 'b' &&
              !this._isAttacked(0, 4, 'w') &&
              !this._isAttacked(0, 3, 'w') &&
              !this._isAttacked(0, 2, 'w')
            ) {
              result.push({ from: 'e8', to: 'c8', san: 'O-O-O', piece: 'k', color, flags: 'q' });
            }
          }
        }
      }
    }
    return result;
  }

  move(moveInput: ChessMove | { from: string; to: string; promotion?: PieceType }): ChessMove | null {
    const legal = this.moves();
    const found = legal.find(
      (m) =>
        m.from === moveInput.from &&
        m.to === moveInput.to &&
        (!moveInput.promotion || m.promotion === moveInput.promotion)
    );
    if (!found) return null;

    const b = this._board;
    const fromR = 8 - parseInt(found.from[1], 10);
    const fromC = found.from.charCodeAt(0) - 97;
    const toR = 8 - parseInt(found.to[1], 10);
    const toC = found.to.charCodeAt(0) - 97;
    const piece = b[fromR][fromC]!;

    b[toR][toC] = found.promotion ? { type: found.promotion, color: piece.color } : piece;
    b[fromR][fromC] = null;

    if (found.flags.includes('e')) {
      const epCaptureRow = piece.color === 'w' ? toR + 1 : toR - 1;
      b[epCaptureRow][toC] = null;
    }

    if (found.flags === 'k') {
      if (piece.color === 'w') {
        b[7][5] = b[7][7];
        b[7][7] = null;
      } else {
        b[0][5] = b[0][7];
        b[0][7] = null;
      }
    }
    if (found.flags === 'q') {
      if (piece.color === 'w') {
        b[7][3] = b[7][0];
        b[7][0] = null;
      } else {
        b[0][3] = b[0][0];
        b[0][0] = null;
      }
    }

    if (piece.type === 'k') {
      if (piece.color === 'w') {
        this._castling.K = false;
        this._castling.Q = false;
      } else {
        this._castling.k = false;
        this._castling.q = false;
      }
    }
    if (piece.type === 'r') {
      if (found.from === 'h1') this._castling.K = false;
      if (found.from === 'a1') this._castling.Q = false;
      if (found.from === 'h8') this._castling.k = false;
      if (found.from === 'a8') this._castling.q = false;
    }
    if (found.to === 'h1') this._castling.K = false;
    if (found.to === 'a1') this._castling.Q = false;
    if (found.to === 'h8') this._castling.k = false;
    if (found.to === 'a8') this._castling.q = false;

    if (piece.type === 'p' && Math.abs(toR - fromR) === 2) {
      this._enPassant = FILES[toC] + (8 - (fromR + toR) / 2);
    } else {
      this._enPassant = null;
    }

    this._turn = this._turn === 'w' ? 'b' : 'w';
    const nextMoves = this.moves();
    const kPos = this._findKing(this._turn);
    const inCheck = kPos
      ? this._isAttacked(kPos[0], kPos[1], this._turn === 'w' ? 'b' : 'w')
      : false;

    if (nextMoves.length === 0) {
      if (inCheck) {
        found.san += '#';
        this._gameOver = true;
        this._gameOverReason = 'checkmate';
      } else {
        this._gameOver = true;
        this._gameOverReason = 'stalemate';
      }
    } else if (inCheck) {
      found.san += '+';
    }

    this._history.push(found);
    if (!found.flags.includes('c') && !found.flags.includes('e') && piece.type !== 'p') {
      this._halfmoves++;
    } else {
      this._halfmoves = 0;
    }
    if (this._turn === 'w') this._fullmoves++;

    const pieces: Piece[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (b[r][c]) pieces.push(b[r][c]!);
      }
    }
    if (pieces.length <= 3 && !pieces.find((q) => q.type === 'r' || q.type === 'q' || q.type === 'p')) {
      this._gameOver = true;
      this._gameOverReason = 'insufficient';
    } else if (this._halfmoves >= 100) {
      this._gameOver = true;
      this._gameOverReason = 'fifty';
    } else {
      const repCount = this._recordPosition();
      if (repCount >= 3 && !this._gameOver) {
        this._gameOver = true;
        this._gameOverReason = 'repetition';
      }
    }

    return found;
  }
}

// ============================================================================
// ZERO-ALLOCATION FAST SEARCH ENGINE (eliminates FEN parsing & cloning lag)
// ============================================================================
// Encoding: 0 = empty, 1..6 = w(p,n,b,r,q,k), -1..-6 = b(p,n,b,r,q,k)
const TYPE_TO_CODE: Record<PieceType, number> = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
const CODE_VALUES = [0, 100, 320, 335, 500, 900, 20000];

// Piece-square tables (from white's perspective, index 0 = a8 .. 63 = h1)
const PST_PAWN = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 22, 22,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
];
const PST_KNIGHT = [
 -50,-40,-30,-30,-30,-30,-40,-50,
 -40,-20,  0,  0,  0,  0,-20,-40,
 -30,  0, 10, 15, 15, 10,  0,-30,
 -30,  5, 15, 20, 20, 15,  5,-30,
 -30,  0, 15, 20, 20, 15,  0,-30,
 -30,  5, 10, 15, 15, 10,  5,-30,
 -40,-20,  0,  5,  5,  0,-20,-40,
 -50,-40,-30,-30,-30,-30,-40,-50,
];
const PST_BISHOP = [
 -20,-10,-10,-10,-10,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5, 10, 10,  5,  0,-10,
 -10,  5,  5, 10, 10,  5,  5,-10,
 -10,  0, 10, 10, 10, 10,  0,-10,
 -10, 10, 10, 10, 10, 10, 10,-10,
 -10,  5,  0,  0,  0,  0,  5,-10,
 -20,-10,-10,-10,-10,-10,-10,-20,
];
const PST_ROOK = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0,
];

interface FastUndo {
  from: number;
  to: number;
  moved: number;
  captured: number;
  epSquare: number;
  castlingMask: number;
  epCapturedIdx: number;
  rookFrom: number;
  rookTo: number;
  promoted: boolean;
}

// Packed move: from (6 bits) | to (6 bits) | promoCode (3 bits) | flags (3 bits: 1=cap, 2=ep, 4=castle)
const FLAG_CAP = 1;
const FLAG_EP = 2;
const FLAG_CASTLE = 4;

function packMove(from: number, to: number, promo: number, flags: number): number {
  return from | (to << 6) | (promo << 12) | (flags << 15);
}

class FastBoard {
  sq = new Int8Array(64);
  turn: 1 | -1 = 1; // 1 = w, -1 = b
  castlingMask = 0; // bit 0: K, 1: Q, 2: k, 3: q
  epSquare = -1;
  wKing = 60;
  bKing = 4;

  loadFromEngine(engine: ChessEngine) {
    this.sq.fill(0);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = engine._board[r][c];
        if (!p) continue;
        const idx = r * 8 + c;
        const code = TYPE_TO_CODE[p.type] * (p.color === 'w' ? 1 : -1);
        this.sq[idx] = code;
        if (code === 6) this.wKing = idx;
        else if (code === -6) this.bKing = idx;
      }
    }
    this.turn = engine._turn === 'w' ? 1 : -1;
    this.castlingMask =
      (engine._castling.K ? 1 : 0) |
      (engine._castling.Q ? 2 : 0) |
      (engine._castling.k ? 4 : 0) |
      (engine._castling.q ? 8 : 0);
    if (engine._enPassant) {
      const c = engine._enPassant.charCodeAt(0) - 97;
      const r = 8 - parseInt(engine._enPassant[1], 10);
      this.epSquare = r * 8 + c;
    } else {
      this.epSquare = -1;
    }
  }

  isAttacked(idx: number, bySign: number): boolean {
    const r = idx >> 3;
    const c = idx & 7;
    const sq = this.sq;

    // Knights
    const kr = [-2, -2, -1, -1, 1, 1, 2, 2];
    const kc = [-1, 1, -2, 2, -2, 2, -1, 1];
    const targetN = bySign * 2;
    for (let i = 0; i < 8; i++) {
      const nr = r + kr[i];
      const nc = c + kc[i];
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && sq[nr * 8 + nc] === targetN) return true;
    }

    // Pawns
    const pawnDir = bySign === 1 ? 1 : -1;
    const pr = r + pawnDir;
    const targetP = bySign;
    if (pr >= 0 && pr < 8) {
      if (c > 0 && sq[pr * 8 + c - 1] === targetP) return true;
      if (c < 7 && sq[pr * 8 + c + 1] === targetP) return true;
    }

    // Sliding + King
    const drs = [0, 0, 1, -1, 1, 1, -1, -1];
    const dcs = [1, -1, 0, 0, 1, -1, 1, -1];
    const targetR = bySign * 4;
    const targetB = bySign * 3;
    const targetQ = bySign * 5;
    const targetK = bySign * 6;
    for (let d = 0; d < 8; d++) {
      const dr = drs[d];
      const dc = dcs[d];
      const isOrtho = d < 4;
      let nr = r + dr;
      let nc = c + dc;
      let step = 1;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const piece = sq[nr * 8 + nc];
        if (piece !== 0) {
          if (
            piece === targetQ ||
            (isOrtho && piece === targetR) ||
            (!isOrtho && piece === targetB) ||
            (step === 1 && piece === targetK)
          ) {
            return true;
          }
          break;
        }
        nr += dr;
        nc += dc;
        step++;
      }
    }
    return false;
  }

  generatePseudoMoves(out: number[]): number {
    let count = 0;
    const sq = this.sq;
    const turn = this.turn;
    const pawnDir = turn === 1 ? -1 : 1;
    const startRow = turn === 1 ? 6 : 1;
    const promRow = turn === 1 ? 0 : 7;

    for (let idx = 0; idx < 64; idx++) {
      const p = sq[idx];
      if (p === 0 || (p > 0 ? 1 : -1) !== turn) continue;
      const type = p > 0 ? p : -p;
      const r = idx >> 3;
      const c = idx & 7;

      if (type === 1) {
        const nr = r + pawnDir;
        if (nr >= 0 && nr < 8) {
          const fwd = nr * 8 + c;
          if (sq[fwd] === 0) {
            if (nr === promRow) {
              out[count++] = packMove(idx, fwd, 5, 0);
              out[count++] = packMove(idx, fwd, 2, 0);
            } else {
              out[count++] = packMove(idx, fwd, 0, 0);
              if (r === startRow) {
                const fwd2 = (r + 2 * pawnDir) * 8 + c;
                if (sq[fwd2] === 0) out[count++] = packMove(idx, fwd2, 0, 0);
              }
            }
          }
          for (const dc of [-1, 1]) {
            const nc = c + dc;
            if (nc >= 0 && nc < 8) {
              const capIdx = nr * 8 + nc;
              const target = sq[capIdx];
              if (target !== 0 && (target > 0 ? 1 : -1) !== turn) {
                if (nr === promRow) {
                  out[count++] = packMove(idx, capIdx, 5, FLAG_CAP);
                } else {
                  out[count++] = packMove(idx, capIdx, 0, FLAG_CAP);
                }
              } else if (capIdx === this.epSquare) {
                out[count++] = packMove(idx, capIdx, 0, FLAG_CAP | FLAG_EP);
              }
            }
          }
        }
      } else if (type === 2) {
        const kr = [-2, -2, -1, -1, 1, 1, 2, 2];
        const kc = [-1, 1, -2, 2, -2, 2, -1, 1];
        for (let i = 0; i < 8; i++) {
          const nr = r + kr[i];
          const nc = c + kc[i];
          if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const to = nr * 8 + nc;
            const target = sq[to];
            if (target === 0) out[count++] = packMove(idx, to, 0, 0);
            else if ((target > 0 ? 1 : -1) !== turn) out[count++] = packMove(idx, to, 0, FLAG_CAP);
          }
        }
      } else if (type === 3 || type === 4 || type === 5) {
        const startD = type === 3 ? 4 : 0;
        const endD = type === 4 ? 4 : 8;
        const drs = [0, 0, 1, -1, 1, 1, -1, -1];
        const dcs = [1, -1, 0, 0, 1, -1, 1, -1];
        for (let d = startD; d < endD; d++) {
          let nr = r + drs[d];
          let nc = c + dcs[d];
          while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const to = nr * 8 + nc;
            const target = sq[to];
            if (target === 0) {
              out[count++] = packMove(idx, to, 0, 0);
            } else {
              if ((target > 0 ? 1 : -1) !== turn) out[count++] = packMove(idx, to, 0, FLAG_CAP);
              break;
            }
            nr += drs[d];
            nc += dcs[d];
          }
        }
      } else if (type === 6) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
              const to = nr * 8 + nc;
              const target = sq[to];
              if (target === 0) out[count++] = packMove(idx, to, 0, 0);
              else if ((target > 0 ? 1 : -1) !== turn) out[count++] = packMove(idx, to, 0, FLAG_CAP);
            }
          }
        }
        if (turn === 1 && idx === 60) {
          if (
            (this.castlingMask & 1) !== 0 &&
            sq[61] === 0 &&
            sq[62] === 0 &&
            sq[63] === 4 &&
            !this.isAttacked(60, -1) &&
            !this.isAttacked(61, -1) &&
            !this.isAttacked(62, -1)
          ) {
            out[count++] = packMove(60, 62, 0, FLAG_CASTLE);
          }
          if (
            (this.castlingMask & 2) !== 0 &&
            sq[59] === 0 &&
            sq[58] === 0 &&
            sq[57] === 0 &&
            sq[56] === 4 &&
            !this.isAttacked(60, -1) &&
            !this.isAttacked(59, -1) &&
            !this.isAttacked(58, -1)
          ) {
            out[count++] = packMove(60, 58, 0, FLAG_CASTLE);
          }
        } else if (turn === -1 && idx === 4) {
          if (
            (this.castlingMask & 4) !== 0 &&
            sq[5] === 0 &&
            sq[6] === 0 &&
            sq[7] === -4 &&
            !this.isAttacked(4, 1) &&
            !this.isAttacked(5, 1) &&
            !this.isAttacked(6, 1)
          ) {
            out[count++] = packMove(4, 6, 0, FLAG_CASTLE);
          }
          if (
            (this.castlingMask & 8) !== 0 &&
            sq[3] === 0 &&
            sq[2] === 0 &&
            sq[1] === 0 &&
            sq[0] === -4 &&
            !this.isAttacked(4, 1) &&
            !this.isAttacked(3, 1) &&
            !this.isAttacked(2, 1)
          ) {
            out[count++] = packMove(4, 2, 0, FLAG_CASTLE);
          }
        }
      }
    }
    return count;
  }

  makeMove(packed: number, undo: FastUndo): boolean {
    const from = packed & 63;
    const to = (packed >> 6) & 63;
    const promo = (packed >> 12) & 7;
    const flags = (packed >> 15) & 7;

    const sq = this.sq;
    const moved = sq[from];
    const turn = this.turn;

    undo.from = from;
    undo.to = to;
    undo.moved = moved;
    undo.captured = sq[to];
    undo.epSquare = this.epSquare;
    undo.castlingMask = this.castlingMask;
    undo.epCapturedIdx = -1;
    undo.rookFrom = -1;
    undo.rookTo = -1;
    undo.promoted = promo > 0;

    sq[to] = promo > 0 ? promo * turn : moved;
    sq[from] = 0;

    if ((flags & FLAG_EP) !== 0) {
      const capIdx = turn === 1 ? to + 8 : to - 8;
      undo.epCapturedIdx = capIdx;
      undo.captured = sq[capIdx];
      sq[capIdx] = 0;
    }

    if ((flags & FLAG_CASTLE) !== 0) {
      if (to === 62) {
        undo.rookFrom = 63;
        undo.rookTo = 61;
      } else if (to === 58) {
        undo.rookFrom = 56;
        undo.rookTo = 59;
      } else if (to === 6) {
        undo.rookFrom = 7;
        undo.rookTo = 5;
      } else if (to === 2) {
        undo.rookFrom = 0;
        undo.rookTo = 3;
      }
      if (undo.rookFrom !== -1) {
        sq[undo.rookTo] = sq[undo.rookFrom];
        sq[undo.rookFrom] = 0;
      }
    }

    if (moved === 6) {
      this.wKing = to;
      this.castlingMask &= ~3;
    } else if (moved === -6) {
      this.bKing = to;
      this.castlingMask &= ~12;
    }
    if (from === 63 || to === 63) this.castlingMask &= ~1;
    if (from === 56 || to === 56) this.castlingMask &= ~2;
    if (from === 7 || to === 7) this.castlingMask &= ~4;
    if (from === 0 || to === 0) this.castlingMask &= ~8;

    const absMoved = moved > 0 ? moved : -moved;
    if (absMoved === 1 && Math.abs(to - from) === 16) {
      this.epSquare = (from + to) >> 1;
    } else {
      this.epSquare = -1;
    }

    const kingIdx = turn === 1 ? this.wKing : this.bKing;
    const illegal = this.isAttacked(kingIdx, -turn);
    this.turn = (turn === 1 ? -1 : 1) as 1 | -1;
    if (illegal) {
      this.unmakeMove(undo);
      return false;
    }
    return true;
  }

  unmakeMove(undo: FastUndo) {
    this.turn = (this.turn === 1 ? -1 : 1) as 1 | -1;
    this.epSquare = undo.epSquare;
    this.castlingMask = undo.castlingMask;

    const sq = this.sq;
    sq[undo.from] = undo.moved;
    if (undo.epCapturedIdx !== -1) {
      sq[undo.to] = 0;
      sq[undo.epCapturedIdx] = undo.captured;
    } else {
      sq[undo.to] = undo.captured;
    }
    if (undo.rookFrom !== -1) {
      sq[undo.rookFrom] = sq[undo.rookTo];
      sq[undo.rookTo] = 0;
    }
    if (undo.moved === 6) this.wKing = undo.from;
    else if (undo.moved === -6) this.bKing = undo.from;
  }

  evaluate(perspective: 1 | -1): number {
    const sq = this.sq;
    let score = 0;
    for (let idx = 0; idx < 64; idx++) {
      const p = sq[idx];
      if (p === 0) continue;
      const sign = p > 0 ? 1 : -1;
      const type = p > 0 ? p : -p;
      const pstIdx = sign === 1 ? idx : (7 - (idx >> 3)) * 8 + (idx & 7);
      let val = CODE_VALUES[type];
      if (type === 1) val += PST_PAWN[pstIdx];
      else if (type === 2) val += PST_KNIGHT[pstIdx];
      else if (type === 3) val += PST_BISHOP[pstIdx];
      else if (type === 4) val += PST_ROOK[pstIdx];
      score += sign * val;
    }
    return score * perspective;
  }
}

// Pre-allocated move buffers & undo stack by search depth to guarantee 0 GC
const MAX_DEPTH = 6;
const moveBuffers = Array.from({ length: MAX_DEPTH }, () => new Array<number>(256).fill(0));
const scoreBuffers = Array.from({ length: MAX_DEPTH }, () => new Array<number>(256).fill(0));
const undoStack: FastUndo[] = Array.from({ length: MAX_DEPTH }, () => ({
  from: 0,
  to: 0,
  moved: 0,
  captured: 0,
  epSquare: -1,
  castlingMask: 0,
  epCapturedIdx: -1,
  rookFrom: -1,
  rookTo: -1,
  promoted: false,
}));

function fastNegamax(
  fb: FastBoard,
  depth: number,
  alpha: number,
  beta: number,
  colorSign: number,
  perspective: 1 | -1
): number {
  if (depth <= 0) return colorSign * fb.evaluate(perspective);

  const moves = moveBuffers[depth];
  const scores = scoreBuffers[depth];
  const count = fb.generatePseudoMoves(moves);

  // Score moves for MVV-LVA ordering
  for (let i = 0; i < count; i++) {
    const m = moves[i];
    const to = (m >> 6) & 63;
    const cap = fb.sq[to];
    const flags = (m >> 15) & 7;
    if (cap !== 0 || (flags & FLAG_EP) !== 0) {
      const vic = cap === 0 ? 1 : cap > 0 ? cap : -cap;
      const from = m & 63;
      const att = fb.sq[from] > 0 ? fb.sq[from] : -fb.sq[from];
      scores[i] = 10000 + vic * 10 - att;
    } else if (((m >> 12) & 7) > 0) {
      scores[i] = 9000;
    } else {
      scores[i] = 0;
    }
  }

  let best = -Infinity;
  let legalCount = 0;
  const undo = undoStack[depth];

  for (let i = 0; i < count; i++) {
    // Selection sort next highest-scored move
    let bestIdx = i;
    for (let j = i + 1; j < count; j++) {
      if (scores[j] > scores[bestIdx]) bestIdx = j;
    }
    if (bestIdx !== i) {
      const tm = moves[i];
      moves[i] = moves[bestIdx];
      moves[bestIdx] = tm;
      const ts = scores[i];
      scores[i] = scores[bestIdx];
      scores[bestIdx] = ts;
    }

    if (!fb.makeMove(moves[i], undo)) continue;
    legalCount++;
    const val = -fastNegamax(fb, depth - 1, -beta, -alpha, -colorSign, perspective);
    fb.unmakeMove(undo);

    if (val > best) best = val;
    if (val > alpha) alpha = val;
    if (alpha >= beta) break;
  }

  if (legalCount === 0) {
    const kingIdx = fb.turn === 1 ? fb.wKing : fb.bKing;
    const checked = fb.isAttacked(kingIdx, -fb.turn);
    return checked ? -100000 - depth : 0;
  }
  return best;
}

const sharedFastBoard = new FastBoard();

export function chooseEloMove(engine: ChessEngine, color: PieceColor, rawElo: number): ChessMove | null {
  const legalMoves = engine.moves();
  if (legalMoves.length <= 1) return legalMoves[0] || null;

  const elo = Math.max(400, Math.min(2800, rawElo || 400));
  const depth = elo >= 2300 ? 3 : elo >= 1500 ? 2 : 1;
  const perspective: 1 | -1 = color === 'w' ? 1 : -1;

  sharedFastBoard.loadFromEngine(engine);
  const rootUndo = undoStack[0];

  const scored: { move: ChessMove; score: number }[] = [];
  const isOpening = engine._history.length < 10;
  for (let i = 0; i < legalMoves.length; i++) {
    const m = legalMoves[i];
    const fromC = m.from.charCodeAt(0) - 97;
    const fromR = 8 - parseInt(m.from[1], 10);
    const toC = m.to.charCodeAt(0) - 97;
    const toR = 8 - parseInt(m.to[1], 10);
    const fromIdx = fromR * 8 + fromC;
    const toIdx = toR * 8 + toC;
    const promo = m.promotion ? TYPE_TO_CODE[m.promotion] : 0;
    let flags = 0;
    if (m.flags.includes('c')) flags |= FLAG_CAP;
    if (m.flags.includes('e')) flags |= FLAG_CAP | FLAG_EP;
    if (m.flags === 'k' || m.flags === 'q') flags |= FLAG_CASTLE;

    const packed = packMove(fromIdx, toIdx, promo, flags);
    sharedFastBoard.makeMove(packed, rootUndo);
    let score = -fastNegamax(sharedFastBoard, depth - 1, -Infinity, Infinity, -1, perspective);
    sharedFastBoard.unmakeMove(rootUndo);

    // Avoid aimless immediate 2-move back-and-forth repetition unless clearly behind
    const recentSelf =
      engine._history.length >= 2 ? engine._history[engine._history.length - 2] : null;
    if (recentSelf && recentSelf.from === m.to && recentSelf.to === m.from && score > -150) {
      score -= 85;
    }
    // Add slight opening variety so Grandmaster bouts don't play the exact same line every match
    if (isOpening && elo >= 1800) {
      score += (Math.random() - 0.5) * 14;
    }

    scored.push({ move: m, score });
  }

  scored.sort((a, b) => b.score - a.score);

  const spread =
    elo >= 2600
      ? 6
      : elo >= 2200
        ? 22
        : elo >= 1800
          ? 55
          : elo >= 1400
            ? 130
            : elo >= 900
              ? 260
              : 520;
  const topScore = scored[0].score;
  const pool = scored.filter((item) => item.score >= topScore - spread);
  if (pool.length === 1) return pool[0].move;

  const temp = elo >= 2200 ? 1.3 : 3.2;
  let total = 0;
  for (let i = 0; i < pool.length; i++) total += Math.exp(-i / temp);
  let pick = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    pick -= Math.exp(-i / temp);
    if (pick <= 0) return pool[i].move;
  }
  return pool[0].move;
}

export interface BestMoveSuggestion {
  move: ChessMove;
  score: number;
}

export function getBestMoves(
  engine: ChessEngine,
  color: PieceColor,
  count = 2
): BestMoveSuggestion[] {
  if (engine.isGameOver()) return [];
  const legalMoves = engine.moves();
  if (legalMoves.length === 0) return [];

  const perspective: 1 | -1 = color === 'w' ? 1 : -1;
  sharedFastBoard.loadFromEngine(engine);
  const rootUndo = undoStack[0];
  const searchDepth = legalMoves.length > 32 ? 2 : 3;

  const scored: BestMoveSuggestion[] = [];
  for (let i = 0; i < legalMoves.length; i++) {
    const m = legalMoves[i];
    const fromC = m.from.charCodeAt(0) - 97;
    const fromR = 8 - parseInt(m.from[1], 10);
    const toC = m.to.charCodeAt(0) - 97;
    const toR = 8 - parseInt(m.to[1], 10);
    const fromIdx = fromR * 8 + fromC;
    const toIdx = toR * 8 + toC;
    const promo = m.promotion ? TYPE_TO_CODE[m.promotion] : 0;
    let flags = 0;
    if (m.flags.includes('c')) flags |= FLAG_CAP;
    if (m.flags.includes('e')) flags |= FLAG_CAP | FLAG_EP;
    if (m.flags === 'k' || m.flags === 'q') flags |= FLAG_CASTLE;

    const packed = packMove(fromIdx, toIdx, promo, flags);
    sharedFastBoard.makeMove(packed, rootUndo);
    const score = -fastNegamax(
      sharedFastBoard,
      searchDepth - 1,
      -Infinity,
      Infinity,
      -1,
      perspective
    );
    sharedFastBoard.unmakeMove(rootUndo);
    scored.push({ move: m, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, count));
}

const QUALITY_PIECE_VAL: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

export function getMaterialEvaluation(engine: ChessEngine): number {
  sharedFastBoard.loadFromEngine(engine);
  return sharedFastBoard.evaluate(1);
}

export function isFischerLosingPosition(engine: ChessEngine, color: PieceColor): boolean {
  if (engine.isCheckmate()) {
    return engine.turn() === color;
  }

  let myMat = 0;
  let oppMat = 0;
  let myNonPawnCount = 0;
  let oppNonPawnCount = 0;
  let myPawnCount = 0;
  let oppPawnCount = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = engine._board[r][c];
      if (!p || p.type === 'k') continue;
      const val = QUALITY_PIECE_VAL[p.type];
      if (p.color === color) {
        myMat += val;
        if (p.type === 'p') myPawnCount++;
        else myNonPawnCount++;
      } else {
        oppMat += val;
        if (p.type === 'p') oppPawnCount++;
        else oppNonPawnCount++;
      }
    }
  }

  // Little to no material left
  if (myMat === 0 && oppMat > 0) return true;
  if (myMat <= 350 && myMat < oppMat) return true;
  if (myMat <= 300 && oppNonPawnCount > 0) return true;

  // Just the king and a few pawns left while opponent has pieces or more pawns
  if (myNonPawnCount === 0 && (oppNonPawnCount > 0 || myPawnCount < oppPawnCount)) {
    return true;
  }

  // Materially behind / close to losing (e.g. down an exchange or 1.5+ pawns)
  if (myMat - oppMat <= -150) return true;

  // Tactical search check for forced mates, hanging pieces, or losing pawn endgames
  const perspective: 1 | -1 = color === 'w' ? 1 : -1;
  sharedFastBoard.loadFromEngine(engine);
  const isMyTurn = engine._turn === color;
  const moveCount = engine.moves().length;
  const searchDepth = moveCount <= 16 ? 3 : 2;
  const searchScore = isMyTurn
    ? fastNegamax(sharedFastBoard, searchDepth, -Infinity, Infinity, 1, perspective)
    : -fastNegamax(sharedFastBoard, searchDepth, -Infinity, Infinity, -1, perspective);

  if (searchScore <= -160) return true;
  if (myNonPawnCount === 0 && searchScore <= -30) return true;

  return false;
}

export function evaluateMoveQuality(move: ChessMove, engineAfter?: ChessEngine): MoveQuality {
  const wasCapture = move.flags.includes('c') || move.flags.includes('e');
  const isCheck = move.san.includes('+') || move.san.includes('#');
  const isMate = move.san.includes('#');
  const isPromotion = !!move.promotion;
  const r = Math.random();

  if (isMate) return 'brilliant';
  if (isPromotion && isCheck) return 'brilliant';

  if (engineAfter) {
    const toCol = move.to.charCodeAt(0) - 97;
    const toRow = 8 - parseInt(move.to[1], 10);
    const oppColor: PieceColor = move.color === 'w' ? 'b' : 'w';
    const isDefended = engineAfter._isAttacked(toRow, toCol, move.color);
    const isAttacked = engineAfter._isAttacked(toRow, toCol, oppColor);

    // Blunder ONLY shows when a piece is moved to an undefended square that can be captured at a loss
    if (!isDefended && isAttacked) {
      const movedVal = QUALITY_PIECE_VAL[move.piece];
      const capturedVal = move.captured ? QUALITY_PIECE_VAL[move.captured] : 0;
      if (movedVal > capturedVal) {
        if (move.piece !== 'p') {
          return 'blunder';
        }
        if (!wasCapture && r < 0.45) {
          return 'blunder';
        }
      }
    }

    if (wasCapture && isCheck) return r < 0.5 ? 'brilliant' : 'great';
    if (isCheck) return r < 0.3 ? 'great' : 'best';
    if (wasCapture) return r < 0.4 ? 'excellent' : 'good';
    if (!isDefended && r < 0.1) return 'mistake';
    if (r < 0.14) return 'inaccuracy';
    if (r < 0.36) return 'good';
    if (r < 0.66) return 'excellent';
    if (r < 0.88) return 'best';
    return 'great';
  }

  if (wasCapture && isCheck) return r < 0.5 ? 'brilliant' : 'great';
  if (isCheck) return r < 0.3 ? 'great' : 'best';
  if (wasCapture) return r < 0.4 ? 'excellent' : 'good';
  if (r < 0.08) return 'mistake';
  if (r < 0.18) return 'inaccuracy';
  if (r < 0.4) return 'good';
  if (r < 0.65) return 'excellent';
  if (r < 0.85) return 'best';
  return 'great';
}
