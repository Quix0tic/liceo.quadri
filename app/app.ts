import * as express from 'express'
import * as request from 'request'
import * as SequelizeModule from './models'
import * as debug from 'debug'
import { hrtime } from 'process'

interface PromiseData { id: string, group: string, data: string }

export interface MyRequest extends express.Request {
    sequelize: SequelizeModule.SequelizeDatabase
}
export interface myError extends Error {
    statusCode?: number
}

interface Item {
    name: string,
    url: string
}

interface ResponseType {
    base_url: string,
    info_url: string,
    names_url: string,

    prof: Array<Item>,
    classi: Array<Item>,
    aule: Array<Item>
}

export class Server {
    private _express: express.Application
    private _database: SequelizeModule.SequelizeDatabase
    private _port: number

    constructor(port: number) {
        this._port = port

        this._database = new SequelizeModule.SequelizeDatabase((process.env.NODE_ENV === 'production') ? {
            username: process.env.POSTGRES_USER || 'postgres',
            password: process.env.POSTGRES_PASSWORD || '',
            database: process.env.POSTGRES_DB || 'scambio_libri',
            host: '127.0.0.1',
            dialect: 'postgres',
            logging: debug('sequelize:db')
        } : {
                dialect: 'sqlite',
                storage: './db.postgres',
                logging: debug('postgres:db')
            })
        this._express = express()
    }

    public start = async () => {
        this._express.disable('x-powered-by')
        this._express.disable('etag')
        this._express.disable('server')

        this._express.set('trust proxy', true)

        this._express.use((req: MyRequest, res, next) => {
            req.sequelize = this._database
            next()
        })

        this._express.get("/", function (req: MyRequest, res: express.Response, next: express.NextFunction) {
            let st = hrtime()
            console.log()
            req.sequelize.hash.findOne().then(hash => {
                elapsed(st)
                request.get("http://wp.liceoquadri.it/wp-content/archivio/orario/_grille.js", hash ? { headers: { "If-None-Match": hash.etag } } : {},
                    (error: any, response: request.RequestResponse, body: any) => {

                        elapsed(st)
                        if (response.statusCode == 200) {
                            updateDB(req, response, body)
                                .then(() => {
                                    fetchFromDB(req, res, st)
                                })
                        } else {
                            fetchFromDB(req, res, st)
                        }
                    })
            })
        })

        //////////////////
        //  404 handler //
        //////////////////
        this._express.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
            return res.status(404).json({
                error: true,
                message: 'route not found'
            })
        })
        this._express.use((err: myError, req: express.Request, res: express.Response, next: express.NextFunction) => {
            res.status(err.statusCode || 500)
            res.json({
                name: err.name,
                message: err.message,
                stack: (this._express.get('env') === 'development') ? err.stack : {}
            })
        })
        this._express.listen(this._port, () => {
            console.info('Listening port ' + this._port)
        })
        this._database.start().then(() => {
            console.info("Connected to database")
        }).catch((e) => {
            console.error("Error while connecting to database: " + e)
            process.exit(1)
        })
    }

    public stop = async () => {
        console.info("Port " + this._port + " is now free")
    }
}
function updateDB(req: MyRequest, response: request.RequestResponse, body: string): Promise<void> {
    console.log("Update db")
    return req.sequelize.hash.destroy({ truncate: true })
        .then(() => {
            return req.sequelize.hash.create({ etag: response.headers.etag })
        })
        .then(() => {
            return Promise.all([
                promiseOne(body),
                promiseTwo()
            ])
        })
        .then(data => {
            req.sequelize.schedules.destroy({ truncate: true })
                .then(() => {
                    return req.sequelize.schedules.bulkCreate(data[0].map(value => {
                        return {
                            code: value.id,
                            group: value.group,
                            name: data[1].filter(val => val.id === value.id)[0].data,
                            url: value.data
                        }
                    }))
                })
        })
}
function fetchFromDB(req: MyRequest, res: express.Response, st: [number, number]) {
    let prof: SequelizeModule.ScheduleAttribute[]
    let classi: SequelizeModule.ScheduleAttribute[]
    req.sequelize.schedules.findAll({ attributes: ["name", "url"], where: { group: 'grProf' } })
        .then(data => {
            prof = data
            return req.sequelize.schedules.findAll({ attributes: ["name", "url"], where: { group: 'grClasse' } })
        })
        .then(data => {
            classi = data
            return req.sequelize.schedules.findAll({ attributes: ["name", "url"], where: { group: 'grSalle' } })
        })
        .then(aule => {
            res.json({
                base_url: "http://wp.liceoquadri.it/wp-content/archivio/orario/",
                info_url: "http://wp.liceoquadri.it/wp-content/archivio/orario/_grille.js",
                names_url: "http://wp.liceoquadri.it/wp-content/archivio/orario/_ressource.js",
                prof: prof,
                classi: classi,
                aule: aule,
            })
            elapsed(st)
        })
}
function elapsed(st: [number, number]) {
    let s = hrtime(st)
    console.info("Execution time (hr): %ds %dms", s[0], s[1] / 1000000);
}

function promiseOne(body: string): Promise<PromiseData[]> {
    return new Promise<Array<PromiseData>>((resolve, reject) => {
        let match
        const regex = /ed([pcs]\d+)p\d+s\df+\w+","(\w+)","([^"]+)/g
        let array: Array<PromiseData> = []

        while (match = regex.exec(body)) {
            array.push({
                id: match[1],
                group: match[2],
                data: match[3]
            })
        }
        resolve(array)
    })
}

function promiseTwo(): Promise<PromiseData[]> {
    return new Promise<Array<PromiseData>>((resolve, reject) => {
        request.get("http://wp.liceoquadri.it/wp-content/archivio/orario/_ressource.js", (error: any, response: request.RequestResponse, body: any) => {
            let match
            const regex = /"(\w+)","(.+)","([pcs]\d+)"\);/g
            let array: Array<PromiseData> = []

            while (match = regex.exec(body)) {
                array.push({
                    id: match[3],
                    group: match[1],
                    data: match[2]
                })
            }
            resolve(array)
        })
    })
}