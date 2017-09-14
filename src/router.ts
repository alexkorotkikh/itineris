import * as fs from 'fs';

import * as etcd from 'promise-etcd';
import * as Rx from 'rxjs';
import * as winston from "winston";
import * as yargs from 'yargs';

import * as server from './server';
import { EndpointInfoSource, EndpointInfoStorage } from "./endpoints";

const etcdOptions = {
    'etcd-cluster-id': {
        'default': 'ClusterWorld'
    },
    'etcd-app-id': {
        'default': 'HelloWorld'
    },
    'etcd-url': {
        'default': 'http://localhost:2379'
    }
};

function createEtcd(argv: any): etcd.Etcd {
    const cfg = etcd.Config.start([
        '--etcd-cluster-id', argv.etcdClusterId,
        '--etcd-app-id', argv.etcdAppId,
        '--etcd-url', argv.etcdUrl,
    ]);
    return etcd.Etcd.create(cfg);
}

function createVersionHandler(y: yargs.Argv, observer: Rx.Observer<string>): void {
    y.command('version', 'Show router\'s version', {}, () => {
        observer.next(process.env.npm_package_version);
        observer.complete();
    });
}

function createStartHandler(y: yargs.Argv, observer: Rx.Observer<string>): void {
    y.command('start', 'Starts router', etcdOptions, (argv: any) => {
        const etc = createEtcd(argv);
        const logger = new (winston.Logger)({
            transports: [new (winston.transports.Console)()]
        });

        const infoSource = new EndpointInfoSource(etc, logger);
        const storage = new EndpointInfoStorage(logger);
        const serverManager = new server.ServerManager(logger);

        infoSource.start()
            .flatMap(nodes => storage.update(nodes))
            .flatMap(changedEndpoints => serverManager.updateEndpoints(changedEndpoints))
            .subscribe(result => logger.info("configuration updated", result));

        observer.next("Router started");
    });
}

function createAddEndpointHandler(y: yargs.Argv, observer: Rx.Observer<string>): void {
    y.command('add-endpoint', 'Adds new endpoint to the catalog', {
        ...etcdOptions,
        'service-name': { description: 'Name of the service' },
        'node-name': { description: 'Name of the node' },
        'ip': { description: 'IP address of the endpoint' },
        'port': { description: 'Port of the endpoint' },
        'tls-cert': { description: 'Path to TLS certificate file' },
        'tls-chain': { description: 'Path to TLS chain file' },
        'tls-key': { description: 'Path to TLS key file' }
    }, async (argv) => {
        const tlsCert = fs.readFileSync(argv.tlsCert, 'utf8');
        const tlsChain = fs.readFileSync(argv.tlsChain, 'utf8');
        const tlsKey = fs.readFileSync(argv.tlsKey, 'utf8');

        const etc = createEtcd(argv);
        await etc.connect();
        await etc.mkdir(`${argv.serviceName}`);

        await etc.mkdir(`${argv.serviceName}/nodes`);
        await etc.setJson(`${argv.serviceName}/nodes/${argv.nodeName}`, { ip: argv.ip, port: argv.port });

        await etc.mkdir(`${argv.serviceName}/tls`);
        await etc.setRaw(`${argv.serviceName}/tls/cert`, tlsCert);
        await etc.setRaw(`${argv.serviceName}/tls/chain`, tlsChain);
        await etc.setRaw(`${argv.serviceName}/tls/key`, tlsKey);

        observer.next('Endpoint was added');
        observer.complete();
    });
}

function createListEndpointsHandler(y: yargs.Argv, observer: Rx.Observer<string>): void {
    y.command('list-endpoints', 'Show the list of endpoints', etcdOptions, (argv) => {
        const etc = createEtcd(argv);
        etc.list('', { recursive: true }).then((val) => {
            observer.next(JSON.stringify(val.value));
            observer.complete();
        });
    });
}

function createDeleteEndpointHandler(y: yargs.Argv, observer: Rx.Observer<string>): void {
    y.command('delete-endpoint', 'Delete endpoint from the list', {
        ...etcdOptions,
        'service-name': { description: 'Name of the service' },
    }, (argv) => {
        const etc = createEtcd(argv);
        etc.rmdir(argv.serviceName, { recursive: true }).then(() => {
            observer.next('Node was removed');
            observer.complete();
        });
    });
}

export function cli(args: string[]): Rx.Observable<string> {
    return Rx.Observable.create((observer: Rx.Observer<string>) => {
        const y = yargs.usage('$0 <cmd> [args]');

        createVersionHandler(y, observer);
        createStartHandler(y, observer);
        createAddEndpointHandler(y, observer);
        createListEndpointsHandler(y, observer);
        createDeleteEndpointHandler(y, observer);

        y.help().parse(args);
    });
}
