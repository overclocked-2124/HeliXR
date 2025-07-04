/* dashboard_ai_agent.js – Text and Voice Chat Client with Client-Side Audio Playback */

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
        p.innerHTML = text; // Use innerHTML to render potential formatting
        div.appendChild(p);
        chatDisplay.appendChild(div);
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
    }

    /**
     * Sends a text prompt to the backend and plays the returned audio.
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

            // Add the agent's text message to the chat display
            addMessage('agent', data.reply);

            // Check if an audio URL was provided and play it
            if (data.audio_url) {
                // The browser will handle playing the audio from this URL
                const audio = new Audio(data.audio_url);
                audio.play().catch(e => {
                    console.error("Error playing audio:", e);
                    // Browsers may block autoplay until a user interaction.
                    // This is usually fine since this function is triggered by a user action.
                    addMessage('system', 'System: Could not play audio automatically. Please check browser settings.');
                });
            }

        } catch (err) {
            console.error('Error in sendPromptToAgent:', err);
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
                mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                
                mediaRecorder.ondataavailable = event => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };
                
                mediaRecorder.onstop = handleVoiceStop;
                
                mediaRecorder.start();
                isRecording = true;
                micButton.classList.add('recording');
                micButton.innerHTML = '🔴';
                micStatus.textContent = 'Recording... Click to stop.';
                
            } catch (err) {
                console.error("Error accessing microphone:", err);
                addMessage('system', 'Error: Could not access microphone. Please check browser permissions.');
            }
        } else {
            mediaRecorder.stop();
            // Stop all audio tracks to release microphone
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
    });

    async function handleVoiceStop() {
        isRecording = false;
        micButton.classList.remove('recording');
        micButton.innerHTML = '🎤';
        micStatus.textContent = 'Transcribing...';

        if (audioChunks.length === 0) {
            micStatus.textContent = 'Click the microphone to start recording';
            return;
        }

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio_file', audioBlob, 'recording.webm');
        
        // Clear audio chunks for next recording
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
                addMessage('user', result.transcription);
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

        await sendPromptToAgent(prompt);
        
        promptInput.disabled = false;
        promptInput.focus();
    });

    // Initialize the interface
    if (micStatus) {
        micStatus.textContent = 'Click the microphone to start recording';
    }
    if (promptInput) {
        promptInput.focus();
    }
});