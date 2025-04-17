function showSection(sectionId) {
    const section = document.getElementById(sectionId);
    setTimeout(() => {
        section.style.display = 'flex';
        setTimeout(() => {
            section.classList.remove('hidden');
            section.classList.add('active');
        }, 10);
    }, 320);
}

function hiddenSection() {
    const sections = document.querySelectorAll('.admin-section');
    sections.forEach(section => {
        section.classList?.remove('active');
        section.classList.add('hidden');
        setTimeout(() => {
            section.style.display = 'none';
        }, 310);
    });
}

function handleNavClick(sectionId, clickedElement) {
    document.querySelectorAll('.admin-nav-item').forEach(item => {
        item.classList.remove('active');
    });

    clickedElement.classList.add('active');

    hiddenSection();
    showSection(sectionId);
}

let currentUserRoles = [];
let roles = [];

function openUserModal(userId) {
    const modal = document.getElementById('userModal');
    modal.style.display = 'block';
    currentUserRoles = [];

    if (roles.length === 0) {
        fetch('/api/roles') 
            .then(response => response.json())
            .then(data => {
                roles = data;
                loadUserData(userId);
            });
    } else {
        loadUserData(userId);
    }

    setTimeout(() => {
        modal.querySelector('.modal-content').classList.add('active');
    }, 10);

    modal.onclick = function(e) {
        if (e.target === modal) closeModal();
    }
}

function loadUserData(userId) {
    fetch(`/get-user-data/${userId}`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('modalUserId').textContent = data.id;
            document.getElementById('modalUserLogin').textContent = data.name;
            
            currentUserRoles = data.roles || [];
            updateSelectedRolesDisplay();
        });
}

function addSelectedRole() {
    const roleSelect = document.getElementById('roleSelector');
    const roleId = parseInt(roleSelect.value);
    
    if (!roleId) return;
    
    if (!currentUserRoles.includes(roleId)) {
        currentUserRoles.push(roleId);
        updateSelectedRolesDisplay();
    } else {
        showNotification('Эта группа уже добавлена', 'warning');
    }
    
    roleSelect.value = '';
}

function updateSelectedRolesDisplay() {
    const container = document.getElementById('selectedRoles');
    container.innerHTML = '';
    
    currentUserRoles.forEach(roleId => {
        const role = roles.find(r => r.id === roleId);
        if (role) {
            const roleElement = document.createElement('div');
            roleElement.className = 'selected-function';
            roleElement.dataset.roleId = roleId;
            roleElement.innerHTML = `
                ${role.name}
            `;
            roleElement.onclick = () => {
                currentUserRoles = currentUserRoles.filter(id => id !== roleId);
                updateSelectedRolesDisplay();
            };
            container.appendChild(roleElement);
        }
    });
}

function removeRole(roleId) {
    currentUserRoles = currentUserRoles.filter(id => id !== roleId);
    updateSelectedRolesDisplay();
}

function closeModal() {
    const modal = document.getElementById('userModal');
    modal.querySelector('.modal-content').classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

document.querySelector('.close-btn').addEventListener('click', closeModal);

function saveUserChanges() {
    const userId = document.getElementById('modalUserId').textContent;

    fetch(`/update-user/${userId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({roles: currentUserRoles})
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('Группы пользователя обновлены!', 'success');
            setTimeout(() => location.reload(), 1000);
        } else {
            showNotification(data.message || 'Ошибка обновления', 'error');
        }
    })
    .catch(error => {
        showNotification(error.message, 'error');
    });
}

function showUserRoles(userId) {
    fetch(`/get-user-data/${userId}`)
    .then(res => res.json())
    .then(user => {
        fetch('/api/roles')
        .then(res => res.json())
        .then(roles => {
            const notification = document.createElement('div');
            notification.className = 'cyber-notification';
            notification.innerHTML = `
                <div class="notification-header">
                    <h4>Группы пользователя: ${user.name}</h4>
                    <button onclick="this.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <ul class="function-list">
                    ${user.roles.map(roleId => {
                        const role = roles.find(r => r.id === roleId);
                        if (!role) return '';
                        return `
                            <li>
                                <i class="fas fa-user-tag" style="color: ${role.is_admin ? '#7AFF7A' : role.is_moderator ? '#7A7AFF' : '#FFFFFF'}"></i>
                                ${role.name}
                                ${role.is_admin ? '(Admin)' : role.is_moderator ? '(Moderator)' : ''}
                            </li>
                        `;
                    }).join('')}
                </ul>
            `;
            
            document.body.appendChild(notification);
            
            const closeHandler = (e) => {
                if (!notification.contains(e.target)) {
                    notification.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            
            setTimeout(() => {
                document.addEventListener('click', closeHandler);
            }, 100);

            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(-10px)';
                setTimeout(() => notification.remove(), 300);
            }, 10000);
        });
    });
}

const socket = io.connect();
socket.on('user_status', function(data) {
    const userCard = document.querySelector(`[data-user-id="${data.user_id}"]`);
    if (userCard) {
        const status = userCard.querySelector('.status');
        status.className = `status ${data.status ? 'online' : 'offline'}`;
        
        status.style.transform = 'scale(1.2)';
        setTimeout(() => status.style.transform = 'scale(1)', 300);
    }
});

setInterval(() => {
    fetch('/admin/check-status')
        .then(res => res.json())
        .then(users => {
            users.forEach(user => {
                const status = document.querySelector(
                    `[data-user-id="${user.id}"] .status`
                );
                if (status) {
                    status.className = `status ${user.status ? 'online' : 'offline'}`;
                }
            });
        });
}, 60000);

function performSearch() {
    const searchTerm = document.querySelector('.search-box input').value.trim().toLowerCase();
    const userCards = document.querySelectorAll('.user-card');

    userCards.forEach(card => {
        const username = card.querySelector('h4').textContent.toLowerCase();
        const email = card.querySelector('p').textContent.toLowerCase();
        const role = card.querySelector('.role-badge').textContent.toLowerCase();
        
        const isMatch = searchTerm === '' || 
            username.includes(searchTerm) || 
            email.includes(searchTerm) || 
            role.includes(searchTerm);

        card.style.display = isMatch ? 'flex' : 'none';
        card.classList.toggle('search-highlight', isMatch && searchTerm !== '');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.querySelector('.search-box input');
    const clearBtn = document.querySelector('.clear-search');

    searchInput.addEventListener('input', performSearch);
    
    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        performSearch();
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            performSearch();
        }
    });
});

let currentRoleId = null;
function showRoleModal(roleId = null) {
    currentRoleId = roleId;
    const modal = document.getElementById('roleModal');
    modal.style.display = 'block';

    const functionSelector = document.getElementById('functionSelector');
    const selectedContainer = document.getElementById('selectedFunctions');
    
    functionSelector.onchange = function(e) {
        if (!e.target.value) return;
        
        const funcId = e.target.value;
        const funcName = functionSelector.options[functionSelector.selectedIndex].text;
        
        if (!document.querySelector(`#selectedFunctions [data-func-id="${funcId}"]`)) {
            const elem = document.createElement('div');
            elem.className = 'selected-function';
            elem.dataset.funcId = funcId;
            elem.innerHTML = `${funcName}<span class="remove-func"></span>`;
            elem.onclick = () => elem.remove();
            
            selectedContainer.appendChild(elem);
        }
        functionSelector.value = '';
    }

    selectedContainer.innerHTML = '';
    document.getElementById('roleName').value = '';
    document.getElementById('isAdmin').checked = false;
    if (roleId) {
        document.getElementById('headerModal').innerHTML = '<i class="fas fa-user-tag neon-pulse"></i> Редактирование роли';

        fetch(`/api/role/${roleId}`)
        .then(res => res.json())
        .then(role => {         
            document.getElementById('roleName').value = role.name;
            document.getElementById('roleDescription').value = role.description
            document.getElementById('isAdmin').checked = role.is_admin;
            
            role.functions.forEach(func => {
                const elem = document.createElement('div');
                elem.className = 'selected-function';
                elem.dataset.funcId = func.id;
                elem.innerHTML = `${func.name}<span class="remove-func"></span>`;
                elem.onclick = () => elem.remove();
                selectedContainer.appendChild(elem);
            });
        });
    }
    else {
        document.getElementById('headerModal').innerHTML = '<i class="fas fa-user-tag neon-pulse"></i> Создание роли';
    }
}

function closeRoleModal() {
    document.getElementById('roleModal').style.display = 'none';
}

function deleteRole(roleId) {
    if(confirm('Вы уверены, что хотите удалить эту роль? Все связанные пользователи будут переведены в роль по умолчанию.')) {
        fetch(`/api/role/${roleId}`, {
            method: 'DELETE'
        })
        .then(response => {
            if(response.ok) {
                showNotification('Роль успешно удалена', 'success');
                setTimeout(() => location.reload(), 1500);
            } else {
                throw new Error('Ошибка удаления');
            }
        })
        .catch(error => {
            showNotification(error.message, 'error');
        });
    }
}
function saveRole() {
    const roleName = document.getElementById('roleName').value;
    if (!roleName) {
        showNotification('Введите название роли', 'warning');
        return;
    }

    const isAdmin = document.getElementById('isAdmin').checked;
    const roleDescription = document.getElementsByClassName('roleDescription').value
    const selectedFunctions = Array.from(document.querySelectorAll('#selectedFunctions [data-func-id]'))
                        .map(el => el.dataset.funcId);

    const url = currentRoleId ? `/api/role/${currentRoleId}` : '/api/role';
    const method = currentRoleId ? 'PUT' : 'POST';

    fetch(url, {
        method: method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            name: roleName,
            is_admin: isAdmin,
            functions: selectedFunctions,
            description: roleDescription
        })
    })
    .then(response => {
        if (!response.ok) throw new Error('Ошибка сохранения');
        showNotification('Роль сохранена!', 'success');
        closeRoleModal();
        setTimeout(() => location.reload(), 1000);
    })
    .catch(error => {
        showNotification(error.message, 'error');
    });
}

document.addEventListener('click', function(e) {
    if (e.target.classList.contains('more-funcs')) {
        const roleCard = e.target.closest('.role-card');
        const roleId = roleCard.dataset.roleId;
        showAllFunctions(roleId);
    }
});

function showAllFunctions(roleId) {
    fetch(`/api/role/${roleId}`)
    .then(res => res.json())
    .then(role => {
        const notification = document.createElement('div');
        notification.className = 'cyber-notification';
        notification.innerHTML = `
            <div class="notification-header">
                <h4>Функции роли: ${role.name}</h4>
                <button onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <ul class="function-list">
                ${role.functions.map(func => `
                    <li class="${func.approved ? 'approved' : 'disabled'}">
                        <i class="fas fa-${func.approved ? 'check-circle' : 'times'}"></i>
                        ${func.name}
                    </li>
                `).join('')}
            </ul>
        `;
        document.body.appendChild(notification);
        
        // Автоматическое закрытие через 10 секунд
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(-10px)';
            setTimeout(() => notification.remove(), 300);
        }, 10000);
    });
}

function toggleFunctionStatus(funcId, isChecked) {
    fetch(`/api/function/${funcId}/toggle`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ approved: isChecked })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Ошибка сервера');
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            showNotification(`Статус функции успешно изменен`, 'success');
            const row = document.querySelector(`.function-row [data-func-id="${funcId}"]`).closest('.function-row');
            if (row) {
                const statusBadge = row.querySelector('.func-status-badge');
                if (statusBadge) {
                    statusBadge.className = `func-status-badge ${data.new_status ? 'approved' : 'pending'}`;
                    statusBadge.textContent = data.new_status ? '✓ Одобрена' : '⏳ Ожидает';
                }
            }
        } else {
            throw new Error(data.message || 'Неизвестная ошибка');
        }
    })
    .catch(error => {
        showNotification(error.message, 'error');
        const switchElement = document.querySelector(`input[type="checkbox"][data-func-id="${funcId}"]`);
        if (switchElement) {
            switchElement.checked = !isChecked;
        }
    });
}

function deleteFunction(funcId) {
    if (!confirm('Вы уверены, что хотите удалить эту функцию? Она будет удалена из всех ролей.')) {
        return;
    }

    fetch(`/api/function/${funcId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Ошибка сервера');
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            showNotification(data.message, 'success');
            const row = document.querySelector(`.function-row [data-func-id="${funcId}"]`).closest('.function-row');
            if (row) {
                row.style.opacity = '0';
                setTimeout(() => {
                    row.style.height = '0';
                    row.style.margin = '0';
                    row.style.padding = '0';
                    row.style.border = 'none';
                    setTimeout(() => row.remove(), 300);
                }, 300);
            }
        } else {
            throw new Error(data.message || 'Неизвестная ошибка');
        }
    })
    .catch(error => {
        showNotification(error.message, 'error');
    });
}

function showCreateFunctionModal() {
    const modal = document.getElementById('createFunctionModal');
    modal.style.display = 'block';
    document.getElementById('functionName').value = '';
    document.getElementById('functionCode').value = '';
    document.getElementById('functionFile').value = '';
    document.getElementById('testResults').style.display = 'none';
}

function closeCreateFunctionModal() {
    document.getElementById('createFunctionModal').style.display = 'none';
}

let uploadedFiles = {
    code: null,
    testCases: null
};

document.getElementById('functionCodeFile').addEventListener('change', function(e) {
    handleFileUpload(e.target.files[0], 'code');
});

document.getElementById('testCasesFile').addEventListener('change', function(e) {
    handleFileUpload(e.target.files[0], 'testCases');
});

document.addEventListener('DOMContentLoaded', () => {
    const notificationsContainer = document.createElement('div');
    notificationsContainer.className = 'notifications-container';
    document.body.appendChild(notificationsContainer);
});

function handleFileUpload(file, type) {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        uploadedFiles[type] = {
            name: file.name,
            content: content
        };
        showUploadNotification(file.name, type);
    };
    
    if (type === 'code') {
        reader.readAsText(file);
    } else {
        reader.readAsText(file);
    }
}

function showUploadNotification(filename, type) {
    const notificationId = `upload-notif-${Date.now()}`;
    const notification = document.createElement('div');
    notification.id = notificationId;
    notification.className = 'upload-notification';
    notification.innerHTML = `
        <div class="upload-notification-header">
            <div class="upload-notification-title">
                <i class="fas fa-${type === 'code' ? 'file-code' : 'file-alt'}"></i>
                ${filename}
            </div>
            <div class="upload-notification-buttons">
                <button class="upload-notification-btn view" onclick="viewUploadedFile('${type}')">
                    <i class="fas fa-eye"></i> Просмотр
                </button>
                <button class="upload-notification-btn close" onclick="removeNotification('${notificationId}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
        <div>${type === 'code' ? 'Код функции' : 'Тест-кейсы'} успешно загружены</div>
    `;
    
    const container = document.querySelector('.notifications-container');
    container.insertBefore(notification, container.firstChild);
}

function removeNotification(id) {
    const notification = document.getElementById(id);
    if (notification) {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }
}

function viewUploadedFile(type) {
    if (!uploadedFiles[type]) return;
    
    const sidebar = document.getElementById('fileViewerSidebar');
    const title = document.getElementById('fileViewerTitle');
    const content = document.getElementById('fileContent');
    
    title.innerHTML = `<i class="fas fa-${type === 'code' ? 'file-code' : 'file-alt'}"></i> ${uploadedFiles[type].name}`;
    content.textContent = uploadedFiles[type].content;
    
    sidebar.classList.add('open');
}

function closeFileViewer() {
    document.getElementById('fileViewerSidebar').classList.remove('open');
}

function testFunction() {
    if (!uploadedFiles.code) {
        showNotification('Загрузите файл с кодом функции', 'warning');
        return;
    }

    const testCases = uploadedFiles.testCases ? JSON.parse(uploadedFiles.testCases.content) : [];
    
    fetch('/api/function/test', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            code: uploadedFiles.code.content,
            test_cases: testCases
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showTestResults(data);
        } else {
            showNotification(`Ошибка: ${data.error}`, 'error');
        }
    })
    .catch(error => {
        showNotification(`Ошибка сети: ${error.message}`, 'error');
    });
}

function showTestResults(data) {
    // Удаляем предыдущий сайдбар, если есть
    const existingSidebar = document.querySelector('.test-results-sidebar');
    if (existingSidebar) existingSidebar.remove();

    const sidebar = document.createElement('div');
    sidebar.className = 'test-results-sidebar';
    
    const formattedResults = data.results.map((test, index) => {
        const formatData = (data) => {
            if (typeof data === 'string') {
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    return data;
                }
            }
            return JSON.stringify(data, null, 2);
        };

        const inputStr = formatData(test.input);
        const expectedStr = test.expected ? formatData(test.expected) : 'Не указан';
        const outputStr = formatData(test.output);
        
        return `
            <div class="test-case ${test.passed ? 'passed' : 'failed'}">
                <div class="test-header">
                    <h4>Тест #${index + 1} ${test.passed ? '✓' : '✗'}
                    <span class="test-status ${test.passed ? 'passed' : 'failed'}">
                        ${test.passed ? ' Успешно' : ' Неудачно'}
                    </span>
                    </h4>
                </div>
                <div class="test-data">
                    <div class="data-row">
                        <label>Входные данные:</label>
                        <div class="code-block">${inputStr}</div>
                    </div>
                    <div class="data-row">
                        <label>Ожидаемый результат:</label>
                        <div class="code-block">${expectedStr}</div>
                    </div>
                    <div class="data-row">
                        <label>Полученный результат:</label>
                        <div class="code-block">${outputStr}</div>
                    </div>
                    ${test.error ? `
                    <div class="data-row error">
                        <label>Ошибка:</label>
                        <div class="code-block error">${test.error}</div>
                    </div>` : ''}
                </div>
            </div>
        `;
    }).join('');

    sidebar.innerHTML = `
        <div class="test-results-header">
            <h3><i class="fas fa-clipboard-check"></i> Результаты тестирования</h3>
            <button class="close-btn" onclick="closeTestResults()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="test-results-content">
            <div class="test-summary">
                <h4>Статистика тестирования</h4>
                <div class="summary-grid">
                    <div class="summary-item total">
                        <span>Всего тестов:</span>
                        <strong>${data.stats.total}</strong>
                    </div>
                    <div class="summary-item passed">
                        <span>Успешных:</span>
                        <strong>${data.stats.passed}</strong>
                    </div>
                    <div class="summary-item failed">
                        <span>Проваленных:</span>
                        <strong>${data.stats.failed}</strong>
                    </div>
                    <div class="summary-item percentage">
                        <span>Успешность:</span>
                        <strong>${Math.round((data.stats.passed/data.stats.total)*100)}%</strong>
                    </div>
                </div>
            </div>
            <div class="test-cases-container">
                ${formattedResults}
            </div>
        </div>
    `;
    
    document.body.appendChild(sidebar);
    setTimeout(() => sidebar.classList.add('open'), 10);
    
    setTimeout(() => {
        document.addEventListener('click', (e) => {
            if (!sidebar.contains(e.target) && !e.target.closest('.test-results-sidebar')) {
                closeTestResults();
            }
        });
    }, 100);
}

function closeTestResults() {
    const sidebar = document.querySelector('.test-results-sidebar');
    if (sidebar) {
        sidebar.classList.remove('open');
        setTimeout(() => {
            sidebar.remove();
            document.removeEventListener('click', closeTestResults);
        }, 300);
    }
}

document.getElementById('functionForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    if (!uploadedFiles.code) {
        showNotification('Загрузите файл с кодом функции', 'warning');
        return;
    }
    
    const formData = new FormData();
    formData.append('name', document.getElementById('functionName').value);
    formData.append('description', document.getElementById('functionDescription').value);
    formData.append('function_type', document.getElementById('functionType').value);
    
    const codeFileInput = document.getElementById('functionCodeFile');
    if (codeFileInput.files[0]) {
        formData.append('file', codeFileInput.files[0]);
    }
    
    if (uploadedFiles.testCases) {
        formData.append('test_cases', uploadedFiles.testCases.content);
    }
    
    fetch('/api/function', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('Функция успешно сохранена', 'success');
            closeCreateFunctionModal();
            setTimeout(() => location.reload(), 1000);
        } else {
            showNotification(data.error || 'Ошибка сохранения', 'error');
        }
    });
});

document.getElementById('functionForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('name', document.getElementById('functionName').value);
    
    const fileInput = document.getElementById('functionFile');
    if (fileInput.files[0]) {
        formData.append('file', fileInput.files[0]);
    } else {
        formData.append('code', document.getElementById('functionCode').value);
    }
    
    fetch('/api/function', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('Функция успешно сохранена', 'success');
            closeCreateFunctionModal();
            setTimeout(() => location.reload(), 1000);
        } else {
            showNotification(data.error || 'Ошибка сохранения', 'error');
        }
    });
});