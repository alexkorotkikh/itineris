import * as http from 'http';
import * as winston from 'winston';
import * as etcd from 'promise-etcd';

import { EndpointInfo } from "./endpoints";

let endpoints: EndpointInfo[];

const logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)(),
    ]
});

function getForwardHost() {
    return "";
}

function getForwardPort() {
    return "";
}

function requestHandler(request: http.IncomingMessage,
                        response: http.ServerResponse): void {
    logger.debug(request.url);

    if (!endpoints) {
        logger.error("Endpoints were not loaded")
    }

    const forwardOptions = {
        host: getForwardHost(),
        port: getForwardPort(),
        path: request.url,
        method: request.method,
        headers: request.headers,
    };
    const forward = http.request(forwardOptions, (cres) => {
        cres.on('data', (chunk) => {
            response.write(chunk);
        });
        cres.on('close', () => {
            response.writeHead(cres.statusCode);
            response.end();
        });
        cres.on('end', () => {
            response.writeHead(cres.statusCode);
            response.end();
        });
    }).on('error', (e) => {
        logger.error(e.message);
        response.writeHead(500);
        response.end();
    });

    forward.end()
}

function loadEndpointsConfiguration(etc: etcd.Etcd) {
    etc.list('', { recursive: true }).then((val) => {
        endpoints = val.value.map((service) => EndpointInfo.create(service));
    });
}

function detectPort() {
    return process.env.PORT || 80;
}

export function startServer(etc: etcd.Etcd): void {
    const server = http.createServer(requestHandler);
    const port = detectPort();
    server.listen(port, (err: any) => {
        if (err) {
            return logger.error('Something bad happened', err);
        }

        loadEndpointsConfiguration(etc);
        logger.info(`Server is listening on ${port}`);
    });
}
