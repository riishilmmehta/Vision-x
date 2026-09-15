export const videoElement = document.getElementById('webcam');
const cameraStatus = document.getElementById('camera-status');

export async function initCamera() {
    // Placeholder if we need separate init
    return true;
}

export async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            }
        });
        
        videoElement.srcObject = stream;
        
        return new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                cameraStatus.textContent = "CAMERA ONLINE";
                cameraStatus.classList.remove('error');
                resolve(true);
            };
        });
    } catch (err) {
        console.error("Error accessing camera:", err);
        cameraStatus.textContent = "CAMERA ERROR";
        cameraStatus.classList.add('error');
        return false;
    }
}

export function stopCamera() {
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
        cameraStatus.textContent = "CAMERA OFFLINE";
    }
}
