// This is the main JavaScript file, the "engine" of our game.
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


// --- Step 2: Game State and Configuration ---
let gameState = 'menu'; // 'menu', 'playing', 'paused', 'game-over'
let playerData = {
    highScore: 0,
    starFragments: 0
};

let playerComet = null;
let obstacles = [];
let powerUps = [];
let starFragments = [];
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
let activePowerUp = { type: null, timer: 0 };
let lastZoneIndex = -1;

const PLAYER_COMET_RADIUS = 15;
const GRAVITY_INFLUENCE = 0.2; 
const INERTIAL_DAMPING = 0.98;
const SCORE_DIVISOR = 7;
const WAVE_AMPLITUDE = 0.5;
const WAVE_FREQUENCY = 0.03;

const ZONE_SCORE_INCREMENT = 1500;
const INITIAL_SPEED = 2.5;
const SPEED_INCREMENT_PER_ZONE = 0.25;
const START_HUE = 240; // Blue
const HUE_INCREMENT_PER_ZONE = 50;


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
        if (!this.isInitialized) return;
        Tone.Transport.bpm.rampTo(newBPM, 0.5);
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
        // OPTIMIZED: Shorter trail to improve performance
        if (this.trail.length > 8) {
            this.trail.shift();
        }
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
    draw(obstacleColor, strokeColor) {
        let color = obstacleColor;
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
                ctx.strokeStyle = strokeColor; 
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
    
    appContainer.classList.remove('screen-shake');
    mainMenu.className = 'modal modal-hidden';
    gameOverModal.className = 'modal modal-hidden';
    pauseMenu.className = 'modal modal-hidden';
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
            createExplosion(playerComet.x, playerComet.y, 15, 'white');
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
  nextObstacleSpawnX = 0;
  nextPowerUpSpawnX = 500;
  nextFragmentSpawnX = 300;
  activePowerUp = { type: null, timer: 0 };
  scoreElement.textContent = '0';
  powerUpStatusElement.className = 'powerup-hidden';
  
  checkZoneTransition();
  
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
  if (gameState !== 'playing' || isGameOver) {
      if(gameState === 'paused'){
          animationFrameId = requestAnimationFrame(gameLoop);
      }
      return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (playerComet) {
    playerComet.update();
    playerComet.draw(); 
    cameraX = playerComet.x - (canvas.width / 3);
  }
  
  manageObstacles();
  managePowerUps();
  manageStarFragments();
  manageParticles();
  updateMusicTempo();

  const zoneIndex = Math.floor(score / ZONE_SCORE_INCREMENT);
  const hue = (START_HUE + (zoneIndex * HUE_INCREMENT_PER_ZONE)) % 360;
  const obstacleColor = `hsl(${hue + 20}, 80%, 60%)`;
  const strokeColor = `hsl(${hue + 20}, 80%, 70%)`;

  obstacles.forEach(o => o.update());
  obstacles.forEach(o => o.draw(obstacleColor, strokeColor));
  powerUps.forEach(p => p.draw());
  starFragments.forEach(sf => sf.draw());
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
        createExplosion(collisionResult.item.x, collisionResult.item.y, 5, '#facc15');
    }
    if (collisionResult.powerUp) {
        activePowerUp.type = collisionResult.powerUp;
        const durations = { shield: 300, shrink: 480, boost: 600 };
        activePowerUp.timer = durations[activePowerUp.type];
        audioManager.playPowerUpSound();
        const color = new PowerUp(0, 0, collisionResult.powerUp).colors[collisionResult.powerUp].main;
        createExplosion(collisionResult.item.x, collisionResult.item.y, 8, color);
    }
    handleActivePowerUp();
    
    // FIXED: Correct scoring logic that prevents score from reverting.
    const oldMaxDistance = maxDistanceReached;
    maxDistanceReached = Math.max(maxDistanceReached, playerComet.x);
    const distanceGained = maxDistanceReached - oldMaxDistance;

    if (distanceGained > 0) {
        const scoreMultiplier = activePowerUp.type === 'boost' ? 2 : 1;
        score += (distanceGained / SCORE_DIVISOR) * scoreMultiplier;
    }
    
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


function getObstacleTypeForZone() {
    const zoneIndex = Math.floor(score / ZONE_SCORE_INCREMENT);
    const rand = Math.random();
    
    if (zoneIndex < 1) { 
        return 'static';
    }
    if (zoneIndex < 3) {
        return rand < 0.6 ? 'static' : 'vertical';
    }
    if (rand < 0.4) return 'static';
    if (rand < 0.8) return 'vertical';
    return 'phasing';
}

function manageObstacles() {
    if (!playerComet) return;
    obstacles = obstacles.filter(obstacle => obstacle.x + obstacle.width > cameraX);
    const spawnAheadPoint = cameraX + canvas.width;
    if (nextObstacleSpawnX < spawnAheadPoint) {
        const obstacleType = getObstacleTypeForZone();
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
        canvas.style.backgroundColor = `hsla(${hue}, 60%, 15%, 0.8)`;
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

