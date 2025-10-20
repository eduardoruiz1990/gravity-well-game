/**
 * Gravity Well - Main Game Engine
 * This version implements the gameplay logic for the "Fragment Magnet" upgrade
 * and a cinematic "Head Start" utility.
 */
import './style.css'
import * as Tone from 'tone';

// --- Step 1: DOM Element Setup ---
const appContainer = document.getElementById('app');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const gameOverModal = document.getElementById('gameOverModal');
const finalScoreElement = document.getElementById('finalScoreElement');
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

const pauseButton = document.getElementById('pauseButton');
const pauseMenu = document.getElementById('pauseMenu');
const resumeButton = document.getElementById('resumeButton');
const quitButton = document.getElementById('quitButton');

const observatoryButton = document.getElementById('observatoryButton');
const closeObservatoryButton = document.getElementById('closeObservatoryButton');
const observatory = document.getElementById('observatory');
const shopFragmentsDisplay = document.getElementById('shopFragmentsDisplay');

const gameOverMenuButton = document.getElementById('gameOverMenuButton');
const gameOverObservatoryButton = document.getElementById('gameOverObservatoryButton');


// --- Step 2: Game State and Configuration ---
let gameState = 'menu'; // 'menu', 'playing', 'paused', 'game-over', 'observatory'
let playerData = {
    highScore: 0,
    starFragments: 0,
    upgrades: {
        shield: 0,
        magnet: 0,
        score: 0,
        headstart: false,
        revive: false,
    }
};

const upgradeCosts = {
    shield: [100, 250, 500, 1000, 2000],
    magnet: [300, 750, 1500],
    score: [200, 400, 800, 1600, 3200],
    headstart: 150,
    revive: 250
};

// Game Object Arrays
let playerComet = null;
let obstacles = [];
let powerUps = [];
let starFragments = [];
let particles = [];
let stars = [];

// Game State Variables
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
let activePowerUp = { type: null, timer: 0 };
let lastZoneIndex = -1;
let currentZoneColors = {};
let isHeadstarting = false;
let headstartTimer = 0;
const HEADSTART_DURATION = 500; // Approx 8.3 seconds at 60fps

const PLAYER_COMET_RADIUS = 15;
const GRAVITY_INFLUENCE = 0.2; 
const INERTIAL_DAMPING = 0.98;
const SCORE_DIVISOR = 7;
const WAVE_AMPLITUDE = 0.5;
const WAVE_FREQUENCY = 0.03;

const ZONE_SCORE_INCREMENT = 1500;
const INITIAL_SPEED = 2.5;
const SPEED_INCREMENT_PER_ZONE = 0.5; 
const START_HUE = 240; // Blue
const HUE_INCREMENT_PER_ZONE = 50;

const VIRTUAL_WIDTH = 1280;
const VIRTUAL_HEIGHT = 720;
let scale = 1;


const audioManager = {
    isInitialized: false,
    synth: null,
    noiseSynth: null,
    musicLoop: null,
    baseBPM: 100,

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
        
        Tone.Transport.bpm.value = this.baseBPM;

        const notes = ["C2", "G2", "Eb3", "G2"];
        let noteIndex = 0;
        
        this.musicLoop = new Tone.Loop(time => {
            this.synth.triggerAttackRelease(notes[noteIndex % notes.length], "8n", time);
            noteIndex++;
        }, "4n").start(0);

        Tone.Transport.start();
    },
    updateTempo(newBPM) {
        if (!this.isInitialized || Tone.Transport.state !== 'started') return;
        Tone.Transport.bpm.value = newBPM;
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
class Star {
    constructor() {
        this.x = Math.random() * VIRTUAL_WIDTH;
        this.y = Math.random() * VIRTUAL_HEIGHT;
        this.z = Math.random() * VIRTUAL_WIDTH;
        this.radius = 0.5 + Math.random() * 1.5;
    }
    update(speed) {
        this.x -= speed * (this.z / VIRTUAL_WIDTH);
        if (this.x < 0) {
            this.x = VIRTUAL_WIDTH;
            this.y = Math.random() * VIRTUAL_HEIGHT;
        }
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fill();
    }
}
class PlayerComet {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.baseSpeed = calculateCurrentSpeed();
        this.vx = this.baseSpeed; this.vy = 0;
        this.radius = PLAYER_COMET_RADIUS;
        this.trail = []; this.waveAngle = 0;
        this.orbiters = [];
    }
    update() {
        if (isHeadstarting) {
            this.baseSpeed = 30;
        } else {
            this.baseSpeed = calculateCurrentSpeed();
        }

        this.waveAngle += WAVE_FREQUENCY;
        this.radius = activePowerUp.type === 'shrink' ? PLAYER_COMET_RADIUS / 2 : PLAYER_COMET_RADIUS;
        const sway = Math.cos(this.waveAngle) * WAVE_AMPLITUDE;
        const inertiaFactor = 1 - INERTIAL_DAMPING;
        this.vy += (sway - this.vy) * inertiaFactor;
        
        if (gravityWell && !isHeadstarting) {
            const dx = gravityWell.x - this.x;
            const dy = gravityWell.y - this.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > 0.01) {
                const dist = Math.sqrt(distSq);
                if (dist < gravityWell.radius) {
                    const pullX = dx / dist;
                    const pullY = dy / dist;
                    this.vx += pullX * GRAVITY_INFLUENCE;
                    this.vy += pullY * GRAVITY_INFLUENCE;
                }
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
        
        if (!isHeadstarting) {
            this.x += this.vx; this.y += this.vy;
        }

        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 15) {
            this.trail.shift();
        }
        this.orbiters.forEach(orb => orb.update());
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
        if (activePowerUp.type === 'shield' || isHeadstarting) {
            ctx.beginPath();
            ctx.arc(screenX, this.y, this.radius + 5, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        this.orbiters.forEach(orb => orb.draw(screenX, this.y));
    }
}
class Orbiter {
    constructor(distance, color) {
        this.distance = distance;
        this.color = color;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = 0.02 + Math.random() * 0.02;
    }
    update() {
        this.angle += this.speed;
    }
    draw(cometX, cometY) {
        const x = cometX + Math.cos(this.angle) * this.distance;
        const y = cometY + Math.sin(this.angle) * this.distance;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, 10);
        gradient.addColorStop(0, this.color);
        gradient.addColorStop(0.5, this.color);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}
class GravityWell {
    constructor(worldX, y) { this.x = worldX; this.y = y; this.radius = VIRTUAL_HEIGHT / 3.5; }
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
        let color = currentZoneColors.obstacle;
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
                ctx.strokeStyle = currentZoneColors.stroke; 
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
        // NEW: Velocity for the magnet effect
        this.vx = 0;
        this.vy = 0;
    }
    // NEW: Update method for the magnet effect
    update() {
        const magnetLevel = playerData.upgrades.magnet || 0;
        if (magnetLevel > 0 && playerComet) {
            const magnetRange = 50 + magnetLevel * 25;
            const dx = playerComet.x - this.x;
            const dy = playerComet.y - this.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < magnetRange * magnetRange) {
                const dist = Math.sqrt(distSq);
                const pullForce = 5;
                this.vx += (dx / dist) * pullForce;
                this.vy += (dy / dist) * pullForce;
            }
        }
        
        // Apply friction
        this.vx *= 0.95;
        this.vy *= 0.95;

        this.x += this.vx;
        this.y += this.vy;
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
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = Math.random() * 2 + 1;
        this.lifespan = 45;
        this.vx = (Math.random() - 0.5) * 3;
        this.vy = (Math.random() - 0.5) * 3;
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
        ctx.globalAlpha = this.lifespan / 45;
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
            const loaded = JSON.parse(savedData);
            if (!loaded.upgrades) {
                loaded.upgrades = { shield: 0, magnet: 0, score: 0, headstart: false, revive: false };
            }
            playerData = loaded;
        }
    } catch (e) {
        console.error("Could not load player data.", e);
        playerData = { highScore: 0, starFragments: 0, upgrades: { shield: 0, magnet: 0, score: 0, headstart: false, revive: false } };
    }
}

function updateObservatoryUI() {
    shopFragmentsDisplay.textContent = playerData.starFragments;

    Object.keys(upgradeCosts).forEach(id => {
        if (Array.isArray(upgradeCosts[id])) {
            const level = playerData.upgrades[id] || 0;
            const item = document.getElementById(`upgrade-${id}`);
            if (!item) return;
            const button = item.querySelector('button');
            const levelDisplay = item.querySelector('.upgrade-level');
            
            if (level >= upgradeCosts[id].length) {
                button.textContent = 'Max Level';
                button.disabled = true;
                levelDisplay.textContent = `Level ${level}/${upgradeCosts[id].length}`;
            } else {
                const cost = upgradeCosts[id][level];
                button.textContent = `Buy (${cost})`;
                button.disabled = playerData.starFragments < cost;
                levelDisplay.textContent = `Level ${level}/${upgradeCosts[id].length}`;
            }
        }
    });

    ['headstart', 'revive'].forEach(id => {
        const item = document.getElementById(`utility-${id}`);
        if (!item) return;
        const button = item.querySelector('button');
        if (playerData.upgrades[id]) {
            button.textContent = 'Owned';
            button.disabled = true;
        } else {
            const cost = upgradeCosts[id];
            button.textContent = `Buy (${cost})`;
            button.disabled = playerData.starFragments < cost;
        }
    });
}

function setGameState(newState) {
    const oldState = gameState;
    gameState = newState;
    
    appContainer.classList.remove('screen-shake');
    mainMenu.className = 'modal modal-hidden';
    gameOverModal.className = 'modal modal-hidden';
    pauseMenu.className = 'modal modal-hidden';
    observatory.className = 'modal modal-hidden';
    inGameUi.style.display = 'none';

    if (gameState === 'menu') {
        audioManager.stopMusic();
        mainMenu.className = 'modal modal-visible';
        highScoreDisplay.textContent = playerData.highScore;
        starFragmentsDisplay.textContent = playerData.starFragments;
    } else if (gameState === 'playing') {
        inGameUi.style.display = 'flex';
        runFragmentsContainer.className = '';
        if (oldState === 'paused') {
            audioManager.startMusic();
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            gameLoop();
        } else {
            setTimeout(startGame, 350);
        }
    } else if (gameState === 'paused') {
        audioManager.stopMusic();
        inGameUi.style.display = 'flex';
        pauseMenu.className = 'modal modal-visible';
    } else if (gameState === 'game-over') {
        if (playerComet) {
            createExplosion(playerComet.x, playerComet.y, 10, 'white');
        }
        audioManager.stopMusic();
        audioManager.playGameOverSound();
        inGameUi.style.display = 'flex';
        runFragmentsContainer.className = 'run-fragments-hidden';
        appContainer.classList.add('screen-shake');
        if (score > playerData.highScore) {
            playerData.highScore = Math.floor(score);
        }
        playerData.starFragments += fragmentsThisRun;
        savePlayerData();
        finalScoreElement.textContent = Math.floor(score);
        fragmentsEarnedDisplay.textContent = fragmentsThisRun;
        gameOverModal.className = 'modal modal-visible';
    } else if (gameState === 'observatory') {
        updateObservatoryUI();
        observatory.className = 'modal modal-visible';
    }
}

function initNewRun() {
  isGameOver = false;
  score = 0;
  fragmentsThisRun = 0;
  runFragmentsDisplay.textContent = '0';
  maxDistanceReached = 0;
  lastZoneIndex = -1;
  playerComet = null;
  gravityWell = null;
  cameraX = 0;
  obstacles = [];
  powerUps = [];
  starFragments = [];
  particles = [];
  nextObstacleSpawnX = VIRTUAL_WIDTH; 
  nextPowerUpSpawnX = VIRTUAL_WIDTH / 2;
  nextFragmentSpawnX = VIRTUAL_WIDTH / 3;
  activePowerUp = { type: null, timer: 0 };
  scoreElement.textContent = '0';
  powerUpStatusElement.className = 'powerup-hidden';
  
  if (playerData.upgrades.headstart) {
    isHeadstarting = true;
    headstartTimer = 0;
    playerData.upgrades.headstart = false;
    savePlayerData();
  } else {
    isHeadstarting = false;
  }
  
  checkZoneTransition();
  
  playerComet = new PlayerComet(50, VIRTUAL_HEIGHT / 2);
}

function startGame() {
    resizeCanvas();
    initNewRun();
    audioManager.startMusic();
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    gameLoop();
}

function gameLoop() {
  if (gameState !== 'playing' || isGameOver) {
      if(gameState === 'paused'){
          animationFrameId = requestAnimationFrame(gameLoop);
      }
      return;
  }

  updateGame();
  drawGame();

  if (!isGameOver) {
    animationFrameId = requestAnimationFrame(gameLoop);
  }
}

function updateGame() {
    if (!playerComet) return;
    
    if (isHeadstarting) {
        headstartTimer++;
        const progress = headstartTimer / HEADSTART_DURATION;
        // Use an ease-out function for a smooth cinematic slowdown
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        maxDistanceReached = easedProgress * (ZONE_SCORE_INCREMENT * SCORE_DIVISOR);
        playerComet.x = maxDistanceReached;
        
        if (headstartTimer >= HEADSTART_DURATION) {
            isHeadstarting = false;
        }
    }
    
    cameraX = playerComet.x - (VIRTUAL_WIDTH / 3);

    playerComet.update();
    
    manageObstacles();
    managePowerUps();
    manageStarFragments();
    manageParticles();
    for (let i = 0; i < stars.length; i++) {
        stars[i].update(playerComet.vx);
    }
    
    for (let i = 0; i < obstacles.length; i++) {
        if (obstacles[i].x < cameraX + VIRTUAL_WIDTH && obstacles[i].x + obstacles[i].width > cameraX) {
            obstacles[i].update();
        }
    }

    starFragments.forEach(sf => sf.update());
    
    const collisionResult = isHeadstarting ? { obstacle: false } : checkCollisions();
    if (collisionResult.obstacle) {
        isGameOver = true;
        setGameState('game-over');
        return;
    }

    if (collisionResult.fragment) {
        fragmentsThisRun++;
        runFragmentsDisplay.textContent = fragmentsThisRun;
        audioManager.playFragmentSound();
        createExplosion(collisionResult.item.x, collisionResult.item.y, 3, '#facc15');
    }
    if (collisionResult.powerUp) {
        activePowerUp.type = collisionResult.powerUp;
        
        let shieldDuration = 300;
        if (playerData.upgrades.shield > 0) {
            shieldDuration *= (1 + playerData.upgrades.shield * 0.1);
        }
        const durations = { shield: shieldDuration, shrink: 480, boost: 600 };
        activePowerUp.timer = durations[activePowerUp.type];
        
        audioManager.playPowerUpSound();
        const color = new PowerUp(0, 0, collisionResult.powerUp).colors[collisionResult.powerUp].main;
        createExplosion(collisionResult.item.x, collisionResult.item.y, 5, color);
    }
    
    handleActivePowerUp();
    
    if (!isHeadstarting) {
        const oldMaxDistance = maxDistanceReached;
        maxDistanceReached = Math.max(maxDistanceReached, playerComet.x);
        const distanceGained = maxDistanceReached - oldMaxDistance;
        if (distanceGained > 0) {
            const scoreMultiplier = 1 + (playerData.upgrades.score * 0.05) + (activePowerUp.type === 'boost' ? 1 : 0);
            score += (distanceGained / SCORE_DIVISOR) * scoreMultiplier;
        }
    } else {
        score = (maxDistanceReached / SCORE_DIVISOR);
    }
    
    scoreElement.textContent = Math.floor(score);
    checkZoneTransition();
}

function drawGame() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(scale, scale);

    if (currentZoneColors.background) {
        ctx.fillStyle = currentZoneColors.background;
        ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    }

    for (let i = 0; i < stars.length; i++) {
        stars[i].draw();
    }

    if (playerComet) {
        playerComet.draw(); 
    }
    
    for (let i = 0; i < obstacles.length; i++) obstacles[i].draw();
    for (let i = 0; i < powerUps.length; i++) powerUps[i].draw();
    for (let i = 0; i < starFragments.length; i++) starFragments[i].draw();
    for (let i = 0; i < particles.length; i++) particles[i].draw();

    if (gravityWell && !isHeadstarting) {
        gravityWell.draw();
    }
    
    ctx.restore();
}


function resizeCanvas() {
    const container = document.getElementById('app');
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    const scaleX = containerWidth / VIRTUAL_WIDTH;
    const scaleY = containerHeight / VIRTUAL_HEIGHT;
    scale = Math.min(scaleX, scaleY);

    const newWidth = VIRTUAL_WIDTH * scale;
    const newHeight = VIRTUAL_HEIGHT * scale;

    canvas.width = newWidth;
    canvas.height = newHeight;
}


function getObstacleTypeForZone() {
    const zoneIndex = Math.floor(score / ZONE_SCORE_INCREMENT);
    const rand = Math.random();
    
    if (zoneIndex < 1) return 'static';
    if (zoneIndex < 3) return rand < 0.6 ? 'static' : 'vertical';
    if (rand < 0.4) return 'static';
    if (rand < 0.8) return 'vertical';
    return 'phasing';
}

function manageObstacles() {
    if (!playerComet) return;
    for (let i = obstacles.length - 1; i >= 0; i--) {
        if (obstacles[i].x + obstacles[i].width < cameraX) {
            obstacles.splice(i, 1);
        }
    }

    const spawnAheadPoint = cameraX + VIRTUAL_WIDTH;
    if (nextObstacleSpawnX < spawnAheadPoint) {
        const zoneIndex = Math.floor(score / ZONE_SCORE_INCREMENT);
        const minDistance = Math.max(80, 200 - zoneIndex * 15);
        const randomDistance = Math.max(50, 150 - zoneIndex * 10);
        
        const obstacleType = getObstacleTypeForZone();
        const width = Math.random() * 50 + 25; const height = Math.random() * 180 + 50;
        const x = nextObstacleSpawnX + minDistance + Math.random() * randomDistance; 
        const y = Math.random() * (VIRTUAL_HEIGHT - height);
        obstacles.push(new Obstacle(x, y, width, height, obstacleType));
        nextObstacleSpawnX = x;
    }
}
function managePowerUps() {
    if (!playerComet) return;
    for (let i = powerUps.length - 1; i >= 0; i--) {
        if (powerUps[i].x + powerUps[i].radius < cameraX) {
            powerUps.splice(i, 1);
        }
    }

    const spawnAheadPoint = cameraX + VIRTUAL_WIDTH;
    if (nextPowerUpSpawnX < spawnAheadPoint) {
        let spawnAttempts = 0;
        let validPosition = false;
        while(spawnAttempts < 5 && !validPosition) {
            const x = spawnAheadPoint + Math.random() * 500;
            const y = Math.random() * VIRTUAL_HEIGHT;
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
                validPosition = true;
            }
            spawnAttempts++;
        }
        nextPowerUpSpawnX = cameraX + VIRTUAL_WIDTH + (Math.random() * 1000 + 800);
    }
}

function manageStarFragments() {
    if (!playerComet) return;
    for (let i = starFragments.length - 1; i >= 0; i--) {
        if (starFragments[i].x + starFragments[i].radius < cameraX) {
            starFragments.splice(i, 1);
        }
    }

    const spawnAheadPoint = cameraX + VIRTUAL_WIDTH;
    if (nextFragmentSpawnX < spawnAheadPoint) {
        const clusterSize = Math.floor(Math.random() * 4) + 3;
        const startX = spawnAheadPoint + 100;
        const startY = Math.random() * VIRTUAL_HEIGHT * 0.6 + VIRTUAL_HEIGHT * 0.2;
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
            if (!isClusterSafe) break;
        }
        
        if (isClusterSafe) {
            for (const fragPos of potentialFragments) {
                starFragments.push(new StarFragment(fragPos.x, fragPos.y));
            }
        }
        
        nextFragmentSpawnX = startX + (Math.random() * 600 + 400);
    }
}

function createExplosion(x, y, count, color) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function manageParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].lifespan <= 0) {
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

function checkCollisions() {
    if (!playerComet) return { obstacle: false, powerUp: null, fragment: false, item: null };
    
    for (let i = starFragments.length - 1; i >= 0; i--) {
        const sf = starFragments[i];
        const dx = sf.x - playerComet.x;
        const dy = sf.y - playerComet.y;
        const distSq = dx * dx + dy * dy;
        const radiiSq = (playerComet.radius + sf.radius) * (playerComet.radius + sf.radius);
        if (distSq < radiiSq) {
            const collectedFragment = starFragments.splice(i, 1)[0];
            return { obstacle: false, powerUp: null, fragment: true, item: collectedFragment };
        }
    }

    for (let i = powerUps.length - 1; i >= 0; i--) {
        const p = powerUps[i];
        const dx = p.x - playerComet.x;
        const dy = p.y - playerComet.y;
        const distSq = dx * dx + dy * dy;
        const radiiSq = (playerComet.radius + p.radius) * (playerComet.radius + p.radius);
        if (distSq < radiiSq) {
            const collectedPowerUp = powerUps.splice(i, 1)[0];
            return { obstacle: false, powerUp: p.type, fragment: false, item: collectedPowerUp };
        }
    }

    if (activePowerUp.type !== 'shield' && !isHeadstarting) {
        for (const obstacle of obstacles) {
            if (obstacle.type === 'phasing' && !obstacle.isActive) continue;
            if (playerComet.x + playerComet.radius > obstacle.x && playerComet.x - playerComet.radius < obstacle.x + obstacle.width && playerComet.y + playerComet.radius > obstacle.y && playerComet.y - playerComet.radius < obstacle.y + obstacle.height) {
                return { obstacle: true, powerUp: null, fragment: false, item: null };
            }
        }
        if (playerComet.y - playerComet.radius < 0 || playerComet.y + playerComet.radius > VIRTUAL_HEIGHT || playerComet.x - playerComet.radius < cameraX) {
            return { obstacle: true, powerUp: null, fragment: false, item: null };
        }
    }
    
    return { obstacle: false, powerUp: null, fragment: false, item: null };
}

function calculateCurrentSpeed() {
    if(!playerComet) return INITIAL_SPEED;
    const zoneIndex = Math.floor(score / ZONE_SCORE_INCREMENT);
    return INITIAL_SPEED + (zoneIndex * SPEED_INCREMENT_PER_ZONE);
}

function updateMusicTempo() {
    if (!playerComet) return;
    const minSpeed = INITIAL_SPEED;
    const maxSpeedForTempo = 10;
    const speedRange = maxSpeedForTempo - minSpeed;
    const currentSpeedAboveMin = playerComet.baseSpeed - minSpeed;
    const speedRatio = Math.max(0, Math.min(1, currentSpeedAboveMin / speedRange));
    const minBPM = audioManager.baseBPM;
    const maxBPM = 180;
    const bpmRange = maxBPM - minBPM;
    const newBPM = minBPM + (speedRatio * bpmRange);
    audioManager.updateTempo(newBPM);
}


function checkZoneTransition() {
    const zoneIndex = Math.floor(score / ZONE_SCORE_INCREMENT);
    if (zoneIndex !== lastZoneIndex) {
        console.log(`Entering procedural zone ${zoneIndex + 1}`);
        const hue = (START_HUE + (zoneIndex * HUE_INCREMENT_PER_ZONE)) % 360;
        
        currentZoneColors = {
            background: `hsla(${hue}, 60%, 15%, 0.8)`,
            obstacle: `hsl(${hue + 20}, 80%, 60%)`,
            stroke: `hsl(${hue + 20}, 80%, 70%)`
        };

        if (playerComet) {
            const orbiterDistance = playerComet.radius + 10 + (playerComet.orbiters.length * 5);
            playerComet.orbiters.push(new Orbiter(orbiterDistance, currentZoneColors.obstacle));
        }

        updateMusicTempo();

        lastZoneIndex = zoneIndex;
    }
}

// --- Step 5: Event Listeners ---
function setupEventListeners() {
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;
        return {
            x: (clientX - rect.left) / scale,
            y: (clientY - rect.top) / scale
        };
    };
    const startWell = (e) => {
        if (gameState !== 'playing' || isHeadstarting) return;
        e.preventDefault();
        const pos = getPos(e);
        gravityWell = new GravityWell(pos.x + cameraX, pos.y);
    };
    const moveWell = (e) => {
        if (gravityWell && gameState === 'playing' && !isHeadstarting) {
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
    
    pauseButton.addEventListener('click', () => {
        if (gameState === 'playing') {
            setGameState('paused');
        }
    });

    resumeButton.addEventListener('click', () => {
        if (gameState === 'paused') {
            handlePlayClick();
        }
    });

    quitButton.addEventListener('click', () => {
        if (gameState === 'paused') {
            audioManager.playClickSound();
            setGameState('menu');
        }
    });

    observatoryButton.addEventListener('click', () => {
        audioManager.playClickSound();
        setGameState('observatory');
    });

    closeObservatoryButton.addEventListener('click', () => {
        audioManager.playClickSound();
        setGameState('menu');
    });

    const buyButtons = document.querySelectorAll('.buy-btn');
    buyButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const upgradeId = e.target.dataset.upgrade;
            buyUpgrade(upgradeId);
        });
    });

    gameOverMenuButton.addEventListener('click', () => {
        audioManager.playClickSound();
        setGameState('menu');
    });
    gameOverObservatoryButton.addEventListener('click', () => {
        audioManager.playClickSound();
        setGameState('observatory');
    });
}

function buyUpgrade(upgradeId) {
    let cost = 0;
    let canAfford = false;

    if (Array.isArray(upgradeCosts[upgradeId])) { // Permanent upgrade
        const level = playerData.upgrades[upgradeId] || 0;
        if (level < upgradeCosts[upgradeId].length) {
            cost = upgradeCosts[upgradeId][level];
            if (playerData.starFragments >= cost) {
                playerData.starFragments -= cost;
                playerData.upgrades[upgradeId]++;
                canAfford = true;
            }
        }
    } else { // Single-use utility
        if (!playerData.upgrades[upgradeId]) {
            cost = upgradeCosts[upgradeId];
            if (playerData.starFragments >= cost) {
                playerData.starFragments -= cost;
                playerData.upgrades[upgradeId] = true;
                canAfford = true;
            }
        }
    }

    if (canAfford) {
        console.log(`Purchased ${upgradeId}`);
        audioManager.playFragmentSound();
        savePlayerData();
        updateObservatoryUI();
    } else {
        console.log(`Cannot afford ${upgradeId}`);
    }
}


// --- Step 6: Game Initialization ---
function initStars() {
    for (let i = 0; i < 200; i++) {
        stars.push(new Star());
    }
}

function init() {
    initStars();
    setupEventListeners();
    loadPlayerData();
    resizeCanvas(); 
    setGameState('menu');
}

// --- And finally, we start the whole process! ---
init();

