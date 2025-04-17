from flask import render_template, redirect, url_for, request, Blueprint, session, jsonify
from sqlalchemy.exc import SQLAlchemyError
from flask_socketio import join_room, emit
from docker import DockerClient
from flask_login import login_user, login_required, logout_user, current_user
from datetime import datetime
import traceback, json
from limiter import limiter

main = Blueprint('main', __name__)

@main.route('/')
@limiter.limit("10 per minute")
def index():
    if current_user.is_authenticated and not session.pop('login_redirect', False):
        return redirect(url_for('main.profile'))
    
    return render_template('index.html', show_login_modal=session.pop('login_redirect', False))

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
    
    return render_template('profile.html', chat=chat)

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
    from __init__ import FunctionUser, db
    
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
        
        if 'file' in request.files:
            file = request.files['file']
            if file and file.filename.endswith('.py'):
                code = file.read().decode('utf-8')
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
            
        func = FunctionUser(
            name=name,
            code=code,
            user_id=current_user.id,
            approved=False,
            description=description,
            function_type=function_type,
            test_cases=test_cases
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
        test_cases = data.get('test_cases', [])
        
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
            try:
                instance = Function()
                input_data = test_case.get('input', {})
                expected = test_case.get('expected')
                
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
def get_function_interaction(func_id):
    from __init__ import FunctionUser
    
    func = FunctionUser.query.get_or_404(func_id)
    
    if not func.approved:
        return jsonify({"success": False, "error": "Функция не одобрена"}), 403
    
    
    exec_globals = {}
    exec_locals = {}
    try:
        exec(func.code, exec_globals, exec_locals)
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
        "name": func.name,
        "interaction": interaction_info
    })

@main.route('/api/function/execution', methods=['POST'])
@login_required
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
def execute_function(func_id):
    from __init__ import FunctionUser, FunctionExecution, db
    
    func = FunctionUser.query.get_or_404(func_id)
    data = request.json
    args = data.get('arguments', {})
    
    if not func.approved:
        return jsonify({"success": False, "error": "Функция не одобрена"}), 403
    
    if not current_user.has_access_to_function(func_id):
        return jsonify({"success": False, "error": "Нет доступа к этой функции"}), 403
    
    try:
        # Выполняем код функции
        exec_globals = {}
        exec_locals = {}
        exec(func.code, exec_globals, exec_locals)
        
        Function = exec_globals.get('Function') or exec_locals.get('Function')
        if not Function:
            raise Exception("Не найден класс Function")
            
        if not hasattr(Function, 'execute'):
            raise Exception("Класс Function должен содержать метод execute")
            
        instance = Function()
        result = instance.execute(args)
        
        return jsonify({
            "success": True,
            "result": str(result)
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 400