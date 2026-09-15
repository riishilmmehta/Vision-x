import { playSound } from './audio.js';

export function captureScreenshot() {
    const mainInterface = document.getElementById('main-interface');
    
    // Play sound
    playSound('screenshot');
    
    // Create visual flash
    const flash = document.createElement('div');
    flash.style.position = 'absolute';
    flash.style.top = '0';
    flash.style.left = '0';
    flash.style.width = '100%';
    flash.style.height = '100%';
    flash.style.backgroundColor = 'white';
    flash.style.zIndex = '9999';
    flash.style.opacity = '0.8';
    flash.style.transition = 'opacity 0.5s ease-out';
    document.body.appendChild(flash);
    
    // Flash animation
    setTimeout(() => {
        flash.style.opacity = '0';
        setTimeout(() => flash.remove(), 500);
    }, 100);

    // In a real application we would use HTML2Canvas or Screen Capture API here.
    // For this prototype, we simulate the process.
    console.log("SCREENSHOT CAPTURED");
    
    // Show premium UI notification
    showScreenshotNotification();
}

function showScreenshotNotification() {
    const notification = document.createElement('div');
    notification.className = 'glass-panel';
    notification.style.position = 'absolute';
    notification.style.bottom = '100px';
    notification.style.left = '50%';
    notification.style.transform = 'translateX(-50%)';
    notification.style.zIndex = '1000';
    notification.style.textAlign = 'center';
    
    notification.innerHTML = `
        <h3 style="color: var(--primary-color); margin-bottom: 10px;">SCREENSHOT SAVED</h3>
        <div style="display: flex; gap: 10px; justify-content: center;">
            <button class="mode-btn">SAVE</button>
            <button class="mode-btn">COPY</button>
            <button class="mode-btn">CANCEL</button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.5s';
        setTimeout(() => notification.remove(), 500);
    }, 4000);
}
