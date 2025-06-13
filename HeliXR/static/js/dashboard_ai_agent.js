/* dashboard_ai_agent.js – Gemini Native Audio Chat Client */

document.addEventListener('DOMContentLoaded', () => {
    // ---------- DOM ELEMENTS ----------
    const modeToggle = document.getElementById('mode-toggle-checkbox');
    const textInputForm = document.getElementById('text-input-form');
    const voiceInputControls = document.getElementById('voice-input-controls');
    const promptInput = document.getElementById('prompt-input');
    const chatDisplay = document.getElementById('chat-display');
    const micButton = document.getElementById('mic-button');
    const micIcon = document.getElementById('mic-icon');
    const micStatus = document.getElementById('mic-status');
    const terminateAgentButton = document.getElementById('terminate-agent-button');

    // ---------- STATE ----------
    let agentReady = false;
    let isRecording = false;
    let userMicStream, userAudioCtx, sourceNode, processorNode;
    const socket = io();

    // ---------- VAD & RECORDING STATE ----------
    let silenceTimer = null;
    let recordedChunks = [];
    const VAD_THRESHOLD = 0.01;
    const SILENCE_TIMEOUT = 1500;

    // ---------- AUDIO PLAYBACK STATE ----------
    let agentPlaybackCtx;
    const agentAudioQueue = [];
    let isPlayingAgentAudio = false;

    // ---------- HELPER FUNCTIONS ----------
    function addMessage(sender, text) {
        const div = document.createElement('div');
        div.classList.add('message', sender);
        const p = document.createElement('p');
        p.textContent = text;
        div.appendChild(p);
        chatDisplay.appendChild(div);
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
        return div;
    }

    // ---------- AUDIO PROCESSING ----------
    function convertToInt16PCM(float32Array, sampleRate) {
        // Convert Float32Array to Int16Array (16-bit PCM)
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16Array.buffer;
    }

    function resampleTo16kHz(audioBuffer, originalSampleRate) {
        if (originalSampleRate === 16000) {
            return audioBuffer;
        }
        
        const ratio = originalSampleRate / 16000;
        const newLength = Math.round(audioBuffer.length / ratio);
        const result = new Float32Array(newLength);
        
        for (let i = 0; i < newLength; i++) {
            const originalIndex = i * ratio;
            const index = Math.floor(originalIndex);
            const fraction = originalIndex - index;
            
            if (index + 1 < audioBuffer.length) {
                result[i] = audioBuffer[index] * (1 - fraction) + audioBuffer[index + 1] * fraction;
            } else {
                result[i] = audioBuffer[index];
            }
        }
        
        return result;
    }

    // ---------- RECORDING FUNCTIONS ----------
    async function startRecording() {
        if (isRecording) return;

        try {
            userMicStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000, // Request 16kHz if possible
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            userAudioCtx = new AudioContext();
            sourceNode = userAudioCtx.createMediaStreamSource(userMicStream);
            
            // Use AudioWorklet if available, fallback to ScriptProcessor
            if (userAudioCtx.audioWorklet) {
                // Modern approach - would need to implement AudioWorklet
                processorNode = userAudioCtx.createScriptProcessor(4096, 1, 1);
            } else {
                processorNode = userAudioCtx.createScriptProcessor(4096, 1, 1);
            }

            processorNode.onaudioprocess = (e) => {
                if (!isRecording) return;

                const inputData = e.inputBuffer.getChannelData(0);
                
                // Calculate RMS for VAD
                let sum = 0.0;
                for (let i = 0; i < inputData.length; i++) {
                    sum += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sum / inputData.length);

                if (rms > VAD_THRESHOLD) {
                    // Speech detected
                    recordedChunks.push(new Float32Array(inputData));
                    clearTimeout(silenceTimer);
                    micStatus.textContent = "Listening...";
                } else {
                    // Silence detected
                    if (recordedChunks.length > 0 && !silenceTimer) {
                        silenceTimer = setTimeout(finishTurn, SILENCE_TIMEOUT);
                    }
                }
            };

            sourceNode.connect(processorNode);
            processorNode.connect(userAudioCtx.destination);

            isRecording = true;
            micButton.classList.add('listening');
            micIcon.className = 'fas fa-microphone';
            micStatus.textContent = "Listening... (speak now)";

        } catch (err) {
            addMessage('system', `Microphone Error: ${err.message}`);
        }
    }

    function stopRecording() {
        if (!isRecording) return;

        isRecording = false;
        clearTimeout(silenceTimer);
        silenceTimer = null;

        if (processorNode) {
            processorNode.disconnect();
            processorNode = null;
        }
        if (sourceNode) {
            sourceNode.disconnect();
            sourceNode = null;
        }
        if (userMicStream) {
            userMicStream.getTracks().forEach(track => track.stop());
            userMicStream = null;
        }
        if (userAudioCtx && userAudioCtx.state !== 'closed') {
            userAudioCtx.close().catch(console.error);
            userAudioCtx = null;
        }

        micButton.classList.remove('listening');
        micIcon.className = 'fas fa-microphone-slash';
        micStatus.textContent = "Click mic to speak.";
    }

    function finishTurn() {
        if (recordedChunks.length === 0) {
            stopRecording();
            setTimeout(startRecording, 200);
            return;
        }

        micStatus.textContent = "Processing...";

        // Combine all recorded chunks
        const totalLength = recordedChunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const combinedAudio = new Float32Array(totalLength);
        let offset = 0;
        
        for (const chunk of recordedChunks) {
            combinedAudio.set(chunk, offset);
            offset += chunk.length;
        }

        // Resample to 16kHz if needed
        const originalSampleRate = userAudioCtx.sampleRate;
        const resampledAudio = resampleTo16kHz(combinedAudio, originalSampleRate);
        
        // Convert to 16-bit PCM
        const pcmData = convertToInt16PCM(resampledAudio, 16000);

        // Send to backend
        socket.emit("process_user_turn", pcmData);
        addMessage('user', "[Voice message]");

        // Reset for next turn
        recordedChunks = [];
        stopRecording();
        setTimeout(startRecording, 500);
    }

    // ---------- AUDIO PLAYBACK ----------
    function playAgentAudio(audioData) {
        if (!agentPlaybackCtx) {
            agentPlaybackCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (agentPlaybackCtx.state === 'suspended') {
            agentPlaybackCtx.resume();
        }

        // Convert base64 to array buffer if needed
        let arrayBuffer;
        if (typeof audioData === 'string') {
            const binaryString = atob(audioData);
            arrayBuffer = new ArrayBuffer(binaryString.length);
            const uint8Array = new Uint8Array(arrayBuffer);
            for (let i = 0; i < binaryString.length; i++) {
                uint8Array[i] = binaryString.charCodeAt(i);
            }
        } else {
            arrayBuffer = audioData;
        }

        // Play the audio
        const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
        };
        
        audio.play().catch(e => {
            console.error('Error playing audio:', e);
        });
    }

    // ---------- EVENT LISTENERS ----------
    modeToggle.addEventListener('change', () => {
        const isVoiceMode = modeToggle.checked;
        
        if (isVoiceMode) {
            textInputForm.style.display = 'none';
            voiceInputControls.style.display = 'flex';
            socket.emit("start_agent");
        } else {
            textInputForm.style.display = 'flex';
            voiceInputControls.style.display = 'none';
            stopRecording();
            socket.emit("stop_agent");
        }
    });

    micButton.addEventListener('click', () => {
        if (!agentReady) return;

        // Initialize audio context on user gesture
        if (!agentPlaybackCtx) {
            agentPlaybackCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (agentPlaybackCtx.state === 'suspended') {
            agentPlaybackCtx.resume();
        }

        if (isRecording) {
            finishTurn();
        } else {
            startRecording();
        }
    });

    terminateAgentButton.addEventListener('click', () => {
        if (modeToggle.checked) {
            modeToggle.click();
        }
    });

    // Text chat functionality
    textInputForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const prompt = promptInput.value.trim();
        if (!prompt) return;

        addMessage('user', prompt);
        promptInput.value = '';

        try {
            const response = await fetch('/chat/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error);
            addMessage('agent', data.reply);
        } catch (err) {
            addMessage('system', `Error: ${err.message}`);
        }
    });

    // ---------- SOCKET EVENTS ----------
    socket.on('agent_started', (data) => {
        addMessage('system', data.data);
        agentReady = true;
        micButton.disabled = false;
        terminateAgentButton.disabled = false;
        micStatus.textContent = "Click mic to speak.";
    });

    socket.on('agent_stopped', (data) => {
        addMessage('system', data.data);
        agentReady = false;
        stopRecording();
        micButton.disabled = true;
        terminateAgentButton.disabled = true;
        micStatus.textContent = "Switch to voice mode to start.";
    });

    socket.on('agent_response_text', (data) => {
        if (data.text && !data.is_partial) {
            addMessage('agent', data.text);
        }
    });

    socket.on('agent_response_audio', (audioData) => {
        playAgentAudio(audioData);
    });

    socket.on('error', (data) => {
        addMessage('system', `Error: ${data.data}`);
    });

    // Initialize
    modeToggle.dispatchEvent(new Event('change'));
});
