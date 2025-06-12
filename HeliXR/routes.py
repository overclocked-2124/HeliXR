import os
import threading
import time
import random
from functools import wraps
from flask import request, render_template, jsonify, url_for, flash, redirect
from flask_socketio import emit
from google import genai  # NEW SDK
from google.genai import types  # NEW SDK types
from dotenv import load_dotenv

from HeliXR import app, db, bcrypt, socketio
from HeliXR.forms import RegistrationForm, LoginForm
from HeliXR.models import User
from flask_login import login_user, current_user, logout_user

# --- SETUP ---
load_dotenv()

# Initialize NEW SDK client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# --- GLOBAL STATE ---
active_conversations = {}

# --- ERROR HANDLING ---
def retry_with_backoff(max_retries=3, base_delay=2):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    error_str = str(e)
                    if any(code in error_str for code in ["500", "503", "429", "INTERNAL", "UNAVAILABLE", "RESOURCE_EXHAUSTED"]):
                        if attempt < max_retries - 1:
                            delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
                            print(f"API error on attempt {attempt + 1}, retrying in {delay:.2f}s")
                            time.sleep(delay)
                            continue
                    raise e
            return None
        return wrapper
    return decorator

# --- CORE AGENT LOGIC ---
@retry_with_backoff(max_retries=3, base_delay=2)
def process_audio_turn(sid, wav_data):
    """
    Process audio using NEW Google Gen AI SDK with proper role management
    """
    try:
        # Validate audio data size
        if len(wav_data) > 8 * 1024 * 1024:
            socketio.emit("error", {"data": "Audio file too large. Please speak for shorter periods."}, room=sid)
            return

        # Get or create conversation history with proper role alternation
        if sid not in active_conversations:
            active_conversations[sid] = []
            print(f"New conversation created for {sid[:5]}.")
        
        conversation = active_conversations[sid]

        # Create user audio content with explicit role
        user_content = types.Content(
            role="user",  # Explicitly set role
            parts=[
                types.Part.from_bytes(
                    data=wav_data, 
                    mime_type="audio/wav"
                )
            ]
        )
        
        # Add user message to conversation
        conversation.append(user_content)

        print(f"Sending audio turn ({len(wav_data)} bytes) to Gemini 2.5 Flash for {sid[:5]}...")
        
        # Generate response using NEW SDK
        response = client.models.generate_content(
            model='gemini-2.5-flash-preview-05-20',
            contents=conversation,
            config=types.GenerateContentConfig(
                max_output_tokens=2000,
                temperature=0.7,
                top_p=0.9,
                response_mime_type="text/plain"
            )
        )

        if response.text:
            # Create assistant response with explicit role
            assistant_content = types.Content(
                role="model",  # Explicitly set role
                parts=[types.Part.from_text(response.text)]
            )
            
            # Add assistant response to conversation
            conversation.append(assistant_content)
            
            # Emit the text response
            socketio.emit("agent_response_text", {
                "text": response.text, 
                "is_partial": False
            }, room=sid)
            
            # Generate audio response
            synthesize_and_send_audio(sid, response.text)
        else:
            socketio.emit("error", {"data": "No response generated. Please try again."}, room=sid)

    except Exception as e:
        error_msg = str(e)
        print(f"Error in Gemini 2.5 Flash processing for {sid[:5]}: {error_msg}")
        
        # Clear conversation if role error occurs
        if "role" in error_msg.lower() or "invalid_argument" in error_msg.lower():
            active_conversations[sid] = []
            socketio.emit("error", {"data": "Conversation reset due to role error. Please try again."}, room=sid)
        elif "500" in error_msg or "INTERNAL" in error_msg:
            socketio.emit("error", {"data": "Server temporarily overloaded. Please try again."}, room=sid)
        elif "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
            socketio.emit("error", {"data": "Rate limit exceeded. Please wait before sending another message."}, room=sid)
        elif "403" in error_msg:
            socketio.emit("error", {"data": "API key issue. Please check your configuration."}, room=sid)
        else:
            socketio.emit("error", {"data": f"Audio processing error: {error_msg}"}, room=sid)

@retry_with_backoff(max_retries=2, base_delay=1)
def synthesize_and_send_audio(sid, text_to_speak):
    """
    TTS with error handling
    """
    try:
        from google.cloud import texttospeech
        
        # Limit text length
        if len(text_to_speak) > 1200:
            text_to_speak = text_to_speak[:1200] + "..."
        
        print(f"Synthesizing audio for {sid[:5]}: '{text_to_speak[:50]}...'")
        tts_client = texttospeech.TextToSpeechClient()
        synthesis_input = texttospeech.SynthesisInput(text=text_to_speak)
        
        voice = texttospeech.VoiceSelectionParams(
            language_code="en-US", 
            name="en-US-Neural2-C"
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=1.0
        )

        tts_response = tts_client.synthesize_speech(
            input=synthesis_input, 
            voice=voice, 
            audio_config=audio_config
        )

        socketio.emit("agent_response_audio", tts_response.audio_content, room=sid)
        print(f"Sent synthesized audio ({len(tts_response.audio_content)} bytes) to {sid[:5]}.")

    except ImportError:
        print("TTS library not installed.")
        socketio.emit("error", {"data": "Text-to-speech not available."}, room=sid)
    except Exception as e:
        print(f"TTS Error for {sid[:5]}: {e}")

# --- SOCKET.IO EVENTS ---
@socketio.on("connect")
def handle_connect():
    print(f"Client connected: {request.sid}")

@socketio.on("disconnect")
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")
    active_conversations.pop(request.sid, None)

@socketio.on("start_agent")
def handle_start_agent():
    # Clear any existing conversation to avoid role issues
    active_conversations[request.sid] = []
    emit('agent_started', {'data': 'Gemini 2.5 Flash audio agent ready with NEW SDK.'})

@socketio.on("stop_agent")
def handle_stop_agent():
    active_conversations.pop(request.sid, None)
    print(f"Agent stopped and conversation cleared for {request.sid[:5]}.")
    emit('agent_stopped', {'data': 'Gemini 2.5 Flash voice agent disconnected.'})

@socketio.on("process_user_turn")
def handle_user_turn(wav_data):
    sid = request.sid
    if not wav_data or len(wav_data) == 0:
        socketio.emit("error", {"data": "No audio data received."}, room=sid)
        return
    
    threading.Thread(target=process_audio_turn, args=(sid, wav_data)).start()

# --- FLASK ROUTES ---
@app.route('/')
def home():
    return render_template('index.html', title="HELIXR", css_path="index")

@app.route('/register', methods=['GET','POST'])
def register():
    form = RegistrationForm()
    if form.validate_on_submit():
        hashed_password = bcrypt.generate_password_hash(form.password.data).decode('utf-8')
        user = User(username=form.username.data, email=form.email.data, password=hashed_password)
        db.session.add(user)
        db.session.commit()
        flash('Your account has been created! You are now able to log in', 'success')
        return redirect(url_for('login'))
    return render_template('register.html', title="HELIXR-Register", css_path="register", form=form)

@app.route('/login', methods=['GET', 'POST'])
def login():
    form = LoginForm()
    if request.method == 'POST':
        if form.validate_on_submit():
            user = User.query.filter_by(email=form.email.data).first()
            if user and bcrypt.check_password_hash(user.password, form.password.data):
                login_user(user, remember=form.remember.data)
                return redirect(url_for('dashboard_analytics'))
            else:
                flash('Login Unsuccessful. Please check email and password', 'danger')
    return render_template('login.html', title="HELIXR-Login", css_path="login", form=form)

@app.route('/logout')
def logout():
    logout_user()
    return redirect(url_for('home'))

@app.route('/dashboard_analytics')
def dashboard_analytics():
    return render_template('dashboard_analytics.html', title="HELIXR Analytics", css_path="dashboard_analytics")

@app.route('/dashboard_ai_agent')
def dashboard_ai_agent():
    return render_template('dashboard_ai_agent.html', title="HELIXR AI Agent", css_path="dashboard_ai_agent")

@app.route('/dashboard_command')
def dashboard_command():
    return render_template('dashboard_command.html', title="HELIXR Command", css_path="dashboard_command")

@app.route('/dashboard_visual')
def dashboard_visual():
    return render_template('dashboard_visual.html', title="HELIXR Visual", css_path="dashboard_visual")

@app.route('/chat/gemini', methods=['POST'])
def gemini_chat():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    
    prompt = request.json.get('prompt')
    if not prompt:
        return jsonify({'error': 'No prompt provided'}), 400
    
    try:
        # Use NEW SDK for text chat
        response = client.models.generate_content(
            model='gemini-2.5-flash-preview-05-20',
            contents=prompt,
            config=types.GenerateContentConfig(
                max_output_tokens=2000,
                temperature=0.7
            )
        )
        return jsonify({'reply': response.text})
    except Exception as e:
        print(f"Gemini 2.5 Flash API Error: {e}")
        return jsonify({'error': 'Failed to get response from Gemini 2.5 Flash'}), 500
