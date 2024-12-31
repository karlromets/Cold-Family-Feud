package api

import (
	"fmt"
	"time"
)

func ClearBuzzers(client *Client, event *Event) GameError {
	s := store
	room, storeError := s.getRoom(client, event.Room)
	if storeError.code != "" {
		return storeError
	}
	room.Game.Buzzed = []buzzed{}
	message, err := NewSendData(room.Game)
	if err != nil {
		return GameError{code: SERVER_ERROR, message: fmt.Sprint(err)}
	}
	room.Hub.broadcast <- message
	message, err = NewSendClearBuzzers()
	if err != nil {
		return GameError{code: SERVER_ERROR, message: fmt.Sprint(err)}
	}
	room.Hub.broadcast <- message
	s.writeRoom(room.Game.Room, room)
	return GameError{}
}

func RegisterBuzzer(client *Client, event *Event) GameError {
	s := store
	room, storeError := s.getRoom(client, event.Room)
	if storeError.code != "" {
		return storeError
	}
	player, ok := room.Game.RegisteredPlayers[event.ID]
	if !ok {
		return GameError{code: PLAYER_NOT_FOUND}
	}
	player.Team = event.Team
	player.Start = time.Now()
	message, err := NewSendPing(event.ID)
	if err != nil {
		return GameError{code: SERVER_ERROR, message: fmt.Sprint(err)}
	}
	client.send <- message
	message, err = NewSendRegistered(event.ID)
	if err != nil {
		return GameError{code: SERVER_ERROR, message: fmt.Sprint(err)}
	}
	client.send <- message
	message, err = NewSendData(room.Game)
	if err != nil {
		return GameError{code: SERVER_ERROR, message: fmt.Sprint(err)}
	}
	room.Hub.broadcast <- message
	s.writeRoom(room.Game.Room, room)

	clientPlayer, ok := room.registeredClients[event.ID]
	if !ok {
		return GameError{code: PLAYER_NOT_FOUND}
	}
	// Set up recurring ping loop to get player latency
	clientPlayer.stopPing = make(chan bool)
	go clientPlayer.pingInterval()
	s.writeRoom(room.Game.Room, room)
	return GameError{}
}

func Buzz(client *Client, event *Event) GameError {
	s := store
	room, storeError := s.getRoom(client, event.Room)
	if storeError.code != "" {
		return storeError
	}
	player, ok := room.Game.RegisteredPlayers[event.ID]
	if !ok {
		return GameError{code: PLAYER_NOT_FOUND}
	}

	// Calculate time since round start in milliseconds
	currentTime := time.Now().UTC()
	timeSinceStart := currentTime.Sub(room.Game.RoundStartTime).Milliseconds()
	
	// Account for player's latency
	latencyMilliseconds := time.Duration(player.Latency) * time.Millisecond
	buzzTime := timeSinceStart - latencyMilliseconds.Milliseconds()

	// Ensure buzzTime is never negative
	if buzzTime < 0 {
		buzzTime = 0
	}
	
	if len(room.Game.Buzzed) == 0 {
		room.Game.Buzzed = append(room.Game.Buzzed, buzzed{
			ID:   event.ID,
			Time: buzzTime,
		})
	} else {
		// Find the correct position to insert the new buzz
		inserted := false
		for i, buz := range room.Game.Buzzed {
			if buzzTime < buz.Time {
				// Insert before this buzz since we were faster
				newBuzzed := make([]buzzed, 0, len(room.Game.Buzzed)+1)
				newBuzzed = append(newBuzzed, room.Game.Buzzed[:i]...)
				newBuzzed = append(newBuzzed, buzzed{
					ID:   event.ID,
					Time: buzzTime,
				})
				newBuzzed = append(newBuzzed, room.Game.Buzzed[i:]...)
				room.Game.Buzzed = newBuzzed
				inserted = true
				break
			}
		}
		
		// If we haven't inserted yet, we were the slowest, so append
		if !inserted {
			room.Game.Buzzed = append(room.Game.Buzzed, buzzed{
				ID:   event.ID,
				Time: buzzTime,
			})
		}
	}

	message, err := NewSendBuzzed()
	if err != nil {
		return GameError{code: SERVER_ERROR, message: fmt.Sprint(err)}
	}
	client.send <- message
	message, err = NewSendData(room.Game)
	if err != nil {
		return GameError{code: SERVER_ERROR, message: fmt.Sprint(err)}
	}
	room.Hub.broadcast <- message
	s.writeRoom(event.Room, room)
	return GameError{}
}

func RegisterSpectator(client *Client, event *Event) GameError {
	s := store
	room, storeError := s.getRoom(client, event.Room)
	if storeError.code != "" {
		return storeError
	}
	delete(room.Game.RegisteredPlayers, event.ID)
	message, err := NewSendData(room.Game)
	if err != nil {
		return GameError{code: SERVER_ERROR, message: fmt.Sprint(err)}
	}
	room.Hub.register <- client
	room.Hub.broadcast <- message
	return GameError{}
}
