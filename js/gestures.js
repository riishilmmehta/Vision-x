import { state } from './app.js';
import { captureScreenshot } from './screenshot.js';
import { playSound } from './audio.js';
// We will import audio later when they are ready

const uiGestureState = document.getElementById('ui-gesture-state');
const uiCurrentGesture = document.getElementById('ui-current-gesture');
const uiGestureConfidence = document.getElementById('ui-gesture-confidence');
const uiGestureAction = document.getElementById('ui-gesture-action');
const uiGestureHand = document.getElementById('ui-gesture-hand');
const visualFeedback = document.getElementById('visual-feedback');

// Gesture State Machine
const GESTURE_STATES = {
    IDLE: 'IDLE',
    DETECTED: 'DETECTED',
    CONFIRMED: 'CONFIRMED',
    ACTIVE: 'ACTIVE',
    RELEASED: 'RELEASED',
    COOLDOWN: 'COOLDOWN'
};

const gestureEngine = {
    currentGesture: null,
    state: GESTURE_STATES.IDLE,
    confidence: 0,
    startTime: 0,
    lastActiveTime: 0,
    
    // Configurable thresholds
    config: {
        pinchThreshold: 0.15, // Normalized distance relative to palm size
        confirmDuration: 150, // ms to hold gesture to confirm
        cooldownDuration: 200, // ms to wait after release
    }
};

function getDistance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getPalmSize(hand) {
    // Distance from wrist (0) to index finger MCP (5)
    return getDistance(hand[0], hand[5]);
}

function isFingerExtended(hand, tipIdx, pipIdx) {
    // Basic heuristic: distance from wrist to tip is greater than distance from wrist to PIP
    return getDistance(hand[0], hand[tipIdx]) > getDistance(hand[0], hand[pipIdx]);
}

export function updateGestures(landmarks, handedness, timestamp) {
    if (!landmarks || landmarks.length === 0) {
        resetGestureEngine();
        return;
    }

    const hand = landmarks[0]; // Primary hand
    const palmSize = getPalmSize(hand);
    
    // Check finger extensions
    const thumbExt = isFingerExtended(hand, 4, 3);
    const indexExt = isFingerExtended(hand, 8, 6);
    const middleExt = isFingerExtended(hand, 12, 10);
    const ringExt = isFingerExtended(hand, 16, 14);
    const pinkyExt = isFingerExtended(hand, 20, 18);
    
    const pinchDistance = getDistance(hand[4], hand[8]) / palmSize;
    let detectedGesture = 'IDLE';
    let confidence = 0;

    if (pinchDistance < gestureEngine.config.pinchThreshold) {
        detectedGesture = 'PINCH';
        confidence = Math.max(0, Math.min(1, 1 - (pinchDistance / gestureEngine.config.pinchThreshold)));
    } else if (!thumbExt && !indexExt && !middleExt && !ringExt && !pinkyExt) {
        detectedGesture = 'FIST';
        confidence = 0.9;
    } else if (thumbExt && indexExt && middleExt && ringExt && pinkyExt) {
        detectedGesture = 'OPEN_PALM';
        confidence = 0.9;
    } else if (indexExt && middleExt && !ringExt && !pinkyExt) {
        // V-Sign or Two-Finger Scroll
        const indexMiddleDist = getDistance(hand[8], hand[12]) / palmSize;
        if (indexMiddleDist > 0.4) {
            detectedGesture = 'V_SIGN';
            confidence = 0.8;
        } else {
            detectedGesture = 'SCROLL';
            confidence = 0.8;
        }
    }
    
    // If scrolling is ACTIVE, execute scroll
    if (gestureEngine.state === GESTURE_STATES.ACTIVE && gestureEngine.currentGesture === 'SCROLL') {
        const deltaY = state.cursorY - gestureEngine.lastCursorY;
        window.scrollBy(0, deltaY * 2);
    }
    
    // Store cursor position for scroll delta
    if (gestureEngine.currentGesture === 'SCROLL') {
        gestureEngine.lastCursorY = state.cursorY;
    }

    processStateMachine(detectedGesture, confidence, timestamp, handedness[0]);
}

function processStateMachine(detectedGesture, confidence, timestamp, handInfo) {
    // Handle Cooldown
    if (gestureEngine.state === GESTURE_STATES.COOLDOWN) {
        if (timestamp - gestureEngine.lastActiveTime > gestureEngine.config.cooldownDuration) {
            gestureEngine.state = GESTURE_STATES.IDLE;
            gestureEngine.currentGesture = null;
        } else {
            updateUI();
            return;
        }
    }

    // Handle Idle -> Detected
    if (gestureEngine.state === GESTURE_STATES.IDLE) {
        if (detectedGesture !== 'IDLE' && confidence > 0.6) {
            gestureEngine.state = GESTURE_STATES.DETECTED;
            gestureEngine.currentGesture = detectedGesture;
            gestureEngine.confidence = confidence;
            gestureEngine.startTime = timestamp;
        }
    } 
    // Handle Detected -> Confirmed / Idle
    else if (gestureEngine.state === GESTURE_STATES.DETECTED) {
        if (detectedGesture === gestureEngine.currentGesture && confidence > 0.6) {
            if (timestamp - gestureEngine.startTime > gestureEngine.config.confirmDuration) {
                gestureEngine.state = GESTURE_STATES.CONFIRMED;
                triggerGestureStart(gestureEngine.currentGesture, handInfo);
            }
        } else {
            gestureEngine.state = GESTURE_STATES.IDLE; // False alarm
            gestureEngine.currentGesture = null;
        }
    }
    // Handle Confirmed -> Active
    else if (gestureEngine.state === GESTURE_STATES.CONFIRMED) {
        gestureEngine.state = GESTURE_STATES.ACTIVE;
        state.isPinching = (gestureEngine.currentGesture === 'PINCH');
    }
    // Handle Active -> Released
    else if (gestureEngine.state === GESTURE_STATES.ACTIVE) {
        if (detectedGesture !== gestureEngine.currentGesture || confidence < 0.4) {
            gestureEngine.state = GESTURE_STATES.RELEASED;
            triggerGestureEnd(gestureEngine.currentGesture);
        } else {
            gestureEngine.confidence = confidence;
            // Handle Drag/Hold logic here if needed
        }
    }
    // Handle Released -> Cooldown
    else if (gestureEngine.state === GESTURE_STATES.RELEASED) {
        gestureEngine.state = GESTURE_STATES.COOLDOWN;
        gestureEngine.lastActiveTime = timestamp;
        state.isPinching = false;
        state.isDragging = false;
    }

    updateUI(handInfo);
}

function triggerGestureStart(gesture, handInfo) {
    console.log("Gesture Confirmed:", gesture);
    
    if (gesture === 'PINCH') {
        state.isPinching = true;
        // Simulate Mouse Down
        triggerClickEvent('mousedown');
        playSound('click');
        showRippleFeedback();
    } else if (gesture === 'V_SIGN') {
        captureScreenshot();
    }
}

function triggerGestureEnd(gesture) {
    console.log("Gesture Released:", gesture);
    
    if (gesture === 'PINCH') {
        state.isPinching = false;
        // Simulate Mouse Up and Click
        triggerClickEvent('mouseup');
        triggerClickEvent('click');
        playSound('click');
    }
}

function triggerClickEvent(eventType) {
    if (state.interactionMode !== 'MOUSE') return;
    
    const element = document.elementFromPoint(state.cursorX, state.cursorY);
    if (element) {
        const event = new MouseEvent(eventType, {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: state.cursorX,
            clientY: state.cursorY
        });
        element.dispatchEvent(event);
    }
}

function showRippleFeedback() {
    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    ripple.style.left = `${state.cursorX}px`;
    ripple.style.top = `${state.cursorY}px`;
    visualFeedback.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 500);
}

function resetGestureEngine() {
    if (gestureEngine.state === GESTURE_STATES.ACTIVE || gestureEngine.state === GESTURE_STATES.CONFIRMED) {
        triggerGestureEnd(gestureEngine.currentGesture);
    }
    gestureEngine.state = GESTURE_STATES.IDLE;
    gestureEngine.currentGesture = null;
    gestureEngine.confidence = 0;
    state.isPinching = false;
    state.isDragging = false;
    updateUI();
}

function updateUI(handInfo = null) {
    state.currentGesture = gestureEngine.currentGesture || 'IDLE';
    state.gestureConfidence = Math.round(gestureEngine.confidence * 100);
    
    uiCurrentGesture.textContent = state.currentGesture;
    uiGestureConfidence.textContent = `${state.gestureConfidence}%`;
    uiGestureState.textContent = gestureEngine.state;
    
    if (handInfo && handInfo.length > 0) {
        uiGestureHand.textContent = handInfo[0].categoryName || '-';
    } else {
        uiGestureHand.textContent = '-';
    }
    
    if (state.currentGesture === 'PINCH') {
        uiGestureAction.textContent = 'LEFT CLICK';
    } else {
        uiGestureAction.textContent = 'NONE';
    }
}
