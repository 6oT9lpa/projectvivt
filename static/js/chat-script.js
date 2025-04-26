const socket = io();
let tempIdCounter = 0;

function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (!message) {
        showNotification('Введите сообщение', 'warning');
        return;
    }

    const tempId = `temp_${Date.now()}_${tempIdCounter++}`;
    const tempMsg = {
        content: message,
        isBot: false,
        timestamp: new Date().toLocaleTimeString(),
        tempId: tempId,
        status: 'sending'
    };
    
    addMessage(tempMsg);
    input.value = '';
    
    socket.emit('message', { 
        text: message,
        temp_id: tempId 
    }, (ack) => {
        const msgElement = document.querySelector(`[data-temp-id="${tempId}"]`);
        if (ack) {
            msgElement.dataset.id = ack.id;
            msgElement.classList.remove('sending');
        } else {
            msgElement.classList.add('failed');
            showNotification('Ошибка отправки: ' + (ack.message || 'Попробуйте позже'), 'error');
        }
    });
}

socket.on('error', (data) => {
    showNotification(data.message || 'Произошла ошибка', 'error');
});


function addMessage(data) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageHTML = `
        <div class="message ${data.is_bot ? 'bot-message' : 'user-message'} ${data.status || ''}" 
            data-id="${data.id || ''}" 
            data-temp-id="${data.tempId || ''}">
            <div class="message-avatar">
                <i class="fas fa-${data.is_bot ? 'robot' : 'user'}"></i>
            </div>
            <div class="message-content">
                <div class="message-text">${data.content}</div>
                <div class="message-meta">
                    <span class="message-time">${data.timestamp}</span>
                    ${data.status ? `<span class="message-status">
                        <i class="fas fa-circle-notch fa-spin"></i>
                    </span>` : ''}
                </div>
            </div>
        </div>`;
    
    messagesDiv.insertAdjacentHTML('beforeend', messageHTML);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

socket.on('new_message', (data) => {
    addMessage({
        ...data,
        timestamp: new Date().toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})
    });
});

socket.on('message_ack', (data) => {
    const msgElement = document.querySelector(`[data-temp-id="${data.temp_id}"]`);
    if(msgElement) {
        msgElement.dataset.id = data.id;
        msgElement.querySelector('.message-time').textContent = data.timestamp;
        msgElement.classList.remove('sending');
        msgElement.querySelector('.message-status').remove();
    }
});

socket.on('update_message', (data) => {
    const msgElement = document.querySelector(`[data-id="${data.id}"]`);
    if (msgElement) {
        msgElement.querySelector('.message-text').textContent = data.content;
        msgElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
});

socket.on('message_update_id', (data) => {
    const msgElement = document.querySelector(`[data-id="${data.temp_id}"]`);
    if (msgElement) {
        msgElement.dataset.id = data.new_id;
    }
});

socket.on('typing', (data) => {
    const typingIndicator = document.getElementById('typingIndicator');
    if (data.status) {
        if (!typingIndicator) {
            const indicator = `
                <div class="typing-indicator" id="typingIndicator">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <span>AI печатает...</span>
                </div>`;
            document.getElementById('chatMessages').insertAdjacentHTML('beforeend', indicator);
            document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
        }
    } else {
        typingIndicator?.remove();
    }
});

let selectedFunctionId = null;
let selectedFunctionInfo = null;

function selectFunction(select) {
    const functionId = select.value;
    const container = document.getElementById('functionContainer');
    
    selectedFunctionId = null;
    selectedFunctionInfo = null;

    if (!functionId) {
        container.innerHTML = '<p class="empty-state">Выберите модуль из списка</p>';
        container.classList.remove('loading');
        return;
    }
    
    container.classList.add('loading');
    container.innerHTML = `
        <div class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Загрузка модуля...</p>
        </div>
    `;
    
    fetch(`/api/function/${functionId}/interaction`)
    .then(response => {
        if (response.ok) {
            return response.json();
        }

        switch(response.status) {
            case 404:
                throw new Error('Модуль не найден');
            case 429:
                throw new Error('Слишком много запросов. Попробуйте позже');
            case 403:
                throw new Error('Модуль ссейчас не доступен');
            default:
                throw new Error(`Ошибка сервера (${response.status})`);
        }
    })
    .then(data => {
        container.classList.remove('loading');
        if (data.success) {
            selectedFunctionId = functionId;
            selectedFunctionInfo = {
                id: functionId,
                name: data.name,
                interaction: data.interaction
            };
            
            renderFunctionInterface(data, container);
        } else {
            showNotification(data.error || 'Неизвестная ошибка модуля', 'error');
        }
    })
    .catch(error => {
        container.classList.remove('loading');
        
        let icon = 'fa-exclamation-triangle';
        let errorClass = 'error-message';
        
        if (error.message.includes('позже')) {
            icon = 'fa-clock';
            errorClass = 'error-message-warning';
        } else if (error.message.includes('не найден')) {
            icon = 'fa-search';
            errorClass = 'error-message-not-found';
        } else if (error.message.includes('Доступ')) {
            icon = 'fa-lock';
            errorClass = 'error-message-access';
        }
        
        container.innerHTML = `
            <div class="${errorClass}">
                <i class="fas ${icon}"></i>
                <p>${error.message}</p>
                ${error.message.includes('позже') ? 
                    '<button class="retry-btn" onclick="selectFunction(document.getElementById(\'functionSelect\'))">Попробовать снова</button>' : 
                    ''}
            </div>
        `;
    });
}

function renderFunctionInterface(data, container) {
    let html;
    if (data && data.name && data.interaction && data.interaction.usage) { 
        html = `
            <div class="function-header">
                <h3><i class="fab fa-python"></i> ${data.name}</h3>
                <p class="function-description">${data.interaction.description}</p>
            </div>
            <div class="function-inputs">
                ${generateInputFields(data.interaction.usage)}
        `;
    
        if (data.interaction.file_upload?.allowed) {
            html += `
                <div class="input-group file-upload-group">
                    <label>Загрузить файл: <small>${data.interaction.file_upload.types.join(', ')}</small></label>
                    <div class="file-upload-wrapper">
                        <label class="cyber-upload-btn">
                            <i class="fas fa-cloud-upload-alt"></i> Выберите файл
                            <input type="file" id="functionFileInput" 
                                accept="${data.interaction.file_upload.types.join(',')}" 
                                ${data.interaction.file_upload.multiple ? 'multiple' : ''}
                                style="display: none;">
                        </label>
                        <div id="filePreview"></div>
                    </div>
                </div>
            `;
        }
        
        html += `</div>`;
    } else {
        console.error("Некорректные данные функции:", data);
        container.innerHTML = "<p class='error-message'>Ошибка: Некорректные данные функции</p>";
    }
    
    const executeBtn = document.createElement('button');
    executeBtn.className = 'execute-btn';
    executeBtn.innerHTML = '<i class="fas fa-play"></i> Выполнить';
    executeBtn.onclick = () => {
        executeSelectedFunction(data, container);
    };
    
    container.innerHTML = html;
    container.appendChild(executeBtn);
    
    const fileInput = document.getElementById('functionFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
}

function executeSelectedFunction(data, container) {
    const inputs = container.querySelectorAll('input:not([type="file"]), textarea');
    const args = {};
    inputs.forEach(input => {
        args[input.name] = input.value;
    });
    
    const fileInput = container.querySelector('input[type="file"]');
    if (fileInput && fileInput.files.length > 0) {
        uploadFiles(data.id, fileInput.files, args, container);
    } else {
        executeFunction(data.id, args, container);
    }
}

function handleFileSelect(event) {
    const files = event.target.files;
    const preview = document.getElementById('filePreview');
    preview.innerHTML = '';
    
    if (files.length > 0) {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const previewItem = document.createElement('div');
            previewItem.className = 'file-preview-item';
            previewItem.innerHTML = `
                <i class="fas fa-file"></i>
                <span>${file.name}</span>
                <small>${(file.size / 1024).toFixed(1)} KB</small>
            `;
            preview.appendChild(previewItem);
        }
    }
}

function handleExecutionResult(container, result, isSuccess) {
    const progressDiv = container.querySelector('.execution-progress');
    if (progressDiv) progressDiv.remove();
    
    const resultDiv = document.createElement('div');
    resultDiv.className = 'execution-result';
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = isSuccess ? 
        `<h4>Результат выполнения:</h4><div>${formatResult(result)}</div>` :
        `<h4 style="color: #ff4444;">Ошибка выполнения:</h4><div>${result.error || result}</div>`;
    
    container.appendChild(resultDiv);
    
    const executeBtn = container.querySelector('.execute-btn');
    executeBtn.style.display = 'flex';
    executeBtn.innerHTML = '<i class="fas fa-redo"></i> Выполнить снова';
}

function formatResult(result) {
    if (typeof result === 'string') {
        try {
            result = JSON.parse(result);
        } catch (e) {
            return result;
        }
    }
    
    if (typeof result !== 'object') return String(result);
    if (result.detected_objects) {
        return formatYoloResult(result);
    }
    
    let html = '<div class="result-content">';
    for (const [key, value] of Object.entries(result)) {
        html += `<p><strong>${key}:</strong> ${JSON.stringify(value)}</p>`;
    }
    html += '</div>';
    
    return html;
}

function formatYoloResult(result) {
    let html = `<div class="yolo-detection">
        <h5>Обнаруженные объекты (${result.detected_objects.length}):</h5>`;
    
    result.detected_objects.forEach(obj => {
        html += `<div class="yolo-object">
            <span>${obj.class}</span>
            <span>${(obj.confidence * 100).toFixed(1)}%</span>
        </div>`;
    });
    
    if (result.output_image) {
        const imageUrl = `/uploads/${result.output_image.replace(/\\/g, '/')}`;
        html += `<div class="image-preview">
            <img src="${imageUrl}" alt="Результат обнаружения" 
                style="max-width: 100%; margin-top: 1rem; cursor: pointer;"
                onclick="expandImage(this)">
        </div>`;
    }
    
    return html;
}

function expandImage(imgElement) {
    let modal = document.getElementById('imageModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'imageModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <span class="close">&times;</span>
            <img class="modal-content-img" id="expandedImage">
        `;
        document.body.appendChild(modal);
        
        const style = document.createElement('style');
        style.textContent = `
            .modal {
                display: none;
                position: fixed;
                z-index: 1001;
                padding-top: 60px;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0,0,0,0.9);
            }
            .modal-content-img {
                margin: auto;
                display: block;
                max-width: 90%;
                max-height: 80vh;
                border: var(--cyber-border);
                box-shadow: 0 0 10px 2px #8f8f8f;
                border-radius: var(--border-radius);
            }
            .close {
                position: absolute;
                top: 15px;
                right: 35px;
                color: #fababa;
                font-size: 40px;
                font-weight: bold;
                cursor: pointer;
            }
            .close:hover {
                color: #bbb;
            }
        `;
        document.head.appendChild(style);
    }
    
    const modalImg = document.getElementById('expandedImage');
    const captionText = document.getElementById('caption');
    
    modal.style.display = 'block';
    modalImg.src = imgElement.src;
    
    document.querySelector('.close').onclick = function() {
        modal.style.display = 'none';
    }
    
    modal.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    }
    
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && modal.style.display === 'block') {
            modal.style.display = 'none';
        }
    });
}

function generateInputFields(usage) {
    let html = '';
    for (const [param, desc] of Object.entries(usage)) {
        html += `
            <div class="input-group">
                <label>${desc}</label>
                <input type="text" name="${param}" placeholder="Введите ${param}" class="cyber-input">
            </div>
        `;
    }
    return html;
}

function saveFunctionExecution(funcId, args, result, isSuccess) {
    fetch('/api/function/execution', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            function_id: funcId,
            arguments: args,
            result: typeof result === 'object' ? JSON.stringify(result) : result,
            success: isSuccess
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Execution saved:', data);
    })
    .catch(error => {
        console.error('Error saving execution:', error);
    });
}

function executeSelectedFunction(data, container) {
    const inputs = container.querySelectorAll('input:not([type="file"]), textarea');
    const args = {};
    inputs.forEach(input => {
        args[input.name] = input.value;
    });

    const previousResultDiv = container.querySelector('.execution-result');
    if (previousResultDiv) {
        previousResultDiv.remove();
    }

    const executeBtn = container.querySelector('.execute-btn');
    executeBtn.style.display = 'none';

    const progressDiv = document.createElement('div');
    progressDiv.className = 'execution-progress';
    progressDiv.innerHTML = `
        <i class="fas fa-spinner fa-spin"></i>
        <p>Выполняется обработка...</p>
    `;
    container.appendChild(progressDiv);

    const fileInput = container.querySelector('input[type="file"]');
    const executeFunc = fileInput && fileInput.files.length > 0 ?
        () => uploadFiles(data.id, fileInput.files, args, container) :
        () => executeFunction(data.id, args, container);

    executeFunc();
}

function executeFunction(funcId, args, container) {
    fetch(`/api/function/${selectedFunctionId}/execute`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ arguments: args })
    })
    .then(response => response.json())
    .then(data => {
        handleExecutionResult(container, data.success ? data.result : data, data.success);
    })
    .catch(error => {
        handleExecutionResult(container, { error: error.message }, false);
    });
}

function uploadFiles(funcId, files, args, container) {
    const formData = new FormData();
    Array.from(files).forEach(file => formData.append('files', file));
    formData.append('arguments', JSON.stringify(args));
    
    fetch(`/api/function/${selectedFunctionId}/execute`, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        handleExecutionResult(container, data.success ? data.result : data, data.success);
    })
    .catch(error => {
        handleExecutionResult(container, { error: error.message }, false);
    });
}