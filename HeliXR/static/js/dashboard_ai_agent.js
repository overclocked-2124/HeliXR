document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const modeToggle = document.getElementById('mode-toggle-checkbox');
    const textInputForm = document.getElementById('text-input-form');
    const voiceInputControls = document.getElementById('voice-input-controls');
    const promptInput = document.getElementById('prompt-input');
    const chatDisplay = document.getElementById('chat-display');
    const micButton = document.getElementById('mic-button');
    const micStatus = document.getElementById('mic-status');

    // --- State ---
    let isVoiceMode = false;
    let isAgentActive = false;

    // --- WebSocket Connection ---
    const socket = io();

    // --- Functions ---
    const addMessageToChat = (sender, text) => {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender);
        const paragraph = document.createElement('p');
        paragraph.textContent = text;
        messageDiv.appendChild(paragraph);
        chatDisplay.appendChild(messageDiv);
        chatDisplay.scrollTop = chatDisplay.scrollHeight; // Auto-scroll
    };

    const updateUIMode = () => {
        isVoiceMode = modeToggle.checked;
        if (isVoiceMode) {
            textInputForm.style.display = 'none';
            voiceInputControls.style.display = 'block';
        } else {
            textInputForm.style.display = 'flex';
            voiceInputControls.style.display = 'none';
            // If the agent is active, stop it when switching modes
            if (isAgentActive) {
                socket.emit('stop_agent');
            }
        }
    };

    const handleTextSubmit = async (event) => {
        event.preventDefault();
        const promptText = promptInput.value.trim();
        if (promptText) {
            addMessageToChat('user', promptText);
            promptInput.value = '';

            try {
                const response = await fetch('/chat/gemini', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: promptText })
                });

                if (!response.ok) {
                    throw new Error(`Server error: ${response.statusText}`);
                }

                const data = await response.json();
                addMessageToChat('agent', data.reply || 'Sorry, I encountered an error.');
            } catch (error) {
                console.error('Error fetching Gemini response:', error);
                addMessageToChat('agent', `Error: ${error.message}`);
            }
        }
    };

    const toggleVoiceAgent = () => {
        if (!isAgentActive) {
            socket.emit('start_agent');
        } else {
            socket.emit('stop_agent');
        }
    };

    // --- Event Listeners ---
    modeToggle.addEventListener('change', updateUIMode);
    textInputForm.addEventListener('submit', handleTextSubmit);
    micButton.addEventListener('click', toggleVoiceAgent);

    // --- Socket.IO Event Handlers ---
    socket.on('connect', () => {
        console.log('Connected to server!');
    });

    socket.on('agent_started', (msg) => {
        console.log(msg.data);
        isAgentActive = true;
        micButton.classList.add('active');
        micStatus.textContent = "Agent is listening... Press to stop.";
        addMessageToChat('system', 'Voice agent activated. Start speaking.');
    });

    socket.on('agent_stopped', (msg) => {
        console.log(msg.data);
        isAgentActive = false;
        micButton.classList.remove('active');
        micStatus.textContent = "Press the microphone to start speaking";
        addMessageToChat('system', 'Voice agent session ended.');
    });

    socket.on('user_transcript', (data) => {
        addMessageToChat('user', data.data);
    });

    socket.on('agent_response', (data) => {
        addMessageToChat('agent', data.data);
    });

    socket.on('error', (data) => {
        console.error('Server error:', data.data);
        addMessageToChat('system', `Error: ${data.data}`);
    });


    // --- Initial Setup ---
    updateUIMode();
});