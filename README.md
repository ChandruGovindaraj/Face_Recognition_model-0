# Face Matrix: Real-Time Expression & Pose Analytics

Face Matrix is a modern, real-time facial recognition web application. It uses a state-of-the-art **Python AI Backend (MediaPipe)** combined with a **glassmorphism Web UI** to track your facial expressions and head movement in real-time securely inside your browser.

## Features

- **Real-Time Facial Tracking**: Streams compressed webcam frames over fast WebSockets to a Python inference server.
- **Complex Expression AI**: Detects up to 10 unique expressions including:
  - Happy, Sad, Angry, Surprised, Disgusted
  - Fearful, Kissing, Confused, Winking/Flirting, Yawning
- **Head Pose Analytics**: Calculates precise Euler angles (Pitch, Yaw, Roll) based on a 4x4 transformation matrix.
- **Privacy Native**: Processing is handled entirely locally on your machine.
- **Premium UI**: Crafted with vanilla modern CSS (glassmorphism, CSS grid, hover animations) and an interactive 3D mesh overlay on the webcam feed.

---

## 🚀 Installation & Setup

Because this project requires a high-performance Python inference backend, you must run both the backend server and a local web server for the frontend to work.

### 1. Backend Setup (Python API)
The AI tracking is powered by FastAPI and the MediaPipe Python SDK.

1. Ensure you have **Python 3.8+** installed.
2. Open a terminal in the project directory.
3. Install the required Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the backend WebSocket server:
   ```bash
   python -m uvicorn main:app --host 127.0.0.1 --port 8000
   ```
   *(Note: The first time it runs, it will safely download the 10MB `face_landmarker.task` weights file from Google).*

### 2. Frontend Setup (Web App)
Because of browser security policies related to Webcams and ES Modules, you cannot simply double-click `index.html`. You must run a local web server.

Any standard web server will work:
- **VS Code**: Use the `Live Server` extension.
- **Node.js**: Run `npx http-server -p 8080 -c-1` in the project directory.
- **Python**: Run `python -m http.server 8080` in the project directory.

### 3. Usage
1. Open your browser and navigate to your frontend URL (e.g., `http://127.0.0.1:8080`).
2. Make sure the Python backend terminal is running without errors.
3. The dashboard will show `Connecting to Backend...` briefly and then disappear.
4. Click **Enable Webcam**.
5. Allow webcam permissions in your browser.
6. The facial mesh will appear over your face, and the right sidebar will update with your expression data in real-time!

---

## Technical Stack
- **Frontend**: HTML5, Vanilla CSS3 (Custom Properties, Flexbox, Grid), JavaScript (ES Modules, WebSockets, Canvas API, `getUserMedia()`)
- **Backend**: Python, FastAPI, Uvicorn, WebSockets API
- **AI / Computer Vision**: Google MediaPipe Vision, OpenCV Numpy
