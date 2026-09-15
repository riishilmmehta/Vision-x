import { state } from './app.js';
import { handleGestureAction, handleSwipe } from './modes.js';
import { captureScreenshot } from './screenshot.js';
import { playSound } from './audio.js';

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
    },
    
    // Swipe detection
    history: [],
    historyLength: 10
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
    } else {
        // Finger counting
        let count = 0;
        if (indexExt) count++;
        if (middleExt) count++;
        if (ringExt) count++;
        if (pinkyExt) count++;
        
        if (count === 1 && indexExt) {
            detectedGesture = 'ONE_FINGER';
            confidence = 0.9;
        } else if (count === 2 && indexExt && middleExt) {
            const indexMiddleDist = getDistance(hand[8], hand[12]) / palmSize;
            if (indexMiddleDist > 0.4) {
                detectedGesture = 'V_SIGN';
                confidence = 0.8;
            } else {
                detectedGesture = 'TWO_FINGERS'; // Or SCROLL depending on mode
                confidence = 0.8;
            }
        } else if (count === 3) {
            detectedGesture = 'THREE_FINGERS';
            confidence = 0.8;
        } else if (count === 4) {
            detectedGesture = 'FOUR_FINGERS';
            confidence = 0.8;
        }
    }
    
    // Swipe detection logic
    gestureEngine.history.push({ x: state.cursorX, y: state.cursorY, time: timestamp });
    if (gestureEngine.history.length > gestureEngine.config.historyLength) {
        gestureEngine.history.shift();
    }
    
    detectSwipe(timestamp);

    processStateMachine(detectedGesture, confidence, timestamp, handedness[0]);
}

function detectSwipe(timestamp) {
    if (gestureEngine.history.length < 5) return;
    if (gestureEngine.state === GESTURE_STATES.COOLDOWN) return;
    if (state.currentGesture === 'PINCH' || state.currentGesture === 'FIST') return;

    const oldest = gestureEngine.history[0];
    const newest = gestureEngine.history[gestureEngine.history.length - 1];
    
    const dx = newest.x - oldest.x;
    const dy = newest.y - oldest.y;
    const dt = newest.time - oldest.time;
    
    if (dt === 0) return;
    
    const velocityX = dx / dt;
    const velocityY = dy / dt;
    
    // Thresholds for swipe
    if (Math.abs(velocityX) > 2.0 && Math.abs(velocityX) > Math.abs(velocityY) * 2) {
        if (velocityX < 0) {
            handleSwipe('LEFT');
        } else {
            handleSwipe('RIGHT');
        }
        // Force cooldown
        gestureEngine.state = GESTURE_STATES.COOLDOWN;
        gestureEngine.lastActiveTime = timestamp;
        gestureEngine.history = [];
    }
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
    }
    
    // Dispatch to mode manager
    handleGestureAction(gesture, handInfo, Date.now());
}

function triggerGestureEnd(gesture) {
    console.log("Gesture Released:", gesture);
    
    if (gesture === 'PINCH') {
        state.isPinching = false;
    }
    
    // Modes can also handle release if needed, but for now we dispatch an 'IDLE' or END signal
    // handleGestureAction('RELEASE_' + gesture, null, Date.now());
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
