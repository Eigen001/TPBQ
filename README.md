TPBQ (Tiny Planets Built Quick) v1.0: paint tiny planets to order against the clock. Story mode (15-level roguelike run, store, HQ) and Arcade mode.
Open: upload this whole folder to the repo root (keep the `js/` folder), enable GitHub Pages, open the Pages URL on the phone. No build step, no network needed after load.
Home screen: in iPhone Safari tap Share, then Add to Home Screen.
Files: `index.html` (markup + CSS), `js/logic.js` (pure rules), `js/audio.js` (music + sfx), `js/art.js` (textures, aliens, solar system), `js/ui.js` (screens, input, settings), `logic.test.mjs`, `README.md`.
Tests: `node logic.test.mjs` (pure logic, no browser). Settings has every tunable number plus DEV TOOLS at the bottom.
