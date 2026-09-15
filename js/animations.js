import { state } from './app.js';

const canvas = document.getElementById('animation-canvas');
const ctx = canvas.getContext('2d');

let particles = [];
const numParticles = 100;
let isInitialized = false;

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.baseSize = Math.random() * 3 + 1;
        this.size = this.baseSize;
        this.color = `hsla(${Math.random() * 60 + 160}, 100%, 50%, 0.8)`; // Cyan to Blue
    }
    
    update() {
        if (state.currentGesture === 'FIST') {
            return; // Freeze
        }
        
        let dx = state.cursorX - this.x;
        let dy = state.cursorY - this.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        
        if (state.currentGesture === 'OPEN_PALM') {
            // Explosion/Repel
            if (dist < 200) {
                this.vx -= (dx / dist) * 2;
                this.vy -= (dy / dist) * 2;
            }
        } else if (state.currentGesture === 'PINCH' || state.isPinching) {
            // Grab/Attract strongly
            if (dist < 300) {
                this.vx += (dx / dist) * 1.5;
                this.vy += (dy / dist) * 1.5;
            }
        } else {
            // Follow gently
            if (dist < 400) {
                this.vx += (dx / dist) * 0.1;
                this.vy += (dy / dist) * 0.1;
            }
        }
        
        // Friction
        this.vx *= 0.95;
        this.vy *= 0.95;
        
        // Constant slow random movement
        this.vx += (Math.random() - 0.5) * 0.5;
        this.vy += (Math.random() - 0.5) * 0.5;
        
        this.x += this.vx;
        this.y += this.vy;
        
        // Bounce off edges
        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
        
        this.x = Math.max(0, Math.min(canvas.width, this.x));
        this.y = Math.max(0, Math.min(canvas.height, this.y));
    }
    
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
}

function initAnimations() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    particles = [];
    for (let i = 0; i < numParticles; i++) {
        particles.push(new Particle());
    }
    isInitialized = true;
    
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

let lastTwoHandDist = -1;

export function renderAnimations() {
    if (state.interactionMode !== 'ANIMATION') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    
    if (!isInitialized) {
        initAnimations();
    }
    
    // Two-hand interaction logic
    let zoomFactor = 1;
    if (state.handCount === 2 && state.hands && state.hands.length === 2) {
        const p1 = state.hands[0][8];
        const p2 = state.hands[1][8];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (lastTwoHandDist > 0) {
            if (dist > lastTwoHandDist + 0.01) {
                // Expanding
                zoomFactor = 1.05;
            } else if (dist < lastTwoHandDist - 0.01) {
                // Collapsing
                zoomFactor = 0.95;
            }
        }
        lastTwoHandDist = dist;
    } else {
        lastTwoHandDist = -1;
    }
    
    // Slight fade effect for trails
    ctx.fillStyle = 'rgba(5, 5, 5, 0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw connections between close particles
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = dx * dx + dy * dy;
            
            if (dist < 10000) { // 100px
                ctx.beginPath();
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                ctx.stroke();
            }
        }
    }
    
    // Draw cursor glow
    const glow = ctx.createRadialGradient(state.cursorX, state.cursorY, 0, state.cursorX, state.cursorY, 150);
    glow.addColorStop(0, 'rgba(0, 255, 204, 0.2)');
    glow.addColorStop(1, 'rgba(0, 255, 204, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(state.cursorX, state.cursorY, 150, 0, Math.PI * 2);
    ctx.fill();
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    for (const particle of particles) {
        // Apply zoom from two-hand interaction
        if (zoomFactor !== 1) {
            particle.x = centerX + (particle.x - centerX) * zoomFactor;
            particle.y = centerY + (particle.y - centerY) * zoomFactor;
        }
        
        particle.update();
        particle.draw();
    }
}
