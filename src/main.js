// This is the main JavaScript file, the "engine" of our game.
// We start by importing our CSS file so Vite knows to include it.
import './style.css'

// --- Step 1: DOM Element Setup ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const gameOverModal = document.getElementById('gameOverModal');
const finalScoreElement = document.getElementById('finalScore');
const restartButton = document.getElementById('restartButton');
// NEW: UI element for power-up status
const powerUpStatusElement = document.getElementById('powerUpStatus');

// --- Step 2: Game State and Configuration ---

// Game State Variables
let playerComet = null;
let obstacles = [];
// NEW: Array for power-ups
let powerUps = []; 
let gravityWell = null;
let score = 0;
let isGameOver = false;
let animationFrameId;

// --- Camera and World Management ---
let cameraX = 0;
let nextObstacleSpawnX = 0;
// NEW: Separate spawn tracker for power-ups
let nextPowerUpSpawnX = 0; 

// --- Zone Management State ---
let currentZone = 1;

// --- Power-up State ---
let activePowerUp = { type: null, timer: 0 };

// Game Configuration Constants
const PLAYER_COMET_RADIUS = 15;
const GRAVITY_INFLUENCE = 0.3;
const SCORE_DIVISOR = 7; 
const WAVE_AMPLITUDE = 0.7;
const WAVE_FREQUENCY = 0.04;

// --- Zone Configuration Object ---
const zoneConfig = {
  1: {
    name: "The Tranquil Void",
    scoreThreshold: 0,
    cometSpeed: 2.5,
    maxSpeed: 3.5,
    backgroundColor: '#0c0a09',
    obstacleColor: '#4f46e5'
  },
  2: {
    name: "The Asteroid Drift",
    scoreThreshold: 1500,
    cometSpeed: 3.5,
    maxSpeed: 4.0,
    backgroundColor: '#26241e',
    obstacleColor: '#a16207'
  },
  3: {
    name: "Singularity's Edge",
    scoreThreshold: 3000,
    cometSpeed: 4.0,
    maxSpeed: 7.0,
    backgroundColor: '#1e1b4b',
    obstacleColor: '#be185d'
  }
};


// --- Step 3: Game Classes (The Blueprints) ---

class PlayerComet {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.baseSpeed = calculateCurrentSpeed();
    this.vx = this.baseSpeed;
    this.vy = 0;
    this.radius = PLAYER_COMET_RADIUS;
    this.trail = [];
    this.waveAngle = 0;
  }

  update() {
    this.baseSpeed = calculateCurrentSpeed();
    this.waveAngle += WAVE_FREQUENCY;

    // NEW: Shrink power-up effect
    this.radius = activePowerUp.type === 'shrink' ? PLAYER_COMET_RADIUS / 2 : PLAYER_COMET_RADIUS;

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
        this.vy = Math.cos(this.waveAngle) * WAVE_AMPLITUDE;
    }

    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    this.vx = (this.vx / currentSpeed) * this.baseSpeed;
    this.vy = (this.vy / currentSpeed) * this.baseSpeed;

    this.x += this.vx;
    this.y += this.vy;

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 15) {
      this.trail.shift();
    }
  }

  draw() {
    // Draw trail
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      const alpha = (i / this.trail.length) * 0.4;
      ctx.beginPath();
      ctx.arc(t.x - cameraX, t.y, this.radius * (i / this.trail.length), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();
    }
    
    // Draw comet head
    const screenX = this.x - cameraX;
    const gradient = ctx.createRadialGradient(screenX, this.y, 0, screenX, this.y, this.radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(1, 'rgba(150, 180, 255, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(screenX, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // NEW: Draw shield effect if active
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
  constructor(worldX, y) {
    this.x = worldX;
    this.y = y;
    this.radius = Math.min(canvas.width, canvas.height) / 3.5;
    this.animation = 0;
  }

  draw() {
    this.animation += 0.05;
    const pulseRadius = this.radius * (0.95 + Math.sin(this.animation) * 0.05);
    const screenX = this.x - cameraX;
    
    const gradient = ctx.createRadialGradient(screenX, this.y, 0, screenX, this.y, pulseRadius);
    gradient.addColorStop(0.5, 'rgba(196, 181, 253, 0.3)');
    gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(screenX, this.y, pulseRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Obstacle {
  constructor(x, y, width, height, type) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.type = type;

    this.initialY = y;
    this.direction = 1;
    this.speedY = 1;

    this.isActive = true;
    this.phaseTimer = 0;
    this.phaseDuration = 120;
    this.warningFrames = 45;
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

// NEW: Class for Power-up items
class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.radius = 12;
        this.colors = {
            shield: { main: '#0ea5e9', glow: '#7dd3fc' },
            shrink: { main: '#16a34a', glow: '#86efac' },
            boost: { main: '#facc15', glow: '#fde047' }
        };
        this.animation = Math.random() * Math.PI * 2;
    }

    draw() {
        this.animation += 0.05;
        const pulse = 0.9 + Math.sin(this.animation) * 0.1;
        const colorSet = this.colors[this.type];

        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x - cameraX, this.y, this.radius * pulse, 0, Math.PI * 2);
        ctx.fillStyle = colorSet.main;
        ctx.shadowColor = colorSet.glow;
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.restore();
    }
}


// --- Step 4: Core Game Logic Functions ---

function resizeCanvas() {
    const maxWidth = 1024;
    const aspectRatio = 16 / 9;
    const container = document.getElementById('app');
    const containerWidth = container.clientWidth;
    const availableHeight = window.innerHeight - document.querySelector('.ui-container').offsetHeight - 48;

    let width = Math.min(maxWidth, containerWidth);
    let height = width / aspectRatio;

    if (height > availableHeight) {
        height = availableHeight;
        width = height * aspectRatio;
    }

    canvas.width = width;
    canvas.height = height;
}

function getObstacleTypeForZone(zoneId) {
    const rand = Math.random();
    const zoneProbabilities = {
        1: { static: 1.0 },
        2: { static: 0.6, vertical: 0.4 },
        3: { static: 0.4, vertical: 0.4, phasing: 0.2 }
    };
    const probs = zoneProbabilities[zoneId] || zoneProbabilities[3];
    let cumulativeProbability = 0;
    for (const type in probs) {
        cumulativeProbability += probs[type];
        if (rand < cumulativeProbability) return type;
    }
    return 'static';
}

function manageObstacles() {
    obstacles = obstacles.filter(obstacle => obstacle.x + obstacle.width > cameraX);
    const spawnAheadPoint = cameraX + canvas.width;
    if (nextObstacleSpawnX < spawnAheadPoint) {
        const obstacleType = getObstacleTypeForZone(currentZone);
        const width = Math.random() * 50 + 25;
        const height = Math.random() * 180 + 50;
        const x = spawnAheadPoint + Math.random() * 100;
        const y = Math.random() * (canvas.height - height);
        obstacles.push(new Obstacle(x, y, width, height, obstacleType));
        nextObstacleSpawnX = x + (Math.random() * 200 + 150);
    }
}

// NEW: Function to manage power-up spawning
function managePowerUps() {
    powerUps = powerUps.filter(p => p.x + p.radius > cameraX);
    const spawnAheadPoint = cameraX + canvas.width;
    if (nextPowerUpSpawnX < spawnAheadPoint) {
        const powerUpTypes = ['shield', 'shrink', 'boost'];
        const type = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
        const x = spawnAheadPoint + Math.random() * 500; // Spawn them further apart
        const y = Math.random() * canvas.height;
        powerUps.push(new PowerUp(x, y, type));
        nextPowerUpSpawnX = x + (Math.random() * 1000 + 800); // Power-ups are rarer
    }
}

// NEW: Function to handle the countdown and effects of active power-ups
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

    // Obstacle Collisions
    for (const obstacle of obstacles) {
        if (obstacle.type === 'phasing' && !obstacle.isActive) continue;
        if (playerComet.x + playerComet.radius > obstacle.x &&
            playerComet.x - playerComet.radius < obstacle.x + obstacle.width &&
            playerComet.y + playerComet.radius > obstacle.y &&
            playerComet.y - playerComet.radius < obstacle.y + obstacle.height) {
            // NEW: Shield power-up check
            if (activePowerUp.type === 'shield') {
                return { obstacle: false, powerUp: null }; // Invincible
            }
            return { obstacle: true, powerUp: null };
        }
    }

    // Wall Collisions
    if (playerComet.y - playerComet.radius < 0 || playerComet.y + playerComet.radius > canvas.height || playerComet.x - playerComet.radius < cameraX) {
        if (activePowerUp.type === 'shield') return { obstacle: false, powerUp: null };
        return { obstacle: true, powerUp: null };
    }

    // NEW: Power-up Collection
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const p = powerUps[i];
        const dx = p.x - playerComet.x;
        const dy = p.y - playerComet.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < playerComet.radius + p.radius) {
            powerUps.splice(i, 1); // Remove the collected power-up
            return { obstacle: false, powerUp: p.type };
        }
    }

    return { obstacle: false, powerUp: null };
}

function calculateCurrentSpeed() {
    const zone = zoneConfig[currentZone];
    const nextZone = zoneConfig[currentZone + 1];
    const startSpeed = zone.cometSpeed;
    const endSpeed = zone.maxSpeed;
    const startScore = zone.scoreThreshold;
    const endScore = nextZone ? nextZone.scoreThreshold : startScore + 3000;

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

function gameOver() {
  isGameOver = true;
  cancelAnimationFrame(animationFrameId);
  finalScoreElement.textContent = Math.floor(score);
  gameOverModal.className = 'modal-visible';
}

function gameLoop() {
  if (isGameOver) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

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
    gameOver();
  } else {
    if (collisionResult.powerUp) {
        activePowerUp.type = collisionResult.powerUp;
        const durations = { shield: 300, shrink: 480, boost: 600 }; // in frames
        activePowerUp.timer = durations[activePowerUp.type];
    }
    
    handleActivePowerUp();

    // CORRECTED: The scoring logic now correctly calculates distance traveled per frame.
    const scoreMultiplier = activePowerUp.type === 'boost' ? 2 : 1;
    // The distance traveled in one frame is the comet's horizontal velocity.
    const frameDistance = playerComet.vx; 
    score += (frameDistance / SCORE_DIVISOR) * scoreMultiplier;
    
    scoreElement.textContent = Math.floor(score);
    checkZoneTransition();
  }
  
  animationFrameId = requestAnimationFrame(gameLoop);
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
        if (isGameOver) return;
        e.preventDefault();
        const pos = getPos(e);
        gravityWell = new GravityWell(pos.x + cameraX, pos.y);
    };
    const moveWell = (e) => {
        if (gravityWell && !isGameOver) {
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
    window.addEventListener('resize', () => { if (!isGameOver) resizeCanvas(); });
    restartButton.addEventListener('click', startGame);
}


// --- Step 6: Game Initialization ---
function startGame() {
  isGameOver = false;
  score = 0;
  currentZone = 1;
  playerComet = null;
  gravityWell = null;
  cameraX = 0;
  obstacles = [];
  powerUps = []; // Reset power-ups
  nextObstacleSpawnX = 0;
  nextPowerUpSpawnX = 500; // Initial power-up spawn delay
  activePowerUp = { type: null, timer: 0 }; // Reset active power-up

  scoreElement.textContent = '0';
  powerUpStatusElement.className = 'powerup-hidden';
  gameOverModal.className = 'modal-hidden';
  
  canvas.style.backgroundColor = zoneConfig[currentZone].backgroundColor;

  resizeCanvas();
  playerComet = new PlayerComet(50, canvas.height / 2);
  
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  gameLoop();
}

// --- And finally, we start the game! ---
setupEventListeners();
startGame();

