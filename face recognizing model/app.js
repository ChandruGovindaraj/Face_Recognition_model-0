const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const enableWebcamButton = document.getElementById("enableWebcamButton");
const loadingElement = document.getElementById("loading");

// Internal canvas to capture video frames for sending to backend
const captureCanvas = document.createElement("canvas");
const captureCtx = captureCanvas.getContext("2d");

// UI Elements mapping
const primaryExpressionEl = document.getElementById("primary-expression");
const expressionAccuracyBar = document.getElementById("expression-accuracy-bar");
const expressionAccuracyText = document.getElementById("expression-accuracy-text");
const anglePitchEl = document.getElementById("angle-pitch");
const angleYawEl = document.getElementById("angle-yaw");
const angleRollEl = document.getElementById("angle-roll");
const blendshapesList = document.getElementById("blendshapes-list");

let runningMode = "VIDEO";
let webcamRunning = false;
let socket = null;
let isSocketConnected = false;

// 1. Setup WebSocket connection to Python Backend
function initializeWebSocket() {
    loadingElement.innerText = "Connecting to Backend...";
    socket = new WebSocket("ws://localhost:8000/ws");

    socket.onopen = () => {
        console.log("Connected to Python backend");
        isSocketConnected = true;
        loadingElement.style.opacity = "0";
        setTimeout(() => loadingElement.style.display = "none", 500);

        if (hasGetUserMedia()) {
            enableWebcamButton.addEventListener("click", toggleWebcam);
        } else {
            console.warn("getUserMedia() is not supported by your browser");
            enableWebcamButton.innerText = "Webcam Not Supported";
            enableWebcamButton.disabled = true;
        }
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.status === "success") {
            processBackendResponse(data);
        } else {
            resetUI();
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        }
    };

    socket.onclose = () => {
        console.warn("WebSocket disconnected");
        isSocketConnected = false;
        loadingElement.innerText = "Connection lost. Ensure Python server is running.";
        loadingElement.style.display = "flex";
        loadingElement.style.opacity = "1";
    };

    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
    };
}

initializeWebSocket();

// Check if browser supports webcam
function hasGetUserMedia() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// 2. Toggle webcam streaming
function toggleWebcam(event) {
    if (!isSocketConnected) {
        alert("Backend server is not connected. Please start the Python script.");
        return;
    }

    if (webcamRunning === true) {
        // Stop the webcam
        webcamRunning = false;
        enableWebcamButton.innerText = "Enable Webcam";
        // Stop tracks
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        resetUI();
    } else {
        // Start the webcam
        webcamRunning = true;
        enableWebcamButton.innerText = "Disable Webcam";

        const constraints = {
            video: {
                width: 640,  // Lower resolution to save WebSocket bandwidth
                height: 480,
                facingMode: "user"
            }
        };

        navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", () => {
                // Set capture canvas size
                captureCanvas.width = video.videoWidth;
                captureCanvas.height = video.videoHeight;
                // Set output canvas size
                canvasElement.width = video.videoWidth;
                canvasElement.height = video.videoHeight;
                
                sendFrames();
            });
        }).catch(err => {
            console.error("Error accessing webcam", err);
            webcamRunning = false;
            enableWebcamButton.innerText = "Enable Webcam";
            alert("Could not access webcam.");
        });
    }
}

function resetUI() {
    primaryExpressionEl.innerText = "Detecting...";
    expressionAccuracyBar.style.width = "0%";
    expressionAccuracyText.innerText = "0% Confidence";
    anglePitchEl.innerText = "0°";
    angleYawEl.innerText = "0°";
    angleRollEl.innerText = "0°";
    blendshapesList.innerHTML = "";
}

// 3. Send video frames to backend
function sendFrames() {
    if (webcamRunning && isSocketConnected && socket.readyState === WebSocket.OPEN) {
        // Draw current video frame to hidden canvas
        captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
        
        // Convert to highly compressed JPEG base64 (to save bandwidth for real-time)
        const frameData = captureCanvas.toDataURL("image/jpeg", 0.5);
        
        // Send to python backend
        socket.send(frameData);

        // Throttle slightly (e.g. max 30 FPS)
        setTimeout(() => requestAnimationFrame(sendFrames), 33);
    } else if (webcamRunning) {
        requestAnimationFrame(sendFrames); // wait for socket to reopen
    }
}

// 4. Process incoming JSON from Python
function processBackendResponse(data) {
    if (!webcamRunning) {
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        return;
    }

    // 1. Draw Mesh
    if (data.landmarks) {
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        canvasCtx.fillStyle = "rgba(96, 165, 250, 0.6)"; // light blue
        for (const lm of data.landmarks) {
            const x = lm.x * canvasElement.width;
            const y = lm.y * canvasElement.height;
            canvasCtx.beginPath();
            canvasCtx.arc(x, y, 1.2, 0, 2 * Math.PI);
            canvasCtx.fill();
        }
    } else {
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    }

    // 2. Expressions
    if (data.expression_data) {
        const bestExpression = data.expression_data.expression;
        const confidence = data.expression_data.confidence;

        primaryExpressionEl.innerText = bestExpression;
        expressionAccuracyBar.style.width = `${confidence}%`;
        expressionAccuracyText.innerText = `${confidence}% Confidence`;

        // Top 10 specific generic trackers
        blendshapesList.innerHTML = "";
        data.expression_data.blendshapes.forEach(bs => {
            const el = document.createElement("div");
            el.className = "blendshape-item";
            el.innerHTML = `
                <span class="blendshape-name" title="${bs.name}">${bs.name}</span>
                <div class="blendshape-bar-wrap">
                    <div class="blendshape-bar" style="width: ${bs.score}%"></div>
                </div>
                <span class="blendshape-score">${bs.score}%</span>
            `;
            blendshapesList.appendChild(el);
        });
    }

    // 3. Pose
    if (data.pose_data) {
        anglePitchEl.innerText = `${data.pose_data.pitch}°`;
        angleYawEl.innerText = `${data.pose_data.yaw}°`;
        angleRollEl.innerText = `${data.pose_data.roll}°`;
    }
}
