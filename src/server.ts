import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import config from 'reactord-schema/config'
import schema from 'reactord-schema'
import { eq } from 'drizzle-orm'
import type {
  BiggerReactorsReactorData,
  BiggerReactorsReactorMessage,
  Req,
} from 'reactord-schema/types/reactord'

const connection = await mysql.createConnection(config)

const db = drizzle(connection, { mode: 'default', schema })

const devices = [
  // ones we support for now
  'mekanism-reactor',
  'BiggerReactors_Reactor',
]

const defaultBiggerReactor: BiggerReactorsReactorData = {
  active: false,
  ambientTemperature: 0,
  apiVersion: null,
  burnedLastTick: 0,
  capacity: 0,
  casingTemperature: 0,
  coldFluidAmount: 0,
  connected: false,
  controlRodCount: 0,
  coolantCapacity: 0,
  fuel: 0,
  fuelCapacity: 0,
  fuelReactivity: 0,
  fuelTemperature: 0,
  hotFluidAmount: 0,
  maxTransitionedLastTick: 0,
  producedLastTick: 0,
  stackTemperature: 0,
  stored: 0,
  totalReactant: 0,
  transitionedLastTick: 0,
  type: 'none',
  wasteCapacity: 0,
}

const server = Bun.serve<Req>({
  async fetch(req, server) {
    const type = req.headers.get('type')
    const deviceId = req.headers.get('deviceId')
    const token = req.headers.get('token')

    if (!type) {
      console.debug('header type is required')
      return new Response('header type is required')
    }

    if (!token && !deviceId) {
      console.debug('device id is required')
      return new Response('device id is required')
    }

    if (!devices.find((e) => e.includes(type))) {
      console.debug('device type not found')
      return new Response('device type not found')
    }

    if (token) {
      console.log(token)
      if (type === 'BiggerReactors_Reactor') {
        const reactor = await db.query.biggerReactors.findFirst({
          where: eq(schema.biggerReactors.access_token, token),
          with: {
            device: true,
          },
        })

        if (!reactor) {
          console.debug(`${type} #${deviceId} not found`)
          return new Response(`${type} #${deviceId} not found`)
        }

        await db
          .update(schema.devices)
          .set({
            registered: true,
            connected: true,
          })
          .where(eq(schema.devices.id, reactor.deviceId))
      }
    }

    const url = new URL(req.url)

    console.log(url)

    const success = server.upgrade(req, {
      data: {
        token,
        deviceId,
        type,
      },
    })

    if (!success) throw new Error('Sorry.')

    if (success) return

    return new Response()
  },
  websocket: {
    async open(ws) {
      if (!ws.data) {
        ws.close()
        return
      }

      ws.subscribe(`${ws.data.type}-${ws.data.id}`)
    },
    async message(ws, message) {
      if (!ws.data) return

      if ((!ws.data.id && !ws.data.type) || !ws.data.token) return

      let data: BiggerReactorsReactorMessage | null = null

      try {
        data = JSON.parse(message.toString())
      } catch (e) {
        console.debug(`${message} is not valid json`)
      }

      if (!data) return

      console.log(data.data)

      //await doQuery(ws)

      ws.publish(`${ws.data.type}-${ws.data.id}`, `${message}`)

      // now store the values
      await db
        .update(schema.biggerReactors)
        .set(data.data)
        .where(eq(schema.biggerReactors.access_token, ws.data.token))
    },
    async close(ws) {
      if (!ws.data) return

      if (!ws.data.id && !ws.data.type) return

      //await doQuery(ws)
      if (ws.data.type === 'BiggerReactors_Reactor') {
        const reactor = await db.query.biggerReactors.findFirst({
          where: eq(schema.biggerReactors.access_token, ws.data.token!),
          with: {
            device: true,
          },
        })

        if (!reactor) {
          // not supposed to happen but just incase we lose the context
          console.error(`${ws.data.type} #${ws.data.id} not found`)
          return
        }

        await db
          .update(schema.devices)
          .set({
            connected: false,
          })
          .where(eq(schema.devices.id, reactor.deviceId))

        await db
          .update(schema.biggerReactors)
          .set(defaultBiggerReactor)
          .where(eq(schema.biggerReactors.access_token, ws.data.token!))
      }

      ws.unsubscribe(`${ws.data.type}-${ws.data.id}`)
    },
  },
  hostname: '0.0.0.0',
})

console.log(`Listening on ${server.hostname}:${server.port}`)

process.on('SIGINT', async () => {
  // cleanup

  console.log('Cleaning up...')

  // Reset all machine stats to 0 on exit as we are no longer accepting connections
  await db.update(schema.biggerReactors).set(defaultBiggerReactor)

  await db.update(schema.mekanismReactors).set({
    active: false,
  })

  connection.end()

  console.log('bye!')

  process.exit(0)
})
