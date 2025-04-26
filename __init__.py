from flask import Flask, redirect, url_for, session
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
from flask_migrate import Migrate
from flask_socketio import SocketIO, join_room, emit
from config import Config
from flask_login import LoginManager, UserMixin, current_user
import pytz
from datetime import datetime
from werkzeug.security import check_password_hash, generate_password_hash
from datetime import timedelta 
from limiter import limiter

app = Flask(__name__)
app.config.from_object(Config)

db = SQLAlchemy(app)
migrate = Migrate(app, db)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')
login_manager = LoginManager(app)
login_manager.login_view = 'main.login'

moscow_tz = pytz.timezone('Europe/Moscow')
limiter.init_app(app)

from main import main
app.register_blueprint(main)

user_roles = db.Table('user_roles',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True),
    db.Column('role_id', db.Integer, db.ForeignKey('role.id'), primary_key=True)
)

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(64), unique=True)
    email = db.Column(db.String(120), unique=True)
    password = db.Column(db.String(256))
    role_id = db.Column(db.Integer, db.ForeignKey('role.id'))
    registered_at = db.Column(db.DateTime, default=datetime.now(moscow_tz))
    last_activity = db.Column(db.DateTime, default=datetime.utcnow)

    @property
    def status(self):
        if not self.last_activity:
            return False
        return datetime.utcnow() - self.last_activity < timedelta(minutes=5)
    
    def has_access_to_function(self, func_id):
        return any(func.id == func_id for role in self.roles for func in role.functions)
    
    functions = db.relationship('FunctionUser', backref='author', lazy=True)
    chats = db.relationship('Chat', backref='user', lazy=True)
    roles = db.relationship('Role', secondary=user_roles, back_populates='users')

    def set_password(self, password):
        self.password = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password, password)
    
    def get_available_functions(self, visiable=False):
        functions = []
        seen_ids = set()
        
        for role in self.roles:
            if role.is_admin:
                for func in FunctionUser.query.all():
                    if func.id not in seen_ids:
                        seen_ids.add(func.id)
                        functions.append(func)
                continue
                
            for func in role.functions:
                if func.id not in seen_ids:
                    if visiable or func.approved:
                        seen_ids.add(func.id)
                        functions.append(func)
        
        return functions
    
    def has_access_to_function(self, func_id):
        if any(role.is_admin for role in self.roles):
            return True
            
        return any(func.id == func_id for role in self.roles for func in role.functions)
    
class Chat(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    messages = db.relationship('Message', backref='chat', lazy='dynamic')

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    is_bot = db.Column(db.Boolean, default=False)
    timestamp = db.Column(db.DateTime, default=datetime.now(moscow_tz))
    chat_id = db.Column(db.Integer, db.ForeignKey('chat.id'))

class FunctionUser(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    description = db.Column(db.Text)  
    code = db.Column(db.String(100))  
    function_type = db.Column(db.String(20))  
    approved = db.Column(db.Boolean, default=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    created_at = db.Column(db.DateTime, default=datetime.now(moscow_tz))
    test_cases = db.Column(db.JSON)  

class FunctionExecution(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    function_id = db.Column(db.Integer, db.ForeignKey('function_user.id'))
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    arguments = db.Column(db.JSON)
    result = db.Column(db.Text)
    success = db.Column(db.Boolean)
    timestamp = db.Column(db.DateTime, default=datetime.now(moscow_tz))
    
    function = db.relationship('FunctionUser', backref='executions')
    user = db.relationship('User', backref='function_executions')

class Role(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), default='user', unique=True)
    description = db.Column(db.Text)
    is_admin = db.Column(db.Boolean, default=False)
    permissions = db.Column(db.JSON, default=list)  
    
    functions = db.relationship('FunctionUser', secondary='role_function', backref='roles')
    users = db.relationship('User', secondary=user_roles, back_populates='roles')
    
role_function = db.Table('role_function',
    db.Column('role_id', db.Integer, db.ForeignKey('role.id')),
    db.Column('function_id', db.Integer, db.ForeignKey('function_user.id'))
)

import g4f

g4f.debug.logging = True 
g4f.check_version = False

print(g4f.version)
print(g4f.Provider.Ails.params)

class ChatAI:
    @staticmethod
    def generate_response_stream(prompt: str):
        try:
            response = g4f.ChatCompletion.create(
                model=g4f.models.gpt_4,
                messages=[{"role": "user", "content": prompt}],
                stream=True
            )
            for chunk in response:
                yield str(chunk)
        except Exception as e:
            print(f"Error generating AI response: {e}")
            yield "Произошла ошибка при обработке запроса"

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@login_manager.unauthorized_handler
def unauthorized():
    session['login_redirect'] = True
    return redirect(url_for('main.index') + '#login')

@socketio.on('connect')
def handle_connect():
    if current_user.is_authenticated:
        join_room(str(current_user.id))
        print(f"User {current_user.id} connected to room")

@socketio.on('message')
def handle_message(data):
    try:
        if not current_user.is_authenticated:
            emit('error', {'message': 'Требуется авторизация'})
            return

        chat = Chat.query.filter_by(user_id=current_user.id).first()
        if not chat:
            chat = Chat(user_id=current_user.id)
            db.session.add(chat)
            db.session.commit()
        
        user_msg = Message(content=data['text'], chat=chat)
        db.session.add(user_msg)
        db.session.commit()
        
        emit('message_ack', {
            'temp_id': data.get('temp_id'),
            'id': user_msg.id,
            'success': True,
            'timestamp': datetime.now(moscow_tz).strftime('%H:%M')
        })
        
        # Отправляем индикатор печати
        emit('typing', {'status': True}, room=str(current_user.id))
        
        # Создаем временное сообщение для бота
        temp_msg_id = f"temp_{datetime.now().timestamp()}"
        emit('new_message', {
            'content': "",
            'is_bot': True,
            'id': temp_msg_id,
            'timestamp': datetime.now(moscow_tz).strftime('%H:%M')
        }, room=str(current_user.id))
        
        # Отправляем ответ по частям
        full_response = ""
        for chunk in ChatAI.generate_response_stream(data['text']):
            full_response += chunk
            emit('update_message', {
                'id': temp_msg_id,
                'content': full_response
            }, room=str(current_user.id))
        
        # Убираем индикатор печати
        emit('typing', {'status': False}, room=str(current_user.id))
        
        # Сохраняем финальное сообщение в БД
        bot_msg = Message(content=full_response, chat=chat, is_bot=True)
        db.session.add(bot_msg)
        db.session.commit()
        
        # Обновляем временное сообщение реальным ID
        emit('message_update_id', {
            'temp_id': temp_msg_id,
            'new_id': bot_msg.id
        }, room=str(current_user.id))
        
    except Exception as e:
        print(f"Error: {str(e)}")
        emit('error', {'message': "Ошибка обработки запроса"})
        emit('typing', {'status': False}, room=str(current_user.id))
        
with app.app_context():
    db.create_all()
        
    if not Role.query.filter(Role.name.in_(['user', 'admin'])).count():
        user_role = Role(
            name='user',
            is_admin=False,
            description="Страндртная группа пользователей"
        )
        
        admin_role = Role(
            name='admin',
            is_admin=True,
            description="Группа администрирования сайта"
        )
        
        db.session.add(user_role)
        db.session.add(admin_role)
        db.session.commit()
        print("Роли успешно созданы!")
    else:
        print("Роли уже существуют в базе")
    
@app.before_request
def update_last_activity():
    if current_user.is_authenticated:
        current_user.last_activity = datetime.utcnow()
        db.session.commit()
        
@socketio.on('connect')
def handle_connect():
    if current_user.is_authenticated:
        join_room(str(current_user.id))
        current_user.last_activity = datetime.utcnow()
        db.session.commit()
        emit('user_status', {
            'user_id': current_user.id,
            'status': current_user.status
        }, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    if current_user.is_authenticated:
        emit('user_status', {
            'user_id': current_user.id,
            'status': False
        }, broadcast=True)
        
@socketio.on('execute_function')
def handle_execute_function(data):
    try:
        func = FunctionUser.query.filter_by(name=data['function_name'], approved=True).first()
        if not func:
            raise Exception('Function not found or not approved')
        
        local_vars = {'args': data.get('arguments', {})}
        global_vars = {}
        
        exec(func.code, global_vars, local_vars)
        
        if 'Function' not in global_vars:
            raise Exception('Function class not defined')
            
        instance = global_vars['Function']()
        
        if not hasattr(instance, 'execute') or not callable(instance.execute):
            raise Exception('Function class must have an "execute" method')
        
        result = instance.execute(local_vars['args'])
        
        emit('function_result', {
            'success': True,
            'result': result
        })
        
    except Exception as e:
        emit('function_result', {
            'success': False,
            'error': str(e)
        })