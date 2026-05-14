import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion } from '@whiskeysockets/baileys'
import pino from 'pino'
import { Boom } from '@hapi/boom'
import fs from 'fs'

const AUTH_FOLDER = './session'

let sock = null
let isConnecting = false

async function startBot() {

    if (isConnecting) return
    isConnecting = true

    console.log('Starting WhatsApp Bot...')

    try {

        if (!fs.existsSync(AUTH_FOLDER)) {
            fs.mkdirSync(AUTH_FOLDER, { recursive: true })
        }

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER)

        const { version, isLatest } = await fetchLatestWaWebVersion()

        console.log(`Using WA Version: ${version.join('.')} | Latest: ${isLatest}`)

        sock = makeWASocket({
            version,
            logger: pino({ level: 'info' }),
            auth: state,
            printQRInTerminal: true,
            keepAliveIntervalMs: 10000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            browser: ['Bot', 'Chrome', '1.0.0']
        })

        sock.ev.on('connection.update', async (update) => {

            const { connection, lastDisconnect, qr } = update

            if (qr) {
                console.log('Scan the QR code')
            }

            if (connection === 'connecting') {
                console.log('Connecting...')
            }

            if (connection === 'open') {

                isConnecting = false

                console.log('Connected!')
                console.log(`Bot Number: ${sock.user?.id}`)
            }

            if (connection === 'close') {

                isConnecting = false

                const statusCode =
                    lastDisconnect?.error instanceof Boom
                        ? lastDisconnect.error.output.statusCode
                        : 0

                console.log('Disconnected:', statusCode)

                const shouldReconnect =
                    statusCode !== DisconnectReason.loggedOut

                if (shouldReconnect) {

                    console.log('Reconnecting in 5 seconds...')

                    setTimeout(() => {
                        startBot()
                    }, 5000)

                } else {

                    console.log('Logged out')

                    if (fs.existsSync(AUTH_FOLDER)) {
                        fs.rmSync(AUTH_FOLDER, {
                            recursive: true,
                            force: true
                        })
                    }
                }
            }
        })

        sock.ev.on('creds.update', saveCreds)

        sock.ev.on('messages.upsert', async ({ messages, type }) => {

            if (type !== 'notify') return

            const msg = messages[0]

            if (!msg.message || msg.key.fromMe) return

            const from = msg.key.remoteJid

            const text =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                ''

            console.log(`${from}: ${text}`)

            if (text.toLowerCase() === 'hello') {

                await sock.sendMessage(from, {
                    text: 'Hi there!'
                })
            }
        })

    } catch (err) {

        isConnecting = false

        console.error('Startup Error:', err)

        setTimeout(() => {
            startBot()
        }, 5000)
    }
}

startBot()