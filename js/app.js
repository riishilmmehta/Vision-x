import { initCamera, startCamera } from './camera.js';
import { initTracker, updateTracker } from './tracker.js';
import { updateCursor } from './cursor.js';
import { GestureEngine } from './gesture_engine.js';
import { renderAnimations } from './animations.js';
import { MODES, requestModeChange } from './modes.js';

// Central Application State
export const state = {
    trackingActive: false,
    cameraActive: false,
    handCount: 0,
    hands: null, // Store latest landmarks
    currentGesture: 'IDLE',
    gestureConfidence: 0,
    cursorX: 0,
    cursorY: 0,
    isPinching: false,
    isDragging: false,
    interactionMode: MODES.VIRTUAL_MOUSE,
    fps: 0,
    sensitivity: 1.0,
    smoothing: 0.5,
    soundEnabled: true,
    cameraMirrored: true,
    debugMode: false
};

// UI Elements
const ui = {
    startupScreen: document.getElementById('startup-screen'),
    mainInterface: document.getElementById('main-interface'),
    errorScreen: document.getElementById('error-screen'),
    btnStart: document.getElementById('btn-start'),
    startupStatus: document.getElementById('startup-status'),
    
    // HUD
    fpsElement: document.getElementById('ui-fps-mini'),
    trackingStatus: document.getElementById('ui-tracking-status'),
    currentGesture: document.getElementById('ui-current-gesture'),
    gestureConfidence: document.getElementById('ui-gesture-confidence'),
    gestureAction: document.getElementById('ui-gesture-action'),
    gestureHand: document.getElementById('ui-gesture-hand'),
    gestureState: document.getElementById('ui-gesture-state'),
    
    // Debug
    debugPanel: document.getElementById('debug-panel'),
    modeBtns: document.querySelectorAll('.mode-btn')
};

// Initialization
async function initializeSystem() {
    ui.btnStart.disabled = true;
    ui.startupStatus.textContent = "REQUESTING CAMERA ACCESS...";
    
    try {
        const cameraReady = await startCamera();
        if (cameraReady) {
            ui.startupStatus.textContent = "INITIALIZING TRACKING ENGINE...";
            const trackerReady = await initTracker();
            
            if (trackerReady) {
                // Transition to main interface
                ui.startupScreen.classList.remove('active');
                ui.mainInterface.classList.add('active');
                state.trackingActive = true;
                
                // Start main loop
                requestAnimationFrame(updateLoop);
            } else {
                showError("Tracking engine initialization failed.");
            }
        } else {
            showError("Camera initialization failed.");
        }
    } catch (error) {
        console.error(error);
        showError("Camera access denied or unavailable.");
    }
}

function showError(message) {
    ui.startupScreen.classList.remove('active');
    ui.mainInterface.classList.remove('active');
    ui.errorScreen.classList.add('active');
    document.getElementById('error-message').textContent = message;
}

// Main Update Loop
let lastTime = 0;
let frameCount = 0;
let lastFpsTime = 0;

function updateLoop(timestamp) {
    // Calculate FPS
    if (timestamp - lastFpsTime >= 1000) {
        state.fps = frameCount;
        frameCount = 0;
        lastFpsTime = timestamp;
        
        // Update HUD
        ui.fpsElement.textContent = `FPS: ${state.fps}`;
        document.getElementById('ui-fps').textContent = state.fps;
    }
    frameCount++;
    
    // Update Tracker
    const results = updateTracker(timestamp);
    
    // Update Cursor and Gestures
    if (results && results.landmarks) {
        state.hands = results.landmarks;
        updateCursor(results.landmarks);
        GestureEngine.update(results.landmarks, results.handednesses, timestamp);
    } else {
        state.hands = null;
        updateCursor(null);
        GestureEngine.update(null, null, timestamp);
    }
    
    // Render Animations
    renderAnimations();
    
    requestAnimationFrame(updateLoop);
}

// Event Listeners
ui.btnStart.addEventListener('click', initializeSystem);

document.getElementById('btn-retry').addEventListener('click', () => {
    ui.errorScreen.classList.remove('active');
    ui.startupScreen.classList.add('active');
    ui.btnStart.disabled = false;
    ui.startupStatus.textContent = "";
});

// Mode Switching
ui.modeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        ui.modeBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        requestModeChange(e.target.dataset.mode);
    });
});

// Keyboard shortcuts for debugging
window.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === 'D') {
        state.debugMode = !state.debugMode;
        if (state.debugMode) {
            ui.debugPanel.classList.remove('hidden');
        } else {
            ui.debugPanel.classList.add('hidden');
        }
    }
});
