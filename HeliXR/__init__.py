from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_login import LoginManager
from flask_socketio import SocketIO

app = Flask(__name__)

app.config['SECRET_KEY'] = 'c1877bdc3305c942f87b10f86e246167'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///site.db'

app.mongo_db = None
app.mongo_collection = None

app.config['MONGO_URI'] = "mongodb+srv://UnityUser:saucetoss@saucecluster.qcpwyah.mongodb.net/TomatoSauce?retryWrites=true&w=majority"
app.config['MONGO_DB_NAME'] = "TomatoSauce"
app.config['MONGO_COLLECTION_NAME'] = "SauceData"

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
login_manager=LoginManager(app)
socketio = SocketIO(app)




from HeliXR import routes