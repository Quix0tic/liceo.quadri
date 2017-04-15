import * as debugN from 'debug'
import { Server } from './app'

let debug = debugN('api:index')

const server = new Server(process.env.PORT || 8383)

server.start().catch(error => {
    console.error(error)
})