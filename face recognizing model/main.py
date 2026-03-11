import asyncio
import cv2
import numpy as np
import base64
import json
import math
import os
import urllib.request
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

app = FastAPI()

# 1. Ensure Model Exists
MODEL_PATH = "face_landmarker.task"
if not os.path.exists(MODEL_PATH):
    print("Downloading MediaPipe Face Landmarker model...")
    urllib.request.urlretrieve(
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        MODEL_PATH
    )
    print("Download complete.")

# 2. Initialize MediaPipe Face Landmarker
base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
options = vision.FaceLandmarkerOptions(
    base_options=base_options,
    output_face_blendshapes=True,
    output_facial_transformation_matrixes=True,
    num_faces=1,
    running_mode=vision.RunningMode.IMAGE # Using IMAGE instead of VIDEO for simple stateless socket requests
)
detector = vision.FaceLandmarker.create_from_options(options)

EXPRESSIONS = {
    "Happy": ["mouthSmileLeft", "mouthSmileRight", "mouthDimpleLeft", "mouthDimpleRight"],
    "Sad": ["mouthFrownLeft", "mouthFrownRight", "browInnerUp", "mouthDepressorLeft", "mouthDepressorRight"],
    "Surprised": ["jawOpen", "browInnerUp", "browOuterUpLeft", "browOuterUpRight", "eyeWideLeft", "eyeWideRight"],
    "Angry": ["browDownLeft", "browDownRight", "mouthPressLeft", "mouthPressRight"],
    "Disgusted": ["noseSneerLeft", "noseSneerRight", "mouthUpperUpLeft", "mouthUpperUpRight"],
    "Fearful": ["browInnerUp", "eyeWideLeft", "eyeWideRight", "mouthStretchLeft", "mouthStretchRight", "mouthFunnel"],
    "Kissing": ["mouthPucker"],
    "Confused": ["browDownLeft", "browOuterUpRight", "mouthRollUpper", "mouthRollLower"],
    "Winking / Flirting": ["eyeBlinkLeft", "mouthSmileLeft", "mouthDimpleLeft"],
    "Yawning": ["eyeSquintLeft", "eyeSquintRight", "jawOpen"]
}

def format_blendshape_name(name):
    """Formats camelCase to Title Case with spaces"""
    import re
    spaced = re.sub('([A-Z])', r' \1', name)
    return spaced[:1].upper() + spaced[1:]

def process_pose(matrix):
    """Extracts yaw, pitch, roll in degrees from a 4x4 transformation matrix."""
    m00, m01, m02, m03 = matrix[0]
    m10, m11, m12, m13 = matrix[1]
    m20, m21, m22, m23 = matrix[2]

    sy = math.sqrt(m00 * m00 + m10 * m10)
    singular = sy < 1e-6

    if not singular:
        x = math.atan2(m21, m22)
        y = math.atan2(-m20, sy)
        z = math.atan2(m10, m00)
    else:
        x = math.atan2(-m12, m11)
        y = math.atan2(-m20, sy)
        z = 0

    pitch = x * 180.0 / math.pi
    yaw = y * 180.0 / math.pi
    roll = z * 180.0 / math.pi
    
    return {"pitch": round(pitch, 1), "yaw": round(yaw, 1), "roll": round(roll, 1)}

def process_blendshapes(blendshapes):
    """Classifies the overall expression and returns top blendshapes."""
    best_expr = "Neutral"
    best_score = 0.0

    blendshape_dict = {b.category_name: b.score for b in blendshapes}

    for expr, features in EXPRESSIONS.items():
        score_sum = 0.0
        valid_features = 0
        for f in features:
            if f in blendshape_dict:
                score_sum += blendshape_dict[f]
                valid_features += 1
        
        if valid_features > 0:
            avg_score = score_sum / valid_features
            if avg_score > best_score:
                best_score = avg_score
                best_expr = expr

    if best_score < 0.15:
        best_expr = "Neutral"
        best_score = 1.0 - best_score

    # Get top 10 individual trackers
    top_shapes = sorted([b for b in blendshapes if b.score > 0.05], key=lambda x: x.score, reverse=True)[:10]
    top_shapes_payload = [{"name": format_blendshape_name(b.category_name), "score": round(b.score * 100)} for b in top_shapes]

    return {
        "expression": best_expr,
        "confidence": round(best_score * 100),
        "blendshapes": top_shapes_payload
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Client connected via WebSocket.")
    try:
        while True:
            # Receive base64 encoded jpeg from client
            data = await websocket.receive_text()
            
            # The data URL is something like "data:image/jpeg;base64,...""
            if "," in data:
                img_data = data.split(",")[1]
            else:
                img_data = data

            # Decode base64 to OpenCV image
            img_bytes = base64.b64decode(img_data)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            
            # Convert BGR to RGB for MediaPipe
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
            
            # Run inference
            results = detector.detect(mp_image)
            
            response = {"status": "no_face"}

            if results.face_landmarks:
                response["status"] = "success"
                
                # We can return landmarks for visualizing, but they are heavy.
                # Just return raw 2D coords
                landmarks = [{"x": lm.x, "y": lm.y} for lm in results.face_landmarks[0]]
                response["landmarks"] = landmarks

                if results.face_blendshapes:
                    response["expression_data"] = process_blendshapes(results.face_blendshapes[0])
                
                if results.facial_transformation_matrixes:
                    response["pose_data"] = process_pose(results.facial_transformation_matrixes[0])

            await websocket.send_json(response)
            
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error during socket msg processing: {e}")
