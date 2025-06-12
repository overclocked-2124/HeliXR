import os
import threading
from flask import request, render_template, jsonify, url_for, flash, redirect
from flask_socketio import emit
from google import genai  # New SDK import
from dotenv import load_dotenv

from HeliXR import app, db, bcrypt, socketio
from HeliXR.forms import RegistrationForm, LoginForm
from HeliXR.models import User
from flask_login import login_user, current_user, logout_user

# --- SETUP ---
load_dotenv()

# Initialize the new client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# --- GLOBAL STATE ---
active_chats = {}

# --- CORE AGENT LOGIC ---
def process_audio_turn(sid, wav_data):
    """
    Processes a single user turn using the new Google Gen AI SDK.
    """
    try:
        if sid not in active_chats:
            # Create a new conversation using the new SDK
            active_chats[sid] = []
            print(f"New conversation created for {sid[:5]}.")
        
        conversation = active_chats[sid]

        # Create audio content using the new SDK
        audio_content = genai.types.Content(
            parts=[
                genai.types.Part.from_bytes(
                    data=wav_data, 
                    mime_type="audio/wav"
                )
            ]
        )
        
        # Add user message to conversation
        conversation.append(audio_content)

        print(f"Sending audio turn ({len(wav_data)} bytes) for {sid[:5]}...")
        
        # Generate response using the new SDK
        response = client.models.generate_content(
            model='gemini-1.5-pro-latest',
            contents=conversation,
            config=genai.types.GenerateContentConfig(
                response_mime_type="text/plain"
            )
        )

        if response.text:
            # Add assistant response to conversation
            assistant_content = genai.types.Content(
                parts=[genai.types.Part.from_text(response.text)]
            )
            conversation.append(assistant_content)
            
            # Emit the text response
            socketio.emit("agent_response_text", {
                "text": response.text, 
                "is_partial": False
            }, room=sid)
            
            # Generate audio response
            synthesize_and_send_audio(sid, response.text)

    except Exception as e:
        print(f"Error in Gemini chat for {sid[:5]}: {e}")
        socketio.emit("error", {"data": f"Audio processing error: {e}"}, room=sid)
    finally:
        print(f"Finished processing audio turn for {sid[:5]}.")

def synthesize_and_send_audio(sid, text_to_speak):
    """
    Uses Google Cloud TTS to convert text to speech and sends it to the client.
    """
    try:
        from google.cloud import texttospeech
        
        print(f"Synthesizing audio for {sid[:5]}: '{text_to_speak[:50]}...'")
        tts_client = texttospeech.TextToSpeechClient()
        synthesis_input = texttospeech.SynthesisInput(text=text_to_speak)
        
        voice = texttospeech.VoiceSelectionParams(
            language_code="en-US", 
            name="en-US-Standard-C"
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3
        )

        tts_response = tts_client.synthesize_speech(
            input=synthesis_input, 
            voice=voice, 
            audio_config=audio_config
        )

        socketio.emit("agent_response_audio", tts_response.audio_content, room=sid)
        print(f"Sent synthesized audio ({len(tts_response.audio_content)} bytes) to {sid[:5]}.")

    except ImportError:
        print("\n!!! TTS library not installed. Please run: pip install google-cloud-texttospeech\n")
        socketio.emit("error", {"data": "TTS service is not installed on the server."}, room=sid)
    except Exception as e:
        print(f"Error in TTS synthesis for {sid[:5]}: {e}")
        socketio.emit("error", {"data": f"Could not synthesize audio: {e}"}, room=sid)

# --- SOCKET.IO EVENTS ---
@socketio.on("connect")
def handle_connect():
    print(f"Client connected: {request.sid}")

@socketio.on("disconnect")
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")
    active_chats.pop(request.sid, None)

@socketio.on("start_agent")
def handle_start_agent():
    emit('agent_started', {'data': 'Audio chat agent ready.'})

@socketio.on("stop_agent")
def handle_stop_agent():
    active_chats.pop(request.sid, None)
    print(f"Agent stopped and chat cleared for {request.sid[:5]}.")
    emit('agent_stopped', {'data': 'Voice agent disconnected.'})

@socketio.on("process_user_turn")
def handle_user_turn(wav_data):
    sid = request.sid
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
        response = client.models.generate_content(
            model='gemini-2.0-flash-exp',
            contents=prompt
        )
        return jsonify({'reply': response.text})
    except Exception as e:
        print(f"Gemini API Error: {e}")
        return jsonify({'error': 'Failed to get response from AI'}), 500
