# Battle of the Gods – Online-Modus

Dieses Paket macht aus "Battle of the Gods" ein Spiel, das du mit Freunden **live im selben Spiel** spielen kannst –
ganz ohne dass jemand einen Account braucht oder etwas installieren muss. Nur **du** musst den kleinen Server
einmalig (kostenlos) hosten. Deine Freunde öffnen danach einfach einen Link im Browser.

## Wie es funktioniert

- `server.js` ist ein winziger "Durchreich-Server": Er kennt die Spielregeln gar nicht, sondern reicht nur
  Nachrichten zwischen den Spielern in einem gemeinsamen "Raum" (Raum-Code aus 4 Zeichen) weiter.
- Das eigentliche Spiel (`public/index.html`) läuft komplett im Browser jedes Spielers – genau wie die
  Einzelspieler-Version, nur dass nach jeder Aktion des aktiven Spielers der neue Spielstand an alle anderen
  im Raum geschickt wird.
- Wichtig: Dieses Paket muss **von deinem eigenen Server ausgeliefert werden** (siehe unten). Der bisherige
  `claude.ai`-Link funktioniert weiterhin für Solo-/Hotseat-Spiele, aber **nicht** für den Online-Modus – Claude
  Artefakte dürfen aus Sicherheitsgründen keine beliebigen Server im Internet ansprechen. Sobald du den Server
  unten deployed hast, hast du einen neuen Link, der **beides** kann (lokal *und* online).

## Deployment auf Render.com (kostenlos, keine Kreditkarte nötig)

Render bietet einen kostenlosen Web-Service-Tarif, der WebSockets unterstützt (wichtig für den Online-Modus).
Einziger Nachteil: Der Server "schläft" nach 15 Minuten ohne Zugriff ein und braucht dann beim nächsten
Aufruf ca. 1 Minute zum Aufwachen – für ein Spiel mit Freunden völlig unproblematisch.

### Schritt 1: Code auf GitHub hochladen

1. Erstelle einen kostenlosen Account auf [github.com](https://github.com), falls du noch keinen hast.
2. Klicke auf **"New repository"**, gib ihm einen Namen (z.B. `battle-of-the-gods`) und erstelle es (öffentlich
   oder privat, beides funktioniert).
3. Lade auf der Repository-Seite über **"uploading an existing file"** die Dateien aus diesem Paket hoch:
   - `server.js`
   - `package.json`
   - den kompletten Ordner `public/` (mit `index.html`, `map.json`, `bg.jpg`)
4. Commit/Speichern klicken.

*(Falls du dich mit Git auskennst, geht das natürlich auch per `git push` – das Ergebnis ist dasselbe.)*

### Schritt 2: Render mit dem Repository verbinden

1. Erstelle einen kostenlosen Account auf [render.com](https://render.com) (Anmeldung mit GitHub geht am
   schnellsten).
2. Klicke im Dashboard auf **"New +"** → **"Web Service"**.
3. Wähle als Quelle dein GitHub-Repository aus (Render fragt einmalig nach Zugriff auf deine Repos).
4. Trage folgende Einstellungen ein:
   - **Name**: z.B. `battle-of-the-gods` (erscheint später in der URL)
   - **Region**: nächstgelegene Region (z.B. Frankfurt)
   - **Branch**: `main`
   - **Language/Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: **Free** auswählen
5. Klicke auf **"Create Web Service"**.

Render baut jetzt den Server (dauert 1-3 Minuten). Am Ende bekommst du eine URL wie:

```
https://battle-of-the-gods-xxxx.onrender.com
```

Das ist ab jetzt **der Link für dein Spiel** – für dich und deine Freunde.

### Schritt 3: Spielen

1. Öffne den Render-Link selbst und klicke auf **"🌐 Online spielen"**.
2. Gib deinen Namen ein, wähle eine Farbe, lass das Raum-Code-Feld leer (das erstellt einen neuen Raum) und
   klicke **"Verbinden"**.
3. Du bekommst einen 4-stelligen Raum-Code und einen fertigen Link zum Teilen (Kopieren-Button vorhanden).
4. Schicke den Code oder Link an deine Freunde (z.B. per WhatsApp/Discord). Sie öffnen einfach den Link –
   der Raum-Code ist dann schon vorausgefüllt – geben ihren Namen ein und klicken ebenfalls "Verbinden".
5. Sobald mindestens 2 Spieler im Raum sind, kannst du (als Host, an "HOST" erkennbar) unten die
   Ziel-Artefakte/Ring-Einstellungen anpassen und auf **"⚔ Spiel starten"** klicken.
6. Ab da läuft das Spiel für alle live mit – reihum kann immer nur der aktive Spieler klicken, alle anderen
   sehen live mit, wie sich das Spielfeld verändert.

**Falls jemand die Seite versehentlich neu lädt oder die Verbindung kurz abbricht**: einfach den Link erneut
öffnen und mit demselben Namen erneut "Verbinden" klicken – das Spiel läuft an der Stelle weiter, an der es
war.

## Alternativen zu Render

Falls Render für dich nicht passt, funktioniert `server.js` unverändert auch auf jedem anderen Anbieter, der
Node.js-Apps mit WebSocket-Unterstützung hostet (z.B. Railway.app oder Fly.io). Diese verlangen aktuell aber
teils eine Kreditkarte zur Verifizierung, auch wenn am Ende nichts berechnet wird – deshalb ist Render für
den Einstieg die unkomplizierteste, wirklich kostenlose Option.

## Lokal testen (optional, für Technik-interessierte)

```bash
npm install
npm start
```

Der Server läuft dann auf `http://localhost:3000`.
