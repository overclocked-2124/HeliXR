import os
import signal
import sys

from elevenlabs.client import ElevenLabs
from elevenlabs.conversational_ai.conversation import Conversation
from elevenlabs.conversational_ai.default_audio_interface import DefaultAudioInterface

# Custom subclass to safely handle audio stop errors
class SafeAudioInterface(DefaultAudioInterface):
    def stop(self):
        try:
            super().stop()
        except OSError as e:
            print(f"Warning: Audio stop failed due to: {e}")

def main():
    AGENT_ID = 'agent_01jx4j8n0zfz68zktdrrwc5gde'
    API_KEY = 'sk_a4c62b275a604109c2373a2efc0d11897274c9eda962a7d9'

    if not AGENT_ID:
        sys.stderr.write("AGENT_ID environment variable must be set\n")
        sys.exit(1)
    
    if not API_KEY:
        sys.stderr.write("ELEVENLABS_API_KEY not set, assuming the agent is public\n")

    client = ElevenLabs(api_key=API_KEY)
    conversation = Conversation(
        client,
        AGENT_ID,
        requires_auth=bool(API_KEY),
        audio_interface=SafeAudioInterface(),  # Use the safe subclass
        callback_agent_response=lambda response: print(f"Agent: {response}"),
        callback_agent_response_correction=lambda original, corrected: print(f"Agent: {original} -> {corrected}"),
        callback_user_transcript=lambda transcript: print(f"User: {transcript}"),
        # callback_latency_measurement=lambda latency: print(f"Latency: {latency}ms"),
    )
    conversation.start_session()

    # Run until Ctrl+C is pressed.
    signal.signal(signal.SIGINT, lambda sig, frame: conversation.end_session())

    conversation_id = conversation.wait_for_session_end()
    print(f"Conversation ID: {conversation_id}")

if __name__ == '__main__':
    main()
