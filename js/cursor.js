import { state } from './app.js';

const cursorElement = document.getElementById('virtual-cursor');
const uiCursorX = document.getElementById('ui-cursor-x');
const uiCursorY = document.getElementById('ui-cursor-y');

// Cursor configuration
const cursorConfig = {
    smoothing: 0.7, // Higher means more smoothing (slower response)
    deadZone: 0.005, // Normalized distance to ignore
    edgePadding: 0.1, // Padding at edges to allow reaching the screen edge easily
};

// Target and current positions
let targetX = 0;
let targetY = 0;
let currentX = window.innerWidth / 2;
let currentY = window.innerHeight / 2;

export function updateCursor(landmarks) {
    if (!landmarks || landmarks.length === 0) {
        cursorElement.classList.add('hidden');
        return;
    }
    
    cursorElement.classList.remove('hidden');
    
    // We'll use the primary hand (first one detected) for cursor control
    const hand = landmarks[0];
    
    // Index finger tip is landmark 8
    const indexTip = hand[8];
    
    // Normalize coordinates with edge padding
    // We want the user to be able to reach the edges without going off-camera
    let normX = indexTip.x;
    
    // Mirror X coordinate if camera is mirrored
    if (state.cameraMirrored) {
        normX = 1 - normX;
    }

    let normY = indexTip.y;
    
    // Apply edge padding scaling
    const scale = 1 / (1 - 2 * cursorConfig.edgePadding);
    normX = (normX - cursorConfig.edgePadding) * scale;
    normY = (normY - cursorConfig.edgePadding) * scale;
    
    // Clamp to [0, 1]
    normX = Math.max(0, Math.min(1, normX));
    normY = Math.max(0, Math.min(1, normY));
    
    // Calculate raw screen coordinates
    const rawX = normX * window.innerWidth;
    const rawY = normY * window.innerHeight;
    
    // Dead zone check (prevent micro-jitters)
    const dx = rawX - targetX;
    const dy = rawY - targetY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const deadZonePixels = cursorConfig.deadZone * Math.max(window.innerWidth, window.innerHeight);
    
    if (distance > deadZonePixels) {
        targetX = rawX;
        targetY = rawY;
    }
    
    // Apply smoothing (Exponential Moving Average)
    // The smoothing factor can be adjusted by the user in settings
    const smoothFactor = state.smoothing || cursorConfig.smoothing;
    const newX = currentX * smoothFactor + targetX * (1 - smoothFactor);
    const newY = currentY * smoothFactor + targetY * (1 - smoothFactor);
    
    // Dispatch mouse move if moved significantly
    if (Math.abs(newX - currentX) > 0.5 || Math.abs(newY - currentY) > 0.5) {
        currentX = newX;
        currentY = newY;
        
        state.cursorX = currentX;
        state.cursorY = currentY;
        
        if (state.interactionMode === 'MOUSE') {
            const element = document.elementFromPoint(currentX, currentY);
            if (element) {
                const event = new MouseEvent('mousemove', {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    clientX: currentX,
                    clientY: currentY
                });
                element.dispatchEvent(event);
            }
        }
    }
    
    // Render cursor
    renderCursor();
}

function renderCursor() {
    cursorElement.style.left = `${currentX}px`;
    cursorElement.style.top = `${currentY}px`;
    
    if (state.isPinching) {
        cursorElement.classList.add('clicking');
    } else {
        cursorElement.classList.remove('clicking');
    }
    
    // Update debug panel
    if (state.debugMode) {
        uiCursorX.textContent = Math.round(currentX);
        uiCursorY.textContent = Math.round(currentY);
    }
}
