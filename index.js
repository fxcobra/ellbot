import { default as makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';

const AUTH_FOLDER = './session';

async function startBot() {
    console.log('Starting WhatsApp Bot...');
    
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestWaWebVersion();
    
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: true,
        browser: ['Inbound WhatsApp messages', 'Chrome', '1.0.0']
    });
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('Scan this QR code with WhatsApp');
        }
        
        if (connection === 'open') {
            console.log('Connected!');
            console.log(`Bot number: ${sock.user.id}`);
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Reconnecting...');
                setTimeout(startBot, 5000);
            } else {
                console.log('Logged out');
            }
        }
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const from = msg.key.remoteJid;
        const text = msg.message?.conversation || 
                     msg.message?.extendedTextMessage?.text || '';
        
        console.log(`${from}: ${text}`);
        
        if (text.toLowerCase() === 'hello') {
            await sock.sendMessage(from, { text: 'Hi there!' });
        }
    });
    
    return sock;
}

startBot().catch(console.error);
