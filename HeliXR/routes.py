import os, threading
from flask import request, render_template, jsonify, url_for, flash, redirect
from flask_socketio import emit
from HeliXR import app, db, bcrypt, socketio
from HeliXR.forms import RegistrationForm, LoginForm
from HeliXR.models import User
from flask_login import login_user, current_user, logout_user
from dotenv import load_dotenv
import google.generativeai as genai
import traceback

from elevenlabs.client import ElevenLabs
from elevenlabs.conversational_ai.conversation import Conversation

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# ---------- GLOBAL STATE ----------
active_agents = {}

# ---------- FINAL, CORRECTED DUMMY AUDIO INTERFACE ----------
class HeadlessAudioInterface:
    """A fully-featured dummy interface that handles input and output correctly."""
    def __init__(self):
        self.input_callback = None
        # THE FIX: The output must be a callable that accepts any arguments and does nothing.
        self.output = lambda *args, **kwargs: None

    def start(self, input_callback):
        self.input_callback = input_callback

    def stop(self):
        self.input_callback = None

    def push_audio(self, audio_chunk: bytes):
        if self.input_callback:
            self.input_callback(audio_chunk)

# ---------- ELEVENLABS THREAD ----------
def run_elevenlabs_agent(sid):
    try:
        def on_agent_response(resp_iterator):
            for resp in resp_iterator:
                if resp.type == 'TEXT':
                    socketio.emit('agent_text_chunk', {'data': resp.text}, room=sid)
                elif resp.type == 'AUDIO':
                    socketio.emit('agent_audio_chunk', resp.audio, room=sid)
        
        def on_user_transcript(txt):
            socketio.emit('user_transcript', {'data': txt}, room=sid)

        client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))
        headless_interface = HeadlessAudioInterface()

        conv = Conversation(
            client=client,
            agent_id=os.getenv("AGENT_ID"),
            requires_auth=(os.getenv("ELEVENLABS_API_KEY") is not None),
            audio_interface=headless_interface,
            callback_agent_response=on_agent_response,
            callback_user_transcript=on_user_transcript
        )
        
        active_agents[sid] = {'conversation': conv, 'interface': headless_interface}
        socketio.emit('agent_started', {'data': 'Voice agent session started.'}, room=sid)
        
        conv.start_session()
        conv.wait_for_session_end()
        print(f"Conversation ended for {sid[:5]}")
    except Exception as e:
        print(f"Error in agent thread for {sid[:5]}:")
        traceback.print_exc()
        socketio.emit('error', {'data': str(e)}, room=sid)
    finally:
        active_agents.pop(sid, None)
        socketio.emit('agent_stopped', {'data': 'Session has ended.'}, room=sid)

# ---------- SOCKET.IO EVENTS ----------
@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    print(f'Client disconnected: {sid}')
    agent_data = active_agents.get(sid)
    if agent_data and agent_data.get('conversation'):
        agent_data['conversation'].end_session()

@socketio.on('start_agent')
def handle_start_agent():
    sid = request.sid
    if sid in active_agents:
        emit('error', {'data': 'Agent already running.'})
        return
    print(f"Launching voice agent for {sid[:5]} …")
    t = threading.Thread(target=run_elevenlabs_agent, args=(sid,))
    t.start()

@socketio.on('stop_agent')
def handle_stop_agent():
    sid = request.sid
    agent_data = active_agents.get(sid)
    if agent_data and agent_data.get('conversation'):
        agent_data['conversation'].end_session()
    else:
        emit('error', {'data': 'No active agent to stop.'})

@socketio.on('audio_in')
def handle_audio_in(data):
    sid = request.sid
    agent_data = active_agents.get(sid)
    
    if not agent_data or not agent_data.get('interface'):
        emit('error', {'data': 'Voice agent or interface not initialised.'}, room=sid)
        return
    try:
        agent_data['interface'].push_audio(data)
    except Exception as e:
        print(f"Audio routing error for {sid[:5]}: {e}")
        emit('error', {'data': f'Audio send failed: {e}'}, room=sid)

# ---------- REMAINDER OF FILE: existing Flask routes ----------
# (Unchanged)
@app.route('/')
def home():
    return render_template('index.html',title="HELIXR",css_path="index")

@app.route('/register', methods=['GET','POST'])
def register():
    form = RegistrationForm()
    if form.validate_on_submit():
        hashed_password = bcrypt.generate_password_hash(form.password.data).decode('utf-8')
        user = User(username=form.username.data,email=form.email.data,password=hashed_password)
        db.session.add(user)
        db.session.commit()
        flash('Your account has been created! You are now able to log in','success')
        return redirect(url_for('login'))
    return render_template('register.html',title="HELIXR-Register",css_path="register",form = form)

@app.route('/login', methods=['GET', 'POST'])
def login():
    form = LoginForm()
    if request.method == 'POST':
        if form.validate_on_submit():
            user = User.query.filter_by(email=form.email.data).first()
            if user and bcrypt.check_password_hash(user.password, form.password.data):
                login_user(user,remember=form.remember.data)
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
    return render_template('dashboard_analytics.html',title="HELIXR Analytics",css_path="dashboard_analytics")

@app.route('/dashboard_ai_agent')
def dashboard_ai_agent():
    return render_template('dashboard_ai_agent.html',title="HELIXR Analytics",css_path="dashboard_ai_agent")

@app.route('/dashboard_command')
def dashboard_command():
    return render_template('dashboard_command.html',title="HELIXR Analytics",css_path="dashboard_command")

@app.route('/dashboard_visual')
def dashboard_visual():
    return render_template('dashboard_visual.html',title="HELIXR Analytics",css_path="dashboard_visual")

@app.route('/chat/gemini', methods=['POST'])
def gemini_chat():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401

    prompt = request.json.get('prompt')
    if not prompt:
        return jsonify({'error': 'No prompt provided'}), 400

    try:
        model = genai.GenerativeModel('gemini-2.5-flash-preview-05-20')
        response = model.generate_content(prompt)
        return jsonify({'reply': response.text})
    except Exception as e:
        print(f"Gemini API Error: {e}")
        return jsonify({'error': 'Failed to get response from AI'}), 500