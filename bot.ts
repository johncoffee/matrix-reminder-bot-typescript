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
  message: string
  roomId: string
  owner: string
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
    client.sendText(roomId,`usage: \`!remind <date> <message>\``)
      .catch(console.error)
    return
  }

  const interval = moment.duration(dateInput, unit)
  if (!interval.isValid()) {
    client.replyNotice(roomId, event, `sorry, i could not understand the given time duration. Try "5 seconds", "30 minutes" or "1 day", etc.`)
      .catch(console.error)
    return
  }
  const parsed = moment().add( interval )

  const msgSent = moment(event.origin_server_ts)

  if (parsed.isBefore(msgSent)) {
    client.replyNotice(roomId, event, `Sorry, bad input: the given deadline was in the past (${parsed.format()})`)
      .catch(console.error)
    return
  }

  if (!messageToEcho) {
    client.replyNotice(roomId, event,`Sorry, bad input: provide some after the date message `)
      .catch(console.error)

    return
  }

  console.log(event)
  reminders.set(parsed.toDate(), {
    message: messageToEcho,
    roomId,
    owner: event.sender,
  })
  client.replyNotice(roomId, event,`Reminder set for ${parsed}`)
    .catch(console.error)

})

function updateTick () {
  const now = new Date()
  for (const [k,{roomId, message, owner}] of reminders.entries()) {
    if (k > now) continue

    reminders.delete(k)
    client.sendHtmlText(roomId, `${owner}: ${message} <br><small>(reminder set up via bot)</small>`)
      .catch(console.error)

    return
  }
}

client.start().then(() => console.log('Client started!'))

