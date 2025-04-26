let editor;


document.addEventListener('DOMContentLoaded', function() {
    editor = CodeMirror.fromTextArea(document.getElementById('functionCode'), {
        mode: 'python',
        theme: 'dracula',
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        matchBrackets: true,
        extraKeys: {
            'Ctrl-Enter': saveFunction,
            'Cmd-Enter': saveFunction,
            'Ctrl-/': 'toggleComment',
            'Cmd-/': 'toggleComment'
        }
    });
    
    editor.on('change', debounce(checkCodeRequirements, 500));
    
    checkCodeRequirements();
});

function checkCodeRequirements() {
    const code = editor.getValue();
    let hasClass = false;
    let hasMethodInteraction = false;
    let hasMethodExecute = false;
    let methodReturnsDict = false;
    
    try {
        hasClass = code.includes('class Function:') || code.includes('class Function(');
        
        hasMethodInteraction = code.includes('def interactionUser(');
        hasMethodExecute = code.includes('def execute(');


        if (hasMethodInteraction) {
            const methodCode = code.match(/def interactionUser\(.*?\):\s*([\s\S]*?)(?=def |class |$)/i);
            if (methodCode && methodCode[1]) {
                methodReturnsDict = methodCode[1].includes('return {') || 
                                methodCode[1].includes('return dict(') ||
                                methodCode[1].match(/return\s+\{.*\}/) ||
                                methodCode[1].match(/return\s+dict\(.*\)/);
        }
        }


        if (hasMethodExecute) {
            const methodCode = code.match(/def execute\(.*?\):\s*([\s\S]*?)(?=def |class |$)/i);
            if (methodCode && methodCode[1]) {
            }
        }
    } catch (e) {
        console.error('Ошибка при проверке кода:', e);
    }


    updateRequirement('req-class', hasClass);
    updateRequirement('req-method-interaction', hasMethodInteraction);
    updateRequirement('req-method-execute', hasMethodExecute);
    updateRequirement('req-return', methodReturnsDict);
}

function updateRequirement(elementId, isValid) {
    const element = document.getElementById(elementId);
    if (isValid) {
        element.classList.add('valid');
        element.classList.remove('invalid');
        element.innerHTML = '<i class="fas fa-check"></i> ' + element.textContent.replace(/^[✓✗]\s*/, '');
    } else {
        element.classList.add('invalid');
        element.classList.remove('valid');
        element.innerHTML = '<i class="fas fa-times"></i> ' + element.textContent.replace(/^[✓✗]\s*/, '');
    }
}

function saveFunction() {
    const code = editor.getValue();
    const description = document.getElementById('functionDescription').value;
    
    fetch(`/api/function/${functionId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            code: code,
            description: description
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('Функция успешно сохранена', 'success');
            checkCodeRequirements();
        } else {
            showNotification(data.error || 'Ошибка сохранения', 'error');
        }
    })
    .catch(error => {
        showNotification('Ошибка сети: ' + error.message, 'error');
    });
}

function testFunction() {
    const code = editor.getValue();
    
    fetch('/api/function/test', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            code: code,
            test_case: func_test || []
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showTestResults(data);
        } else {
            showNotification(data.error || 'Ошибка тестирования', 'error');
        }
    })
    .catch(error => {
        showNotification('Ошибка сети: ' + error.message, 'error');
    });
}

function showTestResults(data) {
    const container = document.getElementById('testResultsContent');
    container.innerHTML = '';

    if (!data || !data.results) {
        container.innerHTML = '<div class="test-case">Ошибка: Некорректные данные результатов</div>';
        return;
    }

    if (data.results.length === 0) {
        container.innerHTML = '<div class="test-case">Нет тест-кейсов для этой функции</div>';
        return;
    }

    function formatJsonForDisplay(value) {
        if (value === null || value === undefined) return '<i>Не указан</i>';
        try {
            let parsedValue;
            if (typeof value === 'string') {
                if (value.trim() === '' || value.trim().toLowerCase() === 'null') {
                return '<i>null</i>';
                }
                parsedValue = JSON.parse(value);
            } else {
                parsedValue = value;
            }
            return JSON.stringify(parsedValue, null, 2); 
        } catch (e) {
            return String(value);
        }
    }

    data.results.forEach((result, index) => {
        const testCase = document.createElement('div');
        const passed = result.passed === true;
        testCase.className = `test-case ${passed ? 'passed' : 'failed'}`;

        testCase.innerHTML = `
            <h4>Тест #${index + 1} ${passed ? '✓' : '✗'}</h4>
            <div class="test-data">
                <div><strong>Входные данные:</strong><pre>${formatJsonForDisplay(result.input)}</pre></div>
                <div><strong>Ожидаемый результат:</strong><pre>${formatJsonForDisplay(result.expected)}</pre></div>
                <div><strong>Полученный результат:</strong><pre>${formatJsonForDisplay(result.output)}</pre></div>
                ${result.error ? `<div class="error"><strong>Ошибка:</strong> <pre>${result.error}</pre></div>` : ''}
            </div>
        `;

        container.appendChild(testCase);
    });

    if (data.stats) {
        const stats = document.createElement('div');
        stats.className = 'test-stats';
        const total = data.stats.total || 0;
        const passedCount = data.stats.passed || 0;
        const failedCount = data.stats.failed || 0;
        const passPercentage = total > 0 ? Math.round((passedCount / total) * 100) : 0;

    stats.innerHTML = `
        <div>Всего тестов: ${total}</div>
        <div>Успешно: ${passedCount} (${passPercentage}%)</div>
        <div>Провалено: ${failedCount}</div>
    `;
    container.prepend(stats);
    }
}

function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this, args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}

var m_pos;
var resize_el = document.getElementById("resize");

function resize(e) {
    var parent = resize_el.parentNode;
    var dy = m_pos - e.y; 
    m_pos = e.y;
    parent.style.height = (parent.offsetHeight + dy) + "px";
}

resize_el.addEventListener("mousedown", function(e) {
    m_pos = e.y;
    document.addEventListener("mousemove", resize, false);
}, false);
document.addEventListener("mouseup", function() {
    document.removeEventListener("mousemove", resize, false);
}, false);