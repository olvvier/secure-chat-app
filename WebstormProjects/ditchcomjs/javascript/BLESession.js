/**
 * oli b, ditchLabs, 2024
 * class for ble connection to the ditchpen
 */

import {CRC32} from './CRC32.js';


import { getIsPressureFeedActive } from './sharedState.js';

export class BLESession {
    constructor(debug = false) {
        this.bleDevice = null;
        this.bleServer = null;
        this.ledCharacteristic = null;
        this.notificationCharacteristic = null;
        this.DEBUG = debug;
        this.SOF = [0xF4, 0x3F, 0xF2, 0x1F];
        this.EOF = [0xAF, 0xFB, 0xCF, 0xFD];
        this.MANUAL_COMMAND = 14;
        this.dataPoints = [];
        this.dataPointsForCSV = [];
    }
    async connectToDevice() {
        if (this.DEBUG) {
            if (this.updateOutput) {
                this.updateOutput('debug: simulating device connection...');
            }
            return;
        }
        try {
            this.bleDevice = await navigator.bluetooth.requestDevice({
                filters: [{namePrefix: 'DITCH'}],
                optionalServices: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e']
            });
            this.bleServer = await this.bleDevice.gatt.connect();
            const service = await this.bleServer.getPrimaryService('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
            this.ledCharacteristic = await service.getCharacteristic('6e400002-b5a3-f393-e0a9-e50e24dcca9e');
            this.notificationCharacteristic = await service.getCharacteristic('6e400003-b5a3-f393-e0a9-e50e24dcca9e');
            await this.notificationCharacteristic.startNotifications();
            this.notificationCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
                this.handleNotifications(event);
            });
            if (this.updateOutput) {
                this.updateOutput('connected to ' + this.bleDevice.name);
            }
        } catch (error) {
            if (this.updateOutput) {
                this.updateOutput('connection failed: ' + error);
            }
        }
    }

    async disconnectDevice() {

        if (!this.bleDevice) {
            if (this.updateOutput) {
                this.updateOutput('no bluetooth device is connected');
            }
            return;
        }
        try {
            await this.bleDevice.gatt.disconnect();
            if (this.updateOutput) {
                this.updateOutput('disconnected from ' + this.bleDevice.name);
            }
            this.bleDevice = null;
        } catch (error) {
            if (this.updateOutput) {
                this.updateOutput('disconnection error: ' + error);
            }
        }
    }

    async sendManualCommand(commandType, data) {
        return new Promise(async (resolve, reject) => {
            try {
                const payload = [commandType, ...data];
                const payloadSize = payload.length;

                let packet = [];
                packet.push(...this.SOF);
                packet.push(this.MANUAL_COMMAND);

                // Ajout d'un espace réservé pour les timestamps
                packet.push(0x00, 0x00, 0x00, 0x00);

                packet.push((payloadSize >> 24) & 0xFF, (payloadSize >> 16) & 0xFF, (payloadSize >> 8) & 0xFF, payloadSize & 0xFF);
                packet.push(...payload);

                let crc = this.calculateCRC32(packet.slice(4));
                packet.push((crc >> 24) & 0xFF, (crc >> 16) & 0xFF, (crc >> 8) & 0xFF, crc & 0xFF);

                packet.push(...this.EOF);

                let commandData = new Uint8Array(packet);

                if (this.DEBUG) {
                    if (this.updateOutput) {
                        this.updateOutput(`debug: sending command ${commandData.join(' ')}`);
                    }
                    resolve(); // Résoudre immédiatement en mode debug
                } else {
                    if (!this.ledCharacteristic) {
                        throw new Error('device is not connected or characteristic is not defined');
                    }
                    await this.ledCharacteristic.writeValue(commandData);
                    if (this.updateOutput && !getIsPressureFeedActive()) {
                        this.updateOutput(`sent command ${commandData.join(' ')}`);
                    }
                    resolve(); // Résoudre la promesse si la commande est envoyée avec succès
                }
            } catch (error) {
                reject(error); // Rejeter la promesse avec l'erreur capturée
            }
        });
    }


    calculateCRC32(data) {
        let crc32 = new CRC32();
        data.forEach(byte => crc32.push(byte));
        return crc32.get();
    }

    handleNotifications(event) {
        const value = event.target.value;
        const now = new Date();
        const timestamp = now.toLocaleString('en-CA', {
            timeZone: 'America/Montreal',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // Conversion et traitement des données
        const notificationMessage = new TextDecoder().decode(value);
        if (notificationMessage.includes('"PROC"')) {
            const cleanedMessage = notificationMessage.match(/\{.*\}/);
            if (cleanedMessage) {
                try {
                    const jsonData = JSON.parse(cleanedMessage[0]);
                    console.log(jsonData);

                    if (notificationMessage.includes('Pressures')) {

                        if (jsonData.Result && Array.isArray(jsonData.Result)) {
                            const result = jsonData.Result.map(Number).filter(n => !isNaN(n)); // Transformation en nombres
                            if (result.length > 0) {
                                this.dataPoints.push({time: now, value: result[0]}); // Utilisation du premier élément si plusieurs
                                this.updateGraph(); // Mise à jour du graphique
                                this.dataPointsForCSV.push({time: timestamp, value: result[0]});
                            }

                        }
                    } else {

                        if (jsonData.Result) {
                            let displayMessage = `(${timestamp}) [${jsonData.PROC}]: Data: `;

                            // Si Result est directement un nombre
                            if (typeof jsonData.Result === 'number') {
                                displayMessage += `${jsonData.Result} `;
                                this.updateInformation(displayMessage);
                            }
                            // Si Result est un tableau de nombres
                            else if (Array.isArray(jsonData.Result) && typeof jsonData.Result[0] === 'number') {
                                const result = jsonData.Result.map(Number).filter(n => !isNaN(n));
                                if (result.length > 0) {
                                    displayMessage += `${result.join(', ')} `;
                                    this.updateInformation(displayMessage);
                                }
                            }
                            // Si Result est un tableau d'objets
                            else if (Array.isArray(jsonData.Result) && typeof jsonData.Result[0] === 'object') {
                                const resultDescriptions = jsonData.Result.map(obj => {
                                    return Object.entries(obj).map(([key, value]) => `${key}: ${value}`).join(', ');
                                });
                                if (resultDescriptions.length > 0) {
                                    displayMessage += resultDescriptions.join(' | ');
                                    this.updateInformation(displayMessage);
                                }
                            }
                        }
                    }

                } catch (error) {
                    console.error('Error parsing JSON:', error);
                }

            }
        }
    }

    setUpdateOutputCallback(callback) {
        this.updateOutput = callback;
    }

    setUpdateInformationCallback(callback) {
        this.updateInformation = callback;
    }

    async saveBleInfoToFile(fileName) {
        if (!this.bleDevice || !this.bleDevice.gatt.connected) {
            this.updateOutput('no bluetooth device is connected');
            return;
        }

        let bleInfo = `device name: ${this.bleDevice.name}\n` +
            `device id: ${this.bleDevice.id}\n` +
            `connected: ${this.bleDevice.gatt.connected}\n\n`;

        try {
            const services = await this.bleDevice.gatt.getPrimaryServices();
            for (const service of services) {
                bleInfo += `service: ${service.uuid}\n`;
                const characteristics = await service.getCharacteristics();
                for (const characteristic of characteristics) {
                    bleInfo += `  characteristic: ${characteristic.uuid} `;

                    try {
                        const value = await characteristic.readValue();
                        const decoder = new TextDecoder('utf-8');
                        bleInfo += `(value: ${decoder.decode(value)})\n`;
                    } catch (error) {
                        bleInfo += `(could not read value: ${error})\n`;
                    }
                }
                bleInfo += '\n';
            }

            const blob = new Blob([bleInfo], {type: 'text/plain'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileName}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.updateOutput(`saved bluetooth device information to ${fileName}.txt`);
        } catch (error) {
            this.updateOutput(`failed to retrieve bluetooth device information: ${error}`);
        }
    }

    showDeviceName() {
        if (this.bleDevice && this.bleDevice.name) {
            this.updateOutput(`device name: ${this.bleDevice.name}`);
        } else {
            this.updateOutput('no bluetooth device is connected');
        }
    }
    updateGraph() {
        const canvas = document.getElementById('data-graph');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height); // Nettoyer le canvas

        // Définir la couleur de fond du graphique
        ctx.fillStyle = "#222529";
        ctx.fillRect(0, 0, width, height);

        // Filtrer les données pour les 5 dernières minutes
        const fiveMinutesAgo = new Date(new Date().getTime() - 0.5 * 60 * 1000);
        const recentDataPoints = this.dataPoints.filter(point => point.time >= fiveMinutesAgo);

        if (recentDataPoints.length === 0) return;

        // Afficher la dernière valeur en temps réel
        const lastValue = recentDataPoints[recentDataPoints.length - 1].value;
        ctx.strokeStyle = 'white'; // Pour les lignes et les axes
        ctx.fillStyle = 'white'; // Pour le texte et les points
        ctx.font = '10px Andale Mono';
        ctx.fillText(`Real time: ${lastValue} Pa`, width / 2 - 10, 178);


        // Normaliser les données pour l'affichage
        const maxVal = Math.max(...recentDataPoints.map(point => point.value));
        const minVal = Math.min(...recentDataPoints.map(point => point.value));

        // Dessiner les axes
        ctx.beginPath();
        //ctx.moveTo(55, 0); // Début de l'axe Y
        //ctx.lineTo(55, height - 20); // Fin de l'axe Y
        //ctx.lineTo(width, height - 20); // Axe X
        ctx.stroke();

        // Marquer l'axe Y
        for (let i = 0; i <= 5; i++) {
            let yVal = minVal + (i * (maxVal - minVal) / 5);
            let yPos = (height - 20) - ((yVal - minVal) / (maxVal - minVal) * (height - 20));
            ctx.fillText(yVal.toFixed(1), 0, yPos);
        }


        // Dessiner les points et les lignes
        recentDataPoints.forEach((point, index) => {
            if (index === 0) return; // Pas de ligne pour le premier point
            const prevPoint = recentDataPoints[index - 1];

            // Calculer les positions x et y
            const x = 55 + (index / (recentDataPoints.length - 1)) * (width - 55);
            const prevX = 55 + ((index - 1) / (recentDataPoints.length - 1)) * (width - 55);
            const y = (height - 20) - ((point.value - minVal) / (maxVal - minVal) * (height - 20));
            const prevY = (height - 20) - ((prevPoint.value - minVal) / (maxVal - minVal) * (height - 20));

            // Dessiner la ligne
            ctx.beginPath();
            ctx.moveTo(prevX, prevY);
            ctx.lineTo(x, y);
            ctx.stroke();
        });
    }
}