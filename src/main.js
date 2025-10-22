/**
 * Gravity Well - Main Game Engine
 * COSMETIC STORE PHASE 3: Trail Rendering & Bug Fix
 * - Modified PlayerComet.draw() to color the trail based on the equipped skin.
 * - Fixed bug preventing leaving Observatory after equipping certain skins.
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
const shopTabs = document.querySelector('.shop-tabs');
const tabContents = document.querySelectorAll('.tab-content');
const cometSkinsGrid = document.getElementById('cometSkinsGrid'); // Cosmetic grid


const gameOverMenuButton = document.getElementById('gameOverMenuButton');
const gameOverObservatoryButton = document.getElementById('gameOverObservatoryButton');

const activeUpgradesContainer = document.getElementById('activeUpgradesContainer');
const magnetIndicator = document.getElementById('magnetIndicator');
const scoreIndicator = document.getElementById('scoreIndicator');
const reviveIndicator = document.getElementById('reviveIndicator');

const tutorialOverlay = document.getElementById('tutorialOverlay');
const tutorialText = document.getElementById('tutorialText');
const skipTutorialButton = document.getElementById('skipTutorialButton');
const tutorialHighlight = document.getElementById('tutorialHighlight');
const tutorialArrow = document.getElementById('tutorialArrow');
const replayTutorialButton = document.getElementById('replayTutorialButton');


// --- Step 2: Game State and Configuration ---
let gameState = 'menu';
let playerData = {
    highScore: 0,
    starFragments: 0,
    hasPlayedBefore: false,
    upgrades: {
        shield: 0,
        magnet: 0,
        score: 0,
        headstart: false,
        revive: false,
    },
    // NEW: Cosmetics Data Structure
    cosmetics: {
        unlocked: ['comet_default'], // Start with default unlocked
        equipped: {
            comet: 'comet_default'
            // obstacle: 'obstacle_default', // Add later
            // background: 'bg_default'     // Add later
        }
    }
};

const upgradeCosts = {
    shield: [100, 250, 500, 1000, 2000],
    magnet: [300, 750, 1500],
    score: [200, 400, 800, 1600, 3200],
    headstart: 150,
    revive: 250
};

// Define Cosmetic Items
const cosmeticItems = {
    comet_default: { name: 'Default', type: 'comet', cost: 0, previewStyle: 'background-color: white;',fillStyle: 'white' },
    comet_inferno: { name: 'Inferno', type: 'comet', cost: 500, previewStyle: 'background: linear-gradient(45deg, #f87171, #fb923c);', fillStyle: 'linear-gradient(45deg, #f87171, #fb923c)' }, // Use gradient for drawing too
    comet_emerald: { name: 'Emerald', type: 'comet', cost: 500, previewStyle: 'background: linear-gradient(45deg, #34d399, #22c55e);', fillStyle: 'linear-gradient(45deg, #34d399, #22c55e)' },
    comet_galaxy: { name: 'Galaxy', type: 'comet', cost: 1000, previewStyle: 'background: radial-gradient(circle, #a855f7, #7e22ce, #3b0764);', fillStyle: 'radial-gradient(circle, #a855f7, #7e22ce, #3b0764)' },
    // Add more skins later
};


let playerComet = null;
let obstacles = [];
let powerUps = [];
let starFragments = [];
let particles = [];
let stars = [];
let menuComet = null; 

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
const HEADSTART_DURATION = 500;
let hasRevive = false;

const PLAYER_COMET_RADIUS = 15;
const GRAVITY_INFLUENCE = 0.2; 
const INERTIAL_DAMPING = 0.98;
const SCORE_DIVISOR = 7;
const WAVE_AMPLITUDE = 0.5;
const WAVE_FREQUENCY = 0.03;

const ZONE_SCORE_INCREMENT = 1500;
const INITIAL_SPEED = 2.5;
const SPEED_INCREMENT_PER_ZONE = 0.5; 
const START_HUE = 240;
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
    playFragmentSound() { if (!this.isInitialized) return; this.synth.triggerAttackRelease("C5", "8n"); },
    playPowerUpSound() { if (!this.isInitialized) return; this.synth.triggerAttackRelease("G5", "8n"); },
    playGameOverSound() { if (!this.isInitialized) return; this.noiseSynth.triggerAttack(); },
    playClickSound() { if (!this.isInitialized) return; this.synth.triggerAttackRelease("C4", "16n"); },
    startMusic() {
        if (!this.isInitialized || this.musicLoop) return;
        Tone.Transport.bpm.value = this.baseBPM;
        const notes = ["C2", "G2", "Eb3", "G2"];
        let noteIndex = 0;
        this.musicLoop = new Tone.Loop(time => {
            this.synth.triggerAttackRelease(notes[noteIndex++ % notes.length], "8n", time);
        }, "4n").start(0);
        Tone.Transport.start();
    },
    updateTempo(newBPM) { if (!this.isInitialized || Tone.Transport.state !== 'started') return; Tone.Transport.bpm.value = newBPM; },
    stopMusic() {
        if (this.musicLoop) {
            this.musicLoop.stop(0);
            this.musicLoop.dispose();
            this.musicLoop = null;
            Tone.Transport.stop();
        }
    }
};

const tutorialManager = {
    isActive: false,
    currentStep: 0,
    isPausedForInstruction: false,
    checkpoint: null,
    steps: [
        { text: "Welcome to Gravity Well! Let's learn the basics.", isCheckpoint: true, autoAdvance: 2000 },
        { text: "Here comes an obstacle. Get ready to dodge it.", isCheckpoint: true, autoAdvance: 2000, setup: () => { obstacles = [new Obstacle(VIRTUAL_WIDTH * 0.7, VIRTUAL_HEIGHT * 0.5, 30, 250, 'static')]; }, target: () => (obstacles.length > 0 ? { x: obstacles[0].x, y: obstacles[0].y + obstacles[0].height / 2 } : null) },
        { text: "CLICK and HOLD the glowing spot to pull your comet upwards.", targetFn: () => ({ x: playerComet.x + 150, y: playerComet.y - 150 }), condition: () => gravityWell !== null },
        { text: "Now release to fly past the obstacle!", onComplete: () => { tutorialManager.isPausedForInstruction = false; }, condition: () => gravityWell === null },
        { text: "Nice one!", isCheckpoint: true, autoAdvance: 1500, condition: () => obstacles.length > 0 && playerComet.x > obstacles[0].x + obstacles[0].width },
        { text: "Let's try another.", isCheckpoint: true, autoAdvance: 2000, setup: (isReset) => { if (!isReset) obstacles = [new Obstacle(playerComet.x + 400, VIRTUAL_HEIGHT * 0.2, 30, 250, 'static')]; }, target: () => (obstacles.length > 0 ? { x: obstacles[0].x, y: obstacles[0].y + obstacles[0].height / 2 } : null) },
        { text: "Guide the comet past this one too.", onComplete: () => { tutorialManager.isPausedForInstruction = false; }, condition: () => obstacles.length > 0 && playerComet.x > obstacles[0].x + obstacles[0].width },
        { text: "See your score? It goes up as you travel forward.", autoAdvance: 3000, target: () => ({ x: 100, y: 30, isUITarget: true }) },
        { text: "Now for a pro move. Let's grab that star fragment.", isCheckpoint: true, autoAdvance: 2000, setup: (isReset) => { if (isReset || starFragments.length === 0) { obstacles = []; starFragments = [new StarFragment(playerComet.x - 100, playerComet.y - 100)]; } }, target: () => (starFragments.length > 0 ? { x: starFragments[0].x, y: starFragments[0].y } : null)},
        { text: "Place a well BEHIND the comet to pull it backward.", targetFn: () => ({ x: playerComet.x - 150, y: playerComet.y }), condition: () => gravityWell !== null && gravityWell.x < playerComet.x, setup: () => { tutorialManager.isPausedForInstruction = false; } },
        { text: "Notice your score stops when moving backward. No cheating!", onComplete: () => { tutorialManager.isPausedForInstruction = false; }, condition: () => starFragments.length === 0 },
        { text: "You've got it! Skills Learned:\n✓ Comet Control\n✓ Dodging\n✓ Backtracking\nGet ready for the real run!", autoAdvance: 5000, onComplete: () => { tutorialManager.end(true); } }
    ],

    start() {
        this.isActive = true; this.currentStep = 0;
        this.runStep();
    },
    advance() {
        const currentStepConfig = this.steps[this.currentStep];
        if (currentStepConfig && currentStepConfig.onComplete) { currentStepConfig.onComplete(); }
        this.currentStep++;
        if (this.currentStep >= this.steps.length) { this.end(true); } else { this.runStep(); }
    },
    runStep(isReset = false) {
        const step = this.steps[this.currentStep];
        tutorialText.innerHTML = step.text.replace(/\n/g, '<br>');
        this.isPausedForInstruction = !step.condition && !step.autoAdvance;
        if (step.isCheckpoint) { this.checkpoint = { step: this.currentStep, cometX: playerComet.x, cometY: playerComet.y, obstacles: obstacles.map(o => new Obstacle(o.x, o.y, o.width, o.height, o.type)), fragments: starFragments.map(sf => new StarFragment(sf.x, sf.y)) }; }
        if (step.setup) step.setup(isReset);
        if (step.autoAdvance) {
            this.isPausedForInstruction = true;
            setTimeout(() => { if (this.isActive && this.currentStep === this.steps.indexOf(step)) { this.advance(); } }, step.autoAdvance);
        }
    },
    checkCondition() {
        if (!this.isActive || this.isPausedForInstruction) return;
        const step = this.steps[this.currentStep];
        if (step.condition && step.condition()) { this.advance(); }
    },
    resetToCheckpoint(failureMessage) {
        if (!this.checkpoint) return;
        this.isPausedForInstruction = true;
        tutorialText.innerHTML = `${failureMessage}<br><br>Let's try that again.`;
        playerComet.x = this.checkpoint.cometX; playerComet.y = this.checkpoint.cometY;
        playerComet.vx = 0; playerComet.vy = 0; playerComet.trail = [];
        obstacles = this.checkpoint.obstacles.map(o => new Obstacle(o.x, o.y, o.width, o.height, o.type));
        // BUG FIX: Ensure fragment is respawned from checkpoint data
        starFragments = this.checkpoint.fragments.map(sf => new StarFragment(sf.x, sf.y)); 
        this.currentStep = this.checkpoint.step;
        setTimeout(() => { if (this.isActive) this.runStep(true); }, 2500);
    },
    end(startNewGame = false) {
        if (!this.isActive) return;
        this.isActive = false; tutorialHighlight.className = 'tutorial-highlight-hidden'; tutorialArrow.className = 'tutorial-arrow-hidden';
        playerData.hasPlayedBefore = true; savePlayerData();
        if (startNewGame) { setGameState('playing'); } else { setGameState('menu'); }
    }
};


// --- Step 3: Game Classes ---
class Star {
    constructor() { this.x = Math.random() * VIRTUAL_WIDTH; this.y = Math.random() * VIRTUAL_HEIGHT; this.z = Math.random() * VIRTUAL_WIDTH; this.radius = 0.5 + Math.random() * 1.5; }
    update(speed) { this.x -= speed * (this.z / VIRTUAL_WIDTH); if (this.x < 0) { this.x = VIRTUAL_WIDTH; this.y = Math.random() * VIRTUAL_HEIGHT; } }
    draw() { ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; ctx.fill(); }
}

class PlayerComet {
    constructor(x, y) { this.x = x; this.y = y; this.baseSpeed = calculateCurrentSpeed(); this.vx = this.baseSpeed; this.vy = 0; this.radius = PLAYER_COMET_RADIUS; this.trail = []; this.waveAngle = 0; this.orbiters = []; }
    update() {
        if (isHeadstarting) { this.baseSpeed = 30; } 
        else if (!tutorialManager.isActive || !tutorialManager.isPausedForInstruction) { this.baseSpeed = calculateCurrentSpeed(); }
        else { this.baseSpeed = 0; }

        this.waveAngle += WAVE_FREQUENCY;
        this.radius = activePowerUp.type === 'shrink' ? PLAYER_COMET_RADIUS / 2 : PLAYER_COMET_RADIUS;
        this.vy += (Math.cos(this.waveAngle) * WAVE_AMPLITUDE - this.vy) * (1 - INERTIAL_DAMPING);
        if (gravityWell && !isHeadstarting) {
            const dx = gravityWell.x - this.x; const dy = gravityWell.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0.01 && dist < gravityWell.radius) {
                this.vx += (dx / dist) * GRAVITY_INFLUENCE;
                this.vy += (dy / dist) * GRAVITY_INFLUENCE;
            }
        }
        const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (currentSpeed > 0) {
            this.vx = (this.vx / currentSpeed) * this.baseSpeed;
            this.vy = (this.vy / currentSpeed) * this.baseSpeed;
        } else { this.vx = this.baseSpeed; this.vy = 0; }
        if (!isHeadstarting && (!tutorialManager.isActive || !tutorialManager.isPausedForInstruction)) { this.x += this.vx; this.y += this.vy; }
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 15) this.trail.shift();
        this.orbiters.forEach(orb => orb.update());
    }
    
    // Helper function to get the primary color from a skin's fillStyle
    getPrimarySkinColor(skinStyle) {
         if (skinStyle.startsWith('linear-gradient') || skinStyle.startsWith('radial-gradient')) {
            const colors = skinStyle.match(/#[0-9a-f]{6}|#[0-9a-f]{3}|rgba?\([^)]+\)/gi);
            return colors ? colors[0] : 'white'; // Return first color or fallback
        }
        return skinStyle; // Solid color
    }

    draw() {
        const screenX = this.x - cameraX;
        const equippedSkinId = playerData.cosmetics.equipped.comet;
        const skin = cosmeticItems[equippedSkinId] || cosmeticItems['comet_default'];
        const primaryColor = this.getPrimarySkinColor(skin.fillStyle); // Get primary color for trail

        // Draw Trail using primary skin color
        this.trail.forEach((t, i) => {
            ctx.beginPath();
            ctx.arc(t.x - cameraX, t.y, this.radius * (i / this.trail.length), 0, Math.PI * 2);
            // Apply primary color with alpha based on trail position
            const alpha = (i / this.trail.length) * 0.4;
             // Need to handle color parsing if it's hex/rgb etc.
            let trailColor = primaryColor;
             if (trailColor.startsWith('#')) { // Simple hex handling
                 const r = parseInt(trailColor.slice(1, 3), 16);
                 const g = parseInt(trailColor.slice(3, 5), 16);
                 const b = parseInt(trailColor.slice(5, 7), 16);
                 ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
             } else if (trailColor.startsWith('rgb')) { // Simple rgb/rgba handling
                 trailColor = trailColor.replace(/rgba?\(|\)/g, '');
                 const parts = trailColor.split(',');
                 ctx.fillStyle = `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
             } else { // Assume solid color name like 'white'
                  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`; // Fallback to white for simplicity
                  // A more robust solution would map color names to RGB
             }
            ctx.fill();
        });
        
        // Draw Comet Body based on skin
         ctx.beginPath();
         ctx.arc(screenX, this.y, this.radius, 0, Math.PI * 2);

        // Apply skin style
        // BUG FIX: More robust gradient handling
        try {
            if (skin.fillStyle.startsWith('linear-gradient')) {
                const colors = skin.fillStyle.match(/#[0-9a-f]{6}|#[0-9a-f]{3}|rgba?\([^)]+\)/gi);
                if(colors && colors.length >= 2){
                    const gradient = ctx.createLinearGradient(screenX - this.radius, this.y, screenX + this.radius, this.y);
                    gradient.addColorStop(0, colors[0]);
                    gradient.addColorStop(1, colors[1]);
                    ctx.fillStyle = gradient;
                } else { ctx.fillStyle = 'white'; }
            } else if (skin.fillStyle.startsWith('radial-gradient')) {
                 const colors = skin.fillStyle.match(/#[0-9a-f]{6}|#[0-9a-f]{3}|rgba?\([^)]+\)/gi);
                 if (colors && colors.length >= 2) {
                     const gradient = ctx.createRadialGradient(screenX, this.y, this.radius * 0.1, screenX, this.y, this.radius);
                     gradient.addColorStop(0, colors[0]);
                     gradient.addColorStop(0.5, colors[1]);
                     gradient.addColorStop(1, colors[2] || colors[1]); 
                     ctx.fillStyle = gradient;
                 } else { ctx.fillStyle = 'white'; }
            } else {
                 ctx.fillStyle = skin.fillStyle; // Solid color
            }
        } catch (e) {
            console.error("Error applying skin style:", skin.fillStyle, e);
            ctx.fillStyle = 'white'; // Fallback on error
        }
        ctx.fill();


        // Draw Score Bonus Indicator (if applicable)
        if (playerData.upgrades.score > 0) {
            const indicatorX = screenX + this.radius * 0.8, indicatorY = this.y - this.radius * 0.8;
            ctx.fillStyle = 'rgba(253, 224, 71, 0.5)'; ctx.beginPath(); ctx.arc(indicatorX, indicatorY, this.radius * 0.6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(indicatorX, indicatorY, this.radius * 0.4, 0, Math.PI * 2); ctx.fill();
        }
        // Draw Shield (if applicable)
        if (activePowerUp.type === 'shield' || isHeadstarting) {
            ctx.beginPath(); ctx.arc(screenX, this.y, this.radius + 5, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)'; ctx.lineWidth = 3; ctx.stroke();
        }
        // Draw Orbiters
        this.orbiters.forEach(orb => orb.draw(screenX, this.y));
    }
}

class Orbiter {
    constructor(distance, color) { this.distance = distance; this.color = color; this.angle = Math.random() * Math.PI * 2; this.speed = 0.02 + Math.random() * 0.02; }
    update() { this.angle += this.speed; }
    draw(cometX, cometY) {
        const x = cometX + Math.cos(this.angle) * this.distance; const y = cometY + Math.sin(this.angle) * this.distance;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, 10);
        gradient.addColorStop(0, this.color); gradient.addColorStop(0.5, this.color); gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
}
class GravityWell {
    constructor(worldX, y) { this.x = worldX; this.y = y; this.radius = VIRTUAL_HEIGHT / 3.5; }
    draw() {
        const screenX = this.x - cameraX;
        ctx.beginPath(); ctx.arc(screenX, this.y, this.radius, 0, Math.PI * 2); ctx.fillStyle = 'rgba(196, 181, 253, 0.15)'; ctx.fill();
        ctx.beginPath(); ctx.arc(screenX, this.y, this.radius * 0.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(196, 181, 253, 0.1)'; ctx.fill();
    }
}
class Obstacle {
    constructor(x, y, width, height, type) { this.x = x; this.y = y; this.width = width; this.height = height; this.type = type; this.initialY = y; this.direction = 1; this.speedY = 1; this.isActive = true; this.phaseTimer = 0; this.phaseDuration = 120; this.warningFrames = 45; }
    update() {
        if (this.type === 'vertical') { this.y += this.speedY * this.direction; if (Math.abs(this.y - this.initialY) > 50) this.direction *= -1; }
        else if (this.type === 'phasing') { this.phaseTimer++; if (this.phaseTimer > this.phaseDuration) { this.phaseTimer = 0; this.isActive = !this.isActive; } }
    }
    draw() {
        let color = currentZoneColors.obstacle; let shouldDraw = true;
        if (this.type === 'phasing' && !this.isActive) {
            const timeToActivate = this.phaseDuration - this.phaseTimer;
            if (timeToActivate < this.warningFrames) { color = `rgba(239, 68, 68, ${Math.abs(Math.sin(this.phaseTimer * 0.2))})`; }
            else { shouldDraw = false; }
        }
        if (shouldDraw) {
            ctx.fillStyle = color; ctx.fillRect(this.x - cameraX, this.y, this.width, this.height);
            if (this.type !== 'phasing' || this.isActive) { ctx.strokeStyle = currentZoneColors.stroke; ctx.lineWidth = 2; ctx.strokeRect(this.x - cameraX, this.y, this.width, this.height); }
        }
    }
}
class PowerUp {
    constructor(x, y, type) { this.x = x; this.y = y; this.type = type; this.radius = 12; this.colors = { shield: { main: '#0ea5e9', glow: 'rgba(125, 211, 252, 0.5)' }, shrink: { main: '#16a34a', glow: 'rgba(134, 239, 172, 0.5)' }, boost: { main: '#facc15', glow: 'rgba(253, 224, 71, 0.5)' } }; this.animation = Math.random() * Math.PI * 2; }
    draw() {
        this.animation += 0.05; const pulse = 0.9 + Math.sin(this.animation) * 0.1; const colorSet = this.colors[this.type]; const screenX = this.x - cameraX;
        ctx.beginPath(); ctx.arc(screenX, this.y, this.radius * pulse * 1.5, 0, Math.PI * 2); ctx.fillStyle = colorSet.glow; ctx.fill();
        ctx.beginPath(); ctx.arc(screenX, this.y, this.radius * pulse, 0, Math.PI * 2); ctx.fillStyle = colorSet.main; ctx.fill();
    }
}
class StarFragment {
    constructor(x, y) { this.x = x; this.y = y; this.radius = 8; this.animation = Math.random() * Math.PI * 2; this.vx = 0; this.vy = 0; }
    update() {
        const magnetLevel = playerData.upgrades.magnet || 0;
        if (magnetLevel > 0 && playerComet) {
            const magnetRange = 50 + magnetLevel * 25; const dx = playerComet.x - this.x; const dy = playerComet.y - this.y; const distSq = dx * dx + dy * dy;
            if (distSq < magnetRange * magnetRange) { const dist = Math.sqrt(distSq); this.vx += (dx / dist) * 5; this.vy += (dy / dist) * 5; }
        }
        this.vx *= 0.95; this.vy *= 0.95; this.x += this.vx; this.y += this.vy;
    }
    draw() {
        this.animation += 0.07; const scale = 1 + Math.sin(this.animation) * 0.1; const screenX = this.x - cameraX;
        ctx.save(); ctx.translate(screenX, this.y); ctx.rotate(this.animation * 0.5); ctx.scale(scale, scale); ctx.fillStyle = '#facc15'; ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) { let angle = (i / 5) * 2 * Math.PI; ctx.lineTo(Math.cos(angle) * this.radius, Math.sin(angle) * this.radius); angle += (1 / 5) * Math.PI; ctx.lineTo(Math.cos(angle) * (this.radius / 2), Math.sin(angle) * (this.radius / 2)); }
        ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
}
class Particle {
    constructor(x, y, color) { this.x = x; this.y = y; this.color = color; this.radius = Math.random() * 2 + 1; this.lifespan = 45; this.vx = (Math.random() - 0.5) * 3; this.vy = (Math.random() - 0.5) * 3; }
    update() { this.x += this.vx; this.y += this.vy; this.lifespan--; }
    draw() { ctx.beginPath(); ctx.arc(this.x - cameraX, this.y, this.radius, 0, Math.PI * 2); ctx.fillStyle = this.color; ctx.globalAlpha = this.lifespan / 45; ctx.fill(); ctx.globalAlpha = 1.0; }
}

// --- Step 4: Core Game Logic Functions ---
function savePlayerData() { try { localStorage.setItem('gravityWellSaveData', JSON.stringify(playerData)); } catch (e) { console.error("Could not save player data.", e); } }
function loadPlayerData() {
    try {
        const savedData = localStorage.getItem('gravityWellSaveData');
        const defaultPlayerData = { highScore: 0, starFragments: 0, hasPlayedBefore: false, upgrades: { shield: 0, magnet: 0, score: 0, headstart: false, revive: false }, cosmetics: { unlocked: ['comet_default'], equipped: { comet: 'comet_default' } } };
        if (savedData) { 
            const loaded = JSON.parse(savedData); 
            // Ensure cosmetics structure exists
            if (!loaded.cosmetics) loaded.cosmetics = defaultPlayerData.cosmetics;
            if (!loaded.cosmetics.unlocked) loaded.cosmetics.unlocked = ['comet_default'];
            if (!loaded.cosmetics.equipped) loaded.cosmetics.equipped = { comet: 'comet_default' };
             playerData = { ...defaultPlayerData, ...loaded }; 
        } else {
             playerData = defaultPlayerData;
        }
    } catch (e) { console.error("Could not load player data.", e); playerData = { highScore: 0, starFragments: 0, hasPlayedBefore: false, upgrades: { shield: 0, magnet: 0, score: 0, headstart: false, revive: false }, cosmetics: { unlocked: ['comet_default'], equipped: { comet: 'comet_default' } } }; }
}
function updateObservatoryUI() {
    shopFragmentsDisplay.textContent = playerData.starFragments;
    
    // Update Upgrades Tab
    Object.keys(upgradeCosts).forEach(id => {
        if (Array.isArray(upgradeCosts[id])) {
            const level = playerData.upgrades[id] || 0; const item = document.getElementById(`upgrade-${id}`); if (!item) return;
            const button = item.querySelector('button'); const levelDisplay = item.querySelector('.upgrade-level'); const maxLevel = upgradeCosts[id].length;
            if (level >= maxLevel) { button.textContent = 'Max Level'; button.disabled = true; } 
            else { const cost = upgradeCosts[id][level]; button.textContent = `Buy (${cost})`; button.disabled = playerData.starFragments < cost; }
            levelDisplay.textContent = `Level ${level}/${maxLevel}`;
        } else {
            const item = document.getElementById(`utility-${id}`); if (!item) return;
            const button = item.querySelector('button');
            if (playerData.upgrades[id]) { button.textContent = 'Owned'; button.disabled = true; } 
            else { const cost = upgradeCosts[id]; button.textContent = `Buy (${cost})`; button.disabled = playerData.starFragments < cost; }
        }
    });

    // Update Cosmetics Tab
    cometSkinsGrid.innerHTML = ''; // Clear existing items
    Object.keys(cosmeticItems).forEach(id => {
        if (cosmeticItems[id].type === 'comet') {
            const item = cosmeticItems[id];
            const div = document.createElement('div');
            div.className = 'cosmetic-item';
            
            const preview = document.createElement('div');
            preview.className = 'cosmetic-preview';
            preview.style.cssText = item.previewStyle;
            
            const name = document.createElement('strong');
            name.textContent = item.name;
            
            const button = document.createElement('button');
            button.dataset.cosmeticId = id;

            if (playerData.cosmetics.equipped.comet === id) {
                button.className = 'btn equip-btn';
                button.textContent = 'Equipped';
                button.disabled = true;
            } else if (playerData.cosmetics.unlocked.includes(id)) {
                button.className = 'btn equip-btn';
                button.textContent = 'Equip';
                button.onclick = () => equipCosmetic(id);
            } else {
                 button.className = 'btn buy-cosmetic-btn';
                 button.textContent = `Buy (${item.cost} ★)`;
                 button.disabled = playerData.starFragments < item.cost;
                 button.onclick = () => buyCosmetic(id);
            }
            
            div.appendChild(preview);
            div.appendChild(name);
            div.appendChild(button);
            cometSkinsGrid.appendChild(div);
        }
    });
}

function setGameState(newState) {
    const oldState = gameState; gameState = newState;
    mainMenu.className = gameOverModal.className = pauseMenu.className = observatory.className = tutorialOverlay.className = 'modal modal-hidden';
    tutorialHighlight.className = 'tutorial-highlight-hidden'; tutorialArrow.className = 'tutorial-arrow-hidden';
    inGameUi.style.display = 'none'; appContainer.classList.remove('screen-shake');
    if (newState === 'menu') {
        audioManager.stopMusic(); mainMenu.className = 'modal modal-visible';
        highScoreDisplay.textContent = playerData.highScore; starFragmentsDisplay.textContent = playerData.starFragments;
        if (!menuComet) menuComet = { x: VIRTUAL_WIDTH / 2, y: VIRTUAL_HEIGHT / 2, angle: 0, trail: [] };
        if (oldState !== 'menu' || !animationFrameId) gameLoop();
    } else if (newState === 'playing') {
        inGameUi.style.display = 'flex'; runFragmentsContainer.className = '';
        if (oldState === 'paused') { audioManager.startMusic(); if (!animationFrameId) gameLoop(); } 
        else { setTimeout(startGame, 350); }
    } else if (newState === 'paused') {
        audioManager.stopMusic(); inGameUi.style.display = 'flex'; pauseMenu.className = 'modal modal-visible';
    } else if (newState === 'tutorial') {
        inGameUi.style.display = 'flex'; tutorialOverlay.className = 'modal modal-visible'; setTimeout(startTutorial, 350);
    } else if (newState === 'game-over') {
        if (playerComet) createExplosion(playerComet.x, playerComet.y, 10, 'white');
        audioManager.stopMusic(); audioManager.playGameOverSound(); inGameUi.style.display = 'flex'; runFragmentsContainer.className = 'run-fragments-hidden';
        appContainer.classList.add('screen-shake');
        if (score > playerData.highScore) playerData.highScore = Math.floor(score);
        playerData.starFragments += fragmentsThisRun;
        savePlayerData();
        finalScoreElement.textContent = Math.floor(score); fragmentsEarnedDisplay.textContent = fragmentsThisRun;
        gameOverModal.className = 'modal modal-visible';
    } else if (newState === 'observatory') {
        updateObservatoryUI(); observatory.className = 'modal modal-visible';
    }
}

function initNewRun(isTutorial = false) {
    score = 0; fragmentsThisRun = 0; maxDistanceReached = 0; lastZoneIndex = -1; cameraX = 0;
    obstacles = []; powerUps = []; starFragments = []; particles = [];
    nextObstacleSpawnX = VIRTUAL_WIDTH; nextPowerUpSpawnX = VIRTUAL_WIDTH / 2; nextFragmentSpawnX = VIRTUAL_WIDTH / 3;
    activePowerUp = { type: null, timer: 0 };
    runFragmentsDisplay.textContent = '0'; scoreElement.textContent = '0';
    if (!isTutorial) {
        isHeadstarting = playerData.upgrades.headstart;
        if (isHeadstarting) { headstartTimer = 0; playerData.upgrades.headstart = false; savePlayerData(); }
        hasRevive = playerData.upgrades.revive;
        if (hasRevive) { playerData.upgrades.revive = false; savePlayerData(); }
    } else { isHeadstarting = false; hasRevive = false; }
    updateUpgradeIndicators();
    playerComet = new PlayerComet(150, VIRTUAL_HEIGHT / 2);
    checkZoneTransition();
}

function startGame() { resizeCanvas(); initNewRun(); audioManager.startMusic(); if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; } gameLoop(); }
function startTutorial() { resizeCanvas(); initNewRun(true); audioManager.stopMusic(); if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; } tutorialManager.start(); gameLoop(); }

function gameLoop() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId); // Prevent multiple loops

    if ((gameState === 'playing' || gameState === 'tutorial') && !isGameOver) {
        if (gameState === 'playing') updateGame();
        else updateTutorial();
        drawGame();
    } else if (gameState === 'menu') {
        updateMenu(); drawMenu();
    }
    
    if (gameState !== 'game-over' && gameState !== 'paused') {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}


function updateGame() {
    if (!playerComet) return;
    if (isHeadstarting) {
        headstartTimer++; const progress = headstartTimer / HEADSTART_DURATION;
        playerComet.x = maxDistanceReached = (1 - Math.pow(1 - progress, 3)) * (ZONE_SCORE_INCREMENT * SCORE_DIVISOR);
        if (headstartTimer >= HEADSTART_DURATION) { isHeadstarting = false; activePowerUp.type = 'shield'; activePowerUp.timer = 300; }
    }
    cameraX = playerComet.x - (VIRTUAL_WIDTH / 3);
    playerComet.update();
    manageObstacles(); managePowerUps(); manageStarFragments(); manageParticles();
    stars.forEach(s => s.update(playerComet.vx));
    obstacles.forEach(o => o.update());
    starFragments.forEach(sf => sf.update());
    const collisionResult = checkCollisions();
    if (collisionResult.obstacle) { if (hasRevive) revivePlayer(); else { setGameState('game-over'); return; } }
    if (collisionResult.fragment) { fragmentsThisRun++; runFragmentsDisplay.textContent = fragmentsThisRun; audioManager.playFragmentSound(); createExplosion(collisionResult.item.x, collisionResult.item.y, 3, '#facc15'); }
    if (collisionResult.powerUp) { activePowerUp.type = collisionResult.powerUp; let shieldDuration = 300 * (1 + playerData.upgrades.shield * 0.1); activePowerUp.timer = { shield: shieldDuration, shrink: 480, boost: 600 }[activePowerUp.type]; audioManager.playPowerUpSound(); createExplosion(collisionResult.item.x, collisionResult.item.y, 5, new PowerUp(0, 0, collisionResult.powerUp).colors[collisionResult.powerUp].main); }
    handleActivePowerUp();
    if (!isHeadstarting) {
        if (playerComet.vx > 0) {
            const distanceGained = Math.max(0, playerComet.x - maxDistanceReached);
            if (distanceGained > 0) { const scoreMultiplier = 1 + (playerData.upgrades.score * 0.05) + (activePowerUp.type === 'boost' ? 1 : 0); score += (distanceGained / SCORE_DIVISOR) * scoreMultiplier; }
        }
        maxDistanceReached = Math.max(maxDistanceReached, playerComet.x);
    } else { score = (maxDistanceReached / SCORE_DIVISOR); }
    scoreElement.textContent = Math.floor(score);
    checkZoneTransition();
}

function drawTutorialArrow(target) {
    if (!target) {
        tutorialArrow.className = 'tutorial-arrow-hidden';
        return;
    }
    let screenX = (target.x - cameraX) * scale;
    let screenY = target.y * scale;

    if (target.isUITarget) {
        screenX = target.x * scale;
        screenY = target.y * scale;
    }
    
    const arrowSize = 60;
    const angle = Math.atan2(screenY - (canvas.height / 2), screenX - (canvas.width / 2));
    
    const radius = Math.min(canvas.width, canvas.height) / 2 - arrowSize * 1.5; // Adjusted radius
    const arrowX = (canvas.width / 2) + Math.cos(angle) * radius;
    const arrowY = (canvas.height / 2) + Math.sin(angle) * radius;

    tutorialArrow.style.left = `${arrowX}px`;
    tutorialArrow.style.top = `${arrowY}px`;
    tutorialArrow.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
    tutorialArrow.className = 'tutorial-arrow';
}

function drawGame() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.scale(scale, scale);
    ctx.fillStyle = currentZoneColors.background || '#0c0a09';
    ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    stars.forEach(s => s.draw());
    if (playerComet) playerComet.draw(); 
    obstacles.forEach(o => o.draw()); powerUps.forEach(p => p.draw()); starFragments.forEach(sf => sf.draw()); particles.forEach(p => p.draw());
    if (gravityWell && !isHeadstarting) gravityWell.draw();
    if (tutorialManager.isActive) {
        const step = tutorialManager.steps[tutorialManager.currentStep];
        if (step.targetFn) {
            const targetPos = step.targetFn(); const screenX = (targetPos.x - cameraX) * scale; const screenY = targetPos.y * scale;
            tutorialHighlight.style.left = `${screenX}px`; tutorialHighlight.style.top = `${screenY}px`;
            tutorialHighlight.className = 'tutorial-highlight';
            tutorialArrow.className = 'tutorial-arrow-hidden';
        } else if (step.target) {
             const targetPos = step.target(); // Check if target exists
             if(targetPos) {
                 drawTutorialArrow(targetPos);
             } else {
                 tutorialArrow.className = 'tutorial-arrow-hidden';
             }
            tutorialHighlight.className = 'tutorial-highlight-hidden';
        } else {
            tutorialHighlight.className = 'tutorial-highlight-hidden';
            tutorialArrow.className = 'tutorial-arrow-hidden';
        }
    }
    ctx.restore();
}

function updateTutorial() {
    if (!playerComet || !tutorialManager.isActive) return;
    cameraX = playerComet.x - (VIRTUAL_WIDTH / 4);
    playerComet.update();
    obstacles.forEach(o => o.update());
    manageParticles();
    starFragments.forEach(sf => sf.update());
    tutorialManager.checkCondition();
    if (playerComet.vx > 0) { maxDistanceReached = Math.max(maxDistanceReached, playerComet.x); score = (maxDistanceReached - 150) / SCORE_DIVISOR; scoreElement.textContent = Math.floor(score); }
    const collisionResult = checkCollisions();
    if (collisionResult.obstacle) { tutorialManager.resetToCheckpoint("Oops, you hit an obstacle!"); }
    if (collisionResult.fragment) { audioManager.playFragmentSound(); tutorialManager.advance(); }
}

function updateMenu() {
    if (!menuComet) return; stars.forEach(s => s.update(0.5)); menuComet.angle += 0.01;
    menuComet.x = VIRTUAL_WIDTH / 2 + Math.cos(menuComet.angle) * (VIRTUAL_WIDTH * 0.3);
    menuComet.y = VIRTUAL_HEIGHT / 2 + Math.sin(menuComet.angle * 2) * (VIRTUAL_HEIGHT * 0.2);
    menuComet.trail.push({ x: menuComet.x, y: menuComet.y });
    if (menuComet.trail.length > 20) menuComet.trail.shift();
}
function drawMenu() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.scale(scale, scale); ctx.fillStyle = '#0c0a09'; ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    stars.forEach(s => s.draw());
    if (menuComet) {
        menuComet.trail.forEach((t, i) => {
            ctx.beginPath(); ctx.arc(t.x, t.y, PLAYER_COMET_RADIUS * (i / menuComet.trail.length), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${(i / menuComet.trail.length) * 0.4})`; ctx.fill();
        });
        ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(menuComet.x, menuComet.y, PLAYER_COMET_RADIUS, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

function resizeCanvas() { const { clientWidth, clientHeight } = appContainer; scale = Math.min(clientWidth / VIRTUAL_WIDTH, clientHeight / VIRTUAL_HEIGHT); canvas.width = VIRTUAL_WIDTH * scale; canvas.height = VIRTUAL_HEIGHT * scale; }
function getObstacleTypeForZone() { const zoneIndex = Math.floor(score / ZONE_SCORE_INCREMENT); const rand = Math.random(); if (zoneIndex < 1) return 'static'; if (zoneIndex < 3) return rand < 0.6 ? 'static' : 'vertical'; return rand < 0.4 ? 'static' : (rand < 0.8 ? 'vertical' : 'phasing'); }
function manageObstacles() {
    if (!playerComet || gameState === 'tutorial') return;
    obstacles = obstacles.filter(o => o.x + o.width > cameraX);
    const spawnAheadPoint = cameraX + VIRTUAL_WIDTH;
    if (nextObstacleSpawnX < spawnAheadPoint) {
        const zoneIndex = Math.floor(score / ZONE_SCORE_INCREMENT);
        const minDistance = Math.max(80, 200 - zoneIndex * 15);
        const randomDistance = Math.max(50, 150 - zoneIndex * 10);
        const x = nextObstacleSpawnX + minDistance + Math.random() * randomDistance; 
        const width = Math.random() * 50 + 25; const height = Math.random() * 180 + 50;
        const y = Math.random() * (VIRTUAL_HEIGHT - height);
        obstacles.push(new Obstacle(x, y, width, height, getObstacleTypeForZone()));
        nextObstacleSpawnX = x;
    }
}
function managePowerUps() {
    if (!playerComet || gameState === 'tutorial') return;
    powerUps = powerUps.filter(p => p.x + p.radius > cameraX);
    const spawnAheadPoint = cameraX + VIRTUAL_WIDTH;
    if (nextPowerUpSpawnX < spawnAheadPoint) {
        for (let attempts = 0; attempts < 5; attempts++) {
            const x = spawnAheadPoint + Math.random() * 500; const y = Math.random() * VIRTUAL_HEIGHT;
            if (!obstacles.some(obs => x < obs.x + obs.width && x + 24 > obs.x && y < obs.y + obs.height && y + 24 > obs.y)) {
                const type = ['shield', 'shrink', 'boost'][Math.floor(Math.random() * 3)];
                powerUps.push(new PowerUp(x, y, type));
                break;
            }
        }
        nextPowerUpSpawnX = spawnAheadPoint + (Math.random() * 1000 + 800);
    }
}
function manageStarFragments() {
    if (!playerComet || gameState === 'tutorial') return;
    starFragments = starFragments.filter(sf => sf.x + sf.radius > cameraX);
    const spawnAheadPoint = cameraX + VIRTUAL_WIDTH;
    if (nextFragmentSpawnX < spawnAheadPoint) {
        const clusterSize = Math.floor(Math.random() * 4) + 3;
        const startX = spawnAheadPoint + 100;
        const startY = VIRTUAL_HEIGHT * 0.2 + Math.random() * VIRTUAL_HEIGHT * 0.6;
        const angle = (Math.random() - 0.5) * Math.PI / 4;
        const potentialFragments = Array.from({length: clusterSize}, (_, i) => ({ x: startX + i * 40, y: startY + Math.sin(i * 0.5 + angle) * 50 }));
        if (!potentialFragments.some(pf => obstacles.some(obs => pf.x > obs.x && pf.x < obs.x + obs.width && pf.y > obs.y && pf.y < obs.y + obs.height))) {
            potentialFragments.forEach(pos => starFragments.push(new StarFragment(pos.x, pos.y)));
        }
        nextFragmentSpawnX = startX + (Math.random() * 600 + 400);
    }
}
function createExplosion(x, y, count, color) { for (let i = 0; i < count; i++) { particles.push(new Particle(x, y, color)); } }
function manageParticles() { particles = particles.filter(p => { p.update(); return p.lifespan > 0; }); }
function handleActivePowerUp() {
    if (activePowerUp.type && activePowerUp.timer > 0) {
        activePowerUp.timer--;
        powerUpStatusElement.textContent = `${activePowerUp.type.toUpperCase()}: ${(activePowerUp.timer / 60).toFixed(1)}s`;
        powerUpStatusElement.className = 'powerup-active';
        if (activePowerUp.timer <= 0) { activePowerUp.type = null; powerUpStatusElement.className = 'powerup-hidden'; }
    }
}
function checkCollisions() {
    if (!playerComet) return {};
    for (let i = starFragments.length - 1; i >= 0; i--) { 
        const sf = starFragments[i]; 
        if ((sf.x - playerComet.x)**2 + (sf.y - playerComet.y)**2 < (playerComet.radius + sf.radius)**2) { 
            // BUG FIX: Must return the *spliced* item, not the item before splicing
            return { fragment: true, item: starFragments.splice(i, 1)[0] }; 
        } 
    }
    for (let i = powerUps.length - 1; i >= 0; i--) { const p = powerUps[i]; if ((p.x - playerComet.x)**2 + (p.y - playerComet.y)**2 < (playerComet.radius + p.radius)**2) { return { powerUp: p.type, item: powerUps.splice(i, 1)[0] }; } }
    if (activePowerUp.type !== 'shield' && !isHeadstarting) {
        if (playerComet.y - playerComet.radius < 0 || playerComet.y + playerComet.radius > VIRTUAL_HEIGHT || playerComet.x - playerComet.radius < cameraX) { return { obstacle: true }; }
        for (const obs of obstacles) { if (obs.isActive && playerComet.x + playerComet.radius > obs.x && playerComet.x - playerComet.radius < obs.x + obs.width && playerComet.y + playerComet.radius > obs.y && playerComet.y - playerComet.radius < obs.y + obs.height) { return { obstacle: true }; } }
    }
    return {};
}
function revivePlayer() { hasRevive = false; updateUpgradeIndicators(); createExplosion(playerComet.x, playerComet.y, 30, '#0ea5e9'); activePowerUp.type = 'shield'; activePowerUp.timer = 180; obstacles = obstacles.filter(o => o.x < cameraX || o.x > cameraX + VIRTUAL_WIDTH); }
function calculateCurrentSpeed() { if(gameState === 'tutorial') return INITIAL_SPEED * 0.8; const zoneIndex = Math.floor(score / ZONE_SCORE_INCREMENT); return INITIAL_SPEED + (zoneIndex * SPEED_INCREMENT_PER_ZONE); }
function updateMusicTempo() { if (!playerComet) return; const speedRatio = Math.max(0, Math.min(1, (calculateCurrentSpeed() - INITIAL_SPEED) / (10 - INITIAL_SPEED))); audioManager.updateTempo(audioManager.baseBPM + (speedRatio * 80)); }
function checkZoneTransition() {
    const zoneIndex = Math.floor(score / ZONE_SCORE_INCREMENT);
    if (zoneIndex !== lastZoneIndex) {
        const hue = (START_HUE + (zoneIndex * HUE_INCREMENT_PER_ZONE)) % 360;
        currentZoneColors = { background: `hsla(${hue}, 60%, 15%, 0.8)`, obstacle: `hsl(${hue + 20}, 80%, 60%)`, stroke: `hsl(${hue + 20}, 80%, 70%)` };
        if (playerComet) { playerComet.orbiters.push(new Orbiter(playerComet.radius + 10 + (playerComet.orbiters.length * 5), currentZoneColors.obstacle)); }
        updateMusicTempo();
        lastZoneIndex = zoneIndex;
    }
}
function updateUpgradeIndicators() { powerUpStatusElement.className = 'powerup-hidden'; activeUpgradesContainer.style.display = 'flex'; magnetIndicator.style.display = playerData.upgrades.magnet > 0 ? 'inline-block' : 'none'; scoreIndicator.style.display = playerData.upgrades.score > 0 ? 'inline-block' : 'none'; reviveIndicator.style.display = hasRevive ? 'inline-block' : 'none'; }
function setupEventListeners() {
    const getPos = (e) => { const rect = canvas.getBoundingClientRect(); const clientX = e.clientX || e.touches[0].clientX; const clientY = e.clientY || e.touches[0].clientY; return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale }; };
    const startWell = (e) => { if ((gameState !== 'playing' && gameState !== 'tutorial') || isHeadstarting) return; e.preventDefault(); const pos = getPos(e); gravityWell = new GravityWell(pos.x + cameraX, pos.y); };
    const moveWell = (e) => { if (gravityWell && !isHeadstarting) { e.preventDefault(); const pos = getPos(e); gravityWell.x = pos.x + cameraX; gravityWell.y = pos.y; } };
    const endWell = (e) => { e.preventDefault(); gravityWell = null; };
    canvas.addEventListener('mousedown', startWell);
    canvas.addEventListener('mousemove', moveWell);
    document.addEventListener('mouseup', endWell); // CRITICAL FIX: Listen on document to catch releases outside canvas
    canvas.addEventListener('touchstart', startWell, { passive: false });
    canvas.addEventListener('touchmove', moveWell, { passive: false });
    document.addEventListener('touchend', endWell); // CRITICAL FIX: Listen on document for mobile
    document.addEventListener('touchcancel', endWell); // CRITICAL FIX: Handle cancelled touches
    window.addEventListener('resize', resizeCanvas); 
    const handlePlayClick = async (isTutorial) => {
        try { if (typeof Tone !== 'undefined' && Tone.context.state !== 'running') await Tone.start(); if (!audioManager.isInitialized) audioManager.init(); audioManager.playClickSound(); } catch (error) { console.error("Audio could not be initialized.", error); } 
        finally { if (isTutorial) { setGameState('tutorial'); } else if (playerData.hasPlayedBefore) { setGameState('playing'); } else { setGameState('tutorial'); } }
    };
    playButton.addEventListener('click', () => handlePlayClick(false)); restartButton.addEventListener('click', () => setGameState('playing')); replayTutorialButton.addEventListener('click', () => handlePlayClick(true));
    pauseButton.addEventListener('click', () => { if (gameState === 'playing') setGameState('paused'); }); resumeButton.addEventListener('click', () => { if (gameState === 'paused') setGameState('playing'); }); quitButton.addEventListener('click', () => { if (gameState === 'paused') { audioManager.playClickSound(); setGameState('menu'); } });
    observatoryButton.addEventListener('click', () => { audioManager.playClickSound(); setGameState('observatory'); }); closeObservatoryButton.addEventListener('click', () => { audioManager.playClickSound(); setGameState('menu'); });
    
    // Add event listener for cosmetic grid (using event delegation)
    cometSkinsGrid.addEventListener('click', (e) => {
        if (e.target.classList.contains('buy-cosmetic-btn')) {
            buyCosmetic(e.target.dataset.cosmeticId);
        } else if (e.target.classList.contains('equip-btn')) {
             equipCosmetic(e.target.dataset.cosmeticId);
        }
    });

    // Add event listener for shop tabs
    shopTabs.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-button')) {
            shopTabs.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            e.target.classList.add('active');
            const targetTab = document.getElementById(e.target.dataset.tab);
            if (targetTab) {
                targetTab.classList.add('active');
            }
        }
    });


    gameOverMenuButton.addEventListener('click', () => { audioManager.playClickSound(); setGameState('menu'); }); gameOverObservatoryButton.addEventListener('click', () => { audioManager.playClickSound(); setGameState('observatory'); });
    skipTutorialButton.addEventListener('click', () => { audioManager.playClickSound(); tutorialManager.end(false); });
}
function buyUpgrade(upgradeId) {
    let cost, canAfford = false;
    if (Array.isArray(upgradeCosts[upgradeId])) {
        const level = playerData.upgrades[upgradeId] || 0;
        if (level < upgradeCosts[upgradeId].length) {
            cost = upgradeCosts[upgradeId][level];
            if (playerData.starFragments >= cost) { playerData.starFragments -= cost; playerData.upgrades[upgradeId]++; canAfford = true; }
        }
    } else {
        if (!playerData.upgrades[upgradeId]) { cost = upgradeCosts[upgradeId]; if (playerData.starFragments >= cost) { playerData.starFragments -= cost; playerData.upgrades[upgradeId] = true; canAfford = true; } }
    }
    if (canAfford) { audioManager.playFragmentSound(); savePlayerData(); updateObservatoryUI(); }
}

// Placeholder functions for cosmetics
function buyCosmetic(cosmeticId) {
    const item = cosmeticItems[cosmeticId];
    if (item && !playerData.cosmetics.unlocked.includes(cosmeticId) && playerData.starFragments >= item.cost) {
        playerData.starFragments -= item.cost;
        playerData.cosmetics.unlocked.push(cosmeticId);
        audioManager.playFragmentSound();
        savePlayerData();
        updateObservatoryUI(); // Refresh UI to show Equip button
        console.log(`Bought cosmetic: ${cosmeticId}`);
    } else {
        console.log(`Cannot buy cosmetic: ${cosmeticId}`);
    }
}

function equipCosmetic(cosmeticId) {
     const item = cosmeticItems[cosmeticId];
    if (item && playerData.cosmetics.unlocked.includes(cosmeticId)) {
        playerData.cosmetics.equipped[item.type] = cosmeticId; // Equip based on type
        audioManager.playClickSound();
        savePlayerData();
        updateObservatoryUI(); // Refresh UI to show Equipped status
        console.log(`Equipped cosmetic: ${cosmeticId}`);
    } else {
         console.log(`Cannot equip cosmetic: ${cosmeticId}`);
    }
}


// --- Initialization ---
function init() { 
    for (let i = 0; i < 200; i++) stars.push(new Star()); 
    setupEventListeners(); 
    loadPlayerData(); 
    resizeCanvas(); 
    setGameState('menu'); 
}
init();
window.resetTutorial = function() { playerData.hasPlayedBefore = false; savePlayerData(); console.log("Tutorial flag reset."); }

