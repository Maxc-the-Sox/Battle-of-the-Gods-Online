// Battle of the Gods - Online-Relay-Server
// ------------------------------------------
// Sehr einfacher "dumb relay": jeder Client spielt die komplette Spiellogik
// selbst (genau wie im Einzelspieler-Modus) und schickt nach jeder Aktion des
// aktiven Spielers den kompletten Spielzustand als JSON an diesen Server.
// Der Server kennt die Spielregeln nicht - er merkt sich nur, wer in welchem
// "Raum" sitzt, und reicht Nachrichten an alle anderen Mitglieder des Raums
// weiter. Das genuegt fuer ein kleines Freundes-Spiel vollstaendig.
//
// Start lokal:   npm install && npm start
// Deployment:    siehe README.md (Render.com, kostenlos)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// ---------------------------------------------------------------------------
// Statischer Datei-Server (kein Express noetig, damit der Server so schlank
// wie moeglich bleibt)
// ---------------------------------------------------------------------------
function serveStatic(req, res) {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/') reqPath = '/index.html';

    const filePath = path.normalize(path.join(PUBLIC_DIR, reqPath));
    // Traversal-Schutz: die aufgeloeste Datei muss innerhalb von PUBLIC_DIR liegen.
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Nicht gefunden');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        // Kein Caching im Browser - sonst sieht man nach einem Update (neuer Deploy) im
        // schlimmsten Fall noch tagelang die alte Version, weil kein Refresh das merkt.
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
        res.end(data);
    });
}

const server = http.createServer(serveStatic);

// ---------------------------------------------------------------------------
// WebSocket-Raeume
// ---------------------------------------------------------------------------
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne I/O/0/1 (Verwechslungsgefahr)
const rooms = new Map(); // code -> { members: Map<clientId, {ws, name, color}>, hostId, latestState, emptyAt }

function makeRoomCode() {
    let code;
    do {
        code = Array.from({ length: 4 }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join('');
    } while (rooms.has(code));
    return code;
}

function getOrCreateRoom(requestedCode, hostClientId) {
    let code = (requestedCode || '').toUpperCase().trim();
    if (code && rooms.has(code)) return { code, room: rooms.get(code) };
    if (!code) code = makeRoomCode();
    const room = { members: new Map(), hostId: hostClientId, latestState: null, emptyAt: null };
    rooms.set(code, room);
    return { code, room };
}

function lobbyPayload(code, room) {
    return {
        type: 'lobby',
        room: code,
        hostId: room.hostId,
        started: !!room.latestState,
        members: Array.from(room.members.entries()).map(([clientId, m]) => ({ clientId, name: m.name, color: m.color }))
    };
}

function broadcastLobby(code, room) {
    const payload = JSON.stringify(lobbyPayload(code, room));
    room.members.forEach(m => safeSend(m.ws, payload));
}

function safeSend(ws, data) {
    if (ws && ws.readyState === ws.OPEN) {
        try { ws.send(data); } catch (e) { /* Verbindung tot, ignorieren */ }
    }
}

function sanitizeName(name) {
    if (typeof name !== 'string') return 'Spieler';
    const trimmed = name.trim().slice(0, 24);
    return trimmed || 'Spieler';
}

function sanitizeChatText(text) {
    if (typeof text !== 'string') return '';
    return text.trim().slice(0, 300);
}

function sanitizeColor(color) {
    if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) return color;
    return '#d4af37';
}

// Muss dieselbe Palette sein wie PLAYER_COLORS im Client (public/index.html).
const PLAYER_COLORS = ["#ff4757", "#2e86de", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22"];

// Verhindert, dass zwei Spieler (z.B. durch gleichzeitiges Klicken) dieselbe Farbe bekommen -
// der Client blockt das zwar schon visuell, aber das hier ist die verbindliche, serverseitige
// Absicherung gegen die seltene Race Condition.
function resolveColor(room, clientId, requestedColor) {
    const takenByOthers = new Set(Array.from(room.members.entries()).filter(([id]) => id !== clientId).map(([, m]) => m.color));
    if (!takenByOthers.has(requestedColor)) return requestedColor;
    const free = PLAYER_COLORS.find(c => !takenByOthers.has(c));
    return free || requestedColor; // alle 6 vergeben (>6 Spieler) - dann eben doppelt
}

const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', raw => {
        let msg;
        try { msg = JSON.parse(raw); } catch (e) { return; }
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'join') {
            const clientId = String(msg.clientId || '').slice(0, 64);
            if (!clientId) return;
            const name = sanitizeName(msg.name);
            let color = sanitizeColor(msg.color);

            const { code, room } = getOrCreateRoom(msg.room, clientId);
            color = resolveColor(room, clientId, color);

            // Falls dieser Client (gleiche persistente ID) schon mit einer alten
            // Verbindung im Raum war (z.B. Seite neu geladen), die alte sauber ersetzen.
            const existing = room.members.get(clientId);
            if (existing && existing.ws !== ws && existing.ws.readyState === existing.ws.OPEN) {
                try { existing.ws.close(); } catch (e) {}
            }

            room.members.set(clientId, { ws, name, color });
            room.emptyAt = null;
            ws.roomCode = code;
            ws.clientId = clientId;

            safeSend(ws, JSON.stringify({ type: 'joined', room: code, clientId, hostId: room.hostId }));
            if (room.latestState) {
                safeSend(ws, JSON.stringify({ type: 'state', state: room.latestState }));
            }
            broadcastLobby(code, room);
            return;
        }

        if (msg.type === 'state') {
            const code = ws.roomCode;
            if (!code || !rooms.has(code)) return;
            const room = rooms.get(code);
            if (!ws.clientId || !room.members.has(ws.clientId)) return;
            room.latestState = msg.state;
            const payload = JSON.stringify({ type: 'state', state: msg.state });
            room.members.forEach((m, clientId) => { if (clientId !== ws.clientId) safeSend(m.ws, payload); });
            return;
        }

        if (msg.type === 'chat') {
            const code = ws.roomCode;
            if (!code || !rooms.has(code)) return;
            const room = rooms.get(code);
            const member = room.members.get(ws.clientId);
            if (!member) return; // nicht (mehr) im Raum - Nachricht verwerfen
            const text = sanitizeChatText(msg.text);
            if (!text) return;
            // Name/Farbe kommen bewusst vom Server (aus der Mitgliederliste), nicht vom Client -
            // so kann sich niemand als jemand anderes ausgeben.
            const payload = JSON.stringify({ type: 'chat', clientId: ws.clientId, name: member.name, color: member.color, text });
            room.members.forEach((m, clientId) => { if (clientId !== ws.clientId) safeSend(m.ws, payload); });
            return;
        }

        if (msg.type === 'leave') {
            handleDisconnect(ws);
        }
    });

    ws.on('close', () => handleDisconnect(ws));
    ws.on('error', () => {});
});

function handleDisconnect(ws) {
    const code = ws.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    const member = room.members.get(ws.clientId);
    // Nur entfernen, wenn es wirklich noch diese (nicht laengst ersetzte) Verbindung ist.
    if (member && member.ws === ws) {
        room.members.delete(ws.clientId);
        if (room.hostId === ws.clientId) {
            const next = room.members.keys().next();
            room.hostId = next.done ? null : next.value;
        }
        if (room.members.size === 0) {
            room.emptyAt = Date.now();
        } else {
            broadcastLobby(code, room);
            // Nur waehrend eines schon laufenden Spiels benachrichtigen (room.latestState existiert erst
            // ab dem ersten Spielstand-Broadcast) - vorher, im reinen Lobby-Warten, ist ein Beitritts-/
            // Verlassen-Wechsel normal und braucht keine Extra-Meldung im (noch gar nicht existierenden) Verlauf.
            if (room.latestState) {
                const payload = JSON.stringify({ type: 'player_left', name: member.name });
                room.members.forEach(m => safeSend(m.ws, payload));
            }
        }
    }
}

// Tote Verbindungen erkennen (z.B. Laptop zugeklappt, Netzwerk weg)
const heartbeat = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        try { ws.ping(); } catch (e) {}
    });
}, 30000);

// Leere Raeume nach 30 Minuten aufraeumen, damit der Speicher nicht waechst
setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
        if (room.members.size === 0 && room.emptyAt && now - room.emptyAt > 30 * 60 * 1000) {
            rooms.delete(code);
        }
    }
}, 10 * 60 * 1000);

server.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
    console.log(`Battle of the Gods Server laeuft auf Port ${PORT}`);
});
