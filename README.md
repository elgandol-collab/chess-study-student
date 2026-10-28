# Chess Study - Student (browser extension)

Student-side client of a private chess coaching platform: shared board with the coach, engine analysis
(Stockfish.js, runs locally), Lichess opening explorer, and voice/video chat.

## License
GPL-3.0-or-later (see LICENSE). It bundles chessground (GPL-3.0-or-later) and Stockfish.js (GPLv3);
see `ext/THIRD_PARTY_NOTICES.txt` for every component.

## Build the Chrome Web Store edition
```
npm ci
npm run build:store        # output: dist/student-store  (load it with chrome://extensions > Load unpacked)
```
The extension has no built-in server address: on first run the user pastes the https:// address their coach
gives them. The relay credentials for voice calls and the Lichess token for the opening explorer are held by
that server and sent to the extension only after the student has logged in; none of them is in this source.

`npm run build` builds the private coach/student editions (set `DEFAULT_URL` in `build-ext.mjs`; the coach
edition needs a matching lesson server).
