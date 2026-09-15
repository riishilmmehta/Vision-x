import { state } from './app.js';

let canvas, ctx;
let isDrawing = false;
let isErasing = false;
let strokes = []; 
let currentStroke = null;
let undoStack = [];
let redoStack = [];

// Filter State
let lastRawX = 0, lastRawY = 0;
let lastFilteredX = 0, lastFilteredY = 0;
let lastTime = 0;

// Settings
let basePenSize = 8;
let eraserSize = 40;
let penColor = '#00f3ff';
let isPaused = false;
let drawMode = 'CONTINUOUS'; // 'CONTINUOUS' or 'PINCH'
let stability = 0.75; // 0 to 1

export function initAirWriting() {
    canvas = document.getElementById('drawing-canvas');
    ctx = canvas.getContext('2d');
    
    // Resize with High-DPI support
    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement.getBoundingClientRect();
        
        // Save content
        const data = canvas.toDataURL();
        
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        
        ctx.scale(dpr, dpr);
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        
        // Restore content
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, rect.width, rect.height);
        };
        img.src = data;
    }
    
    window.addEventListener('resize', resize);
    resize();
    
    // Toolbar buttons
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);
    document.getElementById('btn-clear').addEventListener('click', clearCanvas);
    
    const sliderStability = document.getElementById('slider-stability');
    sliderStability.addEventListener('input', (e) => {
        stability = parseInt(e.target.value) / 100;
    });
    
    const selectDrawMode = document.getElementById('select-draw-mode');
    selectDrawMode.addEventListener('change', (e) => {
        drawMode = e.target.value;
    });
    
    const toolBtns = document.querySelectorAll('.tool-btn[data-tool]');
    toolBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            toolBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
}

function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    for (const stroke of strokes) {
        if (stroke.points.length === 0) continue;
        
        ctx.strokeStyle = stroke.color;
        
        if (stroke.points.length === 1) {
            ctx.lineWidth = stroke.points[0].width;
            ctx.beginPath();
            ctx.arc(stroke.points[0].x, stroke.points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
            continue;
        }
        
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        
        for (let i = 1; i < stroke.points.length - 1; i++) {
            const p1 = stroke.points[i];
            const p2 = stroke.points[i + 1];
            
            // Quadratic Bezier interpolation for smooth curves
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            
            ctx.lineWidth = p1.width;
            ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
        }
        
        const last = stroke.points[stroke.points.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
    }
}

function undo() {
    if (strokes.length > 0) {
        redoStack.push(strokes.pop());
        redrawCanvas();
    }
}

function redo() {
    if (redoStack.length > 0) {
        strokes.push(redoStack.pop());
        redrawCanvas();
    }
}

function clearCanvas() {
    strokes = [];
    redoStack = [];
    redrawCanvas();
}

function adaptiveFilter(rawX, rawY, timestamp) {
    if (lastTime === 0 || (timestamp - lastTime > 500)) {
        // Reset filter if a lot of time has passed
        lastFilteredX = rawX;
        lastFilteredY = rawY;
        lastRawX = rawX;
        lastRawY = rawY;
        lastTime = timestamp;
        return { x: rawX, y: rawY, velocity: 0 };
    }
    
    const dt = timestamp - lastTime;
    const dx = rawX - lastRawX;
    const dy = rawY - lastRawY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const velocity = distance / dt; // pixels per ms
    
    // Outlier rejection (e.g. tracking jump)
    if (distance > 150) { // Jumped more than 150 pixels in one frame
        return { x: lastFilteredX, y: lastFilteredY, velocity: 0 }; 
    }
    
    // Dynamic alpha based on velocity and stability setting
    // Low velocity -> High smoothing (Low alpha)
    // High velocity -> Low smoothing (High alpha)
    // stability slider controls the base smoothing.
    
    let baseAlpha = 1.0 - (stability * 0.9); // Range ~0.1 to 1.0
    let alpha = baseAlpha + (velocity * 0.1); 
    alpha = Math.max(0.05, Math.min(1.0, alpha)); // Clamp
    
    const filteredX = lastFilteredX + alpha * (rawX - lastFilteredX);
    const filteredY = lastFilteredY + alpha * (rawY - lastFilteredY);
    
    // Very basic predictive smoothing: push slightly forward along vector
    const predX = filteredX + (filteredX - lastFilteredX) * 0.2;
    const predY = filteredY + (filteredY - lastFilteredY) * 0.2;
    
    lastRawX = rawX;
    lastRawY = rawY;
    lastFilteredX = predX;
    lastFilteredY = predY;
    lastTime = timestamp;
    
    return { x: predX, y: predY, velocity: velocity };
}

function eraseAt(x, y) {
    const newStrokes = strokes.filter(stroke => {
        for (const pt of stroke.points) {
            const dx = pt.x - x;
            const dy = pt.y - y;
            if (Math.sqrt(dx * dx + dy * dy) < eraserSize) {
                return false;
            }
        }
        return true;
    });
    
    if (newStrokes.length !== strokes.length) {
        undoStack.push([...strokes]);
        strokes = newStrokes;
        redrawCanvas();
    }
}

export const AirWritingMode = {
    onEnter: () => {
        if (!canvas) initAirWriting();
        canvas.style.display = 'block';
        isDrawing = false;
        lastTime = 0;
        isPaused = false;
        console.log("Air Writing: ACTIVE");
    },
    
    onExit: () => {
        isDrawing = false;
        document.getElementById('pen-cursor').classList.add('hidden');
        console.log("Air Writing: EXIT");
    },
    
    onGesture: (gesture, handInfo, timestamp) => {
        const penCursor = document.getElementById('pen-cursor');
        
        // Filter coordinates
        const { x, y, velocity } = adaptiveFilter(state.cursorX, state.cursorY, timestamp);
        
        penCursor.style.left = `${x}px`;
        penCursor.style.top = `${y}px`;
        
        if (gesture === 'OPEN_PALM') {
            isPaused = true;
            isDrawing = false;
            penCursor.classList.add('hidden');
            return;
        } else {
            isPaused = false;
            penCursor.classList.remove('hidden');
        }

        if (gesture === 'FIST') {
            // In a real app, hold for 1 sec.
            clearCanvas();
            return;
        }

        const shouldDraw = (drawMode === 'CONTINUOUS' && gesture === 'ONE_FINGER') || 
                           (drawMode === 'PINCH' && gesture === 'PINCH');

        if (shouldDraw) {
            penCursor.style.backgroundColor = penColor;
            penCursor.style.width = '8px';
            penCursor.style.height = '8px';
            
            // Velocity-aware thickness
            // Slower -> Thicker, Faster -> Thinner
            let dynamicSize = basePenSize - (velocity * 2);
            dynamicSize = Math.max(2, Math.min(basePenSize + 2, dynamicSize));
            
            if (!isDrawing) {
                isDrawing = true;
                currentStroke = {
                    color: penColor,
                    points: [{x, y, width: dynamicSize}]
                };
                strokes.push(currentStroke);
                redoStack = [];
            } else {
                currentStroke.points.push({x, y, width: dynamicSize});
                // Optimize: only redraw the newest segment instead of full canvas, but for simplicity here we redraw all or partial.
                // For a high-fidelity app we'd draw onto a temporary canvas, but redrawCanvas() works for reasonable stroke counts.
                redrawCanvas();
            }
        } else if (gesture === 'TWO_FINGERS') {
            // Erase
            penCursor.style.backgroundColor = 'rgba(255, 0, 85, 0.5)';
            penCursor.style.width = `${eraserSize * 2}px`;
            penCursor.style.height = `${eraserSize * 2}px`;
            
            isDrawing = false;
            eraseAt(x, y);
        } else {
            // Stop drawing
            isDrawing = false;
            penCursor.style.width = '20px';
            penCursor.style.height = '20px';
            penCursor.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            penCursor.style.border = '2px solid rgba(0, 243, 255, 0.8)';
        }
    },
    
    onSwipe: (direction) => {
        if (direction === 'LEFT') undo();
        else if (direction === 'RIGHT') redo();
    }
};
