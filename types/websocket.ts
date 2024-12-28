import { Game, Player } from "./game";

// Define all possible WebSocket actions
export type WebSocketAction = 
  | 'host_room'
  | 'join_room'
  | 'load_game'
  | 'game_window'
  | 'quit'
  | 'get_back_in'
  | 'data'
  | 'error'
  | 'buzz'
  | 'buzzed'
  | 'ping'
  | 'pong'
  | 'clearbuzzers'
  | 'change_lang'
  | 'logo_upload'
  | 'del_logo_upload'
  | 'registerbuzz'
  | 'registerspectator'
  | 'registered'
  | 'mistake'
  | 'show_mistake'
  | 'reveal'
  | 'final_reveal'
  | 'duplicate'
  | 'final_submit'
  | 'final_wrong'
  | 'set_timer'
  | 'stop_timer'
  | 'start_timer'
  | 'timer_complete';

// Base message interface
interface BaseMessage {
  action: WebSocketAction;
  room?: string;
}

// Specific message types
export interface LogoUploadMessage extends BaseMessage  {
  action: 'logo_upload';
  data: string;
  mimetype: string;
}

export interface BuzzMessage extends BaseMessage  {
  action: 'buzz';
  id: string;
}

export interface ChangeLanguageMessage extends BaseMessage  {
  action: 'change_lang';
  data: string;
}

export interface ClearBuzzersMessage extends BaseMessage  {
  action: 'clearbuzzers';
}

export interface PongMessage extends BaseMessage, Player  {
  action: 'pong';
  id: string;
}

export interface RegisterBuzzMessage extends BaseMessage {
  action: 'registerbuzz';
  id: string;
  team: number;
  room: string;
}

export interface HostRoomMessage extends BaseMessage {
  action: 'host_room';
}

export interface JoinRoomMessage extends BaseMessage {
  action: 'join_room';
  name: string;
}

export interface LoadGameMessage extends BaseMessage {
  action: 'load_game';
  name: string;
  file: any;
  data: Game;
  lang: string;
}

export interface GameWindowMessage extends BaseMessage {
    action: 'game_window';
    name: string;
    session: string;
}

export interface DataMessage extends BaseMessage {
    action: 'data';
    data: Game;
}

export interface RegisterPlayerMessage {
    name: string;
}

export interface QuitMessage extends BaseMessage {
  action: 'quit';
  host: boolean;
  id: string;
}

export interface GetBackInMessage extends BaseMessage {
  action: 'get_back_in';
  session: string;
}

export interface ErrorMessage extends BaseMessage {
  action: 'error';
  code: string;
  message?: string;
}

// Response message types
export interface HostRoomResponse extends BaseMessage {
  action: 'host_room';
  room: string;
  game: Game;
  id: string;
}

export interface JoinRoomResponse extends BaseMessage {
  action: 'join_room';
  room: string;
  game: Game;
  id: string;
  team?: number;
}

export interface GetBackInResponse extends BaseMessage {
  action: 'get_back_in';
  room: string;
  game: Game;
  id: string;
  player: 'host' | { role: 'player'; name: string };
  team?: number;
}

export interface RegisterSpectatorMessage extends BaseMessage {
    action: 'registerspectator';
    id: string;
}

export interface MistakeMessage extends BaseMessage {
  action: 'mistake' | 'show_mistake';
}

export interface RevealMessage extends BaseMessage {
  action: 'reveal';
}

export interface FinalRevealMessage extends BaseMessage {
  action: 'final_reveal';
}

export interface DuplicateMessage extends BaseMessage {
  action: 'duplicate';
}

export interface FinalSubmitMessage extends BaseMessage {
  action: 'final_submit';
}

export interface FinalWrongMessage extends BaseMessage {
  action: 'final_wrong';
}

export interface SetTimerMessage extends BaseMessage {
  action: 'set_timer';
  data: number;
}

export interface StopTimerMessage extends BaseMessage {
  action: 'stop_timer';
}

export interface StartTimerMessage extends BaseMessage {
  action: 'start_timer';
}

export interface TimerCompleteMessage extends BaseMessage {
  action: 'timer_complete';
}

// Union type of all possible messages
export type WebSocketMessage =
  | HostRoomMessage
  | JoinRoomMessage
  | LoadGameMessage
  | GameWindowMessage
  | RegisterBuzzMessage
  | RegisterSpectatorMessage
  | DataMessage
  | QuitMessage
  | GetBackInMessage
  | PongMessage
  | ClearBuzzersMessage
  | BuzzMessage
  | LogoUploadMessage
  | ChangeLanguageMessage
  | ErrorMessage
  | MistakeMessage
  | RevealMessage
  | FinalRevealMessage
  | DuplicateMessage
  | FinalSubmitMessage
  | FinalWrongMessage
  | SetTimerMessage
  | StopTimerMessage
  | StartTimerMessage
  | TimerCompleteMessage;

// Union type of all possible responses
export type WebSocketResponse =
  | HostRoomResponse
  | JoinRoomResponse
  | GetBackInResponse
  | ErrorMessage;