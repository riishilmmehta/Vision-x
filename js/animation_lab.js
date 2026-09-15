import { state } from './app.js';
import { PhysicsEngine, Vector2 } from './physics.js';

let canvas, ctx;
let currentLab = 'NONE'; // WEB_SHOOTER, ENERGY_HAND, PHYSICS_BALL, etc.
let physics;
let isRunning = false;
let animationFrameId;

// Lab state variables
let webAnchor = null;
let energyCharge = 0;
let portalPoints = [];
let particles = [];
let grabNode = null; // for physics ball

export function initAnimationLab() {
    canvas = document.getElementById('animation-canvas');
    ctx = canvas.getContext('2d');
    
    physics = new PhysicsEngine(canvas.width, canvas.height);
    
    window.addEventListener('resize', () => {
        physics.width = canvas.width;
        physics.height = canvas.height;
    });

    const labBtns = document.querySelectorAll('.lab-btn');
    labBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const lab = e.target.getAttribute('data-lab');
            setLabExperience(lab);
            document.getElementById('animation-lab-menu').classList.add('hidden');
        });
    });
}

function setLabExperience(lab) {
    currentLab = lab;
    physics.clear();
    particles = [];
    webAnchor = null;
    energyCharge = 0;
    portalPoints = [];
    grabNode = null;
    
    if (lab === 'PHYSICS_BALL') {
        // Drop a ball in the center
        physics.addParticle(canvas.width / 2, 50, 40, false);
    } else if (lab === 'GRAVITY' || lab === 'MAGNET') {
        // Spawn ambient particles
        for(let i=0; i<100; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                radius: Math.random() * 3 + 1
            });
        }
    }
}

function loop() {
    if (!isRunning) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (currentLab === 'PHYSICS_BALL' || currentLab === 'WEB_SHOOTER') {
        physics.update(1, 5);
        physics.draw(ctx);
        
        // Draw Web Shooter Target if applicable
        if (currentLab === 'WEB_SHOOTER') {
            ctx.fillStyle = 'rgba(255, 0, 85, 0.5)';
            ctx.beginPath();
            ctx.arc(canvas.width/2, 100, 30, 0, Math.PI*2);
            ctx.fill();
        }
    } else if (currentLab === 'ENERGY_HAND') {
        if (energyCharge > 0) {
            ctx.beginPath();
            const cx = state.cursorX;
            const cy = state.cursorY;
            const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, energyCharge);
            gradient.addColorStop(0, 'rgba(0, 243, 255, 1)');
            gradient.addColorStop(1, 'rgba(0, 243, 255, 0)');
            ctx.fillStyle = gradient;
            ctx.arc(cx, cy, energyCharge, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (currentLab === 'PARTICLE_BLAST') {
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;
            
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2);
            ctx.fillStyle = `rgba(255, 150, 0, ${p.life})`;
            ctx.fill();
            
            if (p.life <= 0) particles.splice(i, 1);
        }
    } else if (currentLab === 'PORTAL') {
        if (portalPoints.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(150, 0, 255, 0.8)';
            ctx.lineWidth = 10;
            ctx.moveTo(portalPoints[0].x, portalPoints[0].y);
            for(let i=1; i<portalPoints.length; i++) {
                ctx.lineTo(portalPoints[i].x, portalPoints[i].y);
            }
            ctx.stroke();
            
            // Check if closed loop
            if (portalPoints.length > 20) {
                const first = portalPoints[0];
                const last = portalPoints[portalPoints.length-1];
                const dist = Math.hypot(first.x - last.x, first.y - last.y);
                if (dist < 50) {
                    // Draw Portal!
                    ctx.beginPath();
                    // bounding box center
                    let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;
                    portalPoints.forEach(pt => {
                        minX = Math.min(minX, pt.x);
                        maxX = Math.max(maxX, pt.x);
                        minY = Math.min(minY, pt.y);
                        maxY = Math.max(maxY, pt.y);
                    });
                    const cx = (minX + maxX)/2;
                    const cy = (minY + maxY)/2;
                    const r = Math.max(maxX - minX, maxY - minY) / 2;
                    
                    ctx.arc(cx, cy, r, 0, Math.PI*2);
                    ctx.fillStyle = 'rgba(0,0,0,0.8)';
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(150, 0, 255, 1)';
                    ctx.stroke();
                }
            }
        }
    } else if (currentLab === 'GRAVITY' || currentLab === 'MAGNET') {
        const cx = state.cursorX;
        const cy = state.cursorY;
        
        ctx.fillStyle = 'rgba(0, 243, 255, 0.5)';
        particles.forEach(p => {
            // Apply force
            const dx = cx - p.x;
            const dy = cy - p.y;
            const dist = Math.hypot(dx, dy);
            
            if (dist > 0 && dist < 400) {
                const force = (400 - dist) / 400; // 0 to 1
                const dir = (currentLab === 'GRAVITY') ? 1 : -1; // attract vs repel
                
                // If Magnet Mode, only apply when Pinching (handled in onGesture)
                // We'll use energyCharge flag to indicate active attraction
                if (currentLab === 'GRAVITY' || (currentLab === 'MAGNET' && energyCharge > 0)) {
                    p.vx += (dx / dist) * force * 0.5 * dir;
                    p.vy += (dy / dist) * force * 0.5 * dir;
                }
            }
            
            p.vx *= 0.95; // friction
            p.vy *= 0.95;
            
            p.x += p.vx;
            p.y += p.vy;
            
            // wrap
            if(p.x < 0) p.x = canvas.width;
            if(p.x > canvas.width) p.x = 0;
            if(p.y < 0) p.y = canvas.height;
            if(p.y > canvas.height) p.y = 0;
            
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2);
            ctx.fill();
        });
    }

    animationFrameId = requestAnimationFrame(loop);
}

export const AnimationLabMode = {
    onEnter: () => {
        if (!canvas) initAnimationLab();
        document.getElementById('animation-lab-menu').classList.remove('hidden');
        canvas.style.display = 'block';
        currentLab = 'NONE';
        isRunning = true;
        loop();
        console.log("Animation Lab: ACTIVE");
    },
    
    onExit: () => {
        document.getElementById('animation-lab-menu').classList.add('hidden');
        isRunning = false;
        cancelAnimationFrame(animationFrameId);
        console.log("Animation Lab: EXIT");
    },
    
    onGesture: (gesture, handInfo, timestamp) => {
        const cx = state.cursorX;
        const cy = state.cursorY;
        
        if (currentLab === 'PHYSICS_BALL') {
            if (gesture === 'PINCH') {
                if (!grabNode) {
                    // Check if pinching the ball
                    const ball = physics.particles[0];
                    if (ball) {
                        const dist = Math.hypot(ball.pos.x - cx, ball.pos.y - cy);
                        if (dist < ball.radius + 30) {
                            grabNode = physics.addParticle(cx, cy, 5, true);
                            physics.addSpring(grabNode, ball, 0, 0.5);
                        }
                    }
                } else {
                    grabNode.pos.x = cx;
                    grabNode.pos.y = cy;
                }
            } else {
                if (grabNode) {
                    physics.particles = physics.particles.filter(p => p !== grabNode);
                    physics.springs = [];
                    grabNode = null;
                }
            }
        }
        else if (currentLab === 'WEB_SHOOTER') {
            // SPIDER POSE: Index and Pinky extended, others closed
            // Since we don't have full finger access here without changing gestures.js, 
            // we will trigger web shooter on PINCH or "THREE_FINGERS" (surrogate for spider pose).
            // Let's use PINCH to shoot, OPEN to release
            if (gesture === 'PINCH' && !webAnchor) {
                // Shoot web to target
                const handP = physics.addParticle(cx, cy, 10, true);
                const targetP = physics.addParticle(canvas.width/2, 100, 10, true);
                physics.addSpring(handP, targetP, 50, 0.05);
                webAnchor = handP;
                
                // Recoil effect
                document.body.classList.add('shake');
                setTimeout(() => document.body.classList.remove('shake'), 200);
            } else if (gesture === 'PINCH' && webAnchor) {
                webAnchor.pos.x = cx;
                webAnchor.pos.y = cy;
            } else {
                if (webAnchor) {
                    physics.clear();
                    webAnchor = null;
                }
            }
        }
        else if (currentLab === 'ENERGY_HAND') {
            if (gesture === 'FIST') {
                energyCharge = Math.min(150, energyCharge + 5);
            } else if (gesture === 'OPEN_PALM') {
                if (energyCharge > 50) {
                    // BOOM
                    document.body.classList.add('shake');
                    setTimeout(() => document.body.classList.remove('shake'), 200);
                }
                energyCharge = Math.max(0, energyCharge - 20);
            }
        }
        else if (currentLab === 'PARTICLE_BLAST') {
            if (gesture === 'FIST') {
                energyCharge = 1; // charging
            } else if (gesture === 'OPEN_PALM' && energyCharge === 1) {
                // blast
                energyCharge = 0;
                for(let i=0; i<50; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = Math.random() * 15 + 5;
                    particles.push({
                        x: cx,
                        y: cy,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        radius: Math.random() * 5 + 2,
                        life: 1.0
                    });
                }
            }
        }
        else if (currentLab === 'PORTAL') {
            if (gesture === 'ONE_FINGER') {
                portalPoints.push({x: cx, y: cy});
            } else {
                if (portalPoints.length > 0) portalPoints = [];
            }
        }
        else if (currentLab === 'MAGNET') {
            if (gesture === 'PINCH') {
                energyCharge = 1; // active attraction
            } else if (gesture === 'OPEN_PALM') {
                energyCharge = -1; // repel (handled in loop if we want, but currently hardcoded dir)
            } else {
                energyCharge = 0;
            }
        }
    },
    
    onSwipe: (direction) => {
        // Record / Replay experimental
        console.log("Animation Lab Swipe:", direction);
        if (direction === 'DOWN') {
            // Return to menu
            document.getElementById('animation-lab-menu').classList.remove('hidden');
            currentLab = 'NONE';
        }
    }
};
