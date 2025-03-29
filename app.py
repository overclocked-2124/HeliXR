from flask import Flask, jsonify, request, render_template,url_for

# Create Flask app instance
app = Flask(__name__)

# Example route
@app.route('/')
def home():
    return render_template('template.html')


if __name__ == '__main__':
    app.run(debug=True)
