import { WebSocketServer, WebSocket } from 'ws';
import { createPokerGame, gameInstance } from './game';

// A simple in-memory store for clients per game room
const gameRooms: Map<string, Set<WebSocket>> = new Map();

export const setupWebSocket = (wss: WebSocketServer) => {
    wss.on('connection', (ws: WebSocket) => {
        console.log('Client connected');
        
        ws.on('message', (message: string) => {
            try {
                const data = JSON.parse(message);
                const { type, payload } = data;

                // For simplicity, we use one global game room 'table-1'
                const roomId = 'table-1';

                if (type === 'joinGame') {
                    if (!gameRooms.has(roomId)) {
                        gameRooms.set(roomId, new Set());
                    }
                    gameRooms.get(roomId)?.add(ws);

                    // Create a new game if it doesn't exist or is finished
                    if (!gameInstance) {
                         createPokerGame(payload.numPlayers, payload.blinds.small, payload.blinds.big, payload.initialStack, () => broadcastGameState(roomId));
                    }
                    
                    // Add player to the game
                    gameInstance?.addPlayer(payload.userId);

                    console.log(`Player ${payload.userId} joined room ${roomId}`);
                } else if (type === 'playerAction') {
                    if (gameInstance) {
                        gameInstance.handlePlayerAction(payload.playerId, payload.action);
                    }
                }

            } catch (error) {
                console.error('Failed to handle message:', error);
                ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid message format' } }));
            }
        });

        ws.on('close', () => {
            console.log('Client disconnected');
            // Remove ws from all rooms
            gameRooms.forEach(clients => clients.delete(ws));
        });
    });
};

function broadcastGameState(roomId: string) {
    const clients = gameRooms.get(roomId);
    if (clients && gameInstance) {
        const state = gameInstance.getState();
        const stateString = JSON.stringify({ type: 'gameStateUpdate', payload: state });
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(stateString);
            }
        });
    }
}
