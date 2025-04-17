document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('#authForm').addEventListener('submit', (e) => {
        e.preventDefault();
    
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
    
        fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Успешный вход! Перенаправление...', 'success');
                setTimeout(() => {
                    window.location.href = data.next || '/profile';
                }, 1000);
            } else {
                showNotification(data.message || 'Ошибка входа', 'error');
            }
        })
        .catch(error => {
            showNotification('Ошибка сети: ' + error.message, 'error');
        });
    });
    
    document.querySelector('#regForm').addEventListener('submit', (e) => {
        e.preventDefault(); 
    
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
    
        if (data.password !== data.c_password) {
            showNotification('Пароли не совпадают', 'error');
            return;
        }
    
        fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Регистрация успешна!', 'success');
                setTimeout(() => {
                    hideModal(document.querySelector("#regModal"));
                    showModal(document.querySelector("#loginModal"));
                }, 1500);
            } else {
                showNotification(data.message || 'Ошибка регистрации', 'error');
            }
        })
        .catch(error => {
            showNotification('Ошибка сети: ' + error.message, 'error');
        });
    });
});


function showModal(modal) {
    modal.style.display = 'flex';
    document.querySelectorAll('#overlay').forEach(o => {
        o.classList.add('active');
    });

    setTimeout(() => {
        modal.classList.remove('hidden-modal');
        modal.classList.add('show-modal');
    }, 10);
}

function hideModal(modal) {
    modal.classList.remove('show-modal');
    modal.classList.add('hidden-modal');

    setTimeout(() => {
        modal.style.display = 'none';
        document.querySelectorAll('#overlay').forEach(o => {
            o.classList.remove('active');
        });
    }, 450);
}

document.addEventListener('DOMContentLoaded', () => {
    const dropdowns = document.querySelectorAll('.dropdown');
    
    document.addEventListener('click', (e) => {
        dropdowns.forEach(dropdown => {
            const isButton = dropdown.querySelector('.dropbtn').contains(e.target);
            
            if (isButton) {
                dropdown.classList.toggle('is-active');
            } else {
                dropdown.classList.remove('is-active');
            }
        });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dropdowns.forEach(dropdown => {
                dropdown.classList.remove('is-active');
            });
        }
    });
});


