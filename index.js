import { default as makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

const AUTH_FOLDER = './session';
let keepAlive;

async function startBot() {
    console.log('Starting WhatsApp Bot...');
    
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestWaWebVersion();
    
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Inbound WhatsApp messages', 'Chrome', '1.0.0']
    });

    keepAlive ??= setInterval(() => {}, 60_000);
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('Scan this QR code with WhatsApp');
            qrcode.generate(qr, { small: true });
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
        try {
            const msg = messages?.[0];
            if (!msg?.message || msg.key.fromMe) return;

            const from = msg.key.remoteJid;
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

            console.log(`${from}: ${text}`);

            if (text.toLowerCase() === 'hello') {
                try {
                    await sock.sendMessage(from, { text: 'Hi there!' });
                } catch (err) {
                    console.error(err);
                }
            }
        } catch (err) {
            console.error(err);
        }
    });
    
    return sock;
}

startBot().catch(console.error);
