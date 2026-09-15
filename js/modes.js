// Mode Manager
import { state } from './app.js';
import { GestureEngine } from './gesture_engine.js';
import { CommandsMode } from './commands.js';
import { AirWritingMode } from './airwriting.js';
import { AnimationLabMode } from './animation_lab.js';
import { playSound } from './audio.js';
import { captureScreenshot } from './screenshot.js';

export const MODES = {
    VIRTUAL_MOUSE: 'VIRTUAL_MOUSE',
    AIR_WRITING: 'AIR_WRITING',
    ANIMATION_LAB: 'ANIMATION_LAB',
    SCREENSHOT: 'SCREENSHOT',
    COMMANDS: 'COMMANDS'
};

const VirtualMouseMode = {
    onEnter: () => console.log("Mouse Mode: ACTIVE"),
    onExit: () => console.log("Mouse Mode: EXIT"),
    onGestureEvent: (eventType, payload) => {
        const { gesture, timestamp } = payload;
        
        if (eventType === 'ACTION_STARTED') {
            if (gesture === 'PINCH') {
                triggerClickEvent('mousedown');
                playSound('click');
                showRippleFeedback();
            } else if (gesture === 'V_SIGN') {
                captureScreenshot();
            }
        } else if (eventType === 'ACTION_COMPLETED') {
            if (gesture === 'PINCH') {
                triggerClickEvent('mouseup');
                triggerClickEvent('click');
                playSound('click');
            }
        }
    },
    onSwipe: () => {}
};

function triggerClickEvent(eventType) {
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
    document.getElementById('visual-feedback').appendChild(ripple);
    setTimeout(() => ripple.remove(), 500);
}

const modeHandlers = {
    [MODES.VIRTUAL_MOUSE]: VirtualMouseMode,
    [MODES.AIR_WRITING]: AirWritingMode,
    [MODES.ANIMATION_LAB]: AnimationLabMode,
    [MODES.SCREENSHOT]: null,
    [MODES.COMMANDS]: CommandsMode
};

// Event-Driven Dispatcher
GestureEngine.addEventListener((eventType, payload) => {
    const handler = modeHandlers[state.interactionMode];
    if (handler && handler.onGestureEvent) {
        handler.onGestureEvent(eventType, payload);
    }
});

export function handleSwipe(direction) {
    const handler = modeHandlers[state.interactionMode];
    if (handler && handler.onSwipe) {
        handler.onSwipe(direction);
    }
}

export function requestModeChange(newMode) {
    if (state.interactionMode === MODES.AIR_WRITING && newMode !== MODES.AIR_WRITING) {
        const prompt = document.getElementById('exit-prompt');
        prompt.classList.remove('hidden');
        
        const yesBtn = document.getElementById('btn-exit-yes');
        const cancelBtn = document.getElementById('btn-exit-cancel');
        
        const cleanup = () => {
            prompt.classList.add('hidden');
            yesBtn.replaceWith(yesBtn.cloneNode(true));
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        };
        
        document.getElementById('btn-exit-yes').addEventListener('click', () => {
            cleanup();
            executeModeChange(newMode);
        });
        
        document.getElementById('btn-exit-cancel').addEventListener('click', () => {
            cleanup();
            document.querySelector(`.mode-btn[data-mode="${MODES.AIR_WRITING}"]`).classList.add('active');
            document.querySelector(`.mode-btn[data-mode="${newMode}"]`).classList.remove('active');
        });
    } else {
        executeModeChange(newMode);
    }
}

function executeModeChange(newMode) {
    const oldHandler = modeHandlers[state.interactionMode];
    if (oldHandler && oldHandler.onExit) oldHandler.onExit();
    
    state.interactionMode = newMode;
    console.log(`MODE CHANGED TO: ${newMode}`);
    
    const newHandler = modeHandlers[newMode];
    if (newHandler && newHandler.onEnter) newHandler.onEnter();
    
    const airWritingToolbar = document.getElementById('air-writing-toolbar');
    if (newMode === MODES.AIR_WRITING) airWritingToolbar.classList.remove('hidden');
    else airWritingToolbar.classList.add('hidden');
    
    showModeNotification(newMode);
}

function showModeNotification(modeName) {
    const notification = document.createElement('div');
    notification.className = 'glass-panel';
    notification.style.position = 'absolute';
    notification.style.top = '100px';
    notification.style.left = '50%';
    notification.style.transform = 'translateX(-50%)';
    notification.style.zIndex = '1000';
    notification.style.textAlign = 'center';
    
    notification.innerHTML = `
        <h3 style="color: var(--text-color); margin-bottom: 5px;">GESTURE MODE RESTORED</h3>
        <div style="font-size: 1.2rem; color: var(--primary-color); font-weight: bold;">${modeName.replace('_', ' ')}</div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.5s';
        setTimeout(() => notification.remove(), 500);
    }, 2000);
}
