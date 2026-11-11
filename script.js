'use strict';

/* ==========================================================================
   KONFIGURATION – hier kannst du Schwierigkeit und Tempo anpassen
   ========================================================================== */
const CONFIG = {
  // --- Bot ---
  botDelayMs: 500,        // Bedenkzeit des Bots in Millisekunden

  // Leicht: spielt fast zufällig und übersieht oft Siege und Drohungen
  easyWinChance: 0.5,     // Chance, einen möglichen Sieg auch zu nutzen
  easyBlockChance: 0.15,  // Chance, eine Drohung des Gegners zu blocken

  // Mittel: schaut ein paar Züge voraus, macht aber gelegentlich Fehler
  mediumSearchDepth: 3,   // Suchtiefe (Züge im Voraus)
  mediumBlockChance: 0.9, // Chance, eine direkte Drohung zu blocken
  mediumMistakeChance: 0.15, // Chance auf einen zufälligen Zug statt des besten

  // Schwer: sucht tief und macht keine Fehler
  hardSearchDepth: 6,     // 5-6 empfohlen, höher = stärker, aber langsamer

  // --- Animation ---
  animationSpeed: 1,      // 1 = normal, 2 = doppelt so schnell, 0.5 = halb so schnell
  fallBaseMs: 240,        // Grunddauer eines Falls
  fallPerRowMs: 70,       // Zusatzdauer pro Reihe Fallhöhe (längerer Weg = längere Animation)
};

const DIFFICULTY_LABELS = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };
const DIFFICULTY_HINTS = {
  easy:   'Spielt meist zufällig und übersieht oft deine Drohungen. Perfekt zum Üben.',
  medium: 'Denkt ein paar Züge voraus, patzt aber ab und zu. Fair und schlagbar.',
  hard:   'Rechnet sehr weit voraus und macht keine Fehler. Viel Glück!',
};

/* ==========================================================================
   TEIL 1: SPIELLOGIK
   Reine Funktionen ohne DOM-Zugriff: Brettzustand, Gewinnprüfung, Bot.
   Brett: board[reihe][spalte], Reihe 0 = oben, Reihe 5 = unten.
   ========================================================================== */
const ROWS = 6;
const COLS = 7;
const EMPTY = 0;
const RED = 1;
const YELLOW = 2;
const WIN_LENGTH = 4;

// Richtungen: waagerecht, senkrecht, diagonal ↘, diagonal ↗
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

// Spalten von der Mitte nach außen (Mitte ist strategisch am wertvollsten)
const COLUMN_ORDER = [...Array(COLS).keys()]
  .sort((a, b) => Math.abs(a - (COLS - 1) / 2) - Math.abs(b - (COLS - 1) / 2));

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(EMPTY));
}

function cloneBoard(board) {
  return board.map(row => row.slice());
}

function otherPlayer(player) {
  return player === RED ? YELLOW : RED;
}

function isInsideBoard(row, col) {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

/** Unterste freie Reihe einer Spalte, oder -1 wenn die Spalte voll ist. */
function getLowestFreeRow(board, col) {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === EMPTY) return row;
  }
  return -1;
}

function isColumnFull(board, col) {
  return board[0][col] !== EMPTY;
}

function getValidColumns(board) {
  return COLUMN_ORDER.filter(col => !isColumnFull(board, col));
}

function isBoardFull(board) {
  return getValidColumns(board).length === 0;
}

/** Zählt gleichfarbige Steine ab (row,col) in eine Richtung (ohne das Startfeld). */
function countInDirection(board, row, col, dRow, dCol, player) {
  let count = 0;
  let r = row + dRow;
  let c = col + dCol;
  while (isInsideBoard(r, c) && board[r][c] === player) {
    count++;
    r += dRow;
    c += dCol;
  }
  return count;
}

/** Schnelle Prüfung: Hat der Stein auf (row,col) eine Viererreihe gebildet? */
function isWinningMove(board, row, col) {
  const player = board[row][col];
  if (player === EMPTY) return false;
  return DIRECTIONS.some(([dRow, dCol]) => {
    const length = 1
      + countInDirection(board, row, col, dRow, dCol, player)
      + countInDirection(board, row, col, -dRow, -dCol, player);
    return length >= WIN_LENGTH;
  });
}

/** Alle Felder (als [reihe, spalte]) der Gewinnreihe(n) durch den Stein auf (row,col). */
function getWinningCells(board, row, col) {
  const player = board[row][col];
  const cells = new Map();
  if (player === EMPTY) return [];

  for (const [dRow, dCol] of DIRECTIONS) {
    const forward = countInDirection(board, row, col, dRow, dCol, player);
    const backward = countInDirection(board, row, col, -dRow, -dCol, player);
    if (forward + backward + 1 >= WIN_LENGTH) {
      for (let i = -backward; i <= forward; i++) {
        const r = row + i * dRow;
        const c = col + i * dCol;
        cells.set(`${r},${c}`, [r, c]);
      }
    }
  }
  return [...cells.values()];
}

/* ---------- Bot: Hilfsfunktionen ---------- */

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** Gibt eine Spalte zurück, in der `player` sofort gewinnen würde (oder null). */
function findImmediateWin(board, player) {
  for (const col of getValidColumns(board)) {
    const row = getLowestFreeRow(board, col);
    board[row][col] = player;
    const wins = isWinningMove(board, row, col);
    board[row][col] = EMPTY;
    if (wins) return col;
  }
  return null;
}

/** Würde ein Zug in `col` dem Gegner direkt darüber einen Sieg ermöglichen? */
function givesOpponentWin(board, col, player) {
  const row = getLowestFreeRow(board, col);
  if (row <= 0) return false; // Spalte wird voll – kein Feld darüber
  board[row][col] = player;
  board[row - 1][col] = otherPlayer(player);
  const opponentWins = isWinningMove(board, row - 1, col);
  board[row - 1][col] = EMPTY;
  board[row][col] = EMPTY;
  return opponentWins;
}

/* ---------- Bot: Leicht ---------- */
function chooseEasyMove(board, bot) {
  const winningCol = findImmediateWin(board, bot);
  if (winningCol !== null && Math.random() < CONFIG.easyWinChance) return winningCol;

  const blockingCol = findImmediateWin(board, otherPlayer(bot));
  if (blockingCol !== null && Math.random() < CONFIG.easyBlockChance) return blockingCol;

  return randomItem(getValidColumns(board)); // sonst einfach irgendwohin
}

/* ---------- Bot: Mittel ---------- */
function chooseMediumMove(board, bot) {
  const candidates = getValidColumns(board);

  const winningCol = findImmediateWin(board, bot);
  if (winningCol !== null) return winningCol;

  const blockingCol = findImmediateWin(board, otherPlayer(bot));
  if (blockingCol !== null) {
    // gelegentlich übersieht der Bot die Drohung
    return Math.random() < CONFIG.mediumBlockChance ? blockingCol : randomItem(candidates);
  }

  if (Math.random() < CONFIG.mediumMistakeChance) {
    const safe = candidates.filter(col => !givesOpponentWin(board, col, bot));
    return randomItem(safe.length > 0 ? safe : candidates);
  }
  return chooseMinimaxMove(board, bot, CONFIG.mediumSearchDepth);
}

/* ---------- Bot: Schwer (Minimax mit Alpha-Beta-Pruning) ---------- */
const WIN_SCORE = 1000000;

/** Bewertet ein 4er-Fenster aus Sicht des Bots. */
function scoreWindow(botCount, oppCount, emptyCount) {
  if (botCount > 0 && oppCount > 0) return 0; // gemischtes Fenster ist wertlos
  if (botCount === 3 && emptyCount === 1) return 50;
  if (botCount === 2 && emptyCount === 2) return 10;
  if (oppCount === 3 && emptyCount === 1) return -60;
  if (oppCount === 2 && emptyCount === 2) return -8;
  return 0;
}

/** Heuristik: Mittelspalte + alle möglichen Viererfenster. */
function evaluateBoard(board, bot, opp) {
  let score = 0;
  const centerCol = Math.floor(COLS / 2);

  for (let row = 0; row < ROWS; row++) {
    if (board[row][centerCol] === bot) score += 6;
    else if (board[row][centerCol] === opp) score -= 6;
  }

  for (const [dRow, dCol] of DIRECTIONS) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const endRow = row + (WIN_LENGTH - 1) * dRow;
        const endCol = col + (WIN_LENGTH - 1) * dCol;
        if (!isInsideBoard(endRow, endCol)) continue;

        let botCount = 0, oppCount = 0, emptyCount = 0;
        for (let i = 0; i < WIN_LENGTH; i++) {
          const cell = board[row + i * dRow][col + i * dCol];
          if (cell === bot) botCount++;
          else if (cell === opp) oppCount++;
          else emptyCount++;
        }
        score += scoreWindow(botCount, oppCount, emptyCount);
      }
    }
  }
  return score;
}

function minimax(board, depth, alpha, beta, isMaximizing, bot, opp) {
  const columns = getValidColumns(board);
  if (columns.length === 0) return 0;              // Unentschieden
  if (depth === 0) return evaluateBoard(board, bot, opp);

  const player = isMaximizing ? bot : opp;
  let best = isMaximizing ? -Infinity : Infinity;

  for (const col of columns) {
    const row = getLowestFreeRow(board, col);
    board[row][col] = player;

    let score;
    if (isWinningMove(board, row, col)) {
      // Je mehr Resttiefe, desto früher der Sieg → höherer Betrag
      score = (isMaximizing ? 1 : -1) * (WIN_SCORE + depth);
    } else {
      score = minimax(board, depth - 1, alpha, beta, !isMaximizing, bot, opp);
    }
    board[row][col] = EMPTY;

    if (isMaximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, best);
    }
    if (alpha >= beta) break; // Alpha-Beta-Abschneidung
  }
  return best;
}

function chooseHardMove(board, bot) {
  return chooseMinimaxMove(board, bot, CONFIG.hardSearchDepth);
}

/** Wählt per Minimax den besten Zug mit gegebener Suchtiefe (bei Gleichstand zufällig). */
function chooseMinimaxMove(board, bot, depth) {
  const opp = otherPlayer(bot);
  let bestScore = -Infinity;
  let bestColumns = [];

  for (const col of getValidColumns(board)) {
    const row = getLowestFreeRow(board, col);
    board[row][col] = bot;
    const score = isWinningMove(board, row, col)
      ? WIN_SCORE + depth
      : minimax(board, depth - 1, -Infinity, Infinity, false, bot, opp);
    board[row][col] = EMPTY;

    if (score > bestScore) {
      bestScore = score;
      bestColumns = [col];
    } else if (score === bestScore) {
      bestColumns.push(col);
    }
  }
  return randomItem(bestColumns); // bei Gleichstand zufällig, damit Partien variieren
}

/** Einstiegspunkt für den Bot. Arbeitet auf einer Kopie, das Spielbrett bleibt unberührt. */
function chooseBotMove(board, bot, difficulty) {
  const copy = cloneBoard(board);
  switch (difficulty) {
    case 'easy':   return chooseEasyMove(copy, bot);
    case 'hard':   return chooseHardMove(copy, bot);
    default:       return chooseMediumMove(copy, bot);
  }
}

/* ==========================================================================
   TEIL 2: DARSTELLUNG & SPIELABLAUF (DOM, Animation, Eingaben)
   ========================================================================== */
const dom = {
  menuScreen: document.getElementById('menuScreen'),
  menuMain: document.getElementById('menuMain'),
  menuBot: document.getElementById('menuBot'),
  btnModeBot: document.getElementById('btnModeBot'),
  btnModeLocal: document.getElementById('btnModeLocal'),
  btnStartBot: document.getElementById('btnStartBot'),
  btnBotBack: document.getElementById('btnBotBack'),
  difficultyHint: document.getElementById('difficultyHint'),
  gameScreen: document.getElementById('gameScreen'),
  scoreCards: document.querySelectorAll('.score-card'),
  status: document.getElementById('status'),
  boardArea: document.getElementById('boardArea'),
  previewDisc: document.getElementById('previewDisc'),
  discsLayer: document.getElementById('discsLayer'),
  highlightLayer: document.getElementById('highlightLayer'),
  columns: document.getElementById('columns'),
  btnNewGame: document.getElementById('btnNewGame'),
  btnMenu: document.getElementById('btnMenu'),
  announcer: document.getElementById('announcer'),
};

const state = {
  mode: null,            // 'bot' oder 'local'
  difficulty: 'medium',
  humanPlayer: RED,      // im Bot-Modus ist der Mensch immer Rot, der Bot Gelb
  botPlayer: YELLOW,
  starter: RED,
  board: createEmptyBoard(),
  currentPlayer: RED,
  gameOver: false,
  inputLocked: false,    // true während Animation und Bot-Zug
  roundId: 0,            // verhindert, dass veraltete Timer/Animationen eine neue Runde stören
  botTimer: null,
  hoverCol: null,        // Spalte unter der Maus
  focusCol: null,        // Spalte mit Tastaturfokus
  lastPointerType: 'mouse',
  discElements: [],      // discElements[reihe][spalte] → DOM-Element
};

// Siegzähler pro Modus; bleiben bis zum Neuladen der Seite erhalten
const scores = {
  bot:   { [RED]: 0, [YELLOW]: 0 },
  local: { [RED]: 0, [YELLOW]: 0 },
};

/* ---------- Texte & Hilfsfunktionen ---------- */

function colorClass(player) {
  return player === RED ? 'is-red' : 'is-yellow';
}

function colorName(player) {
  return player === RED ? 'Rot' : 'Gelb';
}

function playerName(player) {
  if (state.mode === 'bot') {
    return player === state.humanPlayer ? 'Du' : `Bot (${DIFFICULTY_LABELS[state.difficulty]})`;
  }
  return colorName(player);
}

function isHumanTurn() {
  return state.mode === 'local' || state.currentPlayer === state.humanPlayer;
}

function canHumanInteract() {
  return !state.gameOver && !state.inputLocked && isHumanTurn();
}

function announce(text) {
  dom.announcer.textContent = '';
  // kurze Verzögerung, damit Screenreader auch gleiche Texte erneut vorlesen
  setTimeout(() => { dom.announcer.textContent = text; }, 30);
}

function setCssPosition(element, row, col) {
  element.style.setProperty('--row', row);
  element.style.setProperty('--col', col);
}

/* ---------- Anzeige aktualisieren ---------- */

function renderStatus(result) {
  let text;
  let extraClass = '';

  if (result && result.winner) {
    extraClass = `win-${result.winner === RED ? 'red' : 'yellow'}`;
    if (state.mode === 'bot') {
      text = result.winner === state.humanPlayer ? 'Du hast gewonnen!' : 'Der Bot hat gewonnen.';
    } else {
      text = `${colorName(result.winner)} hat gewonnen!`;
    }
  } else if (result) {
    extraClass = 'draw';
    text = 'Unentschieden – das Brett ist voll.';
  } else if (state.mode === 'bot') {
    text = isHumanTurn()
      ? `Du bist am Zug (${colorName(state.currentPlayer)})`
      : 'Der Bot denkt nach …';
  } else {
    text = `${colorName(state.currentPlayer)} ist am Zug`;
  }

  dom.status.textContent = text;
  dom.status.className = `status ${extraClass}`.trim();
}

function renderScores() {
  dom.scoreCards.forEach(card => {
    const player = Number(card.dataset.player);
    card.querySelector('.score-name').textContent = playerName(player);
    card.querySelector('.score-value').textContent = scores[state.mode][player];
    card.classList.toggle('active', !state.gameOver && state.currentPlayer === player);
  });
}

/** Aktualisiert ARIA-Beschriftungen und den „voll"-Zustand der Spalten. */
function renderColumns() {
  [...dom.columns.children].forEach((button, col) => {
    const freeCells = state.board.filter(row => row[col] === EMPTY).length;
    const full = freeCells === 0;
    button.classList.toggle('full', full);
    button.setAttribute('aria-disabled', String(full));
    button.setAttribute(
      'aria-label',
      full ? `Spalte ${col + 1}, voll` : `Spalte ${col + 1}, ${freeCells} von ${ROWS} Feldern frei`
    );
  });
}

/** Zeigt den Vorschau-Stein über der Spalte unter Maus oder Tastaturfokus. */
function updatePreview() {
  const col = state.hoverCol !== null ? state.hoverCol : state.focusCol;
  const show = col !== null && canHumanInteract() && !isColumnFull(state.board, col);
  const preview = dom.previewDisc;
  const wasVisible = preview.classList.contains('visible');

  preview.className = `disc preview-disc ${colorClass(state.currentPlayer)}`;

  if (col !== null) {
    if (!wasVisible) {
      // Beim Einblenden nicht von der alten Position „hereinrutschen"
      preview.style.transition = 'none';
      preview.style.setProperty('--col', col);
      void preview.offsetWidth; // Reflow erzwingen
      preview.style.transition = '';
    } else {
      preview.style.setProperty('--col', col);
    }
  }
  if (show) preview.classList.add('visible');
}

function renderAll(result) {
  renderStatus(result);
  renderScores();
  renderColumns();
  dom.boardArea.classList.toggle('locked', !canHumanInteract());
  updatePreview();
}

function showScreen(name) {
  dom.menuScreen.hidden = name !== 'menu';
  dom.gameScreen.hidden = name !== 'game';
}

/* ---------- Animation ---------- */

/** Lässt einen Stein fallen. Die Promise wird nach dem Aufprall erfüllt. */
function animateDisc(row, col, player) {
  const disc = document.createElement('div');
  disc.className = `disc ${colorClass(player)} falling`;
  setCssPosition(disc, row, col);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rowsToFall = row + 1; // längerer Weg = längere Animation
  let durationMs = (CONFIG.fallBaseMs + CONFIG.fallPerRowMs * rowsToFall) / CONFIG.animationSpeed;
  if (reducedMotion) durationMs = 120;
  disc.style.setProperty('--fall-duration', `${durationMs}ms`);

  dom.discsLayer.appendChild(disc);
  state.discElements[row][col] = disc;

  return new Promise(resolve => {
    const finish = () => {
      disc.classList.remove('falling');
      resolve();
    };
    disc.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, durationMs + 150); // Sicherheitsnetz, falls animationend ausbleibt
  });
}

function highlightWinningCells(cells) {
  dom.boardArea.classList.add('has-win');
  for (const [row, col] of cells) {
    const ring = document.createElement('div');
    ring.className = 'win-ring';
    setCssPosition(ring, row, col);
    dom.highlightLayer.appendChild(ring);
    if (state.discElements[row][col]) state.discElements[row][col].classList.add('win');
  }
}

/* ---------- Spielablauf ---------- */

function clearBotTimer() {
  clearTimeout(state.botTimer);
  state.botTimer = null;
}

function newRound() {
  clearBotTimer();
  state.roundId++;
  state.board = createEmptyBoard();
  state.discElements = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  state.currentPlayer = state.starter;
  state.gameOver = false;
  state.inputLocked = false;
  dom.discsLayer.innerHTML = '';
  dom.highlightLayer.innerHTML = '';
  dom.boardArea.classList.remove('has-win');

  renderAll();
  announce(`Neue Runde. ${playerName(state.currentPlayer)} beginnt.`);
  maybeStartBotTurn();
}

function startGame(mode) {
  state.mode = mode;
  state.starter = RED;

  if (mode === 'bot') {
    state.difficulty = document.querySelector('input[name="difficulty"]:checked').value;
    const botStarts = document.querySelector('input[name="starter"]:checked').value === 'bot';
    state.humanPlayer = RED;
    state.botPlayer = YELLOW;
    state.starter = botStarts ? state.botPlayer : state.humanPlayer;
  }

  showScreen('game');
  newRound();
}

function backToMenu() {
  clearBotTimer();
  state.roundId++; // laufende Animationen/Timer verwerfen
  state.hoverCol = null;
  state.focusCol = null;
  dom.menuMain.hidden = false;
  dom.menuBot.hidden = true;
  showScreen('menu');
}

/** Wird bei Klick/Enter auf eine Spalte aufgerufen. */
function activateColumn(col) {
  if (!canHumanInteract()) return;

  if (isColumnFull(state.board, col)) {
    announce(`Spalte ${col + 1} ist voll.`);
    return;
  }
  // Auf Touchgeräten soll die Vorschau nach dem Tippen nicht „hängen bleiben"
  if (state.lastPointerType !== 'mouse') state.hoverCol = null;

  playMove(col);
}

function playMove(col) {
  const row = getLowestFreeRow(state.board, col);
  const player = state.currentPlayer;
  const round = state.roundId;

  state.board[row][col] = player;
  state.inputLocked = true;          // Eingaben sperren, bis der Stein gelandet ist
  renderAll();
  announce(`${playerName(player)} wirft in Spalte ${col + 1}.`);

  animateDisc(row, col, player).then(() => {
    if (round !== state.roundId) return; // Runde wurde inzwischen beendet/neu gestartet
    finishMove(row, col);
  });
}

function finishMove(row, col) {
  const winningCells = getWinningCells(state.board, row, col);

  if (winningCells.length > 0) {
    endRound({ winner: state.board[row][col], cells: winningCells });
  } else if (isBoardFull(state.board)) {
    endRound({ winner: null, cells: [] });
  } else {
    state.currentPlayer = otherPlayer(state.currentPlayer);
    state.inputLocked = false;
    renderAll();
    maybeStartBotTurn();
  }
}

function endRound(result) {
  state.gameOver = true;
  state.inputLocked = false;

  if (result.winner) {
    scores[state.mode][result.winner]++;
    highlightWinningCells(result.cells);
  }
  renderAll(result);
  announce(dom.status.textContent);
}

/** Startet – falls der Bot dran ist – seinen Zug nach kurzer Verzögerung. */
function maybeStartBotTurn() {
  if (state.mode !== 'bot' || state.gameOver || state.currentPlayer !== state.botPlayer) return;

  state.inputLocked = true; // Mensch kann während des Bot-Zugs nicht klicken
  renderAll();

  const round = state.roundId;
  state.botTimer = setTimeout(() => {
    if (round !== state.roundId) return;
    const col = chooseBotMove(state.board, state.botPlayer, state.difficulty);
    playMove(col);
  }, CONFIG.botDelayMs);
}

/* ==========================================================================
   Eingaben & Initialisierung
   ========================================================================== */

/** Roving tabindex: nur eine Spalte ist per Tab erreichbar, der Rest per Pfeiltasten. */
function setRovingColumn(col) {
  [...dom.columns.children].forEach((button, i) => {
    button.tabIndex = i === col ? 0 : -1;
  });
}

function focusColumn(col) {
  const clamped = Math.max(0, Math.min(COLS - 1, col));
  setRovingColumn(clamped);
  dom.columns.children[clamped].focus();
  state.focusCol = clamped;
  updatePreview();
}

function buildColumns() {
  for (let col = 0; col < COLS; col++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'column';
    button.dataset.col = col;
    button.tabIndex = col === Math.floor(COLS / 2) ? 0 : -1;

    button.addEventListener('click', () => activateColumn(col));
    button.addEventListener('mouseenter', () => { state.hoverCol = col; updatePreview(); });
    button.addEventListener('mouseleave', () => { state.hoverCol = null; updatePreview(); });
    button.addEventListener('focus', () => {
      setRovingColumn(col);
      // Vorschau nur bei Tastaturfokus, nicht nach einem Mausklick
      state.focusCol = button.matches(':focus-visible') ? col : null;
      updatePreview();
    });
    button.addEventListener('blur', () => { state.focusCol = null; updatePreview(); });

    dom.columns.appendChild(button);
  }

  dom.columns.addEventListener('pointerdown', event => { state.lastPointerType = event.pointerType; });

  // Pfeiltasten wechseln die Spalte; Enter/Leertaste lösen den Klick aus
  dom.columns.addEventListener('keydown', event => {
    const col = Number(event.target.dataset.col);
    if (event.key === 'ArrowLeft')  { event.preventDefault(); focusColumn(col - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); focusColumn(col + 1); }
    if (event.key === 'Home')       { event.preventDefault(); focusColumn(0); }
    if (event.key === 'End')        { event.preventDefault(); focusColumn(COLS - 1); }
  });
}

function init() {
  buildColumns();

  dom.btnModeBot.addEventListener('click', () => {
    dom.menuMain.hidden = true;
    dom.menuBot.hidden = false;
  });
  dom.btnBotBack.addEventListener('click', () => {
    dom.menuBot.hidden = true;
    dom.menuMain.hidden = false;
  });
  const updateHint = () => {
    const level = document.querySelector('input[name="difficulty"]:checked').value;
    dom.difficultyHint.textContent = DIFFICULTY_HINTS[level];
  };
  document.querySelectorAll('input[name="difficulty"]').forEach(r => r.addEventListener('change', updateHint));
  updateHint();

  dom.btnStartBot.addEventListener('click', () => startGame('bot'));
  dom.btnModeLocal.addEventListener('click', () => startGame('local'));

  dom.btnNewGame.addEventListener('click', () => {
    // Im Zwei-Spieler-Modus wechselt nach einer beendeten Runde, wer beginnt
    if (state.mode === 'local' && state.gameOver) state.starter = otherPlayer(state.starter);
    newRound();
  });
  dom.btnMenu.addEventListener('click', backToMenu);

  showScreen('menu');
}

init();