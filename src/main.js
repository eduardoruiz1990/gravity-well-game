// This is the main JavaScript file, the "engine" of our game.
import './style.css'

// --- Step 1: DOM Element Setup ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const gameOverModal = document.getElementById('gameOverModal');
const finalScoreElement = document.getElementById('finalScore');
const restartButton = document.getElementById('restartButton');
const powerUpStatusElement = document.getElementById('powerUpStatus');

// NEW: UI elements for the Main Menu
const mainMenu = document.getElementById('mainMenu');
const playButton = document.getElementById('playButton');
const highScoreDisplay = document.getElementById('highScoreDisplay');
const starFragmentsDisplay = document.getElementById('starFragmentsDisplay');


// --- Step 2: Game State and Configuration ---

// NEW: The Game State Manager
// This variable will control what part of the game is currently active.
// Possible states: 'menu', 'playing', 'game-over'
let gameState = 'menu';

// NEW: Player Data Object
// This will hold all the data we want to save.
let playerData = {
    highScore: 0,
    starFragments: 0
};

// --- All other state and config variables remain the same ---
let playerComet = null;
let obstacles = [];
let powerUps = []; 
let gravityWell = null;
let score = 0;
let isGameOver = false; // We still use this for the loop, but gameState is the main controller
let animationFrameId;
let maxDistanceReached = 0; 
let cameraX = 0;
let nextObstacleSpawnX = 0;
let nextPowerUpSpawnX = 0; 
let currentZone = 1;
let activePowerUp = { type: null, timer: 0 };
const PLAYER_COMET_RADIUS = 15;
const GRAVITY_INFLUENCE = 0.15;
const INERTIAL_DAMPING = 0.99; 
const SCORE_DIVISOR = 7;
const WAVE_AMPLITUDE = 0.7;
const WAVE_FREQUENCY = 0.04;

const zoneConfig = {
  1: { name: "The Tranquil Void", scoreThreshold: 0, cometSpeed: 2.5, maxSpeed: 3.5, backgroundColor: '#0c0a09', obstacleColor: '#4f46e5' },
  2: { name: "The Asteroid Drift", scoreThreshold: 1500, cometSpeed: 3.5, maxSpeed: 4.0, backgroundColor: '#26241e', obstacleColor: '#a16207' },
  3: { name: "Singularity's Edge", scoreThreshold: 3000, cometSpeed: 4.0, maxSpeed: 7.0, backgroundColor: '#1e1b4b', obstacleColor: '#be185d' }
};

// --- All Classes (PlayerComet, Obstacle, etc.) remain the same ---
// ... (No changes to the class definitions)
class PlayerComet {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.baseSpeed = calculateCurrentSpeed();
        this.vx = this.baseSpeed; this.vy = 0;
        this.radius = PLAYER_COMET_RADIUS;
        this.trail = []; this.waveAngle = 0;
    }
    update() {
        this.baseSpeed = calculateCurrentSpeed();
        this.waveAngle += WAVE_FREQUENCY;
        this.radius = activePowerUp.type === 'shrink' ? PLAYER_COMET_RADIUS / 2 : PLAYER_COMET_RADIUS;
        let sway = Math.cos(this.waveAngle) * WAVE_AMPLITUDE;

        // FIXED: The sway/inertia logic is now correctly placed in an else block,
        // so it doesn't interfere with the gravity well's control.
        if (gravityWell) {
            const dx = gravityWell.x - this.x;
            const dy = gravityWell.y - this.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < gravityWell.radius * gravityWell.radius) {
                const dist = Math.sqrt(distSq);
                const pullX = dx / dist;
                const pullY = dy / dist;
                this.vx += pullX * GRAVITY_INFLUENCE;
                this.vy += pullY * GRAVITY_INFLUENCE;
            }
        } else {
             this.vy = (this.vy * (1 - INERTIAL_DAMPING)) + (sway * INERTIAL_DAMPING);
        }

        const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        this.vx = (this.vx / currentSpeed) * this.baseSpeed;
        this.vy = (this.vy / currentSpeed) * this.baseSpeed;
        this.x += this.vx; this.y += this.vy;
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 12) this.trail.shift();
    }
    draw() {
        const screenX = this.x - cameraX;
        for (let i = 0; i < this.trail.length; i++) {
            const t = this.trail[i];
            const alpha = (i / this.trail.length) * 0.4;
            ctx.beginPath();
            ctx.arc(t.x - cameraX, t.y, this.radius * (i / this.trail.length), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fill();
        }
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(screenX, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        if (activePowerUp.type === 'shield') {
            ctx.beginPath();
            ctx.arc(screenX, this.y, this.radius + 5, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }
}
class GravityWell {
    constructor(worldX, y) { this.x = worldX; this.y = y; this.radius = Math.min(canvas.width, canvas.height) / 3.5; }
    draw() {
        const screenX = this.x - cameraX;
        ctx.beginPath();
        ctx.arc(screenX, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(196, 181, 253, 0.15)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(screenX, this.y, this.radius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(196, 181, 253, 0.1)';
        ctx.fill();
    }
}
class Obstacle {
    constructor(x, y, width, height, type) {
        this.x = x; this.y = y; this.width = width; this.height = height; this.type = type;
        this.initialY = y; this.direction = 1; this.speedY = 1;
        this.isActive = true; this.phaseTimer = 0; this.phaseDuration = 120; this.warningFrames = 45;
    }
    update() {
        if (this.type === 'vertical') {
            this.y += this.speedY * this.direction;
            if (Math.abs(this.y - this.initialY) > 50) this.direction *= -1;
        } else if (this.type === 'phasing') {
            this.phaseTimer++;
            if (this.phaseTimer > this.phaseDuration) {
                this.phaseTimer = 0;
                this.isActive = !this.isActive;
            }
        }
    }
    draw() {
        const zone = zoneConfig[currentZone];
        let color = zone.obstacleColor;
        let shouldDraw = true;
        if (this.type === 'phasing') {
            if (!this.isActive) {
                const timeToActivate = this.phaseDuration - this.phaseTimer;
                if (timeToActivate < this.warningFrames) {
                    const alpha = Math.abs(Math.sin(this.phaseTimer * 0.2));
                    color = `rgba(239, 68, 68, ${alpha})`;
                } else {
                    shouldDraw = false;
                }
            }
        }
        if (shouldDraw) {
            ctx.fillStyle = color;
            ctx.fillRect(this.x - cameraX, this.y, this.width, this.height);
            if (this.type !== 'phasing' || this.isActive) {
                ctx.strokeStyle = zone.obstacleColor.replace('e5', 'f8'); 
                ctx.lineWidth = 2;
                ctx.strokeRect(this.x - cameraX, this.y, this.width, this.height);
            }
        }
    }
}
class PowerUp {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type; this.radius = 12;
        this.colors = {
            shield: { main: '#0ea5e9', glow: 'rgba(125, 211, 252, 0.5)' },
            shrink: { main: '#16a34a', glow: 'rgba(134, 239, 172, 0.5)' },
            boost: { main: '#facc15', glow: 'rgba(253, 224, 71, 0.5)' }
        };
        this.animation = Math.random() * Math.PI * 2;
    }
    draw() {
        this.animation += 0.05;
        const pulse = 0.9 + Math.sin(this.animation) * 0.1;
        const colorSet = this.colors[this.type];
        const screenX = this.x - cameraX;
        ctx.beginPath();
        ctx.arc(screenX, this.y, this.radius * pulse * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = colorSet.glow;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(screenX, this.y, this.radius * pulse, 0, Math.PI * 2);
        ctx.fillStyle = colorSet.main;
        ctx.fill();
    }
}


// --- Step 4: Core Game Logic Functions ---

// NEW: Persistence Functions using localStorage
function savePlayerData() {
    try {
        localStorage.setItem('gravityWellSaveData', JSON.stringify(playerData));
    } catch (e) {
        console.error("Could not save player data to localStorage.", e);
    }
}

function loadPlayerData() {
    try {
        const savedData = localStorage.getItem('gravityWellSaveData');
        if (savedData) {
            playerData = JSON.parse(savedData);
        }
    } catch (e) {
        console.error("Could not load player data from localStorage.", e);
        // If data is corrupted, reset to default
        playerData = { highScore: 0, starFragments: 0 };
    }
}

// NEW: The State Management Hub
function setGameState(newState) {
    gameState = newState;
    // Hide all modals by default
    mainMenu.className = 'modal-hidden';
    gameOverModal.className = 'modal-hidden';

    if (gameState === 'menu') {
        mainMenu.className = 'modal-visible';
        // Update the displays on the main menu
        highScoreDisplay.textContent = playerData.highScore;
        starFragmentsDisplay.textContent = playerData.starFragments;
    } else if (gameState === 'playing') {
        startGame();
    } else if (gameState === 'game-over') {
        // Update high score if needed
        if (score > playerData.highScore) {
            playerData.highScore = Math.floor(score);
        }
        // In the future, we would add fragments collected this run to playerData.starFragments
        savePlayerData(); // Save progress
        
        finalScoreElement.textContent = Math.floor(score);
        gameOverModal.className = 'modal-visible';
    }
}


// MODIFIED: This function is now just for resetting variables for a new run.
function initNewRun() {
  isGameOver = false;
  score = 0;
  maxDistanceReached = 0;
  currentZone = 1;
  playerComet = null;
  gravityWell = null;
  cameraX = 0;
  obstacles = [];
  powerUps = [];
  nextObstacleSpawnX = 0;
  nextPowerUpSpawnX = 500;
  activePowerUp = { type: null, timer: 0 };

  scoreElement.textContent = '0';
  powerUpStatusElement.className = 'powerup-hidden';
  canvas.style.backgroundColor = zoneConfig[currentZone].backgroundColor;

  resizeCanvas();
  playerComet = new PlayerComet(50, canvas.height / 2);
}

// MODIFIED: This is now the main game starting point.
function startGame() {
    initNewRun(); // Reset everything
    // Start the game loop
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    gameLoop();
}

// MODIFIED: The game loop now checks the state
function gameLoop() {
  // This is the most important change: the loop only runs the game logic
  // if we are in the 'playing' state.
  if (gameState !== 'playing') return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ... (rest of the game loop logic is identical to before)
  if (playerComet) {
    playerComet.update();
    cameraX = playerComet.x - (canvas.width / 3);
    playerComet.draw();
  }
  manageObstacles();
  managePowerUps();
  obstacles.forEach(o => o.update());
  obstacles.forEach(o => o.draw());
  powerUps.forEach(p => p.draw());
  if (gravityWell) {
    gravityWell.draw();
  }
  const collisionResult = checkCollisions();
  if (collisionResult.obstacle) {
    isGameOver = true; // Set flag to stop the loop
    setGameState('game-over'); // Change state to show the modal
  } else {
    if (collisionResult.powerUp) {
        activePowerUp.type = collisionResult.powerUp;
        const durations = { shield: 300, shrink: 480, boost: 600 };
        activePowerUp.timer = durations[activePowerUp.type];
    }
    handleActivePowerUp();
    maxDistanceReached = Math.max(maxDistanceReached, playerComet.x);
    const scoreMultiplier = activePowerUp.type === 'boost' ? 2 : 1;
    score = (maxDistanceReached / SCORE_DIVISOR) * scoreMultiplier;
    scoreElement.textContent = Math.floor(score);
    checkZoneTransition();
  }

  // Only request the next frame if the game isn't over.
  if (!isGameOver) {
    animationFrameId = requestAnimationFrame(gameLoop);
  }
}

// --- All other helper functions (resizeCanvas, manageObstacles, etc.) are unchanged ---
function resizeCanvas() {
    const maxWidth = 1024; const aspectRatio = 16 / 9; const container = document.getElementById('app');
    const containerWidth = container.clientWidth; const availableHeight = window.innerHeight - document.querySelector('.ui-container').offsetHeight - 48;
    let width = Math.min(maxWidth, containerWidth); let height = width / aspectRatio;
    if (height > availableHeight) { height = availableHeight; width = height * aspectRatio; }
    canvas.width = width; canvas.height = height;
}
function getObstacleTypeForZone(zoneId) {
    const rand = Math.random();
    const zoneProbabilities = { 1: { static: 1.0 }, 2: { static: 0.6, vertical: 0.4 }, 3: { static: 0.4, vertical: 0.4, phasing: 0.2 } };
    const probs = zoneProbabilities[zoneId] || zoneProbabilities[3];
    let cumulativeProbability = 0;
    for (const type in probs) { cumulativeProbability += probs[type]; if (rand < cumulativeProbability) return type; }
    return 'static';
}
function manageObstacles() {
    obstacles = obstacles.filter(obstacle => obstacle.x + obstacle.width > cameraX);
    const spawnAheadPoint = cameraX + canvas.width;
    if (nextObstacleSpawnX < spawnAheadPoint) {
        const obstacleType = getObstacleTypeForZone(currentZone);
        const width = Math.random() * 50 + 25; const height = Math.random() * 180 + 50;
        const x = spawnAheadPoint + Math.random() * 100; const y = Math.random() * (canvas.height - height);
        obstacles.push(new Obstacle(x, y, width, height, obstacleType));
        nextObstacleSpawnX = x + (Math.random() * 200 + 150);
    }
}
function managePowerUps() {
    powerUps = powerUps.filter(p => p.x + p.radius > cameraX);
    const spawnAheadPoint = cameraX + canvas.width;
    if (nextPowerUpSpawnX < spawnAheadPoint) {
        let spawnAttempts = 0;
        let validPosition = false;
        while(spawnAttempts < 5 && !validPosition) {
            const x = spawnAheadPoint + Math.random() * 500;
            const y = Math.random() * canvas.height;
            let overlapping = false;
            for (const obs of obstacles) {
                if (x < obs.x + obs.width && x + 24 > obs.x && y < obs.y + obs.height && y + 24 > obs.y) {
                    overlapping = true;
                    break;
                }
            }
            if (!overlapping) {
                const powerUpTypes = ['shield', 'shrink', 'boost'];
                const type = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
                powerUps.push(new PowerUp(x, y, type));
                nextPowerUpSpawnX = x + (Math.random() * 1000 + 800);
                validPosition = true;
            }
            spawnAttempts++;
        }
        if(!validPosition) {
            nextPowerUpSpawnX = spawnAheadPoint + 200;
        }
    }
}
function handleActivePowerUp() {
    if (activePowerUp.type && activePowerUp.timer > 0) {
        activePowerUp.timer--;
        const secondsLeft = (activePowerUp.timer / 60).toFixed(1);
        powerUpStatusElement.textContent = `${activePowerUp.type.toUpperCase()}: ${secondsLeft}s`;
        powerUpStatusElement.className = 'powerup-active';
        if (activePowerUp.timer <= 0) {
            activePowerUp.type = null;
            powerUpStatusElement.className = 'powerup-hidden';
        }
    }
}
function checkCollisions() {
    if (!playerComet) return { obstacle: false, powerUp: null };
    if (activePowerUp.type !== 'shield') {
        for (const obstacle of obstacles) {
            if (obstacle.type === 'phasing' && !obstacle.isActive) continue;
            if (playerComet.x + playerComet.radius > obstacle.x && playerComet.x - playerComet.radius < obstacle.x + obstacle.width && playerComet.y + playerComet.radius > obstacle.y && playerComet.y - playerComet.radius < obstacle.y + obstacle.height) {
                return { obstacle: true, powerUp: null };
            }
        }
        if (playerComet.y - playerComet.radius < 0 || playerComet.y + playerComet.radius > canvas.height || playerComet.x - playerComet.radius < cameraX) {
            return { obstacle: true, powerUp: null };
        }
    }
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const p = powerUps[i];
        const dx = p.x - playerComet.x;
        const dy = p.y - playerComet.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < playerComet.radius + p.radius) {
            powerUps.splice(i, 1);
            return { obstacle: false, powerUp: p.type };
        }
    }
    return { obstacle: false, powerUp: null };
}
function calculateCurrentSpeed() {
    const zone = zoneConfig[currentZone];
    const nextZone = zoneConfig[currentZone + 1];
    const startSpeed = zone.cometSpeed; const endSpeed = zone.maxSpeed;
    const startScore = zone.scoreThreshold; const endScore = nextZone ? nextZone.scoreThreshold : startScore + 3000;
    if (score <= startScore) return startSpeed;
    if (score >= endScore) {
        if (!nextZone) {
            const extraScore = score - endScore;
            return endSpeed + (extraScore * 0.0005);
        }
        return endSpeed;
    }
    const progress = (score - startScore) / (endScore - startScore);
    return startSpeed + (endSpeed - startSpeed) * progress;
}
function checkZoneTransition() {
    const nextZoneId = currentZone + 1;
    if (zoneConfig[nextZoneId] && score >= zoneConfig[nextZoneId].scoreThreshold) {
        currentZone = nextZoneId;
        canvas.style.transition = 'background-color 1s ease';
        canvas.style.backgroundColor = zoneConfig[currentZone].backgroundColor;
    }
}

// --- Step 5: Event Listeners ---
function setupEventListeners() {
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    };
    const startWell = (e) => {
        if (gameState !== 'playing') return;
        e.preventDefault();
        const pos = getPos(e);
        gravityWell = new GravityWell(pos.x + cameraX, pos.y);
    };
    const moveWell = (e) => {
        if (gravityWell && gameState === 'playing') {
            e.preventDefault();
            const pos = getPos(e);
            gravityWell.x = pos.x + cameraX;
            gravityWell.y = pos.y;
        }
    };
    const endWell = (e) => {
        e.preventDefault();
        gravityWell = null;
    };

    canvas.addEventListener('mousedown', startWell);
    canvas.addEventListener('mousemove', moveWell);
    document.addEventListener('mouseup', endWell);
    canvas.addEventListener('touchstart', startWell, { passive: false });
    canvas.addEventListener('touchmove', moveWell, { passive: false });
    document.addEventListener('touchend', endWell);
    // FIXED: The resize listener now works in any game state.
    window.addEventListener('resize', resizeCanvas); 
    
    // MODIFIED: Our buttons now change the game state
    playButton.addEventListener('click', () => setGameState('playing'));
    restartButton.addEventListener('click', () => setGameState('playing'));
}


// --- Step 6: Game Initialization ---
function init() {
    setupEventListeners();
    loadPlayerData();
    // FIXED: Call resizeCanvas once at the start to set the initial size correctly.
    resizeCanvas(); 
    setGameState('menu'); // Start the game at the main menu
}

// --- And finally, we start the whole process! ---
init();

