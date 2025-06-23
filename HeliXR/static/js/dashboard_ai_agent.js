/* dashboard_ai_agent.js – Text-Only Chat Client */

document.addEventListener('DOMContentLoaded', () => {
    // ---------- DOM ELEMENTS ----------
    const textInputForm = document.getElementById('text-input-form');
    const promptInput = document.getElementById('prompt-input');
    const chatDisplay = document.getElementById('chat-display');

    // ---------- HELPER FUNCTION ----------
    function addMessage(sender, text) {
        const div = document.createElement('div');
        div.classList.add('message', sender);
        const p = document.createElement('p');
        p.textContent = text;
        div.appendChild(p);
        chatDisplay.appendChild(div);
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
    }

    // ---------- EVENT LISTENER for Text Chat ----------
    textInputForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const prompt = promptInput.value.trim();
        if (!prompt) return;

        addMessage('user', prompt);
        promptInput.value = '';
        promptInput.disabled = true; // Disable input while waiting for response

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
            promptInput.disabled = false; // Re-enable input
            promptInput.focus();
        }
    });
});