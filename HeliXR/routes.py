import os
from flask import request, render_template, jsonify, url_for, flash, redirect, session
from google import genai
from google.genai import types
from dotenv import load_dotenv
import uuid
from HeliXR import app, db, bcrypt 
from HeliXR.forms import RegistrationForm, LoginForm
from HeliXR.models import User
from flask_login import login_user, current_user, logout_user

# --- SETUP ---
load_dotenv()

TEMP_FOLDER = 'temp_audio'
if not os.path.exists(TEMP_FOLDER):
    os.makedirs(TEMP_FOLDER)

app.config['TEMP_FOLDER'] = TEMP_FOLDER


SYSTEM_PROMPT="""
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
- When a user’s input is unclear or ambiguous, politely ask clarifying questions to ensure you fully understand their request before proceeding.
- Adapt your responses to match the user’s technical expertise: use simple explanations for non-experts and more technical language for advanced users, while always remaining approachable and encouraging.
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


client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
chat = client.chats.create(model="gemini-2.5-flash")
response = chat.send_message(SYSTEM_PROMPT)

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
                session['chat_history'] = [] # Clear chat history on new login
                return redirect(url_for('dashboard_analytics'))
            else:
                flash('Login Unsuccessful. Please check email and password', 'danger')
    return render_template('login.html', title="HELIXR-Login", css_path="login", form=form)

@app.route('/logout')
def logout():
    session.pop('chat_history', None) # Clear chat history on logout
    logout_user()
    return redirect(url_for('home'))

@app.route('/dashboard_analytics')
def dashboard_analytics():
    return render_template('dashboard_analytics.html', title="HELIXR Analytics", css_path="dashboard_analytics")

@app.route('/dashboard_ai_agent')
def dashboard_ai_agent():
    # Reset chat history when navigating to the page for a clean slate
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
    
    response = chat.send_message(prompt)
    return jsonify({'reply': response.text})

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

            myfile = client.files.upload(file=filepath)
            prompt = 'Extract the text from the speech'

            response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[prompt, myfile]
            )

            #os.remove(filepath)

            return jsonify({
                "transcription": response.text
            }), 200

        except Exception as e:
            print(f"An error occurred during transcription: {e}")
            return jsonify({"error": f"Failed to process audio: {str(e)}"}), 500

    return jsonify({"error": "An unknown error occurred"}), 500