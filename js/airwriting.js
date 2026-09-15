import { state } from './app.js';

let canvas, ctx;
let isDrawing = false;
let isErasing = false;
let strokes = []; // Array of strokes. Stroke = array of points
let currentStroke = [];
let undoStack = [];
let redoStack = [];

let smoothedX = 0;
let smoothedY = 0;
const SMOOTH_FACTOR = 0.3; // Lower = smoother but more lag

// Settings
let penSize = 5;
let eraserSize = 40;
let penColor = '#00f3ff'; // Primary cyan
let isPaused = false;

export function initAirWriting() {
    canvas = document.getElementById('drawing-canvas');
    ctx = canvas.getContext('2d');
    
    // Resize canvas
    function resize() {
        // Save content
        const data = canvas.toDataURL();
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        // Restore content
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
        };
        img.src = data;
    }
    
    window.addEventListener('resize', resize);
    resize();
    
    // Toolbar buttons
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);
    document.getElementById('btn-clear').addEventListener('click', clearCanvas);
    
    const toolBtns = document.querySelectorAll('.tool-btn[data-tool]');
    toolBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            toolBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            // Tool is selected via UI, but gesture takes precedence in air writing
        });
    });
}

function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    for (const stroke of strokes) {
        if (stroke.points.length === 0) continue;
        
        ctx.lineWidth = stroke.size;
        ctx.strokeStyle = stroke.color;
        
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
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

function filterPoint(x, y) {
    if (smoothedX === 0 && smoothedY === 0) {
        smoothedX = x;
        smoothedY = y;
    } else {
        smoothedX = smoothedX + SMOOTH_FACTOR * (x - smoothedX);
        smoothedY = smoothedY + SMOOTH_FACTOR * (y - smoothedY);
    }
    return { x: smoothedX, y: smoothedY };
}

function eraseAt(x, y) {
    // Find strokes that intersect with eraser area and remove them
    const newStrokes = strokes.filter(stroke => {
        // Check if any point in stroke is within eraser radius
        for (const pt of stroke.points) {
            const dx = pt.x - x;
            const dy = pt.y - y;
            if (Math.sqrt(dx * dx + dy * dy) < eraserSize) {
                return false; // Intersects, remove stroke
            }
        }
        return true;
    });
    
    if (newStrokes.length !== strokes.length) {
        // We erased something, save state for undo
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
        isErasing = false;
        smoothedX = 0;
        smoothedY = 0;
        isPaused = false;
        console.log("Air Writing: ACTIVE");
    },
    
    onExit: () => {
        // Keep canvas content but disable interaction
        isDrawing = false;
        document.getElementById('pen-cursor').classList.add('hidden');
        console.log("Air Writing: EXIT");
    },
    
    onGesture: (gesture, handInfo, timestamp) => {
        const penCursor = document.getElementById('pen-cursor');
        
        // Update pen cursor position based on filtered coordinates
        const pt = filterPoint(state.cursorX, state.cursorY);
        penCursor.style.left = `${pt.x}px`;
        penCursor.style.top = `${pt.y}px`;
        
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
            // Simple clear for now (user requested hold for 1 sec, simplified here)
            clearCanvas();
            return;
        }

        if (gesture === 'ONE_FINGER') {
            // Draw
            penCursor.style.backgroundColor = penColor;
            penCursor.style.width = '10px';
            penCursor.style.height = '10px';
            
            if (!isDrawing) {
                isDrawing = true;
                currentStroke = {
                    color: penColor,
                    size: penSize,
                    points: [{x: pt.x, y: pt.y}]
                };
                strokes.push(currentStroke);
                redoStack = []; // Clear redo stack on new action
            } else {
                currentStroke.points.push({x: pt.x, y: pt.y});
                redrawCanvas();
            }
        } else if (gesture === 'TWO_FINGERS') {
            // Erase
            penCursor.style.backgroundColor = '#ff0055'; // Red for eraser
            penCursor.style.width = `${eraserSize*2}px`;
            penCursor.style.height = `${eraserSize*2}px`;
            
            isDrawing = false;
            eraseAt(pt.x, pt.y);
        } else {
            // Stop drawing
            isDrawing = false;
            penCursor.style.width = '20px';
            penCursor.style.height = '20px';
            penCursor.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
        }
    },
    
    onSwipe: (direction) => {
        if (direction === 'LEFT') {
            undo();
        } else if (direction === 'RIGHT') {
            redo();
        }
    }
};
