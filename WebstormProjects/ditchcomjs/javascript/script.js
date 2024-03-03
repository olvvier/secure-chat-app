
/**
 * oli b, ditchLabs, 2024
 * main script - ditch terminal
 */

import {bleSessionInstance} from './bleSessionInstance.js';
import { setIsPressureFeedActive } from './sharedState.js';

document.addEventListener('DOMContentLoaded', () => {

    const terminal = document.getElementById('terminal');
    const input = document.getElementById('input');
    const output = document.getElementById('output');
    const DBUSED = false;
    let commandHistory = [];
    let historyIndex = -1;
    let commandQueue = [];
    let isProcessingCommand = false;


    input.focus();
    terminal.addEventListener('click', () => {
        input.focus();
        placeCaretAtEnd(input);
    });

    // Modifiez la fonction processCommand pour qu'elle ajoute des commandes à la file d'attente
    const enqueueCommand = async (command) => {
        commandQueue.push(command);
        if (!isProcessingCommand) {
            processNextCommand();
        }
    };
    // Traitement de la commande suivante dans la file
    const processNextCommand = async () => {
        if (commandQueue.length === 0) {
            isProcessingCommand = false;
            return;
        }

        isProcessingCommand = true;
        const command = commandQueue.shift();
        await processCommand(command);
        isProcessingCommand = false;
        processNextCommand();
    };

    const draggableWindow = document.getElementById('draggable-window');
    const closeBtn = draggableWindow.querySelector('.close-btn');

    let isDragging = false;
    let offsetX, offsetY;

    draggableWindow.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - draggableWindow.offsetLeft;
        offsetY = e.clientY - draggableWindow.offsetTop;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        let x = e.clientX - offsetX;
        let y = e.clientY - offsetY;

        // Limite le déplacement à l'intérieur de la fenêtre
        x = Math.max(0, Math.min(window.innerWidth - draggableWindow.offsetWidth, x));
        y = Math.max(0, Math.min(window.innerHeight - draggableWindow.offsetHeight, y));

        draggableWindow.style.left = `${x}px`;
        draggableWindow.style.top = `${y}px`;
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    closeBtn.addEventListener('click', () => {
        draggableWindow.style.display = 'none';
    });

    const updateOutput = (html) => {
        const line = document.createElement('div');
        line.className = 'output-line';
        line.innerHTML = html;
        output.appendChild(line);

        if (DBUSED) {

            fetch('http://localhost:3000/save-information', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({message: html, type: 'terminal'})
            })
                .then(response => response.text())
                .then(data => console.log(data))
                .catch(error => console.error('Error:', error));
        }
    };

    const updateInformation = (html) => {
        const infoLine = document.createElement('div');
        infoLine.className = 'information-line';
        infoLine.innerHTML = html;
        const information = document.getElementById('information');
        information.appendChild(infoLine);
        information.scrollTop = information.scrollHeight;

        if (DBUSED) {
            fetch('http://localhost:3000/save-information', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({message: html, type: 'information'})
            })
                .then(response => response.text())
                .then(data => console.log('Information saved:', data))
                .catch(error => console.error('Error saving information:', error));
        }
    };

    let feedPressureInterval = null;

    const processCommand = async (command) => {
        updateOutput('> ' + command);


        const commandActions = {
            'clear': () => {
                output.textContent = '';
            },
            'help': async () => updateOutput(await (await fetch('helpContent.html')).text()),
            'connect': () => bleSessionInstance.connectToDevice(),
            'disconnect': () => bleSessionInstance.disconnectDevice(),
            'pressurevalues': () => bleSessionInstance.sendManualCommand(6, []),
            'accelvalues': () => bleSessionInstance.sendManualCommand(7, []),
            'analogvalues': () => bleSessionInstance.sendManualCommand(8, []),
            'digitalvalues': () => bleSessionInstance.sendManualCommand(9, []),
            'rtcvalue': () => bleSessionInstance.sendManualCommand(10, []),
            'readnfc': () => bleSessionInstance.sendManualCommand(11, [])
        };

        if (commandActions[command.toLowerCase()]) {
            try {
                await commandActions[command.toLowerCase()]();
            } catch (error) {
                updateOutput(`<div class="error-message">${error.message}</div>`);
            }
            return;
        }



        try {
            const parts = command.split(' ');
            const baseCommand = parts[0].toLowerCase();
            let percent = 0;
            let duration = 0;
            switch (baseCommand) {
                case 'led1':
                case 'led2':
                    if (parts.length !== 5) throw new Error(`invalid ${baseCommand.toUpperCase()} command, use: ${baseCommand} <R> <G> <B> <W>`);
                    const ledData = parts.slice(1).map(n => parseInt(n));
                    await bleSessionInstance.sendManualCommand(baseCommand === 'led1' ? 1 : 2, ledData);
                    break;
                case 'heater':
                    if (parts.length !== 3 || !['pwm1', 'pwm2'].includes(parts[1])) throw new Error('invalid heater command, use: heater <pwm1/pwm2> <dutyCycle>');
                    const heaterData = [parseInt(parts[2])];
                    const heaterCommand = parts[1] === 'pwm1' ? 3 : 4;
                    await bleSessionInstance.sendManualCommand(heaterCommand, heaterData);
                    break;
                case 'dcdcenable':
                    if (parts.length !== 2 || ![0, 1].includes(parseInt(parts[1]))) throw new Error('invalid DCDCEnable command, use: dcdcenable <0/1>');
                    const dcdcEnableData = parseInt(parts[1]);
                    await bleSessionInstance.sendManualCommand(5, [dcdcEnableData]);
                    break;
                case 'save':
                    if (parts.length !== 3) throw new Error(`invalid command format, use: save -log <filename> or save -term <filename>`);
                    const option = parts[1], fileName = parts[2];
                    if (option === '-log') {
                        saveLogToFile(fileName);
                    } else if (option === '-term') {
                        saveTerminalToFile(fileName);
                    } else if (option === '-bleinfo') {
                        await bleSessionInstance.saveBleInfoToFile(fileName);
                    } else {
                        throw new Error(`invalid option: ${option}, use -log to save logs, or -term to save terminal content`);
                    }
                    break;

                case 'show':
                    if (parts[1] === '-devicename') {
                        await bleSessionInstance.showDeviceName();
                    } else {
                        throw new Error(`invalid option: ${parts[1]}, use -devicename to show device name`);
                    }
                    break;

                case 'feed':
                    if (parts.length !== 2) throw new Error('Invalid command format. Use: startFeedPressure <frequency>');
                    const frequency = parseInt(parts[1], 10);
                    if (isNaN(frequency) || frequency <= 0) throw new Error('Frequency must be a positive number.');

                    if (feedPressureInterval) clearInterval(feedPressureInterval);
                    feedPressureInterval = setInterval(() => {
                        bleSessionInstance.sendManualCommand(6, []);
                    }, 1000 / frequency);
                    setIsPressureFeedActive(true);
                    updateOutput(`Pressure feed started at ${frequency} Hz.`);
                    draggableWindow.style.display = 'block'; // Affiche la fenêtre mobile
                    break;

                case 'stop':
                    if (feedPressureInterval) {
                        clearInterval(feedPressureInterval);
                        feedPressureInterval = null;
                        setIsPressureFeedActive(false);
                        downloadCSV(bleSessionInstance.dataPointsForCSV);
                        updateOutput('Pressure feed stopped.');
                        draggableWindow.style.display = 'none'; // Masque la fenêtre mobile
                    } else {
                        updateOutput('No pressure feed is currently active.');
                    }
                    break;

                case 'charging':
                    percent = parseInt(parts[1]);
                    duration = parseInt(parts[2]);
                    if (percent >= 50) {
                        await setLEDColor([0, 0, 255, 0], [0, 0, 255, 0]); // Green for both LEDs
                    } else if (percent < 50 && percent >= 10) {
                        await setLEDColor([255, 0, 255, 0], [255, 0, 255, 0]); // Yellow for both LEDs
                    } else if (percent < 10) {
                        await setLEDColor([255, 0, 0, 0], [255, 0, 0, 0]); // Red for both LEDs
                    }
                    setTimeout(() => setLEDColor([0, 0, 0, 0], [0, 0, 0, 0]), duration * 1000); // Turn off after duration
                    break;
                case 'batterylevel':
                    percent = parseInt(parts[1]);
                    duration = parseInt(parts[2]);
                    if (percent >= 50) {
                        await setLEDColor(null, [0, 0, 255, 0]); // Green for LED2
                    } else if (percent < 50 && percent >= 10) {
                        await setLEDColor([255, 0, 255, 0], null); // Yellow for LED1
                    } else if (percent < 10) {
                        await setLEDColor([255, 0, 0, 0], null); // Red for LED1
                    }
                    setTimeout(() => setLEDColor([0, 0, 0, 0], [0, 0, 0, 0]), duration * 1000); // Turn off after duration
                    break;
                case 'liquid':
                    percent = parseInt(parts[1]);
                    duration = parseInt(parts[2]);
                    if (percent >= 50) {
                        await setLEDColor(null, [0, 0, 255, 0]); // Green for LED2
                        setTimeout(() => setLEDColor([0, 0, 0, 0], [0, 0, 0, 0]), duration * 1000); // Turn off after duration
                    } else if (percent < 50 && percent >= 10) {
                        await setLEDColor(null, [255, 0, 255, 0]); // Yellow for LED2
                        setTimeout(() => setLEDColor([0, 0, 0, 0], [0, 0, 0, 0]), duration * 1000); // Turn off after duration
                    } else if (percent < 10) {
                        await flashLEDs(null, [255, 0, 0, 0], duration); // Flash Red for LED2
                        setTimeout(() => setLEDColor([0, 0, 0, 0], [0, 0, 0, 0]), duration * 1000); // Turn off after duration
                    }
                    break;

                case 'update':

                    duration = parseInt(parts[1]);
                    await flashLEDs([255, 255, 255, 0], [255, 255, 255, 0], duration); // Flash White for both LEDs
                    break;
                    setTimeout(() => flashLEDs([0, 255, 0, 0], [0, 255, 0, 0], 2), duration * 1000); // Then flash Blue for 2 seconds
                case 'error':
                    duration = parseInt(parts[1]);
                    await flashLEDs([255, 0, 0, 0], [255, 0, 0, 0], duration); // Flash Red for both LEDs
                    setTimeout(() => setLEDColor([0, 0, 0, 0], [0, 0, 0, 0]), duration * 1000); // Turn off after duration
                    break;

                default:
                    throw new Error(`${command} is not a command, type "help" for the list of valid commands`);
            }
        } catch (error) {
            updateOutput(`<div class="error-message">${error.message}</div>`);
        }
    };

    const saveLogToFile = (fileName) => {
        const text = document.getElementById('information').innerText;
        const blob = new Blob([text], {type: 'text/plain'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        updateOutput(`saved information logs to ${fileName}.txt`);
    };

    /**
     * Saves the content of a terminal element to a file.
     *
     * @param {string} fileName - The name of the file to be saved. The file extension will be '.txt'.
     * @returns {void}
     */
    const saveTerminalToFile = (fileName) => {
        const text = document.getElementById('terminal').innerText;
        const blob = new Blob([text], {type: 'text/plain'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        updateOutput(`saved terminal content to ${fileName}.txt`);
    };

    function placeCaretAtEnd(el) {
        el.focus();
        if (typeof window.getSelection != "undefined"
            && typeof document.createRange != "undefined") {
            var range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        } else if (typeof document.body.createTextRange != "undefined") {
            var textRange = document.body.createTextRange();
            textRange.moveToElementText(el);
            textRange.collapse(false);
            textRange.select();
        }
    }

    document.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const command = input.innerText.trim();
            input.textContent = '';
            commandHistory.unshift(command);
            historyIndex = -1;
            await enqueueCommand(command); // Modification ici
            input.focus();
        } else if (event.key === 'ArrowUp') {

            event.preventDefault();
            if (historyIndex < commandHistory.length - 1) {
                historyIndex++;
                input.textContent = commandHistory[historyIndex];
                placeCaretAtEnd(input);
            }
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (historyIndex > 0) {
                historyIndex--;
                input.textContent = commandHistory[historyIndex];
                placeCaretAtEnd(input);
            } else if (historyIndex === 0) {
                historyIndex--;
                input.textContent = '';
            }
        }
    });

    bleSessionInstance.setUpdateOutputCallback((message) => {
        updateOutput(message);
    });

    bleSessionInstance.setUpdateInformationCallback((message) => {
        updateInformation(message);
    });

    function downloadCSV(dataPoints, fileName = 'feedData.csv') {
        const csvContent = 'data:text/csv;charset=utf-8,'
            + 'Time,Value\n'
            + dataPoints.map(e => `${e.time},${e.value}`).join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Helper function to set LED colors
    async function setLEDColor(led1Color, led2Color) {
        // Assuming led1 and led2 accept colors as arrays [R, G, B, W]
        if (led1Color) await bleSessionInstance.sendManualCommand(1, led1Color); // LED1 command code assumed as 1
        if (led2Color) await bleSessionInstance.sendManualCommand(2, led2Color); // LED2 command code assumed as 2
    }

// Helper function to flash LEDs
    async function flashLEDs(led1Color, led2Color, duration) {
        const flashInterval = 500; // 2 Hz means toggling every 500ms
        const endTime = Date.now() + duration * 1000;

        const flash = async () => {
            if (Date.now() >= endTime) {
                // Ensure LEDs are turned off after flashing
                await setLEDColor([0, 0, 0, 0], [0, 0, 0, 0]);
                return;
            }

            await setLEDColor(led1Color, led2Color);
            setTimeout(async () => {
                await setLEDColor([0, 0, 0, 0], [0, 0, 0, 0]); // Turn off LEDs
                setTimeout(flash, flashInterval / 2); // Schedule next toggle
            }, flashInterval / 2);
        };

        flash(); // Start flashing
    }

});
