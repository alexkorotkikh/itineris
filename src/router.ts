import * as etcd from 'promise-etcd';
import * as Rx from 'rxjs';
import * as winston from 'winston';
import * as yargs from 'yargs';

import { EndPoint } from './endpoint';
import { ConfigSource } from './config-source';
import { ServerManager } from './server';
import { Target, TargetRouter } from './target-router';

function createVersionHandler(y: yargs.Argv, observer: Rx.Observer<string>): void {
  y.command('version', 'Show router\'s version', {}, () => {
    observer.next(process.env.npm_package_version);
  });
}

function createStartHandler(y: yargs.Argv, observer: Rx.Observer<string>, logger: winston.LoggerInstance,
                            etc: etcd.EtcdObservable): void {
  y.command('start', 'Starts router', etcdOptions, (argv: any) => {
    const infoSource = new ConfigSource(etc, logger);
    const serverManager = new ServerManager(logger, new TargetRouter(etc));

    infoSource.start().subscribe((res: any) =>
      infoSource.onNext(res).subscribe(endpoint => {
        serverManager.updateEndpoints(endpoint).subscribe(result => {
          logger.info('configuration updated', result)
        }, err => observer.error(err));
      }, err => observer.error(err)));

    observer.next('Router started');
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

    const logger = new (winston.Logger)({
      transports: [new (winston.transports.Console)()]
    });

    const cfg = etcd.Config.start([
      '--etcd-cluster-id', y.argv.etcdClusterId,
      '--etcd-app-id', y.argv.etcdAppId,
      '--etcd-url', y.argv.etcdUrl,
    ]);
    const etc = etcd.EtcdObservable.create(cfg);
    const upset = etcd.Upset.create(etc);

    createVersionHandler(y, observer);
    createStartHandler(y, observer, logger, etc);

    EndPoint.cli(y, etc, upset, logger, observer);
    Target.cli(y, etc, upset, logger, observer);

    y.help().parse(args);
  });
}
