from flask import Flask, render_template, Response
from flask_socketio import SocketIO
from flaskwebgui import FlaskUI
import os
import base64
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'docker-cua-starter')))
from computer import DockerComputer

app = Flask(__name__)
socketio = SocketIO(app)
ui = FlaskUI(server="flask_socketio", app=app, socketio=socketio, width=1200, height=800)

# Start DockerComputer once for the app lifetime
computer = DockerComputer()
computer.__enter__()

@app.route('/desktop')
def desktop():
    b64 = computer.screenshot()
    img_bytes = base64.b64decode(b64)
    return Response(img_bytes, mimetype='image/png')

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('message')
def handle_message(msg):
    print(f"Received message: {msg}")
    socketio.send(msg, broadcast=True)

@socketio.on('click')
def handle_click(data):
    x = data['x']
    y = data['y']
    button = data.get('button', 'left')
    computer.click(x, y, button)

@socketio.on('double_click')
def handle_double_click(data):
    x = data['x']
    y = data['y']
    computer.double_click(x, y)

@socketio.on('drag')
def handle_drag(path):
    computer.drag(path)

@socketio.on('type')
def handle_type(text):
    computer.type(text)

@socketio.on('keypress')
def handle_keypress(keys):
    computer.keypress(keys)

@socketio.on('scroll')
def handle_scroll(data):
    x = data['x']
    y = data['y']
    scroll_x = data.get('scroll_x', 0)
    scroll_y = data.get('scroll_y', 0)
    computer.scroll(x, y, scroll_x, scroll_y)

if __name__ == '__main__':
    try:
        ui.run()
    finally:
        computer.__exit__(None, None, None) 