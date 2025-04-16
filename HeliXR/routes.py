from flask import request, render_template,url_for,flash, redirect
from HeliXR import app , db ,bcrypt
from HeliXR.forms import RegistrationForm, LoginForm
from HeliXR.models import User
import email_validator
from flask_login import login_user ,current_user,logout_user

@app.route('/')
def home():
    return render_template('index.html',title="HELIXR",css_path="index")

@app.route('/register', methods=['GET','POST'])
def register():
    form = RegistrationForm()
    if form.validate_on_submit():
        hashed_password = bcrypt.generate_password_hash(form.password.data).decode('utf-8')
        user = User(username=form.username.data,email=form.email.data,password=hashed_password)
        db.session.add(user)
        db.session.commit()
        flash('Your account has been created! You are now able to log in','success')
        return redirect(url_for('login'))
    return render_template('register.html',title="HELIXR-Register",css_path="register",form = form)

@app.route('/login', methods=['GET', 'POST'])
def login():
    form = LoginForm()
    if request.method == 'POST':
        if form.validate_on_submit():
            user = User.query.filter_by(email=form.email.data).first()
            if user and bcrypt.check_password_hash(user.password, form.password.data):
                login_user(user,remember=form.remember.data)
                return redirect(url_for('home'))
            else:
                flash('Login Unsuccessful. Please check email and password', 'danger')
    return render_template('login.html', title="HELIXR-Login", css_path="login", form=form)


@app.route('/logout')
def logout():
    logout_user()
    return redirect(url_for('home'))
