const CryptoJS = require('crypto-js');
const io = require('socket.io-client');

// Function to encrypt a message
function encryptMessage(message, secret) {
    return CryptoJS.AES.encrypt(message, secret).toString();
}

// Function to decrypt a message
function decryptMessage(ciphertext, secret) {
    const bytes = CryptoJS.AES.decrypt(ciphertext, secret);
    return bytes.toString(CryptoJS.enc.Utf8);
}

// Example usage
const secretKey = 'my-secret-key';

const socket = io();

document.getElementById('generateToken').addEventListener('click', function() {
    const token = Math.random().toString(36).substr(2, 9);
    document.getElementById('tokenInput').value = token;
    alert('Token généré: ' + token);
});

document.getElementById('joinConversation').addEventListener('click', function() {
    const token = document.getElementById('tokenInput').value;
    if (token) {
        document.getElementById('chatroom').style.display = 'block';
        alert('Rejoint la conversation avec le token: ' + token);
    } else {
        alert('Veuillez entrer un token valide.');
    }
});

// Send encrypted message to the server
document.getElementById('sendMessage').addEventListener('click', function() {
    const message = document.getElementById('messageInput').value;
    const encryptedMessage = encryptMessage(message, secretKey);
    socket.emit('chat message', encryptedMessage);
    document.getElementById('messageInput').value = '';
});

// Receive messages from the server
socket.on('chat message', function(encryptedMessage) {
    const decryptedMessage = decryptMessage(encryptedMessage, secretKey);
    const messageElement = document.createElement('div');
    messageElement.textContent = decryptedMessage;
    document.getElementById('messages').appendChild(messageElement);
});

// Example of receiving a message
// const receivedEncryptedMessage = '...';
// const decryptedMessage = decryptMessage(receivedEncryptedMessage, secretKey);
// console.log('Decrypted Message:', decryptedMessage); 