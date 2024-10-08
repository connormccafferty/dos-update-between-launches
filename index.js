const { exec } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const { launch, connect } = require('@openfin/node-adapter');


async function setRegistryKey(keyPath, value, entryType) {
    const cmd = `reg add ${path.dirname(keyPath)} /v ${path.basename(keyPath)} /d ${value} /t ${entryType} /f`;
    return new Promise((resolve, reject) => {
        exec(cmd, (err, stdout) => {
            if (err) {
                reject(err);
            }
            console.log(`@setRegistryKey Set registry key: ${keyPath} value: ${value}`);
            resolve();
        })
    });
}

async function delRegistryKey(keyPath) {
    const cmd = `reg delete ${path.dirname(keyPath)} /v ${path.basename(keyPath)} /f`;
    return new Promise((resolve, reject) => {
        exec(cmd, (err, stdout) => {
            if (err) {
                reject(err);
            }
            console.log(`@delRegistryKey Deleted registry key: ${keyPath}`);
            resolve();
        })
    });
}

function extractGetDesktopOwnerSettingsPayload() {
    const rvmLogPath = path.resolve(process.env.LOCALAPPDATA, 'OpenFin/logs/rvm.log');
    const log = fs.readFileSync(rvmLogPath, 'utf-8');
    const match = /{.*{"action":"get-desktop-owner-settings".*"payload".*}/.exec(log)[0];

    const msg = JSON.parse(match);

    console.log('get-desktop-owner-settings payload: ');
    console.log(JSON.stringify(msg, null, 4));
}

async function waitFor(ms) {
    console.log(`Waiting for ${ms} milliseconds...`);
    await new Promise(r => setTimeout(r, ms));
}

const app = express();

const PORT = 5555;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, async () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    const manifestUrl = `http://localhost:${PORT}/app.json`;

    const DOS_URL_ONE = `http://localhost:${PORT}/dos.json`;
    const DOS_URL_TWO = `http://localhost:${PORT}/_dos.json`;
    const RVM_LOG = path.resolve(process.env.LOCALAPPDATA, 'OpenFin/logs/rvm.log');

    await setRegistryKey('HKEY_CURRENT_USER\\Software\\OpenFin\\RVM\\Settings\\DesktopOwnerSettings', DOS_URL_ONE, 'REG_SZ');

    await waitFor(2000);

    console.log(`Launching application with DesktopOwnerSettings: ${DOS_URL_ONE}`);
    const WS_PORT_ONE = await launch({ manifestUrl });

    let fin = await connect({
        uuid: 'node-connection', 
        address: `ws://localhost:${WS_PORT_ONE}`, 
        nonPersistent: true 
    });
    
    await waitFor(2000);

    extractGetDesktopOwnerSettingsPayload();

    try {
        console.log(`Quitting application, shutting down RVM`)
        await fin.Application.wrapSync({ uuid: 'dos-repro' }).quit();
    } catch (e) {
        
    }
    
    // await delRegistryKey('HKEY_CURRENT_USER\\Software\\OpenFin\\RVM\\Settings\\DesktopOwnerSettings');
    await setRegistryKey('HKEY_CURRENT_USER\\Software\\OpenFin\\RVM\\Settings\\DesktopOwnerSettings', DOS_URL_TWO, 'REG_SZ');
    await waitFor(2000);

    console.log(`Launching application with DesktopOwnerSettings: ${DOS_URL_TWO}`);
    const WS_PORT_TWO = await launch({ manifestUrl: `http://localhost:${PORT}/_app.json` });

    fin = await connect({
        uuid: 'node-connection',
        address: `ws://localhost:${WS_PORT_TWO}`,
        nonPersistent: true
    });

    await waitFor(2000);

    extractGetDesktopOwnerSettingsPayload();

    fin.once('disconnected', process.exit);
});