from flask import Flask, jsonify, request, render_template,url_for,flash, redirect
from flask_sqlalchemy import SQLAlchemy
from forms import RegistrationForm, LoginForm
import email_validator

app = Flask(__name__)

app.config['SECRET_KEY'] = 'c1877bdc3305c942f87b10f86e246167'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///site.db'


db = SQLAlchemy(app)

class User(db.Model):
    id = db.Column(db.Integer,primary_key=True)
    username = db.Column(db.String(20), unique=True,nullable=False)
    email = db.Column(db.String(120), unique=True,nullable=False)
    image_file = db.Column(db.String(20), nullable=False, default='default.jpeg')
    password = db.Column(db.String(60), nullable=False)

    def __repr__(self):
        return f"User('{self.username}' ,'{self.email}', '{self.image_file}')"





@app.route('/')
def home():
    return render_template('index.html',title="HELIXR",css_path="index")

@app.route('/register', methods=['GET','POST'])
def register():
    form = RegistrationForm()
    if form.validate_on_submit():
        flash(f'Account created for {form.username.data}!','success')
        return redirect(url_for('home'))
    return render_template('register.html',title="HELIXR-Register",css_path="register",form = form)

@app.route('/login', methods=['GET', 'POST'])
def login():
    form = LoginForm()
    if request.method == 'POST':
        if form.validate_on_submit():
            if form.email.data == 'admin@blog.com' and form.password.data == 'password':
                flash('You have been logged in!', 'success')
                return redirect(url_for('home'))
            else:
                flash('Login Unsuccessful. Please check username and password', 'danger')
    return render_template('login.html', title="HELIXR-Login", css_path="login", form=form)

if __name__ == '__main__':
    app.run(debug=True)
