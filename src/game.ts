import { GameState, Player, Card, Suit, Rank, GamePhase, PlayerAction, HandResult, AdminUser, TelegramUser } from './types';
import { pool } from './db';

// --- Card & Deck Logic ---
const SUITS: Suit[] = [Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS, Suit.SPADES];
const RANKS: Rank[] = [Rank.TWO, Rank.THREE, Rank.FOUR, Rank.FIVE, Rank.SIX, Rank.SEVEN, Rank.EIGHT, Rank.NINE, Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE];
const RANK_VALUES: Record<Rank, number> = { [Rank.TWO]: 2, [Rank.THREE]: 3, [Rank.FOUR]: 4, [Rank.FIVE]: 5, [Rank.SIX]: 6, [Rank.SEVEN]: 7, [Rank.EIGHT]: 8, [Rank.NINE]: 9, [Rank.TEN]: 10, [Rank.JACK]: 11, [Rank.QUEEN]: 12, [Rank.KING]: 13, [Rank.ACE]: 14 };

const createDeck = (): Card[] => SUITS.flatMap(suit => RANKS.map(rank => ({ suit, rank })));

const shuffleDeck = (deck: Card[]): Card[] => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

// --- Hand Evaluation Logic ---
const HAND_RANKS = {
    HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, THREE_OF_A_KIND: 3, STRAIGHT: 4,
    FLUSH: 5, FULL_HOUSE: 6, FOUR_OF_A_KIND: 7, STRAIGHT_FLUSH: 8, ROYAL_FLUSH: 9,
};

const evaluateHand = (allCards: Card[]): HandResult => {
    let bestHand: HandResult = { name: 'High Card', rank: -1, cards: [], rankValues: [] };

    // This logic requires at least 5 cards to form a hand.
    if (allCards.length < 5) {
        // Not enough cards to evaluate a standard poker hand, return a default.
        return bestHand;
    }

    // Generate all 5-card combinations from the available cards
    const combinations = (arr: Card[], k: number): Card[][] => {
        if (k > arr.length || k <= 0) {
            return [];
        }
        if (k === arr.length) {
            return [arr];
        }
        if (k === 1) {
            return arr.map(item => [item]);
        }
        const combs: Card[][] = [];
        arr.forEach((item, index) => {
            const smallerCombs = combinations(arr.slice(index + 1), k - 1);
            smallerCombs.forEach(smallerComb => {
                combs.push([item].concat(smallerComb));
            });
        });
        return combs;
    };
    
    const fiveCardHands = combinations(allCards, 5);

    for (const hand of fiveCardHands) {
        const sortedHand = [...hand].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
        const currentHandResult = get5CardHandResult(sortedHand);
        if (compareHandResults(currentHandResult, bestHand) > 0) {
            bestHand = currentHandResult;
        }
    }

    return bestHand;
};

const get5CardHandResult = (hand: Card[]): HandResult => {
    const ranks = hand.map(c => RANK_VALUES[c.rank]);
    const suits = hand.map(c => c.suit);
    const uniqueRanks = [...new Set(ranks)];
    
    const isFlush = new Set(suits).size === 1;
    const rankSet = new Set(ranks);
    const isStraight = rankSet.size === 5 && (Math.max(...ranks) - Math.min(...ranks) === 4 ||
                       (JSON.stringify(uniqueRanks.sort((a,b)=>a-b)) === JSON.stringify([2,3,4,5,14]))); // Ace-low straight

    if (isStraight && isFlush) {
        if (Math.min(...ranks) === 10 && Math.max(...ranks) === 14) {
            return { name: 'Royal Flush', rank: HAND_RANKS.ROYAL_FLUSH, cards: hand, rankValues: [HAND_RANKS.ROYAL_FLUSH] };
        }
        const highCard = ranks.includes(14) && ranks.includes(5) ? 5 : Math.max(...ranks); // Handle A-5 straight
        return { name: 'Straight Flush', rank: HAND_RANKS.STRAIGHT_FLUSH, cards: hand, rankValues: [HAND_RANKS.STRAIGHT_FLUSH, highCard] };
    }

    const rankCounts = ranks.reduce((acc, rank) => { acc[rank] = (acc[rank] || 0) + 1; return acc; }, {} as Record<number, number>);
    const counts = Object.values(rankCounts).sort((a, b) => b - a);
    const rankKeys = Object.keys(rankCounts).map(Number).sort((a, b) => rankCounts[b] - rankCounts[a] || b - a);

    if (counts[0] === 4) {
        return { name: 'Four of a Kind', rank: HAND_RANKS.FOUR_OF_A_KIND, cards: hand, rankValues: [HAND_RANKS.FOUR_OF_A_KIND, rankKeys[0], rankKeys[1]] };
    }
    if (counts[0] === 3 && counts[1] === 2) {
        return { name: 'Full House', rank: HAND_RANKS.FULL_HOUSE, cards: hand, rankValues: [HAND_RANKS.FULL_HOUSE, rankKeys[0], rankKeys[1]] };
    }
    if (isFlush) {
        return { name: 'Flush', rank: HAND_RANKS.FLUSH, cards: hand, rankValues: [HAND_RANKS.FLUSH, ...ranks] };
    }
    if (isStraight) {
        const highCard = ranks.includes(14) && ranks.includes(5) ? 5 : Math.max(...ranks);
        return { name: 'Straight', rank: HAND_RANKS.STRAIGHT, cards: hand, rankValues: [HAND_RANKS.STRAIGHT, highCard] };
    }
    if (counts[0] === 3) {
        return { name: 'Three of a Kind', rank: HAND_RANKS.THREE_OF_A_KIND, cards: hand, rankValues: [HAND_RANKS.THREE_OF_A_KIND, rankKeys[0], ...rankKeys.slice(1)] };
    }
    if (counts[0] === 2 && counts[1] === 2) {
        return { name: 'Two Pair', rank: HAND_RANKS.TWO_PAIR, cards: hand, rankValues: [HAND_RANKS.TWO_PAIR, rankKeys[0], rankKeys[1], rankKeys[2]] };
    }
    if (counts[0] === 2) {
        return { name: 'Pair', rank: HAND_RANKS.PAIR, cards: hand, rankValues: [HAND_RANKS.PAIR, rankKeys[0], ...rankKeys.slice(1)] };
    }
    return { name: 'High Card', rank: HAND_RANKS.HIGH_CARD, cards: hand, rankValues: [HAND_RANKS.HIGH_CARD, ...ranks] };
};

const compareHandResults = (a: HandResult, b: HandResult): number => {
    if (!a.rankValues) return -1;
    if (!b.rankValues) return 1;
    for (let i = 0; i < Math.max(a.rankValues.length, b.rankValues.length); i++) {
        const valA = a.rankValues[i] || 0;
        const valB = b.rankValues[i] || 0;
        if (valA > valB) return 1;
        if (valA < valB) return -1;
    }
    return 0; // Tie
};

// --- Game Class ---

class PokerGame {
    private state: GameState;
    private broadcastCallback: () => void;
    private deck: Card[] = [];
    private playerSeats: (Player | null)[];
    private maxPlayers: number;

    constructor(numPlayers: number, smallBlind: number, bigBlind: number, initialStack: number, broadcastCallback: () => void) {
        this.maxPlayers = numPlayers;
        this.playerSeats = Array(numPlayers).fill(null);
        this.state = {
            players: [],
            communityCards: [],
            pot: 0,
            activePlayerIndex: -1,
            gamePhase: GamePhase.PRE_DEAL,
            smallBlind,
            bigBlind,
            currentBet: bigBlind,
            lastRaiserIndex: null,
            log: ["Waiting for players..."],
        };
        this.broadcastCallback = broadcastCallback;
        this.broadcastState();
    }

    private broadcastState() {
        this.broadcastCallback();
    }
    
    public getState(): GameState {
        // Return a copy of the state
        return JSON.parse(JSON.stringify(this.state));
    }
    
    public async addPlayer(telegramUser: TelegramUser) {
        const userId = telegramUser.id.toString();
        
        // Prevent duplicate players
        if (this.state.players.some(p => p.id === userId)) {
            console.log(`Player ${userId} is already at the table.`);
            this.broadcastState(); // Broadcast state to the re-connecting user
            return;
        }

        const emptySeatIndex = this.playerSeats.findIndex(p => p === null);
        if (emptySeatIndex === -1) {
            console.log('Table is full.');
            return; // Or send a "table full" message
        }

        try {
            const name = `${telegramUser.first_name} ${telegramUser.last_name || ''}`.trim();
            const res = await pool.query(
                `INSERT INTO "Users" (id, name, "playMoney", "realMoney")
                 VALUES ($1, $2, 10000, 0)
                 ON CONFLICT (id) DO UPDATE
                 SET name = EXCLUDED.name
                 RETURNING *`,
                [userId, name]
            );

            const dbUser: AdminUser = {
                ...res.rows[0],
                 playMoney: parseFloat(res.rows[0].playMoney),
                 realMoney: parseFloat(res.rows[0].realMoney),
            };

            const newPlayer: Player = {
                id: dbUser.id,
                name: dbUser.name,
                stack: dbUser.playMoney, // Use play money for now
                cards: [], bet: 0, isFolded: false, isAllIn: false,
                isDealer: false, isSmallBlind: false, isBigBlind: false,
                isThinking: false, position: emptySeatIndex,
            };

            this.playerSeats[emptySeatIndex] = newPlayer;
            this.state.players = this.playerSeats.filter(p => p !== null) as Player[];

            if (this.state.players.length >= 2 && this.state.gamePhase === GamePhase.PRE_DEAL) {
                this.state.log = ["Game is starting..."];
                this.broadcastState();
                setTimeout(() => this.startNewHand(), 2000);
            } else {
                 this.broadcastState();
            }
        } catch (error) {
            console.error('Failed to add player to game:', error);
        }
    }

    public removePlayer(playerId: string) {
        const playerIndex = this.state.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) {
            console.log(`Player ${playerId} not found for removal.`);
            return;
        }

        const removedPlayer = this.state.players[playerIndex];
        const seatIndex = this.playerSeats.findIndex(p => p?.id === playerId);
        if (seatIndex > -1) {
            this.playerSeats[seatIndex] = null;
        }

        this.state.players = this.state.players.filter(p => p.id !== playerId);
        this.state.log.push(`${removedPlayer.name} has left the table.`);
        console.log(`${removedPlayer.name} has left the table.`);

        // Simple reset logic: if fewer than 2 players, stop the game.
        if (this.state.players.length < 2 && this.state.gamePhase !== GamePhase.PRE_DEAL) {
            this.state.gamePhase = GamePhase.PRE_DEAL;
            this.state.activePlayerIndex = -1;
            this.state.log.push("Waiting for more players...");
        } else if (this.state.players.length >= 2) {
             // If the active player was removed, find the next one.
             if (this.state.activePlayerIndex === playerIndex) {
                 this.findNextPlayer();
             }
        }
        
        this.broadcastState();
    }


    private startNewHand() {
        if (this.state.players.length < 2) return;

        this.deck = shuffleDeck(createDeck());
        this.state.communityCards = [];
        this.state.pot = 0;
        this.state.log = [];
        this.state.gamePhase = GamePhase.PRE_FLOP;

        // Rotate dealer, blinds
        const dealerIndex = this.state.players.findIndex(p => p.isDealer);
        this.state.players.forEach(p => {
            p.isDealer = false;
            p.isSmallBlind = false;
            p.isBigBlind = false;
            p.cards = [this.deck.pop()!, this.deck.pop()!];
            p.bet = 0;
            p.isFolded = false;
            p.handResult = undefined;
        });

        const newDealerIndex = (dealerIndex + 1) % this.state.players.length;
        const sbIndex = (newDealerIndex + 1) % this.state.players.length;
        const bbIndex = (newDealerIndex + 2) % this.state.players.length;

        this.state.players[newDealerIndex].isDealer = true;
        
        // Post blinds
        const sbPlayer = this.state.players[sbIndex];
        sbPlayer.isSmallBlind = true;
        sbPlayer.stack -= this.state.smallBlind;
        sbPlayer.bet = this.state.smallBlind;

        const bbPlayer = this.state.players[bbIndex];
        bbPlayer.isBigBlind = true;
        bbPlayer.stack -= this.state.bigBlind;
        bbPlayer.bet = this.state.bigBlind;

        this.state.pot = this.state.smallBlind + this.state.bigBlind;
        this.state.currentBet = this.state.bigBlind;
        this.state.activePlayerIndex = (bbIndex + 1) % this.state.players.length;
        this.state.lastRaiserIndex = bbIndex;

        this.broadcastState();
    }

    public handlePlayerAction(playerId: string, action: PlayerAction) {
        const playerIndex = this.state.players.findIndex(p => p.id === playerId);
        if (playerIndex !== this.state.activePlayerIndex) {
            return; // Not this player's turn
        }

        const player = this.state.players[playerIndex];
        
        // simplified logic
        switch(action.type) {
            case 'fold': player.isFolded = true; break;
            case 'check': break; // assume valid
            case 'call': 
                 const toCall = this.state.currentBet - player.bet;
                 player.stack -= toCall;
                 player.bet += toCall;
                 this.state.pot += toCall;
                 break;
            case 'raise':
                 const raiseAmount = action.amount;
                 const toRaise = raiseAmount - player.bet;
                 player.stack -= toRaise;
                 this.state.pot += toRaise;
                 player.bet = raiseAmount;
                 this.state.currentBet = raiseAmount;
                 this.state.lastRaiserIndex = playerIndex;
                 break;
        }

        this.findNextPlayer();
        this.broadcastState();
    }
    
    private findNextPlayer() {
        let nextIndex = (this.state.activePlayerIndex + 1) % this.state.players.length;
        
        // Skip folded or all-in players
        while(this.state.players[nextIndex].isFolded || this.state.players[nextIndex].isAllIn) {
            nextIndex = (nextIndex + 1) % this.state.players.length;
            if (nextIndex === this.state.activePlayerIndex) { // Everyone else is folded/all-in
                this.state.activePlayerIndex = -1;
                setTimeout(() => this.progressToNextPhase(), 1000);
                return;
            }
        }

        // Simplified end-of-round logic
        if (nextIndex === this.state.lastRaiserIndex) {
            this.state.activePlayerIndex = -1; // End of betting round
            setTimeout(() => this.progressToNextPhase(), 1000);
        } else {
            this.state.activePlayerIndex = nextIndex;
        }
    }

    private startBettingRound() {
        this.state.players.forEach(p => { if (!p.isAllIn) p.bet = 0 });
        this.state.currentBet = 0;
        
        let firstToAct = (this.state.players.findIndex(p => p.isDealer) + 1) % this.state.players.length;
        while(this.state.players[firstToAct].isFolded || this.state.players[firstToAct].isAllIn) {
             firstToAct = (firstToAct + 1) % this.state.players.length;
        }
        
        this.state.activePlayerIndex = firstToAct;
        this.state.lastRaiserIndex = firstToAct;
        this.broadcastState();
    }

    private async progressToNextPhase() {
        // Collect bets into pot
        this.state.players.forEach(p => { this.state.pot += p.bet; p.bet = 0; });

        // Check if only one player is left
        const activePlayers = this.state.players.filter(p => !p.isFolded);
        if (activePlayers.length === 1) {
            return this.showdown();
        }

        switch (this.state.gamePhase) {
            case GamePhase.PRE_FLOP:
                this.state.gamePhase = GamePhase.FLOP;
                this.state.communityCards = [this.deck.pop()!, this.deck.pop()!, this.deck.pop()!];
                this.startBettingRound();
                break;
            case GamePhase.FLOP:
                this.state.gamePhase = GamePhase.TURN;
                this.state.communityCards.push(this.deck.pop()!);
                this.startBettingRound();
                break;
            case GamePhase.TURN:
                this.state.gamePhase = GamePhase.RIVER;
                this.state.communityCards.push(this.deck.pop()!);
                this.startBettingRound();
                break;
            case GamePhase.RIVER:
                this.state.gamePhase = GamePhase.SHOWDOWN;
                await this.showdown();
                break;
            default:
                break;
        }
    }
    
    private async showdown() {
        this.state.activePlayerIndex = -1;
        this.state.gamePhase = GamePhase.SHOWDOWN;
        
        const contenders = this.state.players.filter(p => !p.isFolded);
        
        if (contenders.length === 1) {
             const winner = contenders[0];
             winner.stack += this.state.pot;
             this.state.log = [`${winner.name} wins ${this.state.pot}!`];
             this.state.pot = 0;
             this.broadcastState();
             await this.updatePlayerBalanceInDB(winner);
        } else {
            let bestHand: HandResult | null = null;
            let winners: Player[] = [];

            contenders.forEach(player => {
                const allCards = [...player.cards, ...this.state.communityCards];
                player.handResult = evaluateHand(allCards);
                if (!bestHand || compareHandResults(player.handResult, bestHand) > 0) {
                    bestHand = player.handResult;
                    winners = [player];
                } else if (bestHand && compareHandResults(player.handResult, bestHand) === 0) {
                    winners.push(player);
                }
            });

            if (winners.length > 0 && bestHand) {
                const totalWinnings = this.state.pot;
                const potPerWinner = Math.floor(totalWinnings / winners.length);
                winners.forEach(winner => {
                    winner.stack += potPerWinner;
                    this.updatePlayerBalanceInDB(winner);
                });
                
                const winnerNames = winners.map(w => w.name).join(', ');
                this.state.log = [`${winnerNames} wins ${totalWinnings} with a ${bestHand.name}!`];
            } else if (contenders.length > 0) {
                this.state.log = [`The pot of ${this.state.pot} is split.`];
            }
            
            this.state.pot = 0;
        }
        
        this.broadcastState();

        setTimeout(() => this.startNewHand(), 5000);
    }
    
    private async updatePlayerBalanceInDB(player: Player) {
        try {
            await pool.query(
                'UPDATE "Users" SET "playMoney" = $1 WHERE id = $2',
                [player.stack, player.id]
            );
        } catch (error) {
            console.error(`Failed to update balance for winner ${player.id}:`, error);
        }
    }
}


export let gameInstance: PokerGame | null = null;

export function createPokerGame(
    numPlayers: number,
    smallBlind: number,
    bigBlind: number,
    initialStack: number,
    broadcastCallback: () => void
) {
    gameInstance = new PokerGame(numPlayers, smallBlind, bigBlind, initialStack, broadcastCallback);
    return gameInstance;
}