import * as http from 'http';
import * as winston from 'winston';

const logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)(),
    ]
});

function requestHandler(request: http.IncomingMessage,
                        response: http.ServerResponse): void {
    logger.debug(request.url);
}

const server = http.createServer(requestHandler);
const port = process.env.PORT;

server.listen(port, (err: any) => {
    if (err) {
        return logger.error('something bad happened', err);
    }

    logger.info(`server is listening on ${port}`);
});
