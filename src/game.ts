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

// --- Hand Evaluation Logic (simplified for brevity) ---
const evaluateHand = (allCards: Card[]): HandResult => {
    // This is a placeholder for a proper hand evaluation function.
    // A real implementation would be much more complex.
    return { name: 'High Card', rank: 0, cards: allCards.slice(0, 5) };
}

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
        }

        // Simplified end-of-round logic
        if (nextIndex === this.state.lastRaiserIndex) {
            this.state.activePlayerIndex = -1; // End of betting round
            setTimeout(() => this.progressToNextPhase(), 1000);
        } else {
            this.state.activePlayerIndex = nextIndex;
        }
    }

    private async progressToNextPhase() {
        // Logic to deal flop, turn, river, or showdown
        if (this.state.gamePhase === GamePhase.PRE_FLOP) {
            this.state.gamePhase = GamePhase.FLOP;
            this.state.communityCards = [this.deck.pop()!, this.deck.pop()!, this.deck.pop()!];
        } // etc...
        
        // For demo, we just end the hand and show winner
        else {
            this.state.gamePhase = GamePhase.SHOWDOWN;
            const winner = this.state.players.find(p => !p.isFolded)!;
            winner.stack += this.state.pot;
            this.state.log = [`${winner.name} wins ${this.state.pot}!`];
            this.state.pot = 0;
            this.broadcastState();
            
            // Save winner's new balance to the database
            try {
                await pool.query(
                    'UPDATE "Users" SET "playMoney" = $1 WHERE id = $2',
                    [winner.stack, winner.id]
                );
            } catch (error) {
                console.error(`Failed to update balance for winner ${winner.id}:`, error);
            }

            setTimeout(() => this.startNewHand(), 5000);
            return;
        }
        
        // Reset for next betting round
        this.state.players.forEach(p => p.bet = 0);
        this.state.currentBet = 0;
        this.state.activePlayerIndex = this.state.players.findIndex(p => p.isDealer); // Start with dealer
        this.state.lastRaiserIndex = this.state.activePlayerIndex;
        this.broadcastState();
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