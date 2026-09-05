import json
import logging
from typing import List, Dict, Any
from starlette.websockets import WebSocket, WebSocketState

logger = logging.getLogger("dignisafe.websocket")

class WebSocketManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total active: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Total active: {len(self.active_connections)}")

    async def broadcast(self, event_type: str, payload: Dict[str, Any]):
        """Broadcasts a JSON packet to all connected caregiver consoles"""
        message = json.dumps({
            "type": event_type,
            "data": payload
        })
        disconnected = []
        for connection in self.active_connections:
            try:
                if connection.client_state == WebSocketState.CONNECTED:
                    await connection.send_text(message)
                else:
                    disconnected.append(connection)
            except Exception as e:
                logger.warning(f"Failed to send to websocket: {e}")
                disconnected.append(connection)

        for conn in disconnected:
            self.disconnect(conn)

manager = WebSocketManager()
