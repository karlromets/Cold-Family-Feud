import { Game } from './game';
import WebSocket from 'ws';

export interface PlayerInterval {
    [playerId: string]: NodeJS.Timeout;
}

export interface RoomConnections {
    [connectionId: string]: WebSocket;
}

export interface Room {
    intervals: PlayerInterval;
    game: Game;
    connections: RoomConnections;
}

export interface Rooms {
    [roomCode: string]: Room;
} 