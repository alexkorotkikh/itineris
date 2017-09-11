import * as http from 'http';
import * as winston from 'winston';
import * as etcd from 'promise-etcd';
import * as Rx from 'rxjs';

import { EndpointInfo, EndpointsInfoWrapper } from "./endpoints";
import { EtcValueNode, WaitMaster } from "promise-etcd";

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

function requestHandler(endpointsWrapper: EndpointsInfoWrapper) {
    function _requestHandler(request: http.IncomingMessage,
                             response: http.ServerResponse): void {
        logger.debug(request.url);

        if (!endpointsWrapper.endpoints) {
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

    return _requestHandler;
}

function detectPort() {
    return process.env.PORT || 80;
}

export function startServer(etc: etcd.Etcd): void {
    const endpointsInfoWrapper = new EndpointsInfoWrapper([]);
    const server = http.createServer(requestHandler(endpointsInfoWrapper));
    const port = detectPort();
    server.listen(port, (err: any) => {
        if (err) {
            return logger.error('Something bad happened', err);
        }

        Rx.Observable.create((observer: Rx.Observer<EtcValueNode[]>) => {
            WaitMaster.create('', etc, 1000, 10000,
                () => {
                    logger.info("WaitMaster started");
                }, () => {
                    logger.error("WaitMaster stopped");
                }).then((list) => {
                observer.next(list.value as EtcValueNode[]);
            });
        }).subscribe((list: EtcValueNode[]) => {
            endpointsInfoWrapper.endpoints = list.map((service) => EndpointInfo.create(service));
            logger.info('Endpoints were updated');
        });

        logger.info(`Server is listening on ${port}`);
    });
}
