// This is the main JavaScript file, the "engine" of our game.
// We start by importing our CSS file so Vite knows to include it.
import './style.css'

// --- Step 1: DOM Element Setup ---
// We need to get references to the HTML elements we're going to interact with.
// This is like giving our script a "handle" to the canvas and UI parts.
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d'); // The context is our "pen" for drawing on the canvas
const scoreElement = document.getElementById('score');
const gameOverModal = document.getElementById('gameOverModal');
const finalScoreElement = document.getElementById('finalScore');
const restartButton = document.getElementById('restartButton');
const gameContainer = document.getElementById('app'); 

// --- Step 2: Game State and Configuration ---
// These are variables that control the game's rules and track its current state.
// It's good practice to keep these at the top for easy tweaking.

// Game State Variables
let playerComet = null;    // Will hold the comet object the player controls
let obstacles = [];        // An array to store all the rectangular obstacles
let gravityWell = null;    // Will hold the gravity well object when the mouse is down
let score = 0;             // The player's current score
let isGameOver = false;    // A boolean flag to check if the game is over
let animationFrameId;      // A reference to the animation loop, so we can stop it

// --- Camera and World Management ---
let cameraX = 0; // The x-position of our virtual camera in the game world.
let nextObstacleSpawnX = 0; // Tracks where to spawn the next obstacle.

// --- Zone Management State ---
let currentZone = 1;

// Game Configuration Constants
const PLAYER_COMET_RADIUS = 15;
const GRAVITY_INFLUENCE = 0.3; // Controls how strongly the well "steers" the comet
const SCORE_DIVISOR = 7; 
// NEW: Configuration for the comet's idle wave movement
const WAVE_AMPLITUDE = 0.7; // How high/low the wave goes
const WAVE_FREQUENCY = 0.04; // How fast the wave oscillates

// --- Zone Configuration Object ---
// This object holds all the unique settings for each zone.
const zoneConfig = {
  1: {
    name: "The Tranquil Void",
    scoreThreshold: 0,
    cometSpeed: 2.5,   // Speed at the START of the zone
    maxSpeed: 3.5,     // Speed at the END of the zone
    backgroundColor: '#0c0a09',
    obstacleColor: '#4f46e5'
  },
  2: {
    name: "The Asteroid Drift",
    scoreThreshold: 1500,  // User-adjusted scoring rate
    cometSpeed: 3.5,    // Starts at the speed the last zone ended
    maxSpeed: 4.0,
    backgroundColor: '#26241e',
    obstacleColor: '#a16207'
  },
  3: {
    name: "Singularity's Edge",
    scoreThreshold: 3000, // User-adjusted scoring rate
    cometSpeed: 4.0,
    maxSpeed: 7.0,     // A much larger speed increase for this zone
    backgroundColor: '#1e1b4b',
    obstacleColor: '#be185d'
  }
};


// --- Step 3: Game Classes (The Blueprints) ---

class PlayerComet {
  constructor(x, y) {
    this.x = x; // World x-coordinate
    this.y = y; // World y-coordinate
    this.baseSpeed = calculateCurrentSpeed();
    this.vx = this.baseSpeed;
    this.vy = 0;
    this.radius = PLAYER_COMET_RADIUS;
    this.trail = [];
    this.waveAngle = 0; // Angle for the sine wave calculation
  }

  update() {
    this.baseSpeed = calculateCurrentSpeed();
    this.waveAngle += WAVE_FREQUENCY;

    // The gravity well's influence overrides the idle wave movement
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
        // When there's no gravity well, apply the gentle wave motion.
        // We only modify the vertical velocity for this effect.
        this.vy = Math.cos(this.waveAngle) * WAVE_AMPLITUDE;
    }

    // This normalization ensures the comet's total speed remains constant,
    // whether it's being pulled by gravity or just in its wave motion.
    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    this.vx = (this.vx / currentSpeed) * this.baseSpeed;
    this.vy = (this.vy / currentSpeed) * this.baseSpeed;

    // Move the comet
    this.x += this.vx;
    this.y += this.vy;

    // Update trail
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 15) { // OPTIMIZED: shorter trail
      this.trail.shift();
    }
  }

  draw() {
    // Draw trail
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      const alpha = (i / this.trail.length) * 0.4; // A slightly dimmer trail
      ctx.beginPath();
      ctx.arc(t.x - cameraX, t.y, this.radius * (i / this.trail.length), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();
    }
    
    // Draw comet head
    const screenX = this.x - cameraX;
    // OPTIMIZED: Simpler gradient for better performance
    const gradient = ctx.createRadialGradient(screenX, this.y, 0, screenX, this.y, this.radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(1, 'rgba(150, 180, 255, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(screenX, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
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
    
    // OPTIMIZED: Simplified the gradient for a massive performance boost.
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
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  draw() {
    const zone = zoneConfig[currentZone];
    ctx.fillStyle = zone.obstacleColor;
    ctx.fillRect(this.x - cameraX, this.y, this.width, this.height);
    ctx.strokeStyle = zone.obstacleColor.replace('e5', 'f8'); 
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x - cameraX, this.y, this.width, this.height);
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

function manageObstacles() {
    obstacles = obstacles.filter(obstacle => obstacle.x + obstacle.width > cameraX);

    const spawnAheadPoint = cameraX + canvas.width;
    if (nextObstacleSpawnX < spawnAheadPoint) {
        const width = Math.random() * 50 + 25;
        const height = Math.random() * 180 + 50;
        const x = spawnAheadPoint + Math.random() * 100;
        const y = Math.random() * (canvas.height - height);
        obstacles.push(new Obstacle(x, y, width, height));

        nextObstacleSpawnX = x + (Math.random() * 200 + 150);
    }
}

function checkCollisions() {
  if (!playerComet) return false;

  for (const obstacle of obstacles) {
    if (playerComet.x + playerComet.radius > obstacle.x &&
        playerComet.x - playerComet.radius < obstacle.x + obstacle.width &&
        playerComet.y + playerComet.radius > obstacle.y &&
        playerComet.y - playerComet.radius < obstacle.y + obstacle.height) {
      return true;
    }
  }
  
  if (playerComet.y - playerComet.radius < 0 || playerComet.y + playerComet.radius > canvas.height) {
    return true;
  }
  if (playerComet.x - playerComet.radius < cameraX) {
      return true;
  }

  return false;
}

function calculateCurrentSpeed() {
    const zone = zoneConfig[currentZone];
    const nextZone = zoneConfig[currentZone + 1];

    const startSpeed = zone.cometSpeed;
    const endSpeed = zone.maxSpeed;
    const startScore = zone.scoreThreshold;
    
    const endScore = nextZone ? nextZone.scoreThreshold : startScore + 3000;

    if (score <= startScore) {
        return startSpeed;
    }
    if (score >= endScore) {
        if (!nextZone) {
            const extraScore = score - endScore;
            return endSpeed + (extraScore * 0.0005);
        }
        return endSpeed;
    }

    const progress = (score - startScore) / (endScore - startScore);
    const currentSpeed = startSpeed + (endSpeed - startSpeed) * progress;

    return currentSpeed;
}

function checkZoneTransition() {
  const nextZoneId = currentZone + 1;
  if (zoneConfig[nextZoneId] && score >= zoneConfig[nextZoneId].scoreThreshold) {
    currentZone = nextZoneId;
    console.log(`Entering Zone ${currentZone}: ${zoneConfig[currentZone].name}`);
    canvas.style.transition = 'background-color 1s ease';
    canvas.style.backgroundColor = zoneConfig[currentZone].backgroundColor;
  }
}

function gameOver() {
  isGameOver = true;
  cancelAnimationFrame(animationFrameId);
  finalScoreElement.textContent = score;
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
  obstacles.forEach(o => o.draw());

  if (gravityWell) {
    gravityWell.draw();
  }

  if (checkCollisions()) {
    gameOver();
  } else {
    score = Math.floor(playerComet.x / SCORE_DIVISOR);
    if (score < 0) score = 0;
    scoreElement.textContent = score;
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

    window.addEventListener('resize', () => {
        if (!isGameOver) {
            resizeCanvas();
        }
    });

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
  nextObstacleSpawnX = 0;

  scoreElement.textContent = '0';
  gameOverModal.className = 'modal-hidden';
  
  canvas.style.backgroundColor = zoneConfig[currentZone].backgroundColor;

  resizeCanvas();
  playerComet = new PlayerComet(50, canvas.height / 2);
  
  gameLoop();
}

// --- And finally, we start the game! ---
setupEventListeners();
startGame();

