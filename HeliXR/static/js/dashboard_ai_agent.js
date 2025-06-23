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

    // ---------- HELPER FUNCTION ----------
    function addMessage(sender, text) {
        const div = document.createElement('div');
        div.classList.add('message', sender);
        const p = document.createElement('p');
        p.innerHTML = text; // Use innerHTML to allow for simple formatting
        div.appendChild(p);
        chatDisplay.appendChild(div);
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
    }

    // ---------- MODE TOGGLE LOGIC ----------
    modeToggle.addEventListener('change', () => {
        if (modeToggle.checked) {
            agentContainer.classList.add('voice-mode-active');
        } else {
            agentContainer.classList.remove('voice-mode-active');
            if (isRecording) {
                mediaRecorder.stop();
            }
        }
    });

    // ---------- VOICE RECORDING LOGIC ----------
    micButton.addEventListener('click', async () => {
        if (!isRecording) {
            // --- Start Recording ---
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                
                mediaRecorder.ondataavailable = event => {
                    audioChunks.push(event.data);
                };

                mediaRecorder.onstop = sendAudioToServer;
                mediaRecorder.start();
                isRecording = true;

                micButton.classList.add('recording');
                micButton.innerHTML = '<i class="fas fa-stop"></i>';
                micStatus.textContent = 'Recording... Click to stop.';

            } catch (err) {
                console.error("Error accessing microphone:", err);
                micStatus.textContent = 'Microphone access denied.';
                addMessage('system', 'Error: Could not access microphone. Please check browser permissions.');
            }
        } else {
            // --- Stop Recording ---
            mediaRecorder.stop();
            isRecording = false;

            micButton.classList.remove('recording');
            micButton.innerHTML = '<i class="fas fa-microphone"></i>';
            micStatus.textContent = 'Processing...';
        }
    });

    async function sendAudioToServer() {
        if (audioChunks.length === 0) {
            micStatus.textContent = 'Click the microphone to start recording';
            return;
        }

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio_file', audioBlob, 'recording.webm');
        
        audioChunks = [];
        
        addMessage('user', '[Voice command sent for processing]');

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
            addMessage('system', `Message sent`);

        } catch (err) {
            console.error('Error uploading audio:', err);
            addMessage('system', `Error: ${err.message}`);
            micStatus.textContent = 'Upload failed. Please try again.';
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
        } finally {
            promptInput.disabled = false;
            promptInput.focus();
        }
    });
});



