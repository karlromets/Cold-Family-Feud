export interface Game {
    registeredPlayers: {[key: string]: Player | "host"};
    buzzed: Buzzer[];
    final_round: FinalRoundQuestion[];
    final_round_2: FinalRoundQuestion[];
    final_round_timers: number[];
    gameCopy: [];
    settings: {
        logo_url: string | null;
        hide_questions: boolean;
        theme: string; // TODO: Enum
        final_round_title: string | null;
    };
    teams: Team[];
    title: boolean;
    title_text: string;
    point_tracker: number[];
    is_final_round: boolean;
    is_final_second: boolean;
    hide_first_round: boolean;
    round: number;
    rounds: Round[];
    room: string;
    tick: number;
}

export interface Answer {
    ans: string;
    pnt: number;
    trig: boolean;
  }
  
export interface Round {
    answers: Answer[];
    multiply: number; 
    question: string;
}

export interface Buzzer {
    id: string;
    time: number;
}

export interface FinalRoundQuestion {
    answers: [string, number][];
    question: string;
    selection: number;
    input: string;
    revealed: boolean;
}

export interface Player {
    role: string;
    name: string;
    latencies?: number[];
    latency?: number;
    team?: number;
    start?: Date
}

export interface Team {
    name: string;
    points: number;
    mistakes: number;
}