import { WebSocketServer, WebSocket } from 'ws';
import * as crypto from 'crypto';
import { createPokerGame, gameInstance } from './game';

// A simple in-memory store for clients per game room
const gameRooms: Map<string, Set<WebSocket>> = new Map();

/**
 * Validates the initData string from Telegram WebApp.
 * @param initData The initData string.
 * @param botToken The bot token.
 * @returns An object with validation status and the parsed user data if valid.
 */
function validateInitData(initData: string, botToken: string): { isValid: boolean; user?: any } {
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');
        
        const dataCheckArr: string[] = [];
        for (const [key, value] of params.entries()) {
            dataCheckArr.push(`${key}=${value}`);
        }
        dataCheckArr.sort();
        
        const dataCheckString = dataCheckArr.join('\n');
        
        const secretKey = crypto.createHmac('sha266', 'WebAppData').update(botToken).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

        if (calculatedHash === hash) {
            const user = JSON.parse(params.get('user') || '{}');
            return { isValid: true, user };
        }
        return { isValid: false };
    } catch (error) {
        console.error("Error validating initData:", error);
        return { isValid: false };
    }
}

export const setupWebSocket = (wss: WebSocketServer) => {
    wss.on('connection', (ws: WebSocket) => {
        console.log('Client connected');
        
        ws.on('message', async (message: string) => {
            try {
                const data = JSON.parse(message);
                const { type, payload } = data;

                // For simplicity, we use one global game room 'table-1'
                const roomId = 'table-1';

                if (type === 'joinGame') {
                    const botToken = process.env.BOT_TOKEN;
                    if (!botToken) {
                        console.error('BOT_TOKEN is not configured on the server.');
                        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Server configuration error: Missing BOT_TOKEN' } }));
                        return;
                    }

                    const { isValid, user } = validateInitData(payload.initData, botToken);
                    if (!isValid || !user) {
                        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Authentication failed. Invalid initData.' } }));
                        ws.close();
                        return;
                    }

                    // Attach userId to WebSocket instance for tracking
                    (ws as any).userId = user.id.toString();

                    if (!gameRooms.has(roomId)) {
                        gameRooms.set(roomId, new Set());
                    }
                    gameRooms.get(roomId)?.add(ws);

                    if (!gameInstance) {
                        // FIX: Correctly call createPokerGame with one argument.
                        createPokerGame(() => broadcastGameState(roomId));
                        // FIX: Configure the table after creating the game instance.
                        gameInstance?.configureTable(payload.blinds.small, payload.blinds.big);
                    }
                    
                    // FIX: Pass the initialStack to the addPlayer method.
                    await gameInstance?.addPlayer(user, payload.initialStack);

                    console.log(`Player ${user.id} (${user.first_name}) joined room ${roomId}`);
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
            const userId = (ws as any).userId;
            if (userId && gameInstance) {
                gameInstance.removePlayer(userId);
            }
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