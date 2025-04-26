import os
from pathlib import Path

class Config:
    SECRET_KEY = "Jaom39@0e034I@)Fkp4k[fma[r22fnpf2orp234u@O#$hfsfppoU_#II!{Iossjdfl;msd;rrpf"
    SQLALCHEMY_DATABASE_URI = 'mysql+pymysql://root:Qwerty123!@localhost:3306/project'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    REDIS_URL = "redis://localhost:6379/0"
    
    FUNCTION_MODELS_FOLDER = str(Path(__file__).parent / 'uploads' / 'func_models')
    UPLOAD_FOLDER = str(Path(__file__).parent / 'uploads')
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'txt', 'py', 'json'}
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024 
    YOLO_MODEL_PATH = 'model/yolo11n.pt'