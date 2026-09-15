import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3';
import { videoElement } from './camera.js';
import { state } from './app.js';

let handLandmarker;
let runningMode = "VIDEO";
let lastVideoTime = -1;

const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');

export async function initTracker() {
    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU"
            },
            runningMode: runningMode,
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        // Resize canvas to match video
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        return true;
    } catch (error) {
        console.error("Error initializing HandLandmarker:", error);
        return false;
    }
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

export function updateTracker(timestamp) {
    if (!handLandmarker || !videoElement.videoWidth) return null;
    
    // Resize canvas if video dimensions are known and different
    if (canvas.width !== videoElement.clientWidth || canvas.height !== videoElement.clientHeight) {
        canvas.width = videoElement.clientWidth;
        canvas.height = videoElement.clientHeight;
    }

    let results = null;
    
    // Process video frame
    if (videoElement.currentTime !== lastVideoTime) {
        lastVideoTime = videoElement.currentTime;
        results = handLandmarker.detectForVideo(videoElement, performance.now());
    }
    
    // Update state
    if (results && results.landmarks) {
        state.handCount = results.landmarks.length;
        document.getElementById('ui-hand-count').textContent = state.handCount;
        
        // Draw landmarks
        drawLandmarks(results);
    }
    
    return results;
}

const CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8], // Index
    [5, 9], [9, 10], [10, 11], [11, 12], // Middle
    [9, 13], [13, 14], [14, 15], [15, 16], // Ring
    [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
    [0, 17] // Palm base
];

function drawLandmarks(results) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (results.landmarks.length === 0) return;
    
    ctx.save();
    
    // Mirror the canvas context since the video is mirrored
    if (state.cameraMirrored) {
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
    }
    
    for (const landmarks of results.landmarks) {
        // Draw connections (skeleton)
        ctx.strokeStyle = 'rgba(0, 255, 204, 0.5)';
        ctx.lineWidth = 2;
        
        for (const [startIdx, endIdx] of CONNECTIONS) {
            const start = landmarks[startIdx];
            const end = landmarks[endIdx];
            
            ctx.beginPath();
            ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
            ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
            ctx.stroke();
        }
        
        // Draw points (joints)
        ctx.fillStyle = 'rgba(255, 0, 255, 0.8)'; // Secondary color
        for (const landmark of landmarks) {
            ctx.beginPath();
            ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 4, 0, 2 * Math.PI);
            ctx.fill();
        }
    }
    
    ctx.restore();
}
