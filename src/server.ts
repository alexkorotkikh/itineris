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

function requestHandler(request: http.IncomingMessage,
                        response: http.ServerResponse): void {
    logger.debug(request.url);
    if (!endpoints) {
        logger.error("Endpoints were not loaded")
    }
}

function loadEndpointsConfiguration(etc: etcd.Etcd) {
    etc.list('', { recursive: true }).then((val) => {
        endpoints = val.value.map((service) => EndpointInfo.create(service));
    });
}

function detectPort() {
    return process.env.PORT;
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
