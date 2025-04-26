document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById(`${tabId}-tab`).classList.add('active');
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
