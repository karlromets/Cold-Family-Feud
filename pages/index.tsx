import { useState, useEffect, useRef } from "react";
import Head from "next/head";
import "tailwindcss/tailwind.css";
import { useTranslation } from "react-i18next";
import "@/i18n/i18n";
import Admin from "@/components/admin";
import Buzzer from "@/components/buzzer";
import Login from "@/components/login";
import Footer from "@/components/Login/footer"
import { setCookie, getCookie } from 'cookies-next';
import { ERROR_CODES } from "i18n/errorCodes";
import { Game } from "@/types/game";
import { ErrorMessage, GetBackInMessage, GetBackInResponse, HostRoomResponse, JoinRoomResponse, QuitMessage, WebSocketAction, WebSocketMessage, WebSocketResponse } from "@/types/websocket";

export default function Home() {
  const { t } = useTranslation();
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setErrorVal] = useState("");
  const [registeredRoomCode, setRegisteredRoomCode] = useState<string | null>(null);
  const [host, setHost] = useState(false);
  const [game, setGame] = useState<Game | null>(null);
  const [team, setTeam] = useState<number | null>(null);
  const [playerID, setPlayerID] = useState<string | null>(null);

  const ws = useRef<WebSocket | null>(null);

  const isResponseType = <T extends WebSocketResponse>(
    message: Partial<WebSocketResponse>,
    action: WebSocketAction
  ): message is T => {
    return message.action === action;
  };

  const isMessageType = <T extends WebSocketMessage>(
    message: Partial<WebSocketMessage>,
    action: WebSocketAction
  ): message is T => {
    return message.action === action;
  };

  function setError(e: string) {
    setErrorVal(e);
    setTimeout(() => {
      setErrorVal("");
    }, 5000);
  }
  /**
   * send quit message to server
   * server cleans up data on backend then
   * tells client to clean up
   */
  function quitGame(host = false) {
    ws.current?.send(
      JSON.stringify({
        action: "quit",
        host: host,
        id: playerID,
        room: registeredRoomCode,
      })
    );
  }

  /**
   * put initalization logic inside send method
   * this is make sure the websocket connection
   * doesn't stay idleing while a player is sitting
   * on the main page
   */
  function send(message: string) {
    console.debug("send", ws);
    if (ws.current?.readyState !== 1 || !ws.current) {
      console.debug("connecting to server... new connection");
      fetch("/api/ws").then(() => {
        ws.current = new WebSocket(`wss://${window.location.host}/api/ws`);
        ws.current.onopen = function () {
          console.debug("game connected to server", ws.current);

          if (ws.current) {
            ws.current.onmessage = function (evt) {
              const received_msg = evt.data;
              const json = JSON.parse(received_msg);

              if (isResponseType<HostRoomResponse>(json, "host_room")) {
                console.debug("registering room with host", json.room);
                setPlayerID(json.id);
                setHost(true);
                setRegisteredRoomCode(json.room);
                setGame(json.game);
                setCookie('session', `${json.room}:${json.id}`);
              } else if (isResponseType<JoinRoomResponse>(json, "join_room")) {
                console.debug("Joining room : ", json);
                setPlayerID(json.id);
                setRegisteredRoomCode(json.room);
                setGame(json.game);
                if (Number.isInteger(json.team) && json.team !== undefined) {
                  setTeam(json.team);
                }
              } else if (isMessageType<QuitMessage>(json, "quit")) {
                console.debug("player quit");
                setPlayerID(null);
                setRegisteredRoomCode(null);
                setCookie("session", "");
                setGame(null);
                setHost(false);
              } else if (isResponseType<GetBackInResponse>(json, "get_back_in")) {
                console.debug("Getting back into room", json);
                if (json.player === "host") {
                  setHost(true);
                }
                if (Number.isInteger(json.team) && json.team !== undefined) {
                  setTeam(json.team);
                }
                setPlayerID(json.id);
                setRegisteredRoomCode(json.room);
                setGame(json.game);
              } else if (isMessageType<ErrorMessage>(json, "error")) {
                console.error(json.code);
                setError(t(json.code, { message: json.message }));
              } else {
                console.debug("did not expect in index.js: ", json);
              }
            };
            ws.current.onerror = function (e: Event) {
              console.error(e);
            };

          }

          ws.current?.send(message);
        };
      });
    } else {
      console.debug("send", message);
      ws.current.send(message);
    }
  }

  /**
   * on page refresh check for existing session
   * if it exists then tell the server to send back
   * the game object
   */
  useEffect(() => {
    let session = getCookie("session");
    console.debug("user session", session);
    if (session != "" && session != null) {
      send(JSON.stringify({ action: "get_back_in", session: session }));
    }
  }, []);

  function hostRoom() {
    send(
      JSON.stringify({
        action: "host_room",
      })
    );
  }

  /**
   * tell server to join a game
   * do some validation on inputs
   */
  function joinRoom() {
    console.debug(`ws.current `, ws);
    setError("");
    let roomcode = (document.getElementById("roomcode") as HTMLInputElement).value;
    if (roomcode.length === 4) {
      let playername = (document.getElementById("playername") as HTMLInputElement).value;
      if (playername.length > 0) {
        console.debug(`roomcode: ${roomcode}, playername ${playername}`);
        send(
          JSON.stringify({
            action: "join_room",
            room: roomcode,
            name: playername,
          })
        );
      } else {
        setError(t(ERROR_CODES.MISSING_INPUT, { message: t("name") }));
      }
    } else {
      setError(t("room code is not correct length, should be 4 characters"));
    }
  }

  console.debug(`game: ${game}`);

  // control what to render based on if the player is hosting
  function getPage() {
    if (registeredRoomCode !== null && host && game != null) {
      return (
        <div className="lg:flex lg:flex-row lg:justify-center w-full">
          <div className="lg:w-3/4 sm:w-full md:w-full">
            <Admin
              ws={ws}
              game={game}
              id={playerID}
              setGame={setGame}
              room={registeredRoomCode}
              quitGame={quitGame}
            />
          </div>
        </div>
      );
    } else if (registeredRoomCode !== null && !host && game != null) {
      return (
        <div className="flex w-full justify-center">
          <div className="lg:w-1/2 sm:w-10/12 md:w-3/4 w-11/12 flex flex-col space-y-3 pt-5">
            <Buzzer
              ws={ws}
              game={game}
              id={playerID}
              setGame={setGame}
              room={registeredRoomCode}
              quitGame={quitGame}
              setTeam={setTeam}
              team={team}
            />
          </div>
        </div>
      );
    } else {
      return (
        <div className="flex w-full justify-center">
          <div className="lg:w-1/2 sm:w-10/12 sm:px-8 md:w-3/4 w-10/12 flex flex-col space-y-6 pt-5">
            <Login
              setRoomCode={setRoomCode}
              roomCode={roomCode}
              setPlayerName={setPlayerName}
              playerName={playerName}
              joinRoom={joinRoom}
              hostRoom={hostRoom}
              error={error}
            />
          </div>
          <Footer />
        </div>
      );
    }
  }

  if (typeof window !== "undefined") {
    document.body.className = game?.settings?.theme + " bg-background";
  }
  return (
    <>
      <Head>
        <title>{t("Family Feud")}</title>
        <link rel="icon" href="x.png"></link>
        <meta name="author" content="Joshua Cold" />
        <meta
          name="description"
          content="Free to play open source family feud game. Host your own custom created family feud games with built in online buzzers, timers and admin controls. Visit https://github.com/joshzcold/Cold-Family-Feud to check out the source code and contribute."
        />
        <link
          rel="preload"
          href="/fonts/C059/c059-bold.otf"
          as="font"
          crossOrigin=""
        />
      </Head>
      <main>
        <div
          style={{
            width: "100vh",
          }}
          className={`${game?.settings?.theme} h-screen w-screen`}
        >
          {/* TODO put in the theme switcher and put setting here */}
          {getPage()}
        </div>
      </main>
    </>
  );
}
