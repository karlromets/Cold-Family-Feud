import { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Title from "components/title";
import Round from "components/round";
import TeamName from "components/team-name.js";
import QuestionBoard from "components/question-board.js";
import Final from "components/final";
import "tailwindcss/tailwind.css";
import { setCookie, getCookie } from 'cookies-next';
import { ERROR_CODES } from "i18n/errorCodes";
import type { Game } from "@/types/game";
import type {
  WebSocketMessage,
  DataMessage,
  QuitMessage,
  ChangeLanguageMessage,
  MistakeMessage,
  RevealMessage,
  FinalRevealMessage,
  DuplicateMessage,
  FinalSubmitMessage,
  FinalWrongMessage,
  SetTimerMessage,
  StopTimerMessage,
  StartTimerMessage,
  TimerCompleteMessage,
  ClearBuzzersMessage,
  WebSocketAction
} from "@/types/websocket";

// Generic type guard function
function isMessageType<T extends WebSocketMessage>(message: WebSocketMessage, action: WebSocketAction): message is T {
  return message.action === action;
}

let timerInterval: NodeJS.Timeout | null = null;

export default function GamePage() {
  const { i18n, t } = useTranslation();
  const [game, setGame] = useState<Game | null>(null);
  const [timer, setTimer] = useState(0);
  const [error, setErrorVal] = useState("");
  const [showMistake, setShowMistake] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  let refreshCounter = 0;

  function setError(e: string) {
    setErrorVal(e);
    setTimeout(() => {
      setErrorVal("");
    }, 5000);
  }

  useEffect(() => {
    fetch("/api/ws").finally(() => {
      ws.current = new WebSocket(`wss://${window.location.host}/api/ws`);
      ws.current.onopen = function () {
        console.log("game connected to server");
        let session = getCookie("session");
        console.debug(session);
        if (session != null) {
          console.debug("found user session", session);
          ws.current?.send(
            JSON.stringify({ action: "game_window", session: session }),
          );
          setInterval(() => {
            console.debug("sending pong in game window");
            let [room, id] = session.split(":");
            ws.current?.send(
              JSON.stringify({ action: "pong", id: id, room: room }),
            );
          }, 5000);
        }
      };

      ws.current.onmessage = function (evt) {
        const received_msg = evt.data;
        const json = JSON.parse(received_msg) as WebSocketMessage;
        console.debug(json);

        if (isMessageType<DataMessage>(json, "data")) {
          if (json.data.title_text === "Change Me") {
            json.data.title_text = t("Change Me");
          }
          if (json.data.teams[0].name === "Team 1") {
            json.data.teams[0].name = `${t("team")} ${t("number", {
              count: 1,
            })}`;
          }
          if (json.data.teams[1].name === "Team 2") {
            json.data.teams[1].name = `${t("team")} ${t("number", {
              count: 2,
            })}`;
          }
          setGame(json.data);
          const session = getCookie("session") || "";
          const [_, id] = session.split(":");
          if (json.data?.registeredPlayers[id] === "host") {
            setIsHost(true);
          }
        } else if (isMessageType<MistakeMessage>(json, "mistake") || isMessageType<MistakeMessage>(json, "show_mistake")) {
          const audio = new Audio("wrong.mp3");
          audio.play();
          setShowMistake(true);
          setTimeout(() => {
            setShowMistake(false);
          }, 2000);
        } else if (isMessageType<QuitMessage>(json, "quit")) {
          setGame(null);
          window.close();
        } else if (isMessageType<RevealMessage>(json, "reveal")) {
          const audio = new Audio("good-answer.mp3");
          audio.play();
        } else if (isMessageType<FinalRevealMessage>(json, "final_reveal")) {
          const audio = new Audio("fm-answer-reveal.mp3");
          audio.play();
        } else if (isMessageType<DuplicateMessage>(json, "duplicate")) {
          const audio = new Audio("duplicate.mp3");
          audio.play();
        } else if (isMessageType<FinalSubmitMessage>(json, "final_submit")) {
          const audio = new Audio("good-answer.mp3");
          audio.play();
        } else if (isMessageType<FinalWrongMessage>(json, "final_wrong")) {
          const audio = new Audio("try-again.mp3");
          audio.play();
        } else if (isMessageType<SetTimerMessage>(json, "set_timer")) {
          setTimer(json.data);
        } else if (isMessageType<StopTimerMessage>(json, "stop_timer")) {
          if (timerInterval) clearInterval(timerInterval);
        } else if (isMessageType<StartTimerMessage>(json, "start_timer")) {
          timerInterval = setInterval(() => {
            setTimer(prevTimer => {
              if (prevTimer > 0) {
                return prevTimer - 1;
              } else {
                const audio = new Audio("try-again.mp3");
                audio.play();
                if (timerInterval) clearInterval(timerInterval);

                // Send timer stop to admin.js
                try {
                  const session = getCookie("session") || "";
                  const [room, id] = session.split(":");

                  if (!session) {
                    console.error("No session cookie found");
                    return 0;
                  }

                  if (!room || !id) {
                    console.error("Invalid session cookie format");
                    return 0;
                  }

                  ws.current?.send(JSON.stringify({
                    action: "timer_complete",
                    room: room,
                    id: id
                  }));
                } catch (error) {
                  console.error("Error processing session cookie:", error);
                }
                return 0;
              }
            });
          }, 1000);
        } else if (isMessageType<ChangeLanguageMessage>(json, "change_lang")) {
          console.debug("Language Change", json.data);
          i18n.changeLanguage(json.data);
        } else if (isMessageType<TimerCompleteMessage>(json, "timer_complete")) {
          console.debug("Timer complete");
        } else if (isMessageType<ClearBuzzersMessage>(json, "clearbuzzers")) {
          console.debug("Clear buzzers");
        } else {
          console.error("didn't expect", json);
        }
      };

      setInterval(() => {
        if (ws.current?.readyState !== 1) {
          setError(
            t(ERROR_CODES.CONNECTION_LOST, { message: `${10 - refreshCounter}` }),
          );
          refreshCounter++;
          if (refreshCounter >= 5) {
            console.debug("game reload()");
            location.reload();
          }
        } else {
          setError("");
        }
      }, 1000);

      
    });
  }, []);

  if (game?.teams != null) {
    let gameSession;
    if (game.title) {
      gameSession = <Title game={game} />;
    } else if (game.is_final_round) {
      gameSession = (
        <div className="flex w-full justify-center">
          <div className="lg:w-5/6 sm:w-11/12 sm:px-8 md:w-4/6 w-11/12 flex flex-col space-y-6 py-20">
            <Final game={game} timer={timer} />
          </div>
        </div>
      );
    } else {
      gameSession = (
        <div className="flex flex-col space-y-10 py-20 px-10">
          <Round game={game} />
          <QuestionBoard round={game.rounds[game.round]} />
          <div className="flex flex-row justify-around">
            <TeamName game={game} team={0} />
            <TeamName game={game} team={1} />
          </div>
        </div>
      );
    }

    if (typeof window !== "undefined") {
      document.body.className = game?.settings?.theme + " bg-background";
    }
    return (
      <>
        {!isHost ? (
          <div className="w-screen flex flex-col items-end absolute">
            <button
              className="shadow-md rounded-lg m-1 p-2 bg-secondary-500 hover:bg-secondary-200 font-bold uppercase"
              onClick={() => {
                setCookie("session", "");
                window.location.href = "/";
              }}
            >
              {t("quit")}
            </button>
          </div>
        ) : null}
        <div className="min-h-screen absolute w-screen flex flex-col items-center justify-center pointer-events-none">
          <img
            className={`w-4/12 ${showMistake ? "opacity-90" : "opacity-0"} transition-opacity ease-in-out duration-300`}
            src="x.svg"
          />
        </div>
        <div className={`${game?.settings?.theme} min-h-screen`}>
          <div className="">
            {gameSession}
            {error !== "" ? (
              <p className="text-2xl text-failure-700">{error}</p>
            ) : null}
          </div>
        </div>
      </>
    );
  } else {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <p>{t("No game session. retry from the admin window")}</p>
      </div>
    );
  }
}
