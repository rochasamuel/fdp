import type { Room } from "@colyseus/sdk";

/**
 * Creating a room already opens a connection. Handing that live room over to
 * the room screen avoids connecting a second time right after navigating.
 */
let pending: Room | null = null;

export function setPendingRoom(room: Room) {
  pending = room;
}

export function takePendingRoom(roomId: string): Room | null {
  const room = pending?.roomId === roomId ? pending : null;
  pending = null;
  return room;
}
