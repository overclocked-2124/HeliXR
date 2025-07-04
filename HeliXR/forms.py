from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField , SubmitField ,BooleanField 
from wtforms.validators import DataRequired , Length , Email , EqualTo ,ValidationError
from HeliXR.models import User

class RegistrationForm(FlaskForm):
    username = StringField('Username',validators=[DataRequired(), Length(min=2 , max=20)])
    email = StringField('Email', validators=[Email(), DataRequired()])
    password = PasswordField('Password' , validators=[DataRequired()])
    confirm_password = PasswordField('Confirm_Password' , validators=[DataRequired(),EqualTo('password')])
    submit = SubmitField("Sign Up")

    def validate_username(self, username_field):
        user = User.query.filter_by(username=username_field.data).first()
        if user:
            raise ValidationError('That username is taken. Please choose a different one.')

    def validate_email(self, email_field):
        user = User.query.filter_by(email=email_field.data).first()
        if user:
            raise ValidationError('That email is already registered. Please choose a different one.')

class LoginForm(FlaskForm):
    email = StringField('Email', validators=[Email(), DataRequired()])
    password = PasswordField('Password' , validators=[DataRequired()])
    remember = BooleanField('Remember Me')
    submit = SubmitField("Sign In")