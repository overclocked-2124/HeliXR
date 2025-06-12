/* dashboard_ai_agent.js – agent-aware voice streaming
 * FINAL VERSION: Uses manual resampling in JavaScript to guarantee
 * compatibility and avoid browser-specific sample rate errors.
 * --------------------------------------------------------------- */

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
    let isMuted = true;
    let userMicStream, userAudioCtx, sourceNode, processorNode;
    const socket = io();

    // ---------- AUDIO PLAYBACK STATE ----------
    let agentPlaybackCtx;
    const agentAudioQueue = [];
    let isPlayingAgentAudio = false;

    // ---------- AUDIO STREAMING CONSTANTS ----------
    const TARGET_SAMPLE_RATE = 16000;
    const CHUNK_SIZE = 4096;

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
    
    // --- MANUAL RESAMPLING FUNCTION ---
    function resampleBuffer(inputBuffer, inputSampleRate, outputSampleRate) {
        const inputData = inputBuffer.getChannelData(0);
        const ratio = inputSampleRate / outputSampleRate;
        const outputLength = Math.floor(inputData.length / ratio);
        const outputData = new Float32Array(outputLength);

        for (let i = 0; i < outputLength; i++) {
            outputData[i] = inputData[Math.floor(i * ratio)];
        }
        return outputData;
    }
    
    function float32To16bitPCM(buffer) {
        const pcm = new Int16Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            let s = Math.max(-1, Math.min(1, buffer[i]));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return pcm.buffer;
    }

    // ---------- HIGH-LEVEL AGENT & MIC CONTROL ----------
    function startVoiceAgent() {
        if (agentReady) return;
        micStatus.textContent = 'Connecting to voice agent…';
        micButton.disabled = true;
        terminateAgentButton.disabled = true;
        socket.emit('start_agent');
    }

    function stopVoiceAgent() {
        if (!agentReady) return;
        socket.emit('stop_agent');
    }

    async function openMic() {
        if (!agentReady || !isMuted) return;
        try {
            userMicStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
            
            userAudioCtx = new AudioContext();
            const sourceSampleRate = userAudioCtx.sampleRate;
            
            sourceNode = userAudioCtx.createMediaStreamSource(userMicStream);
            processorNode = userAudioCtx.createScriptProcessor(CHUNK_SIZE, 1, 1);

            processorNode.onaudioprocess = (e) => {
                const resampledData = resampleBuffer(e.inputBuffer, sourceSampleRate, TARGET_SAMPLE_RATE);
                const pcmData = float32To16bitPCM(resampledData);
                socket.emit('audio_in', pcmData);
            };

            sourceNode.connect(processorNode);
            processorNode.connect(userAudioCtx.destination);

            isMuted = false;
            micButton.classList.add('listening');
            micIcon.className = 'fas fa-microphone';
            micStatus.textContent = 'Listening… Click mic to mute.';
        } catch (err) {
            addMessage('system', `Microphone Error: ${err.message}`);
        }
    }

    function closeMic() {
        isMuted = true;
        processorNode?.disconnect();
        sourceNode?.disconnect();
        userMicStream?.getTracks().forEach(t => t.stop());
        if(userAudioCtx?.state !== 'closed') {
           userAudioCtx?.close().catch(console.error);
        }

        micButton.classList.remove('listening');
        micIcon.className = 'fas fa-microphone-slash';
        if (agentReady) {
            micStatus.textContent = 'Muted. Click mic to speak.';
        }
    }
    
    // ---------- AUDIO PLAYBACK LOGIC ----------
    function playFromAgentQueue() {
        if (isPlayingAgentAudio || agentAudioQueue.length === 0) return;
        isPlayingAgentAudio = true;
        
        const chunk = agentAudioQueue.shift();
        
        agentPlaybackCtx.decodeAudioData(chunk)
            .then(buffer => {
                const source = agentPlaybackCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(agentPlaybackCtx.destination);
                source.onended = () => {
                    isPlayingAgentAudio = false;
                    playFromAgentQueue();
                };
                source.start();
            })
            .catch(e => {
                console.error("Error decoding audio data:", e);
                isPlayingAgentAudio = false;
                playFromAgentQueue();
            });
    }

    // ---------- EVENT LISTENERS ----------
    textInputForm.addEventListener('submit', async e => {
        e.preventDefault();
        const prompt = promptInput.value.trim();
        if (!prompt) return;
        addMessage('user', prompt);
        promptInput.value = '';
        try {
            const r = await fetch('/chat/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            const data = await r.json();
            if (data.error) throw new Error(data.error);
            addMessage('agent', data.reply);
        } catch (err) {
            addMessage('system', `Error: ${err.message}`);
        }
    });

    modeToggle.addEventListener('change', () => {
        const isVoiceMode = modeToggle.checked;
        if (isVoiceMode) {
            textInputForm.style.display = 'none';
            voiceInputControls.style.display = 'flex';
            startVoiceAgent();
        } else {
            textInputForm.style.display = 'flex';
            voiceInputControls.style.display = 'none';
            stopVoiceAgent();
        }
    });
    
    micButton.addEventListener('click', () => {
        if (!agentReady) return;
        if (!agentPlaybackCtx) agentPlaybackCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (agentPlaybackCtx.state === 'suspended') agentPlaybackCtx.resume();
        isMuted ? openMic() : closeMic();
    });

    terminateAgentButton.addEventListener('click', () => {
        if (modeToggle.checked) {
            modeToggle.click();
        }
    });

    // ---------- SOCKET.IO EVENT HANDLERS ----------
    socket.on('agent_started', (d) => {
        addMessage('system', d.data);
        agentReady = true;
        micButton.disabled = false;
        terminateAgentButton.disabled = false;
        micStatus.textContent = "Click mic to start speaking.";
    });

    socket.on('agent_stopped', (d) => {
        addMessage('system', d.data);
        agentReady = false;
        micButton.disabled = true;
        terminateAgentButton.disabled = true;
        closeMic();
        if (modeToggle.checked) {
            micStatus.textContent = "Agent disconnected. Toggle to reconnect.";
        }
    });
    
    let userMessageDiv = null;
    socket.on('user_transcript', (d) => {
        if (!userMessageDiv) {
            userMessageDiv = addMessage('user', '');
        }
        userMessageDiv.querySelector('p').textContent = d.data;
    });

    let agentMessageDiv = null;
    socket.on('agent_text_chunk', (d) => {
        if (!agentMessageDiv) {
            userMessageDiv = null; // A response from the agent means the user is done talking
            agentMessageDiv = addMessage('agent', '');
        }
        agentMessageDiv.querySelector('p').textContent += d.data;
        // Reset once the agent's utterance seems complete
        if(/[.?!]/.test(d.data)){
            agentMessageDiv = null;
        }
    });
    
    socket.on('agent_audio_chunk', (chunk) => {
        if (chunk instanceof ArrayBuffer) {
            agentAudioQueue.push(chunk);
            if (!isPlayingAgentAudio) {
                playFromAgentQueue();
            }
        }
    });

    socket.on('error', (d) => addMessage('system', `Agent Error: ${d.data}`));
    socket.on('disconnect', () => {
        addMessage('system', 'Disconnected from server. Please refresh.');
        if(agentReady) stopVoiceAgent();
    });

    // Initialize UI
    modeToggle.dispatchEvent(new Event('change'));
});