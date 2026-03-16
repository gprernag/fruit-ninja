// ─────────────────────────────────────────────
//  SETUP
// ─────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const video  = document.getElementById('webcam');

canvas.width  = window.innerWidth;
canvas.height = window.innerHeight;

// ─────────────────────────────────────────────
//  GAME STATE
// ─────────────────────────────────────────────
let gameState       = 'waiting';   // 'waiting' | 'countdown' | 'playing' | 'gameover'
let countdownValue  = 3;
let score           = 0;
let lives           = 3;
let spawnRate       = 1;
let spawnTimer      = 0;
let combo           = 0;
let comboMultiplier = 1;
let comboTimer      = null;
let gameOverPending = false;

// ─────────────────────────────────────────────
//  FINGER TRACKING
// ─────────────────────────────────────────────
let fingerTip   = null;
let fingerTrail = [];

// ─────────────────────────────────────────────
//  VIDEO DRAW PARAMS (used for accurate finger mapping)
// ─────────────────────────────────────────────
let videoOffsetX    = 0;
let videoOffsetY    = 0;
let videoDrawWidth  = 0;
let videoDrawHeight = 0;

// ─────────────────────────────────────────────
//  FRUITS & EFFECTS
// ─────────────────────────────────────────────
let fruits       = [];
let sliceEffects = [];

const GRAVITY = 0.35;

let scale = Math.min(canvas.width, canvas.height) / 600;

const FRUIT_TYPES = [
    { emoji: '🍉', radius: 45 * scale },
    { emoji: '🍊', radius: 35 * scale },
    { emoji: '🍋', radius: 33 * scale },
    { emoji: '🍎', radius: 35 * scale },
    { emoji: '🍇', radius: 38 * scale },
    { emoji: '🍍', radius: 42 * scale },
];

// ─────────────────────────────────────────────
//  WEBCAM
// ─────────────────────────────────────────────
async function startWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 }
        });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            setupHandTracking();
            gameLoop();
        };
    } catch (error) {
        alert('Camera permission denied! Please allow camera access and refresh.');
        console.error(error);
    }
}

// ─────────────────────────────────────────────
//  HAND TRACKING (MediaPipe)
// ─────────────────────────────────────────────
function setupHandTracking() {
    const hands = new Hands({
        locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
    });

    hands.onResults((results) => {
        if (results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            const tip = landmarks[8]; // index fingertip is always #8

            // Map normalized 0-1 coords through the SAME offset/scale
            // that drawVideo uses — so dot sits exactly on finger
            fingerTip = {
                x: tip.x * videoDrawWidth  + videoOffsetX,
                y: tip.y * videoDrawHeight + videoOffsetY
            };

            fingerTrail.push({ x: fingerTip.x, y: fingerTip.y });
            if (fingerTrail.length > 10) fingerTrail.shift();

            // First time finger detected → start countdown
            if (gameState === 'waiting') {
                gameState = 'countdown';
                startCountdown();
            }

        } else {
            fingerTip   = null;
            fingerTrail = [];
        }
    });

    const camera = new Camera(video, {
        onFrame: async () => {
            await hands.send({ image: video });
        },
        width: 1280,
        height: 720
    });

    camera.start();
}

// ─────────────────────────────────────────────
//  DRAW VIDEO BACKGROUND (aspect-ratio safe)
//  Also saves offset/size so finger mapping stays in sync
// ─────────────────────────────────────────────
function drawVideo() {
    if (!video.videoWidth) return;

    const videoRatio  = video.videoWidth / video.videoHeight;
    const canvasRatio = canvas.width / canvas.height;
    let drawWidth, drawHeight, offsetX, offsetY;

    if (canvasRatio > videoRatio) {
        drawWidth  = canvas.width;
        drawHeight = canvas.width / videoRatio;
    } else {
        drawHeight = canvas.height;
        drawWidth  = canvas.height * videoRatio;
    }

    offsetX = (canvas.width  - drawWidth)  / 2;
    offsetY = (canvas.height - drawHeight) / 2;

    // Save so hand tracking can use the same coordinate space
    videoOffsetX    = offsetX;
    videoOffsetY    = offsetY;
    videoDrawWidth  = drawWidth;
    videoDrawHeight = drawHeight;

    ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
}

// ─────────────────────────────────────────────
//  COUNTDOWN
// ─────────────────────────────────────────────
function startCountdown() {
    countdownValue = 3;
    const timer = setInterval(() => {
        countdownValue--;
        if (countdownValue <= 0) {
            clearInterval(timer);
            gameState = 'playing';
        }
    }, 1000);
}

function drawCountdown() {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    ctx.textAlign   = 'center';
    ctx.font        = `bold ${canvas.width / 4}px Arial Black`;
    ctx.fillStyle   = 'white';
    ctx.globalAlpha = 0.85;
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur  = 40;
    ctx.fillText(countdownValue, canvas.width / 2, canvas.height / 2 + 40);
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1.0;

    ctx.restore();
}

// ─────────────────────────────────────────────
//  WAITING / START SCREEN
// ─────────────────────────────────────────────
function drawWaitingScreen() {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';

    // Title
    ctx.font        = `bold ${canvas.width / 9}px Arial Black`;
    ctx.fillStyle   = '#ffd700';
    ctx.shadowColor = 'rgba(255,200,0,0.5)';
    ctx.shadowBlur  = 30;
    ctx.fillText('🍉 FRUIT NINJA', canvas.width / 2, canvas.height / 2 - 90);
    ctx.shadowBlur  = 0;

    // Subtitle
    ctx.font      = `${canvas.width / 26}px Arial`;
    ctx.fillStyle = 'white';
    ctx.fillText('Show your index finger to start', canvas.width / 2, canvas.height / 2 + 10);

    // Instructions
    ctx.font      = `${canvas.width / 38}px Arial`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('Slice fruits  •  Avoid 💣 bombs  •  3 lives', canvas.width / 2, canvas.height / 2 + 70);

    ctx.restore();
}

// ─────────────────────────────────────────────
//  SPAWN FRUITS
// ─────────────────────────────────────────────
function spawnFruit() {
    const isBomb = Math.random() < 0.15;
    const type   = FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
    const x      = 150 + Math.random() * (canvas.width - 300);

    // canvas.height / 43 → fruit reaches ~65–70% of screen height
    const baseUp = canvas.height / 43;

    fruits.push({
        x,
        y:             canvas.height + 60,
        vx:            (Math.random() - 0.5) * 2,
        vy:            -(baseUp + Math.random() * 2),
        radius:        isBomb ? 38 * scale : type.radius,
        emoji:         isBomb ? '💣' : type.emoji,
        isBomb,
        sliced:        false,
        rotation:      0,
        rotationSpeed: (Math.random() - 0.5) * 0.05,
    });
}

// ─────────────────────────────────────────────
//  UPDATE FRUITS (physics + spawn timer)
// ─────────────────────────────────────────────
function updateFruits() {
    if (!gameOverPending) {
        spawnTimer++;
        const spawnInterval = 90;

        if (spawnTimer >= spawnInterval) {
            for (let i = 0; i < spawnRate; i++) {
                setTimeout(() => spawnFruit(), i * 200);
            }
            spawnTimer = 0;
        }
    }

    fruits.forEach(fruit => {
        if (fruit.sliced) return;
        fruit.vy       += GRAVITY;
        fruit.x        += fruit.vx;
        fruit.y        += fruit.vy;
        fruit.rotation += fruit.rotationSpeed;
    });

    fruits = fruits.filter(f => f.y < canvas.height + 100);
}

// ─────────────────────────────────────────────
//  DRAW FRUITS
// ─────────────────────────────────────────────
function drawFruits() {
    fruits.forEach(fruit => {
        if (fruit.sliced) return;

        ctx.save();
        ctx.translate(fruit.x, fruit.y);
        ctx.rotate(fruit.rotation);
        ctx.font         = `${fruit.radius * 2}px serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fruit.emoji, 0, 0);
        ctx.restore();
    });
}

// ─────────────────────────────────────────────
//  SWIPE SPEED
// ─────────────────────────────────────────────
function getSwipeSpeed() {
    if (fingerTrail.length < 2) return 0;
    const prev = fingerTrail[fingerTrail.length - 2];
    const curr = fingerTrail[fingerTrail.length - 1];
    return Math.hypot(curr.x - prev.x, curr.y - prev.y);
}

// ─────────────────────────────────────────────
//  LINE-SEGMENT vs CIRCLE (bounded — no false hits)
// ─────────────────────────────────────────────
function lineIntersectsCircle(x1, y1, x2, y2, cx, cy, radius) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const fx = x1 - cx;
    const fy = y1 - cy;

    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;

    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return false;

    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    if (t1 >= 0 && t1 <= 1) return true;
    if (t2 >= 0 && t2 <= 1) return true;
    return false;
}

// ─────────────────────────────────────────────
//  CHECK SLICES
// ─────────────────────────────────────────────
function checkSlices() {
    if (gameOverPending) return;
    if (getSwipeSpeed() < 15) return;
    if (fingerTrail.length < 2) return;

    const p1 = fingerTrail[fingerTrail.length - 2];
    const p2 = fingerTrail[fingerTrail.length - 1];

    fruits.forEach(fruit => {
        if (fruit.sliced) return;

        if (lineIntersectsCircle(p1.x, p1.y, p2.x, p2.y, fruit.x, fruit.y, fruit.radius)) {
            fruit.sliced = true;
            fruit.isBomb ? triggerBomb(fruit) : triggerSlice(fruit);
        }
    });
}

// ─────────────────────────────────────────────
//  TRIGGER SLICE (juice + score + combo)
// ─────────────────────────────────────────────
function triggerSlice(fruit) {
    const speed = getSwipeSpeed();

    if (speed > 25) {
        combo++;
        if (comboTimer) clearTimeout(comboTimer);
        comboTimer = setTimeout(() => {
            combo = 0;
        }, 300);
    } else {
        if (comboTimer) clearTimeout(comboTimer);
        comboTimer = null;
        combo = 0;
    }

    if      (combo >= 5) comboMultiplier = 4;
    else if (combo >= 3) comboMultiplier = 3;
    else if (combo >= 2) comboMultiplier = 2;
    else                 comboMultiplier = 1;

    const points = 10 * comboMultiplier;
    score += points;
    updateScoreUI();

    // Combo text — only from 2nd fast slice onward
    if (combo >= 2) {
        sliceEffects.push({
            x: fruit.x, y: fruit.y - 50,
            vy: -2.5, alpha: 1.0,
            type: 'text', text: `${combo}x COMBO!`,
            color: '#ffd700', size: 44
        });
    }

    // Juice particles — 8 directions
    for (let i = 0; i < 8; i++) {
        const angle  = (Math.PI * 2 / 8) * i;
        const speed2 = 2 + Math.random() * 3;
        sliceEffects.push({
            x: fruit.x, y: fruit.y,
            vx: Math.cos(angle) * speed2,
            vy: Math.sin(angle) * speed2,
            radius: 4 + Math.random() * 4,
            alpha: 1.0,
            color: getJuiceColor(fruit.emoji),
            type: 'juice'
        });
    }

    // Score text
    sliceEffects.push({
        x: fruit.x, y: fruit.y,
        vy: -2, alpha: 1.0,
        type: 'text', text: `+${points}`,
        color: 'white', size: 36
    });
}

function getJuiceColor(emoji) {
    const colors = {
        '🍉': '#ff4444',
        '🍊': '#ff8c00',
        '🍋': '#ffd700',
        '🍎': '#ff0000',
        '🍇': '#8b008b',
        '🍍': '#ffdb58',
    };
    return colors[emoji] || '#ff6666';
}

// ─────────────────────────────────────────────
//  TRIGGER BOMB
// ─────────────────────────────────────────────
function triggerBomb(bomb) {
    lives--;
    updateLivesUI();

    if (lives <= 0) {
        gameOverPending = true;

        const bx = bomb.x;
        const by = bomb.y;

        // Wave 1 — immediate
        sliceEffects.push({
            x: bx, y: by,
            radius: 10,
            maxRadius: Math.hypot(canvas.width, canvas.height),
            alpha: 1.0,
            type: 'megaExplosion'
        });

        // Wave 2 — 150ms later
        setTimeout(() => {
            sliceEffects.push({
                x: bx, y: by,
                radius: 10,
                maxRadius: Math.hypot(canvas.width, canvas.height),
                alpha: 0.85,
                type: 'megaExplosion'
            });
        }, 150);

        // Wave 3 — 300ms later
        setTimeout(() => {
            sliceEffects.push({
                x: bx, y: by,
                radius: 10,
                maxRadius: Math.hypot(canvas.width, canvas.height),
                alpha: 0.7,
                type: 'megaExplosion'
            });
        }, 300);

        // Blinding white flash — like pressure on eyes
        setTimeout(() => {
            sliceEffects.push({
                alpha: 1.0,
                fadeSpeed: 0.003,
                type: 'blindFlash'
            });
        }, 600);

        // Game over while white still covering screen
        setTimeout(() => {
            endGame();
        }, 1000);

    } else {
        // Normal bomb — regular explosion
        sliceEffects.push({
            x: bomb.x, y: bomb.y,
            radius: 10, alpha: 1.0,
            type: 'explosion'
        });
        setTimeout(() => {
            sliceEffects.push({
                x: bomb.x, y: bomb.y,
                radius: 10, alpha: 0.7,
                type: 'explosion'
            });
        }, 200);
        sliceEffects.push({ alpha: 0.6, type: 'flash' });
        setTimeout(() => {
            sliceEffects.push({ alpha: 0.35, type: 'flash' });
        }, 300);
    }
}

// ─────────────────────────────────────────────
//  UPDATE SLICE EFFECTS
// ─────────────────────────────────────────────
function updateSliceEffects() {
    sliceEffects.forEach(e => {
        if (e.type === 'juice') {
            e.x     += e.vx;
            e.y     += e.vy;
            e.vy    += 0.2;
            e.alpha -= 0.03;
        } else if (e.type === 'explosion') {
            e.radius += 8;
            e.alpha  -= 0.02;
        } else if (e.type === 'flash') {
            e.alpha -= 0.04;
        } else if (e.type === 'text') {
            e.y     += e.vy;
            e.alpha -= 0.02;
        } else if (e.type === 'megaExplosion') {
            e.radius += 35;
            if (e.radius > e.maxRadius * 0.85) {
                e.alpha -= 0.04;
            }
        } else if (e.type === 'blindFlash') {
            e.alpha -= e.fadeSpeed;
        }
    });

    sliceEffects = sliceEffects.filter(e => e.alpha > 0);
}

// ─────────────────────────────────────────────
//  DRAW SLICE EFFECTS
// ─────────────────────────────────────────────
function drawSliceEffects() {
    sliceEffects.forEach(effect => {

        if (effect.type === 'juice') {
            ctx.globalAlpha = effect.alpha;
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
            ctx.fillStyle   = effect.color;
            ctx.fill();
            ctx.globalAlpha = 1.0;

        } else if (effect.type === 'explosion') {
            ctx.globalAlpha = effect.alpha;
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#ff6600';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, effect.radius * 0.65, 0, Math.PI * 2);
            ctx.fillStyle = '#ff9900';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, effect.radius * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = '#ffff00';
            ctx.fill();
            ctx.globalAlpha = 1.0;

        } else if (effect.type === 'flash') {
            ctx.globalAlpha = effect.alpha;
            ctx.fillStyle   = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1.0;

        } else if (effect.type === 'text') {
            ctx.save();
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.globalAlpha = effect.alpha;
            ctx.font        = `bold ${effect.size || 36}px Arial Black`;
            ctx.fillStyle   = effect.color || 'white';
            ctx.textAlign   = 'center';
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur  = 6;
            ctx.fillText(effect.text, canvas.width - effect.x, effect.y);
            ctx.shadowBlur  = 0;
            ctx.globalAlpha = 1.0;
            ctx.restore();

        } else if (effect.type === 'megaExplosion') {
            ctx.globalAlpha = effect.alpha;
            const gradient  = ctx.createRadialGradient(
                effect.x, effect.y, effect.radius * 0.3,
                effect.x, effect.y, effect.radius
            );
            gradient.addColorStop(0,   'rgba(255, 255, 200, 1)');
            gradient.addColorStop(0.4, 'rgba(255, 200, 0,   1)');
            gradient.addColorStop(0.7, 'rgba(255, 80,  0,   1)');
            gradient.addColorStop(1,   'rgba(180, 0,   0,   0)');
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();
            ctx.globalAlpha = 1.0;

        } else if (effect.type === 'blindFlash') {
            ctx.globalAlpha = effect.alpha;
            ctx.fillStyle   = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1.0;
        }
    });
}

// ─────────────────────────────────────────────
//  FINGER TRAIL + GLOWING DOT
// ─────────────────────────────────────────────
function drawFingerTrail() {
    if (fingerTrail.length < 2) return;

    const speed = getSwipeSpeed();

    for (let i = 1; i < fingerTrail.length; i++) {
        const alpha = i / fingerTrail.length;
        const r     = 255;
        const g     = speed > 30 ? 180 : 255;
        const b     = speed > 30 ? 0   : 255;

        ctx.beginPath();
        ctx.moveTo(fingerTrail[i - 1].x, fingerTrail[i - 1].y);
        ctx.lineTo(fingerTrail[i].x,     fingerTrail[i].y);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.lineWidth   = 6 * alpha;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.stroke();
    }

    if (fingerTip) {
        const gradient = ctx.createRadialGradient(
            fingerTip.x, fingerTip.y, 0,
            fingerTip.x, fingerTip.y, 22
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.beginPath();
        ctx.arc(fingerTip.x, fingerTip.y, 22, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(fingerTip.x, fingerTip.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
    }
}

// ─────────────────────────────────────────────
//  UI HELPERS
// ─────────────────────────────────────────────
function updateScoreUI() {
    document.getElementById('score').textContent = `Score: ${score}`;
}

function updateLivesUI() {
    document.getElementById('lives').textContent = '❤️'.repeat(Math.max(0, lives));
}

// ─────────────────────────────────────────────
//  GAME OVER SCREEN
// ─────────────────────────────────────────────
function endGame() {
    gameState = 'gameover';

    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';

    // GAME OVER — 35% from top
    ctx.font        = `bold ${canvas.width / 9}px Arial Black`;
    ctx.fillStyle   = '#ff4444';
    ctx.shadowColor = 'rgba(255,50,50,0.6)';
    ctx.shadowBlur  = 35;
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height * 0.35);
    ctx.shadowBlur  = 0;

    // Score — 48% from top
    ctx.font      = `bold ${canvas.width / 16}px Arial`;
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height * 0.48);

    // Best score — 57% from top
    const highScore = Math.max(score, parseInt(localStorage.getItem('highScore') || 0));
    localStorage.setItem('highScore', highScore);
    ctx.font      = `${canvas.width / 28}px Arial`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(`Best: ${highScore}`, canvas.width / 2, canvas.height * 0.57);

    ctx.restore();

    document.getElementById('restartBtn').style.display = 'block';
}

// ─────────────────────────────────────────────
//  RESTART
// ─────────────────────────────────────────────
document.getElementById('restartBtn').addEventListener('click', () => {
    score           = 0;
    lives           = 3;
    fruits          = [];
    sliceEffects    = [];
    spawnTimer      = 0;
    spawnRate       = 1;
    combo           = 0;
    comboMultiplier = 1;
    gameOverPending = false;
    gameState       = 'waiting';

    updateScoreUI();
    updateLivesUI();

    document.getElementById('restartBtn').style.display = 'none';
    requestAnimationFrame(gameLoop);
});

// ─────────────────────────────────────────────
//  MAIN GAME LOOP
// ─────────────────────────────────────────────
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawVideo();

    if (gameState === 'waiting') {
        drawWaitingScreen();

    } else if (gameState === 'countdown') {
        drawCountdown();

    } else if (gameState === 'playing') {
        updateFruits();
        checkSlices();
        updateSliceEffects();
        drawFruits();
        drawSliceEffects();
        drawFingerTrail();

    } else if (gameState === 'gameover') {
        updateSliceEffects();
        drawFruits();
        drawSliceEffects();
        drawFingerTrail();
        endGame();
        return;
    }

    requestAnimationFrame(gameLoop);
}

// ─────────────────────────────────────────────
//  DIFFICULTY: more fruits per batch over time
// ─────────────────────────────────────────────
setInterval(() => {
    if (spawnRate < 5) {
        spawnRate++;
        console.log('Fruits per launch:', spawnRate);
    }
}, 10000);

// ─────────────────────────────────────────────
//  RESIZE HANDLER
// ─────────────────────────────────────────────
window.addEventListener('resize', () => {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    scale = Math.min(canvas.width, canvas.height) / 600;
    const baseSizes = [45, 35, 33, 35, 38, 42];
    FRUIT_TYPES.forEach((type, i) => {
        type.radius = baseSizes[i] * scale;
    });
});

// ─────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────
startWebcam();
