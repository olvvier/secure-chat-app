/**
 * oli b, ditchLabs, 2024
 * session and run manager
 */
import { bleSessionInstance } from './bleSessionInstance.js';
class Run {
    constructor(name) {
        this.name = name;
        this.creationTimestamp = Date.now();
        this.endTimestamp = null;
        this.durationSeconds = null;
        this.data = {pressure: [], accel: [], analog: [], digital: [], rtc: []};
    }

    receiveMessage(message) {
        const parsed = JSON.parse(message);
        const { PROC, Result } = parsed;
        const timestamp = Date.now();

        switch (PROC) {
            case "Pressures": this.data.pressure.push({ values: Result, timestamp }); break;
            case "Accel": this.data.accel.push({ x: Result[0], y: Result[1], z: Result[2], timestamp }); break;
            case "Analog": this.data.analog.push({ ...Result.reduce((acc, cur) => ({ ...acc, ...cur }), {}), timestamp }); break;
            case "Digital": this.data.digital.push({ ...Result.reduce((acc, cur) => ({ ...acc, ...cur }), {}), timestamp }); break;
            case "RTC": this.data.rtc.push({ value: Result, timestamp }); break;
        }
    }

    endRun() {
        this.endTimestamp = Date.now();
        this.durationSeconds = (this.endTimestamp - this.creationTimestamp) / 1000;
    }

    printRunData() {
        console.log(`Run Name: ${this.name}`);
        console.log(`Creation Timestamp: ${new Date(this.creationTimestamp)}`);
        console.log(`End Timestamp: ${this.endTimestamp ? new Date(this.endTimestamp) : "Run not ended"}`);
        console.log(`Duration: ${this.durationSeconds ? this.durationSeconds + " seconds" : "Duration not calculated"}`);
        console.log('Data:', JSON.stringify(this.data, null, 2));
    }
}

class Session {
    constructor(name, pressure = 0, accel = 0, analog = 0, digital = 0, rtc = 0) {
        this.name = name;
        this.creationDate = new Date();
        this.endTimestamp = null;
        this.durationSeconds = null;
        this.settings = { pressure, accel, analog, digital, rtc };
        this.runs = [];
        this.currentRun = null;

        Object.keys(this.settings).forEach(key => {
            if (this.settings[key] !== 0) {
                this.scheduleMessage(key, this.settings[key]);
            }
        });
    }

    startRun(runName) {
        const run = new Run(runName);
        this.runs.push(run);
        this.currentRun = run;
    }

    scheduleMessage(type, frequency) {
        const method = `send${type.charAt(0).toUpperCase() + type.slice(1)}Message`;
        if (this[method]) {
            setInterval(() => {
                this[method]();
            }, 1000 / frequency);
        }
    }

    sendPressureMessage() {
        console.log("Simulation: Envoi du message de pression");
    }

    sendAccelMessage() {
        console.log("Simulation: Envoi du message d'accélération");
    }

    sendAnalogMessage() {
        console.log("Simulation: Envoi du message analogique");
    }

    sendDigitalMessage() {
        console.log("Simulation: Envoi du message digital");
    }

    sendRtcMessage() {
        console.log("Simulation: Envoi du message RTC");
    }

    receiveMessage(message) {
        if (this.currentRun) {
            this.currentRun.receiveMessage(message);
        } else {
            console.log("Aucune run active pour recevoir le message.");
        }
    }

    endRun() {
        if (this.currentRun) {
            this.currentRun.endRun();
            console.log(`Run ${this.currentRun.name} ended.`);
            this.currentRun = null; // Optionnellement réinitialiser la run active
        } else {
            console.log("Aucune run active à terminer.");
        }
    }

    endSession() {
        this.endTimestamp = Date.now();
        this.durationSeconds = (this.endTimestamp - this.creationDate.getTime()) / 1000;
        this.runs.forEach(run => run.endRun()); // Optionnellement terminer toutes les runs
        console.log(`Session ${this.name} ended.`);
    }

    printSessionRuns() {
        console.log(`Session Name: ${this.name}`);
        console.log(`Creation Date: ${this.creationDate}`);
        console.log(`End Timestamp: ${this.endTimestamp ? new Date(this.endTimestamp) : "Session not ended"}`);
        console.log(`Duration: ${this.durationSeconds ? this.durationSeconds + " seconds" : "Duration not calculated"}`);
        this.runs.forEach(run => {
            run.printRunData();
        });
    }
}

