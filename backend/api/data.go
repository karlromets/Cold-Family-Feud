package api

import (
	"encoding/json"
	"fmt"
	"time"
)

func mergeGame(game *game, newData *game) {
	game.Round = newData.Round 
	game.Rounds = newData.Rounds
	game.FinalRound = newData.FinalRound
	game.FinalRound2 = newData.FinalRound2
	game.HideFirstRound = newData.HideFirstRound
	game.IsFinalRound = newData.IsFinalRound
	game.IsFinalSecond = newData.IsFinalSecond
	game.PointTracker = newData.PointTracker
	game.Settings = newData.Settings
	game.Teams = newData.Teams
	game.Title = newData.Title
	game.TitleText = newData.TitleText
	game.RegisteredPlayers = newData.RegisteredPlayers
}

func NewData(client *Client, event *Event) GameError {
	s := store
	room, storeError := s.getRoom(client, event.Room)
	if storeError.code != "" {
		return storeError
	}
	copyRound := room.Game.Round
	newData := game{}
	rawData, err := json.Marshal(event.Data)
	if err != nil {
		return GameError{code: SERVER_ERROR, message: fmt.Sprint(err)}
	}
	err = json.Unmarshal(rawData, &newData)
	if err != nil {
		return GameError{code: SERVER_ERROR, message: fmt.Sprint(err)}
	}

	// If round is changing or title is being set to false (round starting)
	if copyRound != newData.Round || (room.Game.Title && !newData.Title) {
		room.Game.Buzzed = []buzzed{}
		room.Game.RoundStartTime = time.Now().UTC()
		message, err := NewSendClearBuzzers()
		if err != nil {
			return GameError{code: SERVER_ERROR, message: fmt.Sprint(err)}
		}
		room.Hub.broadcast <- message
	}

	mergeGame(room.Game, &newData)
	setTick(client, event)

	message, err := NewSendData(room.Game)
	if err != nil {
		return GameError{code: SERVER_ERROR, message: fmt.Sprint(err)}
	}
	room.Hub.broadcast <- message
	s.writeRoom(event.Room, room)
	return GameError{}
}

func SendUnknown(client *Client, event *Event) GameError {
	s := store
	room, storeError := s.getRoom(client, event.Room)
	if storeError.code != "" {
		return storeError
	}
	message, err := json.Marshal(event)
	if err != nil {
		return GameError{code: SERVER_ERROR, message: fmt.Sprint(err)}
	}
	room.Hub.broadcast <- message
	return GameError{}
}
