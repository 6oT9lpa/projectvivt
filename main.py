from flask import render_template, redirect, url_for, request, Blueprint, session, jsonify, send_from_directory
from sqlalchemy.exc import SQLAlchemyError
from flask_socketio import join_room, emit
from flask_login import login_user, login_required, logout_user, current_user
import traceback, json
from limiter import limiter
import os
from werkzeug.utils import secure_filename
from PIL import Image
from PIL import Image, ImageDraw

main = Blueprint('main', __name__)

def allowed_file(filename):
    from __init__ import app
    
    return '.' in filename and \
        filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

@main.route('/')
@limiter.limit("10 per minute")
def index():
    if current_user.is_authenticated and not session.pop('login_redirect', False):
        return redirect(url_for('main.profile'))
    
    return render_template('index.html', show_login_modal=session.pop('login_redirect', False))

@main.route('/function/<int:func_id>/edit')
@login_required
@limiter.limit("10 per minute")
def edit_function_page(func_id):
    from __init__ import FunctionUser, app
    
    function = FunctionUser.query.get_or_404(func_id)
    filepath = os.path.join(app.config['FUNCTION_MODELS_FOLDER'], function.code)
    with open(filepath, 'r', encoding='utf-8') as f:
        code_content = f.read()
    
    return render_template('function_editor.html', func=function, code_content=code_content)

@main.route('/auth', methods=['GET'])
@limiter.limit("10 per minute")
def auth():
    if current_user.is_authenticated:
        next_url = request.args.get('next') or url_for('main.profile')
        return redirect(next_url)
    
    return render_template('auth.html')

@main.route('/login', methods=['POST'])
@limiter.limit("3 per minute")
def login():
    if current_user.is_authenticated:
        next_url = request.args.get('next') or url_for('main.profile')
        return redirect(next_url)
    
    from __init__ import User
    data = request.get_json()
    
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({
            "success": False,
            "message": "Неверные данные для входа."
        })
        
    user = User.query.filter_by(username=username).first()
    
    if user and user.check_password(password):
        login_user(user)
        next_url = url_for('main.profile')
        print(next_url)
        return jsonify({
            "success": True,
            "message": "Вы успешно вошли в аккаунт.",
            "next": next_url
        })
    else:
        return jsonify({
            "success": False,
            "message": "Неверные данные для входа."
        })

@main.route('/register', methods=['POST'])
@limiter.limit("3 per minute")
def register():
    if current_user.is_authenticated:
        next_url = request.args.get('next') or url_for('main.profile')
        return redirect(next_url)
    
    from __init__ import User, db, Chat, Role
    data = request.get_json()
    
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    c_password = data.get('c_password')
    if not username or not email or not password or not c_password:
        return jsonify({
            "success": False,
            "message": "Неверные данные для регистрации."
        })

    if password != c_password:
        return jsonify({
            "success": False,
            "message": "Пароли не совпадают."
        })
    
    if User.query.filter_by(username=username).first():
        return jsonify({
            "success": False,
            "message": "Пользователь с таким именем уже существует."
        })
    
    if User.query.filter_by(email=email).first():
        return jsonify({
            "success": False,
            "message": "Пользователь с такой почтой уже существует."
        })

    try:
        new_roles = Role.query.filter(Role.id == 1).all()
        new_user = User(
            username=username,
            email=email,
            roles = new_roles
        )
        new_user.set_password(password)
        
        db.session.add(new_user)
        db.session.commit()
        
        chat = Chat(user_id=new_user.id)
        db.session.add(chat)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Вы успешно зарегистрировались."
        })
        
    except SQLAlchemyError as e:
        db.session.rollback()
        print(f'Ошибка при создании пользователя: {e}')
        return jsonify({
            "success": False,
            "message": "Произошла ошибка при создании пользователя."
        })

@main.route('/profile')
@login_required
@limiter.limit("10 per minute")
def profile():
    from __init__ import Chat, FunctionUser
    chat = Chat.query.filter_by(user_id=current_user.id).first()
    
    show_all = any(role.is_admin for role in current_user.roles)
    
    return render_template('profile.html', chat=chat, show_all_functions=show_all)

@main.route('/logout', methods=['GET', 'POST'])
@login_required
def logout():
    logout_user()
    return jsonify({
            "success": True,
            "message": f"Вы вышли с аккаунта.",
        }), 200
    

@main.route('/admin-panel')
@login_required
@limiter.limit("10 per minute")
def admin_panel():
    if not current_user.is_authenticated:
        return redirect(url_for('main.index'))
    
    from __init__ import User, Role, FunctionUser, db
    
    users = User.query.options(db.joinedload(User.roles)).all()
    
    users_list = []
    for user in users:
        user_data = {
            'id': user.id,
            'username': user.username,
            'status': user.status,
            'registered_at': user.registered_at,
            'email': user.email,
            'roles': [{'id': role.id, 'name': role.name} for role in user.roles]
        }
        users_list.append(user_data)
    
    roles = Role.query.all()
    functions = FunctionUser.query.all()
    
    return render_template('admin_panel.html', users=users_list, roles=roles, functions=functions)

@main.route('/get-user-data/<int:user_id>', methods=['GET'])
@login_required
@limiter.limit("10 per minute")
def get_user_data(user_id):
    from __init__ import User, FunctionUser
    
    user = User.query.get_or_404(user_id)
    functions_count = FunctionUser.query.filter_by(user_id=user_id).count()
    
    return jsonify({
        'id': user.id,
        'name': user.username,
        'roles': [role.id for role in user.roles], 
        'func': functions_count
    })
    
@main.route('/update-user/<int:user_id>', methods=['PUT'])
@login_required
@limiter.limit("3 per minute")
def update_user(user_id):
    from __init__ import User, Role, db
    
    user = User.query.get(user_id)
    role_ids = request.json.get('roles', [])
    
    if not user:
        return jsonify({"success": False, "message": "Пользователь не найден"}), 404
    
    new_roles = Role.query.filter(Role.id.in_(role_ids)).all()
    user.roles = new_roles
    db.session.commit()
    
    return jsonify({
        "success": True,
        "message": "Роли пользователя обновлены"
    })

@main.route('/admin/check-status')
@login_required
def check_status():
    from __init__ import User
    users = User.query.all()
    return jsonify([{
        'id': u.id,
        'status': u.status
    } for u in users])

@main.route('/api/roles', methods=['GET'])
@login_required
@limiter.limit("10 per minute")
def get_all_roles():
    from __init__ import Role
    roles = Role.query.all()
    return jsonify([{
        'id': role.id,
        'name': role.name,
        'description': role.description,
        'is_admin': role.is_admin,
    } for role in roles])

@main.route('/api/role/<int:role_id>', methods=['GET'])
@login_required
@limiter.limit("10 per minute")
def update_role(role_id):
    from __init__ import Role
    
    if not current_user.is_authenticated:
        return redirect(url_for('main.index'))
    
    role = Role.query.get_or_404(role_id)

    return jsonify({
        'id': role.id,
        'name': role.name,
        'is_admin': role.is_admin,
        'permissions': role.permissions or [],
        'description': role.description,
        'functions': [{
            'id': f.id, 
            'name': f.name,
            'approved': f.approved 
        } for f in role.functions]
    })
    
@main.route('/api/role/<int:role_ids>', methods=['DELETE'])
@login_required
@limiter.limit("3 per minute")
def delete_role(role_ids):
    from __init__ import Role, db, User
    
    if not current_user.is_authenticated:
        return redirect(url_for('main.index'))
    
    if not current_user.role.is_admin:
        return jsonify({'error': 'У вас нет доступа для удаления роли!'}), 403
    
    if role_ids == 1:
        return jsonify({'error': 'Вы не можете удалить default роль!'}), 403
    
    role = Role.query.get_or_404(role_ids)
    users = User.query.filter(User.role_id == role_ids).all()
    for user in users:
        user.role_id = 1
    
    db.session.delete(role)
    db.session.commit()
    
    return jsonify({'status': 'success'})

@main.route('/api/role', methods=['POST'])
@main.route('/api/role/<int:role_id>', methods=['PUT'])
@login_required
@limiter.limit("3 per minute")
def handle_role(role_id=None):
    from __init__ import Role, FunctionUser, db
    
    data = request.json
    if role_id:  
        role = Role.query.get_or_404(role_id)
        role.name = data['name']
        role.is_admin = data['is_admin']
    else:  
        role = Role(
            name=data['name'],
            is_admin=data['is_admin'],
            permissions=[]
        )
    
    function_ids = [int(fid) for fid in data.get('functions', [])]
    role.permissions = function_ids 
    
    if role_id:
        role.functions = []
        db.session.commit()
        
    for fid in function_ids:
        func = FunctionUser.query.get(fid)
        if func:
            role.functions.append(func)
    
    db.session.add(role)
    db.session.commit()
    return jsonify(success=True)

@main.route('/api/function', methods=['POST'])
@login_required
@limiter.limit("3 per minute")
def create_function():
    from __init__ import FunctionUser, db, app
    
    try:
        name = request.form.get('name')
        code = request.form.get('code')
        description = request.form.get('description')
        function_type = request.form.get('function_type')
        test_cases = request.form.get('test_cases', [])
        
        if not description:
            return jsonify({"success": False, "error": "Описание функции отсутствует"}), 400
        
        if function_type not in ["text/code", "image", "link"]:
            return jsonify({"success": False, "error": "Тип функции не соответсвует"}), 400
        
        os.makedirs(app.config['FUNCTION_MODELS_FOLDER'], exist_ok=True)
        
        existing_files = os.listdir(app.config['FUNCTION_MODELS_FOLDER'])
        file_number = len(existing_files) + 1
        filename = f"func_model{file_number:02d}.py"
        filepath = os.path.join(app.config['FUNCTION_MODELS_FOLDER'], filename)
        
        if 'file' in request.files:
            file = request.files['file']
            if file and file.filename.endswith('.py'):
                code = file.read().decode('utf-8')
                code = code.replace('\r\n', '\n').replace('\r', '\n')
                name = name or file.filename[:-3]
        
        if not name or not code:
            return jsonify({'error': 'Name and code are required'}), 400
            
        exec_globals = {}
        exec_locals = {}
        try:
            exec(code, exec_globals, exec_locals)
        except SyntaxError as e:
            return jsonify({
                "success": False,
                "error": f"Синтаксическая ошибка: {str(e)}",
                "line": e.lineno,
                "offset": e.offset
            }), 400
        except Exception as e:
            return jsonify({
                "success": False,
                "error": f"Ошибка выполнения: {str(e)}",
                "traceback": traceback.format_exc()
            }), 400
        
        Function = exec_globals.get('Function') or exec_locals.get('Function')
        
        if not Function:
            return jsonify({
                "success": False,
                "error": "Не найден класс Function",
                "required": "class Function:\n    def interactionUser(self): ..."
            }), 400
        
        if not hasattr(Function, 'interactionUser') or not callable(Function.interactionUser):
            return jsonify({
                "success": False,
                "error": "Класс Function должен содержать метод interactionUser(self)",
                "example": "class Function:\n    def interactionUser(self):\n        return args"
            }), 400
            
        try:
            interaction_info = Function().interactionUser()
            if not isinstance(interaction_info, dict):
                return jsonify({"success": False, "error": "Метод interactionUser должен возвращать словарь"}), 400
        except Exception as e:
            return jsonify({"success": False, "error": f"Ошибка выполнения interactionUser: {str(e)}"}), 400
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(code)
        
        func = FunctionUser(
            name=name,
            code=filename,  
            user_id=current_user.id,
            approved=False,
            description=description,
            function_type=function_type,
            test_cases=test_cases.replace('\r\n', '').replace('\r', '') if test_cases != '' else []
        )
        db.session.add(func)
        db.session.commit()
        
        return jsonify({'success': True, 'id': func.id})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@main.route('/api/function/<int:func_id>', methods=['DELETE'])
@login_required
@limiter.limit("3 per minute")
def delete_function(func_id):
    from __init__ import FunctionUser, db, Role
    
    func = FunctionUser.query.get_or_404(func_id)
    
    roles = Role.query.filter(Role.functions.any(id=func_id)).all()
    for role in roles:
        role.functions.remove(func)
    
    db.session.delete(func)
    db.session.commit()
    
    return jsonify({
        "success": True,
        "message": "Функция удалена"
    })

@main.route('/function/<int:func_id>')
@login_required
@limiter.limit("5 per minute")
def view_function(func_id):
    from __init__ import FunctionUser
    func = FunctionUser.query.get_or_404(func_id)
    return render_template('function_editor.html', function=func, view_only=True)

@main.route('/api/function/<int:func_id>', methods=['PUT'])
@login_required
@limiter.limit("3 per minute")
def update_function(func_id):
    from __init__ import FunctionUser, db, app
    import os
    
    func = FunctionUser.query.get_or_404(func_id)
    data = request.json
    new_code = data['code']
    
    if 'description' in data:
        func.description = data['description']
    
    try:
        if 'code' in data:
            exec_globals = {}
            exec_locals = {}
            exec(new_code, exec_globals, exec_locals)
            
            Function = exec_globals.get('Function') or exec_locals.get('Function')
            if not Function:
                return jsonify({"success": False, "error": "Не найден класс Function"}), 400
                
            if not hasattr(Function, 'interactionUser') or not callable(Function.interactionUser):
                return jsonify({"success": False, "error": "Класс Function должен содержать метод interactionUser"}), 400
            
            if not hasattr(Function, 'execute') or not callable(Function.execute):
                return jsonify({"success": False, "error": "Класс Function должен содержать метод execute"}), 400
                
            interaction_info = Function().interactionUser()
            if not isinstance(interaction_info, dict):
                return jsonify({"success": False, "error": "Метод interactionUser должен возвращать словарь"}), 400
            
            filename = func.code
            filepath = os.path.join(app.config['FUNCTION_MODELS_FOLDER'], filename)
            
            try:
                with open(filepath, 'w+', encoding='utf-8') as f:
                    f.write(new_code)
            except Exception as e:
                return jsonify({"success": False, "error": f"Ошибка записи в файл: {str(e)}"}), 500
    
        db.session.commit()
        return jsonify({"success": True})
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 400

@main.route('/api/function/<int:func_id>/toggle', methods=['POST'])
@login_required
@limiter.limit("3 per minute")
def toggle_function_status(func_id):
    from __init__ import FunctionUser, db
    
    func = FunctionUser.query.get_or_404(func_id)
    func.approved = not func.approved
    db.session.commit()
    
    return jsonify({
        "success": True,
        "new_status": func.approved
    })
    
@main.route('/api/function/test', methods=['POST'])
@login_required
@limiter.limit("3 per minute")
def test_function():
    try:
        data = request.json
        code = data.get('code')
        test_cases = data.get('test_case', [])
        
        if not code:
            return jsonify({"success": False, "error": "Код функции отсутствует"}), 400
        
        exec_globals = {}
        exec_locals = {}
        
        try:
            exec(code, exec_globals, exec_locals)
        except SyntaxError as e:
            return jsonify({
                "success": False,
                "error": f"Синтаксическая ошибка: {str(e)}",
                "line": e.lineno,
                "offset": e.offset
            }), 400
        except Exception as e:
            return jsonify({
                "success": False,
                "error": f"Ошибка выполнения: {str(e)}",
                "traceback": traceback.format_exc()
            }), 400
        
        Function = exec_globals.get('Function') or exec_locals.get('Function')
        
        if not Function:
            return jsonify({
                "success": False,
                "error": "Не найден класс Function",
                "required": "class Function:\n    def execute(self, args): ..."
            }), 400
        
        if not hasattr(Function, 'execute') or not callable(Function.execute):
            return jsonify({
                "success": False,
                "error": "Класс Function должен содержать метод execute(self, args)",
                "example": "class Function:\n    def execute(self, args):\n        return args"
            }), 400
        
        results = []
        for test_case in test_cases:
            instance = Function()
            input_data = test_case.get('input', {})
            expected = test_case.get('expected')
            try:
                result = instance.execute(input_data)
                
                passed = (expected is None) or (str(result) == str(expected))
                
                results.append({
                    "input": json.dumps(input_data),
                    "output": json.dumps(result),
                    "expected": json.dumps(expected) if expected else "None",
                    "passed": passed,
                    "error": None
                })
                
            except Exception as e:
                results.append({
                    "input": input_data,
                    "output": None,
                    "expected": expected,
                    "passed": False,
                    "error": str(e),
                    "traceback": traceback.format_exc()
                })

        return jsonify({
            "success": True,
            "results": results,
            "stats": {
                "total": len(results),
                "passed": sum(1 for r in results if r['passed']),
                "failed": sum(1 for r in results if not r['passed'])
            }
        })
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Внутренняя ошибка сервера: {str(e)}",
            "traceback": traceback.format_exc()
        }), 500
        
@main.route('/api/function/<int:func_id>/interaction', methods=['GET'])
@login_required
@limiter.limit("8 per minute")
def get_function_interaction(func_id):
    from __init__ import FunctionUser, app
    
    func= FunctionUser.query.get_or_404(func_id)
    filepath = os.path.join(app.config['FUNCTION_MODELS_FOLDER'], func.code)
    with open(filepath, 'r', encoding='utf-8') as f:
        code_content = f.read()
    
    if not func.approved:
        return jsonify({"success": False, "error": "Функция не одобрена"}), 403   
    
    exec_globals = {}
    exec_locals = {}
    try:
        exec(code_content, exec_globals, exec_locals)
    except SyntaxError as e:
        return jsonify({
            "success": False,
            "error": f"Синтаксическая ошибка: {str(e)}",
            "line": e.lineno,
            "offset": e.offset
        }), 400
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Ошибка выполнения: {str(e)}",
            "traceback": traceback.format_exc()
        }), 400
    
    Function = exec_globals.get('Function') or exec_locals.get('Function')
    
    if not Function:
        return jsonify({"success": False, "error": "Некорректный формат функции"}), 400
    
    interaction_info = Function().interactionUser()
    return jsonify({
        "success": True,
        "id": func_id,
        "name": func.name,
        "interaction": interaction_info
    })

@main.route('/api/function/execution', methods=['POST'])
@login_required
@limiter.limit("3 per minute")
def save_function_execution():
    from __init__ import FunctionExecution, db
    
    data = request.json
    func_id = data.get('function_id')
    args = data.get('arguments')
    result = data.get('result')
    is_success = data.get('success', False)
    
    if not func_id or not args:
        return jsonify({"success": False, "error": "Недостаточно данных"}), 400
    
    execution = FunctionExecution(
        function_id=func_id,
        user_id=current_user.id,
        arguments=args,
        result=str(result),
        success=is_success
    )
    
    db.session.add(execution)
    db.session.commit()
    
    return jsonify({"success": True})

@main.route('/api/function/<int:func_id>/execute', methods=['POST'])
@login_required
@limiter.limit("3 per minute")
def execute_function(func_id):
    from __init__ import FunctionUser, app
    import os
    from werkzeug.utils import secure_filename
    
    func = FunctionUser.query.get_or_404(func_id)

    if not func.approved:
        return jsonify({"success": False, "error": "Функция не одобрена"}), 403
    
    if not current_user.has_access_to_function(func_id):
        return jsonify({"success": False, "error": "Нет доступа к этой функции"}), 403
    
    try:
        files = request.files.getlist('files')
        args = {}
        
        uploaded_files = []
        if files and files[0].filename != '':
            args = json.loads(request.form.get('arguments', '{}'))
            
            upload_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'yolo_detect')
            os.makedirs(upload_folder, exist_ok=True)
            
            for file in files:
                if file and allowed_file(file.filename):
                    filename = secure_filename(file.filename)
                    filepath = os.path.join(upload_folder, filename)
                    try:
                        file.save(filepath)
                        uploaded_files.append(filepath)
                    except Exception as e:
                        return jsonify({"success": False, "error": f"Ошибка сохранения файла: {str(e)}"}), 500
                elif file:
                    return jsonify({"success": False, "error": f"Недопустимый тип файла: {file.filename}"}), 400
        else:
            args = request.get_json().get('arguments', {})
        
        print(args)
        
        if uploaded_files:
            args['img_paths'] = uploaded_files 
        
        filepath = os.path.join(app.config['FUNCTION_MODELS_FOLDER'], func.code)
        
        with open(filepath, 'r', encoding='utf-8') as f:
            code = f.read()
        
        exec_globals = {}
        exec_locals = {}
        exec(code, exec_globals, exec_locals)
        
        Function = exec_globals.get('Function') or exec_locals.get('Function')
        if not Function:
            raise Exception("Не найден класс Function")
            
        if not hasattr(Function, 'execute'):
            raise Exception("Класс Function должен содержать метод execute")
            
        instance = Function()
        result = instance.execute(args)
        
        if isinstance(result, dict):
            for key, value in result.items():
                if isinstance(value, str) and app.config['UPLOAD_FOLDER'] in value:
                    result[key] = value.replace(app.config['UPLOAD_FOLDER'], 'uploads').replace('\\', '/')
                elif isinstance(value, list): 
                    result[key] = [item.replace(app.config['UPLOAD_FOLDER'], 'uploads').replace('\\', '/') if isinstance(item, str) and app.config['UPLOAD_FOLDER'] in item else item for item in value]
        
        return jsonify({
            "success": True,
            "result": result
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 400
        
@main.route('/uploads/<path:filename>')
@limiter.limit("10 per minute")
def uploaded_file(filename):
    from __init__ import app
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@main.route('/api/function/executions', methods=['GET'])
@login_required
@limiter.limit("10 per minute")
def get_function_executions():
    from __init__ import FunctionExecution, FunctionUser, db
    executions = (db.session.query(FunctionExecution, FunctionUser)
                .join(FunctionUser, FunctionExecution.function_id == FunctionUser.id)
                .filter(FunctionExecution.user_id == current_user.id)
                .order_by(FunctionExecution.timestamp.desc())
                .limit(20)
                .all())
    
    result = []
    for execution, func in executions:
        try:
            parsed_result = json.loads(execution.result)
            display_result = parsed_result.get('message', str(parsed_result))
        except:
            display_result = execution.result
        
        result.append({
            'id': execution.id,
            'function': {
                'id': func.id,
                'name': func.name
            },
            'arguments': execution.arguments,
            'result': display_result,
            'success': execution.success,
            'timestamp': execution.timestamp.isoformat()
        })
    
    return jsonify({
        "success": True,
        "executions": result
    })