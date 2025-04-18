import streamlit as st
import pandas as pd
import joblib  # For loading ML model
from gtts import gTTS
import os
import tempfile
import torch
from faster_whisper import WhisperModel
from streamlit_webrtc import webrtc_streamer, AudioProcessorBase
import av
import queue
import numpy as np


# Load Machine Data from CSV
def load_machine_data(csv_file):
    try:
        return pd.read_csv(csv_file)
    except Exception as e:
        return None

data_file = "../ML/dummy_valve_data.csv"  # Updated for new model
data = load_machine_data(data_file)

# Load ML Model for Valve Control
ml_model = joblib.load("../ML/valve_model.pkl")  # Updated model file

def check_machine_fault(features):
    prediction = ml_model.predict([features])
    return int(prediction[0])  # 0 = Close Valve, 1 = Open Valve

# Speech-to-Text using faster-whisper (local model)
class AudioProcessor(AudioProcessorBase):
    def __init__(self):
        self.q = queue.Queue()

    def recv(self, frame: av.AudioFrame) -> av.AudioFrame:
        audio = frame.to_ndarray().flatten().astype(np.float32) / 32768.0
        self.q.put(audio)
        return frame

def recognize_speech_live():
    st.write("🎙️ Speak now...")
    ctx = webrtc_streamer(
        key="stt",
        mode="sendonly",
        audio_processor_factory=AudioProcessor,
        media_stream_constraints={"audio": True, "video": False}
    )

    if ctx.audio_processor:
        audio_chunks = []
        try:
            while True:
                chunk = ctx.audio_processor.q.get(timeout=5)
                audio_chunks.append(chunk)
        except queue.Empty:
            pass

        if audio_chunks:
            full_audio = np.concatenate(audio_chunks)
            # Save temp WAV file
            from scipy.io.wavfile import write
            import tempfile
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
                write(f.name, 16000, full_audio)
                tmp_path = f.name

            # Run Whisper
            model_size = "base"
            model = WhisperModel(model_size, device="cuda" if torch.cuda.is_available() else "cpu", compute_type="int8")
            segments, _ = model.transcribe(tmp_path, beam_size=5)
            full_text = " ".join([segment.text for segment in segments])
            return full_text
    return ""


# AI Response using Ollama
import requests

def get_ai_response(query):
    try:
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={"model": "llama3", "prompt": query},
            stream=False
        )
        if response.status_code == 200:
            return response.json().get("response", "No response.")
        else:
            return "Ollama request failed."
    except Exception as e:
        return f"Ollama error: {e}"

# Text-to-Speech using gTTS
def speak(text):
    try:
        tts = gTTS(text)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
            tts.save(tmp.name)
            st.audio(tmp.name)
    except Exception as e:
        st.write("Error in TTS: ", e)

# Process User Query with Specific Commands
def process_query(query):
    query = query.lower()

    if "status report" in query:
        return "System is online. Monitoring machines."
    elif "latest data" in query:
        if data is not None:
            return data.iloc[-1].to_string()
    elif "check valve" in query:
        if data is not None:
            latest = data.iloc[-1]
            features = latest[['pH', 'Temperature', 'Red', 'Green', 'Blue', 'Liquid_Level',
                               'Max_Level', 'is_neutral_ph', 'is_optimal_temp',
                               'color_intensity', 'level_ratio']].tolist()
            valve_status = check_machine_fault(features)
            return "Valve should remain OPEN." if valve_status == 1 else "Valve should be CLOSED to maintain quality."

    if data is not None:
        for column in data.columns:
            if column.lower() in query:
                return f"The latest {column} is {data[column].iloc[-1]}"

    return get_ai_response(query)

# Streamlit UI
st.title("AI Voice Assistant for Machine Monitoring")

if st.button("Start Listening"):
    user_query = recognize_speech_live()

    if user_query:
        st.write(f"You said: {user_query}")
        response = process_query(user_query)
        st.write(f"Response: {response}")
        speak(response)
    else:
        st.write("Please upload an audio file.")
