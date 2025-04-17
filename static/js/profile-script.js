
let isChatOpen = false;
let isFunctionsOpen = true;

function toggleChat() {
    const main = document.querySelector('.profile-main');
    const functionsSection = document.querySelector('.my-functions');
    const chatSection = document.querySelector('.chat-section');
    
    if (!isChatOpen) {
        main.classList.remove('functions-open');
        main.classList.add('chat-open');
        chatSection.classList.add('visible');
        isChatOpen = true;
        isFunctionsOpen = false;
        
        window.scrollTo({
            top: chatSection.offsetTop - 20,
            behavior: 'smooth'
        });
    }
}
function toggleFunctions() {
    const main = document.querySelector('.profile-main');
    const functionsSection = document.querySelector('.my-functions');
    const chatSection = document.querySelector('.chat-section');
    
    if (!isFunctionsOpen) {
        main.classList.remove('chat-open');
        main.classList.add('functions-open');
        isFunctionsOpen = true;
        isChatOpen = false;
        
        window.scrollTo({
            top: functionsSection.offsetTop - 20,
            behavior: 'smooth'
        });
    }
}

document.querySelector('.my-functions .section-header h2').addEventListener('click', toggleFunctions);
document.querySelector('.chat-section .section-header h2').addEventListener('click', toggleChat);

document.addEventListener('DOMContentLoaded', () => {
    const main = document.querySelector('.profile-main');
    main.classList.add('functions-open');
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const filter = this.dataset.filter;
            document.querySelectorAll('.function-card').forEach(func => {
                const isEnabled = func.dataset.enabled === 'true';
                func.style.display = 
                    filter === 'all' || 
                    (filter === 'enabled' && isEnabled) || 
                    (filter === 'disabled' && !isEnabled) ? 'block' : 'none';
            });
        });
    });
});

function executeFunction(funcName, args) {
    socket.emit('execute_function', {
        function_name: funcName,
        arguments: args
    }, (response) => {
        if(response.success) {
            addMessage({
                content: response.result,
                is_bot: true,
                timestamp: new Date().toLocaleTimeString()
            });
        } else {
            addMessage({
                content: `Ошибка выполнения: ${response.error}`,
                is_bot: true,
                timestamp: new Date().toLocaleTimeString()
            });
        }
    });
}