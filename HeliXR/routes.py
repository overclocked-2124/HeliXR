import os
import threading
from flask import request, render_template, url_for, flash, redirect, jsonify
from flask_socketio import emit
from HeliXR import app, db, bcrypt, socketio
from HeliXR.forms import RegistrationForm, LoginForm
from HeliXR.models import User
from flask_login import login_user, current_user, logout_user
from dotenv import load_dotenv
import google.generativeai as genai
from elevenlabs.client import ElevenLabs
from elevenlabs.conversational_ai.conversation import Conversation
from elevenlabs.conversational_ai.default_audio_interface import DefaultAudioInterface

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

active_agents = {}

class SafeAudioInterface(DefaultAudioInterface):
    """Custom audio interface to prevent crashes on stop."""
    def stop(self):
        try:
            super().stop()
        except OSError as e:
            print(f"Warning: Audio stop failed due to: {e}")

def run_elevenlabs_agent(sid):
    """
    The target function for the voice agent thread.
    Communicates with the client via Socket.IO.
    """
    try:
        def on_agent_response(response):
            socketio.emit('agent_response', {'data': response}, room=sid)
            print(f"Agent (to {sid[:5]}): {response}")

        def on_user_transcript(transcript):
            socketio.emit('user_transcript', {'data': transcript}, room=sid)
            print(f"User (from {sid[:5]}): {transcript}")

        client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))
        conversation = Conversation(
            client,
            os.getenv("AGENT_ID"),
            requires_auth=bool(os.getenv("ELEVENLABS_API_KEY")),
            audio_interface=SafeAudioInterface(),
            callback_agent_response=on_agent_response,
            callback_user_transcript=on_user_transcript,
        )

        active_agents[sid]['conversation'] = conversation
        conversation.start_session()
        # The loop below will run until the session ends
        conversation.wait_for_session_end()
        print(f"Conversation for SID {sid[:5]} ended.")

    except Exception as e:
        print(f"Error in ElevenLabs agent for SID {sid[:5]}: {e}")
    finally:
        if sid in active_agents:
            del active_agents[sid]
        socketio.emit('agent_stopped', {'data': 'Session has ended.'}, room=sid)


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

@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    print(f'Client disconnected: {request.sid}')
    if request.sid in active_agents:
        if active_agents[request.sid].get('conversation'):
            active_agents[request.sid]['conversation'].end_session()
        print(f"Cleaned up agent for SID: {request.sid[:5]}")

@socketio.on('start_agent')
def handle_start_agent():
    sid = request.sid
    if sid not in active_agents:
        print(f"Starting voice agent for SID: {sid[:5]}...")
        agent_thread = threading.Thread(target=run_elevenlabs_agent, args=(sid,))
        active_agents[sid] = {'thread': agent_thread}
        agent_thread.start()
        emit('agent_started', {'data': 'Voice agent session started.'})
    else:
        print(f"Agent already running for SID: {sid[:5]}")
        emit('error', {'data': 'Agent already running.'})


@socketio.on('stop_agent')
def handle_stop_agent():
    sid = request.sid
    if sid in active_agents and active_agents[sid].get('conversation'):
        print(f"Stopping voice agent for SID: {sid[:5]}...")
        active_agents[sid]['conversation'].end_session()
    else:
        print(f"No active agent to stop for SID: {sid[:5]}")
        emit('error', {'data': 'No active agent to stop.'})