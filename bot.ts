import {
  MatrixClient,
  SimpleFsStorageProvider,
  AutojoinRoomsMixin,
  RichReply,
} from 'matrix-bot-sdk'
import moment from 'moment'

require('dotenv').config()
const accessToken = process.env.MATRIX_ACCESS_TOKEN as string

const storage = new SimpleFsStorageProvider('tmp/bot.json')

const homeserverUrl = 'https://matrix.org'

const client = new MatrixClient(homeserverUrl, accessToken, storage)
AutojoinRoomsMixin.setupOnClient(client)

let updateInt = parseFloat(process.env.UPDATE_INTERVAL as string) * 1000 || 2000
let handle = setInterval(updateTick, updateInt)

type reminderInfo = {
  message: string,
  roomId: string,
}
const reminders = new Map<Date, reminderInfo>()

client.on('error', () => clearInterval(handle))
client.on('error', console.error)

client.on('room.message', async function handleCommand (roomId: string, event) {
  if (event.content?.msgtype !== 'm.text') return
  const body = event.content?.body || ''

  const [cmd, dateInput, unit, ...rest] = body.split(/[\s\n]+/)
  const messageToEcho = rest.join(' ')

  if (cmd !== '!remind')
    return

  if (!dateInput) {
    client.sendMessage(roomId, {
      'msgtype': 'm.text',
      'body': `usage: \`!remind <date> <message>\``,
    }).catch(console.error)
    return
  }

  const interval = moment.duration(dateInput, unit)
  if (!interval.isValid()) {
    client.sendMessage(roomId, {
      'msgtype': 'm.notice',
      'body': `Sorry, bad date interval`,
    }).catch(console.error)
    return
  }
  const parsed = moment().add( interval )

  const msgSent = moment(event.origin_server_ts)

  if (parsed.isBefore(msgSent)) {
    client.sendMessage(roomId, {
      'msgtype': 'm.notice',
      'body': `Sorry, bad input: the given deadline was in the past (${parsed.format()})`,
    })
      .catch(console.error)
    return
  }

  if (!messageToEcho) {
    client.sendMessage(roomId, {
      'msgtype': 'm.notice',
      'body': `Sorry, bad input: provide some after the date message `,
    }).catch(console.error)

    return
  }

  reminders.set(parsed.toDate(), {
    message: messageToEcho,
    roomId,
  })
  client.sendMessage(roomId, {
    'msgtype': 'm.notice',
    'body': `Reminder set for ${parsed}`,
  })
    .catch(console.error)

})

function updateTick () {
  const now = new Date()
  for (const [k,{roomId, message}] of reminders.entries()) {
    if (k > now) continue

    reminders.delete(k)
    client.sendMessage(roomId, {
      'msgtype': 'm.text',
      'body': `${message}`,
    })
      .catch(console.error)

    return
  }
}

client.start().then(() => console.log('Client started!'))

