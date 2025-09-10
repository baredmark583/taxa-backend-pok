

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

export interface Player {
    id: string;
    name: string;
    stack: number;
    bet: number;
    hand: Card[];
    isFolded: boolean;
    isAllIn: boolean;
    isActive: boolean; // Is it their turn?
    hasActed: boolean; // Has acted in the current betting round
    photoUrl?: string;
}

export enum GameStage {
    PRE_DEAL = 'PRE_DEAL',
    PRE_FLOP = 'PRE_FLOP',
    FLOP = 'FLOP',
    TURN = 'TURN',
    RIVER = 'RIVER',
    SHOWDOWN = 'SHOWDOWN',
}

export interface WinnerInfo {
    playerId: string;
    name: string;
    amountWon: number;
    handRank: string;
    winningHand: Card[];
}


export interface GameState {
    players: Player[];
    communityCards: Card[];
    pot: number;
    currentBet: number;
    activePlayerIndex: number;
    stage: GameStage;
    dealerIndex: number;
    winners?: WinnerInfo[];
}