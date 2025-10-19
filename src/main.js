// This is the main JavaScript file, the "engine" of our game.
import './style.css'
import * as Tone from 'tone';

// --- Step 1: DOM Element Setup ---
const appContainer = document.getElementById('app'); // Get the main app container
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const gameOverModal = document.getElementById('gameOverModal');
const finalScoreElement = document.getElementById('finalScore');
const restartButton = document.getElementById('restartButton');
const powerUpStatusElement = document.getElementById('powerUpStatus');
const inGameUi = document.querySelector('.ui-container');

const mainMenu = document.getElementById('mainMenu');
const playButton = document.getElementById('playButton');
const highScoreDisplay = document.getElementById('highScoreDisplay');
const starFragmentsDisplay = document.getElementById('starFragmentsDisplay');

const runFragmentsContainer = document.getElementById('runFragmentsContainer');
const runFragmentsDisplay = document.getElementById('runFragmentsDisplay');
const fragmentsEarnedDisplay = document.getElementById('fragmentsEarnedDisplay');


// --- Step 2: Game State and Configuration ---
let gameState = 'menu';
let playerData = {
    highScore: 0,
    starFragments: 0
};

let playerComet = null;
let obstacles = [];
let powerUps = [];
let starFragments = [];
// NEW: Array for particle effects
let particles = [];
let gravityWell = null;
let score = 0;
let fragmentsThisRun = 0;
let isGameOver = false;
let animationFrameId;
let maxDistanceReached = 0; 
let cameraX = 0;
let nextObstacleSpawnX = 0;
let nextPowerUpSpawnX = 0;
let nextFragmentSpawnX = 0;
let currentZone = 1;
let activePowerUp = { type: null, timer: 0 };
const PLAYER_COMET_RADIUS = 15;
const GRAVITY_INFLUENCE = 0.2; 
const INERTIAL_DAMPING = 0.98;
const SCORE_DIVISOR = 7;
const WAVE_AMPLITUDE = 0.5;
const WAVE_FREQUENCY = 0.03;

const zoneConfig = {
  1: { name: "The Tranquil Void", scoreThreshold: 0, cometSpeed: 2.5, maxSpeed: 3.5, backgroundColor: '#0c0a09', obstacleColor: '#4f46e5' },
  2: { name: "The Asteroid Drift", scoreThreshold: 1500, cometSpeed: 3.5, maxSpeed: 4.0, backgroundColor: '#26241e', obstacleColor: '#a16207' },
  3: { name: "Singularity's Edge", scoreThreshold: 3000, cometSpeed: 4.0, maxSpeed: 7.0, backgroundColor: '#1e1b4b', obstacleColor: '#be185d' }
};

const audioManager = {
    isInitialized: false,
    synth: null,
    noiseSynth: null,
    musicLoop: null,

    init() {
        if (this.isInitialized) return;
        this.synth = new Tone.Synth().toDestination();
        this.noiseSynth = new Tone.NoiseSynth({
            noise: { type: 'white' },
            envelope: { attack: 0.005, decay: 0.1, sustain: 0 }
        }).toDestination();
        this.isInitialized = true;
    },

    playFragmentSound() {
        if (!this.isInitialized) return;
        this.synth.triggerAttackRelease("C5", "8n");
    },
    playPowerUpSound() {
        if (!this.isInitialized) return;
        this.synth.triggerAttackRelease("G5", "8n");
    },
    playGameOverSound() {
        if (!this.isInitialized) return;
        this.noiseSynth.triggerAttack();
    },
    playClickSound() {
        if (!this.isInitialized) return;
        this.synth.triggerAttackRelease("C4", "16n");
    },
    startMusic() {
        if (!this.isInitialized || this.musicLoop) return;
        const notes = ["C2", "G2", "Eb3", "G2"];
        let noteIndex = 0;
        
        this.musicLoop = new Tone.Loop(time => {
            this.synth.triggerAttackRelease(notes[noteIndex % notes.length], "8n", time);
            noteIndex++;
        }, "4n").start(0);

        Tone.Transport.start();
    },
    stopMusic() {
        if (this.musicLoop) {
            this.musicLoop.stop(0);
            this.musicLoop.dispose();
            this.musicLoop = null;
            Tone.Transport.stop();
        }
    }
};

// --- Step 3: Game Classes (The Blueprints) ---
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
        const sway = Math.cos(this.waveAngle) * WAVE_AMPLITUDE;

        const inertiaFactor = 1 - INERTIAL_DAMPING;
        this.vy += (sway - this.vy) * inertiaFactor;

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
        }

        const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (currentSpeed > 0) {
            this.vx = (this.vx / currentSpeed) * this.baseSpeed;
            this.vy = (this.vy / currentSpeed) * this.baseSpeed;
        } else {
            this.vx = this.baseSpeed;
            this.vy = 0;
        }
        
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

class StarFragment {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 8;
        this.animation = Math.random() * Math.PI * 2;
    }

    draw() {
        this.animation += 0.07;
        const scale = 1 + Math.sin(this.animation) * 0.1;
        const screenX = this.x - cameraX;

        ctx.save();
        ctx.translate(screenX, this.y);
        ctx.rotate(this.animation * 0.5);
        ctx.scale(scale, scale);

        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;

        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            let angle = (i / 5) * 2 * Math.PI;
            let outerRadius = this.radius;
            let innerRadius = this.radius / 2;
            ctx.lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius);
            angle += (1 / 5) * Math.PI;
            ctx.lineTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }
}

// NEW: Class for a single particle effect
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = Math.random() * 3 + 1;
        this.lifespan = 60; // 1 second
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = (Math.random() - 0.5) * 4;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.lifespan--;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x - cameraX, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.lifespan / 60;
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}


// --- Step 4: Core Game Logic Functions ---

function savePlayerData() {
    try {
        localStorage.setItem('gravityWellSaveData', JSON.stringify(playerData));
    } catch (e) { console.error("Could not save player data.", e); }
}

function loadPlayerData() {
    try {
        const savedData = localStorage.getItem('gravityWellSaveData');
        if (savedData) {
            playerData = JSON.parse(savedData);
        }
    } catch (e) {
        console.error("Could not load player data.", e);
        playerData = { highScore: 0, starFragments: 0 };
    }
}

function setGameState(newState) {
    const oldState = gameState;
    gameState = newState;
    
    // Always remove shake class when state changes
    appContainer.classList.remove('screen-shake');

    mainMenu.className = 'modal modal-hidden';
    gameOverModal.className = 'modal modal-hidden';
    inGameUi.style.display = 'none';

    if (gameState === 'menu') {
        audioManager.stopMusic();
        mainMenu.className = 'modal modal-visible';
        highScoreDisplay.textContent = playerData.highScore;
        starFragmentsDisplay.textContent = playerData.starFragments;
    } else if (gameState === 'playing') {
        inGameUi.style.display = 'flex';
        runFragmentsContainer.className = '';
        if (oldState !== 'playing') {
            setTimeout(startGame, 350); 
        }
    } else if (gameState === 'game-over') {
        // NEW: Create explosion on game over
        if (playerComet) {
            createExplosion(playerComet.x, playerComet.y, 25, 'white');
        }
        audioManager.stopMusic();
        audioManager.playGameOverSound();
        inGameUi.style.display = 'flex';
        runFragmentsContainer.className = 'run-fragments-hidden';
        
        // NEW: Apply screen shake on game over
        appContainer.classList.add('screen-shake');

        if (score > playerData.highScore) {
            playerData.highScore = Math.floor(score);
        }
        playerData.starFragments += fragmentsThisRun;
        savePlayerData();
        finalScoreElement.textContent = Math.floor(score);
        fragmentsEarnedDisplay.textContent = fragmentsThisRun;
        gameOverModal.className = 'modal modal-visible';
    }
}

function initNewRun() {
  isGameOver = false;
  score = 0;
  fragmentsThisRun = 0;
  runFragmentsDisplay.textContent = '0';
  maxDistanceReached = 0;
  currentZone = 1;
  playerComet = null;
  gravityWell = null;
  cameraX = 0;
  obstacles = [];
  powerUps = [];
  starFragments = [];
  // NEW: Clear particles
  particles = [];
  nextObstacleSpawnX = 0;
  nextPowerUpSpawnX = 500;
  nextFragmentSpawnX = 300;
  activePowerUp = { type: null, timer: 0 };
  scoreElement.textContent = '0';
  powerUpStatusElement.className = 'powerup-hidden';
  canvas.style.backgroundColor = zoneConfig[currentZone].backgroundColor;
  
  playerComet = new PlayerComet(50, canvas.height / 2);
}

function startGame() {
    resizeCanvas();
    initNewRun();
    audioManager.startMusic();
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    gameLoop();
}

function gameLoop() {
  if (gameState !== 'playing' || isGameOver) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (playerComet) {
    playerComet.update();
    playerComet.draw(); // Draw comet before camera update for correct particle positioning
    cameraX = playerComet.x - (canvas.width / 3);
  }
  
  manageObstacles();
  managePowerUps();
  manageStarFragments();
  // NEW: Manage particles
  manageParticles();

  obstacles.forEach(o => o.update());
  obstacles.forEach(o => o.draw());
  powerUps.forEach(p => p.draw());
  starFragments.forEach(sf => sf.draw());
  // NEW: Draw particles
  particles.forEach(p => p.draw());

  if (gravityWell) {
    gravityWell.draw();
  }
  const collisionResult = checkCollisions();
  if (collisionResult.obstacle) {
    isGameOver = true;
    setGameState('game-over');
  } else {
    if (collisionResult.fragment) {
        fragmentsThisRun++;
        runFragmentsDisplay.textContent = fragmentsThisRun;
        audioManager.playFragmentSound();
        // NEW: Create particle burst on collection
        createExplosion(collisionResult.item.x, collisionResult.item.y, 10, '#facc15');
    }
    if (collisionResult.powerUp) {
        activePowerUp.type = collisionResult.powerUp;
        const durations = { shield: 300, shrink: 480, boost: 600 };
        activePowerUp.timer = durations[activePowerUp.type];
        audioManager.playPowerUpSound();
        // NEW: Create particle burst on collection
        const color = powerUps.find(p => p.type === collisionResult.powerUp)?.colors[collisionResult.powerUp].main || '#ffffff';
        createExplosion(collisionResult.item.x, collisionResult.item.y, 15, color);
    }
    handleActivePowerUp();
    maxDistanceReached = Math.max(maxDistanceReached, playerComet.x);
    const scoreMultiplier = activePowerUp.type === 'boost' ? 2 : 1;
    score = (maxDistanceReached / SCORE_DIVISOR) * scoreMultiplier;
    scoreElement.textContent = Math.floor(score);
    checkZoneTransition();
  }

  if (!isGameOver) {
    animationFrameId = requestAnimationFrame(gameLoop);
  }
}

function resizeCanvas() {
    const container = document.getElementById('app');
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const aspectRatio = 16 / 9;

    let width, height;

    if (containerWidth / containerHeight > aspectRatio) {
        height = containerHeight * 0.9;
        width = height * aspectRatio;
    } else {
        width = containerWidth * 0.9;
        height = width / aspectRatio;
    }

    canvas.width = width;
    canvas.height = height;
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
    if (!playerComet) return;
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
    if (!playerComet) return;
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

function manageStarFragments() {
    if (!playerComet) return;
    starFragments = starFragments.filter(sf => sf.x + sf.radius > cameraX);
    const spawnAheadPoint = cameraX + canvas.width;

    if (nextFragmentSpawnX < spawnAheadPoint) {
        const clusterSize = Math.floor(Math.random() * 4) + 3;
        const startX = spawnAheadPoint + 100;
        const startY = Math.random() * canvas.height * 0.6 + canvas.height * 0.2;
        const angle = (Math.random() - 0.5) * Math.PI / 4;

        const potentialFragments = [];
        for (let i = 0; i < clusterSize; i++) {
            const x = startX + i * 40;
            const y = startY + Math.sin(i * 0.5 + angle) * 50;
            potentialFragments.push({ x, y });
        }
        
        let isClusterSafe = true;
        const fragmentRadius = 8;
        for (const fragPos of potentialFragments) {
            for (const obs of obstacles) {
                if (fragPos.x - fragmentRadius < obs.x + obs.width &&
                    fragPos.x + fragmentRadius > obs.x &&
                    fragPos.y - fragmentRadius < obs.y + obs.height &&
                    fragPos.y + fragmentRadius > obs.y) {
                    isClusterSafe = false;
                    break;
                }
            }
            if (!isClusterSafe) {
                break;
            }
        }
        
        if (isClusterSafe) {
            for (const fragPos of potentialFragments) {
                starFragments.push(new StarFragment(fragPos.x, fragPos.y));
            }
        }
        
        nextFragmentSpawnX = startX + (Math.random() * 600 + 400);
    }
}

// NEW: Functions to manage particle effects
function createExplosion(x, y, count, color) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function manageParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        if (p.lifespan <= 0) {
            particles.splice(i, 1);
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

// MODIFIED: This function now returns the collected item for particle effects
function checkCollisions() {
    if (!playerComet) return { obstacle: false, powerUp: null, fragment: false, item: null };
    
    for (let i = starFragments.length - 1; i >= 0; i--) {
        const sf = starFragments[i];
        const dx = sf.x - playerComet.x;
        const dy = sf.y - playerComet.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < playerComet.radius + sf.radius) {
            const collectedFragment = starFragments.splice(i, 1)[0];
            return { obstacle: false, powerUp: null, fragment: true, item: collectedFragment };
        }
    }

    for (let i = powerUps.length - 1; i >= 0; i--) {
        const p = powerUps[i];
        const dx = p.x - playerComet.x;
        const dy = p.y - playerComet.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < playerComet.radius + p.radius) {
            const collectedPowerUp = powerUps.splice(i, 1)[0];
            return { obstacle: false, powerUp: p.type, fragment: false, item: collectedPowerUp };
        }
    }

    if (activePowerUp.type !== 'shield') {
        for (const obstacle of obstacles) {
            if (obstacle.type === 'phasing' && !obstacle.isActive) continue;
            if (playerComet.x + playerComet.radius > obstacle.x && playerComet.x - playerComet.radius < obstacle.x + obstacle.width && playerComet.y + playerComet.radius > obstacle.y && playerComet.y - playerComet.radius < obstacle.y + obstacle.height) {
                return { obstacle: true, powerUp: null, fragment: false, item: null };
            }
        }
        if (playerComet.y - playerComet.radius < 0 || playerComet.y + playerComet.radius > canvas.height || playerComet.x - playerComet.radius < cameraX) {
            return { obstacle: true, powerUp: null, fragment: false, item: null };
        }
    }
    
    return { obstacle: false, powerUp: null, fragment: false, item: null };
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
            x: clientX - rect.left,
            y: clientY - rect.top
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
    window.addEventListener('resize', resizeCanvas); 
    
    const handlePlayClick = async () => {
        try {
            if (typeof Tone !== 'undefined') {
                if (Tone.context.state !== 'running') {
                    await Tone.start();
                    console.log("Audio Context started by user gesture.");
                }
                if (!audioManager.isInitialized) {
                    audioManager.init();
                }
                audioManager.playClickSound();
            } else {
                 console.error("Tone.js is not defined. Game will run without sound.");
            }
        } catch (error) {
            console.error("Audio could not be initialized. The game will run without sound.", error);
        } finally {
            setGameState('playing');
        }
    };

    playButton.addEventListener('click', handlePlayClick);
    restartButton.addEventListener('click', handlePlayClick);
}


// --- Step 6: Game Initialization ---
function init() {
    setupEventListeners();
    loadPlayerData();
    resizeCanvas(); 
    setGameState('menu');
}

// --- And finally, we start the whole process! ---
init();


