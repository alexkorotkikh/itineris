import * as etcd from 'promise-etcd';
import * as Rx from 'rxjs';
import * as winston from 'winston';
import * as yargs from 'yargs';
import * as fs from 'fs';

import * as server from './server';
import { EndpointInfoSource, EndpointInfoStorage } from './endpoints';

function createEtcd(argv: any): etcd.EtcdPromise {
    const cfg = etcd.Config.start([
        '--etcd-cluster-id', argv.etcdClusterId,
        '--etcd-app-id', argv.etcdAppId,
        '--etcd-url', argv.etcdUrl,
    ]);
    return etcd.EtcdPromise.create(cfg);
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
            .subscribe(result => logger.info('configuration updated', result));

        observer.next('Router started');
    });
}

// services
//    add
//    list
//    remove
//    set    tls-options
//    remove tls-options

function createServiceHandler(y: yargs.Argv, observer: Rx.Observer<string>): void {
    y.command('service', 'service commands', (_argv): yargs.Argv => {
        const service = yargs.usage('$0 service <cmd> [args]');
        service.command('add', 'adds a service', {
            'name': { description: 'Name of the service' }
        }, (argv) => {
            /* */
        });
        service.command('list', 'list services', {},
            (argv) => {
                /* */
            });
        service.command('remove', 'remove a service', {
            'name': { description: 'Name of the service' }
        }, (argv) => {
            /* */
        });
        service.command('set', 'options to a service', {
            'tls-cert': { description: 'Path to TLS certificate file' },
            'tls-chain': { description: 'Path to TLS chain file' },
            'tls-key': { description: 'Path to TLS key file' }
        }, (argv) => {
            /* */
        });
        service.command('unset', 'remove options from a service', {
            'tls-cert': {
                description: 'Path to TLS certificate file',
                default: false
            },
            'tls-chain': {
                description: 'Path to TLS chain file',
                default: false
            },
            'tls-key': {
                description: 'Path to TLS key file',
                default: false
            }
        });
        service.command('nodes', 'handle nodes', (__argv): yargs.Argv => {
            const nodes = yargs.usage('$0 service nodes <cmd> [args]');
            nodes.command('add', 'add node by name', {
                'name': { description: 'Name of the node' },
            }, (argv) => {
                /* */
            });
            nodes.command('list', 'list node by name', {}, (argv) => {
                /* */
            });
            nodes.command('remove', 'add node by name', {
                'name': { description: 'Name of the node' },
            }, (argv) => {
                /* */
            });
            return nodes;
        });

        service.command('node', 'handle node', {
            'name': {
                description: 'Name of the node',
                required: true
            },
        }, (__argv): yargs.Argv => {
            const node = yargs.usage('$0 service node <cmd> [args]');
            node.command('add', 'add node by name', {
                'ip': { description: 'IP address of the endpoint', required: true },
                'port': { description: 'Port of the endpoint', required: true },
            }, (argv) => {
                /* */
            });
            node.command('list', 'list node by name', {}, (argv) => {
                /* */
            });
            node.command('remove', 'add node by name', {
                'ip': { description: 'IP address of the endpoint', required: true },
                'port': { description: 'Port of the endpoint', required: true },
            }, (argv) => {
                /* */
            });
            return node;
        });
        //     const tlsCert = fs.readFileSync(argv.tlsCert, 'utf8');
        //     const tlsChain = fs.readFileSync(argv.tlsChain, 'utf8');
        //     const tlsKey = fs.readFileSync(argv.tlsKey, 'utf8');

        //     const etc = createEtcd(argv);
        //     etc.connect().then(() => {
        //         const key = `endpoints/${argv.serviceName}`;
        //         etc.getJson(argv.serviceName)
        //         etc.setJson(, {
        //             argv.serviceName: { 
        //                 'nodes': {
        //                     argv.nodeName: [

        //                     ]
        //                 }
        //                         'ip': argv.ip, 'port': argv.port 
        //                         'tls': {
        //                     'cert': tlsCert,
        //                     'chain': tlsChain,
        //                     'key': tlsKey,
        //                 }
        //             },
        //             ,
        //         }).then(() => {
        //             observer.next('Endpoint was added');
        //             observer.complete();
        //         });
        // });

        // });
        return service;
    });
}

function jsonOrText(_yargs: any): any {
    return _yargs.option('json', {
        default: false,
        describe: 'json output'
    }).option('text', {
        default: true,
        describe: 'text output'
    }).option('notitle', {
        default: false,
        describe: 'suppress text title line'
    });
}

export function etcdOptions(_yargs: any): any {
    return _yargs.option('etcd-cluster-id', {
        describe: 'the etcd-cluster-id',
        default: 'referio'
    }).option('etcd-app-id', {
        describe: 'the etcd-app-id',
        default: 'app'
    }).option('etcd-url', {
        describe: 'list of etcd-url\'s',
        default: ['http://localhost:2379']
    });
}

export function cli(args: string[]): Rx.Observable<string> {
    return Rx.Observable.create((observer: Rx.Observer<string>) => {
        const hack = yargs as any;
        const y = (new hack()).usage('$0 <cmd> [args]');

        y.option('logLevel', {
            describe: 'logLevel ala winston',
            default: 'info'
        });
        jsonOrText(y);
        etcdOptions(y);

        createVersionHandler(y, observer);
        createStartHandler(y, observer);
        createServiceHandler(y, observer);

        y.help().parse(args);
    });
}
