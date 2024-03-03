
/**
 * oli b, ditchLabs, 2024
 * server and mongodb management
 */

const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');

const app = express();
const port = 3000;

// Assurez-vous que les informations de connexion sont correctes
const uri = "mongodb+srv://olivier:DHKqWW6Ni37k1bMX@cluster0.eflahyb.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri, {
    serverApi: ServerApiVersion.v1
});

const dbName = 'Cluster0'; // Assurez-vous que c'est le nom correct de votre base de données

app.use(cors());
app.use(express.json());



let db, informationCollection, terminalCollection;

client.connect().then(() => {
    console.log("Connected successfully to server");
    db = client.db(dbName);
    informationCollection = db.collection('information');
    terminalCollection = db.collection('terminal');
}).catch(err => console.error(err));

app.post('/save-information', async (req, res) => {
    try {
        const { message, type } = req.body;
        let result;
        if (type === 'terminal') {
            result = await terminalCollection.insertOne({ message, timestamp: new Date() });
        } else if (type === 'information') {
            result = await informationCollection.insertOne({ message, timestamp: new Date() });
        } else {
            throw new Error('Invalid type specified');
        }

        if (result.acknowledged) {
            console.log("Information saved in", type, result);
            res.status(201).send(`Information saved in ${type}`);
        } else {
            throw new Error('Information saving failed');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Error saving information: ' + error.message);
    }
});


// Gestion propre de la fermeture de l'application
const cleanExit = () => { client.close(); process.exit(); };
process.on('SIGINT', cleanExit);
process.on('SIGTERM', cleanExit);

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
