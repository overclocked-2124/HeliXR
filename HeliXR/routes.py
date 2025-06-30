# routes.py

import os
import threading
import time
import random
import re
import traceback  # Add to top of file
from pymongo import errors as mongo_errors
from functools import wraps
from flask import request, render_template, jsonify, url_for, flash, redirect, current_app,session
from flask_socketio import emit
from google import genai  # NEW SDK # NEW SDK types
from dotenv import load_dotenv
from pymongo import MongoClient
from bson.json_util import dumps
from datetime import datetime
import uuid
from HeliXR import app, db, bcrypt, socketio
from HeliXR.forms import RegistrationForm, LoginForm
from HeliXR.models import User
from pymongo import MongoClient
from flask_login import login_user, current_user, logout_user

# --- NEW IMPORTS FOR CHATTERBOX TTS ---
import torch
import torchaudio as ta
from chatterbox.tts import ChatterboxTTS

# --- SETUP ---
load_dotenv()


def init_mongo():
    try:
        # Get connection string from environment or config
        mongo_uri = app.config.get('MONGO_URI', 'mongodb://localhost:27017/')
        
        # Connect to MongoDB
        client = MongoClient(mongo_uri)
        
        # Get database and collection
        app.mongo_db = client[app.config['MONGO_DB_NAME']]
        app.mongo_collection = app.mongo_db[app.config['MONGO_COLLECTION_NAME']]

        
    except Exception as e:
        app.logger.error(f"MongoDB initialization failed: {str(e)}")
        return None

# Use this in your routes
sensor_collection = init_mongo() 


@socketio.on("connect")

def on_connect():
    app.logger.info("Client connected:")

@socketio.on('disconnect')

def on_disconnect():
    app.logger.info('Client disconnected')

# --- VALVE CONTROL FUNCTIONS ---
def detect_valve_command(prompt: str) -> dict:
    """Detects valve control commands in user prompts"""
    prompt_lower = prompt.lower()
    number_map = {
        'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
        '1': 1, '2': 2, '3': 3, '4': 4, '5': 5
    }
    
    # Patterns to detect valve commands
    patterns = [
        (r'(open|start|activate).*?valve\s*(\d+|one|two|three|four|five)', 'open'),
        (r'(close|stop|shut\s*down|deactivate).*?valve\s*(\d+|one|two|three|four|five)', 'close'),
        (r'valve\s*(\d+|one|two|three|four|five).*?(open|start|activate)', 'open'),
        (r'valve\s*(\d+|one|two|three|four|five).*?(close|stop|shut\s*down|deactivate)', 'close')
    ]
    
    for pattern, action in patterns:
        match = re.search(pattern, prompt_lower)
        if match:
            valve_id = match.group(2) if action in ['open', 'close'] else match.group(1)
            valve_num = number_map.get(valve_id.lower())
            if valve_num and 1 <= valve_num <= 5:
                return {
                    'action': action,
                    'valve_number': valve_num,
                    'value': 0 if action == 'open' else 180                  
                }
            else:
                app.logger.warning(f"Invalid valve number detected: {valve_id} in prompt: {prompt}")
    # If no command detected, return None
            app.logger.info(f"Detected valve command: {action} valve {valve_num}")
    return None

def update_valve_state(valve_number: int, action: str, value: int):
    """Updates valve state in MongoDB"""
    try:
        # Get the latest document
        latest_doc = app.mongo_collection.find_one(sort=[("timestamp", -1)])
        
        if not latest_doc:
            app.logger.error("No documents found in collection")
            return False, "No recent data document found"
        
        
        # Create update path
        update_path = f"actuator_data.servo_rotations_deg.servo_{valve_number}"
        
        # Perform atomic update
        result = app.mongo_collection.update_one(
            {"_id": latest_doc["_id"]},
            {"$set": {update_path: value}}
        )
        
        app.logger.info(f"Valve update: valve={valve_number}, action={action}, "
                        f"matched={result.matched_count}, modified={result.modified_count}")
        
        if result.modified_count == 1:
            return True, f"Valve {valve_number} {action}ed successfully"
        
        return False, f"Update failed (modified_count: {result.modified_count})"
    
    except Exception as e:
        error_msg = f"Valve update error: {str(e)}"
        app.logger.error(error_msg)
        app.logger.error(traceback.format_exc())
        return False, error_msg

# Folder for temporary user voice uploads
TEMP_FOLDER = 'temp_audio'
if not os.path.exists(TEMP_FOLDER):
    os.makedirs(TEMP_FOLDER)
app.config['TEMP_FOLDER'] = TEMP_FOLDER

# Folder for generated AI audio responses, accessible by the browser.
AUDIO_FOLDER = os.path.join(app.root_path, 'static', 'audio_responses')
if not os.path.exists(AUDIO_FOLDER):
    os.makedirs(AUDIO_FOLDER)

SYSTEM_PROMPT = """
## System Prompt for HeliXR: Polite AI Interaction Model for AR/VR Digital Twin in Food Manufacturing

You are HeliXR, an advanced, polite, and professional AI assistant developed by Alpha Q. You are responsible for interacting with users through both text and voice on an AR/VR digital twin platform tailored for the food manufacturing industry. Your primary roles include:

- Guiding users in monitoring real-time data from all parts of the supply chain.
- Assisting users in manually operating, opening, or closing valves via touch or voice commands.
- Providing real-time visual feedback on the operational status of valves and other equipment.
- Detecting, highlighting, and explaining areas where problems or anomalies have been detected based on data analysis.
- Serving as a dedicated voice agent, enabling users to control and monitor all aspects of the system using natural, conversational speech.

**Behavioral Guidelines:**
- Always maintain a polite, respectful, and supportive tone, addressing users courteously and thanking them for their input or patience when appropriate.
- Respond to queries clearly and concisely, offering step-by-step guidance or detailed explanations as needed, while avoiding unnecessary jargon unless requested by the user.
- When a user's input is unclear or ambiguous, politely ask clarifying questions to ensure you fully understand their request before proceeding.
- Adapt your responses to match the user's technical expertise: use simple explanations for non-experts and more technical language for advanced users, while always remaining approachable and encouraging.
- Confirm user commands before executing critical actions (such as shutting off valves), and provide clear feedback on the result of each action.
- Never share or request sensitive information, passwords, or confidential data.
- If you are unable to fulfill a request, explain the reason politely and, if possible, suggest alternative actions or direct the user to appropriate support resources.

**Output and Interaction Format:**
- Use a conversational, friendly style that fosters trust and engagement, while remaining efficient and to the point.
- For voice interactions, speak naturally, clearly, and with empathy, ensuring users feel heard and understood.
- For visual or AR/VR feedback, describe what is being shown and offer to walk the user through any process or troubleshooting step by step.
- Always close interactions with a polite acknowledgment, such as "Thank you for your request," or "Is there anything else I can assist you with today?"
- Be less verbose and precise at any cost.
"""

# --- GEMINI CLIENT INITIALIZATION (for text chat) ---

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
chat = client.chats.create(model="gemini-2.5-flash")
response = chat.send_message(SYSTEM_PROMPT)

# --- CHATTERBOX TTS MODEL INITIALIZATION ---
# Load the model only once when the app starts for efficiency.
tts_model = None
try:
    # Auto-detect CUDA GPU, otherwise use CPU
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"--- Chatterbox TTS: Attempting to load model on device: '{device}' ---")
    tts_model = ChatterboxTTS.from_pretrained(device=device)
    print("--- Chatterbox TTS model loaded successfully. ---")
except Exception as e:
    print(f"--- FATAL ERROR: Could not load Chatterbox TTS model: {e} ---")
    print("--- The application will run in text-only mode. ---")


# --- FLASK ROUTES ---

@app.route('/')
def home():
    return render_template('index.html', title="HELIXR", css_path="index")

@app.route('/register', methods=['GET','POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard_analytics'))
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
    if current_user.is_authenticated:
        return redirect(url_for('dashboard_analytics'))
    form = LoginForm()
    if request.method == 'POST':
        if form.validate_on_submit():
            user = User.query.filter_by(email=form.email.data).first()
            if user and bcrypt.check_password_hash(user.password, form.password.data):
                login_user(user, remember=form.remember.data)
                session['chat_history'] = []
                return redirect(url_for('dashboard_analytics'))
            else:
                flash('Login Unsuccessful. Please check email and password', 'danger')
    return render_template('login.html', title="HELIXR-Login", css_path="login", form=form)

@app.route('/logout')
def logout():
    session.pop('chat_history', None)
    logout_user()
    return redirect(url_for('home'))

@app.route('/dashboard_analytics')
def dashboard_analytics():
    return render_template('dashboard_analytics.html', title="HELIXR Analytics", css_path="dashboard_analytics")

@app.route("/api/sensor-data")
def latest_sensor_data():
    # Check MongoDB connection status with detailed logging
    if not hasattr(current_app, 'mongo_collection'):
        current_app.logger.error("❌ MongoDB collection not initialized in app context")
        return jsonify({"error": "Database not initialized"}), 500
        
    if current_app.mongo_collection is None:
        current_app.logger.error("❌ MongoDB collection is None")
        return jsonify({"error": "Database not available"}), 500
        
    try:
        current_app.logger.info("⌛ Attempting to query MongoDB...")
        
        # Test if collection is accessible
        collection_name = current_app.mongo_collection.name
        db_name = current_app.mongo_collection.database.name
        current_app.logger.info(f"📁 Using database: {db_name}, collection: {collection_name}")
        
        # Find the latest document
        latest = current_app.mongo_collection.find_one(sort=[("timestamp", -1)])
        
        if latest:
            current_app.logger.info(f"✅ Found document with ID: {latest.get('_id')}")
            sauce_data = latest.get("sauce_sensor_data", {})
            env_data = latest.get("environment_data", {}) 
            actuator_data = latest.get("actuator_data", {}).get("servo_rotations_deg", {})

            return jsonify({
                "temperature": sauce_data.get("temperature_c", 0),
                "humidity": sauce_data.get("humidity_pct", 0),
                "pH": sauce_data.get("pH", 0),
                "color_rgb": sauce_data.get("color_rgb", [0,0,0]),

                "env_temp": env_data.get("temperature_c", 0),
                "env_humidity": env_data.get("humidity_pct", 0),

                "valve_status": {
                "valve_1": actuator_data.get("servo_1", 0),
                "valve_2": actuator_data.get("servo_2", 0),
                "valve_3": actuator_data.get("servo_3", 0),
                "valve_4": actuator_data.get("servo_4", 0),
                "valve_5": actuator_data.get("servo_5", 0)
            }
            })
        else:
            current_app.logger.warning("⚠️ No documents found in collection")
            return jsonify({"error": "No data found"}), 404
            
    except mongo_errors.ServerSelectionTimeoutError as e:
        current_app.logger.error(f"⌛❌ MongoDB timeout: {str(e)}")
        return jsonify({"error": "Database timeout"}), 500
    except mongo_errors.OperationFailure as e:
        current_app.logger.error(f"🔒❌ MongoDB auth failure: {str(e)}")
        return jsonify({"error": "Authentication failed"}), 500
    except Exception as e:
        current_app.logger.error(f"❌ Unexpected error: {str(e)}")
        current_app.logger.error(traceback.format_exc())  # Full traceback
        return jsonify({"error": "Database query failed"}), 500

@app.route('/dashboard_ai_agent')
def dashboard_ai_agent():
    session['chat_history'] = []
    session.modified = True
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

    # Check for valve command first
    valve_cmd = detect_valve_command(prompt)
    if valve_cmd:
        app.logger.info(f"Valve command detected: {valve_cmd}")
        
        # Update valve state in MongoDB
        success, message = update_valve_state(
            valve_cmd['valve_number'],
            valve_cmd['action'],
            valve_cmd['value']
        )
        
        # Prepare response
        if success:
            reply = message
        else:
            reply = f" {message}"
        
        # Generate TTS audio if model is available
        audio_url = None
        if tts_model:
            try:
                wav_tensor = tts_model.generate(reply)
                audio_filename = f"response_{uuid.uuid4().hex}.wav"
                audio_filepath = os.path.join(AUDIO_FOLDER, audio_filename)
                ta.save(audio_filepath, wav_tensor, tts_model.sr)
                audio_url = url_for('static', filename=f'audio_responses/{audio_filename}')
            except Exception as tts_error:
                app.logger.error(f"TTS failed: {str(tts_error)}")
        
        return jsonify({
            'reply': reply,
            'audio_url': audio_url,
            'command_executed': True
        })
    
    # --- ORIGINAL GEMINI PROCESSING ---
    try:
        text_response = chat.send_message(prompt)
        text_reply = text_response.text

        # Generate TTS audio if model is available
        audio_url = None
        if tts_model:
            try:
                wav_tensor = tts_model.generate(text_reply)
                audio_filename = f"response_{uuid.uuid4().hex}.wav"
                audio_filepath = os.path.join(AUDIO_FOLDER, audio_filename)
                ta.save(audio_filepath, wav_tensor, tts_model.sr)
                audio_url = url_for('static', filename=f'audio_responses/{audio_filename}')
            except Exception as tts_error:
                app.logger.error(f"TTS failed: {str(tts_error)}")
        
        return jsonify({
            'reply': text_reply,
            'audio_url': audio_url
        })

    except Exception as e:
        app.logger.error(f"Gemini chat error: {str(e)}")
        return jsonify({'reply': f"An error occurred: {str(e)}"}), 500


@app.route('/chat/voice_upload', methods=['POST'])
def handle_voice_upload():
    """Receives an audio file, saves it, transcribes it, and returns the text."""
    if 'audio_file' not in request.files:
        return jsonify({"error": "No audio file part in the request"}), 400

    file = request.files['audio_file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file:
        filename = f"recording_{uuid.uuid4().hex}.mp3"
        filepath = os.path.join(app.config['TEMP_FOLDER'], filename)
        
        try:
            file.save(filepath)
            
            # Upload file
            myfile = client.files.upload(file=filepath)
            
            # Wait for file to become ACTIVE - FIX HERE
            while myfile.state.name == "PROCESSING":
                print(f"File {myfile.name} is still processing... waiting")
                time.sleep(2)
                myfile = client.files.get(name=myfile.name)  # Use name= parameter
            
            # Check if file is ready
            if myfile.state.name != "ACTIVE":
                raise Exception(f"File failed to process. State: {myfile.state.name}")
            
            print(f"File {myfile.name} is now ACTIVE and ready for use")
            
            # Now transcribe
            prompt = 'Transcribe the following audio.'
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[prompt, myfile]
            )
            # Cleanup
            os.remove(filepath)
            client.files.delete(name=myfile.name)
            
            return jsonify({
                "transcription": response.text
            }), 200
            
        except Exception as e:
            print(f"An error occurred during transcription: {e}")
            if os.path.exists(filepath):
                os.remove(filepath)
            # Try to cleanup the uploaded file if it exists
            try:
                if 'myfile' in locals():
                    client.files.delete(name=myfile.name)
            except:
                pass
            return jsonify({"error": f"Failed to process audio: {str(e)}"}), 500

    return jsonify({"error": "An unknown error occurred"}), 500

# --- DIRECT VALVE CONTROL API FOR DEBUGGING ---
@app.route('/api/control-valve', methods=['POST'])
def direct_valve_control():
    data = request.json
    valve_number = data.get('valve_number')
    action = data.get('action')
    
    if not valve_number or not action:
        return jsonify({"error": "Missing valve_number or action"}), 400
    
    if action not in ['open', 'close']:
        return jsonify({"error": "Invalid action. Use 'open' or 'close'"}), 400
    
    value = 0 if action == 'open' else 180
    
    success, message = update_valve_state(valve_number, action, value)
    
    if success:
        return jsonify({"status": "success", "message": message})
    else:
        return jsonify({"status": "error", "message": message}), 500
