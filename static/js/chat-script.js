const socket = io();
let tempIdCounter = 0;

function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (!message) {
        showNotification('Введите сообщение', 'warning');
        return;
    }

    if (selectedFunctionId) {
        executeSelectedFunction(message);
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
        if (ack.success) {
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

    console.log(data);

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

socket.on('typing', (data) => {
    const typingIndicator = document.getElementById('typingIndicator');
    if(data.status) {
        if(!typingIndicator) {
            const indicator = `
                <div class="typing-indicator" id="typingIndicator">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <span>AI печатает...</span>
                </div>`;
            document.getElementById('chatMessages').insertAdjacentHTML('beforeend', indicator);
        }
    } else {
        typingIndicator?.remove();
    }
});


let selectedFunctionId = null;
let selectedFunctionInfo = null;

function selectFunction(select) {
    selectedFunctionId = select.value;
    
    if (selectedFunctionId) {
        fetch(`/api/function/${selectedFunctionId}/interaction`)
            .then(response => {
                if (!response.ok) throw new Error('Ошибка получения информации о функции');
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    selectedFunctionInfo = data;
                    
                    const messagesDiv = document.getElementById('chatMessages');
                    
                    // Удаляем предыдущие поля ввода, если они есть
                    const existingInputs = document.querySelector('.function-input-container');
                    if (existingInputs) existingInputs.remove();
                    
                    // Создаем контейнер для полей ввода
                    const inputContainer = document.createElement('div');
                    inputContainer.className = 'function-input-container';
                    inputContainer.innerHTML = `
                        <div class="message bot-message">
                            <div class="message-avatar">
                                <i class="fas fa-robot"></i>
                            </div>
                            <div class="message-content">
                                <div class="message-text">
                                    <h4>Параметры функции: ${data.name}</h4>
                                    ${generateInputFields(data.interaction.usage)}
                                </div>
                            </div>
                        </div>
                    `;
                    
                    const executeBtn = document.createElement('button');
                    executeBtn.className = 'cyber-btn';
                    executeBtn.innerHTML = '<i class="fas fa-play"></i> Выполнить';
                    executeBtn.onclick = () => {
                        const inputs = inputContainer.querySelectorAll('input, textarea');
                        const args = {};
                        inputs.forEach(input => {
                            args[input.name] = input.value;
                        });
                        executeSelectedFunction(args);
                    };

                    inputContainer.querySelector('.message-content').appendChild(executeBtn);
                    messagesDiv.appendChild(inputContainer);
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                } else {
                    showNotification(data.error || 'Ошибка загрузки информации о функции', 'error');
                }
            })
            .catch(error => {
                showNotification(error.message, 'error');
                selectedFunctionId = null;
                document.getElementById('functionSelect').value = '';
            });
    }
}

function generateInputFields(usage) {
    let html = '';
    for (const [param, desc] of Object.entries(usage)) {
        html += `
            <div class="input-group">
                <label>${param}: <small>${desc}</small></label>
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
            result: result,
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

function executeSelectedFunction(args) {
    try {
        if (typeof args === 'string') {
            try {
                args = JSON.parse(args);
            } catch (e) {
                args = {input: args};
            }
        }

        const tempId = `temp_${Date.now()}_${tempIdCounter++}`;
        const messagesDiv = document.getElementById('chatMessages');
        
        // Сохраняем ID функции перед сбросом
        const currentFuncId = selectedFunctionId;
        
        addMessage({
            content: `Выполнение функции: ${selectedFunctionInfo.name}`,
            is_bot: false,
            timestamp: new Date().toLocaleTimeString(),
            tempId: tempId,
            status: 'sending'
        });

        fetch(`/api/function/${currentFuncId}/execute`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                arguments: args,
                temp_id: tempId
            })
        })
        .then(response => response.json())
        .then(data => {
            const msgElement = document.querySelector(`[data-temp-id="${tempId}"]`);
            if (msgElement) {
                msgElement.classList.remove('sending');
                msgElement.querySelector('.message-status').remove();
                console.log(data);
                if (data.success) {
                    addMessage({
                        content: data.result,
                        is_bot: true,
                        timestamp: new Date().toLocaleTimeString()
                    });
                    saveFunctionExecution(currentFuncId, args, data.result, true);
                } else {
                    addMessage({
                        content: `Ошибка выполнения: ${data.error}`,
                        is_bot: true,
                        timestamp: new Date().toLocaleTimeString()
                    });
                    saveFunctionExecution(currentFuncId, args, data.error, false);
                }
            }
        })
        .catch(error => {
            const msgElement = document.querySelector(`[data-temp-id="${tempId}"]`);
            if (msgElement) {
                msgElement.querySelector('.message-status').remove();
                msgElement.classList.remove('sending');
                addMessage({
                    content: `Ошибка сети: ${error.message}`,
                    is_bot: true,
                    timestamp: new Date().toLocaleTimeString()
                });
            }
        });

        document.getElementById('functionSelect').value = '';
        selectedFunctionId = null;
        selectedFunctionInfo = null;
        
        const inputContainer = document.querySelector('.function-input-container');
        if (inputContainer) inputContainer.remove();
        
    } catch (error) {
        showNotification(`Ошибка: ${error.message}`, 'error');
    }
}