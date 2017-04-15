import * as Sequelize from 'sequelize'
import * as debug from 'debug'

export interface ScheduleAttribute {
    name: string
    url: string
    group: string
    code: string
}
export interface HashAttribute {
    etag: string
}

export interface StorageConfiguration {
    database?: string
    username?: string
    password?: string
    host?: string
    dialect: string
    storage?: string
    logging?: (err: string) => any
}

export interface ScheduleInstance extends Sequelize.Instance<ScheduleAttribute>, ScheduleAttribute { }
export interface ScheduleModel extends Sequelize.Model<ScheduleInstance, ScheduleAttribute> { }

export interface HashInstance extends Sequelize.Instance<HashAttribute>, HashAttribute { }
export interface HashModule extends Sequelize.Model<HashInstance, HashAttribute> { }

export class SequelizeDatabase {
    public db: Sequelize.Sequelize
    public schedules: ScheduleModel
    public hash: HashModule
    private config: StorageConfiguration
    private _error: debug.IDebugger

    constructor(config: StorageConfiguration) {
        this.config = config
        this.db = new Sequelize(
            this.config.database ? this.config.database : 'database',
            this.config.username ? this.config.username : 'username',
            this.config.password ? this.config.password : 'password',
            this.config)
        this.hash = this.db.define<HashInstance, HashAttribute>('hash', {
            etag: {
                type: Sequelize.STRING
            }
        }, {
                tableName: 'hash'
            })

        this.schedules = this.db.define<ScheduleInstance, ScheduleAttribute>('schedules', {
            name: {
                type: Sequelize.STRING
            },
            url: {
                type: Sequelize.STRING
            },
            group: {
                type: Sequelize.STRING
            },
            code: {
                type: Sequelize.STRING
            }
        }, {
                tableName: 'schedules'
            })
    }

    private _connect = async () => {
        try {
            await this.db.authenticate()
        } catch (error) {
            return process.exit(1)
        }
    }
    private _init = async () => {
        try {
            await this.db.sync({ force: false })
        } catch (error) {
            return process.exit(1)
        }
    }

    public start = async () => {
        await this._connect()
        await this._init()
    }
}
