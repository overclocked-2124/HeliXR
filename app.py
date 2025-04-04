from flask import Flask, jsonify, request, render_template,url_for,flash, redirect
from forms import RegistrationForm, LoginForm
import email_validator

app = Flask(__name__)

app.config['SECRET_KEY'] = 'c1877bdc3305c942f87b10f86e246167'


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

@app.route('/login')
def login():
    form = LoginForm()
    return render_template('login.html',title="HELIXR-Login",css_path="login",form = form)


if __name__ == '__main__':
    app.run(debug=True)
