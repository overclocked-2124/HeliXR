from google import genai
from dotenv import load_dotenv      # pip install python-dotenv
import os

from google import genai

client = genai.Client(api_key="AIzaSyC17kwQbdmJXj1_uUSW51wf0GScwCT_yZ8")
chat = client.chats.create(model="gemini-2.5-flash")

response = chat.send_message("I have 2 dogs in my house.")
print(response.text)

response = chat.send_message("How many paws are in my house?")
print(response.text)

for message in chat.get_history():
    print(f'role - {message.role}',end=": ")
    print(message.parts[0].text)
