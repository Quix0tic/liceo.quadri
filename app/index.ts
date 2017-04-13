import * as express from 'express'
import * as request from 'request'


let app = express()

app.listen(process.env.PORT || 8282)

console.log("Server running")

app.disable('x-powered-by')
app.disable('etag')
app.disable('server')

interface Item {
    name: string,
    url: string
}

interface ResponseType {
    base_url: string,
    info_url: string,
    names_url: string,

    prof: Array<Item> | null,
    classi: Array<Item> | null,
    aule: Array<Item> | null
}
app.get("/", function (req: express.Request, res: express.Response, next: express.NextFunction) {
    request.get("http://wp.liceoquadri.it/wp-content/archivio/orario/_grille.js", (error: any, response: request.RequestResponse, body: any) => {
        res.status(200).json({
            base_url: "http://wp.liceoquadri.it/wp-content/archivio/orario/",
            info_url: "http://wp.liceoquadri.it/wp-content/archivio/orario/_grille.js",
            names_url: "http://wp.liceoquadri.it/wp-content/archivio/orario/_ressource.js",
            prof: fetch(/"ed[pcs]\d+p\d+s\d+f+_(\w+)_ac","grProf","([^"]+)"/g, body),
            classi: fetch(/"ed[pcs]\d+p\d+s\d+f+_(\w+)_ac","grClasse","([^"]+)"/g,body),
            aule: fetch(/"ed[pcs]\d+p\d+s\d+f+_(\w+)_ac","grSalle","([^"]+)"/g,body),
        })
    });
})

function fetch(regex: RegExp, body: string): Array<Item> {
    const items: Array<Item> = []
    let match
    while (match = regex.exec(body)) {
        items.push({name:match[1].split("_").join(" "), url: match[2]})
    }
    return items;
}