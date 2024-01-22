import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import config from 'reactord-schema/config'
import schema from 'reactord-schema'
import { cryptoRandomStringAsync } from 'crypto-random-string'
import { eq } from 'drizzle-orm'

const connection = await mysql.createConnection(config)

const db = drizzle(connection, { mode: 'default', schema })

const token = await cryptoRandomStringAsync({
  type: 'base64',
  length: 80,
})

const identifier = await cryptoRandomStringAsync({
  type: 'hex',
  length: 12,
})

console.log(identifier)

console.log('Registering Bigger Reactor...')

await db.insert(schema.devices).values({
  identifier,
})

const device_data = await db.query.devices.findFirst({
  where: eq(schema.devices.identifier, identifier),
})

if (!device_data) {
  // this shouldn't happen, but just incase
  console.error("Somehow, we couldn't find the data.")
  process.exit(0)
}

await db.insert(schema.biggerReactors).values({
  access_token: token,
  deviceId: device_data.id,
})

console.log(`Reactor registered with token:\n${token}`)

connection.end()
