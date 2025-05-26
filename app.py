import os
from flask import Flask, send_from_directory, Response
from flaskwebgui import FlaskUI

app = Flask(__name__, static_folder='frontend/dist/assets')

XPRA_ACTUAL_PASSWORD = os.getenv("THE_SAME_XPRA_PASSWORD", "your_fallback_password_if_not_set")

@app.route('/')
def index():
    try:
        with open('frontend/dist/index.html', 'r', encoding='utf-8') as f:
            html_content = f.read()
        injection_script = f"<script>window.XpraPassword = '{XPRA_ACTUAL_PASSWORD}';</script>"
        if '</head>' in html_content:
            html_content = html_content.replace('</head>', f'{injection_script}</head>', 1)
        elif '</body>' in html_content:
            html_content = html_content.replace('</body>', f'{injection_script}</body>', 1)
        else:
            html_content += injection_script
        return Response(html_content, mimetype='text/html')
    except FileNotFoundError:
        return "Error: index.html not found. Ensure the frontend has been built.", 404

@app.route('/<path:path>')
def serve_static_files(path):
    if os.path.exists(os.path.join('frontend/dist', path)):
        return send_from_directory('frontend/dist', path)
    elif os.path.exists(os.path.join('frontend/dist/assets', path)):
        return send_from_directory('frontend/dist/assets', path)
    from flask import abort
    abort(404)

if __name__ == '__main__':
    ui = FlaskUI(app, width=1200, height=800)
    ui.run() 