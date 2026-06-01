"use strict";

/* =========================================================
   BLOCK ARENA
   script.js - Part 1
   Core engine foundation
   Includes:
   - Board model (10x20 + hidden rows)
   - 7-bag randomizer
   - SRS rotation system + wall kicks
   - DAS / ARR movement model (input-ready)
   - Lock delay system
   - Hold system
   - Next queue
   - Ghost piece
   - Basic statistics tracking foundation
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const COLS = 10;
const ROWS = 20;
const HIDDEN_ROWS = 2;

const DROP_INTERVAL = 1000;

const PIECES = ["I", "O", "T", "S", "Z", "J", "L"];

/* =========================================================
   TETROMINO SHAPES (4x4 matrices)
========================================================= */

const SHAPES = {
    I: [
        [0,0,0,0],
        [1,1,1,1],
        [0,0,0,0],
        [0,0,0,0]
    ],
    O: [
        [0,1,1,0],
        [0,1,1,0],
        [0,0,0,0],
        [0,0,0,0]
    ],
    T: [
        [0,1,0,0],
        [1,1,1,0],
        [0,0,0,0],
        [0,0,0,0]
    ],
    S: [
        [0,1,1,0],
        [1,1,0,0],
        [0,0,0,0],
        [0,0,0,0]
    ],
    Z: [
        [1,1,0,0],
        [0,1,1,0],
        [0,0,0,0],
        [0,0,0,0]
    ],
    J: [
        [1,0,0,0],
        [1,1,1,0],
        [0,0,0,0],
        [0,0,0,0]
    ],
    L: [
        [0,0,1,0],
        [1,1,1,0],
        [0,0,0,0],
        [0,0,0,0]
    ]
};

/* =========================================================
   SRS ROTATION OFFSETS
   (Simplified but compatible structure)
========================================================= */

const KICKS_JLSTZ = {
    "0>1": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    "1>0": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    "1>2": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    "2>1": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    "2>3": [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    "3>2": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    "3>0": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    "0>3": [[0,0],[1,0],[1,1],[0,-2],[1,-2]]
};

const KICKS_I = {
    "0>1": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    "1>0": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    "1>2": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
    "2>1": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    "2>3": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    "3>2": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    "3>0": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    "0>3": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
};

/* =========================================================
   UTILS
========================================================= */

function cloneMatrix(m) {
    return m.map(row => row.slice());
}

function rotateMatrix(matrix, dir) {
    const N = matrix.length;
    const result = Array.from({ length: N }, () => Array(N).fill(0));

    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            if (dir > 0) {
                result[x][N - 1 - y] = matrix[y][x];
            } else {
                result[N - 1 - x][y] = matrix[y][x];
            }
        }
    }

    return result;
}

function createBoard() {
    return Array.from({ length: ROWS + HIDDEN_ROWS }, () =>
        Array(COLS).fill(null)
    );
}

/* =========================================================
   7-BAG RANDOMIZER
========================================================= */

class Bag {
    constructor() {
        this.bag = [];
    }

    refill() {
        this.bag = PIECES.slice();

        for (let i = this.bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
    }

    next() {
        if (this.bag.length === 0) {
            this.refill();
        }
        return this.bag.pop();
    }
}

/* =========================================================
   PIECE CLASS
========================================================= */

class Piece {
    constructor(type) {
        this.type = type;
        this.matrix = cloneMatrix(SHAPES[type]);

        this.x = 3;
        this.y = 0;

        this.rotation = 0;
    }

    rotate(dir) {
        const nextRotation = (this.rotation + (dir > 0 ? 1 : 3)) % 4;
        const rotated = rotateMatrix(this.matrix, dir);

        return {
            matrix: rotated,
            rotation: nextRotation
        };
    }
}

/* =========================================================
   ENGINE CORE
========================================================= */

class Engine {
    constructor() {
        this.board = createBoard();

        this.bag = new Bag();

        this.nextQueue = [];

        this.hold = null;
        this.canHold = true;

        this.current = null;

        this.gameOver = false;

        this.lockDelay = 500;
        this.lockTimer = 0;
        this.onGround = false;

        this.gravity = 1;

        this.stats = {
            pieces: 0,
            lines: 0,
            score: 0,
            combos: 0,
            b2b: 0,
            attacks: 0
        };

        this.fillQueue();
        this.spawn();
    }

    fillQueue() {
        while (this.nextQueue.length < 10) {
            this.nextQueue.push(this.bag.next());
        }
    }

    spawn() {
        const type = this.nextQueue.shift();
        this.fillQueue();

        this.current = new Piece(type);

        if (this.collides(this.current.x, this.current.y, this.current.matrix)) {
            this.gameOver = true;
        }

        this.canHold = true;
        this.onGround = false;
        this.lockTimer = 0;

        this.stats.pieces++;
    }

    holdPiece() {
        if (!this.canHold) return;

        const temp = this.hold;
        this.hold = this.current.type;

        if (!temp) {
            this.spawn();
        } else {
            this.current = new Piece(temp);
        }

        this.canHold = false;
    }

    collides(x, y, matrix) {
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {

                if (!matrix[r][c]) continue;

                const nx = x + c;
                const ny = y + r;

                if (
                    nx < 0 ||
                    nx >= COLS ||
                    ny >= ROWS + HIDDEN_ROWS
                ) {
                    return true;
                }

                if (ny >= 0 && this.board[ny][nx]) {
                    return true;
                }
            }
        }

        return false;
    }

    placePiece() {
        const m = this.current.matrix;

        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {

                if (!m[r][c]) continue;

                const x = this.current.x + c;
                const y = this.current.y + r;

                if (y >= 0) {
                    this.board[y][x] = this.current.type;
                }
            }
        }

        this.clearLines();
        this.spawn();
    }

    clearLines() {
        let cleared = 0;

        for (let y = 0; y < this.board.length; y++) {
            if (this.board[y].every(cell => cell !== null)) {
                this.board.splice(y, 1);
                this.board.unshift(Array(COLS).fill(null));
                cleared++;
                y--;
            }
        }

        if (cleared > 0) {
            this.stats.lines += cleared;
            this.stats.score += cleared * 100;
        }
    }

    move(dx, dy) {
        if (!this.collides(this.current.x + dx, this.current.y + dy, this.current.matrix)) {
            this.current.x += dx;
            this.current.y += dy;
            this.onGround = false;
            return true;
        }
        return false;
    }

    rotate(dir) {
        const { matrix, rotation } = this.current.rotate(dir);

        const kicks = this.current.type === "I"
            ? KICKS_I
            : KICKS_JLSTZ;

        const key = `${this.current.rotation}>${rotation}`;
        const tests = kicks[key] || [[0,0]];

        for (const [dx, dy] of tests) {
            if (!this.collides(
                this.current.x + dx,
                this.current.y + dy,
                matrix
            )) {
                this.current.matrix = matrix;
                this.current.x += dx;
                this.current.y += dy;
                this.current.rotation = rotation;
                return true;
            }
        }

        return false;
    }

    softDrop() {
        if (!this.move(0, 1)) {
            this.onGround = true;
        }
    }

    hardDrop() {
        while (this.move(0, 1)) {}
        this.placePiece();
    }

    update(delta) {
        if (this.gameOver) return;

        this.lockTimer += delta;

        if (this.onGround && this.lockTimer >= this.lockDelay) {
            this.placePiece();
        }

        this.gravity += delta;

        if (this.gravity > 1000) {
            this.softDrop();
            this.gravity = 0;
        }
    }

    getGhostY() {
        let y = this.current.y;

        while (!this.collides(this.current.x, y + 1, this.current.matrix)) {
            y++;
        }

        return y;
    }
}

/* =========================================================
   INPUT SYSTEM (DAS / ARR READY HOOKS)
========================================================= */

class Input {
    constructor(engine) {
        this.engine = engine;

        this.keys = {};

        this.das = 100;
        this.arr = 0;

        this.leftTimer = 0;
        this.rightTimer = 0;

        this.leftHeld = false;
        this.rightHeld = false;

        this.bind();
    }

    bind() {
        window.addEventListener("keydown", e => {
            this.keys[e.code] = true;

            switch (e.code) {
                case "ArrowLeft":
                    this.leftHeld = true;
                    this.engine.move(-1, 0);
                    break;

                case "ArrowRight":
                    this.rightHeld = true;
                    this.engine.move(1, 0);
                    break;

                case "ArrowUp":
                    this.engine.rotate(1);
                    break;

                case "KeyZ":
                    this.engine.rotate(-1);
                    break;

                case "Space":
                    this.engine.hardDrop();
                    break;

                case "ShiftLeft":
                    this.engine.holdPiece();
                    break;

                case "ArrowDown":
                    this.engine.softDrop();
                    break;
            }
        });

        window.addEventListener("keyup", e => {
            this.keys[e.code] = false;

            if (e.code === "ArrowLeft") this.leftHeld = false;
            if (e.code === "ArrowRight") this.rightHeld = false;
        });
    }

    update(delta) {
        this.handleDAS(delta);
    }

    handleDAS(delta) {
        if (this.leftHeld) {
            this.leftTimer += delta;

            if (this.leftTimer > this.das) {
                this.engine.move(-1, 0);
            }
        } else {
            this.leftTimer = 0;
        }

        if (this.rightHeld) {
            this.rightTimer += delta;

            if (this.rightTimer > this.das) {
                this.engine.move(1, 0);
            }
        } else {
            this.rightTimer = 0;
        }
    }
}

/* =========================================================
   STATS FOUNDATION
========================================================= */

class Stats {
    constructor(engine) {
        this.engine = engine;

        this.startTime = performance.now();

        this.lastUpdate = performance.now();
    }

    update() {
        const now = performance.now();

        const seconds =
            (now - this.startTime) / 1000;

        const pps =
            this.engine.stats.pieces / seconds;

        const apm =
            (this.engine.stats.attacks / seconds) * 60;

        this.engine.stats.pps = pps || 0;
        this.engine.stats.apm = apm || 0;
    }
}

/* =========================================================
   EXPORT TO GLOBAL
========================================================= */

window.BlockArena = {
    Engine,
    Input,
    Stats,
    Bag,
    Piece
};