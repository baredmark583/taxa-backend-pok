
import { pool } from './db';
import { Rank, Suit, Card, Player, GameStage, GameState, WinnerInfo } from './types';

const rankToValue: Record<Rank, number> = { [Rank.TWO]: 2, [Rank.THREE]: 3, [Rank.FOUR]: 4, [Rank.FIVE]: 5, [Rank.SIX]: 6, [Rank.SEVEN]: 7, [Rank.EIGHT]: 8, [Rank.NINE]: 9, [Rank.TEN]: 10, [Rank.JACK]: 11, [Rank.QUEEN]: 12, [Rank.KING]: 13, [Rank.ACE]: 14 };

type HandResult = {
    rank: number; // 9 for SF, 8 for Quads, etc.
    name: string;
    value: number; // High card value for tie-breaking
    cards: Card[]; // The 5 cards making the hand
};

class PokerGame {
    private state: GameState;
    private onStateChange: () => void;
    private deck: Card[];
    private smallBlind: number;
    private bigBlind: number;
    private handInProgress: boolean = false;
    // FIX: Replace NodeJS.Timeout with ReturnType<typeof setTimeout> to resolve issue with missing global NodeJS type.
    private newHandTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(onStateChange: () => void) {
        this.onStateChange = onStateChange;
        this.state = {
            players: [],
            communityCards: [],
            pot: 0,
            currentBet: 0,
            activePlayerIndex: -1,
            stage: GameStage.PRE_DEAL,
            dealerIndex: -1,
        };
        this.deck = [];
        this.smallBlind = 0;
        this.bigBlind = 0;
    }
    
    public configureTable(smallBlind: number, bigBlind: number) {
        this.smallBlind = smallBlind;
        this.bigBlind = bigBlind;
    }

    private shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }
    
    private initializeDeck() {
        this.deck = [];
        for (const suit of Object.values(Suit)) {
            for (const rank of Object.values(Rank)) {
                this.deck.push({ suit, rank });
            }
        }
        this.shuffleDeck();
    }

    async addPlayer(user: { id: string, first_name: string }, stack: number) {
        if (this.state.players.find(p => p.id === user.id.toString())) return;

        const player: Player = {
            id: user.id.toString(), name: user.first_name, stack, bet: 0,
            hand: [], isFolded: false, isAllIn: false, isActive: false, hasActed: false
        };
        this.state.players.push(player);

        try {
            await pool.query('INSERT INTO "Users" (id, name, "playMoney") VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = $2', [player.id, player.name, stack]);
        } catch (error) { console.error("Failed to add user to DB:", error); }
        
        if (this.state.players.length >= 2 && !this.handInProgress) {
            this.startNewHand();
        }
        this.broadcast();
    }

    removePlayer(userId: string) {
        const playerIndex = this.state.players.findIndex(p => p.id === userId);
        if (playerIndex === -1) return;
        
        if (this.state.players[playerIndex].isActive) {
           this.handlePlayerAction(userId, { type: 'fold' });
        }
        
        this.state.players.splice(playerIndex, 1);

        if (this.state.players.length < 2 && this.handInProgress) {
            this.endHandEarly();
        } else if (this.state.dealerIndex >= this.state.players.length) {
            this.state.dealerIndex = 0;
        }

        this.broadcast();
    }

    private endHandEarly() {
        this.handInProgress = false;
        const remainingPlayer = this.state.players.find(p => !p.isFolded);
        if (remainingPlayer) {
            remainingPlayer.stack += this.state.pot;
        }
        this.state.pot = 0;
        this.state.stage = GameStage.PRE_DEAL;
        
        if (this.newHandTimeout) clearTimeout(this.newHandTimeout);
        this.newHandTimeout = setTimeout(() => this.startNewHand(), 5000);
    }

    private startNewHand() {
        if (this.state.players.length < 2) return;
        this.handInProgress = true;
        
        if (this.newHandTimeout) clearTimeout(this.newHandTimeout);

        this.initializeDeck();
        this.state.communityCards = [];
        this.state.pot = 0;
        this.state.winners = [];
        this.state.dealerIndex = (this.state.dealerIndex + 1) % this.state.players.length;

        this.state.players.forEach(p => {
            p.hand = [this.deck.pop()!, this.deck.pop()!];
            p.bet = 0;
            p.isFolded = false;
            p.isAllIn = false;
            p.isActive = false;
            p.hasActed = false;
        });

        // FIX: Correctly access dealerIndex from the state object.
        const sbIndex = (this.state.dealerIndex + 1) % this.state.players.length;
        // FIX: Correctly access dealerIndex from the state object.
        const bbIndex = (this.state.dealerIndex + 2) % this.state.players.length;

        const sbPlayer = this.state.players[sbIndex];
        const sbAmount = Math.min(this.smallBlind, sbPlayer.stack);
        sbPlayer.stack -= sbAmount;
        sbPlayer.bet = sbAmount;
        
        const bbPlayer = this.state.players[bbIndex];
        const bbAmount = Math.min(this.bigBlind, bbPlayer.stack);
        bbPlayer.stack -= bbAmount;
        bbPlayer.bet = bbAmount;

        this.state.pot = sbAmount + bbAmount;
        this.state.currentBet = this.bigBlind;
        this.state.stage = GameStage.PRE_FLOP;
        
        this.state.activePlayerIndex = (bbIndex + 1) % this.state.players.length;
        this.state.players[this.state.activePlayerIndex].isActive = true;

        this.broadcast();
    }
    
    handlePlayerAction(playerId: string, action: { type: string, amount?: number }) {
        const playerIndex = this.state.players.findIndex(p => p.id === playerId);
        if (playerIndex !== this.state.activePlayerIndex) return;

        const player = this.state.players[playerIndex];
        player.isActive = false;
        player.hasActed = true;

        switch (action.type) {
            case 'fold':
                player.isFolded = true;
                break;
            case 'check':
                // Valid only if player.bet === this.state.currentBet
                break;
            case 'call':
                const callAmount = Math.min(this.state.currentBet - player.bet, player.stack);
                player.stack -= callAmount;
                player.bet += callAmount;
                this.state.pot += callAmount;
                if (player.stack === 0) player.isAllIn = true;
                break;
            case 'raise':
                const raiseAmount = action.amount!;
                const totalBet = raiseAmount;
                const amountToPot = totalBet - player.bet;
                
                player.stack -= amountToPot;
                player.bet = totalBet;
                this.state.pot += amountToPot;
                this.state.currentBet = totalBet;
                if (player.stack === 0) player.isAllIn = true;
                
                // Other players need to act again
                this.state.players.forEach((p, i) => {
                    if (i !== playerIndex && !p.isFolded && !p.isAllIn) {
                        p.hasActed = false;
                    }
                });
                break;
        }

        this.moveToNextPlayer();
    }
    
    private moveToNextPlayer() {
        const activePlayersCount = this.state.players.filter(p => !p.isFolded).length;
        if (activePlayersCount <= 1) {
            this.endBettingRound();
            return;
        }
        
        const roundOver = this.state.players.every(p => p.isFolded || p.isAllIn || (p.hasActed && p.bet === this.state.currentBet));
        if (roundOver) {
            this.endBettingRound();
            return;
        }
        
        let nextIndex = (this.state.activePlayerIndex + 1) % this.state.players.length;
        while (this.state.players[nextIndex].isFolded || this.state.players[nextIndex].isAllIn) {
            nextIndex = (nextIndex + 1) % this.state.players.length;
        }
        this.state.activePlayerIndex = nextIndex;
        this.state.players[nextIndex].isActive = true;
        
        this.broadcast();
    }
    
    private endBettingRound() {
        this.state.players.forEach(p => {
            p.bet = 0;
            p.hasActed = false;
            p.isActive = false;
        });
        this.state.currentBet = 0;

        const activePlayers = this.state.players.filter(p => !p.isFolded);
        if (activePlayers.length <= 1) {
            this.showdown();
            return;
        }

        switch (this.state.stage) {
            case GameStage.PRE_FLOP:
                this.state.stage = GameStage.FLOP;
                this.state.communityCards.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!);
                break;
            case GameStage.FLOP:
                this.state.stage = GameStage.TURN;
                this.state.communityCards.push(this.deck.pop()!);
                break;
            case GameStage.TURN:
                this.state.stage = GameStage.RIVER;
                this.state.communityCards.push(this.deck.pop()!);
                break;
            case GameStage.RIVER:
                this.showdown();
                return;
        }
        
        // Start next betting round
        let firstToAct = (this.state.dealerIndex + 1) % this.state.players.length;
        while(this.state.players[firstToAct].isFolded || this.state.players[firstToAct].isAllIn) {
            firstToAct = (firstToAct + 1) % this.state.players.length;
        }
        this.state.activePlayerIndex = firstToAct;
        this.state.players[firstToAct].isActive = true;
        this.broadcast();
    }
    
    private showdown() {
        this.state.stage = GameStage.SHOWDOWN;
        const activePlayers = this.state.players.filter(p => !p.isFolded);
        
        if (activePlayers.length === 1) {
            const winner = activePlayers[0];
            winner.stack += this.state.pot;
            this.state.winners = [{
                playerId: winner.id, name: winner.name, amountWon: this.state.pot,
                handRank: "Walkover", winningHand: winner.hand
            }];
        } else {
            const evaluatedHands = activePlayers.map(player => {
                const allCards = [...player.hand, ...this.state.communityCards];
                const bestHand = this.evaluateHand(allCards);
                return { player, bestHand };
            }).sort((a, b) => b.bestHand.rank - a.bestHand.rank || b.bestHand.value - a.bestHand.value);
            
            const bestRank = evaluatedHands[0].bestHand.rank;
            const bestValue = evaluatedHands[0].bestHand.value;
            
            const winners = evaluatedHands.filter(h => h.bestHand.rank === bestRank && h.bestHand.value === bestValue);
            const amountWon = this.state.pot / winners.length;

            this.state.winners = winners.map(({ player, bestHand }) => {
                player.stack += amountWon;
                return {
                    playerId: player.id, name: player.name, amountWon: amountWon,
                    handRank: bestHand.name, winningHand: bestHand.cards
                };
            });
        }
        
        this.state.pot = 0;
        this.handInProgress = false;
        this.broadcast();

        if (this.newHandTimeout) clearTimeout(this.newHandTimeout);
        this.newHandTimeout = setTimeout(() => this.startNewHand(), 7000);
    }
    
    private evaluateHand(cards: Card[]): HandResult {
        const all5CardCombos: Card[][] = [];
        for (let i = 0; i < cards.length; i++) {
            for (let j = i + 1; j < cards.length; j++) {
                for (let k = j + 1; k < cards.length; k++) {
                    for (let l = k + 1; l < cards.length; l++) {
                        for (let m = l + 1; m < cards.length; m++) {
                            all5CardCombos.push([cards[i], cards[j], cards[k], cards[l], cards[m]]);
                        }
                    }
                }
            }
        }

        let bestHand: HandResult = { rank: 0, name: 'High Card', value: 0, cards: [] };

        all5CardCombos.forEach(hand => {
            const result = this.getHandRank(hand);
            if (result.rank > bestHand.rank || (result.rank === bestHand.rank && result.value > bestHand.value)) {
                bestHand = result;
            }
        });

        return bestHand;
    }
    
    private getHandRank(hand: Card[]): HandResult {
        const sortedHand = [...hand].sort((a, b) => rankToValue[b.rank] - rankToValue[a.rank]);
        const ranks = sortedHand.map(c => rankToValue[c.rank]);
        const suits = sortedHand.map(c => c.suit);

        const isFlush = suits.every(s => s === suits[0]);
        const rankCounts: Record<number, number> = ranks.reduce((acc, rank) => {
            acc[rank] = (acc[rank] || 0) + 1;
            return acc;
        }, {} as Record<number, number>);
        
        const counts = Object.values(rankCounts).sort((a, b) => b - a);
        const rankGroups = Object.keys(rankCounts).map(Number).sort((a, b) => b - a);

        const isStraight = ranks.every((rank, i) => i === 0 || ranks[i-1] - 1 === rank) ||
                         ([14, 5, 4, 3, 2].every(r => ranks.includes(r))); // Ace-low straight
        
        const value = parseInt(ranks.map(r => r.toString(16).padStart(2, '0')).join(''), 16);

        if (isStraight && isFlush) return { rank: 9, name: 'Straight Flush', value, cards: sortedHand };
        if (counts[0] === 4) return { rank: 8, name: 'Four of a Kind', value, cards: sortedHand };
        if (counts[0] === 3 && counts[1] === 2) return { rank: 7, name: 'Full House', value, cards: sortedHand };
        if (isFlush) return { rank: 6, name: 'Flush', value, cards: sortedHand };
        if (isStraight) return { rank: 5, name: 'Straight', value, cards: sortedHand };
        if (counts[0] === 3) return { rank: 4, name: 'Three of a Kind', value, cards: sortedHand };
        if (counts[0] === 2 && counts[1] === 2) return { rank: 3, name: 'Two Pair', value, cards: sortedHand };
        if (counts[0] === 2) return { rank: 2, name: 'One Pair', value, cards: sortedHand };
        
        return { rank: 1, name: 'High Card', value, cards: sortedHand };
    }

    getState(): GameState { return this.state; }
    private broadcast() { this.onStateChange(); }
}

export let gameInstance: PokerGame | null = null;

export const createPokerGame = (onStateChange: () => void) => {
    if (!gameInstance) {
        gameInstance = new PokerGame(onStateChange);
    }
};
