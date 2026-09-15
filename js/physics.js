// Lightweight 2D Verlet Integration Physics Engine
// No dependencies required

export class Vector2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    
    add(v) { return new Vector2(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vector2(this.x - v.x, this.y - v.y); }
    mult(n) { return new Vector2(this.x * n, this.y * n); }
    mag() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    normalize() {
        const m = this.mag();
        return m === 0 ? new Vector2(0,0) : new Vector2(this.x/m, this.y/m);
    }
}

export class Particle {
    constructor(x, y, radius, isStatic = false) {
        this.pos = new Vector2(x, y);
        this.oldPos = new Vector2(x, y);
        this.acc = new Vector2(0, 0);
        this.radius = radius;
        this.isStatic = isStatic;
        this.friction = 0.99;
        this.bounce = 0.7;
    }
    
    applyForce(force) {
        if (!this.isStatic) {
            this.acc.x += force.x;
            this.acc.y += force.y;
        }
    }
    
    update(dt) {
        if (this.isStatic) return;
        
        // Verlet Integration
        const velX = (this.pos.x - this.oldPos.x) * this.friction;
        const velY = (this.pos.y - this.oldPos.y) * this.friction;
        
        this.oldPos.x = this.pos.x;
        this.oldPos.y = this.pos.y;
        
        this.pos.x += velX + this.acc.x * dt * dt;
        this.pos.y += velY + this.acc.y * dt * dt;
        
        this.acc.x = 0;
        this.acc.y = 0;
    }
    
    constrain(width, height) {
        if (this.isStatic) return;
        
        // Floor
        if (this.pos.y > height - this.radius) {
            const velY = (this.pos.y - this.oldPos.y) * this.bounce;
            this.pos.y = height - this.radius;
            this.oldPos.y = this.pos.y + velY;
            
            // apply friction on floor
            const velX = (this.pos.x - this.oldPos.x) * 0.8;
            this.oldPos.x = this.pos.x - velX;
        }
        
        // Walls
        if (this.pos.x < this.radius) {
            const velX = (this.pos.x - this.oldPos.x) * this.bounce;
            this.pos.x = this.radius;
            this.oldPos.x = this.pos.x + velX;
        } else if (this.pos.x > width - this.radius) {
            const velX = (this.pos.x - this.oldPos.x) * this.bounce;
            this.pos.x = width - this.radius;
            this.oldPos.x = this.pos.x + velX;
        }
        
        // Ceiling
        if (this.pos.y < this.radius) {
            const velY = (this.pos.y - this.oldPos.y) * this.bounce;
            this.pos.y = this.radius;
            this.oldPos.y = this.pos.y + velY;
        }
    }
}

export class Spring {
    constructor(p1, p2, length, stiffness = 0.5) {
        this.p1 = p1;
        this.p2 = p2;
        this.length = length;
        this.stiffness = stiffness;
    }
    
    update() {
        const dx = this.p2.pos.x - this.p1.pos.x;
        const dy = this.p2.pos.y - this.p1.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist === 0) return;
        
        const diff = (this.length - dist) / dist;
        const offsetX = dx * diff * 0.5 * this.stiffness;
        const offsetY = dy * diff * 0.5 * this.stiffness;
        
        if (!this.p1.isStatic) {
            this.p1.pos.x -= offsetX;
            this.p1.pos.y -= offsetY;
        }
        if (!this.p2.isStatic) {
            this.p2.pos.x += offsetX;
            this.p2.pos.y += offsetY;
        }
    }
    
    draw(ctx) {
        ctx.beginPath();
        ctx.moveTo(this.p1.pos.x, this.p1.pos.y);
        ctx.lineTo(this.p2.pos.x, this.p2.pos.y);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

export class PhysicsEngine {
    constructor(canvasWidth, canvasHeight) {
        this.width = canvasWidth;
        this.height = canvasHeight;
        this.particles = [];
        this.springs = [];
        this.gravity = new Vector2(0, 0.5); // 0.5 px/step^2
    }
    
    addParticle(x, y, radius, isStatic = false) {
        const p = new Particle(x, y, radius, isStatic);
        this.particles.push(p);
        return p;
    }
    
    addSpring(p1, p2, length, stiffness) {
        const s = new Spring(p1, p2, length, stiffness);
        this.springs.push(s);
        return s;
    }
    
    clear() {
        this.particles = [];
        this.springs = [];
    }
    
    update(dt = 1, iterations = 3) {
        // Apply forces
        for (let p of this.particles) {
            p.applyForce(this.gravity);
            p.update(dt);
        }
        
        // Solve constraints (springs & boundaries) iteratively
        for (let i = 0; i < iterations; i++) {
            for (let s of this.springs) {
                s.update();
            }
            for (let p of this.particles) {
                p.constrain(this.width, this.height);
            }
        }
    }
    
    draw(ctx) {
        for (let s of this.springs) {
            s.draw(ctx);
        }
        for (let p of this.particles) {
            ctx.beginPath();
            ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = p.isStatic ? "#ff0055" : "#00f3ff";
            ctx.fill();
            if (!p.isStatic) {
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
    }
}
