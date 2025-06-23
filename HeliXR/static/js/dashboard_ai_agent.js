/* dashboard_ai_agent.js – Text and Voice Chat Client */

document.addEventListener('DOMContentLoaded', () => {
    // ---------- DOM ELEMENTS ----------
    const agentContainer = document.getElementById('ai-agent-container');
    const textInputForm = document.getElementById('text-input-form');
    const promptInput = document.getElementById('prompt-input');
    const chatDisplay = document.getElementById('chat-display');
    const modeToggle = document.getElementById('mode-toggle-checkbox');
    const micButton = document.getElementById('mic-button');
    const micStatus = document.getElementById('mic-status');

    // ---------- STATE VARIABLES ----------
    let isRecording = false;
    let mediaRecorder;
    let audioChunks = [];

    // ---------- HELPER FUNCTIONS ----------
    function addMessage(sender, text) {
        const div = document.createElement('div');
        div.classList.add('message', sender);
        const p = document.createElement('p');
        p.innerHTML = text;
        div.appendChild(p);
        chatDisplay.appendChild(div);
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
    }

    /**
     * Sends a text prompt to the Gemini AI and displays the response.
     * @param {string} prompt The text to send to the AI.
     */
    async function sendPromptToAgent(prompt) {
        try {
            const response = await fetch('/chat/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                const errorMessage = errorData?.error || `HTTP error! Status: ${response.status}`;
                throw new Error(errorMessage);
            }

            const data = await response.json();
            if (data.error) throw new Error(data.error);
            addMessage('agent', data.reply);

        } catch (err) {
            addMessage('system', `Error: ${err.message}`);
        }
    }


    // ---------- MODE TOGGLE LOGIC ----------
    modeToggle.addEventListener('change', () => {
        agentContainer.classList.toggle('voice-mode-active', modeToggle.checked);
        if (!modeToggle.checked && isRecording) {
            mediaRecorder.stop();
        }
    });

    // ---------- VOICE RECORDING LOGIC ----------
    micButton.addEventListener('click', async () => {
        if (!isRecording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
                mediaRecorder.onstop = handleVoiceStop;
                mediaRecorder.start();
                isRecording = true;
                micButton.classList.add('recording');
                micButton.innerHTML = '<i class="fas fa-stop"></i>';
                micStatus.textContent = 'Recording... Click to stop.';
            } catch (err) {
                console.error("Error accessing microphone:", err);
                addMessage('system', 'Error: Could not access microphone. Please check browser permissions.');
            }
        } else {
            mediaRecorder.stop();
        }
    });

    async function handleVoiceStop() {
        isRecording = false;
        micButton.classList.remove('recording');
        micButton.innerHTML = '<i class="fas fa-microphone"></i>';
        micStatus.textContent = 'Transcribing...';

        if (audioChunks.length === 0) {
            micStatus.textContent = 'Click the microphone to start recording';
            return;
        }

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio_file', audioBlob, 'recording.webm');
        audioChunks = [];

        try {
            const response = await fetch('/chat/voice_upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                const errorMessage = errorData?.error || `HTTP error! Status: ${response.status}`;
                throw new Error(errorMessage);
            }
            
            const result = await response.json();
            micStatus.textContent = 'Click the microphone to start recording';

            if (result.transcription) {
                // Add the user's transcribed message to the chat
                addMessage('user', result.transcription);
                // Now, send this transcription to the AI for a response
                await sendPromptToAgent(result.transcription);
            } else {
                 throw new Error("Transcription failed to return text.");
            }

        } catch (err) {
            console.error('Error processing audio:', err);
            addMessage('system', `Error: ${err.message}`);
            micStatus.textContent = 'Processing failed. Please try again.';
        }
    }

    // ---------- EVENT LISTENER for Text Chat ----------
    textInputForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const prompt = promptInput.value.trim();
        if (!prompt) return;

        addMessage('user', prompt);
        promptInput.value = '';
        promptInput.disabled = true;

        await sendPromptToAgent(prompt); // Use the new helper function

        promptInput.disabled = false;
        promptInput.focus();
    });
});