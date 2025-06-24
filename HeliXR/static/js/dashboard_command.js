document.addEventListener('DOMContentLoaded', () => {
    // ---------- DOM ELEMENTS ----------
    // Stats elements
    const tempValueEl = document.getElementById('tempValue');
    const humidityValueEl = document.getElementById('humidityValue');
    const lightValueEl = document.getElementById('lightValue');
    const phValueEl = document.getElementById('phValue');

    // Chat elements
    const textInputForm = document.getElementById('text-input-form');
    const promptInput = document.getElementById('prompt-input');
    const chatDisplay = document.getElementById('chat-display');

    // ---------- ANALYTICS LOGIC ----------
    function fetchData() {
        fetch('/api/sensor-data')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                updateStats(data);
            })
            .catch(err => {
                console.error('Error loading sensor data:', err);
                // Optionally display an error message on the UI
            });
    }

    function rgbToLight(rgb) {
        if (!rgb || rgb.length !== 3) return 0;
        return Math.round((rgb[0] + rgb[1] + rgb[2]) / 3);
    }

    function updateStats(data) {
        if (!data) return;
        tempValueEl.textContent = `${(data.temperature || 0).toFixed(1)}°C`;
        humidityValueEl.textContent = `${(data.humidity || 0).toFixed(1)}%`;
        lightValueEl.textContent = `${rgbToLight(data.color_rgb)} lx`;
        phValueEl.textContent = (data.pH || 0).toFixed(1);
    }

    // ---------- CHAT LOGIC ----------
    function addMessage(sender, text) {
        const div = document.createElement('div');
        div.classList.add('message', sender);
        const p = document.createElement('p');
        p.innerHTML = text.replace(/\n/g, '<br>'); // Render newlines
        div.appendChild(p);
        chatDisplay.appendChild(div);
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
    }

    /**
     * Sends a text prompt to the backend (TEXT-ONLY response handling).
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
                const errorData = await response.json().catch(() => ({ error: `HTTP error! Status: ${response.status}` }));
                throw new Error(errorData.error);
            }

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            // Add the agent's text message to the chat display
            addMessage('agent', data.reply);
            // NOTE: We are intentionally ignoring data.audio_url for this text-only interface.

        } catch (err) {
            console.error('Error in sendPromptToAgent:', err);
            addMessage('system', `Error: ${err.message}`);
        }
    }

    textInputForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const prompt = promptInput.value.trim();
        if (!prompt) return;

        addMessage('user', prompt);
        promptInput.value = '';
        promptInput.disabled = true;
        const submitButton = textInputForm.querySelector('button');
        submitButton.disabled = true;

        await sendPromptToAgent(prompt);

        promptInput.disabled = false;
        submitButton.disabled = false;
        promptInput.focus();
    });


    // ---------- INITIALIZATION ----------
    function initialize() {
        console.log('Command View Initialized');
        // Initial fetch then set interval
        fetchData();
        setInterval(fetchData, 5000); // Update stats every 5 seconds
        promptInput.focus();
    }

    initialize();
});