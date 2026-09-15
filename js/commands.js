import { playSound } from './audio.js';
import { captureScreenshot } from './screenshot.js';

export const CommandsMode = {
    onEnter: () => {
        console.log("Commands Mode: ACTIVE");
    },
    
    onExit: () => {
        console.log("Commands Mode: EXIT");
    },
    
    onGestureEvent: (eventType, payload) => {
        if (eventType !== 'ACTION_STARTED') return; // Only trigger on confirmation
        
        const { gesture } = payload;
        switch (gesture) {
            case 'ONE_FINGER':
                console.log("Command: Open Google");
                playSound('click');
                window.open('https://www.google.com', '_blank');
                break;
            case 'TWO_FINGERS':
                console.log("Command: Open Claude");
                playSound('click');
                window.open('https://claude.ai', '_blank');
                break;
            case 'THREE_FINGERS':
                console.log("Command: Open ChatGPT");
                playSound('click');
                window.open('https://chatgpt.com', '_blank');
                break;
            case 'FOUR_FINGERS':
                console.log("Command: Open YouTube");
                playSound('click');
                window.open('https://www.youtube.com', '_blank');
                break;
            case 'OPEN_PALM':
                console.log("Command: Screenshot");
                captureScreenshot();
                break;
            default:
                break;
        }
    },
    
    onSwipe: (direction) => {
        console.log("Commands Mode ignored swipe:", direction);
    }
};
