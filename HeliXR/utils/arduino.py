# HeliXR/utils/arduino.py
import threading
import random
import time
from flask_socketio import SocketIO

# Simulated sensor data
sensor_data = {
    'temperature': 23.5,
    'humidity': 45,
    'light': 780,
    'pressure': 1013
}

socketio = None
thread = None

def start_sensor_thread():
    global socketio, thread
    if thread is None:
        from HeliXR import socketio as si
        socketio = si
        thread = threading.Thread(target=sensor_data_generator)
        thread.daemon = True
        thread.start()

def sensor_data_generator():
    while True:
        # Simulate sensor readings
        sensor_data['temperature'] = round(23 + random.random() * 2, 1)
        sensor_data['humidity'] = 45 + random.randint(0, 5)
        sensor_data['light'] = 700 + random.randint(0, 200)
        sensor_data['pressure'] = 1010 + random.randint(0, 6)
        
        # Send data to all connected clients
        if socketio:
            socketio.emit('sensor_update', sensor_data)
        time.sleep(2)