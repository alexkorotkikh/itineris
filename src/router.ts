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
  y.command('start', 'Starts router', etcdOptions, () => {
    const infoSource = new ConfigSource(etc, logger);
    const targetRouter = new TargetRouter(etc);
    const serverManager = new ServerManager(logger, targetRouter);

    infoSource.start('endpoints').subscribe((res: any) =>
      infoSource.onNext(res, EndPoint.loadFrom).subscribe(endpoints => {
        serverManager.updateEndpoints(endpoints).subscribe(result => {
          logger.info('endpoints configuration updated', result)
        }, observer.error);
      }, observer.error));

    infoSource.start('targets').subscribe((res: any) =>
      infoSource.onNext(res, Target.loadFrom).subscribe(targets =>
        targetRouter.updateTargets(targets).subscribe(result => {
          logger.info('targets configuration updated', result);
        })
      ));
    observer.next('Router started');
  });
}

function jsonOrText(_yargs: any): any {
  return _yargs.option('json', {
    'default': false,
    describe: 'json output'
  }).option('text', {
    'default': true,
    describe: 'text output'
  }).option('notitle', {
    'default': false,
    describe: 'suppress text title line'
  });
}

export function etcdOptions(_yargs: any): any {
  return _yargs.option('etcd-cluster-id', {
    describe: 'the etcd-cluster-id',
    'default': 'referio'
  }).option('etcd-app-id', {
    describe: 'the etcd-app-id',
    'default': 'app'
  }).option('etcd-url', {
    describe: 'list of etcd-url\'s',
    'default': ['http://localhost:2379']
  });
}

export function cli(args: string[]): Rx.Observable<string> {
  return Rx.Observable.create((observer: Rx.Observer<string>) => {
    const hack = yargs as any;
    const y = (new hack()).usage('$0 <cmd> [args]');

    y.option('logLevel', {
      describe: 'logLevel ala winston',
      'default': 'info'
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
    Route.cli(y, etc, upset, logger, observer);

    y.help().parse(args);
  });
}

class Route {
  private readonly log: winston.LoggerInstance;
  public readonly name: string;
  public order: number;
  public rule: string;

  constructor(name: string, order: number, rule: string, log: winston.LoggerInstance) {
    this.name = name;
    this.log = log;
    this.order = order;
    this.rule = rule;
  }

  static cli(y: yargs.Argv, etc: etcd.EtcdObservable, upset: etcd.Upset,
             log: winston.LoggerInstance, obs: Rx.Observer<string>) {
    y.command('route', 'route commands', () => {
      const opRouteName = {
        'routeName': {
          description: 'Name of the route',
          require: true
        },
      };
      const opRouteDetails = {
        ...opRouteName,
        'order': {
          description: 'Order of the route',
          require: true
        },
        'rule': {
          description: 'JS snippet which makes routing decision',
          require: true
        },
      };
      return yargs.usage('$0 route <cmd> [args]')
        .command('add', 'adds a route', opRouteDetails, (argv) => {
          etc.mkdir('routes').subscribe(() => {
            upset.upSet(`routes/${argv.routeName}`, (routeJson: any, out: Rx.Subject<any>) => {
              try {
                if (routeJson) {
                  obs.error('route already exists');
                } else {
                  const route = new Route(argv.routeName, argv.order, argv.rule, log);
                  out.next(route.toObject());
                }
              } catch (e) {
                obs.error(e)
              }
            }).subscribe(() => {
              obs.next('route was added')
            }, obs.error);
          }, obs.error);
        })
        .command('list', 'list all routes', {}, () => {
          etc.getRaw('routes', { recursive: true }).subscribe(resp => {
            try {
              if (resp.isErr()) {
                obs.error(JSON.stringify(resp.err));
              } else {
                const routes = resp.node.nodes.map(n => {
                  const value = JSON.parse(n.value);
                  return new Route(value.name, value.order, value.rule, log).toObject()
                });
                obs.next(JSON.stringify(routes));
              }
            } catch (e) {
              obs.error(e);
            }
          }, obs.error)
        })
        .command('remove', 'remove a route', opRouteName, (argv) => {
          etc.delete(`routes/${argv.routeName}`).subscribe(resp => {
            if (resp.isErr()) {
              obs.error(resp.err);
            }
            else {
              obs.next('route was removed');
            }
          });
        })
        .command('details', 'show route details', opRouteName, (argv) => {
          etc.getRaw(`routes/${argv.routeName}`).subscribe(resp => {
            try {
              if (resp.isErr()) {
                obs.error(JSON.stringify(resp.err));
              } else {
                const value = JSON.parse(resp.node.value);
                const route = new Route(value.name, value.order, value.rule, log).toObject();
                obs.next(JSON.stringify(route));
              }
            } catch (e) {
              obs.error(e);
            }
          }, obs.error)
        });
    })
  }

  toObject() {
    return {
      name: this.name,
      order: this.order,
      rule: this.rule,
    }
  }
}