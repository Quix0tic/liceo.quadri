import * as express from 'express'
import * as request from 'request'
import * as SequelizeModule from './models'
import * as debug from 'debug'
import { hrtime } from 'process'

interface PromiseData { id: string, group: string, data: string }

const promises: Array<Promise<Array<PromiseData>>> = [
    new Promise<Array<PromiseData>>((resolve, reject) => {
        request.get("http://wp.liceoquadri.it/wp-content/archivio/orario/_grille.js", (error: any, response: request.RequestResponse, body: any) => {
            let start = hrtime()
            let match;
            let array: Array<PromiseData> = [];

            while (match = /ed([pcs]\d+)p\d+s\df+\w+","(\w+)","([^"]+)/g.exec(body)) {
                array.push({
                    id: match[1],
                    group: match[2],
                    data: match[3]
                })
            }
            console.info("Elapsed time ms: " + hrtime(start))
            resolve(array);
        })
    }),
    new Promise<Array<PromiseData>>((resolve, reject) => {
        request.get("http://wp.liceoquadri.it/wp-content/archivio/orario/_ressource.js", (error: any, response: request.RequestResponse, body: any) => {
            let start = hrtime()
            let match;
            let array: Array<PromiseData> = [];

            while (match = /"(\w+)","(.+)","([pcs]\d+)"\);/g.exec(body)) {
                array.push({
                    id: match[3],
                    group: match[1],
                    data: match[2]
                })
            }
            console.info("Elapsed time ms: " + hrtime(start))
            resolve(array);
        })
    })
]

export interface MyRequest extends express.Request {
    sequelize: SequelizeModule.SequelizeDatabase
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
        console.log("Server running")
        this._express.listen(process.env.PORT || this._port)

        this._express.disable('x-powered-by')
        this._express.disable('etag')
        this._express.disable('server')

        this._express.use((req: MyRequest, res, next) => {
            req.sequelize = this._database
            next()
        })

        this._express.get("/", function (req: MyRequest, res: express.Response, next: express.NextFunction) {
            request.get("http://wp.liceoquadri.it/wp-content/archivio/orario/_grille.js", { headers: { "If-None-Match": req.sequelize.hash.findOne().then(value => value.etag) } },
                (error: any, response: request.RequestResponse, body: any) => {
                    if (response.statusCode == 200) {
                        console.log("statusCode=200")
                        req.sequelize.hash.find().then(data => {
                            data.destroy()
                                .then(value => req.sequelize.hash.create({ etag: response.headers.etag }))
                                .then(() => Promise.all(promises).then(function (data) {
                                    req.sequelize.schedules.bulkCreate(data[0].map(value => {
                                        return {
                                            code: value.id,
                                            group: value.group,
                                            name: data[1].filter(val => val.id === value.id)[0].data,
                                            url: value.data
                                        } as SequelizeModule.ScheduleAttribute;
                                    })).then(() => {
                                        res.status(200).json({
                                            base_url: "http://wp.liceoquadri.it/wp-content/archivio/orario/",
                                            info_url: "http://wp.liceoquadri.it/wp-content/archivio/orario/_grille.js",
                                            names_url: "http://wp.liceoquadri.it/wp-content/archivio/orario/_ressource.js",
                                            prof: req.sequelize.schedules.findAll({ attributes: ["name", "url"], where: { group: 'grProf' } }),
                                            classi: req.sequelize.schedules.findAll({ attributes: ["name", "url"], where: { group: 'grClasse' } }),
                                            aule: req.sequelize.schedules.findAll({ attributes: ["name", "url"], where: { group: 'grSalle' } }),
                                        })
                                    })
                                }))
                        })
                    } else {
                        res.status(200).json({
                            base_url: "http://wp.liceoquadri.it/wp-content/archivio/orario/",
                            info_url: "http://wp.liceoquadri.it/wp-content/archivio/orario/_grille.js",
                            names_url: "http://wp.liceoquadri.it/wp-content/archivio/orario/_ressource.js",
                            prof: req.sequelize.schedules.findAll({ attributes: ["name", "url"], where: { group: 'grProf' } }),
                            classi: req.sequelize.schedules.findAll({ attributes: ["name", "url"], where: { group: 'grClasse' } }),
                            aule: req.sequelize.schedules.findAll({ attributes: ["name", "url"], where: { group: 'grSalle' } }),
                        })
                    }
                });
        })
    }
}

function fetch(regex: RegExp, body: string): Array<Item> {
    const items: Array<Item> = []
    let match
    while (match = regex.exec(body)) {
        items.push({ name: match[1].split("_").join(" "), url: match[2] })
    }
    return items;
}