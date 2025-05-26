import os
import json  # For creating a JSON string for APP_CONFIG
from flask import Flask, send_from_directory, Response, abort
from flaskwebgui import FlaskUI

app = Flask(__name__, static_folder='frontend/dist')  # Serve static files from 'frontend/dist' root

# --- Configuration ---
# These values will be injected into the frontend.
# The developer sets these up once.
# Ensure the VNC_PASSWORD matches the XPRA_PASSWORD in your .env for docker-compose.
APP_CONFIG = {
    "VNC_PASSWORD": os.getenv("XPRA_PASSWORD", "pass"),  # Default to "pass" or your chosen hardcoded password
    "VNC_WEBSOCKET_URL": "ws://localhost:14500/websockify",
    "CHAT_API_URL": "http://localhost:5000/chat"
}

@app.route('/')
def index():
    try:
        # Try to open index.html from the root of the dist folder
        with open(os.path.join(app.static_folder, 'index.html'), 'r', encoding='utf-8') as f:
            html_content = f.read()
        config_script = f"<script>window.APP_CONFIG = {json.dumps(APP_CONFIG)};</script>"
        if '</head>' in html_content:
            html_content = html_content.replace('</head>', f'{config_script}</head>', 1)
        elif '</body>' in html_content:
            html_content = html_content.replace('</body>', f'{config_script}</body>', 1)
        else:
            html_content += config_script
        return Response(html_content, mimetype='text/html')
    except FileNotFoundError:
        return "Error: index.html not found in frontend/dist. Ensure the frontend has been built.", 404

@app.route('/<path:filename>')
def serve_static_from_root(filename):
    # Serves files like vite.svg if they are in the root of 'dist'
    return send_from_directory(app.static_folder, filename)

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    # Serves files from 'frontend/dist/assets/'
    return send_from_directory(os.path.join(app.static_folder, 'assets'), filename)

if __name__ == '__main__':
    # Ensure FlaskUI uses Flask's built-in server for compatibility
    ui = FlaskUI(app=app, server="flask", width=1600, height=900)
    ui.run() 