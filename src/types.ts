export enum Suit {
  HEARTS = 'HEARTS',
  DIAMONDS = 'DIAMONDS',
  CLUBS = 'CLUBS',
  SPADES = 'SPADES',
}

export enum Rank {
  TWO = '2',
  THREE = '3',
  FOUR = '4',
  FIVE = '5',
  SIX = '6',
  SEVEN = '7',
  EIGHT = '8',
  NINE = '9',
  TEN = 'T',
  JACK = 'J',
  QUEEN = 'Q',
  KING = 'K',
  ACE = 'A',
}

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface HandResult {
  name: string;
  rank: number;
  cards: Card[];
}

export interface Player {
  id: string;
  name: string;
  stack: number;
  cards: [Card, Card] | [];
  bet: number;
  isFolded: boolean;
  isAllIn: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isThinking: boolean;
  position: number;
  handResult?: HandResult;
}

export enum GamePhase {
  PRE_DEAL = 'PRE_DEAL',
  PRE_FLOP = 'PRE_FLOP',
  FLOP = 'FLOP',
  TURN = 'TURN',
  RIVER = 'RIVER',
  SHOWDOWN = 'SHOWDOWN',
}

export enum GameMode {
  PLAY_MONEY = 'PLAY_MONEY',
  REAL_MONEY = 'REAL_MONEY',
}

export interface TableConfig {
  id: string;
  name: string;
  mode: GameMode;
  stakes: { small: number; big: number };
  players: number;
  maxPlayers: number;
}

export interface GameState {
  players: Player[];
  communityCards: Card[];
  pot: number;
  activePlayerIndex: number;
  gamePhase: GamePhase;
  smallBlind: number;
  bigBlind: number;
  currentBet: number;
  lastRaiserIndex: number | null;
  log: string[];
}

export enum ActionType {
  DEAL = 'DEAL',
  PLAYER_ACTION = 'PLAYER_ACTION',
  NEXT_PHASE = 'NEXT_PHASE',
  SHOW_WINNER = 'SHOW_WINNER',
  RESET = 'RESET',
}

export type PlayerAction = 
    | { type: 'fold' }
    | { type: 'check' }
    | { type: 'call' }
    | { type: 'bet'; amount: number }
    | { type: 'raise'; amount: number };


export type GameAction =
  | { type: ActionType.DEAL }
  | { type: ActionType.PLAYER_ACTION; payload: { playerIndex: number; action: PlayerAction } }
  | { type: ActionType.NEXT_PHASE }
  | { type: ActionType.SHOW_WINNER, payload: { winnerInfo: string, winningPlayerIds: string[] } }
  | { type: ActionType.RESET };

// For Admin Panel - now matches backend model
export interface AdminUser {
    id: string;
    name: string;
    playMoney: number;
    realMoney: number;
}