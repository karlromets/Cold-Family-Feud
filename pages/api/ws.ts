import WebSocket from 'ws';
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const glob = require("glob");
const bson = require("bson");
import {ERROR_CODES} from "i18n/errorCodes"
import * as loadGame from "backend/load-game";
import { Game, Player } from "@/types/game";
import { NextApiResponse } from "next";
import { BuzzMessage, ChangeLanguageMessage, ClearBuzzersMessage, DataMessage, ErrorMessage, GameWindowMessage, HostRoomMessage, LoadGameMessage, LogoUploadMessage, PongMessage, RegisterBuzzMessage, RegisterPlayerMessage, RegisterSpectatorMessage, WebSocketAction, WebSocketMessage, GetBackInMessage, JoinRoomMessage, QuitMessage } from "@/types/websocket";
import { Room, Rooms } from "@/types/room";
import getErrorMessage from '@/utils/getErrorMessage';

interface CustomWebSocketServer extends WebSocket.Server {
  broadcast: (room: string, data: any) => void;
}

interface ExtendedResponse extends NextApiResponse {
  socket: any;
}

const ioHandler = (req: Request, res: ExtendedResponse) => {
  if (!res.socket.server.ws) {
    console.log("*First use, starting websockets");

    const wss = new WebSocket.Server({
      server: res.socket.server,
      maxPayload: 5120 * 1024, // 5 MB
    }) as CustomWebSocketServer;

    const makeRoom = (length = 4) => {
      var result = [];
      var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      var charactersLength = characters.length;
      for (var i = 0; i < length; i++) {
        result.push(
          characters.charAt(Math.floor(Math.random() * charactersLength)),
        );
      }
      return result.join("");
    }

    const pingInterval = (room: Room, id: number, ws: WebSocket) => {
      // get recurring latency
      console.debug("Setting ping interval for player: ", id);
      let interval = setInterval(() => {
        try {
          if (
            ws.readyState === WebSocket.CLOSED ||
            ws.readyState === WebSocket.CLOSING
          ) {
            console.debug("Player disconnected, closing ping", id);
            clearInterval(interval);
          } else {
            if (room.game.registeredPlayers[id] !== "host") {
              console.debug("Sending ping to id", id);
              room.game.registeredPlayers[id].start = new Date();
              ws.send(JSON.stringify({ action: "ping", id: id }));
            }
          }
        } catch (e) {
          console.error("Player disconnected? ", e);
          clearInterval(interval);
        }
      }, 5000);

      room.intervals[id] = interval;
      console.debug(
        "room.intervals length => ",
        Object.keys(room.intervals).length,
      );
    }

    // loop until we register the host with an id
    const registerPlayer = (roomCode: string, host = false, message: RegisterPlayerMessage, ws: WebSocket) => {
      let id = uuidv4();
      let game = rooms[roomCode].game;
      while (!game.registeredPlayers[id]) {
        if (game.registeredPlayers[id]) {
          id = uuidv4();
        } else {
          if (host) {
            game.registeredPlayers[id] = "host";
            rooms[roomCode].connections[id] = ws;
            console.debug("Registered player as host: ", id, roomCode);
          } else {
            game.registeredPlayers[id] = {
              role: "player",
              name: message.name,
            };
            rooms[roomCode].connections[id] = ws;
            console.debug("Registered player: ", id, message.name, roomCode);
          }
        }
      }
      return id;
    }

    const cleanUpPublicRoomAssets = (room: string) => {
      let path = `./public/rooms/${room}`;
      if (fs.existsSync(path)) {
        fs.rmdirSync(path, { recursive: true, force: true });
      }
    }

    let average = (array: number[]) => array.reduce((a: number, b: number) => a + b) / array.length;
    // TODO instead of storing game data in memory, this should be stored to disk or redis
    let rooms: Rooms = {};
    let game = {
      registeredPlayers: {},
      buzzed: [],
      settings: {
        logo_url: null,
        hide_questions: true,
        theme: "default",
        final_round_title: null,
      },
      teams: [
        {
          name: "Team 1",
          points: 0,
          mistakes: 0,
        },
        {
          name: "Team 2",
          points: 0,
          mistakes: 0,
        },
      ],
      title: true,
      title_text: "",
      point_tracker: [],
      is_final_round: false,
      is_final_second: false,
      hide_first_round: false,
      round: 0,
    };

    wss.broadcast = function(room, data) {
      if (rooms[room]) {
        Object.keys(rooms[room].connections).forEach((rp) => {
          rooms[room].connections[rp].send(data);
        });
      } else {
        console.error("room code not found in rooms", room);
      }
    };

    const moreThanOneHourAgo = (date: number) => {
      const HOUR = 1000 * 60 * 60;
      const anHourAgo = Date.now() - HOUR;

      return date < anHourAgo;
    };

    const setTick = (message: Partial<WebSocketMessage>) => {
      if (message.room) {
        if (rooms[message.room]) {
          if (rooms[message.room].game) {
            if (message.action !== "pong") {
              // Show in logs if there are any active players
              console.debug(`Tick => ${message.room} ${message.action}`);
            }
            rooms[message.room].game.tick = new Date().getTime();
          }
        }
      }
    };

    setInterval(() => {
      for (const [room, roomData] of Object.entries(rooms)) {
        if (roomData.game?.tick) {
          if (roomData.game.tick) {
            if (moreThanOneHourAgo(new Date(roomData.game.tick).getTime())) {
              console.debug("clearing room, no activity for 1 hour: ", room);
              wss.broadcast(room, JSON.stringify({ action: "data", data: {} }));
              wss.broadcast(
                room,
                JSON.stringify({
                  action: "error",
                  code: ERROR_CODES.GAME_CLOSED,
                }),
              );
              delete rooms[room];
              cleanUpPublicRoomAssets(room);
            }
          }
        }
      }
    }, 10000);

    wss.on("connection", function connection(ws, req) {
      ws.on("error", (error) => {
        //handle error
        console.error("WebSocket error: ", error);
        ws.close();
      });

      ws.on("message", function incoming(messageData: WebSocket.RawData) {
        try {
          let message: Partial<WebSocketMessage> = {};
          try {
            if (Buffer.isBuffer(messageData)) {
              message = bson.deserialize(messageData, { promoteBuffers: true });
            } else {
              message = JSON.parse(messageData.toString());
            }
          } catch (e) {
            console.error(e);
            ws.send(
              JSON.stringify({
                action: "error",
                code: ERROR_CODES.PARSE_ERROR,
              } as ErrorMessage),
            );
            return;
          }

          const isMessageType = <T extends WebSocketMessage>(
            message: Partial<WebSocketMessage>,
            action: WebSocketAction
          ): message is T => {
            return message.action === action;
          };

          // If there is activity in this room, do not clear
          setTick(message);

          // TODO seperate each of these into seperate functions
          if (isMessageType<LoadGameMessage>(message, "load_game")) {
            if (!message.room) return;
            if (message.file != null && message.lang != null) {
              let data = fs.readFileSync(
                `games/${message.lang}/${message.file}`,
              );
              let loaded = data.toString();
              message.data = JSON.parse(loaded);
            }

            let loadGameData = loadGame.addGameKeys(message.data);
            const room = rooms[message.room];
            if (!room) return;

            const game = room.game;
            game.teams[0].points = 0;
            game.teams[1].points = 0;
            game.round = 0;
            game.title = true;
            game.rounds = loadGameData.rounds;
            // clone the final round so we can store data about the second final round
            game.final_round = loadGameData.final_round;
            game.final_round_2 = loadGameData.final_round;
            game.gameCopy = [];
            game.final_round_timers = loadGameData.final_round_timers;
            game.point_tracker = new Array(loadGameData.rounds.length).fill(0);
            wss.broadcast(
              message.room,
              JSON.stringify({ action: "data", data: game }),
            );
          } else if (isMessageType<HostRoomMessage>(message, "host_room")) {
            // loop until we find an available room code
            let roomCode = makeRoom();
            while (rooms[roomCode]) {
              roomCode = makeRoom();
            }

            rooms[roomCode] = {
              intervals: {},
              game: JSON.parse(JSON.stringify(game)),
              connections: {}
            };
            rooms[roomCode].game.room = roomCode;

            let id = registerPlayer(roomCode, true, { name: "" }, ws);

            // send back details to client
            ws.send(
              JSON.stringify({
                action: "host_room",
                room: roomCode,
                game: rooms[roomCode].game,
                id: id,
              }),
            );
          } else if (isMessageType<GameWindowMessage>(message, "game_window")) {
            const [room_code, user_id] = message.session.split(":");
            if (!room_code || !rooms[room_code]) return;
            rooms[room_code].connections[`game_window_${uuidv4()}`] = ws;
            wss.broadcast(
              room_code,
              JSON.stringify({ action: "data", data: rooms[room_code].game }),
            );
          } else if (isMessageType<JoinRoomMessage>(message, "join_room")) {
            let roomCode = message.room?.toUpperCase() || "";
            console.debug("joining room", roomCode);
            if (rooms[roomCode]) {
              let id = registerPlayer(roomCode, false, message as RegisterPlayerMessage, ws);
              ws.send(
                JSON.stringify({
                  action: "join_room",
                  room: roomCode,
                  game: rooms[roomCode].game,
                  id: id,
                }),
              );
            } else {
              ws.send(
                JSON.stringify({ action: "error", code: ERROR_CODES.ROOM_NOT_FOUND }),
              );
            }
          } else if (isMessageType<QuitMessage>(message, "quit")) {
            console.debug(
              "user quit game",
              message.room,
              message.id,
              message.host,
            );
            if (message.host && message.room) {
              wss.broadcast(message.room, JSON.stringify({ action: "quit" }));
              wss.broadcast(
                message.room,
                JSON.stringify({
                  action: "error",
                  code: ERROR_CODES.HOST_QUIT,
                }),
              );

              // if host quits then we need to clean up the running intervals
              if (rooms[message.room].intervals) {
                let players = rooms[message.room].intervals;
                for (const [id, entry] of Object.entries(players)) {
                  console.debug("Clear interval =>", entry);
                  clearInterval(entry);
                }
              }
              // clear ws from server
              if (rooms[message.room].connections) {
                for (const [id, ws_entry] of Object.entries(
                  rooms[message.room].connections,
                )) {
                  ws_entry.close();
                }
              }
              delete rooms[message.room];
              cleanUpPublicRoomAssets(message.room);
            } else {
              if(message.room && message.id) {
              let interval = rooms[message.room].intervals[message.id];
              console.debug("Clear interval =>", interval);
              if (interval) {
                clearInterval(interval);
              }
              let ws = rooms[message.room].connections[message.id];
              ws.send(JSON.stringify({ action: "quit" }));
              rooms[message.room].game.buzzed.forEach((b, index) => {
                if (b.id === message.id && message.room) {
                  rooms[message.room].game.buzzed.splice(index, 1);
                }
              });
              ws.close();
              delete rooms[message.room].game.registeredPlayers[message.id];
              delete rooms[message.room].connections[message.id];
              wss.broadcast(
                message.room,
                JSON.stringify({
                  action: "data",
                  data: rooms[message.room].game,
                }),
              );
            }
          }
          } else if (isMessageType<GetBackInMessage>(message, "get_back_in")) {
            let [room_code, user_id, team] = message.session.split(":");
            if (rooms[room_code]) {
              if (rooms[room_code].game.registeredPlayers[user_id]) {
                console.debug(
                  "user session get_back_in:",
                  room_code,
                  user_id,
                  team,
                );
                // set the new websocket connection
                rooms[room_code].connections[user_id] = ws;
                ws.send(
                  JSON.stringify({
                    action: "get_back_in",
                    room: room_code,
                    game: rooms[room_code].game,
                    id: user_id,
                    player: rooms[room_code].game.registeredPlayers[user_id],
                    team: parseInt(team),
                  }),
                );

                if (Number.isInteger(parseInt(team))) {
                  pingInterval(rooms[room_code], parseInt(user_id), ws);
                }
              }
            }
          } else if (isMessageType<DataMessage>(message, "data")) {
            // copy off what the round used to be for comparison
            if (!message.room || !rooms[message.room]) return;
            const game = rooms[message.room].game;
            const copy_round = game.round;
            const copy_title = game.title;
            if (!message.data) return;
            const { registeredPlayers, ...restData } = message.data;
            const clone = Object.assign(game, restData);
            if (copy_round !== message.data.round || copy_title !== message.data.title) {
              clone.buzzed = [];
              wss.broadcast(message.room, JSON.stringify({ action: "clearbuzzers" }));
            }
            // get the current time to compare when users buzz in
            wss.broadcast(message.room, JSON.stringify({ action: "data", data: clone }));
          } else if (isMessageType<RegisterBuzzMessage>(message, "registerbuzz")) {
            if (!message.room || !message.id || !rooms[message.room]) return;
            const game = rooms[message.room].game;
            try {
              const player = game.registeredPlayers[message.id];
              if (player !== 'host' && typeof player === 'object') {
                player.latencies = [];
                player.team = message.team;
                console.debug("buzzer ready: ", message.id);
                player.start = new Date();
              }
              ws.send(JSON.stringify({ action: "ping", id: message.id }));
              ws.send(JSON.stringify({ action: "registered", id: message.id }));
              wss.broadcast(message.room, JSON.stringify({ action: "data", data: game }));
            } catch (error) {
              let errorString = getErrorMessage(error);
              console.error("Problem in buzzer register ", errorString);
            }
            pingInterval(rooms[message.room], parseInt(message.id), ws);
          } else if (isMessageType<RegisterSpectatorMessage>(message, "registerspectator")) {
            if (!message.room || !message.id || !rooms[message.room]) return;
            const game = rooms[message.room].game;
            try {
              console.debug("spectator ready: ", message.id);
              // get inital latency, client pongs on registered
              ws.send(JSON.stringify({ action: "ping", id: message.id }));
              ws.send(JSON.stringify({ action: "registered", id: message.id }));
              wss.broadcast(message.room, JSON.stringify({ action: "data", data: game }));
            } catch (error) {
              let errorString = getErrorMessage(error);
              console.error("Problem in spectator register ", errorString);
            }
          } else if (isMessageType<PongMessage>(message, "pong")) {
            if (!message.room || !message.id || !rooms[message.room]) return;
            const game = rooms[message.room].game;
            const player = game.registeredPlayers[message.id];
            if (player !== 'host' && typeof player === 'object') {
              const end = new Date();
              if (!player.start || !player.latencies) {
                player.start = new Date();
                player.latencies = [];
                return;
              }
              const latency = end.getTime() - player.start.getTime();
              while (player.latencies.length >= 5) {
                player.latencies.shift();
              }
              player.latencies.push(latency);
              player.latency = average(player.latencies);
            }
          } else if (isMessageType<ClearBuzzersMessage>(message, "clearbuzzers")) {
            if (!message.room || !rooms[message.room]) return;
            const game = rooms[message.room].game;
            game.buzzed = [];
            const roomCode = message.room;
            wss.broadcast(roomCode, JSON.stringify({ action: "data", data: game }));
            wss.broadcast(roomCode, JSON.stringify({ action: "clearbuzzers" }));
          } else if (isMessageType<ChangeLanguageMessage>(message, "change_lang")) {
            if (!message.room || !message.data) return;
            const roomCode = message.room;
            glob(
              `**/*.json`,
              { cwd: `games/${message.data}/` },
              function(err: Error | null, files: string[]) {
                // files is an array of filenames.
                // If the `nonull` option is set, and nothing
                // was found, then files is ["**/*.js"]
                // er is an error object or null.
                if (err) {
                  console.error("change_lang error:", err);
                  return;
                }
                const collator = new Intl.Collator(undefined, {
                  numeric: true,
                  sensitivity: "base",
                });
                wss.broadcast(roomCode, JSON.stringify({
                  action: "change_lang",
                  data: message.data,
                  games: files.sort(collator.compare),
                }));
              },
            );
          } else if (isMessageType<BuzzMessage>(message, "buzz")) {
            if (!message.room || !message.id || !rooms[message.room]) return;
            const game = rooms[message.room].game;
            let time = 0;
            if (game.registeredPlayers[message.id] !== "host") {
              const player = game.registeredPlayers[message.id] as Player;
              time = player.latency ? new Date().getTime() - player.latency : new Date().getTime();
            }
            if (game.buzzed.length === 0) {
              game.buzzed.unshift({ id: message.id, time });
            } else {
              for (let i = 0; i < game.buzzed.length; i++) {
                const b = game.buzzed[i];
                if (b.time < time) {
                  // saved buzzed was quicker than incoming buzz
                  if (i === game.buzzed.length - 1) {
                    game.buzzed.push({ id: message.id, time });
                    break;
                  }
                } else {
                  game.buzzed.splice(i, 0, { id: message.id, time });
                  break;
                }
              }
            }
            ws.send(JSON.stringify({ action: "buzzed" }));
            wss.broadcast(message.room, JSON.stringify({ action: "data", data: game }));
          } else if (isMessageType<LogoUploadMessage>(message, "logo_upload")) {
            if (!message.room || !message.data || !message.mimetype) return;
            const dirpath = `./public/rooms/${message.room}/`;
            try {
              const fileSize = Math.round(message.data.length / 1024);
              if (fileSize > 2098) {
                console.error("Image too large");
                ws.send(
                  JSON.stringify({
                    action: "error",
                    code: ERROR_CODES.IMAGE_TOO_LARGE,
                  }),
                );
                return;
              }
              const buffer = Buffer.from(message.data, 'base64');
              const headerarr = new Uint8Array(buffer).subarray(0, 4);
              let header = "";
              for (let i = 0; i < headerarr.length; i++) {
                header += headerarr[i].toString(16);
              }
              switch (header) {
                case "89504e47":
                case "47494638":
                case "ffd8ffe0":
                case "ffd8ffe1":
                case "ffd8ffe2":
                case "ffd8ffe3":
                case "ffd8ffe8":
                  break;
                default:
                  console.error("Unknown file type in image upload");
                  ws.send(
                    JSON.stringify({
                      action: "error",
                      code: ERROR_CODES.UNKNOWN_FILE_TYPE,
                    }),
                  );
                  return;
              }
              if (!fs.existsSync(dirpath)) {
                fs.mkdirSync(dirpath);
              }
              fs.writeFile(
                dirpath + `logo.${message.mimetype}`,
                message.data,
                "binary",
                (err: NodeJS.ErrnoException | null) => {
                  if (err) {
                    console.error("Error saving logo file", err);
                  }
                },
              );
            } catch (error) {
              let errorString = getErrorMessage(error);
              console.error("Error in logo upload", errorString);
            }
          } else if (isMessageType<LogoUploadMessage>(message, "del_logo_upload")) {
            if (!message.room) return;
            cleanUpPublicRoomAssets(message.room);
          } else {
            // even if not specified we always expect an action
            if (message.action && message.room) {
              wss.broadcast(message.room, JSON.stringify(message));
            } else {
              console.error("didnt expect this message server: ", message);
            }
          }
        } catch (error) {
          let errorString = getErrorMessage(error);
          console.error("Error in processing socket message: ", errorString);
          ws.send(
            JSON.stringify({
              action: "error",
              code: ERROR_CODES.SERVER_ERROR,
              message: errorString
            }),
          );
        }
      });
    });

    res.socket.server.ws = wss;
  }
  res.end();
};

export const config = {
  api: {
    bodyParser: false,
  },
};

export default ioHandler;
