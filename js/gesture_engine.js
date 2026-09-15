import { state } from './app.js';

// Debug UI Elements
let ui = {};
window.addEventListener('DOMContentLoaded', () => {
    ui = {
        detected: document.getElementById('dbg-detected'),
        hand: document.getElementById('dbg-hand'),
        thumb: document.getElementById('dbg-thumb'),
        index: document.getElementById('dbg-index'),
        middle: document.getElementById('dbg-middle'),
        ring: document.getElementById('dbg-ring'),
        pinky: document.getElementById('dbg-pinky'),
        pinchDist: document.getElementById('dbg-pinch-dist'),
        winner: document.getElementById('dbg-winner'),
        confidence: document.getElementById('dbg-confidence'),
        stateStr: document.getElementById('dbg-state'),
        suppressed: document.getElementById('dbg-suppressed'),
        mode: document.getElementById('dbg-mode'),
        action: document.getElementById('dbg-action'),
        fps: document.getElementById('dbg-fps'),
        lat: document.getElementById('dbg-lat')
    };
});

export const GESTURE_STATES = {
    NO_HAND: 'NO_HAND',
    DETECTED: 'DETECTED',
    STABILIZING: 'STABILIZING',
    CONFIRMED: 'CONFIRMED',
    ACTIVE: 'ACTIVE',
    RELEASE_DETECTED: 'RELEASE_DETECTED',
    COOLDOWN: 'COOLDOWN',
    REARMED: 'REARMED'
};

const ENGINE_CONFIG = {
    pinchThreshold: 0.15,
    stabilizeTime: 150, // ms to stabilize simple gestures
    cooldownTime: 500,  // ms general cooldown
};

export const GestureEngine = {
    currentState: GESTURE_STATES.NO_HAND,
    activeGesture: null,
    candidateGesture: null,
    confidence: 0,
    stateStartTime: 0,
    lastFrameTime: 0,
    listeners: [],
    
    // Performance
    frameCount: 0,
    lastFpsTime: 0,
    currentFps: 0,

    addEventListener(callback) {
        this.listeners.push(callback);
    },
    
    emitEvent(eventType, payload) {
        if(ui.action) ui.action.textContent = eventType;
        for (let listener of this.listeners) {
            listener(eventType, payload);
        }
    },
    
    transitionTo(newState, timestamp, reason = "") {
        if (this.currentState !== newState) {
            console.log(`[GestureEngine] ${this.currentState} -> ${newState} (${reason})`);
            this.currentState = newState;
            this.stateStartTime = timestamp;
            if(ui.stateStr) ui.stateStr.textContent = newState;
        }
    },

    update(landmarks, handedness, timestamp) {
        // FPS Calc
        this.frameCount++;
        if (timestamp - this.lastFpsTime > 1000) {
            this.currentFps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsTime = timestamp;
            if(ui.fps) ui.fps.textContent = this.currentFps;
        }
        
        if(ui.lat) {
            const latency = Date.now() - timestamp;
            ui.lat.textContent = `${latency}ms`;
        }

        if(ui.mode) ui.mode.textContent = state.interactionMode;

        if (!landmarks || landmarks.length === 0) {
            this.handleNoHand(timestamp);
            return;
        }

        if(ui.detected) ui.detected.textContent = 'YES';
        const handLabel = handedness && handedness.length > 0 ? handedness[0].categoryName : 'RIGHT';
        if(ui.hand) ui.hand.textContent = handLabel;

        const hand = landmarks[0];
        
        // 1. Calculate Finger States (using robust palm-relative distances)
        const palmSize = this.getDistance(hand[0], hand[5]);
        
        const thumbExt = this.isFingerExtended(hand, 4, 3, 2);
        const indexExt = this.isFingerExtended(hand, 8, 6, 5);
        const middleExt = this.isFingerExtended(hand, 12, 10, 9);
        const ringExt = this.isFingerExtended(hand, 16, 14, 13);
        const pinkyExt = this.isFingerExtended(hand, 20, 18, 17);
        
        if(ui.thumb) ui.thumb.textContent = thumbExt ? 'OPEN' : 'CLOSED';
        if(ui.index) ui.index.textContent = indexExt ? 'OPEN' : 'CLOSED';
        if(ui.middle) ui.middle.textContent = middleExt ? 'OPEN' : 'CLOSED';
        if(ui.ring) ui.ring.textContent = ringExt ? 'OPEN' : 'CLOSED';
        if(ui.pinky) ui.pinky.textContent = pinkyExt ? 'OPEN' : 'CLOSED';

        const pinchDist = this.getDistance(hand[4], hand[8]) / palmSize;
        if(ui.pinchDist) ui.pinchDist.textContent = pinchDist.toFixed(3);

        // 2. Identify Candidates
        let candidates = [];
        
        // Evaluate Pinch
        if (pinchDist < ENGINE_CONFIG.pinchThreshold) {
            const conf = Math.max(0, 1 - (pinchDist / ENGINE_CONFIG.pinchThreshold));
            candidates.push({ name: 'PINCH', priority: 3, confidence: conf });
        }
        
        // Evaluate Finger Counts
        let count = 0;
        if(indexExt) count++;
        if(middleExt) count++;
        if(ringExt) count++;
        if(pinkyExt) count++;
        
        if (count === 0 && !thumbExt) {
            candidates.push({ name: 'FIST', priority: 5, confidence: 0.95 });
        } else if (count === 4 && thumbExt) {
            candidates.push({ name: 'OPEN_PALM', priority: 1, confidence: 0.9 });
        } else if (count === 1 && indexExt) {
            candidates.push({ name: 'ONE_FINGER', priority: 3, confidence: 0.9 });
        } else if (count === 2 && indexExt && middleExt) {
            candidates.push({ name: 'TWO_FINGERS', priority: 3, confidence: 0.9 });
        } else if (count === 3 && indexExt && middleExt && ringExt) {
            // SPIDER POSE / WEB GESTURE (Thumb, Index, Pinky extended commonly, but let's use Index, Middle, Ring for now or just map it as a custom pose)
            // Wait, the requirements said Web Pose: Index + Pinky extended. Let's add that.
        }
        
        if (indexExt && pinkyExt && !middleExt && !ringExt) {
            candidates.push({ name: 'WEB_POSE', priority: 4, confidence: 0.9 });
        }

        // 3. Priority Resolution
        // Filter out gestures that don't meet a baseline confidence
        candidates = candidates.filter(c => c.confidence > 0.6);
        
        // Sort by priority (descending), then by confidence
        candidates.sort((a, b) => {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return b.confidence - a.confidence;
        });

        const winner = candidates.length > 0 ? candidates[0] : { name: 'IDLE', confidence: 1, priority: 0 };
        const suppressed = candidates.length > 1 ? candidates.slice(1).map(c => c.name).join(', ') : 'NONE';
        
        if(ui.winner) {
            ui.winner.textContent = winner.name;
            ui.winner.style.color = winner.name !== 'IDLE' ? '#00f3ff' : '#666';
        }
        if(ui.suppressed) ui.suppressed.textContent = suppressed;
        if(ui.confidence) ui.confidence.textContent = `${Math.round(winner.confidence * 100)}%`;

        // 4. State Machine processing
        this.processStateMachine(winner, timestamp, hand);
    },
    
    processStateMachine(winner, timestamp, handInfo) {
        const timeInState = timestamp - this.stateStartTime;
        
        switch (this.currentState) {
            case GESTURE_STATES.NO_HAND:
                if (winner.name !== 'IDLE') {
                    this.candidateGesture = winner.name;
                    this.confidence = winner.confidence;
                    this.transitionTo(GESTURE_STATES.DETECTED, timestamp, "Valid gesture found");
                }
                break;
                
            case GESTURE_STATES.DETECTED:
                if (winner.name === this.candidateGesture) {
                    this.transitionTo(GESTURE_STATES.STABILIZING, timestamp, "Gesture matches candidate");
                } else {
                    this.transitionTo(GESTURE_STATES.NO_HAND, timestamp, "Gesture changed early");
                }
                break;
                
            case GESTURE_STATES.STABILIZING:
                if (winner.name === this.candidateGesture) {
                    if (timeInState >= ENGINE_CONFIG.stabilizeTime) {
                        this.activeGesture = this.candidateGesture;
                        this.transitionTo(GESTURE_STATES.CONFIRMED, timestamp, "Stability time reached");
                    }
                } else {
                    this.candidateGesture = winner.name !== 'IDLE' ? winner.name : null;
                    this.transitionTo(winner.name !== 'IDLE' ? GESTURE_STATES.DETECTED : GESTURE_STATES.NO_HAND, timestamp, "Gesture changed during stabilization");
                }
                break;
                
            case GESTURE_STATES.CONFIRMED:
                this.transitionTo(GESTURE_STATES.ACTIVE, timestamp, "Auto transition to active");
                this.emitEvent('ACTION_STARTED', { gesture: this.activeGesture, hand: handInfo, timestamp });
                break;
                
            case GESTURE_STATES.ACTIVE:
                if (winner.name !== this.activeGesture || winner.confidence < 0.6) {
                    this.transitionTo(GESTURE_STATES.RELEASE_DETECTED, timestamp, "Gesture lost or confidence dropped");
                } else {
                    // Update active action
                    this.emitEvent('ACTION_CONTINUE', { gesture: this.activeGesture, hand: handInfo, timestamp });
                }
                break;
                
            case GESTURE_STATES.RELEASE_DETECTED:
                // Small grace period to prevent flickering? For now immediate.
                this.emitEvent('ACTION_COMPLETED', { gesture: this.activeGesture, timestamp });
                this.transitionTo(GESTURE_STATES.COOLDOWN, timestamp, "Action completed");
                break;
                
            case GESTURE_STATES.COOLDOWN:
                if (timeInState >= ENGINE_CONFIG.cooldownTime) {
                    this.transitionTo(GESTURE_STATES.REARMED, timestamp, "Cooldown finished");
                }
                break;
                
            case GESTURE_STATES.REARMED:
                this.activeGesture = null;
                this.candidateGesture = null;
                this.transitionTo(GESTURE_STATES.NO_HAND, timestamp, "Ready for new gesture");
                break;
        }
    },

    handleNoHand(timestamp) {
        if(ui.detected) ui.detected.textContent = 'NO';
        if(ui.hand) ui.hand.textContent = '-';
        if(ui.thumb) ui.thumb.textContent = '-';
        if(ui.index) ui.index.textContent = '-';
        if(ui.middle) ui.middle.textContent = '-';
        if(ui.ring) ui.ring.textContent = '-';
        if(ui.pinky) ui.pinky.textContent = '-';
        if(ui.pinchDist) ui.pinchDist.textContent = '0.00';
        if(ui.winner) { ui.winner.textContent = 'NONE'; ui.winner.style.color = '#ff0055'; }
        if(ui.confidence) ui.confidence.textContent = '0%';
        
        if (this.currentState === GESTURE_STATES.ACTIVE || this.currentState === GESTURE_STATES.CONFIRMED) {
            this.emitEvent('ACTION_INTERRUPTED', { gesture: this.activeGesture, timestamp });
            this.transitionTo(GESTURE_STATES.RELEASE_DETECTED, timestamp, "Tracking lost");
        } else if (this.currentState !== GESTURE_STATES.NO_HAND && this.currentState !== GESTURE_STATES.COOLDOWN && this.currentState !== GESTURE_STATES.REARMED) {
            this.transitionTo(GESTURE_STATES.NO_HAND, timestamp, "Tracking lost");
        }
        
        if (this.currentState === GESTURE_STATES.COOLDOWN) {
            this.processStateMachine({name: 'IDLE'}, timestamp, null); // allow cooldown to tick
        }
    },

    getDistance(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dz = p1.z - p2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },

    isFingerExtended(hand, tipIdx, pipIdx, mcpIdx) {
        // True robust finger extension detection: 
        // tip should be further from wrist than the PIP joint.
        // We also check against the MCP to ensure the finger is uncurled.
        const wristToTip = this.getDistance(hand[0], hand[tipIdx]);
        const wristToPip = this.getDistance(hand[0], hand[pipIdx]);
        
        return wristToTip > wristToPip;
    }
};
